#!/usr/bin/env bash
set -euo pipefail
umask 0027
repo=$(git rev-parse --show-toplevel)
cd "$repo"
sha=$(git rev-parse HEAD)
[[ "$sha" =~ ^[a-f0-9]{40}$ ]]
[[ "${CI_RELEASE_SHA:-$sha}" == "$sha" ]]
git diff --quiet
git diff --cached --quiet
output=${1:?pass an empty output directory outside the repository}
output=$(realpath -m "$output")
case "$output/" in "$repo/"*) echo 'Output must be outside checkout' >&2; exit 1;; esac
mkdir -p "$output"
[[ -z $(find "$output" -mindepth 1 -maxdepth 1 -print -quit) ]]
build_time=$(git show -s --format=%cI "$sha" | xargs -I '{}' date -u -d '{}' +%Y-%m-%dT%H:%M:%SZ)
test "$(docker version --format '{{.Server.Version}}')" = 29.1.3
docker info --format '{{json .DriverStatus}}' | grep -F 'io.containerd.snapshotter.v1'
for target in api web; do
  docker build --platform linux/amd64 --provenance=false --file deploy/leetplus-compose/Dockerfile \
    --target "$target" --build-arg "RELEASE_SHA=$sha" --build-arg "BUILD_TIME=$build_time" \
    --tag "leetplus-$target:$sha" .
done
docker build --platform linux/amd64 --provenance=false --file deploy/leetplus-compose/Postgres.Dockerfile --tag "leetplus-postgres:$sha" .
docker build --platform linux/amd64 --provenance=false --file deploy/leetplus-compose/Redis.Dockerfile --build-arg "RELEASE_SHA=$sha" --tag "leetplus-redis:$sha" .
api_id=$(docker image inspect --format '{{.Id}}' "leetplus-api:$sha")
web_id=$(docker image inspect --format '{{.Id}}' "leetplus-web:$sha")
pg_id=$(docker image inspect --format '{{.Id}}' "leetplus-postgres:$sha")
redis_id=$(docker image inspect --format '{{.Id}}' "leetplus-redis:$sha")
docker run --rm --network none --entrypoint node "$api_id" -e 'const m=require("/app/release.json");if(m.migrationCount!==191)process.exit(1);console.log(JSON.stringify(m))' > "$output/image-release.json"
external_worker_capability=''
if git cat-file -e "$sha:apps/api/src/integrations/langame-external-daily-worker.cli.ts" 2>/dev/null; then
  # A source-only CLI is insufficient: the exact admitted API image must carry
  # the dedicated compiled entrypoint before release.json advertises support.
  docker run --rm --network none --entrypoint node "$api_id" -e '
    const fs=require("node:fs");
    const path="/app/apps/api/dist/integrations/langame-external-daily-worker.cli.js";
    const entry=fs.statSync(path);if(!entry.isFile()||entry.size===0)process.exit(1);
  '
  external_worker_capability='LANGAME_EXTERNAL_SET1_V1'
  bash deploy/leetplus-compose/test-external-worker-image.sh "$api_id" "$sha" "$build_time" "$output/external-worker-image-validation.json"
fi
export LEETPLUS_EXTERNAL_WORKER_CAPABILITY="$external_worker_capability"
node --input-type=module - "$output" "$api_id" "$web_id" "$pg_id" "$redis_id" <<'NODE'
import fs from 'node:fs';
import { API_RESOURCE_PROFILE, EXTERNAL_WORKER_CAPABILITY, canonical, release, renderCompose } from './deploy/leetplus-compose/contract.mjs';
const [output, api, web, postgres, redis] = process.argv.slice(2);
const capability = process.env.LEETPLUS_EXTERNAL_WORKER_CAPABILITY;
if (capability && capability !== EXTERNAL_WORKER_CAPABILITY) throw new Error('Unsupported external worker image capability');
const imageRelease = JSON.parse(fs.readFileSync(`${output}/image-release.json`));
if ((imageRelease.externalWorkerCapability ?? '') !== capability) throw new Error('External image/compiled CLI capability drift');
const result = release({ ...imageRelease, apiResourceProfile: API_RESOURCE_PROFILE,
  ...(capability ? { externalWorkerCapability: capability } : {}), images: { api, web, postgres, redis } });
