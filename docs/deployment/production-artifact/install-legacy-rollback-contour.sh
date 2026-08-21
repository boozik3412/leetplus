#!/usr/bin/bash -p
# Install only reviewed, versioned first-cutover rollback control files. This
# script never starts a unit, reloads nginx, changes routing or touches a DB.

[[ $- == *p* ]] || { printf 'install-legacy-rollback-contour: privileged Bash mode is required\n' >&2; exit 1; }
LEETPLUS_BOOTSTRAP_TEST_PATH=''
LEETPLUS_BOOTSTRAP_IS_TEST=false
LEETPLUS_BOOTSTRAP_AUTHORITY_DIGEST="${LEETPLUS_ROLLBACK_CONTROL_AUTHORITY_MANIFEST_SHA256:-}"
[[ -z "$LEETPLUS_BOOTSTRAP_AUTHORITY_DIGEST" || "$LEETPLUS_BOOTSTRAP_AUTHORITY_DIGEST" =~ ^[0-9a-f]{64}$ ]] \
  || { printf 'install-legacy-rollback-contour: authority manifest digest is malformed before environment scrub\n' >&2; exit 1; }
declare -a LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT=()
for LEETPLUS_BOOTSTRAP_ARGUMENT in "$@"; do
  if [[ "$LEETPLUS_BOOTSTRAP_ARGUMENT" == '--unprivileged-test-mode' && EUID -ne 0 ]]; then
    LEETPLUS_BOOTSTRAP_IS_TEST=true
    LEETPLUS_BOOTSTRAP_TEST_PATH="${PATH:-}"
    break
  fi
done
unset LEETPLUS_BOOTSTRAP_ARGUMENT
if [[ "$LEETPLUS_BOOTSTRAP_IS_TEST" == true ]]; then
  while IFS= read -r LEETPLUS_INHERITED_ENVIRONMENT_NAME; do
    [[ "$LEETPLUS_INHERITED_ENVIRONMENT_NAME" == TEST_* || "$LEETPLUS_INHERITED_ENVIRONMENT_NAME" == LEETPLUS_TEST_* ]] \
      && LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT+=("${LEETPLUS_INHERITED_ENVIRONMENT_NAME}=${!LEETPLUS_INHERITED_ENVIRONMENT_NAME}")
  done < <(compgen -e)
fi
while IFS= read -r LEETPLUS_INHERITED_ENVIRONMENT_NAME; do
  unset "$LEETPLUS_INHERITED_ENVIRONMENT_NAME" 2>/dev/null || true
done < <(compgen -e)
unset LEETPLUS_INHERITED_ENVIRONMENT_NAME
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C.UTF-8'
LC_ALL='C.UTF-8'
TZ='UTC'
export PATH LANG LC_ALL TZ
LEETPLUS_ROLLBACK_CONTROL_AUTHORITY_MANIFEST_SHA256="$LEETPLUS_BOOTSTRAP_AUTHORITY_DIGEST"
unset LEETPLUS_BOOTSTRAP_AUTHORITY_DIGEST
if [[ "$LEETPLUS_BOOTSTRAP_IS_TEST" == true ]]; then
  for LEETPLUS_BOOTSTRAP_TEST_ASSIGNMENT in "${LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT[@]}"; do export "$LEETPLUS_BOOTSTRAP_TEST_ASSIGNMENT"; done
fi
unset LEETPLUS_BOOTSTRAP_IS_TEST LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT LEETPLUS_BOOTSTRAP_TEST_ASSIGNMENT

set -euo pipefail
IFS=$'\n\t'
umask 0027

readonly LEGACY_SHA='7de04ff4ccc814494810730be3fa6bf661097b07'
readonly SCRIPT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly CONTROL_BUNDLE_ID='scheduler-free-nminus1-v1'
readonly EXPECTED_CONTROL_ROOT="/srv/leetplus/control-bundles/${CONTROL_BUNDLE_ID}"
readonly CONTROL_MANIFEST_TRUST_FILE='/etc/leetplus/rollback-control-manifest.sha256'
readonly CONTROL_INSTALL_CONTRACT='LEETPLUS_SCHEDULER_FREE_CONTROL_INSTALL_V1'
readonly CONTROL_INSTALL_PREPARING_NAME='scheduler-free-control-install.preparing'
readonly CONTROL_INSTALL_INTENT_NAME='scheduler-free-control-install.intent'
readonly CONTROL_INSTALL_FENCE_NAME='scheduler-free-control-install.fence'

die() {
  printf 'install-legacy-rollback-contour: %s\n' "$*" >&2
  exit 1
}

source_root="$SCRIPT_ROOT"
release_root='/srv/leetplus/rollback-releases'
etc_root='/etc'
systemd_root='/etc/systemd/system'
libexec_root='/usr/local/libexec/leetplus'
sbin_root='/usr/local/sbin'
nginx_root='/etc/nginx/leetplus'
state_root='/var/lib/leetplus/legacy-drain'
cutover_state_root='/var/lib/leetplus/deploy-receipts'
unprivileged_test_mode=false
verify_source_only=false
verify_destinations_only=false
trusted_authority_install=false

while (($# > 0)); do
  case "$1" in
    --source-root) source_root="${2:-}"; shift 2 ;;
    --release-root) release_root="${2:-}"; shift 2 ;;
    --etc-root) etc_root="${2:-}"; shift 2 ;;
    --systemd-root) systemd_root="${2:-}"; shift 2 ;;
    --libexec-root) libexec_root="${2:-}"; shift 2 ;;
    --sbin-root) sbin_root="${2:-}"; shift 2 ;;
    --nginx-root) nginx_root="${2:-}"; shift 2 ;;
    --state-root) state_root="${2:-}"; shift 2 ;;
    --cutover-state-root) cutover_state_root="${2:-}"; shift 2 ;;
    --unprivileged-test-mode) unprivileged_test_mode=true; shift ;;
    --verify-source-only) verify_source_only=true; shift ;;
    --verify-destinations-only) verify_destinations_only=true; shift ;;
    --trusted-authority-install) trusted_authority_install=true; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

if [[ "$unprivileged_test_mode" == true ]]; then
  ((EUID != 0)) || die 'unprivileged test mode is forbidden for root'
  PATH="$LEETPLUS_BOOTSTRAP_TEST_PATH"
  export PATH
else
  ((EUID == 0)) || die 'production installation must run as root'
  [[ "$source_root" == "$SCRIPT_ROOT" && "$SCRIPT_ROOT" == "$EXPECTED_CONTROL_ROOT" ]] \
    || die 'production installer must execute from the exact immutable reviewed control bundle'
  [[ "$release_root" == '/srv/leetplus/rollback-releases' ]] || die 'production release root cannot be overridden'
  [[ "$etc_root" == '/etc' && "$systemd_root" == '/etc/systemd/system' ]] || die 'production configuration roots cannot be overridden'
  [[ "$libexec_root" == '/usr/local/libexec/leetplus' && "$sbin_root" == '/usr/local/sbin' \
    && "$nginx_root" == '/etc/nginx/leetplus' ]] || die 'production install roots cannot be overridden'
  [[ "$state_root" == '/var/lib/leetplus/legacy-drain' ]] || die 'production state root cannot be overridden'
  [[ "$cutover_state_root" == '/var/lib/leetplus/deploy-receipts' ]] || die 'production cutover state root cannot be overridden'
fi
unset LEETPLUS_BOOTSTRAP_TEST_PATH

for command_name in awk cat chmod chown cmp dd dirname find grep id install mkdir mktemp mv readlink realpath rm rmdir sed sha256sum sort stat sync tr wc; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done
if [[ "$unprivileged_test_mode" == false ]]; then
  for command_name in findmnt flock getent ss systemctl timeout; do
    command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
  done
fi

