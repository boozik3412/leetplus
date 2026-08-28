#!/usr/bin/bash -p
#
# Fail-closed filesystem preflight for a SHA-bound blue/green release slot.
#
# The script is intended to run as the same unprivileged service account as
# the API/Web systemd unit. It has no database, network, systemd or symlink
# mutation capability.

[[ $- == *p* ]] || { printf 'preflight-release-slot: privileged Bash mode is required\n' >&2; exit 1; }
LEETPLUS_BOOTSTRAP_TEST_PATH="${PATH:-}"
LEETPLUS_BOOTSTRAP_UNSAFE_ENV_KEYS=''
for LEETPLUS_BOOTSTRAP_ENV_KEY in \
  BASH_ENV ENV HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY \
  http_proxy https_proxy all_proxy no_proxy NODE_USE_ENV_PROXY NODE_OPTIONS NODE_PATH \
  NODE_EXTRA_CA_CERTS NODE_DEBUG NODE_V8_COVERAGE NODE_COMPILE_CACHE SSLKEYLOGFILE \
  LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES \
  GLIBC_TUNABLES MALLOC_CHECK_ MALLOC_PERTURB_ \
  CURL_HOME CURL_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR \
  PRISMA_QUERY_ENGINE_BINARY PRISMA_QUERY_ENGINE_LIBRARY PRISMA_SCHEMA_ENGINE_BINARY PRISMA_FMT_BINARY \
  TMPDIR TMP TEMP XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME \
  NPM_CONFIG_USERCONFIG npm_config_userconfig PNPM_HOME COREPACK_HOME COREPACK_NPM_REGISTRY COREPACK_INTEGRITY_KEYS \
  GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM; do
  [[ -v "$LEETPLUS_BOOTSTRAP_ENV_KEY" ]] \
    && LEETPLUS_BOOTSTRAP_UNSAFE_ENV_KEYS+=" ${LEETPLUS_BOOTSTRAP_ENV_KEY}"
done
unset LEETPLUS_BOOTSTRAP_ENV_KEY
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
export PATH
unset BASH_ENV ENV CDPATH \
  HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy all_proxy no_proxy \
  NODE_USE_ENV_PROXY NODE_OPTIONS NODE_PATH NODE_EXTRA_CA_CERTS NODE_DEBUG NODE_V8_COVERAGE \
  NODE_COMPILE_CACHE SSLKEYLOGFILE LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT GCONV_PATH LOCPATH \
  OPENSSL_CONF OPENSSL_MODULES GLIBC_TUNABLES MALLOC_CHECK_ MALLOC_PERTURB_ \
  CURL_HOME CURL_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR \
  PRISMA_QUERY_ENGINE_BINARY PRISMA_QUERY_ENGINE_LIBRARY PRISMA_SCHEMA_ENGINE_BINARY PRISMA_FMT_BINARY \
  TMPDIR TMP TEMP XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME \
  NPM_CONFIG_USERCONFIG npm_config_userconfig PNPM_HOME COREPACK_HOME COREPACK_NPM_REGISTRY COREPACK_INTEGRITY_KEYS \
  GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM

set -euo pipefail
IFS=$'\n\t'

readonly RELEASE_SHA_PATTERN='^[0-9a-f]{40}$'
readonly SLOT_PATTERN='^(blue|green)$'

die() {
  printf 'preflight-release-slot: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  preflight-release-slot.sh \
    --slot blue|green \
    --release-sha <40-lowercase-hex> \
    --web-build-id <same-40-lowercase-hex> \
    [--api-runtime] \
    [--web-runtime] \
    [--require-web-cache-bind] \
    [--slot-root /srv/leetplus/slots] \
    [--release-root /srv/leetplus/releases] \
    [--cache-marker-root /var/lib/leetplus/web-cache-releases]

Checks that the slot is a symlink to the exact root-owned, service-readable,
non-service-writable release and that provenance/API/Web identities match.
Repository tests may add --unprivileged-test-mode; root cannot use that mode.
USAGE
}

