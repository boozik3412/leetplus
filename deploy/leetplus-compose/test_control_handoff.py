"""Pure/mocked contract tests for control_handoff.py; not a root acceptance test."""

import contextlib
import datetime
import importlib.util
import itertools
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


SOURCE = Path(__file__).with_name("control_handoff.py")
SPEC = importlib.util.spec_from_file_location("control_handoff", SOURCE)
handoff = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(handoff)


class FakePath:
    def __init__(self, mode, uid=0, links=1, size=1, directory=False, linked=False):
        self.info = SimpleNamespace(
            st_mode=mode,
            st_uid=uid,
            st_nlink=links,
            st_size=size,
        )
        self.directory = directory
        self.linked = linked
        self.parent_nodes = [self]

    def is_absolute(self):
        return True

    @property
    def parents(self):
        return self.parent_nodes

    def lstat(self):
        return self.info

    def is_symlink(self):
        return self.linked


class SecureFileTests(unittest.TestCase):
    def test_rejects_unsafe_ancestor_before_open(self):
        unsafe = FakePath(stat.S_IFLNK | 0o755, directory=True, linked=True)
        with mock.patch.object(handoff, "Path", side_effect=lambda value: value), \
             mock.patch.object(handoff.os, "open") as open_file:
            with self.assertRaisesRegex(ValueError, "Untrusted ancestor"):
                handoff.secure(unsafe)
        open_file.assert_not_called()

    def test_rejects_hardlinked_file(self):
        safe_parent = FakePath(stat.S_IFDIR | 0o755, directory=True)
        subject = FakePath(stat.S_IFDIR | 0o755, directory=True)
        subject.parent_nodes = [safe_parent]
        with mock.patch.object(handoff, "Path", side_effect=lambda value: value), \
             mock.patch.object(handoff.os, "O_NOFOLLOW", 0, create=True), \
             mock.patch.object(handoff.os, "open", return_value=91), \
             mock.patch.object(
                 handoff.os,
                 "fstat",
                 return_value=SimpleNamespace(
                     st_mode=stat.S_IFREG | 0o600, st_uid=0, st_nlink=2, st_size=2
                 ),
             ), \
             mock.patch.object(handoff.os, "close"):
            with self.assertRaisesRegex(ValueError, "Untrusted file"):
                handoff.secure(subject)


class ContainerConfigurationFingerprintTests(unittest.TestCase):
    def item(self, mounts, *, config=None, host_config=None):
        return {
            "Config": config if config is not None else {"Labels": {"tier": "api"}},
            "HostConfig": host_config if host_config is not None else {"NetworkMode": "bridge"},
            "Mounts": mounts,
        }

    def test_mount_permutations_and_mapping_key_order_have_one_fingerprint(self):
        mounts = [
            {"Destination": "/app/config", "Source": "/srv/config", "Type": "bind", "RW": False},
            {"Destination": "/app/data", "Source": "data-volume", "Type": "volume", "RW": True},
            {"Destination": "/run/secrets", "Source": "/srv/secrets", "Type": "bind", "Propagation": "rprivate"},
        ]
        reordered_mapping = [
            {"RW": False, "Type": "bind", "Source": "/srv/config", "Destination": "/app/config"},
            {"RW": True, "Type": "volume", "Destination": "/app/data", "Source": "data-volume"},
            {"Propagation": "rprivate", "Source": "/srv/secrets", "Destination": "/run/secrets", "Type": "bind"},
        ]
        fingerprints = {
            handoff.container_configuration_sha256(self.item(list(permutation)))
            for permutation in itertools.permutations(mounts)
        }
        fingerprints.add(handoff.container_configuration_sha256(self.item(reordered_mapping)))
        self.assertEqual(len(fingerprints), 1)

    def test_actual_mount_configuration_changes_change_fingerprint(self):
        baseline_mounts = [{
            "Destination": "/app/data", "Source": "/srv/data", "Type": "bind",
            "RW": True, "Propagation": "rprivate", "NewField": "present",
        }]
        baseline = handoff.container_configuration_sha256(self.item(baseline_mounts))
        variants = [
            [{**baseline_mounts[0], "Source": "/srv/other"}],
            [{**baseline_mounts[0], "Type": "volume"}],
            [{**baseline_mounts[0], "RW": False}],
            [{**baseline_mounts[0], "Propagation": "rshared"}],
            [{key: value for key, value in baseline_mounts[0].items() if key != "NewField"}],
            [{**baseline_mounts[0], "NewField": "changed"}],
        ]
        for mounts in variants:
            with self.subTest(mounts=mounts):
                self.assertNotEqual(baseline, handoff.container_configuration_sha256(self.item(mounts)))

    def test_config_and_hostconfig_changes_change_fingerprint(self):
        mounts = [{"Destination": "/app/data", "Source": "/srv/data", "Type": "bind"}]
        baseline = handoff.container_configuration_sha256(self.item(mounts))
        self.assertNotEqual(baseline, handoff.container_configuration_sha256(
            self.item(mounts, config={"Labels": {"tier": "worker"}})))
        self.assertNotEqual(baseline, handoff.container_configuration_sha256(
            self.item(mounts, host_config={"NetworkMode": "host"})))

    def test_non_mount_array_order_is_preserved(self):
        mounts = [{"Destination": "/app/data", "Source": "/srv/data", "Type": "bind"}]
        baseline = handoff.container_configuration_sha256(self.item(
            mounts,
            config={"Env": ["A=1", "B=2"], "Cmd": ["serve", "--port", "3000"]},
            host_config={"Binds": ["/one:/one", "/two:/two"]},
        ))
        variants = [
            self.item(mounts, config={"Env": ["B=2", "A=1"], "Cmd": ["serve", "--port", "3000"]}, host_config={"Binds": ["/one:/one", "/two:/two"]}),
            self.item(mounts, config={"Env": ["A=1", "B=2"], "Cmd": ["--port", "3000", "serve"]}, host_config={"Binds": ["/one:/one", "/two:/two"]}),
            self.item(mounts, config={"Env": ["A=1", "B=2"], "Cmd": ["serve", "--port", "3000"]}, host_config={"Binds": ["/two:/two", "/one:/one"]}),
        ]
        for item in variants:
            with self.subTest(item=item):
                self.assertNotEqual(baseline, handoff.container_configuration_sha256(item))

    def test_malformed_or_duplicate_mount_destinations_are_rejected(self):
        self.assertIsInstance(handoff.container_configuration_sha256(self.item([{"Destination": "/"}])), str)
        invalid_destinations = ("", "relative", "//double", "/trailing/", "/dot/./path", "/parent/../path", "/nul\x00path")
        for destination in invalid_destinations:
            with self.subTest(destination=repr(destination)):
                with self.assertRaisesRegex(ValueError, "Invalid mount destination"):
                    handoff.container_configuration_sha256(self.item([{"Destination": destination}]))
        with self.assertRaisesRegex(ValueError, "Invalid container mount"):
            handoff.container_configuration_sha256(self.item(["not-a-mapping"]))
        with self.assertRaisesRegex(ValueError, "Duplicate mount destination"):
            handoff.container_configuration_sha256(self.item([
                {"Destination": "/same", "Source": "/one"},
                {"Destination": "/same", "Source": "/two"},
            ]))


