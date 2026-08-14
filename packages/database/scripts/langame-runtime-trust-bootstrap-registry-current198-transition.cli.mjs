import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parsePinnedLangameRuntimeTrustBootstrapRegistryCurrent198,
  validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198,
} from "./langame-runtime-trust-bootstrap-registry-current198-contract.mjs";
import { PINNED_LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198 } from "./langame-runtime-trust-bootstrap-registry-current198.mjs";
import {
  LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_MAX_SKEW_MS,
  verifyPersistedLangameRuntimeTrustBootstrapCeremonyCurrent201,
} from "./langame-runtime-trust-bootstrap-ceremony-current201.mjs";
import {
  LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_CONTRACT,
  verifyPersistedLangameRuntimeTrustFounderPilotCurrent202,
} from "./langame-runtime-trust-founder-pilot-current202.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_TRANSITION_CONFIRMATION =
  "verify-langame-current198-bootstrap-root-transition";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const REGISTRY_MODULE_PATH =
  "packages/database/scripts/langame-runtime-trust-bootstrap-registry-current198.mjs";
const TWO_PERSON_REVIEW_EVIDENCE_PATH =
  "packages/database/trust-evidence/langame-current198-bootstrap-review-current201.json";
const LEGACY_FOUNDER_PILOT_V1_EVIDENCE_PATH =
  "packages/database/trust-evidence/langame-current198-bootstrap-founder-current202.json";
const FOUNDER_GLOBAL_PLATFORM_EVIDENCE_PATH =
  "packages/database/trust-evidence/langame-current198-bootstrap-founder-global-current202.json";
const REVIEW_EVIDENCE_PATHS = Object.freeze([
  TWO_PERSON_REVIEW_EVIDENCE_PATH,
  LEGACY_FOUNDER_PILOT_V1_EVIDENCE_PATH,
  FOUNDER_GLOBAL_PLATFORM_EVIDENCE_PATH,
]);
const MAX_SOURCE_BYTES = 128 * 1024;
const MAX_REVIEW_EVIDENCE_BYTES = 256 * 1024;
const REGISTRY_LITERAL_PATTERN =
  /export const LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_CANONICAL_JSON\s*=\s*("(?:[^"\\]|\\.)*");/gu;

class TransitionError extends Error {
  constructor(code, exitCode = 3) {
    super("CURRENT198 bootstrap-root transition evidence was rejected.");
    this.name = "LangameRuntimeTrustBootstrapRegistryCurrent198TransitionError";
    this.code = code;
    this.exitCode = exitCode;
    this.safeContractError = true;
  }
}

function fail(code, exitCode) {
  throw new TransitionError(code, exitCode);
}

export function extractLangameRuntimeTrustBootstrapRegistryCurrent198FromSource(
  sourceValue,
) {
  const bytes = Buffer.isBuffer(sourceValue)
    ? Buffer.from(sourceValue)
    : Buffer.from(String(sourceValue ?? ""), "utf8");
  if (bytes.length < 1 || bytes.length > MAX_SOURCE_BYTES) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_MODULE_SOURCE_INVALID");
  }
  const source = bytes.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(bytes) || source.includes("\0")) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_MODULE_SOURCE_INVALID");
  }
  const matches = [...source.matchAll(REGISTRY_LITERAL_PATTERN)];
  if (matches.length !== 1) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_LITERAL_MISSING");
  }
  let canonicalJson;
  try {
    canonicalJson = JSON.parse(matches[0][1]);
  } catch {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_LITERAL_INVALID");
  }
  return parsePinnedLangameRuntimeTrustBootstrapRegistryCurrent198(
    canonicalJson,
  );
}

function runGit(args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: REPOSITORY_ROOT,
      encoding: Object.hasOwn(options, "encoding") ? options.encoding : "utf8",
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
      windowsHide: true,
    });
  } catch {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_GIT_EVIDENCE_UNAVAILABLE", 1);
  }
}

export function loadParentLangameRuntimeTrustBootstrapRegistryCurrent198(
  parentSha,
  git = runGit,
) {
  try {
    git(["cat-file", "-e", `${parentSha}^{commit}`]);
    const entry = git(
      ["ls-tree", "-z", "--full-tree", parentSha, "--", REGISTRY_MODULE_PATH],
      { encoding: null },
    );
    if (entry.length === 0) return Object.freeze({});
    const suffix = Buffer.from(`\t${REGISTRY_MODULE_PATH}\0`, "utf8");
    if (
      !Buffer.isBuffer(entry) ||
      !entry.subarray(-suffix.length).equals(suffix) ||
      !/^[0-7]{6} blob [a-f0-9]{40}$/u.test(
        entry.subarray(0, -suffix.length).toString("ascii"),
      )
    ) {
      fail("CURRENT198_BOOTSTRAP_REGISTRY_GIT_EVIDENCE_INVALID", 1);
    }
    return extractLangameRuntimeTrustBootstrapRegistryCurrent198FromSource(
      git(["show", `${parentSha}:${REGISTRY_MODULE_PATH}`], {
        encoding: null,
        maxBuffer: MAX_SOURCE_BYTES + 1,
      }),
    );
  } catch (error) {
    if (error?.safeContractError) throw error;
    fail("CURRENT198_BOOTSTRAP_REGISTRY_GIT_EVIDENCE_UNAVAILABLE", 1);
  }
}

