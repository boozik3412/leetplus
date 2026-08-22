export const EXPECTED_RUNTIME_RELEASE_OPERATIONAL_SCRIPTS = Object.freeze([
  "packages/database/scripts/current-network-access-scope-classification.cli.mjs",
  "packages/database/scripts/current-network-access-scope-classification.mjs",
  "packages/database/scripts/current-release-restored-copy-runtime-acceptance.cli.mjs",
  "packages/database/scripts/current-release-restored-copy-runtime-acceptance.mjs",
  "packages/database/scripts/founder-pilot-activation-role-deployment.cli.mjs",
  "packages/database/scripts/founder-pilot-activation-role-deployment.mjs",
  "packages/database/scripts/founder-pilot-activation-role-network-acceptance.cli.mjs",
  "packages/database/scripts/founder-pilot-activation-role-network-acceptance.mjs",
  "packages/database/scripts/founder-pilot-mail-tenant-enrollment.cli.mjs",
  "packages/database/scripts/founder-pilot-mail-tenant-enrollment.mjs",
  "packages/database/scripts/founder-pilot-production-history-production.cli.mjs",
  "packages/database/scripts/founder-pilot-production-history-production.mjs",
  "packages/database/scripts/founder-pilot-production-history-rehearsal.cli.mjs",
  "packages/database/scripts/founder-pilot-production-history-rehearsal.mjs",
  "packages/database/scripts/founder-pilot-restored-copy-preflight.cli.mjs",
  "packages/database/scripts/founder-pilot-restored-copy-preflight.mjs",
  "packages/database/scripts/identity-mail-worker-enrollment.cli.mjs",
  "packages/database/scripts/identity-mail-worker-enrollment.mjs",
  "packages/database/scripts/run-current-release-restored-copy-acceptance.sh",
  "packages/database/scripts/runtime-function-enrollment.cli.mjs",
  "packages/database/scripts/runtime-function-enrollment.mjs",
  "packages/database/scripts/shared-beta-admission-provenance-catalog.mjs",
  "packages/database/scripts/staff-task-integrity-migration-state.mjs",
]);

export const EXPECTED_RUNTIME_RELEASE_NODE_VERSION = "22";
export const EXPECTED_RUNTIME_RELEASE_PNPM_VERSION = "10.33.2";

export function buildExpectedRuntimeReleaseProvenance({
  databaseMigration,
  databaseMigrationCount,
  releaseSha,
}) {
  return {
    currentNetworkAccessScopeClassificationScriptCount: 2,
    currentNetworkAccessScopeClassificationScriptsIncluded: true,
    currentReleaseRuntimeAcceptanceScriptCount: 3,
    currentReleaseRuntimeAcceptanceScriptsIncluded: true,
    databaseMigration,
    databaseMigrationCount,
    founderPilotOperationalScriptCount: 12,
    founderPilotOperationalScriptsIncluded: true,
    nodeVersion: EXPECTED_RUNTIME_RELEASE_NODE_VERSION,
    operationalScriptCount:
      EXPECTED_RUNTIME_RELEASE_OPERATIONAL_SCRIPTS.length,
    pnpmVersion: EXPECTED_RUNTIME_RELEASE_PNPM_VERSION,
    releaseSha,
    runtimeEnrollmentOperationalScriptCount: 6,
    runtimeEnrollmentOperationalScriptsIncluded: true,
    runtimePackageManifestsIncluded: true,
    webPublicAssetsIncluded: true,
  };
}
