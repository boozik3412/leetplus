import assert from "node:assert/strict";
import test from "node:test";

import {
  loadParentRootRegistry,
  parseCanonicalRootRegistry,
} from "./staff-task-integrity-snapshot-authority-root-transition.cli.mjs";

const ROOT_REGISTRY_PATH =
  "packages/database/scripts/staff-task-integrity-snapshot-authority-roots.json";

test("canonical root registry JSON accepts one optional trailing LF", () => {
  assert.deepEqual(parseCanonicalRootRegistry("{}"), {});
  assert.deepEqual(parseCanonicalRootRegistry("{}\n"), {});
});

test("noncanonical, malformed, and non-registry JSON reject", () => {
  for (const encoded of ["{ }", "{}\r\n", "{", "[]\n"]) {
    assert.throws(
      () => parseCanonicalRootRegistry(encoded),
      (error) => typeof error?.code === "string",
    );
  }
});

test("a proven missing parent registry is the only empty-registry fallback", () => {
  const calls = [];
  const registry = loadParentRootRegistry("a".repeat(40), (args) => {
    calls.push(args);
    if (args[0] === "cat-file") {
      return "";
    }
    if (args[0] === "ls-tree") {
      return Buffer.alloc(0);
    }
    throw new Error("unexpected git call");
  });

  assert.deepEqual(registry, {});
  assert.deepEqual(
    calls.map((args) => args[0]),
    ["cat-file", "ls-tree"],
  );
});

test("an existing parent registry that cannot be read rejects fail closed", () => {
  const treeEntry = Buffer.from(
    `100644 blob ${"b".repeat(40)}\t${ROOT_REGISTRY_PATH}\0`,
    "utf8",
  );
  assert.throws(
    () =>
      loadParentRootRegistry("a".repeat(40), (args) => {
        if (args[0] === "cat-file") {
          return "";
        }
        if (args[0] === "ls-tree") {
          return treeEntry;
        }
        throw new Error("simulated blob read failure");
      }),
    { code: "AUTHORITY_ROOT_TRANSITION_GIT_EVIDENCE_UNAVAILABLE" },
  );
});
