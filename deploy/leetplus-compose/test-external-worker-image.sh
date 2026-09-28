#!/usr/bin/env bash
set -euo pipefail
image=${1:?exact API image ID required}
release_sha=${2:?exact release SHA required}
build_time=${3:?exact build time required}
output=${4:?receipt output required}
[[ "$image" =~ ^sha256:[a-f0-9]{64}$ && "$release_sha" =~ ^[a-f0-9]{40}$ ]]
root=$(mktemp -d "${RUNNER_TEMP:-/tmp}/leetplus-external-image.XXXXXX")
cleanup() { sudo rm -f -- "$root/runtime.json"; rm -f -- "$root/stdout" "$root/stderr"; rmdir -- "$root"; }
trap cleanup EXIT
printf '%s\n' '{"LANGAME_EXTERNAL_WORKER_ENABLED":"false"}' > "$root/runtime.json"
sudo chown 0:12042 "$root/runtime.json"
sudo chmod 0440 "$root/runtime.json"
set +e
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --user 12042:12042 --entrypoint node \
  --mount "type=bind,source=$root/runtime.json,target=/run/secrets/runtime.json,readonly" \
  -e "RELEASE_SHA=$release_sha" -e "BUILD_TIME=$build_time" \
  -e EXPECTED_DATABASE_MIGRATION=20260908180000_external_langame_simple_onboarding \
  -e EXPECTED_DATABASE_MIGRATION_COUNT=191 \
  "$image" /opt/leetplus/runtime-entry.cjs langame-external-daily-worker \
  > "$root/stdout" 2> "$root/stderr"
status=$?
set -e
[[ "$status" == 1 && ! -s "$root/stdout" ]]
test "$(cat "$root/stderr")" = 'EXTERNAL_WORKER_DISABLED_PROFILE'
node --input-type=module - "$output" "$image" "$release_sha" <<'NODE'
import fs from 'node:fs';
const [output, apiImage, releaseSha] = process.argv.slice(2);
fs.writeFileSync(output, `${JSON.stringify({ contract: 'LEETPLUS_EXTERNAL_WORKER_IMAGE_VALIDATION_V1',
  decision: 'PASS', apiImage, releaseSha, uid: 12042,
  realRuntimeEntrypoint: true, disabledProfileRejectedBeforeNest: true,
  stdoutEmpty: true, networkNone: true, noProviderEffect: true }, null, 2)}\n`, { flag: 'wx' });
NODE
rm -f -- "$root/stdout" "$root/stderr"
