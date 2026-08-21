#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

trap 'status=$?; if [[ "$-" == *e* ]]; then printf "blue/green fixture: line=%s status=%s command=%q\n" "$LINENO" "$status" "$BASH_COMMAND" >&2; exit "$status"; fi' ERR

readonly RELEASE_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly LEGACY_SHA='7de04ff4ccc814494810730be3fa6bf661097b07'
readonly MIGRATION='20260820010000_fixture'
readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly DEPLOY_ROOT="${REPOSITORY_ROOT}/docs/deployment/production-artifact"
readonly CUTOVER="${DEPLOY_ROOT}/blue-green-cutover.sh"
readonly PREFLIGHT="${DEPLOY_ROOT}/preflight-release-slot.sh"
readonly SEALER="${DEPLOY_ROOT}/seal-release-artifact.sh"
readonly CACHE_PREPARER="${DEPLOY_ROOT}/prepare-web-slot-cache.sh"
readonly SAFE_OVERLAY="${DEPLOY_ROOT}/systemd/canary-safe.env.example"
readonly TEST_ROOT="$(mktemp -d)"
sink_server_pid=''
replaced_system_node=false
original_system_node_present=false

cleanup() {
  if [[ -n "$sink_server_pid" ]]; then
    kill "$sink_server_pid" 2>/dev/null || true
    wait "$sink_server_pid" 2>/dev/null || true
  fi
  if [[ "$replaced_system_node" == true ]]; then
    sudo -n rm -f -- /usr/bin/node
    if [[ "$original_system_node_present" == true ]]; then
      sudo -n mv -- "$TEST_ROOT/system-node.original" /usr/bin/node
    fi
  fi
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT

if [[ "$(id -u)" == '0' ]]; then
  printf 'blue/green fixture requires an unprivileged CI account\n' >&2
  exit 1
fi

provision_system_node() {
  local fixture_node_binary
  fixture_node_binary="$(realpath -e -- "$(command -v node)")"
  [[ -f "$fixture_node_binary" && ! -L "$fixture_node_binary" && -x "$fixture_node_binary" \
    && "$($fixture_node_binary -p 'process.versions.node.split(".")[0]')" == '22' ]] || {
    printf 'blue/green fixture requires an exact regular Node 22 binary\n' >&2
    exit 1
  }
  # The sealer deliberately replaces inherited PATH with the reviewed
  # production path. Provision setup-node there only for this disposable test.
  if [[ ! -f /usr/bin/node || -L /usr/bin/node \
    || "$(stat -c '%u:%g' -- /usr/bin/node 2>/dev/null || true)" != '0:0' \
    || "$(/usr/bin/node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)" != '22' ]]; then
    command -v sudo >/dev/null 2>&1 || {
      printf 'blue/green fixture requires passwordless sudo to provision /usr/bin/node\n' >&2
      exit 1
    }
    if [[ -e /usr/bin/node || -L /usr/bin/node ]]; then
      sudo -n mv -- /usr/bin/node "$TEST_ROOT/system-node.original"
      original_system_node_present=true
    fi
    replaced_system_node=true
    sudo -n install -o root -g root -m 0755 "$fixture_node_binary" /usr/bin/node
  fi
  [[ -f /usr/bin/node && ! -L /usr/bin/node \
    && "$(stat -c '%u:%g' -- /usr/bin/node)" == '0:0' \
    && "$(/usr/bin/node -p 'process.versions.node.split(".")[0]')" == '22' ]] || {
    printf 'blue/green fixture could not provision exact root-owned /usr/bin/node major 22\n' >&2
    exit 1
  }
}

release_root="${TEST_ROOT}/releases"
slot_root="${TEST_ROOT}/slots"
config_root="${TEST_ROOT}/nginx"
state_root="${TEST_ROOT}/state"
bin_root="${TEST_ROOT}/bin"
systemd_root="${TEST_ROOT}/systemd"
environment_root="${TEST_ROOT}/etc-leetplus"
libexec_root="${TEST_ROOT}/libexec"
release_directory="${release_root}/${RELEASE_SHA}"
mkdir -p \
  "$release_directory/apps/api/dist/config" \
  "$release_directory/apps/web/.next/static" \
  "$release_directory/apps/web/.next/cache" \
  "$slot_root" "$config_root/upstreams" "$state_root" "$bin_root" \
  "$systemd_root" "$environment_root/slots" "$libexec_root"
printf 'api\n' > "$release_directory/apps/api/dist/main.js"
printf 'validator\n' > "$release_directory/apps/api/dist/config/validate-production-environment.cli.js"
printf '%s\n' "$RELEASE_SHA" > "$release_directory/apps/web/.next/BUILD_ID"
printf '{"releaseSha":"%s","databaseMigration":"%s","databaseMigrationCount":1}\n' \
  "$RELEASE_SHA" "$MIGRATION" > "$release_directory/release-provenance.json"
printf '{"links":[],"version":1}\n' > "$release_directory/HYDRATED_SYMLINKS.json"
printf 'scheduler-capable-legacy\n' > "$config_root/upstreams/legacy.conf"
cp "$DEPLOY_ROOT/nginx/legacy-safe.conf.example" "$config_root/upstreams/legacy-safe.conf"
cp "$DEPLOY_ROOT/nginx/blue.conf.example" "$config_root/upstreams/blue.conf"
cp "$DEPLOY_ROOT/nginx/green.conf.example" "$config_root/upstreams/green.conf"
ln -s "$release_directory" "$slot_root/blue"
ln -s "$config_root/upstreams/legacy-safe.conf" "$config_root/active-upstreams.conf"
if [[ ! -L "$slot_root/blue" || ! -L "$config_root/active-upstreams.conf" ]]; then
  printf 'PRODUCTION_ARTIFACT_BLUE_GREEN_FIXTURE_SKIPPED_NO_NATIVE_SYMLINK=true\n'
  exit 0
fi
cp "$DEPLOY_ROOT/systemd/leetplus-api@.service" "$systemd_root/leetplus-api@.service"
cp "$DEPLOY_ROOT/systemd/leetplus-web@.service" "$systemd_root/leetplus-web@.service"
cp "$SAFE_OVERLAY" "$environment_root/canary-safe.env"
cp "$PREFLIGHT" "$libexec_root/preflight-release-slot.sh"
printf 'NODE_ENV=production\n' > "$environment_root/runtime.env"
printf 'NODE_ENV=production\n' > "$environment_root/web-runtime.env"
printf 'RELEASE_SHA=%s\nWEB_BUILD_ID=%s\n' "$RELEASE_SHA" "$RELEASE_SHA" \
  > "$environment_root/slots/blue.env"
cp "$environment_root/slots/blue.env" "$environment_root/slots/green.env"
chmod 0644 "$systemd_root/leetplus-api@.service" "$systemd_root/leetplus-web@.service"
chmod 0440 "$environment_root/canary-safe.env" "$environment_root/slots/blue.env" \
  "$environment_root/slots/green.env"
chmod 0640 "$environment_root/runtime.env" "$environment_root/web-runtime.env"
chmod 0755 "$libexec_root/preflight-release-slot.sh"

(
  cd -- "$release_directory"
  find . -type f ! -name SHA256SUMS ! -name HYDRATED_SHA256SUMS \
    ! -name HYDRATED_SYMLINKS.json -print0 \
    | LC_ALL=C sort -z | xargs -0 sha256sum > SHA256SUMS
  find . -type f ! -name HYDRATED_SHA256SUMS -print0 \
    | LC_ALL=C sort -z | xargs -0 sha256sum > HYDRATED_SHA256SUMS
)

set -a
# shellcheck disable=SC1090
source "$SAFE_OVERLAY"
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY \
  http_proxy https_proxy all_proxy no_proxy NODE_USE_ENV_PROXY NODE_OPTIONS NODE_PATH \
  NODE_EXTRA_CA_CERTS NODE_DEBUG NODE_V8_COVERAGE NODE_COMPILE_CACHE SSLKEYLOGFILE \
  LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES \
  GLIBC_TUNABLES MALLOC_CHECK_ MALLOC_PERTURB_ CURL_HOME CURL_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR \
  PRISMA_QUERY_ENGINE_BINARY PRISMA_QUERY_ENGINE_LIBRARY PRISMA_SCHEMA_ENGINE_BINARY PRISMA_FMT_BINARY \
  TMPDIR TMP TEMP XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME NPM_CONFIG_USERCONFIG \
  npm_config_userconfig PNPM_HOME COREPACK_HOME COREPACK_NPM_REGISTRY COREPACK_INTEGRITY_KEYS \
  GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM
PORT=4100
WEB_PORT=3100
API_URL=http://127.0.0.1:4100
API_BIND_HOST=127.0.0.1
EXPECTED_DATABASE_MIGRATION="$MIGRATION"
EXPECTED_DATABASE_MIGRATION_COUNT=1
set +a
/usr/bin/bash -p "$PREFLIGHT" \
  --slot blue \
  --release-sha "$RELEASE_SHA" \
  --web-build-id "$RELEASE_SHA" \
  --slot-root "$slot_root" \
  --release-root "$release_root" \
  --unprivileged-test-mode > "$TEST_ROOT/preflight.out"
grep -F -x "RELEASE_SLOT_PREFLIGHT_ACCEPTED_SHA=${RELEASE_SHA}" "$TEST_ROOT/preflight.out" >/dev/null
cat > "$TEST_ROOT/inert-sink-server.mjs" <<'INERT_SINK_SERVER'
import { createServer } from "node:net";
import { writeFileSync } from "node:fs";
const server = createServer((socket) => socket.destroy());
server.listen(0, "127.0.0.1", () => writeFileSync(process.argv[2], String(server.address().port)));
INERT_SINK_SERVER
node "$TEST_ROOT/inert-sink-server.mjs" "$TEST_ROOT/inert-sink-port" &
sink_server_pid=$!
for _ in 1 2 3 4 5; do [[ -s "$TEST_ROOT/inert-sink-port" ]] && break; sleep 1; done
test -s "$TEST_ROOT/inert-sink-port"
if /usr/bin/bash -p "$PREFLIGHT" \
  --slot blue \
  --release-sha "$RELEASE_SHA" \
  --web-build-id "$RELEASE_SHA" \
  --slot-root "$slot_root" \
  --release-root "$release_root" \
  --test-inert-sink-port "$(cat "$TEST_ROOT/inert-sink-port")" \
  --unprivileged-test-mode > "$TEST_ROOT/listening-inert-sink-rejected.out" 2>&1; then
  kill "$sink_server_pid" 2>/dev/null || true
  wait "$sink_server_pid" 2>/dev/null || true
  sink_server_pid=''
  printf 'candidate preflight accepted a listening loopback delivery sink\n' >&2
  exit 1
fi
grep -F 'pinned inert loopback sink is listening or cannot be proven closed' \
  "$TEST_ROOT/listening-inert-sink-rejected.out" >/dev/null
kill "$sink_server_pid"
wait "$sink_server_pid" 2>/dev/null || true
sink_server_pid=''
if FOUNDER_OPERATOR_BETA_MODE=ACTIVE /usr/bin/bash -p "$PREFLIGHT" \
  --slot blue \
  --release-sha "$RELEASE_SHA" \
  --web-build-id "$RELEASE_SHA" \
  --slot-root "$slot_root" \
  --release-root "$release_root" \
  --unprivileged-test-mode > "$TEST_ROOT/unsafe-overlay-rejected.out" 2>&1; then
  printf 'unsafe shadow environment was unexpectedly accepted\n' >&2
  exit 1
fi

if MAIL_PORT=1025 /usr/bin/bash -p "$PREFLIGHT" \
  --slot blue \
  --release-sha "$RELEASE_SHA" \
  --web-build-id "$RELEASE_SHA" \
  --slot-root "$slot_root" \
  --release-root "$release_root" \
  --unprivileged-test-mode > "$TEST_ROOT/smtp-relay-overlay-rejected.out" 2>&1; then
  printf 'candidate SMTP relay override was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'shadow safety setting is absent or unsafe: MAIL_PORT' \
  "$TEST_ROOT/smtp-relay-overlay-rejected.out" > /dev/null

if GUEST_PORTAL_OTP_SMS_ENDPOINT=http://127.0.0.1:8080 /usr/bin/bash -p "$PREFLIGHT" \
  --slot blue \
  --release-sha "$RELEASE_SHA" \
  --web-build-id "$RELEASE_SHA" \
  --slot-root "$slot_root" \
  --release-root "$release_root" \
  --unprivileged-test-mode > "$TEST_ROOT/provider-endpoint-overlay-rejected.out" 2>&1; then
  printf 'candidate provider endpoint override was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'shadow safety setting is absent or unsafe: GUEST_PORTAL_OTP_SMS_ENDPOINT' \
  "$TEST_ROOT/provider-endpoint-overlay-rejected.out" > /dev/null

if HTTP_PROXY=http://127.0.0.1:8888 /usr/bin/bash -p "$PREFLIGHT" \
  --slot blue \
  --release-sha "$RELEASE_SHA" \
  --web-build-id "$RELEASE_SHA" \
  --slot-root "$slot_root" \
  --release-root "$release_root" \
  --unprivileged-test-mode > "$TEST_ROOT/proxy-overlay-rejected.out" 2>&1; then
  printf 'candidate inherited proxy was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'candidate inherited forbidden injection environment: HTTP_PROXY' \
  "$TEST_ROOT/proxy-overlay-rejected.out" > /dev/null

if NODE_PATH="$TEST_ROOT/forged-node-modules" /usr/bin/bash -p "$PREFLIGHT" \
  --slot blue \
  --release-sha "$RELEASE_SHA" \
  --web-build-id "$RELEASE_SHA" \
  --slot-root "$slot_root" \
  --release-root "$release_root" \
  --unprivileged-test-mode > "$TEST_ROOT/node-path-overlay-rejected.out" 2>&1; then
  printf 'candidate inherited NODE_PATH was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'candidate inherited forbidden injection environment: NODE_PATH' \
  "$TEST_ROOT/node-path-overlay-rejected.out" > /dev/null

if OPENSSL_CONF="$TEST_ROOT/forged-openssl.cnf" /usr/bin/bash -p "$PREFLIGHT" \
  --slot blue \
  --release-sha "$RELEASE_SHA" \
  --web-build-id "$RELEASE_SHA" \
  --slot-root "$slot_root" \
  --release-root "$release_root" \
  --unprivileged-test-mode > "$TEST_ROOT/openssl-overlay-rejected.out" 2>&1; then
  printf 'candidate inherited OPENSSL_CONF was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'candidate inherited forbidden injection environment: OPENSSL_CONF' \
  "$TEST_ROOT/openssl-overlay-rejected.out" > /dev/null

for hostile_key in PRISMA_QUERY_ENGINE_BINARY TMPDIR COREPACK_HOME GLIBC_TUNABLES; do
  if /usr/bin/env "${hostile_key}=${TEST_ROOT}/forged" /usr/bin/bash -p "$PREFLIGHT" \
    --slot blue \
    --release-sha "$RELEASE_SHA" \
    --web-build-id "$RELEASE_SHA" \
    --slot-root "$slot_root" \
    --release-root "$release_root" \
    --unprivileged-test-mode > "$TEST_ROOT/${hostile_key}-overlay-rejected.out" 2>&1; then
    printf 'candidate inherited %s was unexpectedly accepted\n' "$hostile_key" >&2
    exit 1
  fi
  grep -F "candidate inherited forbidden injection environment: ${hostile_key}" \
    "$TEST_ROOT/${hostile_key}-overlay-rejected.out" > /dev/null
done

if EXPECTED_DATABASE_MIGRATION_COUNT=2 /usr/bin/bash -p "$PREFLIGHT" \
  --slot blue \
  --release-sha "$RELEASE_SHA" \
  --web-build-id "$RELEASE_SHA" \
  --slot-root "$slot_root" \
  --release-root "$release_root" \
  --unprivileged-test-mode > "$TEST_ROOT/provenance-mismatch-rejected.out" 2>&1; then
  printf 'mismatched slot migration provenance was unexpectedly accepted\n' >&2
  exit 1
fi
provision_system_node
service_user="$(id -un)"
/usr/bin/bash -p "$SEALER" \
  --release-sha "$RELEASE_SHA" \
  --release-root "$release_root" \
  --service-user "$service_user" \
  --dry-run > "$TEST_ROOT/seal.out"
grep -F -x "RELEASE_SEAL_DRY_RUN_SHA=${RELEASE_SHA}" "$TEST_ROOT/seal.out" >/dev/null
ln "$release_directory/apps/api/dist/main.js" "$release_directory/apps/api/dist/shared-main.js"
if /usr/bin/bash -p "$SEALER" \
  --release-sha "$RELEASE_SHA" \
  --release-root "$release_root" \
  --service-user "$service_user" \
  --dry-run > "$TEST_ROOT/hardlink-rejected.out" 2>&1; then
  printf 'multiply-linked release file was unexpectedly accepted\n' >&2
  exit 1
fi
rm -- "$release_directory/apps/api/dist/shared-main.js"

cache_marker_fixture="$TEST_ROOT/cache-markers"
mkdir -p "$cache_marker_fixture"
printf '%s\n' "$RELEASE_SHA" > "$cache_marker_fixture/blue.sha"
env -i PATH="$PATH" bash -c '
  set -a
  source "$1"
  PORT=4100
  WEB_PORT=3100
  API_URL=http://127.0.0.1:4100
  API_BIND_HOST=127.0.0.1
  EXPECTED_DATABASE_MIGRATION="$2"
  EXPECTED_DATABASE_MIGRATION_COUNT=1
  NODE_ENV=production
  set +a
  exec /usr/bin/bash -p "$3" \
    --slot blue --release-sha "$4" --web-build-id "$4" \
    --slot-root "$5" --release-root "$6" --cache-marker-root "$7" \
    --web-runtime --require-web-cache-bind --unprivileged-test-mode
' fixture "$SAFE_OVERLAY" "$MIGRATION" "$PREFLIGHT" "$RELEASE_SHA" "$slot_root" "$release_root" "$cache_marker_fixture" \
  > "$TEST_ROOT/web-preflight.out"
grep -F -x 'RELEASE_SLOT_PREFLIGHT_WEB_RUNTIME=true' "$TEST_ROOT/web-preflight.out" >/dev/null

cat > "$bin_root/systemctl" <<'SYSTEMCTL'
#!/usr/bin/env bash
set -euo pipefail
printf 'systemctl %s\n' "$*" >> "${TEST_COMMAND_LOG:?}"
case "${1:-}" in
  is-active) exit 0 ;;
  is-enabled) exit 0 ;;
  reload)
    if [[ "${TEST_DRIFT_ON_RELOAD:-false}" == true ]]; then
      : > "${TEST_UNIT_DRIFT_MARKER:?}"
    fi
    exit 0
    ;;
  show)
    property=''
    unit="${!#}"
    for argument in "$@"; do
      case "$argument" in --property=*) property="${argument#--property=}" ;; esac
    done
    if [[ -z "$property" && "${TEST_UNIT_ATTESTATION:-false}" == true ]]; then
      for snapshot_property in \
        ActiveState SubState UnitFileState NeedDaemonReload User Group FragmentPath DropInPaths WorkingDirectory \
        ExecStart EnvironmentFiles Environment UnsetEnvironment NoNewPrivileges PrivateTmp PrivateDevices ProtectSystem ProtectHome \
        ProtectProc ProcSubset ProtectKernelTunables ProtectKernelModules ProtectKernelLogs ProtectControlGroups \
        ProtectClock ProtectHostname LockPersonality RestrictSUIDSGID RemoveIPC SystemCallArchitectures \
        RestrictAddressFamilies RestrictNetworkInterfaces IPAddressDeny IPAddressAllow ReadOnlyPaths \
        ReadWritePaths CapabilityBoundingSet AmbientCapabilities UMask MainPID InvocationID ControlGroup; do
        snapshot_value="$("$0" show --property="$snapshot_property" --value "$unit")"
        printf '%s=%s\n' "$snapshot_property" "$snapshot_value"
      done
      exit 0
    fi
    [[ -n "$property" ]] || exit 71
    if [[ "${TEST_UNIT_ATTESTATION:-false}" != true ]]; then
      [[ "$property" == ActiveState ]] || exit 72
      printf '%s\n' "${TEST_WEB_STATE:-inactive}"
      exit 0
    fi
    if [[ "${TEST_UNIT_DRIFT_PROPERTY:-}" == "$property" ]]; then
      printf '%s\n' "${TEST_UNIT_DRIFT_VALUE:-forged}"
      exit 0
    fi
    if [[ -n "${TEST_UNIT_DRIFT_MARKER:-}" && -f "$TEST_UNIT_DRIFT_MARKER" \
      && "$property" == InvocationID ]]; then
      printf '33333333333333333333333333333333\n'
      exit 0
    fi
    case "$unit" in
      leetplus-api@blue.service|leetplus-api@green.service) kind=api ;;
      leetplus-web@blue.service|leetplus-web@green.service) kind=web ;;
      *) exit 73 ;;
    esac
    slot_name="${unit#*@}"
    slot_name="${slot_name%.service}"
    if [[ "$slot_name" == blue ]]; then web_port=3100; else web_port=3200; fi
    case "$property" in
      ActiveState) printf 'active\n' ;;
      SubState) printf 'running\n' ;;
      UnitFileState) printf 'enabled\n' ;;
      NeedDaemonReload) printf 'no\n' ;;
      User) printf 'leetplus-%s-%s\n' "$kind" "$slot_name" ;;
      Group) printf 'leetplus-runtime\n' ;;
      FragmentPath) printf '%s/leetplus-%s@.service\n' "${TEST_SYSTEMD_ROOT:?}" "$kind" ;;
      DropInPaths|CapabilityBoundingSet|AmbientCapabilities) printf '\n' ;;
      UMask) printf '0027\n' ;;
      WorkingDirectory)
        if [[ "$kind" == api ]]; then
          printf '/srv/leetplus/slots/%s\n' "$slot_name"
        else
          printf '/srv/leetplus/slots/%s/apps/web\n' "$slot_name"
        fi
        ;;
      ExecStart)
        if [[ "$kind" == api ]]; then
          printf '{ path=/usr/bin/node ; argv[]=/usr/bin/node /srv/leetplus/slots/%s/apps/api/dist/main.js ; ignore_errors=no ; }\n' "$slot_name"
        else
          printf '{ path=/usr/bin/node ; argv[]=/usr/bin/node /srv/leetplus/slots/%s/apps/web/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port %s ; ignore_errors=no ; }\n' "$slot_name" "$web_port"
        fi
        ;;
      EnvironmentFiles)
        if [[ "$kind" == api ]]; then runtime_file=runtime.env; else runtime_file=web-runtime.env; fi
        printf '%s/%s (ignore_errors=no) %s/slots/%s.env (ignore_errors=no) %s/canary-safe.env (ignore_errors=no)\n' \
          "${TEST_ENVIRONMENT_ROOT:?}" "$runtime_file" "${TEST_ENVIRONMENT_ROOT:?}" "$slot_name" "${TEST_ENVIRONMENT_ROOT:?}"
        ;;
      Environment) printf 'PATH=/usr/sbin:/usr/bin:/sbin:/bin\n' ;;
      UnsetEnvironment) printf 'BASH_ENV ENV HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy all_proxy no_proxy NODE_USE_ENV_PROXY NODE_OPTIONS NODE_PATH NODE_EXTRA_CA_CERTS NODE_DEBUG NODE_V8_COVERAGE NODE_COMPILE_CACHE SSLKEYLOGFILE LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES GLIBC_TUNABLES MALLOC_CHECK_ MALLOC_PERTURB_ CURL_HOME CURL_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR PRISMA_QUERY_ENGINE_BINARY PRISMA_QUERY_ENGINE_LIBRARY PRISMA_SCHEMA_ENGINE_BINARY PRISMA_FMT_BINARY TMPDIR TMP TEMP XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME NPM_CONFIG_USERCONFIG npm_config_userconfig PNPM_HOME COREPACK_HOME COREPACK_NPM_REGISTRY COREPACK_INTEGRITY_KEYS GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM\n' ;;
      NoNewPrivileges|PrivateTmp|PrivateDevices|ProtectHome|ProtectKernelTunables|ProtectKernelModules|ProtectKernelLogs|ProtectControlGroups|ProtectClock|ProtectHostname|LockPersonality|RestrictSUIDSGID|RemoveIPC) printf 'yes\n' ;;
      ProtectSystem) printf 'strict\n' ;;
      ProtectProc) printf 'invisible\n' ;;
      ProcSubset) printf 'pid\n' ;;
      SystemCallArchitectures) printf 'native\n' ;;
      RestrictAddressFamilies) printf 'AF_INET6 AF_INET\n' ;;
      RestrictNetworkInterfaces) printf 'lo\n' ;;
      IPAddressDeny) printf 'any\n' ;;
      IPAddressAllow) printf 'localhost\n' ;;
      ReadOnlyPaths) printf '/srv/leetplus/slots /srv/leetplus/releases\n' ;;
      ReadWritePaths)
        if [[ "$kind" == api ]]; then printf '/var/lib/leetplus/langame-sync\n'; else printf '/var/cache/leetplus-web-%s\n' "$slot_name"; fi
        ;;
      MainPID) printf '%s\n' "${TEST_MAIN_PID:?}" ;;
      InvocationID)
        if [[ "$kind" == api ]]; then printf '11111111111111111111111111111111\n'; else printf '22222222222222222222222222222222\n'; fi
        ;;
      ControlGroup) printf '%s\n' "${TEST_CONTROL_GROUP:?}" ;;
      *) exit 74 ;;
    esac
    exit 0
    ;;
  *) exit 70 ;;
