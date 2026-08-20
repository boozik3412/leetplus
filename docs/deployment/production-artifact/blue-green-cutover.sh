#!/usr/bin/env bash
#
# Atomic nginx blue/green switch with exact rollback and bounded watchdog.
# The script never stops the old runtime, migrates a database, edits an artifact
# or enables an outbound path.

set -euo pipefail
IFS=$'\n\t'
umask 0077

if ((EUID == 0)); then
  PATH='/usr/sbin:/usr/bin:/sbin:/bin'
  export PATH
fi

readonly RELEASE_SHA_PATTERN='^[0-9a-f]{40}$'
readonly MIGRATION_PATTERN='^[0-9]{14}_[a-z0-9_]+$'
readonly SLOT_PATTERN='^(blue|green)$'

die() {
  printf 'blue-green-cutover: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  blue-green-cutover.sh switch \
    --slot blue|green \
    --release-sha <40-lowercase-hex> \
    --expected-migration <migration-name> \
    --expected-migration-count <positive-integer> \
    --expected-web-build-id <same-40-lowercase-hex> \
    --loopback-api-url <url> --loopback-web-url <url> \
    --public-api-url <url> --public-web-url <url> \
    [--previous-release-sha <sha> --previous-migration <migration> \
     --previous-migration-count <count> --previous-web-build-id <sha>] \
    [--watchdog-seconds 30]

  blue-green-cutover.sh rollback --receipt <absolute-receipt-path>
  blue-green-cutover.sh recover-pending
  blue-green-cutover.sh recover-before-nginx

Production defaults:
  config root: /etc/nginx/leetplus
  state root:  /var/lib/leetplus/deploy-receipts
  probe:       /usr/local/libexec/leetplus/verify-release-readiness.sh

Tests may override those paths with --config-root, --state-root and --probe,
but only together with --unprivileged-test-mode while not running as root.
USAGE
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

atomic_link() {
  local target="$1"
  local active_link="$2"
  local temporary_link="${active_link}.next.$$"
  rm -f -- "$temporary_link" || return 1
  ln -s -- "$target" "$temporary_link" || return 1
  mv -Tf -- "$temporary_link" "$active_link" || return 1
  if [[ "${unprivileged_test_mode:-false}" == true \
    && "${LEETPLUS_TEST_FAIL_PHASE:-}" == 'after-link-mv' \
    && ! -e "${state_root}/.fixture-after-link-mv-fired" ]]; then
    : > "${state_root}/.fixture-after-link-mv-fired" || return 1
    return 1
  fi
  sync -d "$(dirname -- "$active_link")" || return 1
  [[ -L "$active_link" && "$(realpath -e -- "$active_link")" == "$target" ]] || return 1
}

nginx_test() {
  timeout 15 nginx -t
}

nginx_reload() {
  timeout 15 systemctl reload nginx.service
}

nginx_start() {
  timeout --foreground --kill-after=5s 30s systemctl start nginx.service
}

candidate_full_config_test() {
  if [[ "$unprivileged_test_mode" == true ]]; then
    # Behavioral fixtures use a command stub. Production below validates the
    # exact host nginx.conf in a private mount namespace with the candidate
    # include visible, before the boot-visible active link changes.
    nginx_test
    return
  fi

  local validation_root
  validation_root="$(mktemp -d /run/leetplus-nginx-validation.XXXXXX)"
  case "$validation_root" in /run/leetplus-nginx-validation.*) ;; *) die 'unsafe nginx validation directory' ;; esac
  cp -a -- "$config_root/." "$validation_root/"
  rm -f -- "$validation_root/active-upstreams.conf"
  ln -s -- "upstreams/$(basename -- "$slot_target")" "$validation_root/active-upstreams.conf"
  if ! timeout --foreground --kill-after=5s 20s \
    unshare --mount --propagation private /bin/sh -eu -c '
      mount --bind -- "$1" "$2"
      exec nginx -t
    ' leetplus-nginx-validation "$validation_root" "$config_root"; then
    rm -rf -- "$validation_root"
    die 'candidate full nginx configuration failed private-namespace validation'
  fi
  rm -rf -- "$validation_root"
}

unit_is_active() {
  timeout 10 systemctl is-active --quiet "$1"
}

unit_is_enabled() {
  timeout 10 systemctl is-enabled --quiet "$1"
}

http_exact_2xx() {
  local url="$1"
  local status

  status="$(timeout 20 curl --silent --show-error --max-time 10 \
    --output /dev/null --write-out '%{http_code}' "$url")" || return 1
  [[ "$status" =~ ^2[0-9][0-9]$ ]]
}

rollback_public_smoke() {
  if http_exact_2xx 'https://api.leetplus.ru/health' \
    && http_exact_2xx 'https://leetplus.ru/'; then
    printf 'BLUE_GREEN_ROLLBACK_SERVING_CONFIRMED=true\n'
    return 0
  fi
  printf 'BLUE_GREEN_ROLLBACK_SERVING_CONFIRMED=false\n' >&2
  return 1
}