class SnapshotFingerprintIntegrationTests(unittest.TestCase):
    def test_snapshot_delegates_each_container_fingerprint_to_helper(self):
        identity = "11111111-1111-4111-8111-111111111111"
        active = {
            "operationId": identity,
            "dataRelease": {"images": {"postgres": "postgres-image", "redis": "redis-image"}},
            "blue": {"images": {"api": "api-blue-image", "web": "web-blue-image"}},
            "green": {"images": {"api": "api-green-image", "web": "web-green-image"}},
        }
        expected_images = {
            "leetplus-api-blue": "api-blue-image", "leetplus-web-blue": "web-blue-image",
            "leetplus-api-green": "api-green-image", "leetplus-web-green": "web-green-image",
            "leetplus-postgres": "postgres-image", "leetplus-redis": "redis-image",
        }
        active_raw = json.dumps(active).encode()

        def fake_run(args, data=None, timeout=25):
            if args[0] == "/usr/bin/node":
                return b'{"controlSha256":"accepted-control"}'
            if args[0] == "/usr/bin/docker":
                name = args[-1]
                return json.dumps([{
                    "Id": name + "-id", "Image": expected_images[name], "RestartCount": 0,
                    "State": {"Running": True, "Pid": 1234, "StartedAt": "2026-09-16T00:00:00Z"},
                    "Config": {}, "HostConfig": {}, "Mounts": [],
                }]).encode()
            if args[0] == "/usr/sbin/iptables":
                return b"-N test\n"
            raise AssertionError("unexpected command: " + repr(args))

        fake_nginx = SimpleNamespace(is_symlink=lambda: True, lstat=lambda: SimpleNamespace(st_uid=0))
        real_path = Path
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / "state"
            operation = state / "operations" / identity
            operation.mkdir(parents=True)
            (operation / "final.json").write_text("{}\n", encoding="utf-8")
            with mock.patch.object(handoff, "STATE", state), \
                 mock.patch.object(handoff, "secure", side_effect=lambda path: active_raw if Path(path) == state / "active.json" else b"protected"), \
                 mock.patch.object(handoff, "read_json", return_value={}), \
                 mock.patch.object(handoff, "run", side_effect=fake_run), \
                 mock.patch.object(handoff, "container_configuration_sha256", return_value="fingerprint") as fingerprint, \
                 mock.patch.object(handoff, "Path", side_effect=lambda value: fake_nginx if str(value) == "/etc/nginx/leetplus-compose/active.conf" else real_path(value)), \
                 mock.patch.object(handoff.os, "readlink", return_value="/etc/nginx/leetplus-compose/blue.conf"):
                result = handoff.snapshot(Path(temporary).resolve() / "control")

        self.assertEqual(fingerprint.call_count, len(expected_images))
        self.assertTrue(all(call.args[0]["Mounts"] == [] for call in fingerprint.call_args_list))
        self.assertEqual({entry["configurationSha256"] for entry in result["containers"].values()}, {"fingerprint"})


