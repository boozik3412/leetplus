#!/usr/bin/env bash
#
# Move one completed isolated hydration into a root-only promotion boundary,
# seal it, then atomically publish the sealed directory under releases/<SHA>.
# This script never changes a slot, database, nginx or application runtime. It
# does stop the completed one-shot hydration unit before taking its tree.

set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly RELEASE_SHA_PATTERN='^[0-9a-f]{40}$'
readonly SLOT_PATTERN='^(blue|green)$'

die() {
  printf 'promote-release-artifact: %s\n' "$*" >&2
  exit 1
}

release_sha=''
slot=''
while (($# > 0)); do
  case "$1" in
    --release-sha) release_sha="${2:-}"; shift 2 ;;
    --slot) slot="${2:-}"; shift 2 ;;
    --help|-h) printf 'Usage: promote-release-artifact.sh --release-sha <sha> --slot blue|green\n'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

((EUID == 0)) || die 'production promotion must run as root'
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
export PATH
[[ "$release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'release SHA must be 40 lowercase hexadecimal characters'
[[ "$slot" =~ $SLOT_PATTERN ]] || die 'slot must be blue or green'
for command_name in awk chmod chown dirname find flock grep mv realpath sha256sum stat sync systemctl timeout; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done

verify_root_executable() {
  local executable_path="$1"
  local ancestor
  [[ -f "$executable_path" && -x "$executable_path" && ! -L "$executable_path" ]] \
    || die 'installed release sealer is absent or unsafe'
  [[ "$(realpath -e -- "$executable_path")" == "$executable_path" ]] \
    || die 'installed release sealer path traverses a symlink'
  [[ "$(stat -c '%u:%g' -- "$executable_path")" == '0:0' \
    && -z "$(find -P "$executable_path" -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die 'installed release sealer must be root:root and non-writable by group/other'

  ancestor="$(dirname -- "$executable_path")"
  while :; do
    [[ -d "$ancestor" && ! -L "$ancestor" \
      && "$(stat -c '%u:%g' -- "$ancestor")" == '0:0' \
      && -z "$(find -P "$ancestor" -maxdepth 0 -perm /022 -print -quit)" ]] \
      || die "release sealer ancestor is not root-controlled: ${ancestor}"
    [[ "$ancestor" == '/' ]] && break
    ancestor="$(dirname -- "$ancestor")"
  done
}

systemd_value() {
  local property="$1"
  local unit="$2"
  timeout --foreground --kill-after=5s 15s \
    systemctl show --property="$property" --value "$unit"
}

assert_empty_hydration_cgroup() {
  local control_group="$1"
  local procs_path="/sys/fs/cgroup${control_group}/cgroup.procs"
  [[ "$control_group" == "/system.slice/leetplus-release-hydrate@${release_sha}.service" ]] \
    || die 'hydration unit cgroup identity is unexpected'
  [[ -f "$procs_path" && ! -L "$procs_path" ]] \
    || die 'hydration unit cgroup process list is unavailable'
  [[ ! -s "$procs_path" ]] || die 'hydration cgroup still contains a process'
}

build_root='/srv/leetplus/release-builds'
promotion_root='/srv/leetplus/release-promotions'
release_root='/srv/leetplus/releases'
sealer='/usr/local/sbin/leetplus-seal-release-artifact'
hydration_lock='/run/leetplus-release/hydration.lock'
for trusted_root in "$build_root" "$promotion_root" "$release_root"; do
  [[ -d "$trusted_root" && ! -L "$trusted_root" ]] || die "required root is absent or unsafe: ${trusted_root}"
done
verify_root_executable "$sealer"
[[ -f "$hydration_lock" && ! -L "$hydration_lock" \
  && "$(stat -c '%U:%G:%a' -- "$hydration_lock")" == 'root:leetplus-build:660' ]] \
  || die 'global hydration/promotion lock must be root:leetplus-build mode 0660'
[[ -d /run/leetplus-release && ! -L /run/leetplus-release \
  && "$(stat -c '%U:%G:%a' -- /run/leetplus-release)" == 'root:leetplus-build:750' ]] \
  || die 'hydration lock parent must be root:leetplus-build mode 0750'
exec 8<> "$hydration_lock"
flock -n 8 || die 'another hydration or promotion operation holds the global lock'
[[ "$(stat -c '%U' -- "$promotion_root")" == 'root' \
  && "$(stat -c '%G' -- "$promotion_root")" == 'leetplus-runtime' \
  && "$(stat -c '%a' -- "$promotion_root")" == '710' ]] \
  || die 'promotion root must be root:leetplus-runtime mode 0710'
[[ "$(stat -c '%U' -- "$release_root")" == 'root' \
  && -z "$(find -P "$release_root" -maxdepth 0 -perm /022 -print -quit)" ]] \
  || die 'release root must be root-owned and non-writable by group/other'
[[ "$(stat -c '%d' -- "$build_root")" == "$(stat -c '%d' -- "$promotion_root")" \
  && "$(stat -c '%d' -- "$promotion_root")" == "$(stat -c '%d' -- "$release_root")" ]] \
  || die 'build, promotion and release roots must share one filesystem for atomic rename'

source_directory="${build_root}/${release_sha}"
promotion_directory="${promotion_root}/${release_sha}"
release_directory="${release_root}/${release_sha}"
[[ -d "$source_directory" && ! -L "$source_directory" ]] || die 'hydrated build directory is absent or unsafe'
[[ "$(stat -c '%U' -- "$source_directory")" == 'leetplus-build' ]] || die 'hydrated build is not owned by leetplus-build'
[[ ! -e "$promotion_directory" && ! -L "$promotion_directory" ]] || die 'promotion directory already exists'
[[ ! -e "$release_directory" && ! -L "$release_directory" ]] || die 'release directory already exists'
[[ -z "$(find -P "$source_directory" -xdev -type f -links +1 -print -quit)" ]] || die 'hydrated build contains multiply-linked files'
[[ -z "$(find -P "$source_directory" -xdev ! -type d ! -type f ! -type l -print -quit)" ]] \
  || die 'hydrated build contains a special filesystem entry'

# Bind promotion to the exact successful no-egress systemd invocation that
# produced the receipt. RemainAfterExit preserves evidence, but the cgroup must
# already be empty; stopping the unit then makes that quiescence durable before
# the builder-owned directory crosses into the protected promotion boundary.
source_receipt="${source_directory}/HYDRATION_SANDBOX_RECEIPT"
[[ -f "$source_receipt" && ! -L "$source_receipt" ]] || die 'isolated hydration receipt is absent'
grep -F -x 'RECORD_VERSION=1' "$source_receipt" >/dev/null || die 'hydration receipt version mismatch'
grep -F -x "RELEASE_SHA=${release_sha}" "$source_receipt" >/dev/null || die 'hydration receipt SHA mismatch'
grep -F -x 'SANDBOX=SYSTEMD_IP_DENY_ANY_V1' "$source_receipt" >/dev/null || die 'hydration receipt sandbox mismatch'
[[ "$(grep -c '^INVOCATION_ID=[0-9a-f]\{32\}$' "$source_receipt")" == '1' ]] \
  || die 'hydration receipt invocation identity is invalid'
hydration_invocation_id="$(awk -F= '$1 == "INVOCATION_ID" { print $2 }' "$source_receipt")"
hydration_unit="leetplus-release-hydrate@${release_sha}.service"
[[ "$(systemd_value ActiveState "$hydration_unit")" == 'active' \
  && "$(systemd_value SubState "$hydration_unit")" == 'exited' \
  && "$(systemd_value Result "$hydration_unit")" == 'success' \
  && "$(systemd_value ExecMainStatus "$hydration_unit")" == '0' \
  && "$(systemd_value InvocationID "$hydration_unit")" == "$hydration_invocation_id" ]] \
  || die 'hydration unit is not the exact successful completed invocation'
hydration_control_group="$(systemd_value ControlGroup "$hydration_unit")"
assert_empty_hydration_cgroup "$hydration_control_group"
timeout --foreground --kill-after=5s 20s systemctl stop "$hydration_unit" \
  || die 'cannot stop completed hydration unit before promotion'
[[ "$(systemd_value ActiveState "$hydration_unit")" == 'inactive' ]] \
  || die 'hydration unit did not become inactive before promotion'
if [[ -e "/sys/fs/cgroup${hydration_control_group}/cgroup.procs" ]]; then
  assert_empty_hydration_cgroup "$hydration_control_group"
fi

# Take the completed tree out of the builder-writable namespace before trusting
# any receipt or manifest. A failed validation deliberately leaves a root-only
# quarantine under release-promotions/<SHA>; it is never returned to the build
# identity and is never published or attached to a slot automatically.
mv -T -- "$source_directory" "$promotion_directory"
chown root:root -- "$promotion_directory"
chmod 0700 -- "$promotion_directory"
sync -d "$build_root"
sync -d "$promotion_root"

receipt="${promotion_directory}/HYDRATION_SANDBOX_RECEIPT"
[[ -f "$receipt" && ! -L "$receipt" ]] || die 'isolated hydration receipt is absent'
grep -F -x 'RECORD_VERSION=1' "$receipt" >/dev/null || die 'hydration receipt version mismatch'
grep -F -x "RELEASE_SHA=${release_sha}" "$receipt" >/dev/null || die 'hydration receipt SHA mismatch'
grep -F -x 'SANDBOX=SYSTEMD_IP_DENY_ANY_V1' "$receipt" >/dev/null || die 'hydration receipt sandbox mismatch'
[[ "$(grep -c '^INVOCATION_ID=[0-9a-f]\{32\}$' "$receipt")" == '1' ]] || die 'hydration receipt invocation identity is invalid'
grep -F -x "INVOCATION_ID=${hydration_invocation_id}" "$receipt" >/dev/null \
  || die 'hydration receipt changed after unit quiescence'
[[ "$(grep -c '^PNPM_STORE_LOCKFILE_SHA256=[0-9a-f]\{64\}$' "$receipt")" == '1' ]] || die 'hydration receipt store identity is invalid'
(
  cd -- "$promotion_directory"
  sha256sum --strict --check --quiet HYDRATED_SHA256SUMS
) || die 'hydrated runtime manifest verification failed before promotion'

"$sealer" \
  --release-sha "$release_sha" \
  --release-root "$promotion_root" \
  --service-user "leetplus-api-${slot}"

mv -T -- "$promotion_directory" "$release_directory"
sync -d "$promotion_root"
sync -d "$release_root"

printf 'PROMOTED_RELEASE_SHA=%s\n' "$release_sha"
printf 'PROMOTED_RELEASE_SLOT=%s\n' "$slot"
printf 'PROMOTED_RELEASE_DIRECTORY=%s\n' "$release_directory"
printf 'PROMOTED_RELEASE_RUNTIME_SWITCHED=false\n'