export function verifyReviewedLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
  previousRegistry,
  nextRegistry,
  reviewEvidence,
  now,
) {
  if (arguments.length !== 3 && arguments.length !== 4) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_ARGUMENTS_INVALID");
  }
  validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
    previousRegistry,
    nextRegistry,
  );
  if (
    canonicalStringify(previousRegistry) === canonicalStringify(nextRegistry)
  ) {
    return null;
  }
  if (reviewEvidence === null || reviewEvidence === undefined) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_REQUIRED");
  }
  let verified;
  try {
    verified = verifyPersistedLangameRuntimeTrustBootstrapCeremonyCurrent201(
      reviewEvidence,
      previousRegistry,
    );
  } catch {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_INVALID");
  }
  if (verified.candidateCanonicalJson !== canonicalStringify(nextRegistry)) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_INVALID");
  }
  const observedAtIso = arguments.length === 4 ? now : new Date().toISOString();
  const observedAt = Date.parse(observedAtIso);
  const createdAt = Date.parse(verified.createdAt);
  const expiresAt = Date.parse(verified.expiresAt);
  if (
    !Number.isFinite(observedAt) ||
    new Date(observedAt).toISOString() !== observedAtIso ||
    observedAt <
      createdAt -
        LANGAME_RUNTIME_TRUST_BOOTSTRAP_CEREMONY_CURRENT201_MAX_SKEW_MS ||
    observedAt >= expiresAt
  ) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_EXPIRED");
  }
  return verified;
}

export function verifyFounderGlobalPlatformLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
  previousRegistry,
  nextRegistry,
  founderEvidence,
  now,
) {
  if (arguments.length !== 3 && arguments.length !== 4) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_ARGUMENTS_INVALID");
  }
  validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
    previousRegistry,
    nextRegistry,
  );
  if (
    canonicalStringify(previousRegistry) === canonicalStringify(nextRegistry)
  ) {
    return null;
  }
  if (founderEvidence === null || founderEvidence === undefined) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_REQUIRED");
  }
  let verified;
  try {
    verified = verifyPersistedLangameRuntimeTrustFounderPilotCurrent202(
      founderEvidence,
      previousRegistry,
    );
  } catch {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_INVALID");
  }
  if (
    verified.contract !==
      LANGAME_RUNTIME_TRUST_FOUNDER_PILOT_CURRENT202_CONTRACT ||
    verified.candidateCanonicalJson !== canonicalStringify(nextRegistry)
  ) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_INVALID");
  }
  const observedAtIso = arguments.length === 4 ? now : new Date().toISOString();
  const observedAt = Date.parse(observedAtIso);
  const eligibleAt = Date.parse(verified.eligibleAt);
  const expiresAt = Date.parse(verified.expiresAt);
  if (
    !Number.isFinite(observedAt) ||
    new Date(observedAt).toISOString() !== observedAtIso ||
    observedAt < eligibleAt ||
    observedAt >= expiresAt
  ) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_EXPIRED");
  }
  return verified;
}

function trackedReviewEvidencePath() {
  const tracked = [];
  for (const evidencePath of REVIEW_EVIDENCE_PATHS) {
    const entry = runGit(
      ["ls-tree", "-z", "--full-tree", "HEAD", "--", evidencePath],
      { encoding: null },
    );
    if (entry.length === 0) continue;
    const suffix = Buffer.from(`\t${evidencePath}\0`, "utf8");
    if (
      !Buffer.isBuffer(entry) ||
      !entry.subarray(-suffix.length).equals(suffix) ||
      !/^[0-7]{6} blob [a-f0-9]{40}$/u.test(
        entry.subarray(0, -suffix.length).toString("ascii"),
      )
    ) {
      fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_INVALID", 1);
    }
    tracked.push(evidencePath);
  }
  if (tracked.length !== 1) {
    fail(
      tracked.length === 0
        ? "CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_UNAVAILABLE"
        : "CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_AMBIGUOUS",
      1,
    );
  }
  return tracked[0];
}