set_previous_runtime_contract() {
  local target_basename
  target_basename="$(basename -- "$previous_target")"

  case "$target_basename" in
    legacy.conf)
      previous_runtime_kind='LEGACY'
      previous_slot='legacy'
      previous_api_unit='leetplus-api.service'
      previous_web_unit='leetplus-web.service'
      previous_api_url='http://127.0.0.1:4000'
      previous_web_url='http://127.0.0.1:3000'
      previous_release_sha='LEGACY_UNVERSIONED'
      previous_migration='LEGACY_UNVERSIONED'
      previous_migration_count='0'
      previous_web_build_id='LEGACY_UNVERSIONED'
      ;;
    blue.conf|green.conf)
      previous_runtime_kind='SLOT'
      previous_slot="${target_basename%.conf}"
      previous_api_unit="leetplus-api@${previous_slot}.service"
      previous_web_unit="leetplus-web@${previous_slot}.service"
      if [[ "$previous_slot" == 'blue' ]]; then
        previous_api_url='http://127.0.0.1:4100'
        previous_web_url='http://127.0.0.1:3100'
      else
        previous_api_url='http://127.0.0.1:4200'
        previous_web_url='http://127.0.0.1:3200'
      fi
      [[ "$previous_release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'previous slot release SHA is required and invalid'
      [[ "$previous_migration" =~ $MIGRATION_PATTERN ]] || die 'previous slot migration is required and invalid'
      [[ "$previous_migration_count" =~ ^[1-9][0-9]*$ ]] || die 'previous slot migration count is required and invalid'
      [[ "$previous_web_build_id" == "$previous_release_sha" ]] || die 'previous slot Web BUILD_ID must equal its exact release SHA'
      ;;
    *)
      die 'previous upstream target is not a reviewed legacy/blue/green target'
      ;;
  esac
}

validate_recorded_previous_runtime_contract() {
  local expected_kind expected_slot expected_api_unit expected_web_unit expected_api_url expected_web_url
  case "$(basename -- "$previous_target")" in
    legacy.conf)
      expected_kind='LEGACY'
      expected_slot='legacy'
      expected_api_unit='leetplus-api.service'
      expected_web_unit='leetplus-web.service'
      expected_api_url='http://127.0.0.1:4000'
      expected_web_url='http://127.0.0.1:3000'
      [[ "$previous_release_sha" == 'LEGACY_UNVERSIONED' \
        && "$previous_migration" == 'LEGACY_UNVERSIONED' \
        && "$previous_migration_count" == '0' \
        && "$previous_web_build_id" == 'LEGACY_UNVERSIONED' ]] \
        || die 'legacy rollback receipt contains forged release identity'
      ;;
    blue.conf|green.conf)
      expected_kind='SLOT'
      expected_slot="$(basename -- "$previous_target" .conf)"
      expected_api_unit="leetplus-api@${expected_slot}.service"
      expected_web_unit="leetplus-web@${expected_slot}.service"
      if [[ "$expected_slot" == 'blue' ]]; then
        expected_api_url='http://127.0.0.1:4100'
        expected_web_url='http://127.0.0.1:3100'
      else
        expected_api_url='http://127.0.0.1:4200'
        expected_web_url='http://127.0.0.1:3200'
      fi
      [[ "$previous_release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'rollback receipt previous release SHA is invalid'
      [[ "$previous_migration" =~ $MIGRATION_PATTERN ]] || die 'rollback receipt previous migration is invalid'
      [[ "$previous_migration_count" =~ ^[1-9][0-9]*$ ]] || die 'rollback receipt previous migration count is invalid'
      [[ "$previous_web_build_id" == "$previous_release_sha" ]] || die 'rollback receipt previous Web identity is invalid'
      ;;
    *) die 'rollback receipt previous target is not a reviewed runtime' ;;
  esac

  [[ "$previous_runtime_kind" == "$expected_kind" \
    && "$previous_slot" == "$expected_slot" \
    && "$previous_api_unit" == "$expected_api_unit" \
    && "$previous_web_unit" == "$expected_web_unit" \
    && "$previous_api_url" == "$expected_api_url" \
    && "$previous_web_url" == "$expected_web_url" ]] \
    || die 'rollback receipt previous runtime routing contract is forged'
}