control_manifest="${source_root}/CONTROL_BUNDLE_SHA256SUMS"
if [[ "$unprivileged_test_mode" == false ]]; then
  for trusted_ancestor in /srv /srv/leetplus /srv/leetplus/control-bundles "$source_root"; do
    [[ -d "$trusted_ancestor" && ! -L "$trusted_ancestor" \
      && "$(realpath -e -- "$trusted_ancestor")" == "$trusted_ancestor" \
      && "$(stat -c '%U:%G' -- "$trusted_ancestor")" == 'root:root' \
      && -z "$(find -P "$trusted_ancestor" -maxdepth 0 -perm /022 -print -quit)" ]] \
      || die "control-bundle ancestor is not root-owned immutable: ${trusted_ancestor}"
  done
  [[ -f "$control_manifest" && ! -L "$control_manifest" \
    && "$(stat -c '%U:%G:%a' -- "$control_manifest")" == 'root:root:400' ]] \
    || die 'control bundle manifest is absent, symlinked or not root:root mode 0400'
  [[ -f "$CONTROL_MANIFEST_TRUST_FILE" && ! -L "$CONTROL_MANIFEST_TRUST_FILE" \
    && "$(stat -c '%U:%G:%a' -- "$CONTROL_MANIFEST_TRUST_FILE")" == 'root:root:400' ]] \
    || die 'independent control-manifest trust file is absent or unsafe'
  expected_control_manifest_sha="$(tr -d '\r\n' < "$CONTROL_MANIFEST_TRUST_FILE")"
  [[ "$expected_control_manifest_sha" =~ ^[0-9a-f]{64}$ \
    && "$(sha256sum "$control_manifest" | awk '{ print $1 }')" == "$expected_control_manifest_sha" ]] \
    || die 'control bundle manifest digest is not the reviewed digest'
  mount_inventory="$(findmnt --raw --noheadings --output TARGET)" \
    || die 'control-bundle mount inventory failed or returned partial output'
  while IFS= read -r mount_target; do
    case "$mount_target" in
      "$source_root"|"$source_root"/*) die "control bundle contains an exact/nested mount: ${mount_target}" ;;
    esac
  done <<< "$mount_inventory"
  [[ -z "$(find -P "$source_root" -xdev ! -type d ! -type f -print -quit)" ]] \
    || die 'control bundle contains a symlink or special entry'
  [[ -z "$(find -P "$source_root" -xdev \
    \( ! -user root -o ! -group root -o -perm /022 \) -print -quit)" ]] \
    || die 'control bundle contains a non-root-owned or writable entry'
  [[ -z "$(find -P "$source_root" -xdev -type f -links +1 -print -quit)" ]] \
    || die 'control bundle contains a hard-linked source file'
  if ! awk '
    {
      relative = $2
      sub(/^\.\//, "", relative)
    }
    NF != 2 || length($1) != 64 || $1 !~ /^[0-9a-f]+$/ || $2 !~ /^\.\/[A-Za-z0-9_.@+\/-]+$/ || relative ~ /(^|\/)\.\.?(\/|$)/ { exit 1 }
  ' \
    "$control_manifest"; then
    die 'control bundle manifest is malformed'
  fi
  (
    cd -- "$source_root"
    sha256sum --check --strict --quiet CONTROL_BUNDLE_SHA256SUMS
  ) || die 'control bundle source drifted from its reviewed manifest'
  manifest_paths="$(awk '{ print $2 }' "$control_manifest" | LC_ALL=C sort)"
  actual_paths="$(cd -- "$source_root" && find . -xdev -type f ! -path './CONTROL_BUNDLE_SHA256SUMS' -print | LC_ALL=C sort)"
  [[ "$manifest_paths" == "$actual_paths" ]] || die 'control bundle manifest does not cover the exact file set'
  if [[ "$verify_source_only" == true ]]; then
    printf 'LEGACY_ROLLBACK_CONTROL_BUNDLE_ACCEPTED=true\n'
    printf 'LEGACY_ROLLBACK_CONTROL_BUNDLE_ID=%s\n' "$CONTROL_BUNDLE_ID"
    exit 0
  fi
  if [[ "$verify_destinations_only" == false ]]; then
    [[ "$trusted_authority_install" == true \
      && "${LEETPLUS_ROLLBACK_CONTROL_AUTHORITY_MANIFEST_SHA256:-}" == "$expected_control_manifest_sha" ]] \
      || die 'production install is fail-closed: provision this accepted bundle only through the trusted artifact deployment authority'
    unset LEETPLUS_ROLLBACK_CONTROL_AUTHORITY_MANIFEST_SHA256
  fi
else
  [[ "$verify_source_only" == false ]] || die 'source-only authority test requires the production root contract'
  [[ "$verify_destinations_only" == false ]] \
    || die 'destination-boundary verification is production-only'
  [[ "$trusted_authority_install" == false ]] \
    || die 'trusted-authority install mode is production-only'
fi
control_manifest_sha="$(sha256sum "$control_manifest" | awk '{ print $1 }')"
[[ "$control_manifest_sha" =~ ^[0-9a-f]{64}$ ]] \
  || die 'control bundle manifest digest is malformed'

leetplus_root="${etc_root}/leetplus"
runtime_environment="${leetplus_root}/rollback-runtime.env"
web_runtime_environment="${leetplus_root}/rollback-web-runtime.env"
pg_service_file="${leetplus_root}/pg_service.conf"
database_target_file="${leetplus_root}/legacy-drain-database-target.conf"
unit_manifest_file="${leetplus_root}/legacy-drain-units.conf"
smoke_credentials_file="${leetplus_root}/legacy-rollback-smoke.env"

validate_existing_path_components() {
  local target="$1" current='' component
  local -a components=()
  [[ "$target" == /* && "$target" =~ ^/[A-Za-z0-9_./@+-]+$ ]] \
    || die "install destination path is noncanonical: ${target}"
  [[ -d / && ! -L / && "$(stat -c '%U:%G' -- /)" == 'root:root' \
    && -z "$(find -P / -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die 'filesystem root is not a trusted install ancestor'
  IFS='/' read -r -a components <<< "${target#/}"
  for component in "${components[@]}"; do
    [[ -n "$component" && "$component" != '.' && "$component" != '..' ]] \
      || die "install destination contains an unsafe component: ${target}"
    current="${current}/${component}"
    if [[ ! -e "$current" && ! -L "$current" ]]; then
      break
    fi
    [[ -d "$current" && ! -L "$current" \
      && "$(realpath -e -- "$current")" == "$current" \
      && "$(stat -c '%U:%G' -- "$current")" == 'root:root' \
      && -z "$(find -P "$current" -maxdepth 0 -perm /022 -print -quit)" ]] \
      || die "install destination ancestor is not canonical root-controlled: ${current}"
  done
}

if [[ "$unprivileged_test_mode" == false ]]; then
  destination_roots=(
    "$systemd_root"
    "${systemd_root}/nginx.service.d"
    "$libexec_root"
    "$sbin_root"
    "$nginx_root"
    "${nginx_root}/upstreams"
    "$state_root"
    "$leetplus_root"
  )
  destination_mount_inventory="$(findmnt --raw --noheadings --output TARGET)" \
    || die 'install destination mount inventory failed or returned partial output'
  for destination_root in "${destination_roots[@]}"; do
    validate_existing_path_components "$destination_root"
    while IFS= read -r mount_target; do
      case "$mount_target" in
        "$destination_root"|"$destination_root"/*)
          die "install destination contains an exact/nested mount: ${mount_target}"
          ;;
      esac
      if [[ "$mount_target" != / ]]; then
        case "$destination_root" in
          "$mount_target"|"$mount_target"/*)
            die "install destination ancestor is a separate mount: ${mount_target}"
            ;;
        esac
      fi
    done <<< "$destination_mount_inventory"
  done
  if [[ "$verify_destinations_only" == true ]]; then
    printf 'LEGACY_ROLLBACK_INSTALL_DESTINATIONS_ACCEPTED=true\n'
    exit 0
  fi
fi

systemd_source="${source_root}/systemd"
nginx_source="${source_root}/nginx"
for source_file in \
  "${source_root}/preflight-legacy-rollback.sh" \
  "${source_root}/apply-legacy-rollback-egress.sh" \
  "${source_root}/apply-legacy-database-login-fence.sh" \
  "${source_root}/legacy-rollback-auth-edge.mjs" \
  "${source_root}/legacy-rollback-child-loopback.cjs" \
  "${source_root}/verify-legacy-rollback-authenticated-reads.mjs" \
  "${source_root}/verify-legacy-runtime-drain.sh" \
  "${source_root}/verify-legacy-rollback-readiness.sh" \
  "${source_root}/activate-legacy-rollback-contour.sh" \
  "${source_root}/blue-green-cutover.sh" \
  "${systemd_source}/leetplus-api-rollback@.service" \
  "${systemd_source}/leetplus-web-rollback@.service" \
  "${systemd_source}/leetplus-rollback-egress.service" \
  "${systemd_source}/leetplus-blue-green-recovery.service" \
  "${systemd_source}/leetplus-blue-green-recovery-watchdog.service" \
  "${systemd_source}/leetplus-blue-green-recovery.timer" \
  "${systemd_source}/nginx.service.d/leetplus-blue-green-recovery.conf" \
  "${systemd_source}/legacy-rollback-safe.env.example" \
  "${systemd_source}/legacy-rollback-7de04ff4.env.example" \
  "${systemd_source}/legacy-drain-units.conf.example" \
  "${systemd_source}/legacy-drain-database-target.conf.example" \
  "${systemd_source}/legacy-database-login-fence-authority.sql.example" \
  "${nginx_source}/legacy-safe.conf.example" \
  "${nginx_source}/blue.conf.example" \
  "${nginx_source}/green.conf.example"; do
  [[ -f "$source_file" && ! -L "$source_file" ]] || die "reviewed source file is absent or symlinked: ${source_file}"
done

release_directory="${release_root}/${LEGACY_SHA}"
[[ -d "$release_directory" && ! -L "$release_directory" ]] || die 'exact offline-built rollback release is absent or symlinked'
release_directory="$(realpath -e -- "$release_directory")"
[[ "$(tr -d '\r\n' < "${release_directory}/.leetplus-source-sha")" == "$LEGACY_SHA" ]] \
  || die 'rollback release source marker is not exact 7de04ff4'
(
  cd -- "$release_directory"
  sha256sum --check --strict --quiet N_MINUS_ONE_SHA256SUMS
) || die 'rollback release integrity manifest failed'

if [[ "$unprivileged_test_mode" == false ]]; then
  release_mount_inventory="$(findmnt --raw --noheadings --output TARGET)" \
    || die 'rollback release mount inventory failed or returned partial output'
  while IFS= read -r mount_target; do
    case "$mount_target" in
      "$release_directory"|"$release_directory"/*)
        die "rollback release contains an exact/nested mount: ${mount_target}"
        ;;
    esac
  done <<< "$release_mount_inventory"
  [[ "$(stat -c '%U:%G' -- "$release_root" "$release_directory" | sort -u)" == 'root:leetplus-runtime' ]] \
    || die 'rollback release root/directory must be root:leetplus-runtime'
  [[ -z "$(find -P "$release_directory" -xdev \( ! -user root -o ! -group leetplus-runtime -o -perm /022 \) -print -quit)" ]] \
    || die 'rollback release ownership/write boundary is unsafe'
fi

runtime_cache="${release_directory}/apps/web/.next/cache"
[[ -d "$runtime_cache" && ! -L "$runtime_cache" ]] || die 'rollback Web cache bind target is absent or symlinked'
[[ -z "$(find -P "$runtime_cache" -mindepth 1 -print -quit)" ]] \
  || die 'rollback Web cache bind target must be empty before installation'

if [[ "$unprivileged_test_mode" == false ]]; then
  [[ -d "$cutover_state_root" && ! -L "$cutover_state_root" \
    && "$(stat -c '%U:%a' -- "$cutover_state_root")" == 'root:700' ]] \
    || die 'blue/green cutover state root is absent or unsafe'
else
  [[ -d "$cutover_state_root" && ! -L "$cutover_state_root" ]] \
    || die 'test cutover state root is absent or unsafe'
fi

if [[ "$unprivileged_test_mode" == false || "${TEST_NSS_ATTESTATION:-false}" == true ]]; then
  nss_proc_root='/proc'
  if [[ "$unprivileged_test_mode" == true ]]; then
    nss_proc_root="${TEST_PROC_ROOT:-}"
    [[ "$nss_proc_root" == /* && -d "$nss_proc_root" && ! -L "$nss_proc_root" ]] \
      || die 'test NSS process root is absent or noncanonical'
  fi
  command -v getent >/dev/null 2>&1 || die 'required command is unavailable: getent'
  command -v timeout >/dev/null 2>&1 || die 'required command is unavailable: timeout'
  passwd_inventory="$(timeout --foreground --kill-after=2s 10s getent passwd)" \
    || die 'complete passwd inventory failed or timed out'
  group_inventory="$(timeout --foreground --kill-after=2s 10s getent group)" \
    || die 'complete group inventory failed or timed out'
  [[ -n "$passwd_inventory" && -n "$group_inventory" \
    && ${#passwd_inventory} -le 1048576 && ${#group_inventory} -le 1048576 \
    && "$passwd_inventory" != *$'\r'* && "$group_inventory" != *$'\r'* ]] \
    || die 'complete NSS inventory is empty, oversized or noncanonical'
  runtime_group_line="$(awk -F: '$1 == "leetplus-runtime" { print }' <<< "$group_inventory")"
  [[ "$runtime_group_line" != *$'\n'* ]] || die 'leetplus-runtime group name is ambiguous'
  IFS=: read -r runtime_group_name runtime_group_password runtime_gid runtime_group_members <<< "$runtime_group_line"
  [[ "$runtime_group_name" == leetplus-runtime && "$runtime_group_password" == x \
    && "$runtime_gid" =~ ^[1-9][0-9]{1,8}$ && -z "$runtime_group_members" \
    && "$(awk -F: -v gid="$runtime_gid" '$3 == gid { count += 1 } END { print count + 0 }' <<< "$group_inventory")" == 1 ]] \
    || die 'leetplus-runtime group identity/GID/member contract is not exact'
  api_runtime_group_line="$(awk -F: '$1 == "leetplus-api-runtime" { print }' <<< "$group_inventory")"
  web_runtime_group_line="$(awk -F: '$1 == "leetplus-web-runtime" { print }' <<< "$group_inventory")"
  [[ -n "$api_runtime_group_line" && "$api_runtime_group_line" != *$'\n'* \
    && -n "$web_runtime_group_line" && "$web_runtime_group_line" != *$'\n'* ]] \
    || die 'API/Web runtime secret group name is absent or ambiguous'
  api_runtime_gid="$(awk -F: '{ print $3 }' <<< "$api_runtime_group_line")"
  web_runtime_gid="$(awk -F: '{ print $3 }' <<< "$web_runtime_group_line")"
  [[ "$api_runtime_gid" =~ ^[1-9][0-9]{1,8}$ && "$web_runtime_gid" =~ ^[1-9][0-9]{1,8}$ \
    && "$runtime_gid" != "$api_runtime_gid" && "$runtime_gid" != "$web_runtime_gid" \
    && "$api_runtime_gid" != "$web_runtime_gid" ]] \
    || die 'runtime secret group GIDs are invalid or aliased'
  shared_primary_identities="$(awk -F: -v gid="$runtime_gid" '$4 == gid { print $1 }' <<< "$passwd_inventory" \
    | LC_ALL=C sort | awk 'BEGIN { out="" } { out=(out == "" ? $0 : out "," $0) } END { print out }')"
  api_primary_identities="$(awk -F: -v gid="$api_runtime_gid" '$4 == gid { print $1 }' <<< "$passwd_inventory" \
    | LC_ALL=C sort | awk 'BEGIN { out="" } { out=(out == "" ? $0 : out "," $0) } END { print out }')"
  web_primary_identities="$(awk -F: -v gid="$web_runtime_gid" '$4 == gid { print $1 }' <<< "$passwd_inventory" \
    | LC_ALL=C sort | awk 'BEGIN { out="" } { out=(out == "" ? $0 : out "," $0) } END { print out }')"
  [[ "$shared_primary_identities" == 'leetplus-api-blue,leetplus-api-green,leetplus-api-nminus1,leetplus-web-blue,leetplus-web-green,leetplus-web-nminus1' \
    && -z "$api_primary_identities" && -z "$web_primary_identities" ]] \
    || die 'runtime secret-group reverse primary-GID sets are not exact'
  process_status_has_uid() {
    local status_file="$1" expected_uid="$2" process_directory before_identity after_identity status_content status_result
    process_directory="$(dirname -- "$status_file")"
    [[ -d "$process_directory" ]] || return 1
    before_identity="$(stat -Lc '%d:%i:%f' -- "$status_file" 2>/dev/null)" || {
      [[ ! -d "$process_directory" ]] && return 1
      return 2
    }
    [[ "$before_identity" =~ :8[0-9a-f][0-9a-f][0-9a-f]$ ]] || return 2
    status_content="$(timeout --foreground --kill-after=1s 3s \
      dd if="$status_file" iflag=nofollow status=none 2>/dev/null)" || {
      [[ ! -d "$process_directory" ]] && return 1
      return 2
    }
    after_identity="$(stat -Lc '%d:%i:%f' -- "$status_file" 2>/dev/null)" || {
      [[ ! -d "$process_directory" ]] && return 1
      return 2
    }
    [[ "$before_identity" == "$after_identity" ]] || {
      [[ ! -d "$process_directory" ]] && return 1
      return 2
    }
    if awk -v expected_uid="$expected_uid" '
      $1 == "Uid:" { seen += 1; match_uid=($2 == expected_uid || $3 == expected_uid || $4 == expected_uid || $5 == expected_uid) }
      END { if (seen != 1) exit 2; exit !match_uid }
    ' <<< "$status_content"; then
      return 0
    else
      status_result=$?
    fi
    [[ "$status_result" == 1 ]] && return 1
    return 2
  }
  attest_install_identity() {
    local identity="$1" supplementary_group="$2" passwd_line name password uid gid gecos home shell
    local expected_groups actual_groups status_file supplementary_line supplementary_name supplementary_password
    local supplementary_gid supplementary_members expected_supplementary_members
    passwd_line="$(awk -F: -v identity="$identity" '$1 == identity { print }' <<< "$passwd_inventory")"
    [[ -n "$passwd_line" && "$passwd_line" != *$'\n'* ]] \
      || die "service identity is absent or ambiguous in the complete passwd inventory: ${identity}"
    IFS=: read -r name password uid gid gecos home shell <<< "$passwd_line"
    [[ "$name" == "$identity" && "$password" == x && "$uid" =~ ^[1-9][0-9]{1,8}$ \
      && "$gid" == "$runtime_gid" && -z "$gecos" && "$home" == /nonexistent \
      && "$shell" == /usr/sbin/nologin ]] \
      || die "service identity passwd contract is not exact: ${identity}"
    [[ ! -e "$home" && ! -L "$home" ]] || die 'rollback service no-home path unexpectedly exists'
    [[ "$(awk -F: -v uid="$uid" '$3 == uid { print }' <<< "$passwd_inventory")" == "$passwd_line" ]] \
      || die "rollback service UID is not uniquely bound to its identity: ${identity}"
    supplementary_line="$(awk -F: -v group="$supplementary_group" '$1 == group { print }' <<< "$group_inventory")"
    [[ -n "$supplementary_line" && "$supplementary_line" != *$'\n'* ]] \
      || die "rollback supplementary group is absent or name-ambiguous: ${supplementary_group}"
    IFS=: read -r supplementary_name supplementary_password supplementary_gid supplementary_members <<< "$supplementary_line"
    if [[ "$supplementary_group" == leetplus-api-runtime ]]; then
      expected_supplementary_members='leetplus-api-blue,leetplus-api-green,leetplus-api-nminus1'
    else
      expected_supplementary_members='leetplus-web-blue,leetplus-web-green,leetplus-web-nminus1'
    fi
    [[ "$supplementary_name" == "$supplementary_group" && "$supplementary_password" == x \
      && "$supplementary_gid" =~ ^[1-9][0-9]{1,8}$ \
      && "$(tr ',' '\n' <<< "$supplementary_members" | LC_ALL=C sort | tr '\n' ',' | sed 's/,$//')" == "$expected_supplementary_members" \
      && "$(awk -F: -v gid="$supplementary_gid" '$3 == gid { count += 1 } END { print count + 0 }' <<< "$group_inventory")" == 1 ]] \
      || die "rollback supplementary group GID/member contract is not exact: ${supplementary_group}"
    expected_groups="$(printf '%s\n' leetplus-runtime "$supplementary_group" | LC_ALL=C sort)"
    actual_groups="$(id -nG "$identity" | tr ' ' '\n' | awk 'NF' | LC_ALL=C sort -u)"
    [[ "$actual_groups" == "$expected_groups" ]] \
      || die "rollback service supplementary groups are not exact: ${identity}"
    for status_file in "$nss_proc_root"/[0-9]*/status; do
      if process_status_has_uid "$status_file" "$uid"; then
        die "rollback service UID already owns a foreign process before installation: ${identity}:${status_file}"
      else
        status_result=$?
        [[ "$status_result" == 1 ]] \
          || die "cannot prove stable complete pre-install UID process inventory: ${status_file}"
      fi
    done
  }
  attest_install_identity leetplus-api-nminus1 leetplus-api-runtime
  attest_install_identity leetplus-web-nminus1 leetplus-web-runtime