class ResourceProfileBootstrapTests(unittest.TestCase):
    def controls(self):
        files = {leaf: (str(index) * 64) for index, leaf in enumerate(handoff.COMPATIBLE, 1)}
        files["contract.mjs"] = handoff.RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_CONTRACT_SHA256
        old = {
            "root": Path("/old-control"),
            "digest": "a" * 64,
            "manifest": {"releaseSha": handoff.RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_SHA, "files": files},
            "release": {"releaseSha": handoff.RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_SHA},
        }
        new_files = {**files, "contract.mjs": "f" * 64}
        new = {
            "root": Path("/new-control"),
            "digest": "b" * 64,
            "manifest": {"releaseSha": "c" * 40, "files": new_files},
            "release": {"releaseSha": "c" * 40, "apiResourceProfile": handoff.RESOURCE_PROFILE_BOOTSTRAP_TARGET},
        }
        return old, new

    def plan(self, old, new):
        snapshot = {"files": {"/etc/leetplus-compose/providers.json": "d" * 64}}
        return {
            "contract": handoff.CONTRACT + "_PLAN",
            "action": handoff.RESOURCE_PROFILE_BOOTSTRAP,
            "applicationRestartAllowed": False,
            "timersMayBeStopped": False,
            "rollbackAllowed": True,
            "maxLockWaitSeconds": 120,
            "oldReleaseSha": handoff.RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_SHA,
            "newReleaseSha": new["manifest"]["releaseSha"],
            "oldControlSha256": old["digest"],
            "newControlSha256": new["digest"],
            "oldMainTarget": str(old["root"] / "control.sh"),
            "newMainTarget": str(new["root"] / "control.sh"),
            "oldUnitSha256": "e" * 64,
            "newUnitSha256": "f" * 64,
            "oldUnitMode": 0o600,
            "snapshot": snapshot,
            "refreshScope": {"operation": "refresh", "setNames": ["lp_leetplus_https", "lp_leetplus_smtp"], "ttlSeconds": 3600, "publicAddressesOnly": True, "policySha256": "d" * 64},
            "predecessorControlSha": handoff.RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_SHA,
            "predecessorContractSha256": handoff.RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_CONTRACT_SHA256,
            "legacyProfile": handoff.RESOURCE_PROFILE_BOOTSTRAP_LEGACY,
            "targetProfile": handoff.RESOURCE_PROFILE_BOOTSTRAP_TARGET,
            "historicalComposeIdentityVerified": True,
            "resourceLimitMutationAllowed": False,
        }

    def test_identity_is_pinned_to_892b_legacy_contract_and_admitted_api6_profile(self):
        old, new = self.controls()
        handoff.assert_resource_profile_bootstrap_identity(old, new)
        for mutate, message in [
            (lambda value: value["manifest"].update(releaseSha="0" * 40), "wrong predecessor"),
            (lambda value: value["manifest"]["files"].update({"contract.mjs": "0" * 64}), "predecessor contract"),
            (lambda value: value["release"].pop("apiResourceProfile"), "Target admitted release"),
            (lambda value: value["release"].update(apiResourceProfile="ARBITRARY"), "Target admitted release"),
        ]:
            with self.subTest(message=message):
                before, after = self.controls()
                mutate(before if "predecessor" in message or "wrong" in message else after)
                with self.assertRaisesRegex(ValueError, message):
                    handoff.assert_resource_profile_bootstrap_identity(before, after)

    def test_bootstrap_allows_only_contract_mjs_to_differ_among_compatible_leaves(self):
        old, new = self.controls()
        new["manifest"]["files"]["worker-authority.mjs"] = "9" * 64
        with self.assertRaisesRegex(ValueError, "worker contract"):
            handoff.assert_compatible(old, new, True)


    def test_active_releases_must_be_unprofiled_and_boolean_does_not_authorize_them(self):
        clean = {"active": {"blue": {}, "green": {}, "dataRelease": {}}}
        handoff.assert_legacy_active_releases(clean)
        for name in ("blue", "green", "dataRelease"):
            with self.subTest(name=name):
                bad = {"active": {"blue": {}, "green": {}, "dataRelease": {}}}
                bad["active"][name]["apiResourceProfile"] = handoff.RESOURCE_PROFILE_BOOTSTRAP_LEGACY
                with self.assertRaisesRegex(ValueError, "already profiled"):
                    handoff.assert_legacy_active_releases(bad)

    def test_plan_rejects_wrong_profile_fields_and_ordinary_handoff_cannot_smuggle_them(self):
        old, new = self.controls()
        old["manifest"]["files"][handoff.UNIT.name] = "e" * 64
        new["manifest"]["files"][handoff.UNIT.name] = "f" * 64
        plan = self.plan(old, new)
        with mock.patch.object(handoff, "assert_compatible") as compatible:
            handoff.validate_plan_bindings(plan, old, new)
            compatible.assert_called_once_with(old, new, True)
        for key, value in [("historicalComposeIdentityVerified", False), ("resourceLimitMutationAllowed", True), ("targetProfile", "ARBITRARY"), ("oldReleaseSha", "0" * 40)]:
            with self.subTest(key=key):
                bad = {**plan, key: value}
                with self.assertRaisesRegex(ValueError, "[Rr]esource-profile bootstrap (scope|release lineage)"):
                    handoff.validate_plan_bindings(bad, old, new)
        ordinary = {**plan, "action": "CONTROL_HANDOFF"}
        with self.assertRaisesRegex(ValueError, "Ordinary controller handoff"):
            handoff.validate_plan_bindings(ordinary, old, new)