verify_previous_runtime() {
  unit_is_enabled "$previous_api_unit" || {
    printf 'blue-green-cutover: previous API unit is not boot-enabled: %s\n' "$previous_api_unit" >&2
    return 1
  }
  unit_is_enabled "$previous_web_unit" || {
    printf 'blue-green-cutover: previous Web unit is not boot-enabled: %s\n' "$previous_web_unit" >&2
    return 1
  }
  unit_is_active "$previous_api_unit" || {
    printf 'blue-green-cutover: previous API unit is not active: %s\n' "$previous_api_unit" >&2
    return 1
  }
  unit_is_active "$previous_web_unit" || {
    printf 'blue-green-cutover: previous Web unit is not active: %s\n' "$previous_web_unit" >&2
    return 1
  }

  if [[ "$previous_runtime_kind" == 'LEGACY' ]]; then
    http_exact_2xx "${previous_api_url}/health" || return 1
    http_exact_2xx "${previous_web_url}/" || return 1
    return 0
  fi

  timeout 20 "$probe" \
    --release-sha "$previous_release_sha" \
    --expected-migration "$previous_migration" \
    --expected-migration-count "$previous_migration_count" \
    --expected-web-build-id "$previous_web_build_id" \
    --api-base-url "$previous_api_url" \
    --web-url "$previous_web_url"
}

verify_previous_runtime_bounded() {
  local deadline=$((SECONDS + 75))
  while ((SECONDS < deadline)); do
    if verify_previous_runtime; then
      return 0
    fi
    ((SECONDS < deadline)) && sleep 1
  done
  return 1
}

restore_and_reload() {
  local previous_target="$1"
  local active_link="$2"
  local recovery_mode="${3:-normal}"
  local previous_verifier
  recovery_serving_deferred=false
  if [[ "$recovery_mode" == 'pre-nginx' ]]; then
    previous_verifier=verify_previous_runtime_bounded
  else
    previous_verifier=verify_previous_runtime
  fi
  if ! "$previous_verifier"; then
    printf 'blue-green-cutover: STOP: exact previous runtime is not directly live; routing was not changed to a dead N-1\n' >&2
    return 1
  fi
  atomic_link "$previous_target" "$active_link" || {
    printf 'blue-green-cutover: STOP: cannot atomically restore exact previous nginx target\n' >&2
    return 1
  }
  [[ "$(realpath -e -- "$active_link")" == "$previous_target" ]] || {
    printf 'blue-green-cutover: STOP: active link does not resolve to exact previous target after restore\n' >&2
    return 1
  }
  if ! nginx_test; then
    printf 'blue-green-cutover: STOP: previous nginx target no longer validates; loaded nginx workers were not stopped\n' >&2
    return 1
  fi
  if [[ "$recovery_mode" == 'pre-nginx' ]]; then
    recovery_serving_deferred=true
    printf 'BLUE_GREEN_RECOVERY_NGINX_START_DEFERRED=true\n'
    return 0
  fi
  if [[ "$recovery_mode" == 'allow-inactive' ]] && ! unit_is_active nginx.service; then
    nginx_start || {
      printf 'blue-green-cutover: STOP: recovered previous config validates but nginx could not be started\n' >&2
      return 1
    }
    rollback_public_smoke || {
      printf 'blue-green-cutover: STOP: nginx started with recovered config but public serving is unconfirmed\n' >&2
      return 1
    }
    printf 'BLUE_GREEN_RECOVERY_NGINX_STARTED=true\n'
    return 0
  fi
  if ! nginx_reload; then
    printf 'blue-green-cutover: STOP: graceful reload of previous nginx target failed; loaded workers were not stopped\n' >&2
    return 1
  fi
  if ! rollback_public_smoke; then
    printf 'blue-green-cutover: STOP: previous link/processes were restored, but public serving could not be confirmed\n' >&2
    return 1
  fi
}

archive_recovered_intent() {
  local intent="$1"
  local recovered="${intent%.intent}.recovered"
  [[ "$intent" == *.intent && ! -e "$recovered" && ! -L "$recovered" ]] \
    || die 'cannot archive recovered intent safely'
  printf 'RECOVERED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)" >> "$intent" || return 1
  sync -f "$intent" || return 1
  if [[ "${unprivileged_test_mode:-false}" == true \
    && "${LEETPLUS_TEST_FAIL_PHASE:-}" == 'before-archive-mv' \
    && ! -e "${state_root}/.fixture-before-archive-mv-fired" ]]; then
    : > "${state_root}/.fixture-before-archive-mv-fired" || return 1
    return 1
  fi
  mv -T -- "$intent" "$recovered" || return 1
  sync -f "$recovered" || return 1
  sync -d "$state_root" || return 1
  [[ ! -e "$intent" && ! -L "$intent" && -f "$recovered" && ! -L "$recovered" ]] \
    || return 1
  printf 'BLUE_GREEN_RECOVERED_RECORD=%s\n' "$recovered"
}

cutover_exit_guard() {
  local status=$?
  trap - EXIT HUP INT TERM
  if [[ "${cutover_guard_armed:-false}" == true ]]; then
    set +e
    printf 'blue-green-cutover: interrupted with an unaccepted routing effect; restoring exact N-1\n' >&2
    if restore_and_reload "$previous_target" "$active_link"; then
      if ! archive_recovered_intent "$intent_path"; then
        printf 'blue-green-cutover: exact N-1 was restored but durable intent archival failed\n' >&2
      fi
    else
      printf 'blue-green-cutover: automatic exit rollback failed; durable intent retained for recovery service\n' >&2
    fi
  fi
  exit "$status"
}