fi

if [[ "$unprivileged_test_mode" == false ]]; then
  for secret_file in "$runtime_environment" "$web_runtime_environment" "$pg_service_file" "$database_target_file" \
    "$unit_manifest_file" "$smoke_credentials_file"; do
    [[ -f "$secret_file" && ! -L "$secret_file" ]] || die "operator-created runtime file is absent or symlinked: ${secret_file}"
  done
  [[ "$(stat -c '%U:%G:%a' -- "$runtime_environment")" == 'root:leetplus-api-runtime:640' ]] \
    || die 'rollback API runtime env must be root:leetplus-api-runtime mode 0640'
  [[ "$(stat -c '%U:%G:%a' -- "$web_runtime_environment")" == 'root:leetplus-web-runtime:640' ]] \
    || die 'rollback Web runtime env must be root:leetplus-web-runtime mode 0640'
  [[ "$(stat -c '%U:%G:%a' -- "$pg_service_file")" == 'root:root:600' ]] \
    || die 'PostgreSQL audit service file must be root:root mode 0600'
  [[ "$(stat -c '%U:%G:%a' -- "$database_target_file")" == 'root:root:600' ]] \
    || die 'PostgreSQL target identity file must be root:root mode 0600'
  [[ "$(stat -c '%U:%G:%a' -- "$unit_manifest_file")" == 'root:root:600' ]] \
    || die 'reviewed legacy unit manifest must be root:root mode 0600'
  [[ "$(stat -c '%U:%G:%a' -- "$smoke_credentials_file")" == 'root:root:600' ]] \
    || die 'authenticated smoke credentials must be root:root mode 0600'
  if grep -E '(^|_)(DATABASE_URL|JWT_SECRET|PASSWORD|TOKEN|SECRET|HMAC_KEY|ENCRYPTION_KEY|API_KEY)=' "$web_runtime_environment" >/dev/null; then
    die 'rollback Web runtime environment contains an API/provider credential'
  fi
fi

declare -a install_modes=() install_sources=() install_destinations=() install_groups=()
declare -a install_directory_modes=() install_directories=() install_directory_groups=()
declare -a protected_units=(
  'leetplus-api-rollback@.service'
  "leetplus-api-rollback@${LEGACY_SHA}.service"
  'leetplus-web-rollback@.service'
  "leetplus-web-rollback@${LEGACY_SHA}.service"
  'leetplus-rollback-egress.service'
  'leetplus-blue-green-recovery.service'
  'leetplus-blue-green-recovery-watchdog.service'
  'leetplus-blue-green-recovery.timer'
)

add_install_file() {
  install_modes+=("$1")
  install_sources+=("$2")
  install_destinations+=("$3")
  install_groups+=("${4:-root}")
}

add_install_directory() {
  install_directory_modes+=("$1")
  install_directories+=("$2")
  install_directory_groups+=("${3:-root}")
}

add_install_directory 0755 "$systemd_root"
add_install_directory 0755 "${systemd_root}/nginx.service.d"
add_install_directory 0755 "$(dirname -- "$libexec_root")"
add_install_directory 0755 "$libexec_root"
add_install_directory 0755 "$sbin_root"
add_install_directory 0755 "$(dirname -- "$nginx_root")"
add_install_directory 0755 "$nginx_root"
add_install_directory 0755 "${nginx_root}/upstreams"
add_install_directory 0755 "$(dirname -- "$state_root")"
add_install_directory 0700 "$state_root"
add_install_directory 0755 "$leetplus_root"
add_install_directory 0750 "${leetplus_root}/rollback-releases" leetplus-runtime

add_install_file 0755 "${source_root}/preflight-legacy-rollback.sh" "${libexec_root}/preflight-legacy-rollback.sh"
add_install_file 0755 "${source_root}/apply-legacy-rollback-egress.sh" "${libexec_root}/apply-legacy-rollback-egress.sh"
add_install_file 0755 "${source_root}/apply-legacy-database-login-fence.sh" "${libexec_root}/apply-legacy-database-login-fence.sh"
add_install_file 0755 "${source_root}/legacy-rollback-auth-edge.mjs" "${libexec_root}/legacy-rollback-auth-edge.mjs"
add_install_file 0444 "${source_root}/legacy-rollback-child-loopback.cjs" "${libexec_root}/legacy-rollback-child-loopback.cjs"
add_install_file 0444 "${systemd_source}/legacy-database-login-fence-authority.sql.example" \
  "${libexec_root}/legacy-database-login-fence-authority.sql"
