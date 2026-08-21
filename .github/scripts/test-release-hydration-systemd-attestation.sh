#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly RELEASE_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly INVOCATION_ID='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly UNIT_SOURCE="${REPOSITORY_ROOT}/docs/deployment/production-artifact/systemd/leetplus-release-hydrate@.service"
readonly STAGER_SOURCE="${REPOSITORY_ROOT}/docs/deployment/production-artifact/stage-release-artifact.sh"
readonly PROMOTER_SOURCE="${REPOSITORY_ROOT}/docs/deployment/production-artifact/promote-release-artifact.sh"
readonly ATTESTOR="${REPOSITORY_ROOT}/docs/deployment/production-artifact/verify-release-hydration-systemd.mjs"
readonly INSTALLED_UNIT='/etc/systemd/system/leetplus-release-hydrate@.service'
readonly INSTALLED_STAGER='/usr/local/libexec/leetplus/stage-release-artifact.sh'
readonly INSTALLED_ATTESTOR='/usr/local/libexec/leetplus/verify-release-hydration-systemd.mjs'
readonly INSTALLED_GENERATION_VERIFIER='/usr/local/libexec/leetplus/verify-installed-production-control-generation.mjs'
readonly INSTALLED_SEALER='/usr/local/sbin/leetplus-seal-release-artifact'
readonly INSTALLED_PROMOTER='/usr/local/sbin/leetplus-promote-release-artifact'
readonly INSTALLED_CONTROL_INSTALLER='/usr/local/sbin/leetplus-install-production-control-v1'
readonly PRODUCTION_CONTROL_RUN_ROOT='/run/leetplus-production-control'
readonly PRODUCTION_CONTROL_INSTALL_LOCK="${PRODUCTION_CONTROL_RUN_ROOT}/install.lock"
readonly PRODUCTION_CONTROL_GENERATION_BASE='/srv/leetplus/production-control-generations'
readonly PRODUCTION_CONTROL_RECEIPT_ROOT='/var/lib/leetplus/deploy-receipts/production-control'
readonly SEALER_SOURCE="${REPOSITORY_ROOT}/docs/deployment/production-artifact/seal-release-artifact.sh"
readonly UNIT="leetplus-release-hydrate@${RELEASE_SHA}.service"
readonly HOSTILE_UNIX_SOCKET='/run/leetplus-release/hydration-hostile.sock'
readonly TEST_ROOT="$(mktemp -d)"
readonly STATIC_PROPERTIES=(
  Id LoadState UnitFileState FragmentPath DropInPaths Type RemainAfterExit
  User Group SupplementaryGroups DynamicUser ExecStartPre ExecStart Environment
  EnvironmentFiles PassEnvironment SetLoginEnvironment UnsetEnvironment
  NoNewPrivileges PrivateTmp PrivateDevices
  ProtectSystem ProtectHome ProtectProc ProcSubset ProtectKernelTunables
  ProtectKernelModules ProtectKernelLogs ProtectControlGroups ProtectClock
  ProtectHostname CapabilityBoundingSet AmbientCapabilities LockPersonality
  RestrictRealtime RestrictSUIDSGID SystemCallArchitectures
  RestrictAddressFamilies IPAddressDeny IPAddressAllow ReadOnlyPaths
  ReadWritePaths InaccessiblePaths MemoryMax MemorySwapMax TasksMax
  CPUQuotaPerSecUSec LimitFSIZE UMask KillMode RootDirectory RootImage
)
readonly MANAGER_ENVIRONMENT_KEYS=(
  NODE_OPTIONS NODE_PATH NODE_V8_COVERAGE NODE_COMPILE_CACHE
  LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES
  HTTP_PROXY http_proxy
)

created_user=false
created_group=false
created_adversarial_group=false
created_adversarial_gid_group=false
created_adversarial_uid_user=false
created_adversarial_primary_user=false
created_libexec_directory=false
created_dropin_directory=false
created_runtime_group=false
created_api_user=false
created_receipt_root=false
created_receipt_parent=false
created_production_control_fixture=false
replaced_system_node=false
original_system_node_present=false
manager_environment_set=false
production_stage_fixture_root=''
created_exact_hydration_fixture=false
live_units=()
active_mounts=()

