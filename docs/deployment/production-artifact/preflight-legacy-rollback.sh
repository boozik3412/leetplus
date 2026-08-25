#!/usr/bin/bash -p
# Fail-closed preflight for the only admitted first-cutover N-1 release.

[[ $- == *p* ]] || { printf 'preflight-legacy-rollback: privileged Bash mode is required\n' >&2; exit 1; }
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

readonly LEGACY_SHA='7de04ff4ccc814494810730be3fa6bf661097b07'
readonly LEGACY_DATABASE_SESSION_ROLE='leetplus_legacy_rollback'
readonly LEGACY_DATABASE_APPLICATION_NAME='leetplus-nminus1-http-7de04ff4'
readonly LEGACY_SAFE_ENVIRONMENT_SHA256='b12c41795c0c798498dbfd20f338edfdc75f80decb9bf91d7c5d928a40e03808'
readonly LEGACY_AUTH_EDGE_SHA256='e533a946eb7d4393b7f1f692da2f57f4d8bf86180658ff82d677084fc683b50a'
readonly LEGACY_CHILD_PRELOAD_SHA256='ea25c3cf121ff21f21c02b5bf017ac6b20e943918b6624210d593e800493127c'

die() {
  printf 'preflight-legacy-rollback: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage: preflight-legacy-rollback.sh --release-sha <exact-sha> \
  (--api-runtime|--web-runtime)

Tests may additionally pass --release-root, --safe-environment and
--unprivileged-test-mode while running as a non-root user.
USAGE
}

release_sha=''
release_root='/srv/leetplus/rollback-releases'
safe_environment='/etc/leetplus/rollback-safe.env'
auth_edge='/usr/local/libexec/leetplus/legacy-rollback-auth-edge.mjs'
child_preload='/usr/local/libexec/leetplus/legacy-rollback-child-loopback.cjs'
runtime_kind=''
unprivileged_test_mode=false

while (($# > 0)); do
  case "$1" in
    --release-sha) release_sha="${2:-}"; shift 2 ;;
    --release-root) release_root="${2:-}"; shift 2 ;;
    --safe-environment) safe_environment="${2:-}"; shift 2 ;;
    --api-runtime) runtime_kind='api'; shift ;;
    --web-runtime) runtime_kind='web'; shift ;;
    --unprivileged-test-mode) unprivileged_test_mode=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ "$release_sha" == "$LEGACY_SHA" ]] || die 'only exact 7de04ff4 rollback source is admitted'
[[ "$runtime_kind" == 'api' || "$runtime_kind" == 'web' ]] || die 'exactly one runtime kind is required'
if [[ "$unprivileged_test_mode" == true ]]; then
  ((EUID != 0)) || die 'unprivileged test mode is forbidden for root'
  PATH="$LEETPLUS_BOOTSTRAP_TEST_PATH"
  export PATH
  auth_edge="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/legacy-rollback-auth-edge.mjs"
  child_preload="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/legacy-rollback-child-loopback.cjs"
else
  expected_identity='leetplus-api-nminus1'
  [[ "$runtime_kind" == 'web' ]] && expected_identity='leetplus-web-nminus1'
  [[ "$(id -un)" == "$expected_identity" ]] \
    || die "production preflight must run as the isolated ${runtime_kind} service identity"
  [[ "$release_root" == '/srv/leetplus/rollback-releases' ]] || die 'production release root cannot be overridden'
  [[ "$safe_environment" == '/etc/leetplus/rollback-safe.env' ]] || die 'production safety overlay cannot be overridden'
fi
unset LEETPLUS_BOOTSTRAP_TEST_PATH
[[ -z "$LEETPLUS_BOOTSTRAP_UNSAFE_ENV_KEYS" ]] \
  || die "rollback unit inherited forbidden injection environment:${LEETPLUS_BOOTSTRAP_UNSAFE_ENV_KEYS}"
unset LEETPLUS_BOOTSTRAP_UNSAFE_ENV_KEYS

for command_name in awk diff find grep id node realpath sha256sum sort stat tr; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done
if [[ "$unprivileged_test_mode" == false ]]; then
  for command_name in findmnt mountpoint; do
    command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
  done
fi