class VariantAOrchestratorHandoffTests(unittest.TestCase):
    def controls(self):
        files = {leaf: str(index + 1) * 64 for index, leaf in enumerate(handoff.COMPATIBLE)}
        files['orchestrator.mjs'] = handoff.VARIANT_A_OLD_ORCHESTRATOR_SHA256
        files['control.mjs'] = handoff.VARIANT_A_OLD_CONTROL_SHA256
        old = {'manifest': {'releaseSha': handoff.VARIANT_A_PREDECESSOR_SHA, 'files': files}, 'digest': handoff.VARIANT_A_PREDECESSOR_MANIFEST_SHA256,
               'root': Path('/old-control')}
        new_files = {**files, 'orchestrator.mjs': handoff.VARIANT_A_NEW_ORCHESTRATOR_SHA256,
                     'control.mjs': handoff.VARIANT_A_NEW_CONTROL_SHA256,
                     'preparation-runner.mjs': handoff.VARIANT_A_NEW_RUNNER_SHA256}
        new = {'manifest': {'releaseSha': 'b' * 40, 'files': new_files}, 'digest': 'b' * 64,
               'root': Path('/new-control')}
        return old, new

    def test_exact_reviewed_transition_is_bound_to_the_manifest(self):
        old, new = self.controls()
        self.assertEqual(handoff.assert_runtime_contract_compatible(old, new),
                         {**handoff.VARIANT_A_TRANSITION, 'oldReleaseSha': old['manifest']['releaseSha'],
                          'newReleaseSha': new['manifest']['releaseSha'],
                          'oldControlSha256': old['digest'], 'newControlSha256': new['digest']})
        root = Path(__file__).parent
        for leaf, expected in [('orchestrator.mjs', handoff.VARIANT_A_NEW_ORCHESTRATOR_SHA256),
                               ('control.mjs', handoff.VARIANT_A_NEW_CONTROL_SHA256),
                               ('preparation-runner.mjs', handoff.VARIANT_A_NEW_RUNNER_SHA256)]:
            self.assertEqual(handoff.digest((root / leaf).read_bytes()), expected)

    def test_wrong_old_or_new_bytes_and_other_runtime_changes_fail(self):
        for side, leaf, wrong in [
            ('old', 'releaseSha', 'c' * 40),
            ('old', 'control.mjs', '6' * 64),
            ('old', 'orchestrator.mjs', '1' * 64),
            ('new', 'orchestrator.mjs', '2' * 64),
            ('new', 'control.mjs', '3' * 64),
            ('new', 'preparation-runner.mjs', '4' * 64),
            ('new', 'worker-authority.mjs', '5' * 64),
        ]:
            with self.subTest(side=side, leaf=leaf):
                old, new = self.controls()
                target = old if side == 'old' else new
                if leaf == 'releaseSha':
                    target['manifest'][leaf] = wrong
                else:
                    target['manifest']['files'][leaf] = wrong
                with self.assertRaises(ValueError):
                    handoff.assert_runtime_contract_compatible(old, new)

    def test_profile_bootstrap_cannot_combine_with_variant_a_transition(self):
        old, new = self.controls()
        with self.assertRaisesRegex(ValueError, 'cannot also change'):
            handoff.assert_runtime_contract_compatible(old, new, True)

    def test_ordinary_same_byte_handoff_keeps_the_existing_contract(self):
        old, new = self.controls()
        old['manifest']['releaseSha'] = 'c' * 40
        old['manifest']['files'] = new['manifest']['files'].copy()
        self.assertIsNone(handoff.assert_runtime_contract_compatible(old, new))

    def test_signed_plan_must_name_exact_orchestrator_transition(self):
        old, new = self.controls()
        old['manifest']['files'][handoff.UNIT.name] = '7' * 64
        new['manifest']['files'][handoff.UNIT.name] = '7' * 64
        scope = {'operation': 'refresh', 'setNames': ['lp_leetplus_https', 'lp_leetplus_smtp'],
                 'ttlSeconds': 3600, 'publicAddressesOnly': True, 'policySha256': '8' * 64}
        plan = {
            'contract': handoff.CONTRACT + '_PLAN', 'action': 'CONTROL_HANDOFF',
            'applicationRestartAllowed': False, 'timersMayBeStopped': False,
            'rollbackAllowed': True, 'maxLockWaitSeconds': 120,
            'oldReleaseSha': old['manifest']['releaseSha'],
            'newReleaseSha': new['manifest']['releaseSha'],
            'oldControlSha256': old['digest'], 'newControlSha256': new['digest'],
            'oldMainTarget': str(old['root'] / 'control.sh'),
            'newMainTarget': str(new['root'] / 'control.sh'),
            'oldUnitSha256': '7' * 64, 'newUnitSha256': '7' * 64,
            'oldUnitMode': 0o644,
            'snapshot': {'files': {'/etc/leetplus-compose/providers.json': '8' * 64}},
            'refreshScope': scope,
            'orchestratorTransition': handoff.variant_a_orchestrator_transition(old, new),
        }
        with mock.patch.object(handoff, 'assert_compatible'):
            handoff.validate_plan_bindings(plan, old, new)
            for change in ({'orchestratorTransition': None},
                           {'orchestratorTransition': {'contract': 'UNSCOPED'}},
                           {'oldControlSha256': '0' * 64}):
                with self.subTest(change=change), self.assertRaises(ValueError):
                    handoff.validate_plan_bindings({**plan, **change}, old, new)


