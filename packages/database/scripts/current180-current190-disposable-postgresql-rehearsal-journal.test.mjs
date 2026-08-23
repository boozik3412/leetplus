import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isProxy } from "node:util/types";

import {
  createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly,
  issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly,
} from "./current180-current190-disposable-postgresql-rehearsal-coordinator.mjs";

import {
  Current180Current190PostgresqlRehearsalJournalError,
  appendCurrent180Current190PostgresqlRehearsalJournal,
  appendCurrent180Current190PostgresqlRehearsalJournalForTestOnly,
  assertCurrent180Current190PostgresqlRehearsalJournalManualInspectionReceipt,
  assertCurrent180Current190PostgresqlRehearsalJournalRecoveryReceiptForTestOnly,
  assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceiptForTestOnly as assertJournalVerificationReceiptForTestOnly,
  bindCurrent180Current190PostgresqlRehearsalJournal as bindProductionJournal,
  bindCurrent180Current190PostgresqlRehearsalJournalForTestOnly as bindJournalForTestOnly,
  cleanupCurrent180Current190PostgresqlRehearsalJournal,
  cleanupCurrent180Current190PostgresqlRehearsalJournalAfterManualInspection,
  cleanupCurrent180Current190PostgresqlRehearsalJournalAfterRestartForTestOnly,
  cleanupCurrent180Current190PostgresqlRehearsalJournalForTestOnly,
  createCurrent180Current190PostgresqlRehearsalJournalSigner,
  discoverCurrent180Current190PostgresqlRehearsalJournalRecoveryLocatorsForTestOnly,
  refreshCurrent180Current190PostgresqlRehearsalJournal,
  rehydrateCurrent180Current190PostgresqlRehearsalJournalRecoveryForTestOnly,
  verifyCurrent180Current190PostgresqlRehearsalJournal as verifyProductionJournal,
  verifyCurrent180Current190PostgresqlRehearsalJournalForTestOnly as verifyJournalForTestOnly,
} from "./current180-current190-disposable-postgresql-rehearsal-journal.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const ROOT_PREFIX = "lp-c180190-journal-";
const AUTHORIZATION_DIGEST = "a".repeat(64);
const DOMAIN_RECORD_DIGEST =
  "LEETPLUS_CURRENT180_CURRENT190_REHEARSAL_JOURNAL_RECORD_DIGEST_V1";
const coordinatorAuthoritiesByRunToken = new Map();
let latestCoordinatorAuthority = null;

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort(compareText)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function recomputePublicRecordDigest(record) {
  const { recordDigest: _ignored, ...signedRecord } = record;
  return sha256(
    Buffer.from(
      `${DOMAIN_RECORD_DIGEST}\n${canonicalJson(signedRecord)}`,
      "utf8",
    ),
  );
}

function isStrictDescendant(candidate, parent) {
  const pathRelativeToParent = relative(parent, candidate);
  return (
    pathRelativeToParent.length > 0 &&
    pathRelativeToParent !== ".." &&
    !pathRelativeToParent.startsWith(`..${sep}`) &&
    !isAbsolute(pathRelativeToParent)
  );
}

async function ownedRoots() {
  const root = await realpath(tmpdir());
  const entries = await readdir(root, { withFileTypes: true });
  return new Set(
    entries
      .filter(
        (entry) => entry.isDirectory() && entry.name.startsWith(ROOT_PREFIX),
      )
      .map((entry) => entry.name),
  );
}

function assertSameSet(actual, expected) {
  assert.deepEqual(
    [...actual].sort(compareText),
    [...expected].sort(compareText),
  );
}

function lifecycle(event, fromPhase, toPhase, seed = event) {
  return {
    event,
    evidenceDigest: sha256(`evidence:${seed}`),
    fromPhase,
    stateDigest: sha256(`state:${seed}`),
    toPhase,
  };
}

async function createBoundJournal() {
  const signer = createCurrent180Current190PostgresqlRehearsalJournalSigner();
  const journal = await bindCurrent180Current190PostgresqlRehearsalJournal(
    signer,
    AUTHORIZATION_DIGEST,
  );
  return {
    coordinatorAuthority: coordinatorAuthoritiesByRunToken.get(signer.runToken),
    journal,
    signer,
  };
}

async function bindCurrent180Current190PostgresqlRehearsalJournal(
  signer,
  authorizationReceiptDigest,
) {
  const coordinatorAuthority =
    createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly();
  const coordinatorRunBinding =
    await issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly(
      coordinatorAuthority,
      {
        authorizationReceiptDigest,
        runToken: signer?.runToken,
      },
    );
  const journal = await bindJournalForTestOnly(
    coordinatorAuthority,
    coordinatorRunBinding,
    signer,
  );
  coordinatorAuthoritiesByRunToken.set(journal.runToken, coordinatorAuthority);
  latestCoordinatorAuthority = coordinatorAuthority;
  return journal;
}

function coordinatorForLocator(locator) {
  if (locator === null || typeof locator !== "object" || isProxy(locator)) {
    return latestCoordinatorAuthority;
  }
  const descriptors = Object.getOwnPropertyDescriptors(locator);
  const runToken = descriptors.runToken;
  if (runToken !== undefined && Object.hasOwn(runToken, "value")) {
    return (
      coordinatorAuthoritiesByRunToken.get(runToken.value) ??
      latestCoordinatorAuthority
    );
  }
  return latestCoordinatorAuthority;
}

async function verifyCurrent180Current190PostgresqlRehearsalJournal(locator) {
  return verifyJournalForTestOnly(coordinatorForLocator(locator), locator);
}

function assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceipt(
  receipt,
) {
  return assertJournalVerificationReceiptForTestOnly(receipt);
}

