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
for target in api web; do
  docker build --platform linux/amd64 --file deploy/leetplus-compose/Dockerfile \
    --target "$target" --build-arg "RELEASE_SHA=$sha" --build-arg "BUILD_TIME=$build_time" \
    --tag "leetplus-$target:$sha" .
done
docker build --platform linux/amd64 --file deploy/leetplus-compose/Postgres.Dockerfile --tag "leetplus-postgres:$sha" .
redis=$(node -p 'JSON.parse(require("fs").readFileSync("deploy/leetplus-compose/base-images.json")).redis')
docker pull --platform linux/amd64 "$redis"
api_id=$(docker image inspect --format '{{.Id}}' "leetplus-api:$sha")
web_id=$(docker image inspect --format '{{.Id}}' "leetplus-web:$sha")
pg_id=$(docker image inspect --format '{{.Id}}' "leetplus-postgres:$sha")
redis_id=$(docker image inspect --format '{{.Id}}' "$redis")
docker run --rm --network none --entrypoint node "$api_id" -e 'const m=require("/app/release.json");if(m.migrationCount!==191)process.exit(1);console.log(JSON.stringify(m))' > "$output/image-release.json"
node --input-type=module - "$output" "$api_id" "$web_id" "$pg_id" "$redis_id" <<'NODE'
import fs from 'node:fs';
import { canonical, release, renderCompose } from './deploy/leetplus-compose/contract.mjs';
const [output, api, web, postgres, redis] = process.argv.slice(2);
const result = release({ ...JSON.parse(fs.readFileSync(`${output}/image-release.json`)), images: { api, web, postgres, redis } });
fs.writeFileSync(`${output}/release.json`, canonical(result), { flag: 'wx' });
fs.writeFileSync(`${output}/compose.rehearsal.json`, canonical(renderCompose({ blue: result, green: result, rehearsal: true })), { flag: 'wx' });
NODE
docker compose --file "$output/compose.rehearsal.json" config --quiet
docker run --rm --network none --entrypoint /usr/lib/postgresql/16/bin/postgres "$pg_id" --version
docker run --rm --network none --entrypoint /usr/bin/locale "$pg_id" -a | grep -F en_US.utf8
docker save "$api_id" "$web_id" "$pg_id" "$redis_id" | gzip -1 > "$output/images.tar.gz"
git archive --format=tar.gz --output="$output/control.tar.gz" "$sha" deploy/leetplus-compose
(
  cd "$output"
  sha256sum images.tar.gz release.json control.tar.gz compose.rehearsal.json > SHA256SUMS
  sha256sum --check --strict SHA256SUMS
)
