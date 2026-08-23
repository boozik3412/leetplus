import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";
import {
  validateAuthorityRootRegistry,
  validateAuthorityRootRegistryTransition,
} from "./staff-task-integrity-snapshot-authority-root-registry.mjs";
import { PINNED_PRODUCTION_LIKE_AUTHORITY_ROOTS } from "./staff-task-integrity-snapshot-authority-roots.mjs";

export const ROOT_TRANSITION_CONFIRMATION =
  "verify-pinned-authority-root-transition";

const ROOT_REGISTRY_PATH =
  "packages/database/scripts/staff-task-integrity-snapshot-authority-roots.json";
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MAX_REGISTRY_BYTES = 256 * 1024;

function transitionError(code, message, exitCode = 3) {
  const error = new Error(message);
  error.code = code;
  error.exitCode = exitCode;
  error.safeContractError = true;
  throw error;
}

export function parseCanonicalRootRegistry(encodedRegistry) {
  const bytes = Buffer.isBuffer(encodedRegistry)
    ? Buffer.from(encodedRegistry)
    : Buffer.from(String(encodedRegistry ?? ""), "utf8");
  if (bytes.length === 0 || bytes.length > MAX_REGISTRY_BYTES) {
    transitionError(
      "AUTHORITY_ROOT_REGISTRY_SOURCE_INVALID",
      "The root registry source size is invalid.",
    );
  }
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes) || text.includes("\0")) {
    transitionError(
      "AUTHORITY_ROOT_REGISTRY_SOURCE_INVALID",
      "The root registry source must be valid UTF-8.",
    );
  }
  let registry;
  try {
    registry = JSON.parse(text);
  } catch {
    transitionError(
      "AUTHORITY_ROOT_REGISTRY_SOURCE_INVALID",
      "The root registry source is not valid JSON.",
    );
  }
  const canonical = canonicalStringify(registry);
  if (text !== canonical && text !== `${canonical}\n`) {
    transitionError(
      "AUTHORITY_ROOT_REGISTRY_SOURCE_INVALID",
      "The root registry source must be canonical JSON.",
    );
  }
  return validateAuthorityRootRegistry(registry);
}

function runGit(args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: Object.hasOwn(options, "encoding") ? options.encoding : "utf8",
      input: options.input,
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
      windowsHide: true,
    });
  } catch {
    transitionError(
      "AUTHORITY_ROOT_TRANSITION_GIT_EVIDENCE_UNAVAILABLE",
      "Git evidence for the root transition is unavailable.",
      1,
    );
  }
}

export function loadParentRootRegistry(parentSha, git = runGit) {
  try {
    git(["cat-file", "-e", `${parentSha}^{commit}`]);
    const treeEntry = git(
      ["ls-tree", "-z", "--full-tree", parentSha, "--", ROOT_REGISTRY_PATH],
      {
        encoding: null,
      },
    );
    if (treeEntry.length === 0) {
      return Object.freeze({});
    }
    const expectedSuffix = Buffer.from(`\t${ROOT_REGISTRY_PATH}\0`, "utf8");
    if (
      !Buffer.isBuffer(treeEntry) ||
      !treeEntry.subarray(-expectedSuffix.length).equals(expectedSuffix) ||
      treeEntry.subarray(0, -expectedSuffix.length).includes(0) ||
      !/^[0-7]{6} blob [0-9a-f]{40}$/u.test(
        treeEntry.subarray(0, -expectedSuffix.length).toString("ascii"),
      )
    ) {
      transitionError(
        "AUTHORITY_ROOT_TRANSITION_GIT_EVIDENCE_INVALID",
        "The parent root registry tree evidence is invalid.",
        1,
      );
    }
    const encoded = git(["show", `${parentSha}:${ROOT_REGISTRY_PATH}`], {
      encoding: null,
      maxBuffer: MAX_REGISTRY_BYTES + 1,
    });
    return parseCanonicalRootRegistry(encoded);
  } catch (error) {
    if (error?.safeContractError) {
      throw error;
    }
    transitionError(
      "AUTHORITY_ROOT_TRANSITION_GIT_EVIDENCE_UNAVAILABLE",
      "Git evidence for the parent root registry is unavailable.",
      1,
    );
  }
}

export function verifyPinnedRootTransitionAgainstParents() {
  const registryPath = path.join(REPO_ROOT, ROOT_REGISTRY_PATH);
  const worktreeBytes = readFileSync(registryPath);
  const currentRegistry = parseCanonicalRootRegistry(worktreeBytes);
  if (
    canonicalStringify(currentRegistry) !==
    canonicalStringify(PINNED_PRODUCTION_LIKE_AUTHORITY_ROOTS)
  ) {
    transitionError(
      "AUTHORITY_ROOT_REGISTRY_RUNTIME_MISMATCH",
      "The runtime root registry differs from its canonical data source.",
    );
  }
  const headBytes = runGit(["show", `HEAD:${ROOT_REGISTRY_PATH}`], {
    encoding: null,
  });
  if (!Buffer.from(headBytes).equals(worktreeBytes)) {
    transitionError(
      "AUTHORITY_ROOT_REGISTRY_RUNTIME_MISMATCH",
      "The worktree root registry differs from the exact HEAD blob.",
    );
  }
  const status = String(
    runGit([
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      ROOT_REGISTRY_PATH,
    ]),
  ).trim();
  if (status) {
    transitionError(
      "AUTHORITY_ROOT_REGISTRY_RUNTIME_MISMATCH",
      "The root registry source is dirty.",
    );
  }
  const revision = String(runGit(["rev-list", "--parents", "-n", "1", "HEAD"]))
    .trim()
    .split(/\s+/u);
  const parents = revision.slice(1);
  for (const parentSha of parents) {
    validateAuthorityRootRegistryTransition(
      loadParentRootRegistry(parentSha),
      currentRegistry,
    );
  }
  return Object.freeze({ parentCount: parents.length });
}

function help() {
  return `Pinned production-like authority root transition gate

Usage:
  node staff-task-integrity-snapshot-authority-root-transition.cli.mjs \\
    --check-parent --confirm ${ROOT_TRANSITION_CONFIRMATION}

The gate compares the canonical pinned-root JSON in exact HEAD with every Git
parent. Unchanged registries, initial enrollment, guarded rotation, emergency
revoke-to-zero, and guarded recovery are allowed. Rewriting or removing root
history fails closed.
`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(help());
    return;
  }
  if (
    args.length !== 3 ||
    args[0] !== "--check-parent" ||
    args[1] !== "--confirm" ||
    args[2] !== ROOT_TRANSITION_CONFIRMATION
  ) {
    transitionError(
      "AUTHORITY_ROOT_TRANSITION_CONFIRMATION_REQUIRED",
      "The exact root-transition confirmation is required.",
    );
  }
  const result = verifyPinnedRootTransitionAgainstParents();
  process.stdout.write(
    `${canonicalStringify({
      status: "PASS",
      parentsChecked: result.parentCount,
    })}\n`,
  );
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${canonicalStringify({
        status: "REJECTED",
        code: String(error?.code ?? "AUTHORITY_ROOT_TRANSITION_CHECK_FAILED"),
      })}\n`,
    );
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  });
}