cleanup() {
  local live_unit mount_index mounted_path recovery_sha
  set +e
  if [[ "$manager_environment_set" == true ]]; then
    systemctl unset-environment "${MANAGER_ENVIRONMENT_KEYS[@]}"
  fi
  for live_unit in "${live_units[@]}"; do
    timeout --foreground --kill-after=2s 8s systemctl stop "$live_unit"
    systemctl reset-failed "$live_unit"
  done
  rm -f -- "$HOSTILE_UNIX_SOCKET"
  for ((mount_index=${#active_mounts[@]} - 1; mount_index >= 0; mount_index -= 1)); do
    mounted_path="${active_mounts[$mount_index]}"
    if [[ "$mounted_path" == /srv/leetplus/* \
      || "$mounted_path" == '/var/lib/leetplus/deploy-receipts' \
      || "$mounted_path" == /var/lib/leetplus/deploy-receipts/* ]]; then
      umount -- "$mounted_path"
    fi
  done
  if [[ "$created_adversarial_primary_user" == true ]]; then
    userdel leetplus-build-primary-adv
  fi
  if [[ "$created_adversarial_gid_group" == true ]]; then
    if getent group leetplus-build-gid-adversarial >/dev/null 2>&1; then
      groupdel --force leetplus-build-gid-adversarial
    fi
  fi
  if [[ "$created_adversarial_uid_user" == true ]]; then
    userdel leetplus-build-uid-adversarial
  fi
  rm -f -- \
    '/etc/systemd/system/leetplus-release-hydrate@.service.d/99-adversarial.conf' \
    "$INSTALLED_UNIT" \
    "$INSTALLED_STAGER" \
    "$INSTALLED_ATTESTOR" \
    "$INSTALLED_GENERATION_VERIFIER" \
    "$INSTALLED_SEALER" \
    "$INSTALLED_PROMOTER" \
    "$INSTALLED_CONTROL_INSTALLER"
  if [[ "$created_dropin_directory" == true ]]; then
    rmdir -- '/etc/systemd/system/leetplus-release-hydrate@.service.d'
  fi
  if [[ "$created_libexec_directory" == true ]]; then
    rmdir -- '/usr/local/libexec/leetplus'
  fi
  if [[ -n "$production_stage_fixture_root" \
    && "$production_stage_fixture_root" == /srv/leetplus-stage-input-fixture-* \
    && -d "$production_stage_fixture_root" \
    && ! -L "$production_stage_fixture_root" ]]; then
    rm -rf -- "$production_stage_fixture_root"
  fi
  if [[ "$created_production_control_fixture" == true ]]; then
    rm -rf -- "$PRODUCTION_CONTROL_GENERATION_BASE"
    rm -f -- "$PRODUCTION_CONTROL_INSTALL_LOCK"
    rmdir -- "$PRODUCTION_CONTROL_RUN_ROOT"
  fi
  if [[ "$created_exact_hydration_fixture" == true ]]; then
    for recovery_sha in \
      "$RELEASE_SHA" \
      1111111111111111111111111111111111111111 \
      2222222222222222222222222222222222222222 \
      3333333333333333333333333333333333333333 \
      4444444444444444444444444444444444444444 \
      5555555555555555555555555555555555555555; do
      rm -f -- \
        "/srv/leetplus/release-inbox/leetplus-release-${recovery_sha}.tar.gz" \
        "/srv/leetplus/release-inbox/leetplus-release-${recovery_sha}.tar.gz.sha256"
    done
    rm -f -- '/run/leetplus-release/hydration.lock'
    for managed_fixture_root in \
      '/srv/leetplus/release-builds' \
      '/srv/leetplus/release-promotions' \
      '/srv/leetplus/releases'; do
      if [[ -d "$managed_fixture_root" && ! -L "$managed_fixture_root" ]]; then
        rm -rf -- "$managed_fixture_root"
      fi
    done
    rmdir -- \
      '/srv/leetplus/release-inbox' \
      '/srv/leetplus/pnpm-store' \
      '/srv/leetplus' \
      '/run/leetplus-release'
  fi
  if [[ "$created_receipt_root" == true \
    && -d '/var/lib/leetplus/deploy-receipts' \
    && ! -L '/var/lib/leetplus/deploy-receipts' ]]; then
    if [[ "$created_production_control_fixture" == true ]]; then
      rm -rf -- "$PRODUCTION_CONTROL_RECEIPT_ROOT"
    fi
    rmdir -- '/var/lib/leetplus/deploy-receipts/mount-probe' 2>/dev/null || true
    rm -f -- /var/lib/leetplus/deploy-receipts/*.receipt \
      /var/lib/leetplus/deploy-receipts/*.new.*
    rmdir -- '/var/lib/leetplus/deploy-receipts'
  fi
  if [[ "$created_receipt_parent" == true \
    && -d '/var/lib/leetplus' && ! -L '/var/lib/leetplus' ]]; then
    rmdir -- '/var/lib/leetplus'
  fi
  if [[ "$replaced_system_node" == true ]]; then
    rm -f -- '/usr/bin/node'
    if [[ "$original_system_node_present" == true ]]; then
      mv -- "${TEST_ROOT}/system-node.original" '/usr/bin/node'
    fi
  fi
  if [[ "$created_api_user" == true ]]; then
    userdel leetplus-api-blue
  fi
  if [[ "$created_runtime_group" == true ]]; then
    groupdel leetplus-runtime
  fi
  systemctl daemon-reload
  if [[ "$created_user" == true ]]; then
    userdel leetplus-build
  fi
  if [[ "$created_adversarial_group" == true ]]; then
    groupdel leetplus-build-adversarial
  fi
  if [[ "$created_group" == true ]]; then
    if getent group leetplus-build >/dev/null 2>&1; then
      groupdel leetplus-build
    fi
  fi
  if [[ "$TEST_ROOT" == /tmp/tmp.* && -d "$TEST_ROOT" && ! -L "$TEST_ROOT" ]]; then
    rm -rf -- "$TEST_ROOT"
  fi
}
trap cleanup EXIT

die() {
  printf 'test-release-hydration-systemd-attestation: %s\n' "$*" >&2
  exit 1
}

[[ "${CI:-}" == 'true' && "${GITHUB_ACTIONS:-}" == 'true' ]] \
  || die 'fixture is restricted to an explicit GitHub Actions CI boundary'
[[ "${HYDRATION_SYSTEMD_ATTESTATION_FIXTURE_CONFIRM:-}" == \
  'run-bounded-root-hydration-systemd-attestation-fixture' ]] \
  || die 'fixture confirmation is absent'
((EUID == 0)) || die 'fixture must run as root on the disposable CI host'
[[ "$(ps -p 1 -o comm= | tr -d ' ')" == 'systemd' ]] \
  || die 'disposable CI host does not expose a real systemd manager'
[[ "$(node -p 'process.versions.node.split(".")[0]')" == '22' ]] \
  || die 'fixture must execute with Node major 22'
for command_name in awk basename cat chmod cmp cp cut env find flock getent gpasswd grep groupadd groupdel head id install ln mkdir mount mv node ps python3 readlink realpath rm rmdir runuser sed sha256sum sleep sort stat sync systemctl systemd-analyze systemd-run tail tar timeout tr umount useradd userdel usermod xargs; do
  command -v "$command_name" >/dev/null 2>&1 || die "missing fixture command: ${command_name}"
done
grep -F 'IFS= read -r live_pid < "$procs_path"' "$PROMOTER_SOURCE" >/dev/null \
  || die 'promoter does not read cgroup.procs content'
if grep -F '[[ ! -s "$procs_path" ]]' "$PROMOTER_SOURCE" >/dev/null; then
  die 'promoter still trusts cgroup.procs metadata size'
fi
grep -F '"$(id -G leetplus-build)" == "$passwd_gid"' "$PROMOTER_SOURCE" >/dev/null \
  || die 'promoter does not attest exact build group membership'
grep -F '"$(id -G leetplus-build)" == "$passwd_gid"' "$STAGER_SOURCE" >/dev/null \
  || die 'stager does not attest exact build group membership'
grep -F -x \
  'ExecStartPre=+/usr/local/libexec/leetplus/stage-release-artifact.sh --release-sha %i --preflight-build-uid-fence' \
  "$UNIT_SOURCE" >/dev/null \
  || die 'hydration unit lacks the exact root build-UID preflight fence'
grep -F -x 'RestrictAddressFamilies=none' "$UNIT_SOURCE" >/dev/null \
  || die 'hydration unit does not deny every socket address family'
for resource_limit in \
  'MemoryMax=4294967296' \
  'MemorySwapMax=0' \
  'TasksMax=256' \
  'CPUQuota=200%' \
  'LimitFSIZE=2147483648'; do
  grep -F -x "$resource_limit" "$UNIT_SOURCE" >/dev/null \
    || die "hydration unit lacks exact resource limit: ${resource_limit}"
done
mapfile -t hydration_fence_lines < <(
  grep -n '^[[:space:]]*assert_build_uid_process_fence current$' "$STAGER_SOURCE" \
    | cut -d: -f1
)
[[ "${#hydration_fence_lines[@]}" == '4' ]] \
  || die 'stager does not contain the four reviewed build-UID process fences'
input_snapshot_line="$(grep -n '^  input_snapshot_directory="$(mktemp ' "$STAGER_SOURCE" | cut -d: -f1)"
hydrated_manifest_line="$(grep -n '^    node - <<'"'"'NODE'"'"' || exit 1$' "$STAGER_SOURCE" | tail -n 1 | cut -d: -f1)"
hydrated_manifest_end_line="$(awk -v start="$hydrated_manifest_line" \
  'NR > start && $0 == "NODE" { print NR; exit }' "$STAGER_SOURCE")"
final_move_line="$(grep -n '^mv -- "$staging_directory" "$release_directory"$' "$STAGER_SOURCE" | cut -d: -f1)"
[[ "$input_snapshot_line" =~ ^[0-9]+$ && "$hydrated_manifest_line" =~ ^[0-9]+$ \
  && "$hydrated_manifest_end_line" =~ ^[0-9]+$ && "$final_move_line" =~ ^[0-9]+$ \
  && "${hydration_fence_lines[0]}" -lt "$input_snapshot_line" \
  && $((input_snapshot_line - hydration_fence_lines[0])) -le 8 \
  && "${hydration_fence_lines[2]}" -gt "$hydrated_manifest_end_line" \
  && $((hydration_fence_lines[2] - hydrated_manifest_end_line)) -le 4 \
  && "${hydration_fence_lines[3]}" -lt "$final_move_line" \
  && $((final_move_line - hydration_fence_lines[3])) -le 3 ]] \
  || die 'stager build-UID process fences are not at the reviewed publication boundaries'
foreign_fence_line="$(grep -n '^  assert_no_build_identity_processes$' "$PROMOTER_SOURCE" | tail -n 1 | cut -d: -f1)"
source_move_line="$(grep -n '^  mv -T -- "$source_directory" "$promotion_directory"$' "$PROMOTER_SOURCE" | cut -d: -f1)"
[[ "$foreign_fence_line" =~ ^[0-9]+$ && "$source_move_line" =~ ^[0-9]+$ \
  && "$foreign_fence_line" -lt "$source_move_line" \
  && $((source_move_line - foreign_fence_line)) -le 8 ]] \
  || die 'promoter does not fence foreign build-UID processes immediately before source publication'
grep -F -x '  publish_promotion_intent' "$PROMOTER_SOURCE" >/dev/null \
  || die 'promoter completed authority does not publish durable intent'
grep -F 'systemctl stop "$hydration_unit"' "$PROMOTER_SOURCE" >/dev/null \
  || die 'promoter does not quiesce the hydration invocation'
capture_authority_line="$(grep -n '^    capture_completed_hydration_authority$' \
  "$PROMOTER_SOURCE" | cut -d: -f1)"
quiesce_line="$(grep -n '^  ensure_hydration_invocation_quiesced$' \
  "$PROMOTER_SOURCE" | head -n 1 | cut -d: -f1)"
[[ "$capture_authority_line" =~ ^[0-9]+$ && "$quiesce_line" =~ ^[0-9]+$ \
  && "$capture_authority_line" -lt "$quiesce_line" \
  && "$quiesce_line" -lt "$source_move_line" ]] \
  || die 'promoter does not publish durable intent before quiesce/move effects'
grep -F 'target == candidate || index(target, candidate "/") == 1' \
  "$PROMOTER_SOURCE" >/dev/null \
  || die 'promoter does not reject candidate exact/nested mountpoints'
grep -F 'index(target, receipts "/") == 1' "$PROMOTER_SOURCE" >/dev/null \
  || die 'promoter does not reject receipt-subtree mountpoints'
grep -F -x 'flock -n 7 || die '\''another production-control install or promotion operation holds the install lock'\''' \
  "$PROMOTER_SOURCE" >/dev/null \
  || die 'promoter does not retain the production-control installer lock'
grep -F -x 'validate_installed_generation_attestation "$installed_generation_stdout"' \
  "$PROMOTER_SOURCE" >/dev/null \
  || die 'promoter does not require installed-generation verification'
install_lock_line="$(grep -n '^exec 7<> "$production_control_install_lock"$' \
  "$PROMOTER_SOURCE" | cut -d: -f1)"
installed_generation_gate_line="$(grep -n \
  '^validate_installed_generation_attestation "$installed_generation_stdout"$' \
  "$PROMOTER_SOURCE" | cut -d: -f1)"
hydration_lock_line="$(grep -n '^exec 8<> "$hydration_lock"$' \
  "$PROMOTER_SOURCE" | cut -d: -f1)"
promotion_state_line="$(grep -n '^state_count=0$' "$PROMOTER_SOURCE" | cut -d: -f1)"
[[ "$install_lock_line" =~ ^[0-9]+$ \
  && "$installed_generation_gate_line" =~ ^[0-9]+$ \
  && "$hydration_lock_line" =~ ^[0-9]+$ \
  && "$promotion_state_line" =~ ^[0-9]+$ \
  && "$install_lock_line" -lt "$installed_generation_gate_line" \
  && "$installed_generation_gate_line" -lt "$hydration_lock_line" \
  && "$hydration_lock_line" -lt "$promotion_state_line" ]] \
  || die 'promoter install-lock, installed-generation, hydration-lock and state ordering drifted'
[[ ! -e "$INSTALLED_UNIT" && ! -L "$INSTALLED_UNIT" ]] \
  || die 'fixture refuses to replace a pre-existing hydration unit'
[[ ! -e "$INSTALLED_STAGER" && ! -L "$INSTALLED_STAGER" ]] \
  || die 'fixture refuses to replace a pre-existing installed stager'
for installed_recovery_authority in \
  "$INSTALLED_ATTESTOR" "$INSTALLED_GENERATION_VERIFIER" \
  "$INSTALLED_SEALER" "$INSTALLED_PROMOTER" "$INSTALLED_CONTROL_INSTALLER"; do
  [[ ! -e "$installed_recovery_authority" && ! -L "$installed_recovery_authority" ]] \
    || die "fixture refuses to replace installed recovery authority: ${installed_recovery_authority}"
done
[[ ! -e '/etc/systemd/system/leetplus-release-hydrate@.service.d' ]] \
  || die 'fixture refuses to reuse a pre-existing hydration drop-in directory'
[[ ! -e '/srv/leetplus' && ! -L '/srv/leetplus' \
  && ! -e '/run/leetplus-release' && ! -L '/run/leetplus-release' \
  && ! -e "$PRODUCTION_CONTROL_RUN_ROOT" && ! -L "$PRODUCTION_CONTROL_RUN_ROOT" \
  && ! -e '/var/lib/leetplus/deploy-receipts' \
  && ! -L '/var/lib/leetplus/deploy-receipts' ]] \
  || die 'fixture refuses to reuse the production hydration path namespace'
[[ -z "$(getent passwd leetplus-build)" \
  && -z "$(getent passwd leetplus-build-uid-adversarial)" \
    && -z "$(getent passwd leetplus-build-primary-adv)" \
    && -z "$(getent group leetplus-build)" \
    && -z "$(getent group leetplus-build-adversarial)" \
    && -z "$(getent group leetplus-build-gid-adversarial)" \
    && -z "$(getent passwd leetplus-api-blue)" \
    && -z "$(getent group leetplus-runtime)" ]] \
  || die 'fixture requires fresh leetplus-build NSS identities on the disposable host'

if ! getent group leetplus-build >/dev/null; then
  groupadd --system leetplus-build
  created_group=true
fi
if ! getent passwd leetplus-build >/dev/null; then
  useradd --system --no-create-home --home-dir "$TEST_ROOT/no-build-home" --shell /usr/sbin/nologin \
    --gid leetplus-build leetplus-build
  created_user=true
fi

assert_fixture_exact_build_identity() {
  local passwd_record group_record
  local foreign_gid_group foreign_primary_identity foreign_uid_identity
  local passwd_name passwd_secret passwd_uid passwd_gid passwd_gecos passwd_home passwd_shell
  local group_name group_secret group_gid group_members
  [[ "$(getent passwd leetplus-build | awk 'END { print NR }')" == '1' ]] || return 1
  passwd_record="$(getent passwd leetplus-build)"
  IFS=: read -r passwd_name passwd_secret passwd_uid passwd_gid passwd_gecos passwd_home passwd_shell \
    <<< "$passwd_record"
  [[ "$passwd_name" == 'leetplus-build' && "$passwd_uid" =~ ^[1-9][0-9]*$ \
    && "$passwd_gid" =~ ^[1-9][0-9]*$ && "$passwd_shell" == '/usr/sbin/nologin' \
    && "$passwd_home" == /* && "$passwd_home" != '/' \
    && ! -e "$passwd_home" && ! -L "$passwd_home" ]] || return 1
  [[ "$(getent group leetplus-build | awk 'END { print NR }')" == '1' ]] || return 1
  group_record="$(getent group leetplus-build)"
  IFS=: read -r group_name group_secret group_gid group_members <<< "$group_record"
  [[ "$group_name" == 'leetplus-build' && "$group_gid" == "$passwd_gid" \
    && -z "$group_members" && "$(id -G leetplus-build)" == "$passwd_gid" \
    && "$(id -nG leetplus-build)" == 'leetplus-build' ]] || return 1
  foreign_uid_identity="$(getent passwd | awk -F: -v uid="$passwd_uid" \
    '$3 == uid && $1 != "leetplus-build" { print $1; exit }')"
  [[ -z "$foreign_uid_identity" ]] || return 1
  foreign_primary_identity="$(getent passwd | awk -F: -v gid="$passwd_gid" \
    '$4 == gid && $1 != "leetplus-build" { print $1; exit }')"
  [[ -z "$foreign_primary_identity" ]] || return 1
  foreign_gid_group="$(getent group | awk -F: -v gid="$passwd_gid" \
    '$3 == gid && $1 != "leetplus-build" { print $1; exit }')"
  [[ -z "$foreign_gid_group" ]] || return 1
}

assert_fixture_no_build_identity_processes() {
  local build_uid proc_path uid_fields uid_field
  local real_uid effective_uid saved_uid filesystem_uid
  build_uid="$(id -u leetplus-build)"
  for proc_path in /proc/[0-9]*; do
    [[ -d "$proc_path" && ! -L "$proc_path" ]] || continue
    if ! uid_fields="$(awk '$1 == "Uid:" { print $2, $3, $4, $5; found=1; exit } END { if (!found) exit 91 }' \
      "$proc_path/status" 2>/dev/null)"; then
      [[ ! -e "$proc_path" ]] && continue
      return 92
    fi
    IFS=' ' read -r real_uid effective_uid saved_uid filesystem_uid <<< "$uid_fields"
    for uid_field in "$real_uid" "$effective_uid" "$saved_uid" "$filesystem_uid"; do
      [[ "$uid_field" == "$build_uid" ]] && return 1
    done
  done
  return 0
}

assert_fixture_exact_build_identity \
  || die 'canonical leetplus-build NSS identity was rejected'
groupadd --system leetplus-build-adversarial
created_adversarial_group=true
usermod -a -G leetplus-build-adversarial leetplus-build
if assert_fixture_exact_build_identity; then
  die 'leetplus-build supplementary NSS group was accepted'
fi
gpasswd -d leetplus-build leetplus-build-adversarial >/dev/null
assert_fixture_exact_build_identity \
  || die 'canonical leetplus-build NSS identity was not restored'
useradd --system --no-create-home --non-unique --uid "$(id -u leetplus-build)" \
  --home-dir "$TEST_ROOT/no-uid-alias-home" --shell /usr/sbin/nologin \
  --gid leetplus-build-adversarial leetplus-build-uid-adversarial
created_adversarial_uid_user=true
if assert_fixture_exact_build_identity; then
  die 'a second NSS identity with the build UID was accepted'
fi
userdel leetplus-build-uid-adversarial
created_adversarial_uid_user=false
groupdel leetplus-build-adversarial
created_adversarial_group=false
assert_fixture_exact_build_identity \
  || die 'canonical build UID identity was not restored'
useradd --system --no-create-home --home-dir "$TEST_ROOT/no-primary-alias-home" \
  --shell /usr/sbin/nologin --gid leetplus-build leetplus-build-primary-adv
created_adversarial_primary_user=true
if assert_fixture_exact_build_identity; then
  die 'a second NSS identity with the build primary GID was accepted'
fi
userdel leetplus-build-primary-adv
created_adversarial_primary_user=false
assert_fixture_exact_build_identity \
  || die 'canonical build primary-GID identity was not restored'
groupadd --system --non-unique --gid "$(id -g leetplus-build)" \
  leetplus-build-gid-adversarial
created_adversarial_gid_group=true
if assert_fixture_exact_build_identity; then
  die 'a second NSS group aliasing the build GID was accepted'
fi
groupdel --force leetplus-build-gid-adversarial
created_adversarial_gid_group=false
assert_fixture_exact_build_identity \
  || die 'canonical build GID group identity was not restored'
assert_fixture_no_build_identity_processes \
  || die 'fresh build identity unexpectedly owns a process'

# The installed stager deliberately replaces an inherited PATH with the exact
# production PATH, so provision the reviewed CI Node bytes there before the
# first production-mode staging exercise.
authority_node="$(realpath -e -- "$(command -v node)")"
[[ "$($authority_node -p 'process.versions.node.split(".")[0]')" == '22' ]] \
  || die 'fixture authority Node is not major 22'
if [[ ! -f /usr/bin/node || -L /usr/bin/node \
  || "$(stat -c '%u:%g' -- /usr/bin/node 2>/dev/null || true)" != '0:0' \
  || "$(/usr/bin/node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)" != '22' ]]; then
  if [[ -e /usr/bin/node || -L /usr/bin/node ]]; then
    mv -- /usr/bin/node "${TEST_ROOT}/system-node.original"
    original_system_node_present=true
  fi
  replaced_system_node=true
  install -o root -g root -m 0755 "$authority_node" /usr/bin/node
fi
[[ -f /usr/bin/node && ! -L /usr/bin/node \
  && "$(stat -c '%u:%g' -- /usr/bin/node)" == '0:0' \
  && "$(/usr/bin/node -p 'process.versions.node.split(".")[0]')" == '22' ]] \
  || die 'fixture could not provision exact root-owned /usr/bin/node major 22'

if [[ ! -d /usr/local/libexec/leetplus ]]; then
  install -d -o root -g root -m 0755 /usr/local/libexec/leetplus
  created_libexec_directory=true
fi
install -o root -g root -m 0755 "$STAGER_SOURCE" "$INSTALLED_STAGER"
install -o root -g root -m 0644 "$UNIT_SOURCE" "$INSTALLED_UNIT"

production_stage_fixture_candidate="/srv/leetplus-stage-input-fixture-${RANDOM}-${BASHPID}"
[[ ! -e "$production_stage_fixture_candidate" && ! -L "$production_stage_fixture_candidate" ]] \
  || die 'production input fixture refuses to reuse a pre-existing /srv path'
production_stage_fixture_root="$production_stage_fixture_candidate"
production_stage_source="${TEST_ROOT}/production-stage-source"
production_stage_archive_source="${TEST_ROOT}/leetplus-release-${RELEASE_SHA}.tar.gz"
production_stage_checksum_source="${production_stage_archive_source}.sha256"
production_stage_inbox="${production_stage_fixture_root}/inbox"
production_stage_output="${production_stage_fixture_root}/output"
install -d -o root -g leetplus-build -m 0750 \
  "$production_stage_fixture_root" "$production_stage_inbox"
install -d -o leetplus-build -g leetplus-build -m 0750 "$production_stage_output"
mkdir -p \
  "$production_stage_source/apps/api/dist" \
  "$production_stage_source/apps/web/.next" \
  "$production_stage_source/apps/web/public" \
  "$production_stage_source/packages/database/prisma"
printf 'trusted-api-bytes\n' > "$production_stage_source/apps/api/dist/main.js"
printf '{}\n' > "$production_stage_source/apps/api/package.json"
printf 'trusted-build-id\n' > "$production_stage_source/apps/web/.next/BUILD_ID"
printf '{}\n' > "$production_stage_source/apps/web/package.json"
printf '{}\n' > "$production_stage_source/packages/database/package.json"
printf 'generator client { provider = "prisma-client-js" }\n' \
  > "$production_stage_source/packages/database/prisma/schema.prisma"
printf 'lockfileVersion: "9.0"\n' > "$production_stage_source/pnpm-lock.yaml"
printf 'packages:\n  - apps/*\n' > "$production_stage_source/pnpm-workspace.yaml"
printf '%s\n' \
  '{' \
  "  \"releaseSha\": \"${RELEASE_SHA}\"," \
  '  "nodeVersion": "22",' \
  '  "pnpmVersion": "10.33.2",' \
  '  "databaseMigration": "20260820010000_fixture",' \
  '  "databaseMigrationCount": 1' \
  '}' > "$production_stage_source/release-provenance.json"
(
  cd -- "$production_stage_source"
  find . -type f ! -path './SHA256SUMS' -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 sha256sum --text > SHA256SUMS
  tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
    -czf "$production_stage_archive_source" .
)
(
  cd -- "$TEST_ROOT"
  sha256sum --text "$(basename -- "$production_stage_archive_source")" \
    > "$(basename -- "$production_stage_checksum_source")"
)
production_stage_archive="${production_stage_inbox}/$(basename -- "$production_stage_archive_source")"
production_stage_checksum="${production_stage_archive}.sha256"
install -o root -g leetplus-build -m 0440 \
  "$production_stage_archive_source" "$production_stage_archive"
install -o root -g leetplus-build -m 0440 \
  "$production_stage_checksum_source" "$production_stage_checksum"

env \
  NODE_OPTIONS='--require=/tmp/adversarial-prepare-only-hook.cjs' \
  NODE_PATH='/tmp/adversarial-node-path' \
  PATH='/tmp/adversarial-path' \
  /usr/sbin/runuser --preserve-environment -u leetplus-build -- \
  "$INSTALLED_STAGER" \
  --release-sha "$RELEASE_SHA" \
  --artifact "$production_stage_archive" \
  --artifact-sha256 "$production_stage_checksum" \
  --output-root "$production_stage_output" \
  > "${TEST_ROOT}/production-prepare-only.out"
grep -F -x 'STAGED_RELEASE_TRUST=PRODUCTION_INPUT_SNAPSHOT_VERIFIED' \
  "${TEST_ROOT}/production-prepare-only.out" >/dev/null
grep -F -x 'trusted-api-bytes' \
  "${production_stage_output}/${RELEASE_SHA}/apps/api/dist/main.js" >/dev/null
test -z "$(find "$production_stage_output" -mindepth 1 -maxdepth 1 -type d \
  -name ".${RELEASE_SHA}.input.*" -print -quit)"

expect_production_input_rejected() {
  local label="$1"
  local candidate_artifact="$2"
  local candidate_checksum="$3"
  local candidate_output="${production_stage_fixture_root}/output-${label}"
  install -d -o leetplus-build -g leetplus-build -m 0750 "$candidate_output"
  if /usr/sbin/runuser -u leetplus-build -- \
    "$INSTALLED_STAGER" \
    --release-sha "$RELEASE_SHA" \
    --artifact "$candidate_artifact" \
    --artifact-sha256 "$candidate_checksum" \
    --output-root "$candidate_output" \
    > "${TEST_ROOT}/production-input-${label}.out" 2>&1; then
    die "adversarial production input was accepted: ${label}"
  fi
  test ! -e "${candidate_output}/${RELEASE_SHA}"
}

chmod 0640 "$production_stage_archive"
expect_production_input_rejected \
  writable-artifact "$production_stage_archive" "$production_stage_checksum"
chmod 0440 "$production_stage_archive"

chmod 0640 "$production_stage_checksum"
expect_production_input_rejected \
  writable-checksum "$production_stage_archive" "$production_stage_checksum"
chmod 0440 "$production_stage_checksum"

ln "$production_stage_archive" "${production_stage_inbox}/artifact-hardlink"
expect_production_input_rejected \
  hardlinked-artifact "$production_stage_archive" "$production_stage_checksum"
rm -f -- "${production_stage_inbox}/artifact-hardlink"

chmod 0770 "$production_stage_inbox"
expect_production_input_rejected \
  writable-ancestor "$production_stage_archive" "$production_stage_checksum"
chmod 0750 "$production_stage_inbox"

ln -s -- "$production_stage_inbox" "${production_stage_fixture_root}/inbox-symlink"
expect_production_input_rejected \
  symlinked-ancestor \
  "${production_stage_fixture_root}/inbox-symlink/$(basename -- "$production_stage_archive")" \
  "${production_stage_fixture_root}/inbox-symlink/$(basename -- "$production_stage_checksum")"
rm -f -- "${production_stage_fixture_root}/inbox-symlink"

systemctl daemon-reload
systemd-analyze verify "$INSTALLED_UNIT"

assert_snapshot_property_keys() {
  local snapshot="$1"
  shift
  local line key property
  local -A expected=()
  local -A seen=()
  for property in "$@"; do expected["$property"]=1; done
  while IFS= read -r line; do
    [[ "$line" == *=* ]] || die 'systemd snapshot contains a malformed property line'
    key="${line%%=*}"
    [[ -n "$key" ]] || die 'systemd snapshot contains an empty property key'
    [[ "${expected[$key]+present}" == present ]] \
      || die "systemd snapshot contains an unexpected property key: ${key}"
    [[ "${seen[$key]+present}" != present ]] \
      || die "systemd snapshot contains a duplicate property key: ${key}"
    seen["$key"]=1
  done < "$snapshot"
  for property in "$@"; do
    [[ "${seen[$property]+present}" == present ]] \
      || die "systemd snapshot is missing a requested property key: ${property}"
  done
  [[ "${#seen[@]}" == "$#" ]] \
    || die 'systemd snapshot property-key count differs from the request'
}

write_snapshot() {
  local output_path="$1"
  shift
  local command=(systemctl show)
  local property
  for property in "$@"; do
    command+=("--property=${property}")
  done
  timeout --foreground --kill-after=5s 15s "${command[@]}" "$UNIT" > "$output_path"
  chmod 0600 "$output_path"
  assert_snapshot_property_keys "$output_path" "$@"
}

policy_snapshot="${TEST_ROOT}/policy.properties"
write_snapshot "$policy_snapshot" "${STATIC_PROPERTIES[@]}"
policy_attestation="$({
  node "$ATTESTOR" \
    --release-sha "$RELEASE_SHA" \
    --snapshot "$policy_snapshot" \
    --unit-file "$INSTALLED_UNIT" \
    --stager-file "$INSTALLED_STAGER" \
    --phase policy
})"
[[ "$(grep -c '^HYDRATION_SYSTEMD_POLICY_VERSION=1$' <<< "$policy_attestation")" == '1' ]]
policy_sha256="$(sed -n 's/^HYDRATION_SYSTEMD_POLICY_SHA256=//p' <<< "$policy_attestation")"
[[ "$policy_sha256" =~ ^[0-9a-f]{64}$ ]]

completed_snapshot="${TEST_ROOT}/completed.properties"
cp -- "$policy_snapshot" "$completed_snapshot"
{
  printf 'ActiveState=active\n'
  printf 'SubState=exited\n'
  printf 'Result=success\n'
  printf 'ExecMainStatus=0\n'
  printf 'InvocationID=%s\n' "$INVOCATION_ID"
  printf 'ControlGroup=/system.slice/%s\n' "$UNIT"
} >> "$completed_snapshot"
completed_attestation="$({
  node "$ATTESTOR" \
    --release-sha "$RELEASE_SHA" \
    --snapshot "$completed_snapshot" \
    --unit-file "$INSTALLED_UNIT" \
    --stager-file "$INSTALLED_STAGER" \
    --phase completed \
    --expected-invocation-id "$INVOCATION_ID"
})"
grep -F -x "HYDRATION_SYSTEMD_POLICY_SHA256=${policy_sha256}" \
  <<< "$completed_attestation" >/dev/null
grep -F -x "HYDRATION_SYSTEMD_INVOCATION_ID=${INVOCATION_ID}" \
  <<< "$completed_attestation" >/dev/null

mutate_property() {
  local source="$1"
  local output="$2"
  local key="$3"
  local value="$4"
  awk -v key="$key" -v value="$value" '
    index($0, key "=") == 1 { print key "=" value; replaced += 1; next }
    { print }
    END { if (replaced != 1) exit 91 }
  ' "$source" > "$output"
}

expect_rejected_property() {
  local label="$1"
  local key="$2"
  local value="$3"
  local snapshot="${TEST_ROOT}/${label}.properties"
  mutate_property "$completed_snapshot" "$snapshot" "$key" "$value"
  if node "$ATTESTOR" \
    --release-sha "$RELEASE_SHA" \
    --snapshot "$snapshot" \
    --unit-file "$INSTALLED_UNIT" \
    --stager-file "$INSTALLED_STAGER" \
    --phase completed \
    --expected-invocation-id "$INVOCATION_ID" \
    > "${TEST_ROOT}/${label}.out" 2>&1; then
    die "adversarial effective property was accepted: ${label}"
  fi
}

expect_rejected_property dropin-paths DropInPaths \
  '/etc/systemd/system/leetplus-release-hydrate@.service.d/99-adversarial.conf'
expect_rejected_property fragment-path FragmentPath '/run/systemd/transient/attacker.service'
expect_rejected_property root-user User root
expect_rejected_property root-group Group root
expect_rejected_property altered-preflight ExecStartPre \
  '{ path=/usr/bin/true ; argv[]=/usr/bin/true ; ignore_errors=no ; start_time=[n/a] }'
expect_rejected_property altered-exec ExecStart \
  '{ path=/usr/bin/true ; argv[]=/usr/bin/true ; ignore_errors=no ; start_time=[n/a] }'
expect_rejected_property inherited-node-options Environment \
  'LEETPLUS_HYDRATION_SANDBOX=SYSTEMD_IP_DENY_ANY_V1 PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC NODE_OPTIONS=--require=/tmp/inject.cjs'
expect_rejected_property incomplete-unset UnsetEnvironment \
  "$(sed -n 's/^UnsetEnvironment=//p' "$completed_snapshot" | sed 's/ NODE_OPTIONS//')"
expect_rejected_property address-allow IPAddressAllow localhost
expect_rejected_property address-family RestrictAddressFamilies 'AF_UNIX'
expect_rejected_property address-family-unrestricted RestrictAddressFamilies '~'
expect_rejected_property ip-deny-removed IPAddressDeny ''
expect_rejected_property privileges-enabled NoNewPrivileges no
expect_rejected_property capability-added CapabilityBoundingSet cap_net_raw
expect_rejected_property weak-protect-system ProtectSystem full
expect_rejected_property home-visible ProtectHome no
expect_rejected_property shared-tmp PrivateTmp no
expect_rejected_property devices-visible PrivateDevices no
expect_rejected_property memory-unbounded MemoryMax infinity
expect_rejected_property swap-unbounded MemorySwapMax infinity
expect_rejected_property tasks-unbounded TasksMax infinity
expect_rejected_property cpu-unbounded CPUQuotaPerSecUSec infinity
expect_rejected_property file-size-unbounded LimitFSIZE infinity
expect_rejected_property writable-root ReadWritePaths \
  '/run/leetplus-release/hydration.lock /srv/leetplus/release-builds /'
expect_rejected_property invocation-drift InvocationID cccccccccccccccccccccccccccccccc

missing_property_snapshot="${TEST_ROOT}/missing.properties"
sed '/^IPAddressDeny=/d' "$completed_snapshot" > "$missing_property_snapshot"
if node "$ATTESTOR" \
  --release-sha "$RELEASE_SHA" \
  --snapshot "$missing_property_snapshot" \
  --unit-file "$INSTALLED_UNIT" \
  --stager-file "$INSTALLED_STAGER" \
  --phase completed \
  --expected-invocation-id "$INVOCATION_ID" >/dev/null 2>&1; then
  die 'snapshot with a missing property was accepted'
fi

duplicate_property_snapshot="${TEST_ROOT}/duplicate.properties"
cp -- "$completed_snapshot" "$duplicate_property_snapshot"
printf 'IPAddressDeny=any\n' >> "$duplicate_property_snapshot"
if node "$ATTESTOR" \
  --release-sha "$RELEASE_SHA" \
  --snapshot "$duplicate_property_snapshot" \
  --unit-file "$INSTALLED_UNIT" \
  --stager-file "$INSTALLED_STAGER" \
  --phase completed \
  --expected-invocation-id "$INVOCATION_ID" >/dev/null 2>&1; then
  die 'snapshot with a duplicate property was accepted'
fi

tampered_unit="${TEST_ROOT}/tampered.service"
sed 's/^IPAddressAllow=$/IPAddressAllow=localhost/' "$INSTALLED_UNIT" > "$tampered_unit"
if node "$ATTESTOR" \
  --release-sha "$RELEASE_SHA" \
  --snapshot "$completed_snapshot" \
  --unit-file "$tampered_unit" \
  --stager-file "$INSTALLED_STAGER" \
  --phase completed \
  --expected-invocation-id "$INVOCATION_ID" >/dev/null 2>&1; then
  die 'tampered installed unit fragment was accepted'
fi

tampered_stager="${TEST_ROOT}/tampered-stager.sh"
cp -- "$INSTALLED_STAGER" "$tampered_stager"
printf '\n# adversarial mutation\n' >> "$tampered_stager"
if node "$ATTESTOR" \
  --release-sha "$RELEASE_SHA" \
  --snapshot "$completed_snapshot" \
  --unit-file "$INSTALLED_UNIT" \
  --stager-file "$tampered_stager" \
  --phase completed \
  --expected-invocation-id "$INVOCATION_ID" >/dev/null 2>&1; then
  die 'tampered installed hydration stager was accepted'
fi

install -d -o root -g root -m 0755 \
  '/etc/systemd/system/leetplus-release-hydrate@.service.d'
created_dropin_directory=true
printf '[Service]\nIPAddressAllow=localhost\n' \
  > '/etc/systemd/system/leetplus-release-hydrate@.service.d/99-adversarial.conf'
chmod 0644 '/etc/systemd/system/leetplus-release-hydrate@.service.d/99-adversarial.conf'
systemctl daemon-reload
dropin_snapshot="${TEST_ROOT}/effective-dropin.properties"
write_snapshot "$dropin_snapshot" "${STATIC_PROPERTIES[@]}"
if node "$ATTESTOR" \
  --release-sha "$RELEASE_SHA" \
  --snapshot "$dropin_snapshot" \
  --unit-file "$INSTALLED_UNIT" \
  --stager-file "$INSTALLED_STAGER" \
  --phase policy >/dev/null 2>&1; then
  die 'real systemd effective drop-in mutation was accepted'
fi
rm -f -- '/etc/systemd/system/leetplus-release-hydrate@.service.d/99-adversarial.conf'
rmdir -- '/etc/systemd/system/leetplus-release-hydrate@.service.d'
created_dropin_directory=false
systemctl daemon-reload

for manager_key in "${MANAGER_ENVIRONMENT_KEYS[@]}"; do
  if systemctl show-environment | grep -q "^${manager_key}="; then
    die "fixture refuses to overwrite pre-existing manager environment: ${manager_key}"
  fi
done
systemctl set-environment \
  'NODE_OPTIONS=--require=/tmp/manager-injection.cjs' \
  'NODE_PATH=/tmp/manager-node-path' \
  'NODE_V8_COVERAGE=/tmp/manager-v8-coverage' \
  'NODE_COMPILE_CACHE=/tmp/manager-node-compile-cache' \
  'LD_AUDIT=/tmp/manager-loader-audit.so' \
  'GCONV_PATH=/tmp/manager-gconv' \
  'LOCPATH=/tmp/manager-locale' \
  'OPENSSL_CONF=/tmp/manager-openssl.cnf' \
  'OPENSSL_MODULES=/tmp/manager-openssl-modules' \
  'HTTP_PROXY=http://127.0.0.1:9' \
  'http_proxy=http://127.0.0.1:9'
manager_environment_set=true
manager_probe_unit="leetplus-hydration-manager-env-probe-${RANDOM}-${BASHPID}.service"
live_units+=("$manager_probe_unit")
timeout --foreground --kill-after=5s 20s systemd-run \
  --unit "$manager_probe_unit" \
  --wait \
  --pipe \
  --collect \
  --property=Type=oneshot \
  --property='PassEnvironment=NODE_OPTIONS NODE_PATH NODE_V8_COVERAGE NODE_COMPILE_CACHE LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES HTTP_PROXY http_proxy' \
  --property='UnsetEnvironment=NODE_OPTIONS NODE_PATH NODE_V8_COVERAGE NODE_COMPILE_CACHE LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES HTTP_PROXY http_proxy' \
  /usr/bin/python3 -c \
  'import os,sys; forbidden={"NODE_OPTIONS","NODE_PATH","NODE_V8_COVERAGE","NODE_COMPILE_CACHE","LD_AUDIT","GCONV_PATH","LOCPATH","OPENSSL_CONF","OPENSSL_MODULES","HTTP_PROXY","http_proxy"}; sys.exit(0 if forbidden.isdisjoint(os.environ) else 81)'
systemctl unset-environment "${MANAGER_ENVIRONMENT_KEYS[@]}"
manager_environment_set=false

foreign_build_unit="leetplus-hydration-foreign-build-uid-${RANDOM}-${BASHPID}.service"
live_units+=("$foreign_build_unit")
timeout --foreground --kill-after=5s 20s systemd-run \
  --unit "$foreign_build_unit" \
  --property=Type=simple \
  --property=User=leetplus-build \
  --property=Group=leetplus-build \
  --property=RuntimeMaxSec=90s \
  /usr/bin/sleep 60 >/dev/null
timeout --foreground --kill-after=2s 8s systemctl is-active --quiet "$foreign_build_unit"
foreign_build_control_group="$(systemctl show --property=ControlGroup --value "$foreign_build_unit")"
[[ "$foreign_build_control_group" == "/system.slice/${foreign_build_unit}" \
  && "$foreign_build_control_group" != /system.slice/leetplus-release-hydrate@* ]] \
  || die 'foreign build-UID fixture did not enter an independent cgroup'
set +e
assert_fixture_no_build_identity_processes
foreign_build_process_status=$?
set -e
[[ "$foreign_build_process_status" == '1' ]] \
  || die 'foreign build-UID process was not rejected by the process fence'

created_exact_hydration_fixture=true
install -d -o root -g root -m 0755 \
  '/srv/leetplus' \
  '/srv/leetplus/pnpm-store' \
  '/run/leetplus-release'
install -d -o root -g leetplus-build -m 0750 '/srv/leetplus/release-inbox'
install -d -o leetplus-build -g leetplus-build -m 0750 '/srv/leetplus/release-builds'
install -o root -g leetplus-build -m 0440 \
  "$production_stage_archive_source" \
  "/srv/leetplus/release-inbox/leetplus-release-${RELEASE_SHA}.tar.gz"
install -o root -g leetplus-build -m 0440 \
  "$production_stage_checksum_source" \
  "/srv/leetplus/release-inbox/leetplus-release-${RELEASE_SHA}.tar.gz.sha256"
install -o root -g leetplus-build -m 0660 /dev/null \
  '/run/leetplus-release/hydration.lock'
live_units+=("$UNIT")
set +e
timeout --foreground --kill-after=5s 20s systemctl start "$UNIT" \
  > "${TEST_ROOT}/foreign-build-hydration.out" 2>&1
foreign_hydration_status=$?
set -e
[[ "$foreign_hydration_status" != '0' \
  && "$foreign_hydration_status" != '124' \
  && "$foreign_hydration_status" != '137' ]] \
  || die 'hydration did not fail promptly while a foreign build-UID process was active'
[[ "$(systemctl show --property=Result --value "$UNIT")" == 'exit-code' \
  && "$(systemctl show --property=ExecMainPID --value "$UNIT")" == '0' \
  && "$(systemctl show --property=ExecMainStartTimestampMonotonic --value "$UNIT")" == '0' ]] \
  || die 'foreign build-UID rejection did not happen before hydration main started'
preflight_execution="$(systemctl show --property=ExecStartPre --value "$UNIT")"
[[ "$preflight_execution" == *'code=exited ; status=1'* ]] \
  || die 'root build-UID preflight did not record an exact failure'
test -z "$(find -P '/srv/leetplus/release-builds' -mindepth 1 -print -quit)" \
  || die 'foreign build-UID rejection created staging bytes before it failed'
systemctl reset-failed "$UNIT"
timeout --foreground --kill-after=2s 8s systemctl stop "$foreign_build_unit"
assert_fixture_no_build_identity_processes \
  || die 'build-UID process fence did not clear after foreign process stop'

install -d -o leetplus-build -g leetplus-build -m 0750 \
  '/srv/leetplus/release-builds/hostile-preexisting-sibling'
set +e
timeout --foreground --kill-after=5s 20s systemctl start "$UNIT" \
  > "${TEST_ROOT}/preexisting-build-sibling.out" 2>&1
preexisting_sibling_status=$?
set -e
[[ "$preexisting_sibling_status" != '0' \
  && "$preexisting_sibling_status" != '124' \
  && "$preexisting_sibling_status" != '137' \
  && "$(systemctl show --property=ExecMainStartTimestampMonotonic --value "$UNIT")" == '0' ]] \
  || die 'root preflight did not reject a nonempty global build root before ExecStart'
preexisting_sibling_preflight="$(systemctl show --property=ExecStartPre --value "$UNIT")"
[[ "$preexisting_sibling_preflight" == *'code=exited ; status=1'* ]] \
  || die 'nonempty build-root rejection did not record an exact preflight failure'
systemctl reset-failed "$UNIT"
rmdir -- '/srv/leetplus/release-builds/hostile-preexisting-sibling'

# Prove the same installed preflight is otherwise healthy. The deliberately
# incomplete hydration fixture must advance into ExecStart and then fail (the
# trusted pnpm store/verifier is intentionally not installed here).
set +e
timeout --foreground --kill-after=5s 20s systemctl start "$UNIT" \
  > "${TEST_ROOT}/clean-build-hydration.out" 2>&1
clean_hydration_status=$?
set -e
[[ "$clean_hydration_status" != '0' \
  && "$clean_hydration_status" != '124' \
  && "$clean_hydration_status" != '137' ]] \
  || die 'incomplete clean hydration fixture did not fail promptly in ExecStart'
clean_preflight_execution="$(systemctl show --property=ExecStartPre --value "$UNIT")"
[[ "$clean_preflight_execution" == *'code=exited ; status=0'* \
  && "$(systemctl show --property=ExecMainStartTimestampMonotonic --value "$UNIT")" \
    =~ ^[1-9][0-9]*$ ]] \
  || die 'root build-UID preflight did not pass after the foreign process stopped'
systemctl reset-failed "$UNIT"
mapfile -d '' -t retained_clean_staging < <(
  find -P '/srv/leetplus/release-builds' -mindepth 1 -maxdepth 1 \
    -type d -name ".${RELEASE_SHA}.staging.*" -print0
)
[[ "${#retained_clean_staging[@]}" == '1' \
  && "$(dirname -- "${retained_clean_staging[0]}")" == \
    '/srv/leetplus/release-builds' ]] \
  || die 'incomplete hydration did not leave one bounded staging residue'
rm -rf -- "${retained_clean_staging[0]}"
test -z "$(find -P '/srv/leetplus/release-builds' -mindepth 1 -maxdepth 1 -print -quit)"

# cgroup.procs is a virtual file with st_size=0. Exercise a genuinely nonempty
# real cgroup and prove a content read observes its PID despite that metadata.
cgroup_probe_unit="leetplus-hydration-cgroup-probe-${RANDOM}-${BASHPID}.service"
live_units+=("$cgroup_probe_unit")
timeout --foreground --kill-after=5s 20s systemd-run \
  --unit "$cgroup_probe_unit" \
  --property=Type=simple \
  --property=RuntimeMaxSec=15s \
  /usr/bin/sleep 10 >/dev/null
timeout --foreground --kill-after=2s 8s systemctl is-active --quiet "$cgroup_probe_unit"
cgroup_probe_path="/sys/fs/cgroup$(systemctl show --property=ControlGroup --value "$cgroup_probe_unit")/cgroup.procs"
[[ -f "$cgroup_probe_path" && ! -L "$cgroup_probe_path" \
  && "$(stat -c '%s' -- "$cgroup_probe_path")" == '0' ]] \
  || die 'real cgroup.procs fixture does not expose virtual zero-size semantics'
cgroup_probe_pid=''
IFS= read -r cgroup_probe_pid < "$cgroup_probe_path" \
  || die 'content read missed a process in the real nonempty cgroup'
[[ "$cgroup_probe_pid" =~ ^[1-9][0-9]*$ ]] \
  || die 'real cgroup.procs content is malformed'
systemctl stop "$cgroup_probe_unit"

ip_probe_unit="leetplus-hydration-ip-deny-probe-${RANDOM}-${BASHPID}.service"
live_units+=("$ip_probe_unit")
ip_probe_program=$'import errno, socket, sys\ns = socket.socket(socket.AF_INET, socket.SOCK_STREAM)\ns.settimeout(1)\ntry:\n    s.connect(("127.0.0.1", 9))\nexcept PermissionError as exc:\n    sys.exit(0 if exc.errno in (errno.EACCES, errno.EPERM) else 82)\nexcept OSError:\n    sys.exit(83)\nsys.exit(84)'
timeout --foreground --kill-after=5s 20s systemd-run \
  --unit "$ip_probe_unit" \
  --wait \
  --pipe \
  --collect \
  --property=Type=oneshot \
  --property=NoNewPrivileges=yes \
  --property=CapabilityBoundingSet= \
  --property='RestrictAddressFamilies=AF_UNIX AF_INET' \
  --property=IPAddressDeny=any \
  --property=RuntimeMaxSec=5s \
  /usr/bin/python3 -c "$ip_probe_program"

unix_listener_unit="leetplus-hydration-hostile-unix-listener-${RANDOM}-${BASHPID}.service"
live_units+=("$unix_listener_unit")
unix_listener_program=$'import os, socket, sys, time\npath = sys.argv[1]\nsock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)\nsock.bind(path)\nos.chmod(path, 0o777)\nsock.listen(1)\ntime.sleep(20)'
timeout --foreground --kill-after=5s 20s systemd-run \
  --unit "$unix_listener_unit" \
  --property=Type=simple \
  --property=RuntimeMaxSec=25s \
  /usr/bin/python3 -c "$unix_listener_program" "$HOSTILE_UNIX_SOCKET" >/dev/null
for _ in {1..50}; do
  [[ -S "$HOSTILE_UNIX_SOCKET" ]] && break
  sleep 0.1
done
[[ -S "$HOSTILE_UNIX_SOCKET" ]] \
  || die 'hostile Unix-socket listener did not become ready'

family_probe_unit="leetplus-hydration-family-probe-${RANDOM}-${BASHPID}.service"
live_units+=("$family_probe_unit")
family_probe_program=$'import errno, socket, sys\npath = sys.argv[1]\nfor family, address in ((socket.AF_INET, ("127.0.0.1", 9)), (socket.AF_UNIX, path)):\n    try:\n        sock = socket.socket(family, socket.SOCK_STREAM)\n        sock.settimeout(1)\n        sock.connect(address)\n    except OSError as exc:\n        if exc.errno not in (errno.EAFNOSUPPORT, errno.EACCES, errno.EPERM):\n            sys.exit(85)\n    else:\n        sys.exit(86)\nsys.exit(0)'
timeout --foreground --kill-after=5s 20s systemd-run \
  --unit "$family_probe_unit" \
  --wait \
  --pipe \
  --collect \
  --property=Type=oneshot \
  --property=User=leetplus-build \
  --property=Group=leetplus-build \
  --property=NoNewPrivileges=yes \
  --property=CapabilityBoundingSet= \
  --property=PrivateTmp=yes \
  --property=ProtectSystem=strict \
  --property='ReadOnlyPaths=/run/leetplus-release' \
  --property=RestrictAddressFamilies=none \
  --property=IPAddressDeny=any \
  --property=RuntimeMaxSec=5s \
  /usr/bin/python3 -c "$family_probe_program" "$HOSTILE_UNIX_SOCKET"
timeout --foreground --kill-after=2s 8s systemctl stop "$unix_listener_unit"
rm -f -- "$HOSTILE_UNIX_SOCKET"

# Exercise the real promoter state machine with a deterministic test-only
# hydration producer. The installed attestor remains the production verifier;
# only its stager digest pin is rebuilt for these explicitly disposable bytes.
groupadd --system leetplus-runtime
created_runtime_group=true
useradd --system --no-create-home --home-dir "${TEST_ROOT}/no-api-home" \
  --shell /usr/sbin/nologin --gid leetplus-runtime leetplus-api-blue
created_api_user=true

install -d -o root -g leetplus-runtime -m 0710 '/srv/leetplus/release-promotions'
install -d -o root -g root -m 0755 '/srv/leetplus/releases'
if [[ ! -e '/var/lib/leetplus' && ! -L '/var/lib/leetplus' ]]; then
  install -d -o root -g root -m 0755 '/var/lib/leetplus'
  created_receipt_parent=true
else
  [[ -d '/var/lib/leetplus' && ! -L '/var/lib/leetplus' \
    && "$(realpath -e -- /var/lib/leetplus)" == '/var/lib/leetplus' \
    && "$(stat -c '%u:%g' -- /var/lib/leetplus)" == '0:0' \
    && -z "$(find -P /var/lib/leetplus -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die 'existing /var/lib/leetplus is not a safe receipt ancestor'
fi
install -d -o root -g root -m 0700 '/var/lib/leetplus/deploy-receipts'
created_receipt_root=true
install -o root -g root -m 0755 "$SEALER_SOURCE" "$INSTALLED_SEALER"
install -o root -g root -m 0755 "$PROMOTER_SOURCE" "$INSTALLED_PROMOTER"

fake_stager="${TEST_ROOT}/fixture-stage-release-artifact.sh"
cat > "$fake_stager" <<'FAKE_STAGER'
#!/usr/bin/bash -p
set -euo pipefail
IFS=$'\n\t'
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
export PATH
release_sha=''
preflight=false
while (($# > 0)); do
  case "$1" in
    --release-sha) release_sha="${2:-}"; shift 2 ;;
    --preflight-build-uid-fence) preflight=true; shift ;;
    *) shift ;;
  esac
done
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]]
if [[ "$preflight" == true ]]; then
  ((EUID == 0))
  exit 0
fi
[[ "$(id -un)" == 'leetplus-build' && "${INVOCATION_ID:-}" =~ ^[0-9a-f]{32}$ ]]
release_directory="/srv/leetplus/release-builds/${release_sha}"
[[ ! -e "$release_directory" && ! -L "$release_directory" ]]
mkdir -p -- \
  "$release_directory/apps/api/dist" \
  "$release_directory/apps/web/.next"
printf 'fixture-api-%s\n' "$release_sha" > "$release_directory/apps/api/dist/main.js"
printf 'fixture-build-%s\n' "$release_sha" > "$release_directory/apps/web/.next/BUILD_ID"
printf '{"releaseSha":"%s"}\n' "$release_sha" > "$release_directory/release-provenance.json"
(
  cd -- "$release_directory"
  find -P . -type f ! -path './SHA256SUMS' -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 sha256sum --text > SHA256SUMS
  {
    printf 'RECORD_VERSION=1\n'
    printf 'RELEASE_SHA=%s\n' "$release_sha"
    printf 'SANDBOX=SYSTEMD_IP_DENY_ANY_V1\n'
    printf 'INVOCATION_ID=%s\n' "$INVOCATION_ID"
    printf 'PNPM_STORE_LOCKFILE_SHA256=%064d\n' 0
    printf 'PNPM_STORE_MANIFEST_SHA256=%064d\n' 0
    printf 'PNPM_STORE_RECEIPT_SHA256=%064d\n' 0
  } > HYDRATION_SANDBOX_RECEIPT
  ln -s -- main.js apps/api/dist/main-link.js
  printf '{"links":[{"path":"apps/api/dist/main-link.js","target":"main.js"}],"version":1}\n' \
    > HYDRATED_SYMLINKS.json
  find -P . -type f ! -path './HYDRATED_SHA256SUMS' -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 sha256sum --text > HYDRATED_SHA256SUMS
  sha256sum --strict --check --quiet SHA256SUMS
  sha256sum --strict --check --quiet HYDRATED_SHA256SUMS
)
FAKE_STAGER
chmod 0755 "$fake_stager"
install -o root -g root -m 0755 "$fake_stager" "$INSTALLED_STAGER"
fake_stager_sha256="$(sha256sum -- "$INSTALLED_STAGER" | awk '{ print $1 }')"
fixture_attestor="${TEST_ROOT}/fixture-verify-release-hydration-systemd.mjs"
awk -v sha="$fake_stager_sha256" '
  replace_stager_pin && /^  "[0-9a-f]{64}";$/ {
    print "  \"" sha "\";"
    replace_stager_pin = 0
    next
  }
  /^const EXPECTED_STAGER_SHA256 =$/ { replace_stager_pin = 1 }
  { print }
  END { if (replace_stager_pin) exit 91 }
' "$ATTESTOR" > "$fixture_attestor"
/usr/bin/node --check "$fixture_attestor"
install -o root -g root -m 0444 "$fixture_attestor" "$INSTALLED_ATTESTOR"

install -d -o root -g root -m 0700 \
  "$PRODUCTION_CONTROL_RUN_ROOT" \
  "$PRODUCTION_CONTROL_GENERATION_BASE" \
  "$PRODUCTION_CONTROL_RECEIPT_ROOT"
install -o root -g root -m 0600 /dev/null "$PRODUCTION_CONTROL_INSTALL_LOCK"
created_production_control_fixture=true
fixture_control_installer="${TEST_ROOT}/fixture-production-control-installer"
printf '%s\n' '#!/usr/bin/bash -p' 'exit 97' > "$fixture_control_installer"
install -o root -g root -m 0500 "$fixture_control_installer" "$INSTALLED_CONTROL_INSTALLER"
fixture_generation_verifier="${TEST_ROOT}/fixture-verify-installed-production-control-generation.mjs"
cat > "$fixture_generation_verifier" <<'FIXTURE_GENERATION_VERIFIER'
#!/usr/bin/node

import crypto from "node:crypto";
import fs from "node:fs";
import process from "node:process";

const fail = (message) => {
  throw new Error(`fixture-installed-generation-verifier: ${message}`);
};
const expectedEnvironment = {
  PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  TZ: "UTC",
};
const actualEnvironmentNames = Object.keys(process.env).sort();
const expectedEnvironmentNames = Object.keys(expectedEnvironment).sort();
if (
  actualEnvironmentNames.length !== expectedEnvironmentNames.length ||
  actualEnvironmentNames.some((name, index) => name !== expectedEnvironmentNames[index]) ||
  expectedEnvironmentNames.some((name) => process.env[name] !== expectedEnvironment[name])
) fail("environment is not exact and secret-free");
if (process.getuid?.() !== 0 || process.getgid?.() !== 0) fail("root authority is required");
if (
  process.argv.length !== 5 ||
  process.argv[2] !== "--release-sha" ||
  !/^[0-9a-f]{40}$/u.test(process.argv[3]) ||
  process.argv[4] !== "--require-root-authority"
) fail("arguments are not exact");

const releaseSha = process.argv[3];
const receipt =
  `/var/lib/leetplus/deploy-receipts/production-control/` +
  `production-control-generation-${releaseSha}.receipt.json`;
const generationRoot = `/srv/leetplus/production-control-generations/${releaseSha}`;
const digest = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
process.stdout.write(
  `PRODUCTION_CONTROL_INSTALLED_GENERATION=PASS\n` +
    `PRODUCTION_CONTROL_RELEASE_SHA=${releaseSha}\n` +
    `PRODUCTION_CONTROL_RECEIPT_PATH=${receipt}\n` +
    `PRODUCTION_CONTROL_RECEIPT_SHA256=${digest(receipt)}\n` +
    `PRODUCTION_CONTROL_ROOT_MANIFEST_SHA256=${digest(`${generationRoot}/SHA256SUMS`)}\n` +
    `PRODUCTION_CONTROL_INSTALL_MAP_SHA256=${digest(`${generationRoot}/docs/deployment/production-control-authority/production-control-install-map.tsv`)}\n` +
    `PRODUCTION_CONTROL_INSTALLER_SHA256=${digest("/usr/local/sbin/leetplus-install-production-control-v1")}\n` +
    `PRODUCTION_CONTROL_VERIFIER_SHA256=${digest(process.argv[1])}\n` +
    `PRODUCTION_CONTROL_STAGER_SHA256=${digest("/usr/local/libexec/leetplus/stage-release-artifact.sh")}\n` +
    `PRODUCTION_CONTROL_ATTESTOR_SHA256=${digest("/usr/local/libexec/leetplus/verify-release-hydration-systemd.mjs")}\n` +
    `PRODUCTION_CONTROL_HYDRATION_UNIT_SHA256=${digest("/etc/systemd/system/leetplus-release-hydrate@.service")}\n` +
    `PRODUCTION_CONTROL_SEALER_SHA256=${digest("/usr/local/sbin/leetplus-seal-release-artifact")}\n` +
    `PRODUCTION_CONTROL_PROMOTER_SHA256=${digest("/usr/local/sbin/leetplus-promote-release-artifact")}\n` +
    `PRODUCTION_CONTROL_INSTALLED_FILE_COUNT=46\n`,
);
FIXTURE_GENERATION_VERIFIER
/usr/bin/node --check "$fixture_generation_verifier"
install -o root -g root -m 0555 \
  "$fixture_generation_verifier" "$INSTALLED_GENERATION_VERIFIER"

prepare_fixture_production_control_generation() {
  local sha="$1"
  local generation_root="${PRODUCTION_CONTROL_GENERATION_BASE}/${sha}"
  local install_map_directory="${generation_root}/docs/deployment/production-control-authority"
  local receipt="${PRODUCTION_CONTROL_RECEIPT_ROOT}/production-control-generation-${sha}.receipt.json"
  local root_manifest_sha256 install_map_sha256 installer_sha256 verifier_sha256
  local stager_sha256 attestor_sha256 hydration_unit_sha256 sealer_sha256 promoter_sha256

  install -d -o root -g root -m 0700 "$generation_root" "$install_map_directory"
  printf 'fixture production-control root manifest for %s\n' "$sha" \
    > "$generation_root/SHA256SUMS"
  printf 'fixture/source\t/usr/local/share/leetplus/fixture\t0444\n' \
    > "$install_map_directory/production-control-install-map.tsv"
  chmod 0400 \
    "$generation_root/SHA256SUMS" \
    "$install_map_directory/production-control-install-map.tsv"
  root_manifest_sha256="$(sha256sum -- "$generation_root/SHA256SUMS" | awk '{ print $1 }')"
  install_map_sha256="$(sha256sum -- "$install_map_directory/production-control-install-map.tsv" | awk '{ print $1 }')"
  installer_sha256="$(sha256sum -- "$INSTALLED_CONTROL_INSTALLER" | awk '{ print $1 }')"
  verifier_sha256="$(sha256sum -- "$INSTALLED_GENERATION_VERIFIER" | awk '{ print $1 }')"
  stager_sha256="$(sha256sum -- "$INSTALLED_STAGER" | awk '{ print $1 }')"
  attestor_sha256="$(sha256sum -- "$INSTALLED_ATTESTOR" | awk '{ print $1 }')"
  hydration_unit_sha256="$(sha256sum -- "$INSTALLED_UNIT" | awk '{ print $1 }')"
  sealer_sha256="$(sha256sum -- "$INSTALLED_SEALER" | awk '{ print $1 }')"
  promoter_sha256="$(sha256sum -- "$INSTALLED_PROMOTER" | awk '{ print $1 }')"
  /usr/bin/env -i \
    PATH='/usr/sbin:/usr/bin:/sbin:/bin' \
    LANG='C.UTF-8' \
    LC_ALL='C.UTF-8' \
    TZ='UTC' \
    /usr/bin/node - \
      "$receipt" "$sha" "$root_manifest_sha256" "$install_map_sha256" \
      "$installer_sha256" "$verifier_sha256" "$stager_sha256" \
      "$attestor_sha256" "$hydration_unit_sha256" "$sealer_sha256" \
      "$promoter_sha256" <<'NODE'
const fs = require('node:fs');
const [
  receipt,
  releaseSha,
  artifactRootManifestSha256,
  installMapSha256,
  installerAuthoritySha256,
  installedGenerationVerifierSha256,
  hydrationStagerSha256,
  hydrationAttestorSha256,
  hydrationUnitSha256,
  sealerSha256,
  promoterSha256,
] = process.argv.slice(2);
const record = {
  schemaVersion: 1,
  recordKind: 'leetplus-production-control-installed-generation',
  state: 'ACCEPTED',
  releaseSha,
  repository: 'boozik3412/leetplus',
  archiveSha256: 'a'.repeat(64),
  admissionReceiptSha256: 'b'.repeat(64),
  generationRoot: `/srv/leetplus/production-control-generations/${releaseSha}`,
  artifactRootManifestSha256,
  payloadAllowlistSha256: 'c'.repeat(64),
  controlBundleManifestSha256: 'd'.repeat(64),
  installMapSha256,
  installerAuthoritySha256,
  artifactVerifierSha256: 'e'.repeat(64),
  installedGenerationVerifierSha256,
  hydrationStagerSha256,
  hydrationAttestorSha256,
  hydrationUnitSha256,
  sealerSha256,
  promoterSha256,
  payloadFileCount: 57,
  installedFileCount: 46,
};
fs.writeFileSync(receipt, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o400 });
NODE
  chown root:root -- "$receipt"
  chmod 0400 -- "$receipt"
}

systemctl daemon-reload
systemd-analyze verify "$INSTALLED_UNIT"

prepare_recovery_hydration() {
  local sha="$1"
  local unit="leetplus-release-hydrate@${sha}.service"
  install -o root -g leetplus-build -m 0440 /dev/null \
    "/srv/leetplus/release-inbox/leetplus-release-${sha}.tar.gz"
  install -o root -g leetplus-build -m 0440 /dev/null \
    "/srv/leetplus/release-inbox/leetplus-release-${sha}.tar.gz.sha256"
  live_units+=("$unit")
  systemctl reset-failed "$unit" >/dev/null 2>&1 || true
  timeout --foreground --kill-after=5s 30s systemctl start "$unit"
  [[ "$(systemctl show --property=ActiveState --value "$unit")" == 'active' \
    && "$(systemctl show --property=SubState --value "$unit")" == 'exited' \
    && "$(systemctl show --property=Result --value "$unit")" == 'success' \
    && -d "/srv/leetplus/release-builds/${sha}" ]] \
    || die "fixture hydration did not complete for ${sha}"
  prepare_fixture_production_control_generation "$sha"
}

write_recovery_snapshot() {
  local output_path="$1"
  local unit="$2"
  shift 2
  local command=(systemctl show)
  local property
  for property in "$@"; do
    command+=("--property=${property}")
  done
  timeout --foreground --kill-after=5s 15s "${command[@]}" "$unit" > "$output_path"
  chmod 0600 "$output_path"
}

publish_fixture_promotion_intent_and_stop() {
  local sha="$1"
  local slot='blue'
  local unit="leetplus-release-hydrate@${sha}.service"
  local source_directory="/srv/leetplus/release-builds/${sha}"
  local promotion_directory="/srv/leetplus/release-promotions/${sha}"
  local release_directory="/srv/leetplus/releases/${sha}"
  local record="/var/lib/leetplus/deploy-receipts/release-promotion-intent-${sha}.receipt"
  local snapshot="${TEST_ROOT}/recovery-${sha}.properties"
  local receipt="${source_directory}/HYDRATION_SANDBOX_RECEIPT"
  local invocation_id completed_attestation fragment_sha stager_sha policy_sha
  local source_receipt_sha hydrated_manifest_sha control_group cgroup_procs live_pid=''
  local completed_properties=(
    "${STATIC_PROPERTIES[@]}"
    ActiveState SubState Result ExecMainStatus InvocationID ControlGroup
  )
  invocation_id="$(awk -F= '$1 == "INVOCATION_ID" { print $2 }' "$receipt")"
  write_recovery_snapshot "$snapshot" "$unit" "${completed_properties[@]}"
  completed_attestation="$(
    /usr/bin/node "$INSTALLED_ATTESTOR" \
      --release-sha "$sha" \
      --snapshot "$snapshot" \
      --unit-file "$INSTALLED_UNIT" \
      --stager-file "$INSTALLED_STAGER" \
      --phase completed \
      --expected-invocation-id "$invocation_id"
  )"
  fragment_sha="$(sed -n 's/^HYDRATION_SYSTEMD_FRAGMENT_SHA256=//p' <<< "$completed_attestation")"
  stager_sha="$(sed -n 's/^HYDRATION_STAGER_SHA256=//p' <<< "$completed_attestation")"
  policy_sha="$(sed -n 's/^HYDRATION_SYSTEMD_POLICY_SHA256=//p' <<< "$completed_attestation")"
  [[ "$fragment_sha" =~ ^[0-9a-f]{64}$ && "$stager_sha" =~ ^[0-9a-f]{64}$ \
    && "$policy_sha" =~ ^[0-9a-f]{64}$ ]] \
    || die "fixture completed attestation is malformed for ${sha}"
  control_group="$(systemctl show --property=ControlGroup --value "$unit")"
  [[ "$control_group" == "/system.slice/${unit}" ]]
  cgroup_procs="/sys/fs/cgroup${control_group}/cgroup.procs"
  [[ -f "$cgroup_procs" && ! -L "$cgroup_procs" ]] \
    || die "fixture completed cgroup is absent for ${sha}"
  if IFS= read -r live_pid < "$cgroup_procs"; then
    die "fixture completed cgroup still contains process ${live_pid} for ${sha}"
  fi
  source_receipt_sha="$(sha256sum -- "$receipt" | awk '{ print $1 }')"
  hydrated_manifest_sha="$(sha256sum -- "${source_directory}/HYDRATED_SHA256SUMS" | awk '{ print $1 }')"
  [[ ! -e "$record" && ! -L "$record" ]]
  {
    printf 'RECORD_VERSION=1\n'
    printf 'RELEASE_SHA=%s\n' "$sha"
    printf 'RELEASE_SLOT=%s\n' "$slot"
    printf 'HYDRATION_UNIT=%s\n' "$unit"
    printf 'HYDRATION_INVOCATION_ID=%s\n' "$invocation_id"
    printf 'HYDRATION_SOURCE_RECEIPT_SHA256=%s\n' "$source_receipt_sha"
    printf 'HYDRATION_UNIT_SHA256=%s\n' "$fragment_sha"
    printf 'HYDRATION_STAGER_SHA256=%s\n' "$stager_sha"
    printf 'HYDRATION_POLICY_SHA256=%s\n' "$policy_sha"
    printf 'HYDRATED_MANIFEST_SHA256=%s\n' "$hydrated_manifest_sha"
    printf 'SOURCE_DIRECTORY=%s\n' "$source_directory"
    printf 'PROMOTION_DIRECTORY=%s\n' "$promotion_directory"
    printf 'RELEASE_DIRECTORY=%s\n' "$release_directory"
    printf 'PROMOTION_AUTHORIZED=true\n'
    printf 'RUNTIME_SWITCHED=false\n'
  } > "$record"
  chmod 0400 "$record"
  sync -f "$record"
  sync -f '/var/lib/leetplus/deploy-receipts'
  timeout --foreground --kill-after=5s 20s systemctl stop "$unit"
  [[ "$(systemctl show --property=ActiveState --value "$unit")" == 'inactive' ]]
}

assert_promoted_release() {
  local sha="$1"
  local output_path="$2"
  [[ -d "/srv/leetplus/releases/${sha}" \
    && ! -e "/srv/leetplus/release-builds/${sha}" \
    && ! -e "/srv/leetplus/release-promotions/${sha}" \
    && "$(stat -c '%U:%G:%a' -- "/srv/leetplus/releases/${sha}")" == \
      'root:leetplus-runtime:550' \
    && "$(stat -c '%U:%G:%a:%h' -- "/var/lib/leetplus/deploy-receipts/release-promotion-intent-${sha}.receipt")" == \
      'root:root:400:1' \
    && "$(stat -c '%U:%G:%a:%h' -- "/var/lib/leetplus/deploy-receipts/release-hydration-attestation-${sha}.receipt")" == \
      'root:root:400:1' ]] \
    || die "promotion did not publish exact sealed state for ${sha}"
  grep -F -x "PROMOTED_RELEASE_SHA=${sha}" "$output_path" >/dev/null
  grep -F -x 'PROMOTED_RELEASE_RUNTIME_SWITCHED=false' "$output_path" >/dev/null
}

run_promoter() {
  local sha="$1"
  local output_path="$2"
  "$INSTALLED_PROMOTER" --release-sha "$sha" --slot blue \
    > "$output_path" 2>&1
}

snapshot_final_publication_state() {
  local sha="$1"
  local output_path="$2"
  local final_release="/srv/leetplus/releases/${sha}"
  local intent="/var/lib/leetplus/deploy-receipts/release-promotion-intent-${sha}.receipt"
  local attestation="/var/lib/leetplus/deploy-receipts/release-hydration-attestation-${sha}.receipt"

  [[ -d "$final_release" && ! -L "$final_release" \
    && -f "$intent" && ! -L "$intent" \
    && -f "$attestation" && ! -L "$attestation" ]] \
    || die "cannot snapshot final publication state for ${sha}"
  {
    printf 'FINAL_ROOT='; stat -c '%d:%i:%s:%y:%z:%U:%G:%a:%h' -- "$final_release"
    printf 'INTENT='; stat -c '%d:%i:%s:%y:%z:%U:%G:%a:%h' -- "$intent"
    printf 'ATTESTATION='; stat -c '%d:%i:%s:%y:%z:%U:%G:%a:%h' -- "$attestation"
    sha256sum -- "$intent" "$attestation"
    find -P "$final_release" -xdev -mindepth 1 \
      -printf '%P\t%y\t%D:%i:%s:%T@:%C@:%U:%G:%m:%n\t%l\n' \
      | LC_ALL=C sort
    find -P "$final_release" -xdev -type f -print0 \
      | LC_ALL=C sort -z \
      | xargs -0 sha256sum --text
  } > "$output_path"
}

expect_final_reconciliation_rejected_unchanged() {
  local sha="$1"
  local label="$2"
  local expected_message="$3"
  local before="${TEST_ROOT}/${label}.before"
  local after="${TEST_ROOT}/${label}.after"
  local output="${TEST_ROOT}/${label}.out"

  snapshot_final_publication_state "$sha" "$before"
  if run_promoter "$sha" "$output"; then
    die "promoter accepted final publication metadata drift: ${label}"
  fi
  snapshot_final_publication_state "$sha" "$after"
  cmp --silent -- "$before" "$after" \
    || die "failed final reconciliation mutated tree or receipt state: ${label}"
  grep -F -- "$expected_message" "$output" >/dev/null
}

normal_sha='1111111111111111111111111111111111111111'
prepare_recovery_hydration "$normal_sha"
chmod 0755 -- "$INSTALLED_GENERATION_VERIFIER"
printf '\n// fixture verifier drift\n' >> "$INSTALLED_GENERATION_VERIFIER"
chmod 0555 -- "$INSTALLED_GENERATION_VERIFIER"
if run_promoter "$normal_sha" "${TEST_ROOT}/promoter-generation-verifier-drift.out"; then
  die 'promoter accepted an installed-generation verifier that differed from the receipt pin'
fi
grep -F 'installed generation verifier differs from its accepted receipt pin' \
  "${TEST_ROOT}/promoter-generation-verifier-drift.out" >/dev/null
[[ -d "/srv/leetplus/release-builds/${normal_sha}" \
  && ! -e "/var/lib/leetplus/deploy-receipts/release-promotion-intent-${normal_sha}.receipt" ]] \
  || die 'installed-generation verifier drift rejection mutated promotion state'
install -o root -g root -m 0555 \
  "$fixture_generation_verifier" "$INSTALLED_GENERATION_VERIFIER"

exec 9<> "$PRODUCTION_CONTROL_INSTALL_LOCK"
flock -n 9 || die 'fixture could not acquire the production-control install lock'
if run_promoter "$normal_sha" "${TEST_ROOT}/promoter-install-lock-held.out"; then
  die 'promoter ran while another production-control install operation held the lock'
fi
grep -F 'another production-control install or promotion operation holds the install lock' \
  "${TEST_ROOT}/promoter-install-lock-held.out" >/dev/null
[[ -d "/srv/leetplus/release-builds/${normal_sha}" \
  && ! -e "/var/lib/leetplus/deploy-receipts/release-promotion-intent-${normal_sha}.receipt" ]] \
  || die 'production-control install lock rejection mutated promotion state'
flock -u 9
exec 9>&-

run_promoter "$normal_sha" "${TEST_ROOT}/promote-normal.out"
assert_promoted_release "$normal_sha" "${TEST_ROOT}/promote-normal.out"
run_promoter "$normal_sha" "${TEST_ROOT}/promote-normal-retry.out"
grep -F -x 'PROMOTED_RELEASE_PUBLICATION_RECONCILED=true' \
  "${TEST_ROOT}/promote-normal-retry.out" >/dev/null \
  || die 'lost normal promotion response was not reconciled idempotently'
normal_release="/srv/leetplus/releases/${normal_sha}"
normal_main="${normal_release}/apps/api/dist/main.js"
normal_dist="${normal_release}/apps/api/dist"
normal_link="${normal_release}/apps/api/dist/main-link.js"
[[ -L "$normal_link" && "$(readlink -- "$normal_link")" == 'main.js' ]] \
  || die 'representative final release lacks its bound safe symlink'
chmod 0640 -- "$normal_main"
expect_final_reconciliation_rejected_unchanged \
  "$normal_sha" promoter-final-file-mode-negative \
  'sealed release regular-file mode differs from exact 0440/0550 authority'
chmod 0440 -- "$normal_main"
chmod 0750 -- "$normal_dist"
expect_final_reconciliation_rejected_unchanged \
  "$normal_sha" promoter-final-directory-mode-negative \
  'sealed release directory mode differs from exact 0550 authority'
chmod 0550 -- "$normal_dist"
chown leetplus-api-blue:leetplus-runtime -- "$normal_main"
expect_final_reconciliation_rejected_unchanged \
  "$normal_sha" promoter-final-owner-negative \
  'sealed release entry owner/group differs from exact root:runtime authority'
chown root:root -- "$normal_main"
expect_final_reconciliation_rejected_unchanged \
  "$normal_sha" promoter-final-group-negative \
  'sealed release entry owner/group differs from exact root:runtime authority'
chown root:leetplus-runtime -- "$normal_main"
chown -h leetplus-api-blue:leetplus-runtime -- "$normal_link"
expect_final_reconciliation_rejected_unchanged \
  "$normal_sha" promoter-final-symlink-owner-negative \
  'sealed release entry owner/group differs from exact root:runtime authority'
chown -h root:leetplus-runtime -- "$normal_link"
"$INSTALLED_SEALER" --release-sha "$normal_sha" \
  --release-root '/srv/leetplus/releases' \
  --service-user leetplus-api-blue > "${TEST_ROOT}/sealer-final-positive.out"
chown root:leetplus-runtime '/srv/leetplus/releases'
if run_promoter "$normal_sha" "${TEST_ROOT}/promoter-final-root-group-negative.out"; then
  die 'promoter accepted a final releases root without exact root group authority'
fi
grep -F 'release root must be root:root and non-writable by group/other' \
  "${TEST_ROOT}/promoter-final-root-group-negative.out" >/dev/null
if "$INSTALLED_SEALER" --release-sha "$normal_sha" \
  --release-root '/srv/leetplus/releases' \
  --service-user leetplus-api-blue > "${TEST_ROOT}/sealer-final-group-negative.out" 2>&1; then
  die 'sealer accepted a final releases root without exact root group authority'
fi
[[ "$(stat -c '%U:%G:%a' -- "/srv/leetplus/releases/${normal_sha}")" == \
  'root:leetplus-runtime:550' ]] \
  || die 'final-root sealer negative mutated the representative artifact'
chown root:root '/srv/leetplus/releases'

# Positive promotion proves root:leetplus-runtime 0710 is accepted. A wrong
# root group must fail before the sealer mutates the representative artifact.
cp -a -- "/srv/leetplus/releases/${normal_sha}" \
  "/srv/leetplus/release-promotions/${normal_sha}"
chown root:root '/srv/leetplus/release-promotions'
if "$INSTALLED_SEALER" --release-sha "$normal_sha" \
  --release-root '/srv/leetplus/release-promotions' \
  --service-user leetplus-api-blue > "${TEST_ROOT}/sealer-root-group-negative.out" 2>&1; then
  die 'sealer accepted a promotion root without exact leetplus-runtime group authority'
fi
[[ "$(stat -c '%U:%G:%a' -- "/srv/leetplus/release-promotions/${normal_sha}")" == \
  'root:leetplus-runtime:550' ]] \
  || die 'sealer negative mutated the representative artifact'
chown root:leetplus-runtime '/srv/leetplus/release-promotions'
rm -rf -- "/srv/leetplus/release-promotions/${normal_sha}"

post_stop_sha='2222222222222222222222222222222222222222'
prepare_recovery_hydration "$post_stop_sha"
publish_fixture_promotion_intent_and_stop "$post_stop_sha"
run_promoter "$post_stop_sha" "${TEST_ROOT}/promote-post-stop.out"
assert_promoted_release "$post_stop_sha" "${TEST_ROOT}/promote-post-stop.out"
grep -F -x 'PROMOTED_RELEASE_PUBLICATION_RECONCILED=true' \
  "${TEST_ROOT}/promote-post-stop.out" >/dev/null \
  || die 'post-stop promotion state was not identified as reconciliation'

post_move_sha='3333333333333333333333333333333333333333'
prepare_recovery_hydration "$post_move_sha"
publish_fixture_promotion_intent_and_stop "$post_move_sha"
mv -T -- "/srv/leetplus/release-builds/${post_move_sha}" \
  "/srv/leetplus/release-promotions/${post_move_sha}"
sync -f '/srv/leetplus/release-builds'
sync -f '/srv/leetplus/release-promotions'
run_promoter "$post_move_sha" "${TEST_ROOT}/promote-post-move.out"
assert_promoted_release "$post_move_sha" "${TEST_ROOT}/promote-post-move.out"
grep -F -x 'PROMOTED_RELEASE_PUBLICATION_RECONCILED=true' \
  "${TEST_ROOT}/promote-post-move.out" >/dev/null \
  || die 'post-move promotion state was not identified as reconciliation'

post_seal_sha='4444444444444444444444444444444444444444'
prepare_recovery_hydration "$post_seal_sha"
publish_fixture_promotion_intent_and_stop "$post_seal_sha"
mv -T -- "/srv/leetplus/release-builds/${post_seal_sha}" \
  "/srv/leetplus/release-promotions/${post_seal_sha}"
chown root:root -- "/srv/leetplus/release-promotions/${post_seal_sha}"
chmod 0700 -- "/srv/leetplus/release-promotions/${post_seal_sha}"
"$INSTALLED_SEALER" --release-sha "$post_seal_sha" \
  --release-root '/srv/leetplus/release-promotions' \
  --service-user leetplus-api-blue > "${TEST_ROOT}/precrash-seal.out"
[[ ! -e "/var/lib/leetplus/deploy-receipts/release-hydration-attestation-${post_seal_sha}.receipt" ]]
run_promoter "$post_seal_sha" "${TEST_ROOT}/promote-post-seal.out"
assert_promoted_release "$post_seal_sha" "${TEST_ROOT}/promote-post-seal.out"
grep -F -x 'PROMOTED_RELEASE_PUBLICATION_RECONCILED=true' \
  "${TEST_ROOT}/promote-post-seal.out" >/dev/null \
  || die 'post-seal promotion state was not identified as reconciliation'

mount_sha='5555555555555555555555555555555555555555'
prepare_recovery_hydration "$mount_sha"
groupadd --system --non-unique --gid "$(id -g leetplus-build)" \
  leetplus-build-gid-adversarial
created_adversarial_gid_group=true
if "$STAGER_SOURCE" --release-sha "$mount_sha" --preflight-build-uid-fence \
  > "${TEST_ROOT}/stager-gid-alias.out" 2>&1; then
  die 'production stager accepted a second NSS group aliasing the build GID'
fi
grep -F 'another NSS group aliases the leetplus-build GID' \
  "${TEST_ROOT}/stager-gid-alias.out" >/dev/null
if run_promoter "$mount_sha" "${TEST_ROOT}/promoter-gid-alias.out" 2>&1; then
  die 'production promoter accepted a second NSS group aliasing the build GID'
fi
grep -F 'another NSS group aliases the leetplus-build GID' \
  "${TEST_ROOT}/promoter-gid-alias.out" >/dev/null
[[ -d "/srv/leetplus/release-builds/${mount_sha}" \
  && ! -e "/var/lib/leetplus/deploy-receipts/release-promotion-intent-${mount_sha}.receipt" ]] \
  || die 'build-GID alias rejection mutated promotion state'
groupdel --force leetplus-build-gid-adversarial
created_adversarial_gid_group=false
printf 'unlisted-after-hydration\n' \
  > "/srv/leetplus/release-builds/${mount_sha}/unlisted-after-hydration"
chown leetplus-build:leetplus-build \
  "/srv/leetplus/release-builds/${mount_sha}/unlisted-after-hydration"
if run_promoter "$mount_sha" "${TEST_ROOT}/promoter-unlisted-file.out"; then
  die 'promoter accepted a regular file absent from HYDRATED_SHA256SUMS'
fi
grep -F 'hydrated artifact manifest path set is not canonical and exact' \
  "${TEST_ROOT}/promoter-unlisted-file.out" >/dev/null
[[ -d "/srv/leetplus/release-builds/${mount_sha}" \
  && ! -e "/var/lib/leetplus/deploy-receipts/release-promotion-intent-${mount_sha}.receipt" ]] \
  || die 'unlisted-file rejection mutated promotion state'
rm -- "/srv/leetplus/release-builds/${mount_sha}/unlisted-after-hydration"
exact_root_mount_source="${TEST_ROOT}/exact-root-bind-source"
install -d -o root -g root -m 0700 "$exact_root_mount_source"
for exact_mount_target in \
  '/srv/leetplus/release-builds' \
  '/srv/leetplus/release-promotions' \
  '/srv/leetplus/releases' \
  '/var/lib/leetplus/deploy-receipts'; do
  mount --bind "$exact_root_mount_source" "$exact_mount_target"
  active_mounts+=("$exact_mount_target")
  exact_mount_label="$(basename -- "$exact_mount_target")"
  if run_promoter "$mount_sha" "${TEST_ROOT}/promote-exact-mount-${exact_mount_label}.out"; then
    die "promoter accepted exact managed-root bind mount: ${exact_mount_target}"
  fi
  grep -F 'managed promotion boundary contains an exact or candidate/receipt nested mountpoint' \
    "${TEST_ROOT}/promote-exact-mount-${exact_mount_label}.out" >/dev/null
  umount -- "$exact_mount_target"
  unset "active_mounts[$((${#active_mounts[@]} - 1))]"
done
[[ -d "/srv/leetplus/release-builds/${mount_sha}" \
  && ! -e "/var/lib/leetplus/deploy-receipts/release-promotion-intent-${mount_sha}.receipt" ]] \
  || die 'exact managed-root mount rejection mutated promotion state'
mount_source="${TEST_ROOT}/promotion-bind-source"
mkdir -p -- "$mount_source"
candidate_mount="/srv/leetplus/release-builds/${mount_sha}/apps/api"
mount --bind "$mount_source" "$candidate_mount"
active_mounts+=("$candidate_mount")
if run_promoter "$mount_sha" "${TEST_ROOT}/promote-candidate-mount.out" 2>&1; then
  die 'promoter accepted a nested candidate bind mount'
fi
grep -F 'managed promotion boundary contains an exact or candidate/receipt nested mountpoint' \
  "${TEST_ROOT}/promote-candidate-mount.out" >/dev/null
[[ -d "/srv/leetplus/release-builds/${mount_sha}" \
  && ! -e "/var/lib/leetplus/deploy-receipts/release-promotion-intent-${mount_sha}.receipt" ]] \
  || die 'candidate mount rejection mutated promotion state'
umount -- "$candidate_mount"
unset "active_mounts[$((${#active_mounts[@]} - 1))]"

receipt_mount_source="${TEST_ROOT}/receipt-bind-source"
receipt_mount_target='/var/lib/leetplus/deploy-receipts/mount-probe'
mkdir -p -- "$receipt_mount_source" "$receipt_mount_target"
mount --bind "$receipt_mount_source" "$receipt_mount_target"
active_mounts+=("$receipt_mount_target")
if run_promoter "$mount_sha" "${TEST_ROOT}/promote-receipt-mount.out" 2>&1; then
  die 'promoter accepted a nested receipt bind mount'
fi
grep -F 'managed promotion boundary contains an exact or candidate/receipt nested mountpoint' \
  "${TEST_ROOT}/promote-receipt-mount.out" >/dev/null
[[ -d "/srv/leetplus/release-builds/${mount_sha}" \
  && ! -e "/var/lib/leetplus/deploy-receipts/release-promotion-intent-${mount_sha}.receipt" ]] \
  || die 'receipt mount rejection mutated promotion state'
umount -- "$receipt_mount_target"
unset "active_mounts[$((${#active_mounts[@]} - 1))]"
rmdir -- "$receipt_mount_target"
timeout --foreground --kill-after=5s 20s \
  systemctl stop "leetplus-release-hydrate@${mount_sha}.service"

printf 'release hydration systemd attestation fixture: PASS\n'