[[ -d "$release_root" && ! -L "$release_root" ]] || die 'rollback release root must be a real directory'
release_root="$(realpath -e -- "$release_root")"
release_directory="${release_root}/${release_sha}"
[[ -d "$release_directory" && ! -L "$release_directory" ]] || die 'exact rollback release is absent or symlinked'
[[ "$(realpath -e -- "$release_directory")" == "$release_directory" ]] || die 'rollback release path is not canonical'
[[ -f "$safe_environment" && ! -L "$safe_environment" ]] || die 'final safety overlay is absent or symlinked'
[[ "$(sha256sum "$safe_environment" | awk '{ print $1 }')" == "$LEGACY_SAFE_ENVIRONMENT_SHA256" ]] \
  || die 'final safety overlay does not match the exact complete deny schema'
if [[ "$runtime_kind" == 'api' ]]; then
  [[ -f "$auth_edge" && ! -L "$auth_edge" \
    && "$(sha256sum "$auth_edge" | awk '{ print $1 }')" == "$LEGACY_AUTH_EDGE_SHA256" ]] \
    || die 'rollback auth edge byte/type/mode identity is not exact'
  [[ -f "$child_preload" && ! -L "$child_preload" \
    && "$(sha256sum "$child_preload" | awk '{ print $1 }')" == "$LEGACY_CHILD_PRELOAD_SHA256" ]] \
    || die 'rollback legacy child loopback preload byte/type identity is not exact'
  if [[ "$unprivileged_test_mode" == false ]]; then
    [[ "$(stat -c '%U:%G:%a:%h' -- "$auth_edge")" == 'root:root:755:1' ]] \
      || die 'rollback auth edge must be root:root'
    [[ "$(stat -c '%U:%G:%a:%h' -- "$child_preload")" == 'root:root:444:1' ]] \
      || die 'rollback legacy child loopback preload must be root:root mode 0444'
  fi
fi

source_marker="${release_directory}/.leetplus-source-sha"
integrity_manifest="${release_directory}/N_MINUS_ONE_SHA256SUMS"
symlink_manifest="${release_directory}/N_MINUS_ONE_SYMLINKS"
runtime_cache="${release_directory}/apps/web/.next/cache"
[[ -f "$source_marker" && ! -L "$source_marker" ]] || die 'rollback source marker is absent'
[[ "$(tr -d '\r\n' < "$source_marker")" == "$LEGACY_SHA" ]] || die 'rollback source marker is not exact 7de04ff4'
[[ -f "$integrity_manifest" && ! -L "$integrity_manifest" ]] || die 'rollback integrity manifest is absent'
[[ -s "$integrity_manifest" ]] || die 'rollback integrity manifest is empty'
[[ -f "$symlink_manifest" && ! -L "$symlink_manifest" ]] || die 'rollback symlink topology manifest is absent'
[[ -d "$runtime_cache" && ! -L "$runtime_cache" ]] || die 'rollback Web cache bind target is absent or symlinked'

