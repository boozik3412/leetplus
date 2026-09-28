"""Source-only proof of the A-to-bridge predecessor authority gap.

This audit never imports or executes target bridge code. It loads the immutable
b0 predecessor implementation from Git, calls only its pure compatibility
predicate, and proves that privileged leaves outside COMPATIBLE are not bound.
"""

import hashlib
import subprocess
import unittest
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[2]
PREDECESSOR = "b0cbf3a4f302b299762fa055f3bffe0376a91182"
BRIDGE = "bebeb41354da0dd04b218495cbbf5d75ba9f0a85"
ROOT = "deploy/leetplus-compose"
COMPATIBLE = (
    "contract.mjs",
    "orchestrator.mjs",
    "worker-authority.mjs",
    "runtime-entry.cjs",
    "network.sh",
    "backup.sh",
    "postgres-entry.sh",
)
EXPECTED_SHA256 = {
    PREDECESSOR: {
        "control_handoff.py": "48aa00c4f6d3148ee210901cd572c6b5a3b3600ad4d20e3551e326ee18fcda18",
        "exact-target-handoff-authority.mjs": None,
    },
    BRIDGE: {
        "control_handoff.py": "2923d34c5632eff74b5fafd4982073dba6bb4cd25ed5248592ddfe6eac071d88",
        "exact-target-handoff-authority.mjs": "bd5d5360220c73ce7c9c814c3ced714ee193f1c0a02100f4f6ce566749ca5abf",
    },
}


def git_bytes(commit, leaf):
    return subprocess.check_output(
        ["git", "-C", str(REPOSITORY), "show", f"{commit}:{ROOT}/{leaf}"],
        stderr=subprocess.DEVNULL,
    )


def exists(commit, leaf):
    result = subprocess.run(
        ["git", "-C", str(REPOSITORY), "cat-file", "-e", f"{commit}:{ROOT}/{leaf}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def sha256(commit, leaf):
    return hashlib.sha256(git_bytes(commit, leaf)).hexdigest()


def predecessor_namespace():
    source = git_bytes(PREDECESSOR, "control_handoff.py")
    namespace = {
        "__file__": f"git:{PREDECESSOR}:{ROOT}/control_handoff.py",
        "__name__": "a_bridge_predecessor_audit",
    }
    exec(compile(source, namespace["__file__"], "exec"), namespace)
    return namespace


class ABridgePredecessorGapTests(unittest.TestCase):
    def test_immutable_source_identities_and_compatible_leaves(self):
        for commit, leaves in EXPECTED_SHA256.items():
            for leaf, expected in leaves.items():
                self.assertEqual(exists(commit, leaf), expected is not None)
                if expected is not None:
                    self.assertEqual(sha256(commit, leaf), expected)

        for leaf in COMPATIBLE:
            self.assertEqual(
                sha256(PREDECESSOR, leaf),
                sha256(BRIDGE, leaf),
                f"reviewed COMPATIBLE leaf drifted: {leaf}",
            )

    def test_b0_predicate_accepts_changed_privileged_leaves_outside_compatible(self):
        predecessor = predecessor_namespace()
        self.assertEqual(tuple(predecessor["COMPATIBLE"]), COMPATIBLE)

        compatible_files = {
            leaf: sha256(PREDECESSOR, leaf) for leaf in COMPATIBLE
        }
        old = {
            "manifest": {
                "releaseSha": PREDECESSOR,
                "files": {
                    **compatible_files,
                    "control_handoff.py": sha256(PREDECESSOR, "control_handoff.py"),
                },
            },
            "digest": "1" * 64,
        }
        new = {
            "manifest": {
                "releaseSha": BRIDGE,
                "files": {
                    **compatible_files,
                    "control_handoff.py": sha256(BRIDGE, "control_handoff.py"),
                    "exact-target-handoff-authority.mjs": sha256(
                        BRIDGE, "exact-target-handoff-authority.mjs"
                    ),
                },
            },
            "digest": "2" * 64,
        }

        self.assertIsNone(predecessor["assert_runtime_contract_compatible"](old, new))

        changed_contract = {
            **new,
            "manifest": {
                **new["manifest"],
                "files": {**new["manifest"]["files"], "contract.mjs": "3" * 64},
            },
        }
        with self.assertRaisesRegex(ValueError, "Runtime/worker contract change"):
            predecessor["assert_runtime_contract_compatible"](
                old, changed_contract
            )

    def test_b0_dispatches_plan_and_apply_through_target_root(self):
        source = git_bytes(PREDECESSOR, "control_handoff.py").decode("utf-8")
        required_fragments = (
            "require(current.name == args.new_sha, 'Planner must be the target controller')",
            "result = prepare(args.old_sha, args.new_sha, args.admission_sha256",
            "require(read_json(operation_path(args.operation) / 'plan.json')['newReleaseSha'] == current.name",
            "result = activate(args.operation, args.approval, args.command == 'rollback')",
        )
        for fragment in required_fragments:
            self.assertIn(fragment, source)
        self.assertNotIn("bridge-plan", source)
        self.assertNotIn("exact_target_permit", source)


if __name__ == "__main__":
    unittest.main()