async function overwriteInPlace(path, bytes) {
  const handle = await open(path, "r+");
  try {
    await handle.truncate(0);
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function expectJournalError(promise, code, finding) {
  let caught;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  assert.ok(
    caught instanceof Current180Current190PostgresqlRehearsalJournalError,
  );
  if (code !== undefined) assert.equal(caught.code, code);
  if (finding !== undefined) assert.ok(caught.findings.includes(finding));
  return caught;
}

test("creates a fresh memory-only Ed25519 signer and binds the run token before any filesystem journal", async () => {
  const beforeRoots = await ownedRoots();
  const first = createCurrent180Current190PostgresqlRehearsalJournalSigner();
  const second = createCurrent180Current190PostgresqlRehearsalJournalSigner();
  assert.match(first.publicKeyFingerprintSha256, /^[0-9a-f]{64}$/u);
  assert.equal(first.runToken, first.publicKeyFingerprintSha256.slice(0, 32));
  assert.notEqual(first.runToken, second.runToken);
  assert.equal(first.authorization.executionAuthority, false);
  assert.equal(first.limitations.privateKeyIsMemoryOnly, true);
  assert.equal(Object.isFrozen(first), true);
  assertSameSet(await ownedRoots(), beforeRoots);

  const cloneCoordinator =
    createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly();
  const cloneBinding =
    await issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly(
      cloneCoordinator,
      {
        authorizationReceiptDigest: AUTHORIZATION_DIGEST,
        runToken: first.runToken,
      },
    );
  await expectJournalError(
    bindJournalForTestOnly(
      cloneCoordinator,
      cloneBinding,
      structuredClone(first),
    ),
    "REHEARSAL_JOURNAL_SIGNER_INVALID",
    "EXACT_MODULE_BRANDED_SIGNER_REQUIRED",
  );
  await expectJournalError(
    bindProductionJournal(first, "bad"),
    "REHEARSAL_JOURNAL_BIND_INPUT_INVALID",
    "EXACT_PRODUCTION_SIGNING_VERIFICATION_BINDING_AND_SIGNER_REQUIRED",
  );

  const journal = await bindCurrent180Current190PostgresqlRehearsalJournal(
    second,
    AUTHORIZATION_DIGEST,
  );
  try {
    assert.equal(journal.runToken, second.runToken);
    assert.equal(journal.authorizationReceiptDigest, AUTHORIZATION_DIGEST);
    assert.equal(journal.authorization.executionAuthority, false);
    assert.equal(journal.authorization.canConnectDatabase, false);
  } finally {
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(journal);
  }
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("writes a self-contained durable header only to OS temp and exposes no private key", async () => {
  const beforeRoots = await ownedRoots();
  const { journal, signer } = await createBoundJournal();
  try {
    const systemTemp = resolve(await realpath(tmpdir()));
    assert.ok(isStrictDescendant(journal.rootPath, systemTemp));
    assert.equal(isStrictDescendant(journal.rootPath, REPOSITORY_ROOT), false);
    assert.equal(
      isStrictDescendant(journal.journalPath, journal.rootPath),
      true,
    );
    const bytes = await readFile(journal.journalPath);
    assert.equal(bytes.at(-1), 10);
    assert.equal(bytes.includes(13), false);
    const header = JSON.parse(bytes.toString("utf8").trimEnd());
    assert.equal(header.recordType, "HEADER");
    assert.equal(header.sequence, 0);
    assert.equal(header.authorizationReceiptDigest, AUTHORIZATION_DIGEST);
    assert.equal(header.runToken, signer.runToken);
    assert.equal(
      header.signerFingerprintSha256,
      signer.publicKeyFingerprintSha256,
    );
    assert.equal(header.publicKeySpkiDerBase64.length, 60);
    assert.equal(header.signatureBase64.length, 88);
    const serializedPublicState = [signer, journal, header]
      .map((value) => JSON.stringify(value))
      .join("\n");
    assert.doesNotMatch(serializedPublicState, /PRIVATE KEY/u);
    assert.doesNotMatch(serializedPublicState, /"privateKey"\s*:/u);
  } finally {
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(journal);
  }
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("appends only contiguous rehearsal-contract lifecycle transitions", async () => {
  const { journal } = await createBoundJournal();
  try {
    const first = await appendCurrent180Current190PostgresqlRehearsalJournal(
      journal,
      lifecycle("PREFLIGHT_ACCEPTED", "INITIAL", "PREFLIGHT_ACCEPTED"),
    );
    const second = await appendCurrent180Current190PostgresqlRehearsalJournal(
      journal,
      lifecycle(
        "CLUSTER_LOCK_ACQUIRED",
        "PREFLIGHT_ACCEPTED",
        "CLUSTER_LOCKED",
      ),
    );
    assert.equal(first.sequence, 1);
    assert.equal(second.sequence, 2);
    assert.equal(first.authorization.executionAuthority, false);

    const verified = await verifyCurrent180Current190PostgresqlRehearsalJournal(
      journal.verificationLocator,
    );
    assert.equal(verified.recordCount, 3);
    assert.equal(verified.lastSequence, 2);
    assert.equal(verified.lastPhase, "CLUSTER_LOCKED");
    assert.equal(verified.sourceZeroDiffFingerprintDigest, null);
    assert.equal(verified.authorizationReceiptDigest, AUTHORIZATION_DIGEST);
    assert.equal(verified.authorization.canSpawnProcess, false);
    assert.equal(verified.limitations.hostileLocalActorToctouEliminated, false);
  } finally {
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(journal);
  }
});

test("public verification exposes only the signed source zero-diff fingerprint needed for restart cleanup", async () => {
  const { journal } = await createBoundJournal();
  const sourceFingerprint = sha256("exact-source-semantic-fingerprint");
  const path = [
    ["PREFLIGHT_ACCEPTED", "INITIAL", "PREFLIGHT_ACCEPTED"],
    ["CLUSTER_LOCK_ACQUIRED", "PREFLIGHT_ACCEPTED", "CLUSTER_LOCKED"],
    ["SOURCE_PINNED", "CLUSTER_LOCKED", "SOURCE_PINNED"],
    ["CREATE_ISSUED", "SOURCE_PINNED", "CREATE_PENDING"],
    ["CREATE_RECONCILED", "CREATE_PENDING", "WORKING_OWNED"],
    ["WORKING_MARKED", "WORKING_OWNED", "WORKING_MARKED"],
    ["WORKING_OPENED", "WORKING_MARKED", "WORKING_OPEN"],
    ["PRISMA_DEPLOY_ISSUED", "WORKING_OPEN", "APPLY_PENDING"],
    ["APPLY_RECONCILED", "APPLY_PENDING", "WORKING_APPLIED"],
    ["WORKING_SEALED", "WORKING_APPLIED", "WORKING_SEALED"],
    ["RENAME_ISSUED", "WORKING_SEALED", "RENAME_PENDING"],
    ["RENAME_RECONCILED", "RENAME_PENDING", "FINAL_OWNED"],
    ["FINAL_OPENED", "FINAL_OWNED", "FINAL_OPEN"],
    ["FINAL_FINGERPRINT_VERIFIED", "FINAL_OPEN", "FINAL_VERIFIED"],
    ["ZERO_DIFF_DEPLOY_ISSUED", "FINAL_VERIFIED", "ZERO_DIFF_PENDING"],
    ["ZERO_DIFF_VERIFIED", "ZERO_DIFF_PENDING", "ZERO_DIFF_VERIFIED"],
    ["ROLLBACK_SEALED", "ZERO_DIFF_VERIFIED", "ROLLBACK_SEALED"],
    ["ROLLBACK_RENAME_ISSUED", "ROLLBACK_SEALED", "ROLLBACK_RENAME_PENDING"],
    [
      "ROLLBACK_RENAME_RECONCILED",
      "ROLLBACK_RENAME_PENDING",
      "ROLLBACK_WORKING_OWNED",
    ],
    ["DROP_ISSUED", "ROLLBACK_WORKING_OWNED", "DROP_PENDING"],
    ["ABSENCE_VERIFIED", "DROP_PENDING", "ABSENCE_VERIFIED"],
    [
      "SOURCE_ZERO_DIFF_VERIFIED",
      "ABSENCE_VERIFIED",
      "SOURCE_ZERO_DIFF_VERIFIED",
    ],
    ["COMPLETED", "SOURCE_ZERO_DIFF_VERIFIED", "COMPLETED"],
  ];
  try {
    for (const [event, fromPhase, toPhase] of path) {
      const input = lifecycle(event, fromPhase, toPhase);
      if (event === "SOURCE_ZERO_DIFF_VERIFIED") {
        input.evidenceDigest = sourceFingerprint;
      }
      await appendCurrent180Current190PostgresqlRehearsalJournal(
        journal,
        input,
      );
    }
    const verified = await verifyCurrent180Current190PostgresqlRehearsalJournal(
      journal.verificationLocator,
    );
    assert.equal(verified.lastPhase, "COMPLETED");
    assert.equal(verified.sourceZeroDiffFingerprintDigest, sourceFingerprint);
    assert.equal(Object.hasOwn(verified, "records"), false);
  } finally {
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(journal);
  }
});

test("rejects wrong vocabulary, phase continuity and digest shape before append", async () => {
  const { journal } = await createBoundJournal();
  try {
    const invalid = [
      lifecycle("NOT_A_TRANSITION", "INITIAL", "PREFLIGHT_ACCEPTED"),
      lifecycle("PREFLIGHT_ACCEPTED", "INITIAL", "CLUSTER_LOCKED"),
      lifecycle(
        "PREFLIGHT_ACCEPTED",
        "PREFLIGHT_ACCEPTED",
        "PREFLIGHT_ACCEPTED",
      ),
      {
        ...lifecycle("PREFLIGHT_ACCEPTED", "INITIAL", "PREFLIGHT_ACCEPTED"),
        evidenceDigest: "bad",
      },
    ];
    for (const candidate of invalid) {
      await expectJournalError(
        appendCurrent180Current190PostgresqlRehearsalJournal(
          journal,
          candidate,
        ),
        "REHEARSAL_JOURNAL_APPEND_INPUT_INVALID",
        "LIFECYCLE_TRANSITION_OR_DIGEST_INVALID",
      );
    }
    const verified = await verifyCurrent180Current190PostgresqlRehearsalJournal(
      journal.verificationLocator,
    );
    assert.equal(verified.recordCount, 1);
  } finally {
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(journal);
  }
});

test("rejects proxy, accessor and cloned handles without invoking caller code", async () => {
  const { journal } = await createBoundJournal();
  try {
    let proxyTrapInvoked = false;
    const proxyInput = new Proxy(
      lifecycle("PREFLIGHT_ACCEPTED", "INITIAL", "PREFLIGHT_ACCEPTED"),
      {
        getOwnPropertyDescriptor() {
          proxyTrapInvoked = true;
          throw new Error("must not execute");
        },
        ownKeys() {
          proxyTrapInvoked = true;
          throw new Error("must not execute");
        },
      },
    );
    await expectJournalError(
      appendCurrent180Current190PostgresqlRehearsalJournal(journal, proxyInput),
      "REHEARSAL_JOURNAL_APPEND_INPUT_INVALID",
      "EXACT_DATA_ONLY_LIFECYCLE_INPUT_REQUIRED",
    );
    assert.equal(proxyTrapInvoked, false);

    let getterInvoked = false;
    const accessorInput = lifecycle(
      "PREFLIGHT_ACCEPTED",
      "INITIAL",
      "PREFLIGHT_ACCEPTED",
    );
    Object.defineProperty(accessorInput, "event", {
      enumerable: true,
      get() {
        getterInvoked = true;
        throw new Error("must not execute");
      },
    });
    await expectJournalError(
      appendCurrent180Current190PostgresqlRehearsalJournal(
        journal,
        accessorInput,
      ),
      "REHEARSAL_JOURNAL_APPEND_INPUT_INVALID",
      "EXACT_DATA_ONLY_LIFECYCLE_INPUT_REQUIRED",
    );
    assert.equal(getterInvoked, false);

    await expectJournalError(
      appendCurrent180Current190PostgresqlRehearsalJournal(
        structuredClone(journal),
        lifecycle("PREFLIGHT_ACCEPTED", "INITIAL", "PREFLIGHT_ACCEPTED"),
      ),
      "REHEARSAL_JOURNAL_HANDLE_INVALID",
      "EXACT_MODULE_BRANDED_JOURNAL_HANDLE_REQUIRED",
    );
  } finally {
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(journal);
  }
});

test("public crash verifier accepts a cloned locator but never restores append authority", async () => {
  const { journal } = await createBoundJournal();
  try {
    const crashLocator = structuredClone(journal.verificationLocator);
    const verified =
      await verifyCurrent180Current190PostgresqlRehearsalJournal(crashLocator);
    assert.equal(verified.recordCount, 1);
    assert.equal(verified.authorization.canRecoverRehearsal, false);
    assert.equal(
      verified.limitations.crashVerificationDoesNotRestoreAppendAuthority,
      true,
    );
    await expectJournalError(
      appendCurrent180Current190PostgresqlRehearsalJournal(
        structuredClone(journal),
        lifecycle("PREFLIGHT_ACCEPTED", "INITIAL", "PREFLIGHT_ACCEPTED"),
      ),
      "REHEARSAL_JOURNAL_HANDLE_INVALID",
    );
  } finally {
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(journal);
  }
});

test("trusted verifier rejects a complete journal origin generated by an attacker coordinator", async () => {
  const trusted = await createBoundJournal();
  const attacker = await createBoundJournal();
  try {
    const attackerSelfVerification = await verifyJournalForTestOnly(
      attacker.coordinatorAuthority,
      structuredClone(attacker.journal.verificationLocator),
    );
    assert.equal(
      attackerSelfVerification.coordinatorFingerprintSha256,
      attacker.journal.coordinatorFingerprintSha256,
    );

    await expectJournalError(
      verifyJournalForTestOnly(
        trusted.coordinatorAuthority,
        structuredClone(attacker.journal.verificationLocator),
      ),
      "REHEARSAL_JOURNAL_COORDINATOR_TRUST_INVALID",
      "COORDINATOR_SIGNED_JOURNAL_ANCHOR_REQUIRED",
    );
  } finally {
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(
      trusted.journal,
    );
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(
      attacker.journal,
    );
  }
});

test("verifier rejects byte, signature, sequence, chain, truncation and extra-record drift", async () => {
  const { journal } = await createBoundJournal();
  await appendCurrent180Current190PostgresqlRehearsalJournal(
    journal,
    lifecycle("PREFLIGHT_ACCEPTED", "INITIAL", "PREFLIGHT_ACCEPTED"),
  );
  const original = await readFile(journal.journalPath);
  const originalLines = original.toString("utf8").trimEnd().split("\n");
  const header = JSON.parse(originalLines[0]);
  const lifecycleRecord = JSON.parse(originalLines[1]);
  const variants = [];

  const byteDrift = Buffer.from(original);
  byteDrift[0] = "[".charCodeAt(0);
  variants.push(byteDrift);

  const signatureDrift = structuredClone(lifecycleRecord);
  signatureDrift.signatureBase64 = `${signatureDrift.signatureBase64[0] === "A" ? "B" : "A"}${signatureDrift.signatureBase64.slice(1)}`;
  variants.push(
    Buffer.from(
      `${canonicalJson(header)}\n${canonicalJson(signatureDrift)}\n`,
      "utf8",
    ),
  );

  const sequenceDrift = structuredClone(lifecycleRecord);
  sequenceDrift.sequence = 2;
  variants.push(
    Buffer.from(
      `${canonicalJson(header)}\n${canonicalJson(sequenceDrift)}\n`,
      "utf8",
    ),
  );

  const chainDrift = structuredClone(lifecycleRecord);
  chainDrift.previousRecordDigest = "f".repeat(64);
  variants.push(
    Buffer.from(
      `${canonicalJson(header)}\n${canonicalJson(chainDrift)}\n`,
      "utf8",
    ),
  );

  variants.push(original.subarray(0, original.length - 1));
  variants.push(Buffer.concat([original, Buffer.from("{}\n", "utf8")]));
  variants.push(
    Buffer.from(original.toString("utf8").replace("\n", "\r\n"), "utf8"),
  );

  try {
    for (const variant of variants) {
      await overwriteInPlace(journal.journalPath, variant);
      await expectJournalError(
        verifyCurrent180Current190PostgresqlRehearsalJournal(
          journal.verificationLocator,
        ),
        variant === variants[0] ? "REHEARSAL_JOURNAL_BYTES_INVALID" : undefined,
      );
      await overwriteInPlace(journal.journalPath, original);
    }
    const repaired = await verifyCurrent180Current190PostgresqlRehearsalJournal(
      journal.verificationLocator,
    );
    assert.equal(repaired.recordCount, 2);
  } finally {
    await overwriteInPlace(journal.journalPath, original).catch(
      () => undefined,
    );
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(journal);
  }
});

test("verifier rejects locator proxies and accessors without invoking them", async () => {
  const { journal } = await createBoundJournal();
  try {
    let proxyTrapInvoked = false;
    const proxyLocator = new Proxy(journal.verificationLocator, {
      getOwnPropertyDescriptor() {
        proxyTrapInvoked = true;
        throw new Error("must not execute");
      },
      ownKeys() {
        proxyTrapInvoked = true;
        throw new Error("must not execute");
      },
    });
    await expectJournalError(
      verifyCurrent180Current190PostgresqlRehearsalJournal(proxyLocator),
      "REHEARSAL_JOURNAL_LOCATOR_INVALID",
      "EXACT_DATA_ONLY_LOCATOR_REQUIRED",
    );
    assert.equal(proxyTrapInvoked, false);

    let getterInvoked = false;
    const accessorLocator = structuredClone(journal.verificationLocator);
    Object.defineProperty(accessorLocator, "journalPath", {
      enumerable: true,
      get() {
        getterInvoked = true;
        throw new Error("must not execute");
      },
    });
    await expectJournalError(
      verifyCurrent180Current190PostgresqlRehearsalJournal(accessorLocator),
      "REHEARSAL_JOURNAL_LOCATOR_INVALID",
      "EXACT_DATA_ONLY_LOCATOR_REQUIRED",
    );
    assert.equal(getterInvoked, false);
  } finally {
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(journal);
  }
});

test("a recomputed public record digest cannot forge an Ed25519 lifecycle signature", async () => {
  const { journal } = await createBoundJournal();
  await appendCurrent180Current190PostgresqlRehearsalJournal(
    journal,
    lifecycle("PREFLIGHT_ACCEPTED", "INITIAL", "PREFLIGHT_ACCEPTED"),
  );
  const original = await readFile(journal.journalPath);
  try {
    const records = original
      .toString("utf8")
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    const forged = structuredClone(records[1]);
    forged.evidenceDigest = sha256("attacker-controlled-evidence");
    forged.recordDigest = recomputePublicRecordDigest(forged);
    await overwriteInPlace(
      journal.journalPath,
      Buffer.from(
        `${canonicalJson(records[0])}\n${canonicalJson(forged)}\n`,
        "utf8",
      ),
    );
    await expectJournalError(
      verifyCurrent180Current190PostgresqlRehearsalJournal(
        journal.verificationLocator,
      ),
      "REHEARSAL_JOURNAL_RECORD_INVALID",
      "ED25519_SIGNATURE_VERIFICATION_FAILED",
    );
  } finally {
    await overwriteInPlace(journal.journalPath, original).catch(
      () => undefined,
    );
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(journal);
  }
});

test("only the latest module-branded verifier receipt remains acceptable", async () => {
  const { journal } = await createBoundJournal();
  let latest;
  try {
    const first = await verifyCurrent180Current190PostgresqlRehearsalJournal(
      journal.verificationLocator,
    );
    assert.equal(
      assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceipt(
        first,
      ),
      first,
    );
    latest = await verifyCurrent180Current190PostgresqlRehearsalJournal(
      journal.verificationLocator,
    );
    await expectJournalError(
      Promise.resolve().then(() =>
        assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceipt(
          first,
        ),
      ),
      "REHEARSAL_JOURNAL_VERIFICATION_RECEIPT_INVALID",
      "FRESH_TEST_ONLY_VERIFICATION_RECEIPT_REQUIRED",
    );
    await expectJournalError(
      Promise.resolve().then(() =>
        assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceipt(
          structuredClone(latest),
        ),
      ),
      "REHEARSAL_JOURNAL_VERIFICATION_RECEIPT_INVALID",
      "FRESH_TEST_ONLY_VERIFICATION_RECEIPT_REQUIRED",
    );

    let proxyTrapInvoked = false;
    const proxyReceipt = new Proxy(latest, {
      get() {
        proxyTrapInvoked = true;
        throw new Error("must not execute");
      },
    });
    await expectJournalError(
      Promise.resolve().then(() =>
        assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceipt(
          proxyReceipt,
        ),
      ),
      "REHEARSAL_JOURNAL_VERIFICATION_RECEIPT_INVALID",
    );
    assert.equal(proxyTrapInvoked, false);

    await appendCurrent180Current190PostgresqlRehearsalJournal(
      journal,
      lifecycle("PREFLIGHT_ACCEPTED", "INITIAL", "PREFLIGHT_ACCEPTED"),
    );
    await expectJournalError(
      Promise.resolve().then(() =>
        assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceipt(
          latest,
        ),
      ),
      "REHEARSAL_JOURNAL_VERIFICATION_RECEIPT_INVALID",
      "FRESH_TEST_ONLY_VERIFICATION_RECEIPT_REQUIRED",
    );
  } finally {
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(journal);
  }
});

test("lost append response is reconciled only with the original live private signer", async () => {
  const { journal } = await createBoundJournal();
  try {
    await expectJournalError(
      appendCurrent180Current190PostgresqlRehearsalJournalForTestOnly(
        journal,
        lifecycle("PREFLIGHT_ACCEPTED", "INITIAL", "PREFLIGHT_ACCEPTED"),
        { fault: "AFTER_DURABLE_APPEND_BEFORE_STATE" },
      ),
      "REHEARSAL_JOURNAL_APPEND_RESPONSE_LOST",
      "DURABLE_RECORD_MAY_EXIST_REFRESH_REQUIRED",
    );
    const publicVerification =
      await verifyCurrent180Current190PostgresqlRehearsalJournal(
        structuredClone(journal.verificationLocator),
      );
    assert.equal(publicVerification.lastSequence, 1);
    assert.equal(publicVerification.authorization.canRecoverRehearsal, false);

    await expectJournalError(
      appendCurrent180Current190PostgresqlRehearsalJournal(
        journal,
        lifecycle(
          "CLUSTER_LOCK_ACQUIRED",
          "PREFLIGHT_ACCEPTED",
          "CLUSTER_LOCKED",
        ),
      ),
      "REHEARSAL_JOURNAL_HANDLE_INVALID",
      "JOURNAL_HANDLE_NOT_IN_REQUIRED_LIVE_STATE",
    );
    const refresh =
      await refreshCurrent180Current190PostgresqlRehearsalJournal(journal);
    assert.equal(refresh.lastSequence, 1);
    assert.equal(refresh.authorization.canRecoverRehearsal, false);
    const next = await appendCurrent180Current190PostgresqlRehearsalJournal(
      journal,
      lifecycle(
        "CLUSTER_LOCK_ACQUIRED",
        "PREFLIGHT_ACCEPTED",
        "CLUSTER_LOCKED",
      ),
    );
    assert.equal(next.sequence, 2);
  } finally {
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(journal);
  }
});

test("cleanup fails closed on file identity drift and uses a branded manual-inspection receipt", async () => {
  const beforeRoots = await ownedRoots();
  const { journal } = await createBoundJournal();
  const heldPath = `${journal.journalPath}.held`;
  let replacementPresent = false;
  let originalHeld = false;
  let cleaned = false;
  try {
    await rename(journal.journalPath, heldPath);
    originalHeld = true;
    await writeFile(journal.journalPath, "untrusted replacement\n", {
      flag: "wx",
      mode: 0o600,
    });
    replacementPresent = true;
    const error = await expectJournalError(
      cleanupCurrent180Current190PostgresqlRehearsalJournal(journal),
      "REHEARSAL_JOURNAL_CLEANUP_INCOMPLETE",
      "MANUAL_INSPECTION_REQUIRED",
    );
    const manual =
      assertCurrent180Current190PostgresqlRehearsalJournalManualInspectionReceipt(
        error.manualInspectionReceipt,
      );
    assert.equal(
      await readFile(journal.journalPath, "utf8"),
      "untrusted replacement\n",
    );
    await unlink(journal.journalPath);
    replacementPresent = false;
    await rename(heldPath, journal.journalPath);
    originalHeld = false;
    const cleanup =
      await cleanupCurrent180Current190PostgresqlRehearsalJournalAfterManualInspection(
        manual,
      );
    cleaned = true;
    assert.equal(cleanup.rootAbsent, true);
    assert.equal(cleanup.effects.recursiveRemovalUsed, false);
    await expectJournalError(
      Promise.resolve().then(() =>
        assertCurrent180Current190PostgresqlRehearsalJournalManualInspectionReceipt(
          structuredClone(manual),
        ),
      ),
      "REHEARSAL_JOURNAL_MANUAL_INSPECTION_RECEIPT_INVALID",
    );
  } finally {
    if (replacementPresent)
      await unlink(journal.journalPath).catch(() => undefined);
    if (originalHeld)
      await rename(heldPath, journal.journalPath).catch(() => undefined);
    if (!cleaned) {
      const stateError =
        await cleanupCurrent180Current190PostgresqlRehearsalJournal(
          journal,
        ).catch((error) => error);
      if (stateError?.manualInspectionReceipt) {
        await cleanupCurrent180Current190PostgresqlRehearsalJournalAfterManualInspection(
          stateError.manualInspectionReceipt,
        ).catch(() => undefined);
      }
    }
  }
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("cleanup refuses unexpected entries before deleting the authenticated journal", async () => {
  const beforeRoots = await ownedRoots();
  const { journal } = await createBoundJournal();
  const extraPath = join(journal.rootPath, "unexpected-entry");
  await writeFile(extraPath, "untrusted\n", { flag: "wx", mode: 0o600 });
  let cleaned = false;
  try {
    const error = await expectJournalError(
      cleanupCurrent180Current190PostgresqlRehearsalJournal(journal),
      "REHEARSAL_JOURNAL_CLEANUP_INCOMPLETE",
    );
    assert.equal((await lstat(journal.journalPath)).isFile(), true);
    assert.equal((await lstat(extraPath)).isFile(), true);
    await unlink(extraPath);
    const cleanup =
      await cleanupCurrent180Current190PostgresqlRehearsalJournalAfterManualInspection(
        error.manualInspectionReceipt,
      );
    cleaned = true;
    assert.equal(cleanup.rootAbsent, true);
  } finally {
    await unlink(extraPath).catch(() => undefined);
    if (!cleaned) {
      await cleanupCurrent180Current190PostgresqlRehearsalJournal(
        journal,
      ).catch(async (error) => {
        if (error?.manualInspectionReceipt) {
          await cleanupCurrent180Current190PostgresqlRehearsalJournalAfterManualInspection(
            error.manualInspectionReceipt,
          ).catch(() => undefined);
        }
      });
    }
  }
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("normal cleanup leaves zero residue and invalidates verifier receipts and handles", async () => {
  const beforeRoots = await ownedRoots();
  const { journal } = await createBoundJournal();
  const verifier = await verifyCurrent180Current190PostgresqlRehearsalJournal(
    journal.verificationLocator,
  );
  const cleanup =
    await cleanupCurrent180Current190PostgresqlRehearsalJournal(journal);
  assert.equal(cleanup.rootAbsent, true);
  assert.equal(cleanup.effects.recursiveRemovalUsed, false);
  assert.equal(cleanup.effects.journalFileRemoved, true);
  await assert.rejects(lstat(journal.rootPath), { code: "ENOENT" });
  await expectJournalError(
    Promise.resolve().then(() =>
      assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceipt(
        verifier,
      ),
    ),
    "REHEARSAL_JOURNAL_VERIFICATION_RECEIPT_INVALID",
    "FRESH_TEST_ONLY_VERIFICATION_RECEIPT_REQUIRED",
  );
  await expectJournalError(
    cleanupCurrent180Current190PostgresqlRehearsalJournal(journal),
    "REHEARSAL_JOURNAL_HANDLE_INVALID",
    "JOURNAL_HANDLE_NOT_IN_REQUIRED_LIVE_STATE",
  );
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("cleanup response loss after durable file removal resumes from the exact owned root", async () => {
  const beforeRoots = await ownedRoots();
  const { journal } = await createBoundJournal();
  const error = await expectJournalError(
    cleanupCurrent180Current190PostgresqlRehearsalJournalForTestOnly(journal, {
      fault: "AFTER_DURABLE_FILE_REMOVAL",
    }),
    "REHEARSAL_JOURNAL_CLEANUP_INCOMPLETE",
    "MANUAL_INSPECTION_REQUIRED",
  );
  const manual =
    assertCurrent180Current190PostgresqlRehearsalJournalManualInspectionReceipt(
      error.manualInspectionReceipt,
    );
  assert.equal(manual.cleanupStage, "JOURNAL_FILE_REMOVAL_AMBIGUOUS");
  await assert.rejects(lstat(journal.journalPath), { code: "ENOENT" });
  assert.equal((await lstat(journal.rootPath)).isDirectory(), true);

  const cleanup =
    await cleanupCurrent180Current190PostgresqlRehearsalJournalAfterManualInspection(
      manual,
    );
  assert.equal(cleanup.effects.journalFileRemoved, true);
  assert.equal(cleanup.effects.rootRemoved, true);
  assert.equal(cleanup.reconciledPriorRemoval, true);
  await assert.rejects(lstat(journal.rootPath), { code: "ENOENT" });
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("cleanup retry safely repeats a file removal whose lost response applied no effect", async () => {
  const beforeRoots = await ownedRoots();
  const { journal } = await createBoundJournal();
  const identityBefore = await lstat(journal.journalPath, { bigint: true });
  const error = await expectJournalError(
    cleanupCurrent180Current190PostgresqlRehearsalJournalForTestOnly(journal, {
      fault: "JOURNAL_FILE_REMOVAL_NOT_APPLIED_RESPONSE_LOST",
    }),
    "REHEARSAL_JOURNAL_CLEANUP_INCOMPLETE",
    "MANUAL_INSPECTION_REQUIRED",
  );
  const identityAfter = await lstat(journal.journalPath, { bigint: true });
  assert.equal(identityAfter.dev, identityBefore.dev);
  assert.equal(identityAfter.ino, identityBefore.ino);
  const manual =
    assertCurrent180Current190PostgresqlRehearsalJournalManualInspectionReceipt(
      error.manualInspectionReceipt,
    );
  assert.equal(manual.cleanupStage, "JOURNAL_FILE_REMOVAL_AMBIGUOUS");
  const cleanup =
    await cleanupCurrent180Current190PostgresqlRehearsalJournalAfterManualInspection(
      manual,
    );
  assert.equal(cleanup.rootAbsent, true);
  assert.equal(cleanup.reconciledPriorRemoval, true);
  await assert.rejects(lstat(journal.rootPath), { code: "ENOENT" });
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("cleanup retry safely repeats a root removal whose lost response applied no effect", async () => {
  const beforeRoots = await ownedRoots();
  const { journal } = await createBoundJournal();
  const rootIdentityBefore = await lstat(journal.rootPath, { bigint: true });
  const error = await expectJournalError(
    cleanupCurrent180Current190PostgresqlRehearsalJournalForTestOnly(journal, {
      fault: "ROOT_REMOVAL_NOT_APPLIED_RESPONSE_LOST",
    }),
    "REHEARSAL_JOURNAL_CLEANUP_INCOMPLETE",
    "MANUAL_INSPECTION_REQUIRED",
  );
  await assert.rejects(lstat(journal.journalPath), { code: "ENOENT" });
  const rootIdentityAfter = await lstat(journal.rootPath, { bigint: true });
  assert.equal(rootIdentityAfter.dev, rootIdentityBefore.dev);
  assert.equal(rootIdentityAfter.ino, rootIdentityBefore.ino);
  const manual =
    assertCurrent180Current190PostgresqlRehearsalJournalManualInspectionReceipt(
      error.manualInspectionReceipt,
    );
  assert.equal(manual.cleanupStage, "ROOT_REMOVAL_AMBIGUOUS");
  const cleanup =
    await cleanupCurrent180Current190PostgresqlRehearsalJournalAfterManualInspection(
      manual,
    );
  assert.equal(cleanup.rootAbsent, true);
  assert.equal(cleanup.reconciledPriorRemoval, true);
  await assert.rejects(lstat(journal.rootPath), { code: "ENOENT" });
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("cleanup response loss after root removal proves absence and never removes an untrusted replacement", async () => {
  const beforeRoots = await ownedRoots();
  const { journal } = await createBoundJournal();
  const firstError = await expectJournalError(
    cleanupCurrent180Current190PostgresqlRehearsalJournalForTestOnly(journal, {
      fault: "AFTER_DURABLE_ROOT_REMOVAL",
    }),
    "REHEARSAL_JOURNAL_CLEANUP_INCOMPLETE",
    "MANUAL_INSPECTION_REQUIRED",
  );
  const firstManual =
    assertCurrent180Current190PostgresqlRehearsalJournalManualInspectionReceipt(
      firstError.manualInspectionReceipt,
    );
  assert.equal(firstManual.cleanupStage, "ROOT_REMOVAL_AMBIGUOUS");
  await assert.rejects(lstat(journal.rootPath), { code: "ENOENT" });

  await mkdir(journal.rootPath);
  const replacementIdentity = await lstat(journal.rootPath, { bigint: true });
  const secondError = await expectJournalError(
    cleanupCurrent180Current190PostgresqlRehearsalJournalAfterManualInspection(
      firstManual,
    ),
    "REHEARSAL_JOURNAL_MANUAL_CLEANUP_INCOMPLETE",
    "MANUAL_INSPECTION_STILL_REQUIRED",
  );
  const stillPresent = await lstat(journal.rootPath, { bigint: true });
  assert.equal(stillPresent.dev, replacementIdentity.dev);
  assert.equal(stillPresent.ino, replacementIdentity.ino);
  await rmdir(journal.rootPath);

  const replacementManual =
    assertCurrent180Current190PostgresqlRehearsalJournalManualInspectionReceipt(
      secondError.manualInspectionReceipt,
    );
  assert.equal(replacementManual.cleanupStage, "ROOT_REMOVAL_AMBIGUOUS");
  const cleanup =
    await cleanupCurrent180Current190PostgresqlRehearsalJournalAfterManualInspection(
      replacementManual,
    );
  assert.equal(cleanup.effects.journalFileRemoved, true);
  assert.equal(cleanup.effects.rootRemoved, true);
  assert.equal(cleanup.reconciledPriorRemoval, true);
  await assert.rejects(lstat(journal.rootPath), { code: "ENOENT" });
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("signed journal discovery rehydrates a crashed process and removes only its exact root", async () => {
  const beforeRoots = await ownedRoots();
  const { coordinatorAuthority, journal } = await createBoundJournal();
  await appendCurrent180Current190PostgresqlRehearsalJournal(
    journal,
    lifecycle("PREFLIGHT_ACCEPTED", "INITIAL", "PREFLIGHT_ACCEPTED"),
  );
  const discovered =
    await discoverCurrent180Current190PostgresqlRehearsalJournalRecoveryLocatorsForTestOnly(
      coordinatorAuthority,
    );
  const locator = discovered.find(
    (candidate) => candidate.runToken === journal.runToken,
  );
  assert.ok(locator);
  const recovery =
    await rehydrateCurrent180Current190PostgresqlRehearsalJournalRecoveryForTestOnly(
      coordinatorAuthority,
      structuredClone(locator),
    );
  assert.equal(
    assertCurrent180Current190PostgresqlRehearsalJournalRecoveryReceiptForTestOnly(
      recovery,
    ),
    recovery,
  );
  assert.equal(recovery.authorization.executionAuthority, false);
  const cleanup =
    await cleanupCurrent180Current190PostgresqlRehearsalJournalAfterRestartForTestOnly(
      recovery,
    );
  assert.equal(cleanup.rootAbsent, true);
  await assert.rejects(lstat(journal.rootPath), { code: "ENOENT" });
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("restart cleanup rehydrates an empty signed root after a lost file-unlink response", async () => {
  const beforeRoots = await ownedRoots();
  const { coordinatorAuthority, journal } = await createBoundJournal();
  const locator = structuredClone(journal.verificationLocator);
  const firstRecovery =
    await rehydrateCurrent180Current190PostgresqlRehearsalJournalRecoveryForTestOnly(
      coordinatorAuthority,
      locator,
    );
  await expectJournalError(
    cleanupCurrent180Current190PostgresqlRehearsalJournalAfterRestartForTestOnly(
      firstRecovery,
      { fault: "AFTER_DURABLE_FILE_REMOVAL" },
    ),
    "REHEARSAL_JOURNAL_RECOVERY_CLEANUP_INCOMPLETE",
    "REHEARSAL_JOURNAL_CLEANUP_RESPONSE_LOST",
  );
  await assert.rejects(lstat(journal.journalPath), { code: "ENOENT" });
  assert.equal((await readdir(journal.rootPath)).length, 0);

  const restartedRecovery =
    await rehydrateCurrent180Current190PostgresqlRehearsalJournalRecoveryForTestOnly(
      coordinatorAuthority,
      structuredClone(locator),
    );
  assert.equal(
    restartedRecovery.cleanupStage,
    "JOURNAL_FILE_REMOVED_ROOT_PRESENT",
  );
  const cleanup =
    await cleanupCurrent180Current190PostgresqlRehearsalJournalAfterRestartForTestOnly(
      restartedRecovery,
    );
  assert.equal(cleanup.rootAbsent, true);
  assert.equal(cleanup.reconciledPriorRemoval, true);
  await assert.rejects(lstat(journal.rootPath), { code: "ENOENT" });
  assertSameSet(await ownedRoots(), beforeRoots);
});

test("implementation statically excludes automatic execution, network, database and recursive deletion", async () => {
  const source = await readFile(
    join(
      SCRIPT_DIRECTORY,
      "current180-current190-disposable-postgresql-rehearsal-journal.mjs",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /node:child_process/u);
  assert.doesNotMatch(source, /node:(?:net|http|https|tls|dgram)/u);
  assert.doesNotMatch(
    source,
    /from\s+["'](?:@prisma\/client|pg|postgres|postgresql)["']/u,
  );
  assert.doesNotMatch(source, /\bexec(?:File)?\s*\(|\bspawn\s*\(/u);
  assert.doesNotMatch(source, /\brmSync\s*\(|\brm\s*\(/u);
  assert.doesNotMatch(source, /recursive\s*:\s*true/u);
  assert.doesNotMatch(source, /^await\s+/mu);
  assert.match(source, /generateKeyPairSync\("ed25519"\)/u);
  assert.match(source, /await fileHandle\.sync\(\)/u);
  assert.match(source, /await handle\.sync\(\)/u);
  assert.match(source, /hostileLocalActorToctouEliminated: false/u);
  assert.match(source, /privateKeyIsMemoryOnly: true/u);
  assert.doesNotMatch(source, /exportPrivate|pkcs8/u);
});

test("test helpers do not leave unrelated OS-temp residue", async () => {
  const beforeRoots = await ownedRoots();
  const externalRoot = await mkdtemp(
    join(await realpath(tmpdir()), "lp-journal-test-"),
  );
  await rmdir(externalRoot);
  assertSameSet(await ownedRoots(), beforeRoots);
});
