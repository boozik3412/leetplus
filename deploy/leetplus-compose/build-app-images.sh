#!/usr/bin/env bash
set -euo pipefail
umask 0027

repo=$(git rev-parse --show-toplevel)
cd "$repo"
[[ ${GITHUB_ACTIONS:-} == true ]]
sha=$(git rev-parse HEAD)
[[ "$sha" =~ ^[a-f0-9]{40}$ ]]
[[ "${CI_RELEASE_SHA:-$sha}" == "$sha" ]]
git diff --quiet
git diff --cached --quiet

output=${1:?pass an empty output directory outside the repository}
impact_receipt=${2:?pass the reverified V1 impact receipt}
app_only_receipt=${3:?pass the verified app-only receipt}
output=$(realpath -m "$output")
impact_receipt=$(realpath -e "$impact_receipt")
app_only_receipt=$(realpath -e "$app_only_receipt")
case "$output/" in "$repo/"*) echo 'Output must be outside checkout' >&2; exit 1;; esac
mkdir -p "$output"
[[ -z $(find "$output" -mindepth 1 -maxdepth 1 -print -quit) ]]

build_time=$(git show -s --format=%cI "$sha" | xargs -I '{}' date -u -d '{}' +%Y-%m-%dT%H:%M:%SZ)
test "$(docker version --format '{{.Server.Version}}')" = 29.1.3
docker info --format '{{json .DriverStatus}}' | grep -F 'io.containerd.snapshotter.v1'

tmp=$(mktemp -d "${RUNNER_TEMP:-/tmp}/leetplus-app-build.XXXXXX")
pg_tag="leetplus-app-fixture-postgres:$sha"
runtime_names=()
cleanup() {
  for name in "${runtime_names[@]}"; do docker rm --force "$name" >/dev/null 2>&1 || true; done
  docker image rm "$pg_tag" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

for target in api web; do
  docker build --platform linux/amd64 --provenance=false --file deploy/leetplus-compose/Dockerfile \
    --target "$target" --build-arg "RELEASE_SHA=$sha" --build-arg "BUILD_TIME=$build_time" \
    --tag "leetplus-$target:$sha" .
done
api_id=$(docker image inspect --format '{{.Id}}' "leetplus-api:$sha")
web_id=$(docker image inspect --format '{{.Id}}' "leetplus-web:$sha")
[[ "$api_id" =~ ^sha256:[a-f0-9]{64}$ && "$web_id" =~ ^sha256:[a-f0-9]{64}$ && "$api_id" != "$web_id" ]]
docker run --rm --network none --entrypoint node "$api_id" -e 'const m=require("/app/release.json");if(m.migrationCount!==191)process.exit(1);console.log(JSON.stringify(m))' > "$tmp/image-release.json"

# PostgreSQL is a disposable certified TLS fixture. It is never saved into the
# app archive or named in the AppBundle.
docker build --platform linux/amd64 --provenance=false --file deploy/leetplus-compose/Postgres.Dockerfile --tag "$pg_tag" .
pg_id=$(docker image inspect --format '{{.Id}}' "$pg_tag")
bash deploy/leetplus-compose/test-prisma-tls.sh "$api_id" "$pg_id" "$output/transport-validation.json"
node --input-type=module - "$output/transport-validation.json" <<'NODE'
import fs from 'node:fs';
import { canonical } from './deploy/leetplus-compose/app-only-artifact.mjs';
const file = process.argv[2];
fs.writeFileSync(file, canonical(JSON.parse(fs.readFileSync(file, 'utf8'))));
NODE

# Exercise both Web slots as their real entrypoint, and create both API slot
# containers with the production hardening before any data baseline exists.
api_created=()
for slot in blue green; do
  if [[ "$slot" == blue ]]; then api_uid=12010; web_uid=12020; port=23100; else api_uid=12011; web_uid=12021; port=23200; fi
  api_name="leetplus-app-api-$slot-${sha:0:12}"
  web_name="leetplus-app-web-$slot-${sha:0:12}"
  runtime_names+=("$api_name" "$web_name")
  docker create --name "$api_name" --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    --user "$api_uid:$api_uid" --entrypoint /bin/true "$api_id" >/dev/null
  test "$(docker inspect --format '{{.Image}}' "$api_name")" = "$api_id"
  api_created+=("$slot")
  docker run --detach --name "$web_name" --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    --user "$web_uid:$web_uid" --tmpfs /tmp:rw,nosuid,nodev,size=134217728,mode=1777 \
    --tmpfs "/app/apps/web/.next/cache:rw,nosuid,nodev,size=134217728,uid=$web_uid,gid=$web_uid" \
    -e "RELEASE_SHA=$sha" -e "WEB_BUILD_ID=$sha" -e "BUILD_TIME=$build_time" \
    -e EXPECTED_DATABASE_MIGRATION=20260908180000_external_langame_simple_onboarding \
    -e EXPECTED_DATABASE_MIGRATION_COUNT=191 -e API_URL=http://127.0.0.1:4000 "$web_id" >/dev/null
  ready=false
  for attempt in $(seq 1 30); do
    if docker exec "$web_name" node /opt/leetplus/health.cjs web >/dev/null; then ready=true; break; fi
    sleep 1
  done
  if [[ "$ready" != true ]]; then docker logs "$web_name"; exit 1; fi
done

# The existing real network matrix is reused with an ephemeral compatibility
# manifest. Data IDs are fixtures only; the produced archive still contains
# exactly API and Web.
node --input-type=module - "$tmp" "$sha" "$build_time" "$api_id" "$web_id" "$pg_id" <<'NODE'
import fs from 'node:fs';
import { canonical } from './deploy/leetplus-compose/contract.mjs';
const [root, releaseSha, builtAt, api, web, postgres] = process.argv.slice(2);
fs.writeFileSync(`${root}/release.json`, canonical({
  contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1', releaseSha, builtAt,
  migrationCount: 191, migration: '20260908180000_external_langame_simple_onboarding',
  apiResourceProfile: 'API_6G_V1', images: { api, web, postgres, redis: api },
}), { flag: 'wx' });
NODE
node deploy/leetplus-compose/test-network-runtime.mjs "$tmp"
cp "$tmp/network-validation.json" "$output/network-validation.json"

git archive --format=tar.gz --output="$output/control.tar.gz" "$sha" deploy/leetplus-compose
control_hash=$(sha256sum "$output/control.tar.gz" | cut -d ' ' -f 1)
node --input-type=module - "$output/runtime-validation.json" "$sha" "$api_id" "$web_id" "$control_hash" <<'NODE'
import fs from 'node:fs';
import { canonical } from './deploy/leetplus-compose/app-only-artifact.mjs';
const [file, releaseSha, api, web, controlArchiveSha256] = process.argv.slice(2);
fs.writeFileSync(file, canonical({
  decision: 'PASS', releaseSha, dualSlotConstructionVerified: true,
  apiBlueCreated: true, apiGreenCreated: true, webBlueReady: true, webGreenReady: true,
  noDataImages: true, controlArchiveSha256, appImages: { api, web },
}), { flag: 'wx' });
NODE

docker save "leetplus-api:$sha" "leetplus-web:$sha" | gzip -1 > "$output/app-images.tar.gz"
ln -s "$output/app-images.tar.gz" "$tmp/images.tar.gz"
node --input-type=module - "$tmp/release.json" "$api_id" "$web_id" <<'NODE'
import fs from 'node:fs';
const [file, api, web] = process.argv.slice(2);
fs.writeFileSync(file, `${JSON.stringify({ images: { api, web } }, null, 2)}\n`);
NODE
bash deploy/leetplus-compose/test-app-image-roundtrip.sh "$tmp"
cp "$tmp/archive-roundtrip.json" "$output/archive-roundtrip.json"

node --input-type=module - "$output" "$impact_receipt" "$app_only_receipt" "$tmp/image-release.json" "$api_id" "$web_id" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  APP_BUNDLE_CONTRACT, CONTROLLER_CAPABILITY, DATA_CONTRACT, RELEASE_LANE,
  canonical, digest, fileDigest, readCanonicalJson, validateAppBundle,
} from './deploy/leetplus-compose/app-only-artifact.mjs';
import { API_RESOURCE_PROFILE } from './deploy/leetplus-compose/contract.mjs';
const [output, impactFile, appOnlyFile, imageReleaseFile, api, web] = process.argv.slice(2);
const impact = readCanonicalJson(impactFile, 'impact receipt');
const appOnly = readCanonicalJson(appOnlyFile, 'app-only receipt');
const imageRelease = JSON.parse(fs.readFileSync(imageReleaseFile, 'utf8'));
const gitBlob = file => execFileSync('git', ['show', `${imageRelease.releaseSha}:${file}`]);
const migrationRoot = 'packages/database/prisma/migrations';
const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', imageRelease.releaseSha, '--', migrationRoot], { encoding: 'utf8' })
  .trim().split('\n').filter(file => file.endsWith('/migration.sql')).sort();