restore_unaccepted_candidate() {
  restore_and_reload "$previous_target" "$active_link" || return 1
  archive_recovered_intent "$intent_path" || return 1
  cutover_guard_armed=false
}

read_receipt_value() {
  local receipt="$1"
  local key="$2"
  awk -F= -v key="$key" '
    $1 == key { count += 1; value = substr($0, length(key) + 2) }
    END { if (count != 1) exit 1; print value }
  ' "$receipt"
}

mode=''
if (($# > 0)); then
  mode="$1"
  shift
fi
[[ "$mode" == 'switch' || "$mode" == 'rollback' || "$mode" == 'recover-pending' || "$mode" == 'recover-before-nginx' ]] || {
  usage >&2
  exit 1
}

slot=''
release_sha=''
expected_migration=''
expected_migration_count=''
expected_web_build_id=''
loopback_api_url=''
loopback_web_url=''
public_api_url=''
public_web_url=''
previous_release_sha=''
previous_migration=''
previous_migration_count=''
previous_web_build_id=''
previous_runtime_kind=''
previous_slot=''
previous_api_unit=''
previous_web_unit=''
previous_api_url=''
previous_web_url=''
receipt=''
watchdog_seconds=30
config_root='/etc/nginx/leetplus'
state_root='/var/lib/leetplus/deploy-receipts'
probe='/usr/local/libexec/leetplus/verify-release-readiness.sh'
unprivileged_test_mode=false

while (($# > 0)); do
  case "$1" in
    --slot) slot="${2:-}"; shift 2 ;;
    --release-sha) release_sha="${2:-}"; shift 2 ;;
    --expected-migration) expected_migration="${2:-}"; shift 2 ;;
    --expected-migration-count) expected_migration_count="${2:-}"; shift 2 ;;
    --expected-web-build-id) expected_web_build_id="${2:-}"; shift 2 ;;
    --loopback-api-url) loopback_api_url="${2:-}"; shift 2 ;;
    --loopback-web-url) loopback_web_url="${2:-}"; shift 2 ;;
    --public-api-url) public_api_url="${2:-}"; shift 2 ;;
    --public-web-url) public_web_url="${2:-}"; shift 2 ;;
    --previous-release-sha) previous_release_sha="${2:-}"; shift 2 ;;
    --previous-migration) previous_migration="${2:-}"; shift 2 ;;
    --previous-migration-count) previous_migration_count="${2:-}"; shift 2 ;;
    --previous-web-build-id) previous_web_build_id="${2:-}"; shift 2 ;;
    --receipt) receipt="${2:-}"; shift 2 ;;
    --watchdog-seconds) watchdog_seconds="${2:-}"; shift 2 ;;
    --config-root) config_root="${2:-}"; shift 2 ;;
    --state-root) state_root="${2:-}"; shift 2 ;;
    --probe) probe="${2:-}"; shift 2 ;;
    --unprivileged-test-mode) unprivileged_test_mode=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

if [[ "$unprivileged_test_mode" == true ]]; then
  ((EUID != 0)) || die 'unprivileged test mode is forbidden for root'
else
  ((EUID == 0)) || die 'production cutover must run as root'
  [[ "$config_root" == '/etc/nginx/leetplus' ]] || die 'production config root cannot be overridden'
  [[ "$state_root" == '/var/lib/leetplus/deploy-receipts' ]] || die 'production state root cannot be overridden'
  [[ "$probe" == '/usr/local/libexec/leetplus/verify-release-readiness.sh' ]] || die 'production readiness probe cannot be overridden'
  PATH='/usr/sbin:/usr/bin:/sbin:/bin'
  export PATH
fi

for command_name in awk basename chmod cp curl date dirname find flock ln mktemp mount mv nginx realpath rm sha256sum sleep stat sync systemctl timeout unshare; do
  require_command "$command_name"
done

[[ -d "$config_root" && ! -L "$config_root" ]] || die 'config root must be a real directory'
[[ -d "$state_root" && ! -L "$state_root" ]] || die 'state root must be a real directory'
[[ -f "$probe" && ! -L "$probe" && -x "$probe" ]] || die 'readiness probe must be an executable regular file'
config_root="$(realpath -e -- "$config_root")"
state_root="$(realpath -e -- "$state_root")"
probe="$(realpath -e -- "$probe")"