slot=''
release_sha=''
web_build_id=''
slot_root='/srv/leetplus/slots'
release_root='/srv/leetplus/releases'
cache_marker_root='/var/lib/leetplus/web-cache-releases'
unprivileged_test_mode=false
require_web_cache_bind=false
web_runtime=false
api_runtime=false
inert_sink_port=1

while (($# > 0)); do
  case "$1" in
    --slot)
      (($# >= 2)) || die '--slot requires a value'
      slot="$2"
      shift 2
      ;;
    --release-sha)
      (($# >= 2)) || die '--release-sha requires a value'
      release_sha="$2"
      shift 2
      ;;
    --web-build-id)
      (($# >= 2)) || die '--web-build-id requires a value'
      web_build_id="$2"
      shift 2
      ;;
    --slot-root)
      (($# >= 2)) || die '--slot-root requires a value'
      slot_root="$2"
      shift 2
      ;;
    --release-root)
      (($# >= 2)) || die '--release-root requires a value'
      release_root="$2"
      shift 2
      ;;
    --cache-marker-root)
      (($# >= 2)) || die '--cache-marker-root requires a value'
      cache_marker_root="$2"
      shift 2
      ;;
    --unprivileged-test-mode)
      unprivileged_test_mode=true
      shift
      ;;
    --require-web-cache-bind)
      require_web_cache_bind=true
      shift
      ;;
    --web-runtime)
      web_runtime=true
      shift
      ;;
    --api-runtime)
      api_runtime=true
      shift
      ;;
    --test-inert-sink-port)
      (($# >= 2)) || die '--test-inert-sink-port requires a value'
      inert_sink_port="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

[[ "$slot" =~ $SLOT_PATTERN ]] || die 'slot must be blue or green'
[[ "$release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'release SHA must be 40 lowercase hexadecimal characters'
[[ "$web_build_id" == "$release_sha" ]] || die 'Web BUILD_ID must equal the exact release SHA'
[[ "$web_runtime" != true || "$api_runtime" != true ]] || die 'API and Web runtime modes are mutually exclusive'
if [[ "$slot" == 'blue' ]]; then
  [[ "${PORT:-}" == '4100' && "${WEB_PORT:-}" == '3100' ]] || die 'blue slot ports must be exactly API 4100 / Web 3100'
  [[ "${API_URL:-}" == 'http://127.0.0.1:4100' ]] || die 'blue slot internal API URL must be loopback 4100'
else
  [[ "${PORT:-}" == '4200' && "${WEB_PORT:-}" == '3200' ]] || die 'green slot ports must be exactly API 4200 / Web 3200'
  [[ "${API_URL:-}" == 'http://127.0.0.1:4200' ]] || die 'green slot internal API URL must be loopback 4200'
fi
[[ "${API_BIND_HOST:-}" == '127.0.0.1' ]] || die 'candidate API bind host must be exact loopback 127.0.0.1'

# A local forwarding proxy or process-loader hook would bypass the intended
# boundary. Capture presence before the mandatory bootstrap scrub, then fail.
[[ -z "$LEETPLUS_BOOTSTRAP_UNSAFE_ENV_KEYS" ]] \
  || die "candidate inherited forbidden injection environment:${LEETPLUS_BOOTSTRAP_UNSAFE_ENV_KEYS}"

if [[ "$unprivileged_test_mode" == true ]]; then
  ((EUID != 0)) || die 'unprivileged test mode is forbidden for root'
  [[ "$inert_sink_port" =~ ^[1-9][0-9]{0,4}$ && "$inert_sink_port" -le 65535 ]] \
    || die 'test inert sink port is invalid'
  PATH="$LEETPLUS_BOOTSTRAP_TEST_PATH"
  export PATH
else
  [[ "$inert_sink_port" == 1 ]] || die 'production inert sink port cannot be overridden'
  [[ "$slot_root" == '/srv/leetplus/slots' ]] || die 'production slot root cannot be overridden'
  [[ "$release_root" == '/srv/leetplus/releases' ]] || die 'production release root cannot be overridden'
  [[ "$cache_marker_root" == '/var/lib/leetplus/web-cache-releases' ]] || die 'production cache marker root cannot be overridden'
fi
unset LEETPLUS_BOOTSTRAP_TEST_PATH
unset LEETPLUS_BOOTSTRAP_UNSAFE_ENV_KEYS

for command_name in find id node realpath sha256sum stat tr; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done

if [[ "$unprivileged_test_mode" == false && "$web_runtime" == true ]]; then
  # This process is an ExecStartPre of the candidate unit, so the connection
  # attempt runs in that unit's live cgroup and effective IP firewall. Target
  # the host's own non-loopback IPv4 on the closed discard port: a working
  # boundary returns EACCES/EPERM or silently drops the local packet until the
  # bounded timeout; success, refusal or absence of a non-loopback address fail.
  node --input-type=module <<'NETWORK_DENY_SELF_TEST' \
    || die 'candidate live kernel no-egress self-test failed'
import { networkInterfaces } from "node:os";
import { Socket } from "node:net";

const target = Object.values(networkInterfaces())
  .flat()
  .filter(Boolean)
  .filter((entry) => entry.family === "IPv4" && entry.internal === false)
  .map((entry) => entry.address)
  .sort()[0];

if (!target) process.exit(61);
const accepted = await new Promise((resolve) => {
  const socket = new Socket();
  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    resolve(value);
  };
  socket.setTimeout(1500, () => finish(true));
  socket.once("connect", () => finish(false));
  socket.once("error", (error) => finish(
    error?.code === "EACCES" || error?.code === "EPERM",
  ));
  socket.connect({ family: 4, host: target, port: 1 });
});
if (!accepted) process.exit(62);
NETWORK_DENY_SELF_TEST
  printf 'RELEASE_SLOT_NETWORK_PROFILE=localhost-only\n'
elif [[ "$unprivileged_test_mode" == false && "$api_runtime" == true ]]; then
  # The API is the reviewed integration boundary. Its public listener remains
  # loopback-only, while outbound TCP/DNS is required for Langame and the other
  # configured providers.
  printf 'RELEASE_SLOT_NETWORK_PROFILE=external-integrations\n'
fi

[[ "${EXPECTED_DATABASE_MIGRATION:-}" =~ ^[0-9]{14}_[a-z0-9_]+$ ]] \
  || die 'expected database migration environment is invalid'
[[ "${EXPECTED_DATABASE_MIGRATION_COUNT:-}" =~ ^[1-9][0-9]*$ ]] \
  || die 'expected database migration count environment is invalid'

if [[ "$web_runtime" == true ]]; then
  [[ "${NODE_ENV:-}" == 'production' ]] || die 'Web runtime NODE_ENV must be production'
  [[ -z "${NEXT_PUBLIC_API_URL:-}" ]] \
    || die 'Web runtime must not use the build-time NEXT_PUBLIC_API_URL for server-side API routing'

  while IFS= read -r exported_key; do
    case "$exported_key" in
      DATABASE_URL|*_DATABASE_URL|JWT_SECRET|*_JWT_SECRET|*PASSWORD|*TOKEN|*SECRET|*HMAC_KEY|*ENCRYPTION_KEY|*_API_KEY|*_API_ID|*_SMTP_USERNAME)
        die "Web runtime inherited an API/provider credential: ${exported_key}"
        ;;
    esac
  done < <(compgen -e)
fi

if [[ "$api_runtime" == true ]]; then
  [[ "${LANGAME_DISCREPANCY_LOG_ROOT:-}" == '/var/lib/leetplus/langame-sync' ]] \
    || die 'API persistent Langame state path is not the reviewed absolute path'
  [[ -d "$LANGAME_DISCREPANCY_LOG_ROOT" && -w "$LANGAME_DISCREPANCY_LOG_ROOT" ]] \
    || die 'API service identity cannot write persistent Langame state'
  [[ "${LOGS_DIRECTORY:-}" == "/var/log/leetplus/api-${slot}" \
    && -d "$LOGS_DIRECTORY" && -w "$LOGS_DIRECTORY" ]] \
    || die 'API service identity cannot write its exact per-slot log directory'
fi

# These values are checked from the final process environment, after all
# systemd EnvironmentFile layers. This proves that an installed/stale file or
# earlier runtime.env value cannot silently enable effects in the shadow unit.
while IFS='=' read -r safe_key safe_expected; do
  if [[ "$safe_key" == '# BEGIN CANARY_SAFE_REQUIRED_SETTINGS' || "$safe_key" == '# END CANARY_SAFE_REQUIRED_SETTINGS' ]]; then
    continue
  fi
  if [[ "$api_runtime" == true ]]; then
    case "$safe_key" in
      GUEST_PORTAL_USER_CALL_ENABLED|GUEST_PORTAL_USER_CALL_SMS_RU_BASE_URL)
        continue
        ;;
    esac
  fi
  [[ -v "$safe_key" ]] || die "shadow safety setting is absent or unsafe: ${safe_key}"
  safe_actual="${!safe_key}"
  [[ "$safe_actual" == "$safe_expected" ]] || die "shadow safety setting is absent or unsafe: ${safe_key}"
done <<'CANARY_SAFE_REQUIRED_SETTINGS'
# BEGIN CANARY_SAFE_REQUIRED_SETTINGS
FOUNDER_OPERATOR_BETA_MODE=DISABLED
DESIGN_PARTNER_ISOLATED_MODE=false
DEMO_SEED_ENABLED=false
ACCESS_SCOPE_ENFORCEMENT_MODE=ENFORCED
STAFF_ATTACHMENT_ACL_MODE=ENFORCED
NEXT_TELEMETRY_DISABLED=1
MAIL_HOST=127.0.0.1
MAIL_PORT=1
MAIL_SECURE=false
MAIL_USER=disabled
MAIL_PASS=disabled
GUEST_GAME_BOT_CONSUMER_MAX_DELIVERY_ENDPOINT=http://127.0.0.1:1
GUEST_GAME_MAX_DELIVERY_ENDPOINT=http://127.0.0.1:1
GUEST_PORTAL_INCOMING_CALL_LAST4_ENDPOINT=http://127.0.0.1:1
GUEST_PORTAL_OTP_SMS_ENDPOINT=http://127.0.0.1:1
GUEST_PORTAL_OTP_SMS_RU_BASE_URL=http://127.0.0.1:1
GUEST_PORTAL_USER_CALL_SMS_RU_BASE_URL=http://127.0.0.1:1
GUEST_GAME_PIPELINE_SCHEDULER_ENABLED=false
GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED=false
GUEST_GAME_RETENTION_SCHEDULER_ENABLED=false
LANGAME_DAILY_SYNC_SCHEDULER_ENABLED=false
GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED=false
REPORT_DIGEST_SCHEDULER_ENABLED=false
STAFF_TASK_RULES_SCHEDULER_ENABLED=false
STAFF_TASK_RULES_SCHEDULED_HTTP_ENABLED=false
LANGAME_SCHEDULED_HTTP_ENABLED=false
GUEST_GAME_SCHEDULED_HTTP_ENABLED=false
REPORT_DIGEST_SCHEDULED_HTTP_ENABLED=false
GUEST_GAME_LEDGER_FALLBACK_MODE=OFF
GUEST_GAME_LOOT_BOX_RECOVERY_MODE=OFF
GUEST_GAME_PIPELINE_BACKFILL_MODE=OFF
GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE=OFF
GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH=true
GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH=true
GUEST_GAME_PIPELINE_BACKFILL_KILL_SWITCH=true
GUEST_GAME_SUPPLEMENTAL_PIPELINE_KILL_SWITCH=true
GUEST_GAME_REWARD_MATERIALIZER_ENABLED=false
GUEST_GAME_REWARD_MATERIALIZER_KILL_SWITCH=true
GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN=true
LANGAME_BONUS_ACCRUAL_ENABLED=false
GUEST_GAME_STAFF_TEST_REWARD_ACCRUAL_ENABLED=false
GUEST_GAME_DELIVERY_REAL_SEND_ENABLED=false
GUEST_GAME_DELIVERY_TELEGRAM_ENABLED=false
GUEST_GAME_TELEGRAM_DELIVERY_ENABLED=false
GUEST_GAME_MAX_DELIVERY_ENABLED=false
GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED=false
GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED=false
GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_TIMEOUT_MS=15000
GUEST_GAME_BOT_CONSUMER_DRY_RUN=true
GUEST_GAME_TG_EDGE_DRY_RUN=true
GUEST_GAME_BOT_CONSUMER_ENABLED=false
GUEST_GAME_TG_EDGE_ADAPTER_ENABLED=false
GUEST_GAME_TG_EDGE_POLLER_ENABLED=false
GUEST_GAME_TG_EDGE_POLLING_DELETE_WEBHOOK_ON_START=false
GUEST_PORTAL_USER_CALL_ENABLED=false
GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED=false
GUEST_PORTAL_DEV_OTP_ENABLED=false
GUEST_PORTAL_OTP_REAL_SEND_ENABLED=false
GUEST_PORTAL_OTP_SMS_ENABLED=false
GUEST_PORTAL_OTP_SMS_RU_TEST_MODE=true
GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED=false
GUEST_PORTAL_OTP_TELEGRAM_ENABLED=false
GUEST_PORTAL_OTP_MAX_ENABLED=false
GUEST_GAME_RETENTION_LIVE_ENABLED=false
GUEST_GAME_MONITORING_ENABLED=false
IDENTITY_MAIL_WORKER_ENABLED=false
IDENTITY_MAIL_WORKER_REAL_SEND_ENABLED=false
IDENTITY_MAIL_WORKER_LIVE_CANARY_ENABLED=false
IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_ENABLED=false
IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_REAL_PROVIDER_ENABLED=false
IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_REHEARSAL_ENABLED=false
TENANT_ACTIVATION_OUTBOUND_ENABLED=false
LANGAME_STAGED_ONBOARDING_FOUNDATION_ENABLED=false
LANGAME_STAGED_ONBOARDING_STATUS_CURRENT188_ENABLED=false
LANGAME_STAGED_ONBOARDING_ACTIVATION_CURRENT188_ENABLED=false
LANGAME_STAGED_ONBOARDING_RECONCILE_CURRENT188_ENABLED=false
LANGAME_INITIAL_SYNC_PREFLIGHT_CURRENT188_ENABLED=false
LANGAME_INITIAL_SYNC_EXECUTION_CURRENT192_ENABLED=false
# END CANARY_SAFE_REQUIRED_SETTINGS
CANARY_SAFE_REQUIRED_SETTINGS

if [[ "$api_runtime" == true ]]; then
  [[ "${GUEST_PORTAL_USER_CALL_ENABLED:-}" == 'true' \
    && "${GUEST_PORTAL_USER_CALL_PROVIDER:-}" == 'SMS_RU_CALLCHECK' \
    && "${GUEST_PORTAL_USER_CALL_SMS_RU_BASE_URL:-}" == 'https://sms.ru' \
    && "${GUEST_PORTAL_USER_CALL_PROVIDER_TIMEOUT_MS:-}" == '8000' \
    && -n "${GUEST_PORTAL_USER_CALL_SMS_RU_API_ID:-}" ]] \
    || die 'reviewed public guest USER_CALL activation profile is absent or unsafe'
else
  [[ "${GUEST_PORTAL_USER_CALL_ENABLED:-}" == 'false' \
    && "${GUEST_PORTAL_USER_CALL_SMS_RU_BASE_URL:-}" == 'http://127.0.0.1:1' ]] \
    || die 'Web runtime inherited the public guest USER_CALL provider profile'
fi

# Every direct provider/SMTP fallback is pinned to loopback port 1. Prove from
# the unit cgroup that this sink is actually unbound; otherwise a local relay
# could turn an apparently inert endpoint into outbound delivery under another
# process identity. Tests may point only this probe at a disposable listener.
node --input-type=module - "$inert_sink_port" <<'INERT_LOOPBACK_SINK_TEST' \
  || die 'pinned inert loopback sink is listening or cannot be proven closed'
import { Socket } from "node:net";
const port = Number(process.argv[2]);
const refused = await new Promise((resolve) => {
  const socket = new Socket();
  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    resolve(value);
  };
  socket.setTimeout(1000, () => finish(false));
  socket.once("connect", () => finish(false));
  socket.once("error", (error) => finish(error?.code === "ECONNREFUSED"));
  socket.connect({ family: 4, host: "127.0.0.1", port });
});
if (!refused) process.exit(63);
INERT_LOOPBACK_SINK_TEST
printf 'RELEASE_SLOT_INERT_LOOPBACK_SINK_UNBOUND=true\n'

[[ -d "$slot_root" && ! -L "$slot_root" ]] || die 'slot root must be a real directory'
[[ -d "$release_root" && ! -L "$release_root" && "$release_root" != '/' ]] || die 'release root must be a real non-root directory'
slot_root="$(realpath -e -- "$slot_root")"
release_root="$(realpath -e -- "$release_root")"

if [[ "$unprivileged_test_mode" == false ]]; then
  [[ -d /srv/leetplus && ! -L /srv/leetplus ]] || die 'production /srv/leetplus ancestor is absent or is a symlink'
  for trusted_directory in /srv /srv/leetplus "$slot_root" "$release_root"; do
    [[ "$(stat -c '%U' -- "$trusted_directory")" == 'root' ]] \
      || die "release/slot ancestor is not root-owned: ${trusted_directory}"
    [[ -z "$(find -P "$trusted_directory" -maxdepth 0 -perm /022 -print -quit)" ]] \
      || die "release/slot ancestor is group/other-writable: ${trusted_directory}"
  done
fi

slot_path="${slot_root}/${slot}"
[[ -L "$slot_path" ]] || die 'slot path must be a symlink'
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ -z "$(find -P "$slot_path" -maxdepth 0 ! -user root -print -quit)" ]] \
    || die 'slot symlink must be root-owned'
fi
release_directory="$(realpath -e -- "$slot_path")"
expected_release_directory="${release_root}/${release_sha}"
[[ "$release_directory" == "$expected_release_directory" ]] || die 'slot target is not the exact expected release directory'
[[ -d "$release_directory" && ! -L "$release_directory" ]] || die 'release target must be a real directory'
runtime_cache_mount="${release_directory}/apps/web/.next/cache"
[[ -d "$runtime_cache_mount" && ! -L "$runtime_cache_mount" ]] || die 'Web runtime cache mountpoint is absent or unsafe'
cache_release_marker="${cache_marker_root}/${slot}.sha"
if [[ "$require_web_cache_bind" == true ]]; then
  [[ -d "$cache_marker_root" && ! -L "$cache_marker_root" ]] \
    || die 'Web cache marker root is absent or unsafe'
  [[ -f "$cache_release_marker" && ! -L "$cache_release_marker" && -r "$cache_release_marker" ]] \
    || die 'Web runtime cache has no readable release marker'
  if [[ "$unprivileged_test_mode" == false ]]; then
    [[ "$(stat -c '%U' -- "$cache_marker_root")" == 'root' \
      && "$(stat -c '%U' -- "$cache_release_marker")" == 'root' ]] \
      || die 'Web cache marker authority must be root-owned'
    [[ -z "$(find -P "$cache_marker_root" -maxdepth 0 -perm /022 -print -quit)" ]] \
      || die 'Web cache marker root is group/other-writable'
    [[ "$(stat -c '%a' -- "$cache_release_marker")" == '440' \
      && "$(stat -c '%h' -- "$cache_release_marker")" == '1' ]] \
      || die 'Web cache marker must be mode 0440 with one link'
  fi
  cache_release_sha="$(tr -d '\r\n' < "$cache_release_marker")"
  [[ "$cache_release_sha" == "$release_sha" ]] \
    || die 'Web runtime cache belongs to a different release SHA'
fi
if [[ "$unprivileged_test_mode" == false ]]; then
  command -v mountpoint >/dev/null 2>&1 || die 'required command is unavailable: mountpoint'
  if [[ "$require_web_cache_bind" == true ]]; then
    mountpoint -q -- "$runtime_cache_mount" || die 'Web runtime cache is not a dedicated bind mount'
    [[ -w "$runtime_cache_mount" ]] || die 'Web runtime cache bind is not service-writable'
  else
    ! mountpoint -q -- "$runtime_cache_mount" || die 'API slot unexpectedly sees the Web cache bind'
    [[ ! -w "$runtime_cache_mount" ]] || die 'unmounted Web cache placeholder must not be service-writable'
  fi
fi

if [[ "$unprivileged_test_mode" == true ]]; then
  :
else
  owner_name="$(stat -c '%U' -- "$release_directory")"
  [[ "$owner_name" == 'root' ]] || die 'release directory must be owned by root'

  unexpected_owner="$(find -P "$release_directory" -xdev \
    -path "$runtime_cache_mount" -prune -o \
    \( -type d -o -type f -o -type l \) ! -user root -print -quit)"
  [[ -z "$unexpected_owner" ]] || die 'release tree contains an entry not owned by root'
fi

writable_entry="$(find -P "$release_directory" -xdev \
  -path "$runtime_cache_mount" -prune -o \
  \( -type d -o -type f \) -perm /022 -print -quit)"
[[ -z "$writable_entry" ]] || die 'release tree contains a group/other-writable file or directory'

special_entry="$(find -P "$release_directory" -xdev \
  -path "$runtime_cache_mount" -prune -o \
  ! -type d ! -type f ! -type l -print -quit)"
[[ -z "$special_entry" ]] || die 'release tree contains a special filesystem entry'

shared_inode="$(find -P "$release_directory" -xdev \
  -path "$runtime_cache_mount" -prune -o \
  -type f -links +1 -print -quit)"
[[ -z "$shared_inode" ]] || die 'release tree contains a multiply-linked regular file'

while IFS= read -r -d '' link_path; do
  link_target="$(realpath -e -- "$link_path")" || die 'release tree contains a dangling symlink'
  case "$link_target" in
    "$release_directory"|"$release_directory"/*) ;;
    *) die 'release tree contains a symlink escaping the immutable release' ;;
  esac
done < <(find -P "$release_directory" -xdev \
  -path "$runtime_cache_mount" -prune -o -type l -print0)

node - "$release_directory" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const [root] = process.argv.slice(2);
const mutableCache = 'apps/web/.next/cache';
const manifestPath = path.join(root, 'HYDRATED_SYMLINKS.json');
const compareUtf8 = (left, right) =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

function fail(message) {
  throw new Error(message);
}

function assertCanonicalPath(relativePath) {
  const components = relativePath.split('/');
  if (
    components.length === 0 ||
    components.some((component) =>
      component.length === 0 ||
      component === '.' ||
      component === '..' ||
      component !== component.normalize('NFC') ||
      /[\\\u0000-\u001f\u007f]/u.test(component)
    )
  ) fail(`hydrated symlink path is not canonical: ${relativePath}`);
}

function collect(directory, relativeDirectory = '', links = []) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareUtf8(left.name, right.name));
  for (const entry of entries) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    assertCanonicalPath(relativePath);
    const absolutePath = path.join(root, ...relativePath.split('/'));
    const stat = fs.lstatSync(absolutePath);
    if (stat.isDirectory()) {
      if (relativePath !== mutableCache) collect(absolutePath, relativePath, links);
      continue;
    }
    if (!stat.isSymbolicLink()) continue;
    const target = fs.readlinkSync(absolutePath, 'utf8');
    if (
      target.length === 0 ||
      target !== target.normalize('NFC') ||
      path.posix.isAbsolute(target) ||
      path.posix.normalize(target) !== target ||
      /[\\\u0000-\u001f\u007f]/u.test(target)
    ) fail(`hydrated symlink target is not canonical: ${relativePath}`);
    const resolved = fs.realpathSync.native(absolutePath);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      fail(`hydrated symlink escapes the release: ${relativePath}`);
    }
    links.push({ path: relativePath, target });
  }
  return links;
}

const manifestStat = fs.lstatSync(manifestPath);
if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > 8 * 1024 * 1024) {
  fail('hydrated symlink manifest is absent or unsafe');
}
const text = fs.readFileSync(manifestPath, 'utf8');
const links = collect(root)
  .sort((left, right) => compareUtf8(left.path, right.path) || compareUtf8(left.target, right.target));
const canonical = `${JSON.stringify({ links, version: 1 })}\n`;
if (text !== canonical) fail('hydrated symlink manifest differs from the exact release topology');
NODE

required_files=(
  'release-provenance.json'
  'HYDRATED_SHA256SUMS'
  'HYDRATED_SYMLINKS.json'
  'apps/api/dist/main.js'
  'apps/api/dist/config/validate-production-environment.cli.js'
  'apps/web/.next/BUILD_ID'
  'apps/web/.next/static'
  'apps/web/.next/cache'
)
for relative_path in "${required_files[@]}"; do
  [[ -r "${release_directory}/${relative_path}" ]] || die "required release path is not service-readable: ${relative_path}"
done
[[ -x "${release_directory}/apps/api/dist" ]] || die 'API dist directory is not service-searchable'
[[ -x "${release_directory}/apps/web/.next" ]] || die 'Web build directory is not service-searchable'

actual_build_id="$(tr -d '\r\n' < "${release_directory}/apps/web/.next/BUILD_ID")"
[[ "$actual_build_id" == "$web_build_id" ]] || die 'Web BUILD_ID does not match release identity'

node - \
  "$release_directory/release-provenance.json" \
  "$release_sha" \
  "$EXPECTED_DATABASE_MIGRATION" \
  "$EXPECTED_DATABASE_MIGRATION_COUNT" <<'NODE'
const fs = require('node:fs');
const [filePath, expectedSha, expectedMigration, expectedMigrationCount] = process.argv.slice(2);
const provenance = JSON.parse(fs.readFileSync(filePath, 'utf8'));
if (
  provenance.releaseSha !== expectedSha ||
  provenance.databaseMigration !== expectedMigration ||
  provenance.databaseMigrationCount !== Number(expectedMigrationCount)
) {
  throw new Error('release provenance identity/migration mismatch');
}
NODE

(
  cd -- "$release_directory"
  sha256sum --strict --check --quiet HYDRATED_SHA256SUMS
) || die 'post-hydration runtime manifest verification failed'

printf 'RELEASE_SLOT_PREFLIGHT_ACCEPTED_SLOT=%s\n' "$slot"
printf 'RELEASE_SLOT_PREFLIGHT_ACCEPTED_SHA=%s\n' "$release_sha"
printf 'RELEASE_SLOT_PREFLIGHT_ACCEPTED_WEB_BUILD_ID=%s\n' "$web_build_id"
printf 'RELEASE_SLOT_PREFLIGHT_ACCEPTED_MIGRATION=%s\n' "$EXPECTED_DATABASE_MIGRATION"
printf 'RELEASE_SLOT_PREFLIGHT_ACCEPTED_MIGRATION_COUNT=%s\n' "$EXPECTED_DATABASE_MIGRATION_COUNT"
printf 'RELEASE_SLOT_PREFLIGHT_WEB_RUNTIME=%s\n' "$web_runtime"
printf 'RELEASE_SLOT_PREFLIGHT_API_RUNTIME=%s\n' "$api_runtime"
printf 'RELEASE_SLOT_PREFLIGHT_EFFECTIVE_USER=%s\n' "$(id -un)"