if (paths.length !== imageRelease.migrationCount) throw new Error('Migration source inventory/count mismatch');
const inventory = paths.map(file => ({ migration_name: path.posix.basename(path.posix.dirname(file)), checksum: digest(gitBlob(file)) }));
const bundle = {
  schemaVersion: 2, contract: APP_BUNDLE_CONTRACT, releaseLane: RELEASE_LANE,
  releaseSha: imageRelease.releaseSha, builtAt: imageRelease.builtAt, apiResourceProfile: API_RESOURCE_PROFILE,
  sourceImpact: {
    baseSha: impact.value.baseSha, headSha: impact.value.headSha,
    classifierId: impact.value.classifierId, rulesSha256: impact.value.rulesSha256,
    impactReceiptSha256: digest(impact.raw),
  },
  appImages: { api, web },
  schemaRequirement: {
    migrationCount: imageRelease.migrationCount, migration: imageRelease.migration,
    prismaSchemaSha256: digest(gitBlob('packages/database/prisma/schema.prisma')),
    migrationsInventorySha256: digest(inventory),
  },
  compatibilityRequirements: {
    policySha256: appOnly.value.allowlistSha256,
    composeRuntimeContractSha256: digest(gitBlob('deploy/leetplus-compose/contract.mjs')),
    controllerCapability: CONTROLLER_CAPABILITY, dataContract: DATA_CONTRACT,
  },
  runtimeEvidence: {
    transportValidationSha256: fileDigest(path.join(output, 'transport-validation.json')),
    archiveRoundtripSha256: fileDigest(path.join(output, 'archive-roundtrip.json')),
    networkValidationSha256: fileDigest(path.join(output, 'network-validation.json')),
    runtimeValidationSha256: fileDigest(path.join(output, 'runtime-validation.json')),
  },
};
validateAppBundle(bundle);
fs.writeFileSync(path.join(output, 'app-bundle.json'), canonical(bundle), { flag: 'wx' });
NODE

(
  cd "$output"
  sha256sum app-bundle.json app-images.tar.gz control.tar.gz transport-validation.json archive-roundtrip.json network-validation.json runtime-validation.json > SHA256SUMS
  sha256sum --check --strict SHA256SUMS
)