function loadTrackedReviewEvidence() {
  const reviewEvidencePath = trackedReviewEvidencePath();
  const evidencePath = path.join(REPOSITORY_ROOT, reviewEvidencePath);
  let worktree;
  try {
    worktree = readFileSync(evidencePath);
  } catch {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_UNAVAILABLE", 1);
  }
  if (
    worktree.length < 2 ||
    worktree.length > MAX_REVIEW_EVIDENCE_BYTES ||
    worktree.includes(0)
  ) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_INVALID");
  }
  const head = runGit(["show", `HEAD:${reviewEvidencePath}`], {
    encoding: null,
    maxBuffer: MAX_REVIEW_EVIDENCE_BYTES + 1,
  });
  if (!Buffer.from(head).equals(worktree)) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_HEAD_MISMATCH");
  }
  if (
    String(
      runGit([
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        reviewEvidencePath,
      ]),
    ).trim()
  ) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_WORKTREE_DIRTY");
  }
  const source = worktree.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(worktree)) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_INVALID");
  }
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_INVALID");
  }
  if (`${canonicalStringify(parsed)}\n` !== source) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_EVIDENCE_INVALID");
  }
  return Object.freeze({
    evidence: parsed,
    evidencePath: reviewEvidencePath,
  });
}

export function verifyLangameRuntimeTrustBootstrapRegistryCurrent198Transition() {
  const modulePath = path.join(REPOSITORY_ROOT, REGISTRY_MODULE_PATH);
  const worktree = readFileSync(modulePath);
  const current =
    extractLangameRuntimeTrustBootstrapRegistryCurrent198FromSource(worktree);
  if (
    canonicalStringify(current) !==
    canonicalStringify(
      PINNED_LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198,
    )
  ) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_RUNTIME_MISMATCH");
  }
  const head = runGit(["show", `HEAD:${REGISTRY_MODULE_PATH}`], {
    encoding: null,
    maxBuffer: MAX_SOURCE_BYTES + 1,
  });
  if (!Buffer.from(head).equals(worktree)) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_HEAD_MISMATCH");
  }
  if (
    String(
      runGit([
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        REGISTRY_MODULE_PATH,
      ]),
    ).trim()
  ) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_WORKTREE_DIRTY");
  }
  const revision = String(runGit(["rev-list", "--parents", "-n", "1", "HEAD"]))
    .trim()
    .split(/\s+/u);
  const parents = revision.slice(1);
  const changedParents = [];
  for (const parent of parents) {
    const previous =
      loadParentLangameRuntimeTrustBootstrapRegistryCurrent198(parent);
    validateLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
      previous,
      current,
    );
    if (canonicalStringify(previous) !== canonicalStringify(current)) {
      changedParents.push(previous);
    }
  }
  let reviewEvidenceDigest = null;
  let reviewMode = null;
  if (changedParents.length > 0) {
    const previousCanonical = canonicalStringify(changedParents[0]);
    if (
      changedParents.some(
        (previous) => canonicalStringify(previous) !== previousCanonical,
      )
    ) {
      fail("CURRENT198_BOOTSTRAP_REGISTRY_REVIEW_PARENT_AMBIGUOUS");
    }
    const loaded = loadTrackedReviewEvidence();
    const verified =
      loaded.evidencePath === TWO_PERSON_REVIEW_EVIDENCE_PATH
        ? verifyReviewedLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
            changedParents[0],
            current,
            loaded.evidence,
          )
        : verifyFounderGlobalPlatformLangameRuntimeTrustBootstrapRegistryTransitionCurrent198(
            changedParents[0],
            current,
            loaded.evidence,
          );
    reviewEvidenceDigest = verified.reviewEvidenceDigest;
    reviewMode =
      loaded.evidencePath === TWO_PERSON_REVIEW_EVIDENCE_PATH
        ? "TWO_PERSON_CURRENT201"
        : "FOUNDER_GLOBAL_PLATFORM_CURRENT202_V2";
  }
  return Object.freeze({
    parentsChecked: parents.length,
    reviewEvidenceDigest,
    reviewMode,
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length !== 3 ||
    args[0] !== "--check-parent" ||
    args[1] !== "--confirm" ||
    args[2] !==
      LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_TRANSITION_CONFIRMATION
  ) {
    fail("CURRENT198_BOOTSTRAP_REGISTRY_CONFIRMATION_REQUIRED");
  }
  const result =
    verifyLangameRuntimeTrustBootstrapRegistryCurrent198Transition();
  process.stdout.write(
    `${canonicalStringify({
      parentsChecked: result.parentsChecked,
      reviewEvidenceDigest: result.reviewEvidenceDigest,
      reviewMode: result.reviewMode,
      status: "PASS",
    })}\n`,
  );
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${canonicalStringify({
        code: String(error?.code ?? "CURRENT198_BOOTSTRAP_REGISTRY_REJECTED"),
        status: "REJECTED",
      })}\n`,
    );
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  });
}