add_install_file 0755 "${source_root}/verify-legacy-rollback-authenticated-reads.mjs" "${libexec_root}/verify-legacy-rollback-authenticated-reads.mjs"
add_install_file 0755 "${source_root}/verify-legacy-runtime-drain.sh" "${libexec_root}/verify-legacy-runtime-drain.sh"
add_install_file 0755 "${source_root}/verify-legacy-rollback-readiness.sh" "${libexec_root}/verify-legacy-rollback-readiness.sh"
add_install_file 0755 "${source_root}/activate-legacy-rollback-contour.sh" "${libexec_root}/activate-legacy-rollback-contour.sh"
add_install_file 0755 "${source_root}/blue-green-cutover.sh" "${sbin_root}/leetplus-blue-green-cutover"
add_install_file 0644 "${systemd_source}/leetplus-api-rollback@.service" "${systemd_root}/leetplus-api-rollback@.service"
add_install_file 0644 "${systemd_source}/leetplus-web-rollback@.service" "${systemd_root}/leetplus-web-rollback@.service"
add_install_file 0644 "${systemd_source}/leetplus-rollback-egress.service" "${systemd_root}/leetplus-rollback-egress.service"
add_install_file 0644 "${systemd_source}/leetplus-blue-green-recovery.service" "${systemd_root}/leetplus-blue-green-recovery.service"
add_install_file 0644 "${systemd_source}/leetplus-blue-green-recovery-watchdog.service" "${systemd_root}/leetplus-blue-green-recovery-watchdog.service"
add_install_file 0644 "${systemd_source}/leetplus-blue-green-recovery.timer" "${systemd_root}/leetplus-blue-green-recovery.timer"
add_install_file 0644 "${systemd_source}/nginx.service.d/leetplus-blue-green-recovery.conf" \
  "${systemd_root}/nginx.service.d/leetplus-blue-green-recovery.conf"
add_install_file 0440 "${systemd_source}/legacy-rollback-safe.env.example" "${leetplus_root}/rollback-safe.env" leetplus-runtime
add_install_file 0440 "${systemd_source}/legacy-rollback-7de04ff4.env.example" "${leetplus_root}/rollback-releases/${LEGACY_SHA}.env" leetplus-runtime
if [[ "$unprivileged_test_mode" == true ]]; then
  add_install_file 0600 "${systemd_source}/legacy-drain-units.conf.example" "$unit_manifest_file"
fi
add_install_file 0644 "${nginx_source}/legacy-safe.conf.example" "${nginx_root}/upstreams/legacy-safe.conf"
add_install_file 0644 "${nginx_source}/blue.conf.example" "${nginx_root}/upstreams/blue.conf"
add_install_file 0644 "${nginx_source}/green.conf.example" "${nginx_root}/upstreams/green.conf"

expected_file_identity() {
  local mode="$1" group="$2" owner='root' effective_mode
  effective_mode="${mode#0}"
  if [[ "$unprivileged_test_mode" == true ]]; then
    owner="$(id -un)"
    group="$(id -gn)"
    if [[ "${TEST_INSTALL_MSYS_MODE_COMPAT:-false}" == true ]]; then
      case "$effective_mode" in
        400|440|444) effective_mode=440 ;;
        *) effective_mode=640 ;;
      esac
    fi
  fi
  printf '%s:%s:%s:1\n' "$owner" "$group" "$effective_mode"
}

declare -A planned_destinations=() drifting_destinations=()
for destination in "${install_destinations[@]}"; do
  [[ -z "${planned_destinations[$destination]+x}" ]] \
    || die "install plan contains a duplicate destination: ${destination}"
  planned_destinations["$destination"]=true
done
for destination in "${install_directories[@]}"; do
  planned_destinations["$destination"]=true
done
[[ "$unprivileged_test_mode" == true ]] || planned_destinations["$runtime_cache"]=true