fs.writeFileSync(`${output}/release.json`, canonical(result), { flag: 'wx' });
fs.writeFileSync(`${output}/compose.rehearsal.json`, canonical(renderCompose({ blue: result, green: result, rehearsal: true })), { flag: 'wx' });
NODE
docker compose --file "$output/compose.rehearsal.json" config --quiet
docker run --rm --network none --entrypoint /usr/lib/postgresql/16/bin/postgres "$pg_id" --version
docker run --rm --network none --entrypoint /usr/bin/locale "$pg_id" -a | grep -F en_US.utf8
docker run --rm --network none --read-only --tmpfs /tmp:rw,nosuid,nodev,size=536870912,mode=1777 \
  --entrypoint /bin/bash "$pg_id" -ec '
    export PATH=/usr/lib/postgresql/16/bin:$PATH
    initdb -D /tmp/pg --locale=en_US.UTF-8 --encoding=UTF8 -A trust
    pg_ctl -D /tmp/pg -o "-k /tmp -h 127.0.0.1" -l /tmp/pg.log -w start
    trap "pg_ctl -D /tmp/pg -m fast -w stop" EXIT
    test "$(psql -h /tmp -d postgres -Atc "show server_version_num")" = 160013
    test "$(psql -h /tmp -d postgres -Atc "SELECT datcollate FROM pg_database WHERE datname = current_database()")" = en_US.UTF-8
  '
web_name="leetplus-image-test-${sha:0:12}"
docker run --detach --name "$web_name" --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --user 12020:12020 --tmpfs /tmp:rw,nosuid,nodev,size=134217728,mode=1777 \
  --tmpfs /app/apps/web/.next/cache:rw,nosuid,nodev,size=134217728,uid=12020,gid=12020 \
  -e "RELEASE_SHA=$sha" -e "WEB_BUILD_ID=$sha" -e "BUILD_TIME=$build_time" \
  -e EXPECTED_DATABASE_MIGRATION=20260908180000_external_langame_simple_onboarding \
  -e EXPECTED_DATABASE_MIGRATION_COUNT=191 -e API_URL=http://127.0.0.1:4000 "$web_id"
trap 'docker rm --force "$web_name" >/dev/null' EXIT
ready=false
for attempt in $(seq 1 30); do
  if docker exec "$web_name" node /opt/leetplus/health.cjs web; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then docker logs "$web_name"; exit 1; fi
docker rm --force "$web_name" >/dev/null
trap - EXIT
bash deploy/leetplus-compose/test-prisma-tls.sh "$api_id" "$pg_id" "$output/transport-validation.json"
node deploy/leetplus-compose/test-network-runtime.mjs "$output"
if [[ -n "$external_worker_capability" ]]; then
  node --input-type=module - "$output" <<'NODE'
import fs from 'node:fs';
import { canonical } from './deploy/leetplus-compose/contract.mjs';
const root = process.argv[2];
const network = JSON.parse(fs.readFileSync(`${root}/network-validation.json`));
network.externalWorkerEntrypoint = JSON.parse(fs.readFileSync(`${root}/external-worker-image-validation.json`));
fs.writeFileSync(`${root}/network-validation.json`, canonical(network));
NODE
fi
docker save "leetplus-api:$sha" "leetplus-web:$sha" "leetplus-postgres:$sha" "leetplus-redis:$sha" | gzip -1 > "$output/images.tar.gz"
bash deploy/leetplus-compose/test-image-roundtrip.sh "$output"
git archive --format=tar.gz --output="$output/control.tar.gz" "$sha" deploy/leetplus-compose
(
  cd "$output"
  sha256sum images.tar.gz release.json control.tar.gz compose.rehearsal.json transport-validation.json archive-roundtrip.json network-validation.json > SHA256SUMS
  sha256sum --check --strict SHA256SUMS
)