esac
SYSTEMCTL

cat > "$bin_root/ss" <<'SS'
#!/usr/bin/env bash
set -euo pipefail
printf 'ss %s\n' "$*" >> "${TEST_COMMAND_LOG:?}"
port="${*: -1}"
port="${port##*:}"
listener_pid="${TEST_MAIN_PID:?}"
if [[ "${TEST_LISTENER_PID_DRIFT:-false}" == true ]]; then listener_pid=999999; fi
printf 'LISTEN 0 511 127.0.0.1:%s 0.0.0.0:* users:(("node",pid=%s,fd=19))\n' \
  "$port" "$listener_pid"
SS

cat > "$bin_root/nginx" <<'NGINX'
#!/usr/bin/env bash
set -euo pipefail
printf 'nginx %s\n' "$*" >> "${TEST_COMMAND_LOG:?}"
active_target="$(realpath -e -- "${TEST_ACTIVE_LINK:?}")"
if [[ "${TEST_NGINX_FAIL:-false}" == true ]]; then
  exit 71
fi
NGINX

cat > "$bin_root/curl" <<'CURL'
#!/usr/bin/env bash
set -euo pipefail
printf 'curl %s\n' "$*" >> "${TEST_COMMAND_LOG:?}"
url="${!#}"
if [[ "${TEST_FAIL_ROLLBACK_SMOKE:-false}" == true && "$url" == https://* ]]; then
  exit 74
fi
printf '200'
CURL

cat > "$bin_root/sync" <<'SYNC'
#!/usr/bin/env bash
set -euo pipefail
printf 'sync %s\n' "$*" >> "${TEST_COMMAND_LOG:?}"
exec /usr/bin/sync "$@"
SYNC

cat > "$TEST_ROOT/probe" <<'PROBE'
#!/usr/bin/env bash
set -euo pipefail
for unsafe_environment_key in \
  BASH_ENV ENV HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY \
  http_proxy https_proxy all_proxy no_proxy NODE_USE_ENV_PROXY NODE_OPTIONS \
  NODE_PATH NODE_EXTRA_CA_CERTS NODE_DEBUG NODE_V8_COVERAGE NODE_COMPILE_CACHE SSLKEYLOGFILE \
  LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES \
  GLIBC_TUNABLES MALLOC_CHECK_ MALLOC_PERTURB_ CURL_HOME CURL_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR \
  PRISMA_QUERY_ENGINE_BINARY PRISMA_QUERY_ENGINE_LIBRARY PRISMA_SCHEMA_ENGINE_BINARY PRISMA_FMT_BINARY \
  TMPDIR TMP TEMP XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME NPM_CONFIG_USERCONFIG \
  npm_config_userconfig PNPM_HOME COREPACK_HOME COREPACK_NPM_REGISTRY COREPACK_INTEGRITY_KEYS \
  GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM; do
  [[ ! -v "$unsafe_environment_key" ]] || exit 79
done
printf 'probe %s\n' "$*" >> "${TEST_COMMAND_LOG:?}"
if [[ "${TEST_FAIL_PREVIOUS:-false}" == true && "$*" == *'--require-drain'* ]]; then
  exit 75
fi
if [[ "${TEST_FAIL_PUBLIC:-false}" == true && "$*" == *'https://'* ]]; then
  exit 72
fi
if [[ "${TEST_FAIL_PUBLIC_API:-false}" == true \
  && "$*" == *'--api-base-url https://'* ]]; then
  exit 72
fi
if [[ "${TEST_FAIL_PUBLIC_WEB:-false}" == true \
  && "$*" == *'--web-url https://'* ]]; then
  exit 72
fi
if [[ "${TEST_PROBE_DELAY_SECONDS:-0}" =~ ^[0-9]+$ \
  && "${TEST_PROBE_DELAY_SECONDS:-0}" != 0 ]]; then
  sleep "$TEST_PROBE_DELAY_SECONDS"
fi
PROBE
cat > "$TEST_ROOT/authenticated-smoke.mjs" <<'AUTHENTICATED_SMOKE'
import { appendFileSync } from 'node:fs';
const argumentsText = process.argv.slice(2).join(' ');
appendFileSync(process.env.TEST_COMMAND_LOG, `authenticated-smoke ${argumentsText}\n`);
if (/^[0-9]+$/.test(process.env.TEST_AUTH_DELAY_SECONDS ?? '') && process.env.TEST_AUTH_DELAY_SECONDS !== '0') {
  await new Promise((resolve) => setTimeout(resolve, Number(process.env.TEST_AUTH_DELAY_SECONDS) * 1000));
}
if (process.env.TEST_AUTH_SMOKE_FAIL === 'true') process.exit(81);
if (process.env.TEST_AUTH_SMOKE_FAIL_PUBLIC === 'true' && argumentsText.includes('https://')) process.exit(82);
AUTHENTICATED_SMOKE
chmod 0700 "$bin_root/systemctl" "$bin_root/ss" "$bin_root/nginx" "$bin_root/curl" "$bin_root/sync" "$TEST_ROOT/probe" "$TEST_ROOT/authenticated-smoke.mjs"

cache_test_root="$TEST_ROOT/cache"
cache_marker_test_root="$TEST_ROOT/cache-authority"
mkdir -p "$cache_test_root" "$cache_marker_test_root"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$TEST_ROOT/cache-commands.log" TEST_WEB_STATE=active \
  /usr/bin/bash -p "$CACHE_PREPARER" --slot blue --release-sha "$RELEASE_SHA" \
    --cache-root "$cache_test_root" --marker-root "$cache_marker_test_root" --service-user "$(id -un)" --unprivileged-test-mode \
    > "$TEST_ROOT/cache-active-rejected.out" 2>&1; then
  printf 'cache reset while Web slot was active was unexpectedly accepted\n' >&2
  exit 1
fi
PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$TEST_ROOT/cache-commands.log" \
  /usr/bin/bash -p "$CACHE_PREPARER" --slot blue --release-sha "$RELEASE_SHA" \
    --cache-root "$cache_test_root" --marker-root "$cache_marker_test_root" --service-user "$(id -un)" --unprivileged-test-mode \
    > "$TEST_ROOT/cache-prepared.out"
test "$(tr -d '\r\n' < "$cache_marker_test_root/blue.sha")" = "$RELEASE_SHA"
printf 'stale\n' > "$cache_test_root/leetplus-web-blue/stale-entry"
replacement_sha="$(printf 'b%.0s' {1..40})"
PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$TEST_ROOT/cache-commands.log" \
  /usr/bin/bash -p "$CACHE_PREPARER" --slot blue --release-sha "$replacement_sha" \
    --cache-root "$cache_test_root" --marker-root "$cache_marker_test_root" --service-user "$(id -un)" --unprivileged-test-mode \
    > "$TEST_ROOT/cache-replaced.out"
test "$(tr -d '\r\n' < "$cache_marker_test_root/blue.sha")" = "$replacement_sha"
test -n "$(find "$cache_test_root/leetplus-web-retired" -mindepth 1 -maxdepth 1 -type d -print -quit)"

common_arguments=(
  --release-sha "$RELEASE_SHA"
  --expected-migration "$MIGRATION"
  --expected-migration-count 1
  --expected-web-build-id "$RELEASE_SHA"
  --loopback-api-url http://127.0.0.1:4100
  --loopback-web-url http://127.0.0.1:3100
  --public-api-url https://api.example.test
  --public-web-url https://web.example.test
  --watchdog-seconds 5
  --config-root "$config_root"
  --state-root "$state_root"
  --systemd-root "$systemd_root"
  --environment-root "$environment_root"
  --libexec-root "$libexec_root"
  --probe "$TEST_ROOT/probe"
  --legacy-rollback-probe "$TEST_ROOT/probe"
  --authenticated-smoke "$TEST_ROOT/authenticated-smoke.mjs"
  --unprivileged-test-mode
)

mount_inventory_fixture="$TEST_ROOT/hostile-mount-inventory"
printf '%s\n' "$state_root/nested-ephemeral-bind" > "$mount_inventory_fixture"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  TEST_CUTOVER_MOUNT_INVENTORY_FILE="$mount_inventory_fixture" \
  /usr/bin/bash -p "$CUTOVER" switch --slot green "${common_arguments[@]}" \
  > "$TEST_ROOT/nested-mount-rejected.out" 2>&1; then
  printf 'cutover accepted a nested mount below its durable state boundary\n' >&2
  exit 1
fi
grep -F 'durable deployment boundary contains an exact/nested mount' \
  "$TEST_ROOT/nested-mount-rejected.out" >/dev/null

printf 'do-not-touch\n' > "$TEST_ROOT/cutover-lock-sentinel"
ln -s "$TEST_ROOT/cutover-lock-sentinel" "$state_root/cutover.lock"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  /usr/bin/bash -p "$CUTOVER" switch --slot green "${common_arguments[@]}" \
  > "$TEST_ROOT/symlink-lock-rejected.out" 2>&1; then
  printf 'cutover accepted a symlinked shared lock\n' >&2
  exit 1
fi
grep -F -x 'do-not-touch' "$TEST_ROOT/cutover-lock-sentinel" >/dev/null
rm -- "$state_root/cutover.lock"
ln "$TEST_ROOT/cutover-lock-sentinel" "$state_root/cutover.lock"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  /usr/bin/bash -p "$CUTOVER" switch --slot green "${common_arguments[@]}" \
  > "$TEST_ROOT/hardlink-lock-rejected.out" 2>&1; then
  printf 'cutover accepted a hard-linked shared lock\n' >&2
  exit 1
fi
grep -F -x 'do-not-touch' "$TEST_ROOT/cutover-lock-sentinel" >/dev/null
rm -- "$state_root/cutover.lock"

test_control_group="$(awk -F: 'NR == 1 { print $3; exit }' "/proc/$$/cgroup")"
[[ "$test_control_group" == /* ]] || {
  printf 'fixture cannot determine its live cgroup\n' >&2
  exit 1
}
export TEST_UNIT_ATTESTATION=true
export TEST_SYSTEMD_ROOT="$systemd_root"
export TEST_ENVIRONMENT_ROOT="$environment_root"
export TEST_MAIN_PID="$$"
export TEST_CONTROL_GROUP="$test_control_group"

latest_receipt_by_generation() {
  local candidate candidate_generation best='' best_generation=0
  while IFS= read -r -d '' candidate; do
    candidate_generation="$(awk -F= '$1 == "GENERATION" { print $2 }' "$candidate")"
    [[ "$candidate_generation" =~ ^[1-9][0-9]*$ ]] || continue
    if ((10#$candidate_generation > best_generation)); then
      best="$candidate"
      best_generation=$((10#$candidate_generation))
    fi
  done < <(find "$state_root" -maxdepth 1 -type f -name '*.receipt' -print0)
  [[ -n "$best" ]] || return 1
  printf '%s\n' "$best"
}

next_fixture_generation() {
  local index="$state_root/latest-accepted.index" current=0
  if [[ -f "$index" ]]; then
    current="$(awk -F= '$1 == "GENERATION" { print $2 }' "$index")"
    [[ "$current" =~ ^[1-9][0-9]*$ ]] || return 1
  fi
  printf '%s\n' "$((10#$current + 1))"
}

write_fixture_intent() {
  local timestamp="$1" previous_target_value="$2" activated_target_value="$3"
  local generation intent_value
  generation="$(next_fixture_generation)"
  intent_value="$state_root/${timestamp}-g${generation}-${RELEASE_SHA}-blue.intent"
  {
    printf 'RECORD_VERSION=3\n'
    printf 'GENERATION=%s\n' "$generation"
    printf 'RELEASE_SHA=%s\n' "$RELEASE_SHA"
    printf 'SLOT=blue\n'
    printf 'PREVIOUS_TARGET=%s\n' "$previous_target_value"
    printf 'PREVIOUS_SHA256=%s\n' "$(sha256sum "$previous_target_value" | awk '{ print $1 }')"
    printf 'PREVIOUS_RUNTIME_KIND=LEGACY_SAFE\n'
    printf 'PREVIOUS_SLOT=legacy-safe\n'
    printf 'PREVIOUS_API_UNIT=leetplus-api-rollback@%s.service\n' "$LEGACY_SHA"
    printf 'PREVIOUS_WEB_UNIT=leetplus-web-rollback@%s.service\n' "$LEGACY_SHA"
    printf 'PREVIOUS_API_URL=http://127.0.0.1:4300\n'
    printf 'PREVIOUS_WEB_URL=http://127.0.0.1:3300\n'
    printf 'PREVIOUS_RELEASE_SHA=%s\n' "$LEGACY_SHA"
    printf 'PREVIOUS_MIGRATION=SCHEMA_COMPATIBILITY_REHEARSED\n'
    printf 'PREVIOUS_MIGRATION_COUNT=0\n'
    printf 'PREVIOUS_WEB_BUILD_ID=%s\n' "$LEGACY_SHA"
    printf 'ACTIVATED_TARGET=%s\n' "$activated_target_value"
    printf 'ACTIVATED_SHA256=%s\n' "$(sha256sum "$activated_target_value" | awk '{ print $1 }')"
    printf 'INTENT_RECORDED_AT=%s\n' "$timestamp"
  } > "$intent_value"
  chmod 0600 "$intent_value"
  printf '%s\n' "$intent_value"
}

command_log="$TEST_ROOT/commands.log"
# A dead N-1 is rejected while the active link still points to legacy. The
# candidate is never made externally routable when rollback itself is unsafe.
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" TEST_FAIL_PREVIOUS=true \
  /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/dead-previous-rejected.out" 2>&1; then
  printf 'switch with a dead previous runtime was unexpectedly accepted\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
test -z "$(find "$state_root" -maxdepth 1 -type f \( -name '*.intent' -o -name '*.receipt' \) -print -quit)"

# Static readiness is insufficient: an authenticated, DB-bound critical read
# failure is rejected before any durable intent or routing effect.
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  TEST_AUTH_SMOKE_FAIL=true \
  /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/authenticated-pre-intent-rejected.out" 2>&1; then
  printf 'switch accepted a broken authenticated critical route before intent\n' >&2
  exit 1
fi
grep -F 'authenticated DB-bound read-only smoke failed before durable intent' "$TEST_ROOT/authenticated-pre-intent-rejected.out" >/dev/null
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
test -z "$(find "$state_root" -maxdepth 1 -type f \( -name '*.intent' -o -name '*.receipt' \) -print -quit)"

# Functional HTTP and active/enabled state cannot compensate for a forged
# effective unit identity or sandbox. Refuse it before writing an intent.
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  TEST_UNIT_DRIFT_PROPERTY=User TEST_UNIT_DRIFT_VALUE=admin \
  /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/unit-drift-pre-switch.out" 2>&1; then
  printf 'switch with a forged effective candidate unit was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'candidate unit attestation failed' "$TEST_ROOT/unit-drift-pre-switch.out" >/dev/null
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
test -z "$(find "$state_root" -maxdepth 1 -type f \( -name '*.intent' -o -name '*.receipt' \) -print -quit)"

if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  TEST_UNIT_DRIFT_PROPERTY=NeedDaemonReload TEST_UNIT_DRIFT_VALUE=yes \
  /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/unit-stale-manager.out" 2>&1; then
  printf 'switch with stale effective systemd configuration was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'candidate unit attestation failed' "$TEST_ROOT/unit-stale-manager.out" >/dev/null
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
test -z "$(find "$state_root" -maxdepth 1 -type f \( -name '*.intent' -o -name '*.receipt' \) -print -quit)"

if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  TEST_UNIT_DRIFT_PROPERTY=UnsetEnvironment TEST_UNIT_DRIFT_VALUE='HTTP_PROXY' \
  /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/unit-env-scrub-drift.out" 2>&1; then
  printf 'switch with incomplete effective environment scrub was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'effective proxy/Node environment removal' "$TEST_ROOT/unit-env-scrub-drift.out" >/dev/null
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
test -z "$(find "$state_root" -maxdepth 1 -type f \( -name '*.intent' -o -name '*.receipt' \) -print -quit)"

if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  TEST_CANDIDATE_NSS_GROUPS='leetplus-runtime wheel' \
  /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/nss-groups-drift.out" 2>&1; then
  printf 'switch with an overprivileged candidate NSS identity was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'exact NSS groups' "$TEST_ROOT/nss-groups-drift.out" >/dev/null
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
test -z "$(find "$state_root" -maxdepth 1 -type f \( -name '*.intent' -o -name '*.receipt' \) -print -quit)"

for nss_identity_drift in NSS_DUPLICATE_UID NSS_DUPLICATE_GID FOREIGN_UID_PROCESS FOREIGN_PRIMARY_GID; do
  if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
    /usr/bin/env "TEST_CANDIDATE_${nss_identity_drift}=true" \
      /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" \
      > "$TEST_ROOT/${nss_identity_drift}.out" 2>&1; then
    printf 'switch accepted candidate identity drift: %s\n' "$nss_identity_drift" >&2
    exit 1
  fi
  grep -F 'candidate unit attestation failed' "$TEST_ROOT/${nss_identity_drift}.out" >/dev/null
  test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
  test -z "$(find "$state_root" -maxdepth 1 -type f \( -name '*.intent' -o -name '*.receipt' \) -print -quit)"
done

if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  TEST_LISTENER_PID_DRIFT=true \
  /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/listener-owner-drift.out" 2>&1; then
  printf 'switch with a foreign listener PID was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'MainPID/listener binding' "$TEST_ROOT/listener-owner-drift.out" >/dev/null
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
test -z "$(find "$state_root" -maxdepth 1 -type f \( -name '*.intent' -o -name '*.receipt' \) -print -quit)"

# Candidate configs contain no independent API/Web backup. A one-sided public
# failure during the bounded acceptance watchdog restores the whole previous
# pair through the single active link and never accepts a mixed generation.
for failed_side in API WEB; do
  if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
    /usr/bin/env "TEST_FAIL_PUBLIC_${failed_side}=true" \
      /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" \
      > "$TEST_ROOT/one-sided-${failed_side}.out" 2>&1; then
    printf 'one-sided %s failure was unexpectedly accepted\n' "$failed_side" >&2
    exit 1
  fi
  grep -F 'public watchdog failed; exact previous nginx target restored' \
    "$TEST_ROOT/one-sided-${failed_side}.out" >/dev/null
  test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
  test -z "$(find "$state_root" -maxdepth 1 -type f -name '*.receipt' -print -quit)"
done

PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  HTTP_PROXY=http://127.0.0.1:9999 NODE_OPTIONS=--definitely-invalid \
  LEETPLUS_TEST_TIMESTAMP_OVERRIDE=20991231T235959999999999Z \
  /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/switch.out"
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/blue.conf"
grep -E '^sync -f .*/latest-accepted\.index\.new\.[0-9]+$' "$command_log" >/dev/null
receipt="$(latest_receipt_by_generation)"
test -n "$receipt"
test "$(basename -- "$receipt")" = "20991231T235959999999999Z-g1-${RELEASE_SHA}-blue.receipt"
grep -F -x 'RECORD_VERSION=3' "$receipt" >/dev/null
grep -F -x 'GENERATION=1' "$receipt" >/dev/null
grep -F -x 'RECORD_VERSION=2' "$state_root/latest-accepted.index" >/dev/null
grep -F -x 'GENERATION=1' "$state_root/latest-accepted.index" >/dev/null
grep -F -x 'BLUE_GREEN_OLD_PROCESSES_STOPPED=false' "$TEST_ROOT/switch.out" >/dev/null
test "$(grep -c 'https://api.example.test' "$command_log")" -ge 3
if grep -E 'systemctl (stop|restart|disable)' "$command_log" >/dev/null; then
  printf 'cutover attempted to stop or restart a process\n' >&2
  exit 1
fi

# A lost response after the exact route/reload/public-smoke rollback but before
# the consumed index update leaves rollback authority intact. The next exact
# invocation must safely replay and only then consume that authority.
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  LEETPLUS_TEST_ABORT_AFTER_ROLLBACK_ROUTE=true \
  /usr/bin/bash -p "$CUTOVER" rollback --receipt "$receipt" \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --legacy-rollback-probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/rollback-lost-response.out" 2>&1; then
  printf 'fixture-requested rollback lost response was unexpectedly accepted\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
reloads_before_retry="$(grep -c 'systemctl reload nginx.service' "$command_log")"
PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  /usr/bin/bash -p "$CUTOVER" rollback --receipt "$receipt" \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --legacy-rollback-probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/idempotent-rollback.out"
reloads_after_retry="$(grep -c 'systemctl reload nginx.service' "$command_log")"
test "$reloads_after_retry" -eq "$((reloads_before_retry + 1))"
grep -F -x 'BLUE_GREEN_ROLLBACK_SERVING_CONFIRMED=true' "$TEST_ROOT/idempotent-rollback.out" >/dev/null

# Once a successful rollback has durably consumed the latest generation,
# replaying the old receipt is rejected even though its slot is active again.
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  /usr/bin/bash -p "$CUTOVER" rollback --receipt "$receipt" \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --legacy-rollback-probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/consumed-replay-rejected.out" 2>&1; then
  printf 'consumed accepted receipt was unexpectedly reusable\n' >&2
  exit 1
fi
grep -F 'stale, superseded, drifted or already consumed' "$TEST_ROOT/consumed-replay-rejected.out" >/dev/null

# SIGKILL/host-loss after the accepted receipt rename but before creation of
# the generation index leaves no intent. The next locked invocation must
# reconcile exactly one newer receipt that exactly describes the live target.
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  LEETPLUS_TEST_ABORT_AFTER_ACCEPTED_RECEIPT=true \
  LEETPLUS_TEST_TIMESTAMP_OVERRIDE=20000101T000000000000000Z \
  /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/accepted-before-index.out" 2>&1; then
  printf 'fixture-requested accepted-receipt interruption was unexpectedly successful\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/blue.conf"
lost_receipt="$(latest_receipt_by_generation)"
test "$(basename -- "$lost_receipt")" = "20000101T000000000000000Z-g2-${RELEASE_SHA}-blue.receipt"
PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  /usr/bin/bash -p "$CUTOVER" rollback --receipt "$lost_receipt" \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --legacy-rollback-probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/accepted-before-index-recovered.out"
grep -F -x "BLUE_GREEN_ACCEPTED_INDEX_RECONCILED=${lost_receipt}" "$TEST_ROOT/accepted-before-index-recovered.out" >/dev/null
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
grep -F -x 'GENERATION=2' "$state_root/latest-accepted.index" >/dev/null
grep -F -x 'CONSUMED=true' "$state_root/latest-accepted.index" >/dev/null

# A lost response on either side of the atomic index replacement is also
# recoverable: before mv the older consumed index is reconciled forward; after
# mv the new exact index is already authoritative despite the missing fsync
# response in the fixture process.
for index_failure_phase in before-latest-index-mv after-latest-index-mv; do
  if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
    LEETPLUS_TEST_FAIL_PHASE="$index_failure_phase" \
    /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/${index_failure_phase}.out" 2>&1; then
    printf 'fixture-requested %s interruption was unexpectedly successful\n' "$index_failure_phase" >&2
    exit 1
  fi
  test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/blue.conf"
  index_failure_receipt="$(latest_receipt_by_generation)"
  PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
    /usr/bin/bash -p "$CUTOVER" rollback --receipt "$index_failure_receipt" \
      --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
      --legacy-rollback-probe "$TEST_ROOT/probe" \
      --unprivileged-test-mode > "$TEST_ROOT/${index_failure_phase}-recovered.out"
  test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
done

# A host-loss boundary after the fsynced ACCEPTED_AT marker but before the
# intent-to-receipt rename is a committed generation, not an unaccepted intent.
# The next shared-lock invocation must finalize, index and roll it back.
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  LEETPLUS_TEST_FAIL_PHASE=after-accepted-intent-fsync \
  /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/accepted-intent-fsync.out" 2>&1; then
  printf 'fixture-requested accepted-intent fsync interruption was unexpectedly successful\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/blue.conf"
committed_intent="$(find "$state_root" -maxdepth 1 -type f -name '*.intent' -print -quit)"
test -n "$committed_intent"
grep -E '^ACCEPTED_AT=[0-9]{4}-[0-9]{2}-[0-9]{2}T' "$committed_intent" >/dev/null
committed_receipt="${committed_intent%.intent}.receipt"
PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  /usr/bin/bash -p "$CUTOVER" rollback --receipt "$committed_receipt" \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --legacy-rollback-probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/accepted-intent-fsync-recovered.out"
grep -F -x "BLUE_GREEN_ACCEPTED_INTENT_RECONCILED=${committed_receipt}" \
  "$TEST_ROOT/accepted-intent-fsync-recovered.out" >/dev/null
grep -F -x "BLUE_GREEN_ACCEPTED_INDEX_RECONCILED=${committed_receipt}" \
  "$TEST_ROOT/accepted-intent-fsync-recovered.out" >/dev/null
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"

grep -F -- '--noproxy *' "$command_log" >/dev/null

# A handled interruption immediately after the atomic link effect is guarded
# by an EXIT rollback. The durable intent is archived only after exact N-1 is
# restored and publicly confirmed.
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  LEETPLUS_TEST_ABORT_AFTER_LINK=true \
  /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/exit-guard.out" 2>&1; then
  printf 'fixture-requested post-link interruption was unexpectedly accepted\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
test -n "$(find "$state_root" -maxdepth 1 -type f -name '*.recovered' -print -quit)"
test -z "$(find "$state_root" -maxdepth 1 -type f -name '*.intent' -print -quit)"

# A failure after mv but before directory fsync leaves the candidate link on
# disk. The EXIT guard must observe the explicit atomic_link failure, restore
# N-1, and must never report an accepted switch.
rm -f "$state_root/.fixture-after-link-mv-fired"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  LEETPLUS_TEST_FAIL_PHASE=after-link-mv \
  /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/link-mv-fault.out" 2>&1; then
  printf 'post-link durability fault was unexpectedly accepted\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
test -z "$(find "$state_root" -maxdepth 1 -type f -name '*.intent' -print -quit)"

# Intent archival failure is not success. The exact previous link remains
# restored, the outstanding intent stays durable, and recover-pending can
# finish it idempotently on the next watchdog invocation.
rm -f "$state_root/.fixture-before-archive-mv-fired"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  LEETPLUS_TEST_ABORT_AFTER_LINK=true LEETPLUS_TEST_FAIL_PHASE=before-archive-mv \
  /usr/bin/bash -p "$CUTOVER" switch --slot blue "${common_arguments[@]}" > "$TEST_ROOT/archive-fault.out" 2>&1; then
  printf 'intent archival fault was unexpectedly accepted\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
test -n "$(find "$state_root" -maxdepth 1 -type f -name '*.intent' -print -quit)"
PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  /usr/bin/bash -p "$CUTOVER" recover-pending \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --legacy-rollback-probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/archive-fault-recovered.out"
test -z "$(find "$state_root" -maxdepth 1 -type f -name '*.intent' -print -quit)"
grep -F -x 'BLUE_GREEN_PENDING_RECOVERY=false' "$TEST_ROOT/archive-fault-recovered.out" >/dev/null
grep -F 'BLUE_GREEN_RECOVERED_INTENT_RECONCILED=' "$TEST_ROOT/archive-fault-recovered.out" >/dev/null

# Host loss during either whole-record phase-file write leaves the authoritative
# intent untouched. A partial root-only temp is discarded, then the exact
# intent is recovered normally; no torn append can strand the journal.
for partial_phase in accepting recovering; do
  if [[ "$partial_phase" == accepting ]]; then
    partial_timestamp=20010101T000000000000010Z
  else
    partial_timestamp=20010101T000000000000011Z
  fi
  partial_intent="$(write_fixture_intent "$partial_timestamp" \
    "$config_root/upstreams/legacy-safe.conf" "$config_root/upstreams/blue.conf")"
  printf 'PARTIAL_PHASE_RECORD_WITHOUT_SCHEMA\n' > "${partial_intent}.${partial_phase}.new"
  chmod 0600 "${partial_intent}.${partial_phase}.new"
  ln -s "$config_root/upstreams/blue.conf" "$config_root/active-upstreams.conf.next"
  mv -Tf "$config_root/active-upstreams.conf.next" "$config_root/active-upstreams.conf"
  PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
    /usr/bin/bash -p "$CUTOVER" recover-pending \
      --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
      --legacy-rollback-probe "$TEST_ROOT/probe" \
      --unprivileged-test-mode > "$TEST_ROOT/partial-${partial_phase}-recovered.out"
  grep -F -x "BLUE_GREEN_UNCOMMITTED_PHASE_RECORD_DISCARDED=${partial_intent}.${partial_phase}.new" \
    "$TEST_ROOT/partial-${partial_phase}-recovered.out" >/dev/null
  test ! -e "${partial_intent}.${partial_phase}.new"
  test ! -e "$partial_intent"
  test -f "${partial_intent%.intent}.recovered"
  test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
done

# A crash-recovery intent (written before the link effect) is independently
# sufficient to restore the exact previous target.
intent="$(write_fixture_intent 20010101T000000000000001Z \
  "$config_root/upstreams/legacy-safe.conf" "$config_root/upstreams/blue.conf")"
ln -s "$config_root/upstreams/blue.conf" "$config_root/active-upstreams.conf.next"
mv -Tf "$config_root/active-upstreams.conf.next" "$config_root/active-upstreams.conf"
PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  /usr/bin/bash -p "$CUTOVER" recover-pending \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --legacy-rollback-probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/intent-rollback.out"
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
recovered_intent="${intent%.intent}.recovered"
test -f "$recovered_intent"

# Loss of external visibility is fail-closed, but only after the exact previous
# link has been restored and gracefully reloaded.
intent="$(write_fixture_intent 20010101T000000000000002Z \
  "$config_root/upstreams/legacy-safe.conf" "$config_root/upstreams/blue.conf")"
ln -s "$config_root/upstreams/blue.conf" "$config_root/active-upstreams.conf.next"
mv -Tf "$config_root/active-upstreams.conf.next" "$config_root/active-upstreams.conf"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" TEST_FAIL_ROLLBACK_SMOKE=true \
  /usr/bin/bash -p "$CUTOVER" rollback --receipt "$intent" \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --legacy-rollback-probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/rollback-smoke-rejected.out" 2>&1; then
  printf 'rollback without public serving evidence was unexpectedly accepted\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
grep -F -x 'BLUE_GREEN_ROLLBACK_SERVING_CONFIRMED=false' "$TEST_ROOT/rollback-smoke-rejected.out" >/dev/null
mv "$intent" "${intent%.intent}.rollback-evidence-unconfirmed"

# A canonical filename with an extra/reordered journal key must be rejected
# before any route or recovery effect. Filename shape alone is not authority.
malformed_intent="$(write_fixture_intent 20010101T000000000000003Z \
  "$config_root/upstreams/legacy-safe.conf" "$config_root/upstreams/blue.conf")"
printf 'EXTRA_KEY=forbidden\n' >> "$malformed_intent"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  /usr/bin/bash -p "$CUTOVER" recover-pending \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --legacy-rollback-probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/malformed-intent-rejected.out" 2>&1; then
  printf 'noncanonical intent journal schema was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'rollback record filename or schema is not exact and canonical' \
  "$TEST_ROOT/malformed-intent-rejected.out" >/dev/null
mv "$malformed_intent" "${malformed_intent%.intent}.rejected"

# Receipt targets outside config_root/upstreams are rejected even when their
# files and digests are otherwise valid.
outside_target="$TEST_ROOT/outside.conf"
printf 'outside\n' > "$outside_target"
unsafe_intent="$(write_fixture_intent 20010101T000000000000004Z \
  "$outside_target" "$config_root/upstreams/blue.conf")"
ln -s "$config_root/upstreams/blue.conf" "$config_root/active-upstreams.conf.next"
mv -Tf "$config_root/active-upstreams.conf.next" "$config_root/active-upstreams.conf"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  /usr/bin/bash -p "$CUTOVER" rollback --receipt "$unsafe_intent" \
    --config-root "$config_root" --state-root "$state_root" --probe "$TEST_ROOT/probe" \
    --legacy-rollback-probe "$TEST_ROOT/probe" \
    --unprivileged-test-mode > "$TEST_ROOT/unsafe-target-rejected.out" 2>&1; then
  printf 'rollback accepted an upstream target outside the reviewed root\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/blue.conf"
ln -s "$config_root/upstreams/legacy-safe.conf" "$config_root/active-upstreams.conf.next"
mv -Tf "$config_root/active-upstreams.conf.next" "$config_root/active-upstreams.conf"
mv "$unsafe_intent" "${unsafe_intent%.intent}.rejected"

# A broken nginx slot must never replace the legacy target.
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  TEST_NGINX_FAIL=true \
  /usr/bin/bash -p "$CUTOVER" switch --slot green "${common_arguments[@]}" > "$TEST_ROOT/nginx-rejected.out" 2>&1; then
  printf 'invalid nginx candidate was unexpectedly accepted\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
test -n "$(find "$state_root" -maxdepth 1 -type f -name "*-g*-${RELEASE_SHA}-green.recovered" -print -quit)"

# A root-owned but unreviewed upstream byte is rejected before an intent or
# routing effect; runtime health cannot substitute for pinned nginx topology.
printf 'forged-green\n' > "$config_root/upstreams/green.conf"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  /usr/bin/bash -p "$CUTOVER" switch --slot green "${common_arguments[@]}" > "$TEST_ROOT/nginx-byte-drift.out" 2>&1; then
  printf 'unreviewed nginx candidate byte was unexpectedly accepted\n' >&2
  exit 1
fi
grep -F 'candidate nginx target byte/identity differs from the pinned template' \
  "$TEST_ROOT/nginx-byte-drift.out" >/dev/null
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
cp "$DEPLOY_ROOT/nginx/green.conf.example" "$config_root/upstreams/green.conf"

# A public watchdog failure after reload must gracefully restore legacy.
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" TEST_FAIL_PUBLIC=true \
  /usr/bin/bash -p "$CUTOVER" switch --slot green "${common_arguments[@]}" > "$TEST_ROOT/watchdog-rejected.out" 2>&1; then
  printf 'failed public watchdog was unexpectedly accepted\n' >&2
  exit 1
fi
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"

# A candidate that passes static public health but fails its authenticated
# scoped reads during the watchdog is restored before acceptance.
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  TEST_AUTH_SMOKE_FAIL_PUBLIC=true \
  /usr/bin/bash -p "$CUTOVER" switch --slot green "${common_arguments[@]}" > "$TEST_ROOT/authenticated-watchdog-rejected.out" 2>&1; then
  printf 'watchdog accepted broken authenticated critical reads\n' >&2
  exit 1
fi
grep -F 'public watchdog failed' "$TEST_ROOT/authenticated-watchdog-rejected.out" >/dev/null
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"

# Readiness and authenticated smoke share one absolute watchdog deadline; two
# individually successful slow probes cannot consume the budget twice.
watchdog_deadline_started=$SECONDS
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  TEST_PROBE_DELAY_SECONDS=4 TEST_AUTH_DELAY_SECONDS=4 \
  /usr/bin/bash -p "$CUTOVER" switch --slot green "${common_arguments[@]}" \
  > "$TEST_ROOT/watchdog-shared-deadline.out" 2>&1; then
  printf 'watchdog accepted sequential probes beyond its one absolute deadline\n' >&2
  exit 1
fi
((SECONDS - watchdog_deadline_started < 9)) \
  || { printf 'watchdog sequential probe chain exceeded its bounded deadline\n' >&2; exit 1; }
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"

# A post-reload unit restart/effective-generation change is also a watchdog
# failure even when all HTTP probes remain green.
unit_drift_marker="$TEST_ROOT/unit-drift-after-reload.marker"
rm -f -- "$unit_drift_marker"
if PATH="$bin_root:$PATH" TEST_COMMAND_LOG="$command_log" TEST_ACTIVE_LINK="$config_root/active-upstreams.conf" \
  TEST_DRIFT_ON_RELOAD=true TEST_UNIT_DRIFT_MARKER="$unit_drift_marker" \
  /usr/bin/bash -p "$CUTOVER" switch --slot green "${common_arguments[@]}" > "$TEST_ROOT/unit-drift-watchdog.out" 2>&1; then
  printf 'watchdog accepted a changed candidate systemd invocation\n' >&2
  exit 1
fi
grep -F 'restarted during watchdog' "$TEST_ROOT/unit-drift-watchdog.out" >/dev/null
test "$(realpath -e -- "$config_root/active-upstreams.conf")" = "$config_root/upstreams/legacy-safe.conf"
rm -f -- "$unit_drift_marker"

grep -F "PATH='/usr/sbin:/usr/bin:/sbin:/bin'" "$CUTOVER" >/dev/null
grep -F "public API URL must be pinned to https://api.leetplus.ru" "$CUTOVER" >/dev/null
grep -F 'sync -f "$intent_path"' "$CUTOVER" >/dev/null
grep -F 'candidate full nginx configuration failed private-namespace validation' "$CUTOVER" >/dev/null
grep -F 'cutover_exit_guard' "$CUTOVER" >/dev/null
grep -F 'recover-pending' "$CUTOVER" >/dev/null
grep -F "state root mode must be 0700" "$CUTOVER" >/dev/null
grep -F "outside the reviewed upstream root" "$CUTOVER" >/dev/null
grep -F "production release root must be an exact reviewed release/promotions root" "$SEALER" >/dev/null
grep -F "production slot root cannot be overridden" "$PREFLIGHT" >/dev/null
if grep -E 'systemctl (stop|restart|disable)' "$command_log" >/dev/null; then
  printf 'blue/green lifecycle attempted to stop or restart an old process\n' >&2
  exit 1
fi

printf 'production artifact blue/green test: PASS\n'