if [[ "$unprivileged_test_mode" == false ]]; then
  probe_root="$(dirname -- "$probe")"
  [[ "$(stat -c '%U' -- /var/lib)" == 'root' \
    && -z "$(find -P /var/lib -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die '/var/lib deployment ancestor is not trusted'
  [[ -d /var/lib/leetplus && ! -L /var/lib/leetplus ]] || die 'deployment state parent is absent or is a symlink'
  [[ "$(stat -c '%U' -- /var/lib/leetplus)" == 'root' ]] || die 'deployment state parent must be root-owned'
  [[ -z "$(find -P /var/lib/leetplus -maxdepth 0 -perm /022 -print -quit)" ]] || die 'deployment state parent is group/other-writable'
  [[ "$(stat -c '%U' -- "$config_root")" == 'root' ]] || die 'config root must be root-owned'
  [[ "$(stat -c '%U' -- "$state_root")" == 'root' ]] || die 'state root must be root-owned'
  [[ "$(stat -c '%U' -- "$probe")" == 'root' ]] || die 'readiness probe must be root-owned'
  [[ "$(stat -c '%U' -- "$probe_root")" == 'root' ]] || die 'readiness probe directory must be root-owned'
  [[ "$(stat -c '%a' -- "$state_root")" == '700' ]] || die 'state root mode must be 0700'
  [[ -z "$(find -P "$probe" -maxdepth 0 -perm /022 -print -quit)" ]] || die 'readiness probe is group/other-writable'
  [[ -z "$(find -P "$probe_root" -maxdepth 0 -perm /022 -print -quit)" ]] || die 'readiness probe directory is group/other-writable'
  [[ -z "$(find -P "$config_root" -maxdepth 2 \( -type d -o -type f \) -perm /022 -print -quit)" ]] || die 'nginx deployment config is group/other-writable'
fi

active_link="${config_root}/active-upstreams.conf"
[[ -d "${config_root}/upstreams" && ! -L "${config_root}/upstreams" ]] || die 'upstream root must be a real directory'
upstream_root="$(realpath -e -- "${config_root}/upstreams")"
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$(stat -c '%U' -- "$upstream_root")" == 'root' ]] || die 'upstream root must be root-owned'
  unexpected_config_owner="$(find -P "$config_root" -maxdepth 2 \
    \( -type d -o -type f -o -type l \) ! -user root -print -quit)"
  [[ -z "$unexpected_config_owner" ]] || die 'nginx deployment config contains a non-root-owned entry'
fi
lock_file="${state_root}/cutover.lock"
exec 9> "$lock_file"
flock -n 9 || die 'another blue/green operation holds the deployment lock'

if [[ "$mode" == 'recover-pending' || "$mode" == 'recover-before-nginx' ]]; then
  pending_intents=()
  while IFS= read -r -d '' pending_intent; do
    pending_intents+=("$pending_intent")
  done < <(find -P "$state_root" -maxdepth 1 -type f -name '*.intent' -print0)
  if ((${#pending_intents[@]} == 0)); then
    printf 'BLUE_GREEN_PENDING_RECOVERY=false\n'
    exit 0
  fi
  ((${#pending_intents[@]} == 1)) \
    || die 'multiple outstanding cutover intents require manual incident handling'
  receipt="${pending_intents[0]}"
fi

if [[ "$mode" == 'rollback' || "$mode" == 'recover-pending' || "$mode" == 'recover-before-nginx' ]]; then
  [[ "$receipt" == /* ]] || die 'rollback receipt path must be absolute'
  [[ -f "$receipt" && ! -L "$receipt" ]] || die 'receipt must be a regular non-symlink file'
  receipt="$(realpath -e -- "$receipt")"
  case "$receipt" in "$state_root"/*) ;; *) die 'receipt is outside the protected state root' ;; esac
  if [[ "$unprivileged_test_mode" == false ]]; then
    [[ "$(stat -c '%U' -- "$receipt")" == 'root' ]] || die 'receipt must be root-owned'
    [[ "$(stat -c '%a' -- "$receipt")" == '600' ]] || die 'receipt mode must be 0600'
  fi

  receipt_name="$(basename -- "$receipt")"
  case "$receipt_name" in
    *.intent) receipt_state='INTENT' ;;
    *.receipt) receipt_state='ACCEPTED' ;;
    *) die 'rollback file must be an intent or accepted receipt' ;;
  esac
  if [[ ( "$mode" == 'recover-pending' || "$mode" == 'recover-before-nginx' ) && "$receipt_state" != 'INTENT' ]]; then
    die 'automatic recovery accepts only an outstanding intent'
  fi
  record_version="$(read_receipt_value "$receipt" RECORD_VERSION)" || die 'receipt has no unique record version'
  [[ "$record_version" == '2' ]] || die 'receipt record version is unsupported'
  previous_target="$(read_receipt_value "$receipt" PREVIOUS_TARGET)" || die 'receipt has no unique previous target'
  previous_digest="$(read_receipt_value "$receipt" PREVIOUS_SHA256)" || die 'receipt has no unique previous digest'
  previous_runtime_kind="$(read_receipt_value "$receipt" PREVIOUS_RUNTIME_KIND)" || die 'receipt has no unique previous runtime kind'
  previous_slot="$(read_receipt_value "$receipt" PREVIOUS_SLOT)" || die 'receipt has no unique previous slot'
  previous_api_unit="$(read_receipt_value "$receipt" PREVIOUS_API_UNIT)" || die 'receipt has no unique previous API unit'
  previous_web_unit="$(read_receipt_value "$receipt" PREVIOUS_WEB_UNIT)" || die 'receipt has no unique previous Web unit'
  previous_api_url="$(read_receipt_value "$receipt" PREVIOUS_API_URL)" || die 'receipt has no unique previous API URL'
  previous_web_url="$(read_receipt_value "$receipt" PREVIOUS_WEB_URL)" || die 'receipt has no unique previous Web URL'
  previous_release_sha="$(read_receipt_value "$receipt" PREVIOUS_RELEASE_SHA)" || die 'receipt has no unique previous release SHA'
  previous_migration="$(read_receipt_value "$receipt" PREVIOUS_MIGRATION)" || die 'receipt has no unique previous migration'
  previous_migration_count="$(read_receipt_value "$receipt" PREVIOUS_MIGRATION_COUNT)" || die 'receipt has no unique previous migration count'
  previous_web_build_id="$(read_receipt_value "$receipt" PREVIOUS_WEB_BUILD_ID)" || die 'receipt has no unique previous Web identity'
  activated_target="$(read_receipt_value "$receipt" ACTIVATED_TARGET)" || die 'receipt has no unique activated target'
  activated_digest="$(read_receipt_value "$receipt" ACTIVATED_SHA256)" || die 'receipt has no unique activated digest'
  [[ "$previous_target" =~ ^/[A-Za-z0-9_./-]+$ && "$activated_target" =~ ^/[A-Za-z0-9_./-]+$ ]] || die 'receipt contains an unsafe target path'
  [[ "$(dirname -- "$previous_target")" == "$upstream_root" && "$(basename -- "$previous_target")" == *.conf ]] || die 'previous receipt target is outside the reviewed upstream root'
  [[ "$(dirname -- "$activated_target")" == "$upstream_root" && "$(basename -- "$activated_target")" == *.conf ]] || die 'activated receipt target is outside the reviewed upstream root'
  [[ "$previous_digest" =~ ^[0-9a-f]{64}$ ]] || die 'receipt contains an invalid previous digest'
  [[ "$activated_digest" =~ ^[0-9a-f]{64}$ ]] || die 'receipt contains an invalid activated digest'
  validate_recorded_previous_runtime_contract
  [[ -L "$active_link" ]] || die 'active upstream link is absent'
  current_target="$(realpath -e -- "$active_link")"
  [[ -f "$previous_target" && ! -L "$previous_target" ]] || die 'previous upstream target is absent or not regular'
  [[ "$(realpath -e -- "$previous_target")" == "$previous_target" ]] || die 'previous upstream target is not canonical'
  [[ -f "$activated_target" && ! -L "$activated_target" ]] || die 'activated upstream target is absent or not regular'
  [[ "$(realpath -e -- "$activated_target")" == "$activated_target" ]] || die 'activated upstream target is not canonical'
  [[ "$(sha256sum -- "$previous_target" | awk '{ print $1 }')" == "$previous_digest" ]] || die 'previous upstream target digest changed'
  if [[ "$(sha256sum -- "$activated_target" | awk '{ print $1 }')" != "$activated_digest" ]]; then
    printf 'blue-green-cutover: warning: activated target digest changed; restoring the still-exact previous target\n' >&2
  fi
  if [[ "$current_target" == "$activated_target" || "$current_target" == "$previous_target" ]]; then
    # Always perform a bounded validation + graceful reload, including when the
    # link is already restored. A prior rollback may have crashed after the
    # link effect but before nginx reload; the receipt is deliberately
    # idempotent across that phase boundary.
    if [[ "$mode" == 'recover-before-nginx' ]]; then
      restore_and_reload "$previous_target" "$active_link" pre-nginx \
        || die 'automatic pre-nginx exact link recovery failed'
    elif [[ "$mode" == 'recover-pending' ]]; then
      restore_and_reload "$previous_target" "$active_link" allow-inactive \
        || die 'automatic exact nginx recovery failed'
    else
      restore_and_reload "$previous_target" "$active_link" \
        || die 'exact nginx rollback failed'
    fi
  else
    die 'stale rollback record does not describe the active target'
  fi
  printf 'BLUE_GREEN_ROLLBACK_RECEIPT=%s\n' "$receipt"
  printf 'BLUE_GREEN_ROLLBACK_RECORD_STATE=%s\n' "$receipt_state"
  printf 'BLUE_GREEN_ROLLBACK_TARGET=%s\n' "$previous_target"
  printf 'BLUE_GREEN_OLD_PROCESSES_STOPPED=false\n'
  if [[ "$receipt_state" == 'INTENT' \
    && !( ( "$mode" == 'recover-pending' || "$mode" == 'recover-before-nginx' ) \
      && "${recovery_serving_deferred:-false}" == true ) ]]; then
    archive_recovered_intent "$receipt"
  fi
  exit 0
fi

outstanding_intent="$(find -P "$state_root" -maxdepth 1 -type f -name '*.intent' -print -quit)"
[[ -z "$outstanding_intent" ]] \
  || die 'an outstanding cutover intent must be recovered before a new switch'

[[ "$slot" =~ $SLOT_PATTERN ]] || die 'slot must be blue or green'
[[ "$release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'release SHA must be 40 lowercase hexadecimal characters'
[[ "$expected_migration" =~ $MIGRATION_PATTERN ]] || die 'expected migration name is invalid'
[[ "$expected_migration_count" =~ ^[1-9][0-9]*$ ]] || die 'expected migration count must be positive'
[[ "$expected_web_build_id" == "$release_sha" ]] || die 'expected Web BUILD_ID must equal exact release SHA'
[[ "$watchdog_seconds" =~ ^[0-9]+$ ]] || die 'watchdog seconds must be an integer'
((watchdog_seconds >= 5 && watchdog_seconds <= 60)) || die 'watchdog seconds must be between 5 and 60'
if [[ "$unprivileged_test_mode" == false ]]; then
  if [[ "$slot" == 'blue' ]]; then
    [[ "$loopback_api_url" == 'http://127.0.0.1:4100' ]] || die 'blue API loopback URL must be pinned to 127.0.0.1:4100'
    [[ "$loopback_web_url" == 'http://127.0.0.1:3100' ]] || die 'blue Web loopback URL must be pinned to 127.0.0.1:3100'
  else
    [[ "$loopback_api_url" == 'http://127.0.0.1:4200' ]] || die 'green API loopback URL must be pinned to 127.0.0.1:4200'
    [[ "$loopback_web_url" == 'http://127.0.0.1:3200' ]] || die 'green Web loopback URL must be pinned to 127.0.0.1:3200'
  fi
  [[ "$public_api_url" == 'https://api.leetplus.ru' ]] || die 'public API URL must be pinned to https://api.leetplus.ru'
  [[ "$public_web_url" == 'https://leetplus.ru' ]] || die 'public Web URL must be pinned to https://leetplus.ru'
else
  for required_url in "$loopback_api_url" "$loopback_web_url" "$public_api_url" "$public_web_url"; do
    [[ "$required_url" =~ ^https?://[^[:space:]]+$ ]] || die 'all readiness URLs must be absolute HTTP(S) URLs'
  done
fi

slot_target="${config_root}/upstreams/${slot}.conf"
[[ -f "$slot_target" && ! -L "$slot_target" ]] || die 'slot upstream target must be a regular non-symlink file'
[[ -L "$active_link" ]] || die 'active upstream link must already point to the concrete N-1 target'
previous_target="$(realpath -e -- "$active_link")"
[[ -f "$previous_target" && ! -L "$previous_target" ]] || die 'previous upstream target must be a regular non-symlink file'
[[ "$(dirname -- "$previous_target")" == "$upstream_root" ]] || die 'previous upstream target is outside the reviewed upstream root'
[[ "$(realpath -e -- "$slot_target")" == "$slot_target" ]] || die 'slot upstream target is not canonical'
[[ "$slot_target" != "$previous_target" ]] || die 'requested slot is already active'
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$(stat -c '%U' -- "$slot_target")" == 'root' ]] || die 'slot upstream target must be root-owned'
  [[ "$(stat -c '%U' -- "$previous_target")" == 'root' ]] || die 'previous upstream target must be root-owned'
fi
set_previous_runtime_contract

unit_is_active "leetplus-api@${slot}.service" || die 'candidate API unit is not active'
unit_is_active "leetplus-web@${slot}.service" || die 'candidate Web unit is not active'
unit_is_enabled "leetplus-api@${slot}.service" || die 'candidate API unit is not boot-enabled'
unit_is_enabled "leetplus-web@${slot}.service" || die 'candidate Web unit is not boot-enabled'

probe_arguments=(
  --release-sha "$release_sha"
  --expected-migration "$expected_migration"
  --expected-migration-count "$expected_migration_count"
  --expected-web-build-id "$expected_web_build_id"
)
timeout 20 "$probe" "${probe_arguments[@]}" \
  --api-base-url "$loopback_api_url" --web-url "$loopback_web_url" || die 'candidate loopback readiness failed before nginx switch'

verify_previous_runtime || die 'exact N-1 runtime is not directly live before nginx switch'
candidate_full_config_test

previous_digest="$(sha256sum -- "$previous_target" | awk '{ print $1 }')"
slot_digest="$(sha256sum -- "$slot_target" | awk '{ print $1 }')"
timestamp="$(date -u +%Y%m%dT%H%M%S%NZ)"
intent_path="${state_root}/${timestamp}-${release_sha}-${slot}.intent"
accepted_receipt_path="${state_root}/${timestamp}-${release_sha}-${slot}.receipt"
[[ ! -e "$intent_path" && ! -L "$intent_path" && ! -e "$accepted_receipt_path" && ! -L "$accepted_receipt_path" ]] || die 'cutover intent/receipt already exists'
intent_temporary="${intent_path}.new.$$"
{
  printf 'RECORD_VERSION=2\n'
  printf 'RELEASE_SHA=%s\n' "$release_sha"
  printf 'SLOT=%s\n' "$slot"
  printf 'PREVIOUS_TARGET=%s\n' "$previous_target"
  printf 'PREVIOUS_SHA256=%s\n' "$previous_digest"
  printf 'PREVIOUS_RUNTIME_KIND=%s\n' "$previous_runtime_kind"
  printf 'PREVIOUS_SLOT=%s\n' "$previous_slot"
  printf 'PREVIOUS_API_UNIT=%s\n' "$previous_api_unit"
  printf 'PREVIOUS_WEB_UNIT=%s\n' "$previous_web_unit"
  printf 'PREVIOUS_API_URL=%s\n' "$previous_api_url"
  printf 'PREVIOUS_WEB_URL=%s\n' "$previous_web_url"
  printf 'PREVIOUS_RELEASE_SHA=%s\n' "$previous_release_sha"
  printf 'PREVIOUS_MIGRATION=%s\n' "$previous_migration"
  printf 'PREVIOUS_MIGRATION_COUNT=%s\n' "$previous_migration_count"
  printf 'PREVIOUS_WEB_BUILD_ID=%s\n' "$previous_web_build_id"
  printf 'ACTIVATED_TARGET=%s\n' "$slot_target"
  printf 'ACTIVATED_SHA256=%s\n' "$slot_digest"
  printf 'INTENT_RECORDED_AT=%s\n' "$timestamp"
} > "$intent_temporary"
chmod 0600 -- "$intent_temporary"
mv -T -- "$intent_temporary" "$intent_path"
sync -f "$intent_path"
sync -d "$state_root"

cutover_guard_armed=true
trap cutover_exit_guard EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
atomic_link "$slot_target" "$active_link"
[[ "$(realpath -e -- "$active_link")" == "$slot_target" ]] \
  || die 'candidate routing link did not resolve to the exact target after atomic switch'
if [[ "$unprivileged_test_mode" == true && "${LEETPLUS_TEST_ABORT_AFTER_LINK:-false}" == true ]]; then
  die 'fixture-requested interruption after routing link effect'
fi

if ! nginx_test; then
  restore_unaccepted_candidate || die 'candidate nginx test failed and exact rollback failed'
  die 'candidate nginx test failed; exact previous target was restored and reloaded'
fi
if ! nginx_reload; then
  restore_unaccepted_candidate || die 'candidate reload and exact rollback both failed'
  die 'candidate nginx reload failed; exact previous target was restored'
fi

watchdog_deadline=$((SECONDS + watchdog_seconds))
watchdog_accepted=false
watchdog_consecutive_successes=0
while ((SECONDS < watchdog_deadline)); do
  watchdog_remaining=$((watchdog_deadline - SECONDS))
  if unit_is_active "leetplus-api@${slot}.service" \
    && unit_is_active "leetplus-web@${slot}.service" \
    && timeout "$watchdog_remaining" "$probe" "${probe_arguments[@]}" \
      --api-base-url "$public_api_url" --web-url "$public_web_url"; then
    watchdog_consecutive_successes=$((watchdog_consecutive_successes + 1))
    if ((watchdog_consecutive_successes >= 3)); then
      watchdog_accepted=true
      break
    fi
  else
    watchdog_consecutive_successes=0
  fi
  if ((SECONDS < watchdog_deadline)); then
    sleep 1
  fi
done

if [[ "$watchdog_accepted" != true ]]; then
  restore_unaccepted_candidate || die 'public watchdog failed and exact nginx rollback failed'
  die 'public watchdog failed; exact previous nginx target restored and old processes remain hot'
fi

trap '' HUP INT TERM
printf 'ACCEPTED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)" >> "$intent_path"
sync -f "$intent_path"
mv -T -- "$intent_path" "$accepted_receipt_path"
sync -f "$accepted_receipt_path"
sync -d "$state_root"
cutover_guard_armed=false
trap - EXIT HUP INT TERM

printf 'BLUE_GREEN_ACCEPTED_SHA=%s\n' "$release_sha"
printf 'BLUE_GREEN_ACCEPTED_SLOT=%s\n' "$slot"
printf 'BLUE_GREEN_ACCEPTED_RECEIPT=%s\n' "$accepted_receipt_path"
printf 'BLUE_GREEN_OLD_PROCESSES_STOPPED=false\n'