class ResourceProfileBootstrapPrepareTests(unittest.TestCase):
    def test_prepare_revalidates_the_target_renderer_and_records_only_the_exact_profile_scope(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            handoffs = root / "handoffs"
            unit = root / "network-refresh.service"
            unit.write_bytes(b"unit\n")
            evidence_path = root / "evidence.json"
            evidence = {"decision": "PASS", "releaseSha": "b" * 40, "backupSha256": "1" * 64, "rehearsalSha256": "2" * 64}
            evidence_path.write_bytes(handoff.canonical(evidence))
            old_root, new_root = root / "old", root / "new"
            old_root.mkdir()
            new_root.mkdir()
            old = {"root": old_root, "digest": "a" * 64, "archive": b"old", "admissionRaw": b"old-admission",
                   "manifest": {"admissionSha256": "0" * 64, "files": {unit.name: handoff.digest(unit.read_bytes())}}}
            new = {"root": new_root, "digest": "b" * 64, "archive": b"new", "admissionRaw": b"new-admission",
                   "manifest": {"admissionSha256": "3" * 64, "files": {unit.name: handoff.digest(unit.read_bytes())}}}
            snapshot_value = {"active": {"blue": {}, "green": {}, "dataRelease": {}}, "files": {"/etc/leetplus-compose/providers.json": "4" * 64}}
            records = {}

            @contextlib.contextmanager
            def lock(exclusive, seconds=120):
                yield

            def publish(path, value):
                records[Path(path).name] = value

            def secure(path, limit=2 * 1024 * 1024):
                if Path(path) == evidence_path:
                    return handoff.canonical(evidence)
                if Path(path) == unit:
                    return unit.read_bytes()
                if Path(path).name == "machine-id":
                    return b"machine\n"
                raise AssertionError("unexpected secure: " + str(path))

            with mock.patch.object(handoff, "HANDOFFS", handoffs), \
                 mock.patch.object(handoff, "UNIT", unit), \
                 mock.patch.object(handoff, "PENDING", root / "pending.json"), \
                 mock.patch.object(handoff, "POINTER", root / "pointer.json"), \
                 mock.patch.object(handoff, "installed", side_effect=lambda sha, executor=False: old if sha == "a" * 40 else new), \
                 mock.patch.object(handoff, "secure", side_effect=secure), \
                 mock.patch.object(handoff, "control_lock", side_effect=lock), \
                 mock.patch.object(handoff, "assert_compatible") as compatible, \
                 mock.patch.object(handoff, "main_target", return_value=str(old_root / "control.sh")), \
                 mock.patch.object(handoff, "snapshot", return_value=snapshot_value) as snapshot, \
                 mock.patch.object(handoff, "verify_current_controller_authority"), \
                 mock.patch.object(handoff, "systemd", return_value={"ActiveState": "active", "UnitFileState": "enabled"}), \
                 mock.patch.object(handoff, "private_dir", side_effect=lambda path: Path(path).mkdir(parents=True, exist_ok=True)), \
                 mock.patch.object(handoff, "publish", side_effect=publish), \
                 mock.patch.object(handoff, "atomic_bytes"):
                handoff.prepare("a" * 40, "b" * 40, "3" * 64, evidence_path, True)

            snapshot.assert_called_once_with(new_root)
            compatible.assert_called_once_with(old, new, True)
            plan = records["plan.json"]
            self.assertEqual(plan["action"], handoff.RESOURCE_PROFILE_BOOTSTRAP)
            self.assertEqual(plan["predecessorControlSha"], handoff.RESOURCE_PROFILE_BOOTSTRAP_PREDECESSOR_SHA)
            self.assertFalse(plan["resourceLimitMutationAllowed"])


class PhaseEffectTests(unittest.TestCase):
    def test_new_state_without_prior_intent_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            writes = []
            effects = []
            binding = {"operationId": "a"}
            with mock.patch.object(handoff, "read_json", side_effect=AssertionError("no intent expected")), \
                 mock.patch.object(handoff, "publish", side_effect=lambda path, value: writes.append(path.name)):
                with self.assertRaisesRegex(ValueError, "Unaudited or foreign effect preimage"):
                    handoff.phase_effect(directory, "apply-unit", binding, lambda: "new", "old", "new", lambda: effects.append(True))
            self.assertEqual(writes, [])
            self.assertEqual(effects, [])

    def test_resume_accepts_only_its_recorded_afterimage_without_repeating_effect(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            intent = directory / "apply-main.intent.json"
            intent.write_text("{}\n", encoding="utf-8")
            writes = []
            effects = []
            binding = {"operationId": "a"}
            with mock.patch.object(handoff, "read_json", return_value=binding), \
                 mock.patch.object(handoff, "publish", side_effect=lambda path, value: writes.append(path.name)):
                handoff.phase_effect(directory, "apply-main", binding, lambda: "new", "old", "new", lambda: effects.append(True))
            self.assertEqual(writes, ["apply-main.intent.json", "apply-main.receipt.json"])
            self.assertEqual(effects, [])


class ActivateHarness:
    identity = "11111111-1111-4111-8111-111111111111"
    old_sha = "a" * 40
    new_sha = "b" * 40
    old_unit = b"old refresh unit\n"
    new_unit = b"new refresh unit\n"

    def __init__(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.handoffs = self.root / "handoffs"
        self.directory = self.handoffs / self.identity
        self.directory.mkdir(parents=True)
        self.pending = self.root / "pending.json"
        self.pointer = self.root / "active.json"
        self.unit = self.root / "network-refresh.service"
        self.evidence_path = self.directory / "evidence.json"
        self.approval_path = self.root / "approval.json"
        self.old_root = self.root / self.old_sha
        self.new_root = self.root / self.new_sha
        self.old_root.mkdir()
        self.new_root.mkdir()
        self.old_unit_path = self.old_root / self.unit.name
        self.new_unit_path = self.new_root / self.unit.name
        self.old_unit_path.write_bytes(self.old_unit)
        self.new_unit_path.write_bytes(self.new_unit)
        self.evidence = {"decision": "PASS"}
        now = datetime.datetime.now(datetime.timezone.utc)
        self.envelope = {"kind": "FORWARD", "approval": {
            "issuedAt": (now - datetime.timedelta(minutes=1)).isoformat().replace('+00:00', 'Z'),
            "expiresAt": (now + datetime.timedelta(hours=1)).isoformat().replace('+00:00', 'Z'),
        }}
        self.snapshot_value = {
            "active": "stable",
            "grant": "stable",
            "pid": 12001,
            "firewall": "stable",
        }
        self.plan = {
            "operationId": self.identity,
            "oldReleaseSha": self.old_sha,
            "newReleaseSha": self.new_sha,
            "oldMainTarget": "old-control",
            "newMainTarget": "new-control",
            "oldUnitSha256": handoff.digest(self.old_unit),
            "newUnitSha256": handoff.digest(self.new_unit),
            "oldUnitMode": 0o600,
            "snapshot": self.snapshot_value,
            "evidenceSha256": handoff.digest(handoff.canonical(self.evidence)),
            "maxLockWaitSeconds": 120,
        }
        self.state = {"main": "old-control", "unit": self.old_unit}
        self.records = {}
        self.events = []
        self.snapshot_sequence = []
        self.raise_on_run = None
        self.raise_on_switch = False
        self.recovery_expired = False

    def close(self):
        self.temp.cleanup()

    def _key(self, path):
        return str(Path(path))

    def put(self, path, value):
        raw = value if isinstance(value, bytes) else handoff.canonical(value)
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        self.records[self._key(path)] = raw

    def read_json(self, path):
        path = Path(path)
        if path == self.directory / "plan.json":
            return self.plan
        if path == self.approval_path:
            return self.envelope
        raw = self.records.get(self._key(path))
        if raw is None:
            raise AssertionError("unexpected read_json: " + str(path))
        return json.loads(raw)

    def secure(self, path, limit=2 * 1024 * 1024):
        path = Path(path)
        if path == self.unit:
            return self.state["unit"]
        if path == self.old_unit_path:
            return self.old_unit
        if path == self.new_unit_path:
            return self.new_unit
        if path == self.evidence_path:
            return handoff.canonical(self.evidence)
        raw = self.records.get(self._key(path))
        if raw is not None:
            return raw
        raise AssertionError("unexpected secure: " + str(path))

    def publish(self, path, value):
        self.put(path, value)

    def atomic(self, path, value, mode=0o400, expected=None):
        path = Path(path)
        if path == self.unit:
            if expected is not None and handoff.digest(self.state["unit"]) != expected:
                raise ValueError("Publication/preimage mismatch")
            self.events.append(("unit", value))
            self.state["unit"] = value
            return
        self.put(path, value)

    def main_target(self):
        return self.state["main"]

    def switch(self, expected, target):
        if self.raise_on_switch:
            self.raise_on_switch = False
            raise KeyboardInterrupt("fixture crash after unit publication")
        if self.state["main"] != expected:
            raise ValueError("Main pointer CAS mismatch")
        self.events.append(("main", expected, target))
        self.state["main"] = target

    def snapshot(self, control):
        if self.snapshot_sequence:
            return self.snapshot_sequence.pop(0)
        return self.snapshot_value

    @contextlib.contextmanager
    def lock(self, exclusive, seconds=120):
        self.events.append(("lock", exclusive, seconds))
        yield

    def run(self, args, data=None, timeout=25):
        self.events.append(("run", tuple(args)))
        if self.raise_on_run is not None:
            outcome = self.raise_on_run
            self.raise_on_run = None
            raise outcome
        return b""

    def installed(self, sha, executor=False):
        root = self.old_root if sha == self.old_sha else self.new_root
        unit = self.old_unit if sha == self.old_sha else self.new_unit
        return {
            "root": root,
            "digest": "old-digest" if sha == self.old_sha else "new-digest",
            "manifest": {"files": {self.unit.name: handoff.digest(unit)}},
        }

    def validate_authority(self, plan, envelope, control, accepted_at=None, saved_receipt=None, historical=False):
        self.events.append(("forward-validator", saved_receipt is not None, historical))
        receipt = saved_receipt or {"decision": "PASS", "operationId": self.identity}
        return receipt, {"operationId": self.identity, "receiptSha256": handoff.digest(handoff.canonical(receipt))}

    def validate_recovery(self, plan, envelope, intent, control):
        self.events.append(("recovery-validator", intent["operationId"]))
        return {"plan": plan, "expired": self.recovery_expired}

    def apply_intent(self, authorized_at=None):
        value = authorized_at or datetime.datetime.now(datetime.timezone.utc)
        return {
            "operationId": self.identity,
            "planSha256": handoff.digest(handoff.canonical(self.plan)),
            "approvalSha256": handoff.digest(handoff.canonical(self.envelope)),
            "authorizedAt": value.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        }

    def finish_pending(self, identity):
        self.events.append(("finish", identity))
        self.records.pop(self._key(self.pending), None)
        self.pending.unlink(missing_ok=True)

    def restore_pointer(self, plan):
        self.events.append(("restore-pointer",))

    def patches(self, rollback_validator=None):
        validator = rollback_validator or (lambda *args: self.events.append(("rollback-validator",)))
        return contextlib.ExitStack(), [
            mock.patch.object(handoff, "HANDOFFS", self.handoffs),
            mock.patch.object(handoff, "PENDING", self.pending),
            mock.patch.object(handoff, "POINTER", self.pointer),
            mock.patch.object(handoff, "UNIT", self.unit),
            mock.patch.object(handoff, "read_json", side_effect=self.read_json),
            mock.patch.object(handoff, "secure", side_effect=self.secure),
            mock.patch.object(handoff, "publish", side_effect=self.publish),
            mock.patch.object(handoff, "atomic_bytes", side_effect=self.atomic),
            mock.patch.object(handoff, "installed", side_effect=self.installed),
            mock.patch.object(handoff, "validate_plan_bindings"),
            mock.patch.object(handoff, "control_lock", side_effect=self.lock),
            mock.patch.object(handoff, "snapshot", side_effect=self.snapshot),
            mock.patch.object(handoff, "verify_timers"),
            mock.patch.object(handoff, "main_target", side_effect=self.main_target),
            mock.patch.object(handoff, "switch_main", side_effect=self.switch),
            mock.patch.object(handoff, "run", side_effect=self.run),
            mock.patch.object(handoff, "verify_current_controller_authority"),
            mock.patch.object(handoff, "validate_authority", side_effect=self.validate_authority),
            mock.patch.object(handoff, "validate_recovery", side_effect=self.validate_recovery, create=True),
            mock.patch.object(handoff, "validate_rollback", side_effect=validator),
            mock.patch.object(handoff, "finish_pending", side_effect=self.finish_pending),
            mock.patch.object(handoff, "restore_pointer", side_effect=self.restore_pointer),
        ]


@contextlib.contextmanager
def activated_harness(harness, rollback_validator=None):
    _, patches = harness.patches(rollback_validator)
    with contextlib.ExitStack() as stack:
        for patch in patches:
            stack.enter_context(patch)
        yield harness


class ActivateTests(unittest.TestCase):
    def setUp(self):
        self.harness = ActivateHarness()

    def tearDown(self):
        self.harness.close()

    def _assert_no_timer_lifecycle_call(self):
        calls = [event[1] for event in self.harness.events if event[0] == "run"]
        self.assertFalse(any(args[:2] == ("/usr/bin/systemctl", "stop") for args in calls))
        self.assertFalse(any(args[:2] == ("/usr/bin/systemctl", "start") for args in calls))

    def test_positive_atomic_core_and_unit_preserves_snapshot_without_timer_pause(self):
        with activated_harness(self.harness):
            result = handoff.activate(self.harness.identity, self.harness.approval_path)
        self.assertEqual(result["decision"], "CONTROL_HANDOFF_ACCEPTED")
        self.assertEqual(self.harness.state["unit"], self.harness.new_unit)
        self.assertEqual(self.harness.state["main"], "new-control")
        self.assertEqual([event[0] for event in self.harness.events if event[0] in ("unit", "main")], ["unit", "main"])
        self.assertFalse(self.harness.pending.exists())
        self._assert_no_timer_lifecycle_call()

    def test_snapshot_drift_rejects_app_grant_pid_and_firewall_before_effect(self):
        for field, value in (("active", "changed"), ("grant", "new-grant"), ("pid", 9999), ("firewall", "changed")):
            with self.subTest(field=field):
                self.harness.snapshot_sequence = [{**self.harness.snapshot_value, field: value}]
                with activated_harness(self.harness):
                    with self.assertRaisesRegex(ValueError, "Live app/data/grant state changed"):
                        handoff.activate(self.harness.identity, self.harness.approval_path)
                self.assertEqual(self.harness.state["unit"], self.harness.old_unit)
                self.assertEqual(self.harness.state["main"], "old-control")
                self.assertFalse(any(event[0] in ("unit", "main") for event in self.harness.events))
                self.harness.events.clear()
                self.harness.snapshot_sequence.clear()

    def test_crash_after_unit_or_main_publication_resumes_without_repeating_effect(self):
        for point in ("unit", "main"):
            with self.subTest(point=point):
                harness = ActivateHarness()
                try:
                    if point == "unit":
                        harness.raise_on_switch = True
                    else:
                        harness.raise_on_run = KeyboardInterrupt("fixture crash after main publication")
                    with activated_harness(harness):
                        with self.assertRaises(KeyboardInterrupt):
                            handoff.activate(harness.identity, harness.approval_path)
                        self.assertTrue(harness.pending.exists())
                        handoff.activate(harness.identity, harness.approval_path)
                    self.assertEqual(harness.state["unit"], harness.new_unit)
                    self.assertEqual(harness.state["main"], "new-control")
                    self.assertEqual(len([event for event in harness.events if event[0] == "unit"]), 1)
                    self.assertEqual(len([event for event in harness.events if event[0] == "main"]), 1)
                finally:
                    harness.close()

    def test_failed_unit_step_does_not_write_beyond_owned_handoff_state(self):
        original_atomic = self.harness.atomic

        def fail_unit(path, value, mode=0o400, expected=None):
            if Path(path) == self.harness.unit:
                raise RuntimeError("fixture unit publication failed")
            return original_atomic(path, value, mode, expected)

        self.harness.atomic = fail_unit
        with activated_harness(self.harness):
            with self.assertRaisesRegex(RuntimeError, "fixture unit publication failed"):
                handoff.activate(self.harness.identity, self.harness.approval_path)
        self.assertEqual(self.harness.state["unit"], self.harness.old_unit)
        self.assertEqual(self.harness.state["main"], "old-control")
        self.assertFalse(any(event[0] == "main" for event in self.harness.events))
        self.assertFalse(any("network-fence.py" in event[1] for event in self.harness.events if event[0] == "run"))
        self._assert_no_timer_lifecycle_call()

    def test_rejected_postcheck_rolls_back_only_the_owned_unit_and_main_effects(self):
        self.harness.snapshot_sequence = [self.harness.snapshot_value, {"foreign": "postcheck-drift"}]
        with activated_harness(self.harness):
            with self.assertRaisesRegex(ValueError, "Application/data/firewall changed"):
                handoff.activate(self.harness.identity, self.harness.approval_path)
        self.assertEqual(self.harness.state["unit"], self.harness.old_unit)
        self.assertEqual(self.harness.state["main"], "old-control")
        self.assertEqual([event[0] for event in self.harness.events if event[0] in ("unit", "main")], ["unit", "main", "main", "unit"])
        self.assertIn("rolled-back.json", [Path(key).name for key in self.harness.records])
        self.assertFalse(self.harness.pending.exists())
        self._assert_no_timer_lifecycle_call()

    def test_terminal_replay_has_no_effects(self):
        receipt = {"decision": "PASS", "operationId": self.harness.identity}
        self.harness.put(self.harness.directory / "receipt.json", receipt)
        self.harness.put(self.harness.directory / "approval.json", self.harness.envelope)
        with activated_harness(self.harness):
            result = handoff.activate(self.harness.identity, self.harness.approval_path)
        self.assertEqual(result["decision"], "ALREADY_APPLIED")
        self.assertFalse(any(event[0] in ("lock", "unit", "main", "run") for event in self.harness.events))

    def test_terminal_rollback_with_own_pending_only_cleans_the_marker(self):
        terminal = {
            "decision": "ROLLED_BACK",
            "operationId": self.harness.identity,
            "planSha256": handoff.digest(handoff.canonical(self.harness.plan)),
        }
        self.harness.put(self.harness.directory / "rolled-back.json", terminal)
        self.harness.put(self.harness.pending, {"operationId": self.harness.identity})
        with activated_harness(self.harness):
            result = handoff.activate(self.harness.identity, self.harness.approval_path)
        self.assertEqual(result["decision"], "ROLLBACK_CLEANUP_RECONCILED")
        self.assertEqual(self.harness.state["unit"], self.harness.old_unit)
        self.assertEqual(self.harness.state["main"], "old-control")
        self.assertFalse(self.harness.pending.exists())
        self.assertFalse(any(event[0] in ("unit", "main", "run") for event in self.harness.events))

    def test_forward_receipt_with_own_pending_reconciles_only_the_pointer(self):
        receipt = {"decision": "PASS", "operationId": self.harness.identity}
        self.harness.put(self.harness.directory / "receipt.json", receipt)
        self.harness.put(self.harness.directory / "approval.json", self.harness.envelope)
        self.harness.put(self.harness.pending, {"operationId": self.harness.identity})
        self.harness.state["unit"] = self.harness.new_unit
        self.harness.state["main"] = "new-control"
        with activated_harness(self.harness):
            result = handoff.activate(self.harness.identity, self.harness.approval_path)
        self.assertEqual(result["decision"], "ACCEPTED_HANDOFF_RECONCILED")
        self.assertTrue(self.harness.pointer.exists())
        self.assertFalse(self.harness.pending.exists())
        self.assertFalse(any(event[0] in ("unit", "main", "run") for event in self.harness.events))

    def test_expired_timely_durable_intent_recovers_only_owned_effects_without_network_refresh(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        self.harness.envelope["approval"] = {
            "issuedAt": (now - datetime.timedelta(hours=2)).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "expiresAt": (now - datetime.timedelta(minutes=1)).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        }
        intent = self.harness.apply_intent(now - datetime.timedelta(minutes=30))
        self.harness.recovery_expired = True
        self.harness.put(self.harness.directory / "apply.intent.json", intent)
        self.harness.put(self.harness.directory / "apply-unit.intent.json", intent)
        self.harness.put(self.harness.directory / "apply-main.intent.json", intent)
        self.harness.put(self.harness.pending, {"operationId": self.harness.identity})
        self.harness.state["unit"] = self.harness.new_unit
        self.harness.state["main"] = "new-control"
        with activated_harness(self.harness):
            result = handoff.activate(self.harness.identity, self.harness.approval_path)
        self.assertEqual(result["decision"], "ROLLED_BACK")
        self.assertEqual(self.harness.state["unit"], self.harness.old_unit)
        self.assertEqual(self.harness.state["main"], "old-control")
        terminal = self.harness.read_json(self.harness.directory / "rolled-back.json")
        self.assertEqual(terminal["reason"], "EXPIRED_BEFORE_ACCEPTANCE")
        self.assertFalse(self.harness.pending.exists())
        self.assertFalse(any("network-fence.py" in event[1] for event in self.harness.events if event[0] == "run"))

    def test_missing_pending_after_durable_intent_reconstructs_and_resumes_within_window(self):
        self.harness.recovery_expired = False
        self.harness.put(self.harness.directory / "apply.intent.json", self.harness.apply_intent())
        with activated_harness(self.harness):
            result = handoff.activate(self.harness.identity, self.harness.approval_path)
        self.assertEqual(result["decision"], "CONTROL_HANDOFF_ACCEPTED")
        self.assertEqual(self.harness.state["unit"], self.harness.new_unit)
        self.assertEqual(self.harness.state["main"], "new-control")
        self.assertFalse(self.harness.pending.exists())
        self.assertTrue(any(event[0] == "recovery-validator" for event in self.harness.events))

    def test_missing_pending_with_phase_intent_or_foreign_postimage_is_denied(self):
        for phase, postimage in (("apply-unit.intent.json", False), (None, True)):
            with self.subTest(phase=phase, postimage=postimage):
                harness = ActivateHarness()
                try:
                    harness.put(harness.directory / "apply.intent.json", harness.apply_intent())
                    if phase:
                        harness.put(harness.directory / phase, harness.apply_intent())
                    if postimage:
                        harness.state["unit"] = harness.new_unit
                    with activated_harness(harness):
                        with self.assertRaises(ValueError):
                            handoff.activate(harness.identity, harness.approval_path)
                    self.assertEqual(harness.state["main"], "old-control")
                    self.assertFalse(any(event[0] == "run" for event in harness.events))
                finally:
                    harness.close()

    def test_expiry_before_any_effect_aborts_metadata_without_unit_main_or_network_effects(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        self.harness.envelope["approval"] = {
            "issuedAt": (now - datetime.timedelta(hours=2)).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "expiresAt": (now - datetime.timedelta(minutes=1)).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        }
        self.harness.recovery_expired = True
        self.harness.put(self.harness.directory / "apply.intent.json", self.harness.apply_intent(now - datetime.timedelta(minutes=30)))
        with activated_harness(self.harness):
            result = handoff.activate(self.harness.identity, self.harness.approval_path)
        self.assertEqual(result["decision"], "ROLLED_BACK")
        self.assertEqual(self.harness.state["unit"], self.harness.old_unit)
        self.assertEqual(self.harness.state["main"], "old-control")
        self.assertFalse(self.harness.pending.exists())
        self.assertFalse(any(event[0] in ("unit", "main", "run") for event in self.harness.events))
        terminal = self.harness.read_json(self.harness.directory / "rolled-back.json")
        self.assertEqual(terminal["reason"], "EXPIRED_BEFORE_ACCEPTANCE")

    def test_rollback_requires_a_separate_validator_before_any_effect(self):
        receipt = {"decision": "PASS", "operationId": self.harness.identity}
        self.harness.put(self.harness.directory / "receipt.json", receipt)
        self.harness.put(self.harness.directory / "approval.json", self.harness.envelope)

        def reject_rollback(*args):
            raise ValueError("separate rollback approval rejected")

        with activated_harness(self.harness, reject_rollback):
            with self.assertRaisesRegex(ValueError, "separate rollback approval rejected"):
                handoff.activate(self.harness.identity, self.harness.approval_path, rollback=True)
        self.assertFalse(any(event[0] in ("lock", "unit", "main", "run") for event in self.harness.events))


if __name__ == "__main__":
    unittest.main()