install_plan_sha="$({
  printf 'CONTRACT=%s\n' "$CONTROL_INSTALL_CONTRACT"
  printf 'CONTROL_MANIFEST_SHA256=%s\n' "$control_manifest_sha"
  for ((plan_index = 0; plan_index < ${#install_destinations[@]}; plan_index += 1)); do
    printf 'FILE=%s|%s|%s|%s\n' \
      "${install_destinations[$plan_index]}" "${install_modes[$plan_index]}" \
      "${install_groups[$plan_index]}" \
      "$(sha256sum "${install_sources[$plan_index]}" | awk '{ print $1 }')"
  done
  for ((plan_index = 0; plan_index < ${#install_directories[@]}; plan_index += 1)); do
    printf 'DIRECTORY=%s|%s|%s\n' \
      "${install_directories[$plan_index]}" "${install_directory_modes[$plan_index]}" \
      "${install_directory_groups[$plan_index]}"
  done
  [[ "$unprivileged_test_mode" == true ]] \
    || printf 'CACHE=%s|root|leetplus-runtime|550\n' "$runtime_cache"
} | sha256sum | awk '{ print $1 }')" \
  || die 'failed to compute the canonical install plan digest'
[[ "$install_plan_sha" =~ ^[0-9a-f]{64}$ ]] || die 'install plan digest is malformed'

compute_install_drift() {
  local index destination source mode group expected_identity expected_owner expected_group expected_mode
  drift_count=0
  drifting_destinations=()
  for ((index = 0; index < ${#install_directories[@]}; index += 1)); do
    destination="${install_directories[$index]}"
    if [[ ! -e "$destination" && ! -L "$destination" ]]; then
      drifting_destinations["$destination"]=true
      ((drift_count += 1))
      continue
    fi
    [[ -d "$destination" && ! -L "$destination" ]] \
      || die "install destination directory is not a real directory: ${destination}"
    if [[ "$unprivileged_test_mode" == false ]]; then
      validate_existing_path_components "$(dirname -- "$destination")"
      [[ "$(stat -c '%U' -- "$destination")" == root \
        && -z "$(find -P "$destination" -maxdepth 0 -perm /022 -print -quit)" ]] \
        || die "install destination directory is not root-owned/nonwritable: ${destination}"
      expected_owner=root
      expected_group="${install_directory_groups[$index]}"
      expected_mode="${install_directory_modes[$index]#0}"
    else
      [[ "$(realpath -e -- "$destination")" == "$destination" ]] \
        || die "test install destination directory is noncanonical: ${destination}"
      expected_owner="$(id -un)"
      expected_group="$(id -gn)"
      expected_mode="${install_directory_modes[$index]#0}"
      [[ "${TEST_INSTALL_MSYS_MODE_COMPAT:-false}" != true ]] || expected_mode=750
    fi
    if [[ "$(stat -c '%U:%G:%a' -- "$destination")" != "${expected_owner}:${expected_group}:${expected_mode}" ]]; then
      drifting_destinations["$destination"]=true
      ((drift_count += 1))
    fi
  done
  for ((index = 0; index < ${#install_destinations[@]}; index += 1)); do
    destination="${install_destinations[$index]}"
    source="${install_sources[$index]}"
    mode="${install_modes[$index]}"
    group="${install_groups[$index]}"
    expected_identity="$(expected_file_identity "$mode" "$group")"
    if [[ -f "$destination" && ! -L "$destination" \
      && "$(stat -c '%U:%G:%a:%h' -- "$destination")" == "$expected_identity" ]] \
      && cmp -s -- "$source" "$destination"; then
      continue
    fi
    [[ ! -L "$destination" ]] || die "refusing a symlinked install target: ${destination}"
    [[ ! -e "$destination" || -f "$destination" ]] \
      || die "refusing a non-regular install target: ${destination}"
    drifting_destinations["$destination"]=true
    ((drift_count += 1))
  done
  if [[ "$unprivileged_test_mode" == false ]]; then
    if [[ "$(stat -c '%U:%G:%a' -- "$runtime_cache")" != 'root:leetplus-runtime:550' ]]; then
      drifting_destinations["$runtime_cache"]=true
      ((drift_count += 1))
    fi
  fi
}

serialize_drift_destinations() {
  local sorted_paths path serialized=''
  if ((${#drifting_destinations[@]} == 0)); then
    printf '\n'
    return
  fi
  sorted_paths="$(printf '%s\n' "${!drifting_destinations[@]}" | LC_ALL=C sort)" \
    || die 'failed to sort install drift paths'
  while IFS= read -r path; do
    [[ -n "$path" && "$path" != *';'* && "$path" != *$'\n'* ]] \
      || die 'install drift path cannot be serialized safely'
    serialized+="${serialized:+;}${path}"
  done <<< "$sorted_paths"
  printf '%s\n' "$serialized"
}

attest_no_outstanding_intents() {
  local inventory entry entry_type
  inventory="$(find -P "$cutover_state_root" -mindepth 1 -maxdepth 1 -name '*.intent' \
    -printf '%f|%y\n')" || die 'deployment intent inventory failed or returned partial output'
  [[ ${#inventory} -le 65536 && "$inventory" != *$'\r'* ]] \
    || die 'deployment intent inventory is oversized or noncanonical'
  while IFS='|' read -r entry entry_type; do
    [[ -n "$entry" ]] || continue
    [[ "$entry" == "$CONTROL_INSTALL_INTENT_NAME" && "$entry_type" == f ]] \
      || die "another or non-regular deployment intent blocks control installation: ${entry}"
  done <<< "$inventory"
}

attest_active_route_not_drifting() {
  local active_link="${nginx_root}/active-upstreams.conf" target path
  [[ -e "$active_link" || -L "$active_link" ]] || return 0
  [[ -L "$active_link" && "$(stat -c '%U:%G:%a:%h' -- "$active_link")" == 'root:root:777:1' ]] \
    || { [[ "$unprivileged_test_mode" == true && -L "$active_link" ]] \
      || die 'active nginx upstream link is absent from the trusted symlink contract'; }
  target="$(realpath -e -- "$active_link")" \
    || die 'active nginx upstream link target cannot be resolved'
  case "$target" in
    "${nginx_root}/upstreams/legacy.conf"|"${nginx_root}/upstreams/legacy-safe.conf"|\
    "${nginx_root}/upstreams/blue.conf"|"${nginx_root}/upstreams/green.conf") ;;
    *) die "active nginx upstream link points outside the reviewed target set: ${target}" ;;
  esac
  IFS=';' read -r -a original_paths <<< "$original_drift_serialized"
  for path in "${original_paths[@]}"; do
    [[ -z "$path" || "$target" != "$path" ]] \
      || die "active nginx upstream is a drifting install target: ${target}"
  done
}

attest_quiescent_runtime() {
  local unit inventory unit_file_inventory line unit_name load_state active_state sub_state main_pid control_group
  local show_output key value cgroup_path cgroup_pids listener_inventory
  local -A allowed_units=() properties=()
  for unit in "${protected_units[@]}"; do allowed_units["$unit"]=true; done
  if [[ "$unprivileged_test_mode" == true ]]; then
    [[ "${TEST_INSTALL_SIMULATE_UNIT_ACTIVE:-false}" != true ]] \
      || die 'protected rollback unit is active during control installation'
    [[ "${TEST_INSTALL_SIMULATE_LISTENER:-false}" != true ]] \
      || die 'protected rollback listener exists during control installation'
    return
  fi
  inventory="$(timeout --foreground --kill-after=5s 30s systemctl list-units --all --full --plain --no-legend --no-pager)" \
    || die 'complete loaded-unit inventory failed or timed out'
  [[ ${#inventory} -le 4194304 && "$inventory" != *$'\r'* ]] \
    || die 'loaded-unit inventory is oversized or noncanonical'
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    unit_name="${line%%[[:space:]]*}"
    case "$unit_name" in
      leetplus-api-rollback@*.service|leetplus-web-rollback@*.service|\
      leetplus-rollback-egress.service|leetplus-blue-green-recovery.service|\
      leetplus-blue-green-recovery-watchdog.service|leetplus-blue-green-recovery.timer)
        [[ -n "${allowed_units[$unit_name]+x}" ]] \
          || die "unclassified rollback/recovery unit is loaded: ${unit_name}"
        ;;
    esac
  done <<< "$inventory"
  unit_file_inventory="$(timeout --foreground --kill-after=5s 30s systemctl list-unit-files \
    --full --no-legend --no-pager)" \
    || die 'complete installed-unit inventory failed or timed out'
  [[ ${#unit_file_inventory} -le 4194304 && "$unit_file_inventory" != *$'\r'* ]] \
    || die 'installed-unit inventory is oversized or noncanonical'
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    unit_name="${line%%[[:space:]]*}"
    case "$unit_name" in
      leetplus-api-rollback@*.service|leetplus-web-rollback@*.service|\
      leetplus-rollback-egress.service|leetplus-blue-green-recovery.service|\
      leetplus-blue-green-recovery-watchdog.service|leetplus-blue-green-recovery.timer)
        [[ -n "${allowed_units[$unit_name]+x}" ]] \
          || die "unclassified rollback/recovery unit file is installed or enabled: ${unit_name}"
        ;;
    esac
  done <<< "$unit_file_inventory"
  for unit in "${protected_units[@]}"; do
    show_output="$(timeout --foreground --kill-after=5s 20s systemctl show "$unit" --no-pager \
      --property=LoadState --property=ActiveState --property=SubState \
      --property=MainPID --property=ControlGroup)" \
      || die "protected unit state query failed or timed out: ${unit}"
    [[ ${#show_output} -le 16384 && "$show_output" != *$'\r'* ]] \
      || die "protected unit state is oversized or noncanonical: ${unit}"
    properties=()
    while IFS='=' read -r key value; do
      [[ "$key" =~ ^(LoadState|ActiveState|SubState|MainPID|ControlGroup)$ \
        && -z "${properties[$key]+x}" ]] \
        || die "protected unit returned duplicate/unknown state: ${unit}:${key}"
      properties["$key"]="$value"
    done <<< "$show_output"
    [[ ${#properties[@]} == 5 ]] || die "protected unit state is incomplete: ${unit}"
    load_state="${properties[LoadState]}"
    active_state="${properties[ActiveState]}"
    sub_state="${properties[SubState]}"
    main_pid="${properties[MainPID]}"
    control_group="${properties[ControlGroup]}"
    [[ "$load_state" == loaded || "$load_state" == not-found ]] \
      || die "protected unit load state is unsafe: ${unit}:${load_state}"
    [[ "$active_state" == inactive && "$sub_state" == dead && "$main_pid" == 0 ]] \
      || die "protected unit is not inactive/dead with MainPID=0: ${unit}"
    if [[ -n "$control_group" ]]; then
      [[ "$control_group" == /* && "$control_group" =~ ^/[A-Za-z0-9_.@:/\\x-]+$ ]] \
        || die "protected unit cgroup path is noncanonical: ${unit}"
      cgroup_path="/sys/fs/cgroup${control_group}"
      [[ -d "$cgroup_path" && ! -L "$cgroup_path" \
        && "$(realpath -e -- "$cgroup_path")" == "$cgroup_path" \
        && -r "${cgroup_path}/cgroup.procs" ]] \
        || die "protected unit cgroup is absent or unreadable: ${unit}"
      cgroup_pids="$(timeout --foreground --kill-after=2s 5s cat -- "${cgroup_path}/cgroup.procs")" \
        || die "protected unit cgroup inventory failed or timed out: ${unit}"
      [[ -z "$cgroup_pids" ]] || die "protected unit cgroup is not empty: ${unit}"
    fi
  done
  attest_install_identity leetplus-api-nminus1 leetplus-api-runtime
  attest_install_identity leetplus-web-nminus1 leetplus-web-runtime
  listener_inventory="$(timeout --foreground --kill-after=5s 20s ss -H -ltnp)" \
    || die 'complete TCP listener inventory failed or timed out'
  [[ ${#listener_inventory} -le 4194304 && "$listener_inventory" != *$'\r'* ]] \
    || die 'TCP listener inventory is oversized or noncanonical'
  if awk '$4 ~ /:(3300|4300|4301)$/ { found = 1 } END { exit !found }' <<< "$listener_inventory"; then
    die 'rollback API/Web/child listener exists during control installation'
  fi
}

daemon_reload() {
  [[ "$unprivileged_test_mode" == false ]] || return 0
  timeout --foreground --kill-after=5s 30s systemctl daemon-reload \
    || die 'systemd daemon-reload failed or timed out during control installation'
}

normalized_word_set() {
  tr ' ' '\n' | awk 'NF == 1 { print }' | LC_ALL=C sort | tr '\n' ' ' | awk '{$1=$1; print}'
}

effective_environment_file_paths() {
  tr ' ' '\n' | awk '
    {
      sub(/^\{/, "")
      sub(/^path=/, "")
      gsub(/[;}]+$/, "")
      if ($0 ~ /^\//) print
    }
  '
}

systemctl_property_value() {
  timeout --foreground --kill-after=2s 10s \
    systemctl show --no-pager --property="$2" --value "$1"
}

attest_loaded_control_generation() {
  local unit fragment expected_fragment actual_fragment dropins need_reload load_state
  local runtime_kind expected_user expected_working expected_exec expected_env_paths
  local actual_exec actual_env_files actual_unset expected_unset actual_address expected_address
  local property expected actual
  if [[ "$unprivileged_test_mode" == true ]]; then
    [[ "${TEST_INSTALL_STALE_MANAGER:-false}" != true ]] \
      || die 'effective loaded control generation is stale after daemon-reload'
    return 0
  fi
  local -a closed_units=(
    "leetplus-api-rollback@${LEGACY_SHA}.service:${systemd_root}/leetplus-api-rollback@.service"
    "leetplus-web-rollback@${LEGACY_SHA}.service:${systemd_root}/leetplus-web-rollback@.service"
    "leetplus-rollback-egress.service:${systemd_root}/leetplus-rollback-egress.service"
    "leetplus-blue-green-recovery.service:${systemd_root}/leetplus-blue-green-recovery.service"
    "leetplus-blue-green-recovery-watchdog.service:${systemd_root}/leetplus-blue-green-recovery-watchdog.service"
    "leetplus-blue-green-recovery.timer:${systemd_root}/leetplus-blue-green-recovery.timer"
  )
  for unit_fragment in "${closed_units[@]}"; do
    unit="${unit_fragment%%:*}"
    fragment="${unit_fragment#*:}"
    actual_fragment="$(systemctl_property_value "$unit" FragmentPath)" \
      || die "effective control unit FragmentPath read failed: ${unit}"
    dropins="$(systemctl_property_value "$unit" DropInPaths)" \
      || die "effective control unit DropInPaths read failed: ${unit}"
    need_reload="$(systemctl_property_value "$unit" NeedDaemonReload)" \
      || die "effective control unit NeedDaemonReload read failed: ${unit}"
    load_state="$(systemctl_property_value "$unit" LoadState)" \
      || die "effective control unit LoadState read failed: ${unit}"
    [[ "$actual_fragment" == "$fragment" && -z "$dropins" \
      && "$need_reload" == no && "$load_state" == loaded ]] \
      || die "effective loaded control unit source/drop-in generation is not exact: ${unit}"
  done
  for runtime_kind in api web; do
    if [[ "$runtime_kind" == api ]]; then
      unit="leetplus-api-rollback@${LEGACY_SHA}.service"
      fragment="${systemd_root}/leetplus-api-rollback@.service"
      expected_user='leetplus-api-nminus1'
      expected_working="${release_directory}"
      expected_exec="/usr/bin/node /usr/local/libexec/leetplus/legacy-rollback-auth-edge.mjs --release-sha ${LEGACY_SHA}"
      expected_env_paths="${runtime_environment}"$'\n'"${leetplus_root}/rollback-releases/${LEGACY_SHA}.env"$'\n'"${safe_environment}"
    else
      unit="leetplus-web-rollback@${LEGACY_SHA}.service"
      fragment="${systemd_root}/leetplus-web-rollback@.service"
      expected_user='leetplus-web-nminus1'
      expected_working="${release_directory}/apps/web"
      expected_exec="/usr/bin/node ${release_directory}/apps/web/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3300"
      expected_env_paths="${web_runtime_environment}"$'\n'"${leetplus_root}/rollback-releases/${LEGACY_SHA}.env"$'\n'"${safe_environment}"
    fi
    [[ "$(systemctl_property_value "$unit" User)" == "$expected_user" \
      && "$(systemctl_property_value "$unit" Group)" == leetplus-runtime \
      && "$(systemctl_property_value "$unit" WorkingDirectory)" == "$expected_working" \
      && "$(systemctl_property_value "$unit" Environment)" == 'PATH=/usr/sbin:/usr/bin:/sbin:/bin' \
      && "$(systemctl_property_value "$unit" NoNewPrivileges)" == yes \
      && "$(systemctl_property_value "$unit" PrivateTmp)" == yes \
      && "$(systemctl_property_value "$unit" PrivateDevices)" == yes \
      && "$(systemctl_property_value "$unit" ProtectSystem)" == strict \
      && "$(systemctl_property_value "$unit" ProtectHome)" == yes \
      && "$(systemctl_property_value "$unit" RestrictNetworkInterfaces)" == lo \
      && "$(systemctl_property_value "$unit" IPAddressDeny)" == any \
      && "$(systemctl_property_value "$unit" IPAddressAllow)" == localhost ]] \
      || die "effective rollback runtime identity/sandbox is not exact: ${unit}"
    actual_exec="$(systemctl_property_value "$unit" ExecStart)" \
      || die "effective rollback ExecStart read failed: ${unit}"
    [[ "$actual_exec" == *"argv[]=${expected_exec} ;"* && "$actual_exec" != *'} {'* ]] \
      || die "effective rollback ExecStart is not exact: ${unit}"
    actual_env_files="$(systemctl_property_value "$unit" EnvironmentFiles)" \
      || die "effective rollback EnvironmentFiles read failed: ${unit}"
    [[ "$actual_env_files" != *'ignore_errors=yes'* \
      && "$(printf '%s' "$actual_env_files" | effective_environment_file_paths)" == "$expected_env_paths" ]] \
      || die "effective rollback EnvironmentFiles are not exact: ${unit}"
    actual_unset="$(systemctl_property_value "$unit" UnsetEnvironment)" \
      || die "effective rollback UnsetEnvironment read failed: ${unit}"
    expected_unset="$(awk -F= '$1 == "UnsetEnvironment" { print substr($0, length($1) + 2) }' "$fragment")"
    [[ "$(printf '%s' "$actual_unset" | normalized_word_set)" \
      == "$(printf '%s' "$expected_unset" | normalized_word_set)" ]] \
      || die "effective rollback UnsetEnvironment is not exact: ${unit}"
    actual_address="$(systemctl_property_value "$unit" RestrictAddressFamilies)"
    expected_address="$(awk -F= '$1 == "RestrictAddressFamilies" { print substr($0, length($1) + 2) }' "$fragment")"
    [[ "$(printf '%s' "$actual_address" | normalized_word_set)" \
      == "$(printf '%s' "$expected_address" | normalized_word_set)" ]] \
      || die "effective rollback address-family boundary is not exact: ${unit}"
    for property in SocketBindDeny SocketBindAllow; do
      expected="$(awk -F= -v key="$property" '$1 == key { print substr($0, length($1) + 2) }' "$fragment" \
        | LC_ALL=C sort | tr '\n' ' ' | awk '{$1=$1; print}')"
      actual="$(systemctl_property_value "$unit" "$property")"
      [[ "$(printf '%s' "$actual" | normalized_word_set)" == "$(printf '%s' "$expected" | normalized_word_set)" ]] \
        || die "effective rollback ${property} is not exact: ${unit}"
    done
  done
  nginx_dropins="$(systemctl_property_value nginx.service DropInPaths)" \
    || die 'effective nginx drop-in inventory read failed'
  [[ "$(printf '%s' "$nginx_dropins" | effective_environment_file_paths)" \
    == "${systemd_root}/nginx.service.d/leetplus-blue-green-recovery.conf" \
    && "$(systemctl_property_value nginx.service NeedDaemonReload)" == no ]] \
    || die 'effective nginx recovery dependency generation is not exact'
}

runtime_mask_root="${cutover_state_root}/test-runtime-masks"
attest_runtime_masks_absent() {
  local unit marker residue
  if [[ "$unprivileged_test_mode" == true ]]; then
    if [[ -e "$runtime_mask_root" || -L "$runtime_mask_root" ]]; then
      [[ -d "$runtime_mask_root" && ! -L "$runtime_mask_root" ]] \
        || die 'pre-existing test runtime-mask path is noncanonical'
      residue="$(find -P "$runtime_mask_root" -mindepth 1 -maxdepth 1 -print -quit)" \
        || die 'pre-existing test runtime-mask inventory failed'
      [[ -z "$residue" ]] \
        || die 'pre-existing runtime mask is not owned by this control-install operation'
    fi
    return 0
  fi
  for unit in "${protected_units[@]}"; do
    marker="/run/systemd/system/${unit}"
    [[ ! -e "$marker" && ! -L "$marker" ]] \
      || die "pre-existing runtime mask is not owned by this control-install operation: ${unit}"
  done
}

apply_runtime_masks() {
  local unit marker
  if [[ "$unprivileged_test_mode" == true ]]; then
    if [[ ! -e "$runtime_mask_root" && ! -L "$runtime_mask_root" ]]; then
      mkdir -- "$runtime_mask_root"
    fi
    [[ -d "$runtime_mask_root" && ! -L "$runtime_mask_root" ]] \
      || die 'test runtime-mask directory is absent or symlinked'
    for unit in "${protected_units[@]}"; do
      marker="${runtime_mask_root}/${unit}"
      printf '/dev/null\n' > "$marker"
      chmod 0600 "$marker"
      sync -f "$marker"
    done
    sync -d "$runtime_mask_root"
  else
    timeout --foreground --kill-after=5s 30s systemctl mask --runtime --no-reload "${protected_units[@]}" \
      || die 'failed to apply exact runtime masks to protected units'
  fi
  daemon_reload
}

attest_runtime_masks() {
  local unit marker
  for unit in "${protected_units[@]}"; do
    if [[ "$unprivileged_test_mode" == true ]]; then
      marker="${runtime_mask_root}/${unit}"
      [[ -f "$marker" && ! -L "$marker" && "$(tr -d '\r\n' < "$marker")" == /dev/null ]] \
        || die "test runtime mask is absent or malformed: ${unit}"
    else
      marker="/run/systemd/system/${unit}"
      [[ -L "$marker" && "$(readlink -- "$marker")" == /dev/null \
        && "$(stat -c '%U:%G:%a:%h' -- "$marker")" == 'root:root:777:1' ]] \
        || die "runtime mask is absent or not exact /dev/null: ${unit}"
    fi
  done
}

fence_content="[Unit]"$'\n'"ConditionPathExists=!${cutover_state_root}/${CONTROL_INSTALL_FENCE_NAME}"$'\n'
fence_sha="$(printf '%s' "$fence_content" | sha256sum | awk '{ print $1 }')"
fence_destination_for_unit() {
  printf '%s/%s.d/90-leetplus-control-install-fence.conf\n' "$systemd_root" "$1"
}

attest_persistent_fence_directory() {
  local directory="$1" expected_owner='root' expected_group='root' expected_mode=755 mount_inventory='' mount_target
  if [[ "$unprivileged_test_mode" == true ]]; then
    expected_owner="$(id -un)"
    expected_group="$(id -gn)"
    [[ "${TEST_INSTALL_MSYS_MODE_COMPAT:-false}" != true ]] || expected_mode=750
  fi
  [[ -d "$directory" && ! -L "$directory" \
    && "$(realpath -e -- "$directory")" == "$directory" \
    && "$(stat -c '%U:%G:%a' -- "$directory")" == "${expected_owner}:${expected_group}:${expected_mode}" \
    && -z "$(find -P "$directory" -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die "persistent-fence directory authority is unsafe: ${directory}"
  if [[ "$unprivileged_test_mode" == true && -n "${TEST_INSTALL_DESTINATION_MOUNT_INVENTORY_FILE:-}" ]]; then
    [[ -f "$TEST_INSTALL_DESTINATION_MOUNT_INVENTORY_FILE" && ! -L "$TEST_INSTALL_DESTINATION_MOUNT_INVENTORY_FILE" ]] \
      || die 'fixture persistent-fence mount inventory is absent or symlinked'
    mount_inventory="$(<"$TEST_INSTALL_DESTINATION_MOUNT_INVENTORY_FILE")" \
      || die 'fixture persistent-fence mount inventory could not be read completely'
  elif [[ "$unprivileged_test_mode" == false ]]; then
    mount_inventory="$destination_mount_inventory"
  fi
  if [[ -n "$mount_inventory" ]]; then
    [[ ${#mount_inventory} -le 4194304 && "$mount_inventory" != *$'\r'* ]] \
      || die 'persistent-fence mount inventory is oversized or noncanonical'
    while IFS= read -r mount_target; do
      [[ -n "$mount_target" ]] || continue
      case "$mount_target" in
        "$directory"|"$directory"/*)
          die "persistent-fence directory contains an exact/nested mount: ${mount_target}"
          ;;
      esac
    done <<< "$mount_inventory"
  fi
}

apply_persistent_fences() {
  local unit directory destination temporary expected_owner expected_group expected_identity expected_mode=644 fence_index=0
  expected_owner='root'
  expected_group='root'
  if [[ "$unprivileged_test_mode" == true ]]; then
    expected_owner="$(id -un)"
    expected_group="$(id -gn)"
    [[ "${TEST_INSTALL_MSYS_MODE_COMPAT:-false}" != true ]] || expected_mode=640
  fi
  expected_identity="${expected_owner}:${expected_group}:${expected_mode}:1"
  for unit in "${protected_units[@]}"; do
    destination="$(fence_destination_for_unit "$unit")"
    directory="$(dirname -- "$destination")"
    if [[ ! -e "$directory" && ! -L "$directory" ]]; then
      if [[ "$unprivileged_test_mode" == true ]]; then
        install -d -m 0755 "$directory"
      else
        install -d -o root -g root -m 0755 "$directory"
      fi
    fi
    [[ -d "$directory" && ! -L "$directory" ]] \
      || die "persistent-fence directory is absent or symlinked: ${directory}"
    attest_persistent_fence_directory "$directory"
    if [[ -f "$destination" && ! -L "$destination" \
      && "$(stat -c '%U:%G:%a:%h' -- "$destination")" == "$expected_identity" \
      && "$(sha256sum "$destination" | awk '{ print $1 }')" == "$fence_sha" ]]; then
      sync -f "$destination"
      sync -d "$directory"
      continue
    fi
    [[ ! -e "$destination" && ! -L "$destination" ]] \
      || die "refusing to replace a pre-existing noncanonical install fence: ${destination}"
    temporary="$(mktemp "${directory}/.leetplus-control-fence.XXXXXX")"
    [[ -f "$temporary" && ! -L "$temporary" && "$(dirname -- "$(realpath -e -- "$temporary")")" == "$directory" \
      && "$(stat -c '%h' -- "$temporary")" == 1 ]] \
      || die "persistent-fence temporary file is unsafe: ${temporary}"
    printf '%s' "$fence_content" > "$temporary"
    if [[ "$unprivileged_test_mode" == true ]]; then
      chmod 0644 "$temporary"
    else
      chown root:root "$temporary"
      chmod 0644 "$temporary"
    fi
    attest_persistent_fence_directory "$directory"
    [[ -f "$temporary" && ! -L "$temporary" \
      && "$(stat -c '%U:%G:%a:%h' -- "$temporary")" == "$expected_identity" ]] \
      || die "persistent-fence temporary identity drifted: ${temporary}"
    mv -T "$temporary" "$destination"
    sync -f "$destination"
    sync -d "$directory"
    attest_persistent_fence_directory "$directory"
    ((fence_index += 1))
    if [[ "$unprivileged_test_mode" == true && "$fence_index" == 1 \
      && "${TEST_INSTALL_FAIL_AFTER_FIRST_PERSISTENT_FENCE:-false}" == true ]]; then
      die 'simulated reboot after the first durable persistent unit fence'
    fi
  done
  daemon_reload
}

attest_persistent_fences() {
  local unit destination expected_owner expected_group expected_identity expected_mode=644
  expected_owner='root'
  expected_group='root'
  if [[ "$unprivileged_test_mode" == true ]]; then
    expected_owner="$(id -un)"
    expected_group="$(id -gn)"
    [[ "${TEST_INSTALL_MSYS_MODE_COMPAT:-false}" != true ]] || expected_mode=640
  fi
  expected_identity="${expected_owner}:${expected_group}:${expected_mode}:1"
  for unit in "${protected_units[@]}"; do
    destination="$(fence_destination_for_unit "$unit")"
    attest_persistent_fence_directory "$(dirname -- "$destination")"
    [[ -f "$destination" && ! -L "$destination" \
      && "$(stat -c '%U:%G:%a:%h' -- "$destination")" == "$expected_identity" \
      && "$(sha256sum "$destination" | awk '{ print $1 }')" == "$fence_sha" ]] \
      || die "persistent install fence is absent or drifted: ${unit}"
  done
}

remove_persistent_fences() {
  local unit destination directory expected_owner expected_group expected_identity expected_mode=644
  expected_owner='root'
  expected_group='root'
  if [[ "$unprivileged_test_mode" == true ]]; then
    expected_owner="$(id -un)"
    expected_group="$(id -gn)"
    [[ "${TEST_INSTALL_MSYS_MODE_COMPAT:-false}" != true ]] || expected_mode=640
  fi
  expected_identity="${expected_owner}:${expected_group}:${expected_mode}:1"
  for unit in "${protected_units[@]}"; do
    destination="$(fence_destination_for_unit "$unit")"
    directory="$(dirname -- "$destination")"
    if [[ ! -e "$destination" && ! -L "$destination" ]]; then
      continue
    fi
    [[ -f "$destination" && ! -L "$destination" \
      && "$(stat -c '%U:%G:%a:%h' -- "$destination")" == "$expected_identity" \
      && "$(sha256sum "$destination" | awk '{ print $1 }')" == "$fence_sha" ]] \
      || die "refusing to remove a noncanonical persistent install fence: ${unit}"
    attest_persistent_fence_directory "$directory"
    rm -- "$destination"
    sync -d "$directory"
    attest_persistent_fence_directory "$directory"
    rmdir -- "$directory" 2>/dev/null || true
  done
  daemon_reload
}

remove_runtime_masks() {
  local unit marker
  if [[ "$unprivileged_test_mode" == true ]]; then
    for unit in "${protected_units[@]}"; do
      marker="${runtime_mask_root}/${unit}"
      [[ -e "$marker" || -L "$marker" ]] || continue
      [[ -f "$marker" && ! -L "$marker" && "$(tr -d '\r\n' < "$marker")" == /dev/null ]] \
        || die "refusing to remove a noncanonical test runtime mask: ${unit}"
      rm -- "$marker"
    done
    if [[ -d "$runtime_mask_root" ]]; then
      sync -d "$runtime_mask_root"
      rmdir -- "$runtime_mask_root"
    fi
  else
    timeout --foreground --kill-after=5s 30s systemctl unmask --runtime --no-reload "${protected_units[@]}" \
      || die 'failed to remove exact runtime masks from protected units'
  fi
  daemon_reload
  for unit in "${protected_units[@]}"; do
    if [[ "$unprivileged_test_mode" == false ]]; then
      [[ ! -e "/run/systemd/system/${unit}" && ! -L "/run/systemd/system/${unit}" ]] \
        || die "runtime mask residue remains after unmask: ${unit}"
    fi
  done
}

ensure_install_directory() {
  local mode="$1" target="$2" group="${3:-root}" parent expected_owner expected_group expected_mode
  parent="$(dirname -- "$target")"
  [[ -d "$parent" && ! -L "$parent" ]] \
    || die "install destination parent is absent or symlinked: ${parent}"
  if [[ "$unprivileged_test_mode" == false ]]; then
    validate_existing_path_components "$parent"
  fi
  if [[ ! -e "$target" && ! -L "$target" ]]; then
    if [[ "$unprivileged_test_mode" == true ]]; then
      if [[ "${TEST_INSTALL_MSYS_MODE_COMPAT:-false}" == true ]]; then
        mkdir -- "$target"
        chmod "$mode" "$target"
      else
        install -d -m "$mode" "$target"
      fi
    else
      install -d -o root -g "$group" -m "$mode" "$target"
    fi
  fi
  expected_owner='root'
  expected_group="$group"
  expected_mode="${mode#0}"
  if [[ "$unprivileged_test_mode" == true ]]; then
    expected_owner="$(id -un)"
    expected_group="$(id -gn)"
    if [[ "${TEST_INSTALL_MSYS_MODE_COMPAT:-false}" == true ]]; then
      expected_mode=750
      chmod "$mode" "$target"
    fi
  elif [[ "$(stat -c '%U:%G:%a' -- "$target")" != "${expected_owner}:${expected_group}:${expected_mode}" ]]; then
    chown "${expected_owner}:${expected_group}" "$target"
    chmod "$mode" "$target"
  fi
  [[ -d "$target" && ! -L "$target" && "$(realpath -e -- "$target")" == "$target" \
    && "$(stat -c '%U:%G:%a' -- "$target")" == "${expected_owner}:${expected_group}:${expected_mode}" ]] \
    || die "created/existing install destination is not canonical controlled: ${target}"
}

install_file() {
  local mode="$1" source="$2" destination="$3" group="${4:-root}"
  local destination_directory temporary expected_identity
  destination_directory="$(dirname -- "$destination")"
  expected_identity="$(expected_file_identity "$mode" "$group")"
  if [[ -f "$destination" && ! -L "$destination" \
    && "$(stat -c '%U:%G:%a:%h' -- "$destination")" == "$expected_identity" ]] \
    && cmp -s -- "$source" "$destination"; then
    sync -f "$destination"
    sync -d "$destination_directory"
    [[ -f "$destination" && ! -L "$destination" \
      && "$(stat -c '%U:%G:%a:%h' -- "$destination")" == "$expected_identity" ]] \
      && cmp -s -- "$source" "$destination" \
      || die "matching installed file changed during durability reconciliation: ${destination}"
    return
  fi
  [[ ! -L "$destination" ]] || die "refusing to replace symlinked install target: ${destination}"
  temporary="$(mktemp "${destination_directory}/.leetplus-install.XXXXXX")"
  if [[ "$unprivileged_test_mode" == true ]]; then
    install -m "$mode" "$source" "$temporary"
  else
    install -o root -g "$group" -m "$mode" "$source" "$temporary"
  fi
  mv -T "$temporary" "$destination"
  if [[ "$unprivileged_test_mode" == true \
    && "${TEST_INSTALL_FAIL_AFTER_MV_DESTINATION:-}" == "$destination" \
    && -n "${TEST_INSTALL_FAIL_AFTER_MV_MARKER:-}" \
    && ! -e "$TEST_INSTALL_FAIL_AFTER_MV_MARKER" ]]; then
    : > "$TEST_INSTALL_FAIL_AFTER_MV_MARKER"
    die "simulated crash after install rename and before durability sync: ${destination}"
  fi
  sync -f "$destination"
  sync -d "$destination_directory"
  [[ -f "$destination" && ! -L "$destination" \
    && "$(stat -c '%U:%G:%a:%h' -- "$destination")" == "$expected_identity" ]] \
    && cmp -s -- "$source" "$destination" \
    || die "installed file failed final byte/identity attestation: ${destination}"
}

state_record_identity() {
  local owner='root' mode=600
  if [[ "$unprivileged_test_mode" == true ]]; then
    owner="$(id -un)"
    [[ "${TEST_INSTALL_MSYS_MODE_COMPAT:-false}" != true ]] || mode=640
  fi
  printf '%s:%s:1\n' "$owner" "$mode"
}

publish_state_record() {
  local destination="$1" content="$2" temporary directory expected_identity
  directory="$(dirname -- "$destination")"
  expected_identity="$(state_record_identity)"
  temporary="$(mktemp "${directory}/.control-install-state.XXXXXX")"
  printf '%s' "$content" > "$temporary"
  if [[ "$unprivileged_test_mode" == true ]]; then
    chmod 0600 "$temporary"
  else
    chown root:root "$temporary"
    chmod 0600 "$temporary"
  fi
  sync -f "$temporary"
  mv -T "$temporary" "$destination"
  sync -f "$destination"
  sync -d "$directory"
  [[ -f "$destination" && ! -L "$destination" \
    && "$(stat -c '%U:%a:%h' -- "$destination")" == "$expected_identity" ]] \
    || die "published control-install state record has unsafe identity: ${destination}"
}

remove_state_record() {
  local destination="$1" expected_sha="$2" directory
  [[ -e "$destination" || -L "$destination" ]] || return 0
  [[ -f "$destination" && ! -L "$destination" \
    && "$(stat -c '%U:%a:%h' -- "$destination")" == "$(state_record_identity)" \
    && "$(sha256sum "$destination" | awk '{ print $1 }')" == "$expected_sha" ]] \
    || die "refusing to remove a noncanonical control-install state record: ${destination}"
  directory="$(dirname -- "$destination")"
  rm -- "$destination"
  sync -d "$directory"
}

acquire_production_cutover_lock() {
  local lock_path="${cutover_state_root}/cutover.lock" lock_parent lock_fd_target
  lock_parent="$(dirname -- "$lock_path")"
  [[ -d "$lock_parent" && ! -L "$lock_parent" \
    && "$(realpath -e -- "$lock_parent")" == "$lock_parent" \
    && "$(stat -c '%U:%G:%a' -- "$lock_parent")" == 'root:root:700' ]] \
    || die 'shared cutover lock parent is not canonical root:root mode 0700'
  if [[ ! -e "$lock_path" && ! -L "$lock_path" ]]; then
    (umask 0077; set -o noclobber; : > "$lock_path") \
      || die 'failed to create the shared cutover lock without following links'
    chown root:root "$lock_path"
    chmod 0600 "$lock_path"
    sync -f "$lock_path"
    sync -d "$lock_parent"
  fi
  [[ -f "$lock_path" && ! -L "$lock_path" \
    && "$(stat -c '%U:%G:%a:%h' -- "$lock_path")" == 'root:root:600:1' ]] \
    || die 'shared cutover lock path identity is unsafe'
  exec 9>> "$lock_path"
  lock_fd_target="$(realpath -e -- "/proc/$$/fd/9")" \
    || die 'shared cutover lock descriptor cannot be resolved'
  [[ "$lock_fd_target" == "$lock_path" \
    && "$(stat -Lc '%U:%G:%a:%h' -- "/proc/$$/fd/9")" == 'root:root:600:1' ]] \
    || die 'shared cutover lock descriptor/path identity is unsafe before flock'
  flock -n 9 || die 'another blue/green, rollback activation or control install holds the deployment lock'
  [[ "$(realpath -e -- "/proc/$$/fd/9")" == "$lock_path" \
    && -f "$lock_path" && ! -L "$lock_path" \
    && "$(stat -c '%U:%G:%a:%h' -- "$lock_path")" == 'root:root:600:1' \
    && "$(stat -Lc '%U:%G:%a:%h' -- "/proc/$$/fd/9")" == 'root:root:600:1' ]] \
    || die 'shared cutover lock changed while held'
}

compute_install_drift
prelock_drift_serialized="$(serialize_drift_destinations)"
if [[ "$unprivileged_test_mode" == true ]]; then
  test_cutover_lock="${cutover_state_root}/.test-cutover.lock"
  mkdir -- "$test_cutover_lock" \
    || die 'another test control install holds the deployment lock'
  trap 'rmdir -- "$test_cutover_lock" 2>/dev/null || true' EXIT
else
  acquire_production_cutover_lock
fi
compute_install_drift
locked_drift_serialized="$(serialize_drift_destinations)"
[[ "$locked_drift_serialized" == "$prelock_drift_serialized" ]] \
  || die 'install destinations changed while acquiring the shared cutover lock'
attest_no_outstanding_intents
control_preparing="${cutover_state_root}/${CONTROL_INSTALL_PREPARING_NAME}"
control_intent="${cutover_state_root}/${CONTROL_INSTALL_INTENT_NAME}"
control_fence="${cutover_state_root}/${CONTROL_INSTALL_FENCE_NAME}"
original_drift_serialized=''
preparing_record_sha=''
fence_record_sha=''
intent_record_sha=''
intent_phase=''
fence_needs_publish=false

if [[ -e "$control_preparing" || -L "$control_preparing" ]]; then
  [[ -f "$control_preparing" && ! -L "$control_preparing" \
    && "$(stat -c '%U:%a:%h' -- "$control_preparing")" == "$(state_record_identity)" ]] \
    || die 'control-install preparation record is not a canonical protected regular file'
  mapfile -t preparing_lines < "$control_preparing" \
    || die 'control-install preparation record could not be read completely'
  [[ ${#preparing_lines[@]} == 5 \
    && "${preparing_lines[0]}" == "CONTRACT=${CONTROL_INSTALL_CONTRACT}" \
    && "${preparing_lines[1]}" == "CONTROL_MANIFEST_SHA256=${control_manifest_sha}" \
    && "${preparing_lines[2]}" == "INSTALL_PLAN_SHA256=${install_plan_sha}" \
    && "${preparing_lines[3]}" == ORIGINAL_DRIFT_DESTINATIONS=* \
    && "${preparing_lines[4]}" == 'PREEXISTING_RUNTIME_MASKS=NONE' ]] \
    || die 'control-install preparation schema/digests are not exact'
  original_drift_serialized="${preparing_lines[3]#ORIGINAL_DRIFT_DESTINATIONS=}"
  preparing_record_sha="$(sha256sum "$control_preparing" | awk '{ print $1 }')"
fi

if [[ -e "$control_fence" || -L "$control_fence" ]]; then
  [[ -f "$control_fence" && ! -L "$control_fence" \
    && "$(stat -c '%U:%a:%h' -- "$control_fence")" == "$(state_record_identity)" \
    && -n "$preparing_record_sha" ]] \
    || die 'control-install boot fence record is not a canonical protected regular file'
  mapfile -t fence_lines < "$control_fence" \
    || die 'control-install boot fence record could not be read completely'
  [[ ${#fence_lines[@]} == 4 \
    && "${fence_lines[0]}" == "CONTRACT=${CONTROL_INSTALL_CONTRACT}" \
    && "${fence_lines[1]}" == "CONTROL_MANIFEST_SHA256=${control_manifest_sha}" \
    && "${fence_lines[2]}" == "INSTALL_PLAN_SHA256=${install_plan_sha}" \
    && "${fence_lines[3]}" == "PREPARING_SHA256=${preparing_record_sha}" ]] \
    || die 'control-install boot fence schema/digests are not exact'
  fence_record_sha="$(sha256sum "$control_fence" | awk '{ print $1 }')"
fi

if [[ -e "$control_intent" || -L "$control_intent" ]]; then
  [[ -f "$control_intent" && ! -L "$control_intent" \
    && "$(stat -c '%U:%a:%h' -- "$control_intent")" == "$(state_record_identity)" \
    && -n "$fence_record_sha" ]] \
    || die 'control-install intent is unsafe or lacks its durable boot-fence predecessor'
  mapfile -t intent_lines < "$control_intent" \
    || die 'control-install intent could not be read completely'
  [[ ${#intent_lines[@]} == 5 \
    && "${intent_lines[0]}" == "CONTRACT=${CONTROL_INSTALL_CONTRACT}" \
    && "${intent_lines[1]}" == "CONTROL_MANIFEST_SHA256=${control_manifest_sha}" \
    && "${intent_lines[2]}" == "INSTALL_PLAN_SHA256=${install_plan_sha}" \
    && "${intent_lines[3]}" == "FENCE_SHA256=${fence_record_sha}" \
    && "${intent_lines[4]}" =~ ^PHASE=(PREPARED|POST_ATTESTED)$ ]] \
    || die 'control-install intent schema/digests are not exact'
  intent_phase="${intent_lines[4]#PHASE=}"
  intent_record_sha="$(sha256sum "$control_intent" | awk '{ print $1 }')"
fi

if [[ -n "$original_drift_serialized" ]]; then
  [[ "$original_drift_serialized" != *$'\n'* && "$original_drift_serialized" != *$'\r'* ]] \
    || die 'control-install boot fence drift set is noncanonical'
  IFS=';' read -r -a original_paths <<< "$original_drift_serialized"
  declare -A original_drift_set=()
  for path in "${original_paths[@]}"; do
    [[ -n "$path" && -n "${planned_destinations[$path]+x}" ]] \
      || die "control-install boot fence contains an unplanned drift path: ${path}"
    [[ -z "${original_drift_set[$path]+x}" ]] || die 'control-install boot fence contains duplicate drift paths'
    original_drift_set["$path"]=true
  done
  for path in "${!drifting_destinations[@]}"; do
    [[ -n "${original_drift_set[$path]+x}" ]] \
      || die "new destination drift appeared while a control-install boot fence is outstanding: ${path}"
  done
fi

if [[ -z "$preparing_record_sha" ]]; then
  [[ -z "$fence_record_sha" && -z "$intent_phase" ]] \
    || die 'control-install commit records exist without their preparation predecessor'
  if ((drift_count == 0)); then
    for destination in "${install_directories[@]}"; do
      sync -d "$destination"
    done
    for ((plan_index = 0; plan_index < ${#install_destinations[@]}; plan_index += 1)); do
      install_file "${install_modes[$plan_index]}" "${install_sources[$plan_index]}" \
        "${install_destinations[$plan_index]}" "${install_groups[$plan_index]}"
    done
    if [[ "$unprivileged_test_mode" == false ]]; then
      sync -f "$runtime_cache"
      sync -d "$(dirname -- "$runtime_cache")"
    fi
    daemon_reload
    attest_loaded_control_generation
    printf 'LEGACY_ROLLBACK_CONTOUR_INSTALL_DRIFT=false\n'
    printf 'LEGACY_ROLLBACK_CONTOUR_INSTALLED=true\n'
    printf 'LEGACY_ROLLBACK_CONTOUR_SHA=%s\n' "$LEGACY_SHA"
    printf 'LEGACY_ROLLBACK_CONTOUR_STARTED=false\n'
    printf 'LEGACY_ROLLBACK_CONTOUR_ROUTING_CHANGED=false\n'
    printf 'LEGACY_ROLLBACK_CONTOUR_DATABASE_CHANGED=false\n'
    exit 0
  fi
  original_drift_serialized="$(serialize_drift_destinations)"
  attest_active_route_not_drifting
  attest_quiescent_runtime
  attest_runtime_masks_absent
  preparing_record_content="CONTRACT=${CONTROL_INSTALL_CONTRACT}"$'\n'\
"CONTROL_MANIFEST_SHA256=${control_manifest_sha}"$'\n'\
"INSTALL_PLAN_SHA256=${install_plan_sha}"$'\n'\
"ORIGINAL_DRIFT_DESTINATIONS=${original_drift_serialized}"$'\n'\
"PREEXISTING_RUNTIME_MASKS=NONE"$'\n'
  publish_state_record "$control_preparing" "$preparing_record_content"
  preparing_record_sha="$(sha256sum "$control_preparing" | awk '{ print $1 }')"
fi
[[ -n "$fence_record_sha" ]] || fence_needs_publish=true

if [[ "$intent_phase" != POST_ATTESTED ]]; then
  attest_active_route_not_drifting
  attest_quiescent_runtime
  apply_runtime_masks
  attest_runtime_masks
  attest_quiescent_runtime
  if [[ "$fence_needs_publish" == true ]]; then
    # The Condition drop-ins are made durable while their marker is absent.
    # A reboot during this preparatory phase may run only the still-coherent
    # old generation; no install intent or destination mutation exists yet.
    apply_persistent_fences
    attest_persistent_fences
    attest_runtime_masks
    attest_quiescent_runtime
    fence_record_content="CONTRACT=${CONTROL_INSTALL_CONTRACT}"$'\n'\
"CONTROL_MANIFEST_SHA256=${control_manifest_sha}"$'\n'\
"INSTALL_PLAN_SHA256=${install_plan_sha}"$'\n'\
"PREPARING_SHA256=${preparing_record_sha}"$'\n'
    publish_state_record "$control_fence" "$fence_record_content"
    fence_record_sha="$(sha256sum "$control_fence" | awk '{ print $1 }')"
    if [[ "$unprivileged_test_mode" == true && "${TEST_INSTALL_FAIL_AFTER_FENCE_SYNC:-false}" == true ]]; then
      die 'simulated reboot after the durable boot-fence commit and before install intent'
    fi
  else
    # Once the marker exists, every persistent drop-in must already be exact;
    # filling a missing one would reopen a reboot window after the commit.
    attest_persistent_fences
  fi
  attest_persistent_fences
  attest_runtime_masks
  attest_quiescent_runtime

  if [[ -z "$intent_phase" ]]; then
    intent_record_content="CONTRACT=${CONTROL_INSTALL_CONTRACT}"$'\n'\
"CONTROL_MANIFEST_SHA256=${control_manifest_sha}"$'\n'\
"INSTALL_PLAN_SHA256=${install_plan_sha}"$'\n'\
"FENCE_SHA256=${fence_record_sha}"$'\n'\
"PHASE=PREPARED"$'\n'
    publish_state_record "$control_intent" "$intent_record_content"
    intent_record_sha="$(sha256sum "$control_intent" | awk '{ print $1 }')"
    intent_phase=PREPARED
    if [[ "$unprivileged_test_mode" == true && "${TEST_INSTALL_FAIL_AFTER_INTENT_SYNC:-false}" == true ]]; then
      die 'simulated crash after durable prepared intent with boot fences active'
    fi
  fi

  for ((plan_index = 0; plan_index < ${#install_directories[@]}; plan_index += 1)); do
    ensure_install_directory "${install_directory_modes[$plan_index]}" \
      "${install_directories[$plan_index]}" "${install_directory_groups[$plan_index]}"
  done
  if [[ "$unprivileged_test_mode" == false ]]; then
    chown root:leetplus-runtime "$runtime_cache"
    chmod 0550 "$runtime_cache"
    sync -f "$runtime_cache"
    sync -d "$(dirname -- "$runtime_cache")"
  fi
  for ((plan_index = 0; plan_index < ${#install_destinations[@]}; plan_index += 1)); do
    attest_runtime_masks
    attest_persistent_fences
    install_file "${install_modes[$plan_index]}" "${install_sources[$plan_index]}" \
      "${install_destinations[$plan_index]}" "${install_groups[$plan_index]}"
    if [[ "$unprivileged_test_mode" == true && "${TEST_INSTALL_SIMULATE_RESTART_DURING_MUTATION:-false}" == true ]]; then
      attest_runtime_masks
      attest_persistent_fences
      printf 'LEGACY_ROLLBACK_CONTROL_INSTALL_SIMULATED_RESTART_BLOCKED=true\n'
    fi
  done
  daemon_reload
  compute_install_drift
  ((drift_count == 0)) || die 'installed control generation is still mixed or drifted after mutation'
  attest_runtime_masks
  attest_persistent_fences
  attest_quiescent_runtime
  intent_record_content="CONTRACT=${CONTROL_INSTALL_CONTRACT}"$'\n'\
"CONTROL_MANIFEST_SHA256=${control_manifest_sha}"$'\n'\
"INSTALL_PLAN_SHA256=${install_plan_sha}"$'\n'\
"FENCE_SHA256=${fence_record_sha}"$'\n'\
"PHASE=POST_ATTESTED"$'\n'
  publish_state_record "$control_intent" "$intent_record_content"
  intent_record_sha="$(sha256sum "$control_intent" | awk '{ print $1 }')"
  intent_phase=POST_ATTESTED
else
  compute_install_drift
  ((drift_count == 0)) \
    || die 'post-attested control-install recovery found a mixed/drifted generation'
fi

remove_persistent_fences
remove_runtime_masks
attest_loaded_control_generation
remove_state_record "$control_intent" "$intent_record_sha"
remove_state_record "$control_fence" "$fence_record_sha"
remove_state_record "$control_preparing" "$preparing_record_sha"

printf 'LEGACY_ROLLBACK_CONTOUR_INSTALL_DRIFT=true\n'

printf 'LEGACY_ROLLBACK_CONTOUR_INSTALLED=true\n'
printf 'LEGACY_ROLLBACK_CONTOUR_SHA=%s\n' "$LEGACY_SHA"
printf 'LEGACY_ROLLBACK_CONTOUR_STARTED=false\n'
printf 'LEGACY_ROLLBACK_CONTOUR_ROUTING_CHANGED=false\n'
printf 'LEGACY_ROLLBACK_CONTOUR_DATABASE_CHANGED=false\n'
