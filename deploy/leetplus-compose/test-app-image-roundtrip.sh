#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]]
output=$(realpath -- "$1")
root=$(mktemp -d "${RUNNER_TEMP:?}/leetplus-roundtrip.XXXXXX")
socket="unix://$root/docker.sock"
printf '%s\n' '{"features":{"containerd-snapshotter":true}}' > "$root/daemon.json"
dockerd_bin=$(command -v dockerd)
docker_bin=$(command -v docker)
sudo env PATH="$PATH" "$dockerd_bin" --config-file "$root/daemon.json" --data-root "$root/data" --exec-root "$root/exec" \
  --pidfile "$root/docker.pid" --host "$socket" --bridge none --iptables=false --ip6tables=false \
  --ip-forward=false --ip-masq=false > "$root/daemon.log" 2>&1 &
launcher=$!
cleanup() {
  if [[ -s "$root/docker.pid" ]]; then sudo kill -TERM "$(cat "$root/docker.pid")" || true; fi
  wait "$launcher" || true
}
trap cleanup EXIT
ready=false
for attempt in $(seq 1 60); do
  if sudo "$docker_bin" --host "$socket" info > /dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then cat "$root/daemon.log" >&2; exit 1; fi
test "$(sudo "$docker_bin" --host "$socket" version --format '{{.Server.Version}}')" = 29.1.3
sudo "$docker_bin" --host "$socket" image load --input "$output/images.tar.gz"
mapfile -t loaded_tags < <(sudo "$docker_bin" --host "$socket" image ls --all --no-trunc --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep -v '^<none>:<none> ' | LC_ALL=C sort)
mapfile -t wanted_tags < <(node - "$output/release.json" <<'NODE'
const r=JSON.parse(require('fs').readFileSync(process.argv[2]));
if(Object.keys(r.images).sort().join(',')!=='api,web')process.exit(1);
for(const [role,id] of Object.entries(r.images).sort(([a],[b])=>a.localeCompare(b)))console.log(`leetplus-${role}:${r.releaseSha} ${id}`);
NODE
)
if [[ ${#loaded_tags[@]} != 2 || "${loaded_tags[0]}" != "${wanted_tags[0]}" || "${loaded_tags[1]}" != "${wanted_tags[1]}" ]]; then
  printf 'Isolated daemon tag inventory mismatch\nobserved=%s\nexpected=%s\n' "${loaded_tags[*]}" "${wanted_tags[*]}" >&2
  exit 1
fi
node - "$output/release.json" <<'NODE' > "$root/ids"
const r=JSON.parse(require('fs').readFileSync(process.argv[2]));
for(const [role,id] of Object.entries(r.images))console.log(`${role} ${id}`);
NODE
while read -r role id; do
  test "$(sudo "$docker_bin" --host "$socket" image inspect --format '{{.Id}}' "$id")" = "$id"
  name="leetplus-import-test-$role"
  sudo "$docker_bin" --host "$socket" create --name "$name" --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user 12030:12030 --entrypoint /bin/true "$id"
  sudo "$docker_bin" --host "$socket" start --attach "$name"
  test "$(sudo "$docker_bin" --host "$socket" inspect --format '{{.Image}}' "$name")" = "$id"
  test "$(sudo "$docker_bin" --host "$socket" inspect --format '{{.State.ExitCode}}' "$name")" = 0
  sudo "$docker_bin" --host "$socket" rm "$name"
done < "$root/ids"
node - "$output" <<'NODE'
const fs=require('fs'),root=process.argv[2],r=JSON.parse(fs.readFileSync(`${root}/release.json`));
fs.writeFileSync(`${root}/archive-roundtrip.json`,JSON.stringify({decision:'PASS',engine:'29.1.3',store:'containerd',isolatedDaemon:true,images:r.images,loadedImageIds:Object.values(r.images).sort()},null,2)+'\n',{flag:'wx'});
NODE