if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$(stat -c '%U:%G' -- "$release_root" "$release_directory" "$source_marker" "$integrity_manifest" | sort -u)" == 'root:leetplus-runtime' ]] \
    || die 'rollback release boundary must be root:leetplus-runtime'
  [[ -z "$(find -P "$release_directory" -xdev -path "$runtime_cache" -prune -o \
    \( ! -user root -o ! -group leetplus-runtime \) -print -quit)" ]] \
    || die 'rollback release contains an entry outside root:leetplus-runtime ownership'
  [[ -z "$(find -P "$release_directory" -xdev -path "$runtime_cache" -prune -o \( ! -type l -perm /022 \) -print -quit)" ]] \
    || die 'rollback release contains group/other-writable content'
  [[ -z "$(find -P "$release_directory" -xdev -path "$runtime_cache" -prune -o ! -readable -print -quit)" ]] \
    || die 'rollback release contains content unreadable by the service identity'
  [[ "$(stat -c '%U:%G:%a' -- "$safe_environment")" == 'root:leetplus-runtime:440' ]] \
    || die 'final safety overlay must be root:leetplus-runtime mode 0440'
  [[ -r "$safe_environment" ]] || die 'final safety overlay is unreadable by the service identity'

  nested_mount_count=0
  mount_inventory="$(findmnt --raw --noheadings --output TARGET)" \
    || die 'rollback release mount inventory failed or returned partial output'
  while IFS= read -r mount_target; do
    case "$mount_target" in
      "$release_directory"|"$release_directory"/*)
        if [[ "$runtime_kind" == 'web' && "$mount_target" == "$runtime_cache" ]]; then
          nested_mount_count=$((nested_mount_count + 1))
        else
          die "rollback release contains an unreviewed nested mount: ${mount_target}"
        fi
        ;;
    esac
  done <<< "$mount_inventory"

  if [[ "$runtime_kind" == 'web' ]]; then
    ((nested_mount_count == 1)) || die 'Web preflight requires exactly one private cache bind mount'
    mountpoint -q "$runtime_cache" || die 'Web cache target is not a mountpoint'
    [[ "$(stat -c '%U:%G:%a' -- "$runtime_cache")" == 'leetplus-web-nminus1:leetplus-runtime:750' ]] \
      || die 'Web cache bind must be leetplus-web-nminus1:leetplus-runtime mode 0750'
  else
    ((nested_mount_count == 0)) || die 'API preflight must not see a nested release mount'
    mountpoint -q "$runtime_cache" && die 'API preflight must not see the Web cache bind'
    [[ "$(stat -c '%U:%G:%a' -- "$runtime_cache")" == 'root:leetplus-runtime:550' ]] \
      || die 'immutable Web cache bind target must be root:leetplus-runtime mode 0550 outside Web namespace'
    [[ -z "$(find -P "$runtime_cache" -mindepth 1 -print -quit)" ]] \
      || die 'immutable Web cache bind target must be empty outside Web namespace'
  fi
fi

[[ -z "$(find -P "$release_directory" -xdev -path "$runtime_cache" -prune -o ! -type d ! -type f ! -type l -print -quit)" ]] \
  || die 'rollback release contains a special filesystem entry'
[[ -z "$(find -P "$release_directory" -xdev -path "$runtime_cache" -prune -o -type f -links +1 -print -quit)" ]] \
  || die 'rollback release contains a multiply-linked regular file'
actual_symlinks_unsorted="$(cd -- "$release_directory" \
  && find -P . -xdev -path './apps/web/.next/cache' -prune -o -type l -printf '%P|%l\n')" \
  || die 'rollback symlink inventory failed or returned partial output'
if ! awk -F'|' 'NF == 0 { next } NF != 2 || $1 !~ /^[A-Za-z0-9_.@+\/-]+$/ || $1 ~ /^\// || $2 !~ /^[^|[:space:]]+$/ { exit 1 }' \
  <<< "$actual_symlinks_unsorted"; then
  die 'rollback release contains an unsafe symlink path or target'
fi
while IFS='|' read -r relative_link _; do
  [[ -n "$relative_link" ]] || continue
  link_path="${release_directory}/${relative_link}"
  link_target="$(realpath -e -- "$link_path")" || die 'rollback release contains a dangling symlink'
  case "$link_target" in
    "$runtime_cache"|"$runtime_cache"/*) die 'rollback release contains a symlink into mutable Web cache' ;;
    "$release_directory"/*) ;;
    *) die 'rollback release contains a symlink escaping the exact release' ;;
  esac
done <<< "$actual_symlinks_unsorted"
if ! awk -F'|' 'NF != 2 || $1 !~ /^[A-Za-z0-9_.@+\/-]+$/ || $1 ~ /^\// || $2 !~ /^[^|[:space:]]+$/ { exit 1 }' \
  "$symlink_manifest"; then
  die 'rollback symlink topology manifest is malformed'
fi
expected_symlinks="$(LC_ALL=C sort "$symlink_manifest")"
actual_symlinks="$(LC_ALL=C sort <<< "$actual_symlinks_unsorted")" \
  || die 'rollback symlink inventory sort failed'
[[ "$expected_symlinks" == "$actual_symlinks" ]] || die 'rollback symlink topology does not match the exact artifact'

if awk '
  {
    path = $2
    sub(/^\*/, "", path)
    relative = path
    sub(/^\.\//, "", relative)
  }
  NF != 2 || length($1) != 64 || $1 !~ /^[0-9a-f]+$/ || path !~ /^\.\/[A-Za-z0-9_.@+\/-]+$/ || relative ~ /(^|\/)\.\.?(\/|$)/ { exit 1 }
' "$integrity_manifest"; then
  :
else
  die 'rollback integrity manifest contains an unsafe or malformed entry'
fi
if grep -F ' ./N_MINUS_ONE_SHA256SUMS' "$integrity_manifest" >/dev/null; then
  die 'rollback integrity manifest must not hash itself'
fi
if awk '{ path = $2; sub(/^\*/, "", path); if (path == "./apps/web/.next/cache" || index(path, "./apps/web/.next/cache/") == 1) exit 1 }' "$integrity_manifest"; then
  :
else
  die 'rollback integrity manifest must exclude the mutable Web cache bind'
fi
(
  cd -- "$release_directory"
  sha256sum --check --strict --quiet N_MINUS_ONE_SHA256SUMS
) || die 'rollback release content does not match its integrity manifest'

manifest_paths="$(awk '{ path = $2; sub(/^\*/, "", path); print path }' "$integrity_manifest" | LC_ALL=C sort)"
actual_paths="$(
  cd -- "$release_directory"
  find . -xdev -path './apps/web/.next/cache' -prune -o -type f ! -path './N_MINUS_ONE_SHA256SUMS' -print | LC_ALL=C sort
)"
[[ "$manifest_paths" == "$actual_paths" ]] || die 'rollback integrity manifest does not cover the exact regular-file set'

for required_file in \
  apps/api/dist/main.js \
  apps/web/node_modules/next/dist/bin/next \
  apps/web/.next/BUILD_ID; do
  [[ -f "${release_directory}/${required_file}" ]] || die "rollback artifact is missing ${required_file}"
done

# Compare every installed final-overlay assignment with the process environment
# seen by ExecStartPre. Later EnvironmentFile ordering therefore cannot silently
# re-enable an effect after this check.
declare -A seen_safe_keys=()
while IFS='=' read -r safe_key safe_value; do
  [[ -z "$safe_key" || "$safe_key" == \#* ]] && continue
  [[ "$safe_key" =~ ^[A-Z][A-Z0-9_]*$ && "$safe_value" =~ ^[^[:space:]]+$ ]] \
    || die 'final safety overlay contains an unsafe assignment'
  [[ -z "${seen_safe_keys[$safe_key]:-}" ]] || die "duplicate final safety key: ${safe_key}"
  seen_safe_keys[$safe_key]=1
  [[ "${!safe_key-}" == "$safe_value" ]] || die "final safety value is not effective: ${safe_key}"
done < "$safe_environment"

for required_safe_key in \
  GUEST_GAME_PIPELINE_SCHEDULER_ENABLED \
  GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED \
  GUEST_GAME_RETENTION_SCHEDULER_ENABLED \
  LANGAME_DAILY_SYNC_SCHEDULER_ENABLED \
  GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED \
  REPORT_DIGEST_SCHEDULER_ENABLED \
  STAFF_TASK_RULES_SCHEDULER_ENABLED \
  GUEST_GAME_DELIVERY_REAL_SEND_ENABLED \
  IDENTITY_MAIL_WORKER_ENABLED \
  IDENTITY_MAIL_WORKER_REAL_SEND_ENABLED \
  TENANT_ACTIVATION_OUTBOUND_ENABLED; do
  [[ "${seen_safe_keys[$required_safe_key]:-}" == 1 ]] || die "critical safety key is absent: ${required_safe_key}"
done

for forbidden_environment in \
  HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY \
  http_proxy https_proxy all_proxy no_proxy \
  NODE_USE_ENV_PROXY NODE_OPTIONS NODE_PATH NODE_EXTRA_CA_CERTS NODE_DEBUG \
  NODE_V8_COVERAGE NODE_COMPILE_CACHE SSLKEYLOGFILE LD_PRELOAD LD_LIBRARY_PATH \
  LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES GLIBC_TUNABLES \
  MALLOC_CHECK_ MALLOC_PERTURB_ BASH_ENV ENV CURL_HOME CURL_CA_BUNDLE \
  SSL_CERT_FILE SSL_CERT_DIR PRISMA_QUERY_ENGINE_BINARY PRISMA_QUERY_ENGINE_LIBRARY \
  PRISMA_SCHEMA_ENGINE_BINARY PRISMA_FMT_BINARY TMPDIR TMP TEMP XDG_CONFIG_HOME \
  XDG_CACHE_HOME XDG_DATA_HOME NPM_CONFIG_USERCONFIG npm_config_userconfig PNPM_HOME \
  COREPACK_HOME COREPACK_NPM_REGISTRY COREPACK_INTEGRITY_KEYS GIT_CONFIG_GLOBAL \
  GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM; do
  [[ -z "${!forbidden_environment:-}" ]] \
    || die "proxy/code-injection environment must be unset: ${forbidden_environment}"
done

[[ "${MAIL_HOST:-}" == '127.0.0.1' && "${MAIL_PORT:-}" == '1' \
  && "${MAIL_SECURE:-}" == 'false' && "${MAIL_USER:-}" == 'disabled' \
  && "${MAIL_PASS:-}" == 'disabled' ]] \
  || die 'exact inert SMTP transport is not effective'
for inert_endpoint_key in \
  GUEST_GAME_BOT_CONSUMER_MAX_DELIVERY_ENDPOINT \
  GUEST_GAME_MAX_DELIVERY_ENDPOINT \
  GUEST_PORTAL_INCOMING_CALL_LAST4_ENDPOINT \
  GUEST_PORTAL_OTP_SMS_ENDPOINT \
  GUEST_PORTAL_OTP_SMS_RU_BASE_URL \
  GUEST_PORTAL_USER_CALL_SMS_RU_BASE_URL; do
  [[ "${!inert_endpoint_key:-}" == 'http://127.0.0.1:1' ]] \
    || die "provider endpoint is not pinned to the inert sink: ${inert_endpoint_key}"
done

[[ "${RELEASE_SHA:-}" == "$LEGACY_SHA" ]] || die 'effective RELEASE_SHA is not exact legacy SHA'
[[ "${NODE_ENV:-}" == 'production' ]] || die 'NODE_ENV must be production'
[[ "${API_BIND_HOST:-}" == '127.0.0.1' ]] || die 'API bind host must be loopback'
[[ "${PORT:-}" == '4300' ]] || die 'rollback API port must be 4300'
[[ "${WEB_PORT:-}" == '3300' ]] || die 'rollback Web port must be 3300'
[[ "${API_URL:-}" == 'http://127.0.0.1:4300' ]] || die 'rollback Web API origin must be the paired loopback API'

if [[ "$runtime_kind" == 'api' ]]; then
  effective_jwt_secret="${JWT_SECRET:-}"
  [[ -n "$effective_jwt_secret" && ${#effective_jwt_secret} -ge 32 && ${#effective_jwt_secret} -le 4096 \
    && "$effective_jwt_secret" != *[[:space:]]* \
    && "$effective_jwt_secret" != 'leetplus-dev-jwt-secret-change-before-production' ]] \
    || die 'rollback API JWT_SECRET is absent, weak or equal to the legacy public fallback'
  unset effective_jwt_secret
  [[ "${LEGACY_ROLLBACK_DATABASE_SESSION_ROLE:-}" == "$LEGACY_DATABASE_SESSION_ROLE" ]] \
    || die 'rollback database session identity is not pinned'
  [[ "${LEGACY_ROLLBACK_DATABASE_APPLICATION_NAME:-}" == "$LEGACY_DATABASE_APPLICATION_NAME" ]] \
    || die 'rollback database application name is not pinned'
  [[ -n "${DATABASE_URL:-}" ]] || die 'rollback API DATABASE_URL is absent'
  node - "$LEGACY_DATABASE_SESSION_ROLE" "$LEGACY_DATABASE_APPLICATION_NAME" <<'NODE' \
    || die 'rollback API DATABASE_URL does not use the isolated loopback/session-role contract'
const [expectedUser, expectedApplicationName] = process.argv.slice(2);
let value;
try {
  value = new URL(process.env.DATABASE_URL);
} catch {
  process.exit(1);
}
const options = value.searchParams.get('options') || '';
const exactParameters = ['application_name', 'options', 'schema'];
const observedParameters = [...value.searchParams.keys()].sort();
if (
  value.protocol !== 'postgresql:' ||
  value.username !== expectedUser ||
  !value.password ||
  value.hostname !== '127.0.0.1' ||
  value.port !== '5432' ||
  value.pathname !== '/leetplus' ||
  value.hash !== '' ||
  JSON.stringify(observedParameters) !== JSON.stringify(exactParameters) ||
  value.searchParams.get('schema') !== 'public' ||
  value.searchParams.get('application_name') !== expectedApplicationName ||
  options !== '-c role=leetplus'
) process.exit(1);
NODE
else
  [[ -z "${DATABASE_URL:-}" ]] || die 'rollback Web runtime must not receive DATABASE_URL'
fi

printf 'LEGACY_ROLLBACK_PREFLIGHT_ACCEPTED_SHA=%s\n' "$LEGACY_SHA"
printf 'LEGACY_ROLLBACK_PREFLIGHT_RUNTIME=%s\n' "$runtime_kind"
