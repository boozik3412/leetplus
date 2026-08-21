#!/usr/bin/env bash
# Privileged only on an ephemeral GitHub runner. Proves the production-mode
# ExecStartPre EUID/readability contract and parses the exact systemd units.

set -euo pipefail
IFS=$'\n\t'
umask 0027

readonly LEGACY_SHA='7de04ff4ccc814494810730be3fa6bf661097b07'
readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly DEPLOY_ROOT="${REPOSITORY_ROOT}/docs/deployment/production-artifact"
readonly RELEASE_ROOT='/srv/leetplus/rollback-releases'
readonly RELEASE_DIRECTORY="${RELEASE_ROOT}/${LEGACY_SHA}"
readonly LEETPLUS_ETC='/etc/leetplus'
readonly INSTALLED_PREFLIGHT='/usr/local/libexec/leetplus/preflight-legacy-rollback.sh'
readonly WEB_CACHE='/var/cache/leetplus-web-nminus1'
readonly NESTED_MOUNT_SOURCE='/run/leetplus-legacy-nested-source'
cleanup_armed=false
node_fixture_root=''
replaced_system_node=false
original_system_node_present=false

die() {
  printf 'legacy rollback service-user fixture: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  set +e
  if [[ "$replaced_system_node" == true ]]; then
    rm -f -- /usr/bin/node
    if [[ "$original_system_node_present" == true ]]; then
      mv -- "$node_fixture_root/system-node.original" /usr/bin/node
    fi
  fi
  if [[ -n "$node_fixture_root" ]]; then
    case "$node_fixture_root" in
      /tmp/leetplus-legacy-service-user.*) rm -rf -- "$node_fixture_root" ;;
      *) printf 'refusing unsafe Node fixture cleanup: %s\n' "$node_fixture_root" >&2 ;;
    esac
  fi
  [[ "$cleanup_armed" == true ]] || return 0
  if [[ -f "${RELEASE_DIRECTORY}/.ci-legacy-rollback-fixture" \
    && "$(realpath -m -- "$RELEASE_DIRECTORY")" == "/srv/leetplus/rollback-releases/${LEGACY_SHA}" ]]; then
    find -P "$RELEASE_DIRECTORY" -depth -mindepth 1 -delete
    rmdir "$RELEASE_DIRECTORY"
    rmdir "$RELEASE_ROOT" 2>/dev/null
    rmdir /srv/leetplus 2>/dev/null
  fi
  if [[ -f "${LEETPLUS_ETC}/.ci-legacy-rollback-fixture" ]]; then
    find -P "$LEETPLUS_ETC" -maxdepth 2 -type f -delete
    find -P "$LEETPLUS_ETC" -depth -mindepth 1 -type d -empty -delete
    rmdir "$LEETPLUS_ETC" 2>/dev/null
  fi
  if [[ -f /usr/local/libexec/leetplus/.ci-legacy-rollback-fixture ]]; then
    find -P /usr/local/libexec/leetplus -maxdepth 1 -type f -delete
    rmdir /usr/local/libexec/leetplus 2>/dev/null
    rmdir /usr/local/libexec 2>/dev/null
  fi
  if [[ -f "${WEB_CACHE}/.ci-legacy-rollback-fixture" ]]; then
    find -P "$WEB_CACHE" -depth -mindepth 1 -delete
    rmdir "$WEB_CACHE" 2>/dev/null
  fi
  if [[ -f "${NESTED_MOUNT_SOURCE}/.ci-legacy-rollback-fixture" ]]; then
    find -P "$NESTED_MOUNT_SOURCE" -depth -mindepth 1 -delete
    rmdir "$NESTED_MOUNT_SOURCE" 2>/dev/null
  fi
  rm -f /tmp/leetplus-legacy-child-fixture.mjs
  userdel leetplus-api-nminus1 2>/dev/null
  userdel leetplus-web-nminus1 2>/dev/null
  groupdel leetplus-api-runtime 2>/dev/null
  groupdel leetplus-web-runtime 2>/dev/null
  groupdel leetplus-runtime 2>/dev/null
}
trap cleanup EXIT

((EUID == 0)) || die 'fixture must run through sudo'
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true ]] \
  || die 'fixture is restricted to an ephemeral GitHub Actions runner'
for command_name in curl env find groupadd groupdel ip mount nft node realpath runuser sha256sum systemd-analyze unshare useradd userdel; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done

for identity in leetplus-runtime leetplus-api-runtime leetplus-web-runtime leetplus-api-nminus1 leetplus-web-nminus1; do
  ! getent group "$identity" >/dev/null 2>&1 || die "fixture identity already exists: ${identity}"
  ! getent passwd "$identity" >/dev/null 2>&1 || die "fixture identity already exists: ${identity}"
done
for exact_path in /srv/leetplus "$LEETPLUS_ETC" /usr/local/libexec/leetplus "$WEB_CACHE" "$NESTED_MOUNT_SOURCE"; do
  [[ ! -e "$exact_path" && ! -L "$exact_path" ]] || die "fixture path already exists: ${exact_path}"
done

node_fixture_root="$(mktemp -d /tmp/leetplus-legacy-service-user.XXXXXXXX)"
fixture_node_binary="$(realpath -e -- "$(command -v node)")"
[[ -f "$fixture_node_binary" && ! -L "$fixture_node_binary" && -x "$fixture_node_binary" \
  && "$($fixture_node_binary -p 'process.versions.node.split(".")[0]')" == '22' ]] \
  || die 'fixture authority Node is not an exact regular Node 22 binary'
if [[ ! -f /usr/bin/node || -L /usr/bin/node \
  || "$(stat -c '%u:%g' -- /usr/bin/node 2>/dev/null || true)" != '0:0' \
  || "$(/usr/bin/node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)" != '22' ]]; then
  if [[ -e /usr/bin/node || -L /usr/bin/node ]]; then
    mv -- /usr/bin/node "$node_fixture_root/system-node.original"
    original_system_node_present=true
  fi
  replaced_system_node=true
  install -o root -g root -m 0755 "$fixture_node_binary" /usr/bin/node
fi
[[ -f /usr/bin/node && ! -L /usr/bin/node \
  && "$(stat -c '%u:%g' -- /usr/bin/node)" == '0:0' \
  && "$(/usr/bin/node -p 'process.versions.node.split(".")[0]')" == '22' ]] \
  || die 'fixture could not provision exact root-owned /usr/bin/node major 22'

cleanup_armed=true
groupadd --system leetplus-runtime
groupadd --system leetplus-api-runtime
groupadd --system leetplus-web-runtime
useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin \
  --gid leetplus-runtime --groups leetplus-api-runtime leetplus-api-nminus1
useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin \
  --gid leetplus-runtime --groups leetplus-web-runtime leetplus-web-nminus1

install -d -o root -g leetplus-runtime -m 0750 "$RELEASE_ROOT"
install -d -o root -g leetplus-runtime -m 0550 \
  "$RELEASE_DIRECTORY" \
  "$RELEASE_DIRECTORY/apps" \
  "$RELEASE_DIRECTORY/apps/api" \
  "$RELEASE_DIRECTORY/apps/api/dist" \
  "$RELEASE_DIRECTORY/apps/api/dist/nested-mount-target" \
  "$RELEASE_DIRECTORY/apps/web" \
  "$RELEASE_DIRECTORY/apps/web/node_modules" \
  "$RELEASE_DIRECTORY/apps/web/node_modules/next" \
  "$RELEASE_DIRECTORY/apps/web/node_modules/next/dist" \
  "$RELEASE_DIRECTORY/apps/web/node_modules/next/dist/bin" \
  "$RELEASE_DIRECTORY/apps/web/.next" \
  "$RELEASE_DIRECTORY/apps/web/.next/cache"
printf '%s\n' "$LEGACY_SHA" > "$RELEASE_DIRECTORY/.leetplus-source-sha"
printf 'fixture\n' > "$RELEASE_DIRECTORY/.ci-legacy-rollback-fixture"
printf 'api\n' > "$RELEASE_DIRECTORY/apps/api/dist/main.js"
printf 'next\n' > "$RELEASE_DIRECTORY/apps/web/node_modules/next/dist/bin/next"
printf 'legacy-build\n' > "$RELEASE_DIRECTORY/apps/web/.next/BUILD_ID"
: > "$RELEASE_DIRECTORY/N_MINUS_ONE_SYMLINKS"
(
  cd -- "$RELEASE_DIRECTORY"
  find . -type f ! -path './N_MINUS_ONE_SHA256SUMS' -print0 \
    | LC_ALL=C sort -z | xargs -0 sha256sum > N_MINUS_ONE_SHA256SUMS
)
chown -R root:leetplus-runtime "$RELEASE_DIRECTORY"
find -P "$RELEASE_DIRECTORY" -type d -exec chmod 0550 {} +
find -P "$RELEASE_DIRECTORY" -type f -exec chmod 0440 {} +

install -d -o leetplus-web-nminus1 -g leetplus-runtime -m 0750 "$WEB_CACHE"
printf 'fixture\n' > "${WEB_CACHE}/.ci-legacy-rollback-fixture"
chown leetplus-web-nminus1:leetplus-runtime "${WEB_CACHE}/.ci-legacy-rollback-fixture"
chmod 0640 "${WEB_CACHE}/.ci-legacy-rollback-fixture"
install -d -o root -g root -m 0700 "$NESTED_MOUNT_SOURCE"
printf 'fixture\n' > "${NESTED_MOUNT_SOURCE}/.ci-legacy-rollback-fixture"
chmod 0600 "${NESTED_MOUNT_SOURCE}/.ci-legacy-rollback-fixture"

install -d -o root -g root -m 0755 "$LEETPLUS_ETC" "${LEETPLUS_ETC}/rollback-releases"
printf 'fixture\n' > "${LEETPLUS_ETC}/.ci-legacy-rollback-fixture"
install -o root -g leetplus-runtime -m 0440 \
  "${DEPLOY_ROOT}/systemd/legacy-rollback-safe.env.example" \
  "${LEETPLUS_ETC}/rollback-safe.env"
install -o root -g leetplus-runtime -m 0440 \
  "${DEPLOY_ROOT}/systemd/legacy-rollback-7de04ff4.env.example" \
  "${LEETPLUS_ETC}/rollback-releases/${LEGACY_SHA}.env"
printf '%s\n' \
  'NODE_ENV=production' \
  'JWT_SECRET=fixture-only-strong-jwt-secret-00000000000000000000000000000000' \
  'DATABASE_URL=postgresql://leetplus_legacy_rollback:fixture@127.0.0.1:5432/leetplus?schema=public&options=-c%20role%3Dleetplus&application_name=leetplus-nminus1-http-7de04ff4' \
  > "${LEETPLUS_ETC}/rollback-runtime.env"
chown root:leetplus-api-runtime "${LEETPLUS_ETC}/rollback-runtime.env"
chmod 0640 "${LEETPLUS_ETC}/rollback-runtime.env"
printf 'NODE_ENV=production\n' > "${LEETPLUS_ETC}/rollback-web-runtime.env"
chown root:leetplus-web-runtime "${LEETPLUS_ETC}/rollback-web-runtime.env"
chmod 0640 "${LEETPLUS_ETC}/rollback-web-runtime.env"

install -d -o root -g root -m 0755 /usr/local/libexec/leetplus
printf 'fixture\n' > /usr/local/libexec/leetplus/.ci-legacy-rollback-fixture
install -o root -g root -m 0755 \
  "${DEPLOY_ROOT}/preflight-legacy-rollback.sh" "$INSTALLED_PREFLIGHT"
install -o root -g root -m 0755 \
  "${DEPLOY_ROOT}/legacy-rollback-auth-edge.mjs" /usr/local/libexec/leetplus/legacy-rollback-auth-edge.mjs
install -o root -g root -m 0444 \
  "${DEPLOY_ROOT}/legacy-rollback-child-loopback.cjs" /usr/local/libexec/leetplus/legacy-rollback-child-loopback.cjs
install -o root -g root -m 0755 \
  "${DEPLOY_ROOT}/apply-legacy-rollback-egress.sh" /usr/local/libexec/leetplus/apply-legacy-rollback-egress.sh

declare -a safe_environment_arguments=()
while IFS= read -r assignment; do
  [[ "$assignment" =~ ^[A-Z][A-Z0-9_]*=[^[:space:]]+$ ]] || continue
  safe_environment_arguments+=("$assignment")
done < "${LEETPLUS_ETC}/rollback-safe.env"

common_environment=(
  PATH=/usr/sbin:/usr/bin:/sbin:/bin
  NODE_ENV=production
  RELEASE_SHA="$LEGACY_SHA"
  PORT=4300
  API_BIND_HOST=127.0.0.1
  WEB_PORT=3300
  API_URL=http://127.0.0.1:4300
  LEGACY_ROLLBACK_DATABASE_SESSION_ROLE=leetplus_legacy_rollback
  LEGACY_ROLLBACK_DATABASE_APPLICATION_NAME=leetplus-nminus1-http-7de04ff4
)

runuser -u leetplus-api-nminus1 -- env -i \
  "${common_environment[@]}" "${safe_environment_arguments[@]}" \
  'JWT_SECRET=fixture-only-strong-jwt-secret-00000000000000000000000000000000' \
  'DATABASE_URL=postgresql://leetplus_legacy_rollback:fixture@127.0.0.1:5432/leetplus?schema=public&options=-c%20role%3Dleetplus&application_name=leetplus-nminus1-http-7de04ff4' \
  /usr/bin/bash -p "$INSTALLED_PREFLIGHT" --release-sha "$LEGACY_SHA" --api-runtime \
  > /tmp/leetplus-legacy-api-preflight.out
grep -F -x 'LEGACY_ROLLBACK_PREFLIGHT_RUNTIME=api' /tmp/leetplus-legacy-api-preflight.out >/dev/null

export LEETPLUS_FIXTURE_COMMON="$(printf '%q ' "${common_environment[@]}")"
export LEETPLUS_FIXTURE_SAFE="$(printf '%q ' "${safe_environment_arguments[@]}")"
unshare --mount --propagation private /usr/bin/bash -p -eu -c '
  mount --bind -- "$1" "$2"
  exec runuser -u leetplus-web-nminus1 -- env -i \
    ${LEETPLUS_FIXTURE_COMMON} ${LEETPLUS_FIXTURE_SAFE} \
    /usr/bin/bash -p "$3" --release-sha "$4" --web-runtime
' leetplus-web-preflight "$WEB_CACHE" "$RELEASE_DIRECTORY/apps/web/.next/cache" \
  "$INSTALLED_PREFLIGHT" "$LEGACY_SHA" > /tmp/leetplus-legacy-web-preflight.out
grep -F -x 'LEGACY_ROLLBACK_PREFLIGHT_RUNTIME=web' /tmp/leetplus-legacy-web-preflight.out >/dev/null

# Wrong group makes the direct service-user read fail closed. Prove that
# precondition explicitly, then require the earliest content-integrity guard to
# reject the unreadable overlay. Restore it only after the negative assertion
# so the cleanup and systemd parser can proceed.
chown root:root "${LEETPLUS_ETC}/rollback-safe.env"
if runuser -u leetplus-api-nminus1 -- \
  /usr/bin/test -r "${LEETPLUS_ETC}/rollback-safe.env"; then
  die 'wrong-group final overlay remained readable by the service identity'
fi
if runuser -u leetplus-api-nminus1 -- env -i \
  "${common_environment[@]}" "${safe_environment_arguments[@]}" \
  'JWT_SECRET=fixture-only-strong-jwt-secret-00000000000000000000000000000000' \
  'DATABASE_URL=postgresql://leetplus_legacy_rollback:fixture@127.0.0.1:5432/leetplus?schema=public&options=-c%20role%3Dleetplus&application_name=leetplus-nminus1-http-7de04ff4' \
  /usr/bin/bash -p "$INSTALLED_PREFLIGHT" --release-sha "$LEGACY_SHA" --api-runtime \
  >/tmp/leetplus-legacy-unreadable-preflight.out 2>&1; then
  die 'service-user preflight accepted an unreadable final overlay'
fi
grep -F 'final safety overlay does not match the exact complete deny schema' \
  /tmp/leetplus-legacy-unreadable-preflight.out >/dev/null \
  || die 'unreadable-overlay negative failed for a different invariant'
chown root:leetplus-runtime "${LEETPLUS_ETC}/rollback-safe.env"

# Every artifact entry must remain root-owned outside the exact Web cache bind.
chown leetplus-api-nminus1:leetplus-runtime "$RELEASE_DIRECTORY/apps/api/dist/main.js"
if runuser -u leetplus-api-nminus1 -- env -i \
  "${common_environment[@]}" "${safe_environment_arguments[@]}" \
  'JWT_SECRET=fixture-only-strong-jwt-secret-00000000000000000000000000000000' \
  'DATABASE_URL=postgresql://leetplus_legacy_rollback:fixture@127.0.0.1:5432/leetplus?schema=public&options=-c%20role%3Dleetplus&application_name=leetplus-nminus1-http-7de04ff4' \
  /usr/bin/bash -p "$INSTALLED_PREFLIGHT" --release-sha "$LEGACY_SHA" --api-runtime \
  >/tmp/leetplus-legacy-owner-preflight.out 2>&1; then
  die 'service-user preflight accepted a non-root-owned artifact entry'
fi
grep -F 'rollback release contains an entry outside root:leetplus-runtime ownership' \
  /tmp/leetplus-legacy-owner-preflight.out >/dev/null \
  || die 'artifact-owner negative failed for a different invariant'
chown root:leetplus-runtime "$RELEASE_DIRECTORY/apps/api/dist/main.js"

# A second/nested artifact mount is forbidden even when its bytes are benign.
if unshare --mount --propagation private /usr/bin/bash -p -eu -c '
  mount --bind -- "$1" "$2"
  exec runuser -u leetplus-api-nminus1 -- env -i \
    ${LEETPLUS_FIXTURE_COMMON} ${LEETPLUS_FIXTURE_SAFE} \
    JWT_SECRET=fixture-only-strong-jwt-secret-00000000000000000000000000000000 \
    DATABASE_URL="$3" /usr/bin/bash -p "$4" --release-sha "$5" --api-runtime
' leetplus-api-nested "$NESTED_MOUNT_SOURCE" "$RELEASE_DIRECTORY/apps/api/dist/nested-mount-target" \
  'postgresql://leetplus_legacy_rollback:fixture@127.0.0.1:5432/leetplus?schema=public&options=-c%20role%3Dleetplus&application_name=leetplus-nminus1-http-7de04ff4' \
  "$INSTALLED_PREFLIGHT" "$LEGACY_SHA" >/tmp/leetplus-legacy-nested-preflight.out 2>&1; then
  die 'service-user preflight accepted an unreviewed nested mount'
fi
grep -F 'rollback release contains an unreviewed nested mount' \
  /tmp/leetplus-legacy-nested-preflight.out >/dev/null \
  || die 'nested-mount negative failed for a different invariant'

systemd-analyze verify \
  "${DEPLOY_ROOT}/systemd/leetplus-api-rollback@.service" \
  "${DEPLOY_ROOT}/systemd/leetplus-web-rollback@.service" \
  "${DEPLOY_ROOT}/systemd/leetplus-rollback-egress.service"

# The exact nft transaction lives in a private network namespace. The auth-edge
# service UID can reach its 4301 child, while Web and even root are rejected by
# the immediately following global loopback rule.
node_binary="$(realpath "$(command -v node)")"
cat > /tmp/leetplus-legacy-child-fixture.mjs <<'EDGE_CHILD'
import { createServer } from "node:http";
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end('{"ok":true}');
});
server.listen(4301, "127.0.0.1");
process.on("SIGTERM", () => server.close(() => process.exit(0)));
EDGE_CHILD
chmod 0644 /tmp/leetplus-legacy-child-fixture.mjs
unshare --net /usr/bin/bash -p -eu -o pipefail -c '
  api_user="$1"
  web_user="$2"
  node_binary="$3"
  edge_server="$4"
  egress="$5"
  ip link set lo up
  cleanup_namespace() {
    nft delete table inet leetplus_nminus1 >/dev/null 2>&1 || true
    [[ -z "${server_pid:-}" ]] || { kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; }
  }
  trap cleanup_namespace EXIT
  runuser -u "$api_user" -- env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    "$node_binary" "$edge_server" &
  server_pid=$!
  for _ in {1..100}; do
    runuser -u "$api_user" -- curl --disable --noproxy "*" --silent --fail \
      --connect-timeout 1 --max-time 1 http://127.0.0.1:4301/health >/dev/null 2>&1 && break
    sleep 0.05
  done
  runuser -u "$api_user" -- curl --disable --noproxy "*" --silent --fail \
    --connect-timeout 1 --max-time 1 http://127.0.0.1:4301/health >/dev/null
  /usr/bin/bash -p "$egress" >/dev/null
  runuser -u "$api_user" -- curl --disable --noproxy "*" --silent --fail \
    --connect-timeout 1 --max-time 1 http://127.0.0.1:4301/health >/dev/null
  if runuser -u "$web_user" -- curl --disable --noproxy "*" --silent --fail \
    --connect-timeout 1 --max-time 1 http://127.0.0.1:4301/health >/dev/null 2>&1; then
    printf "Web UID reached the protected legacy child port\n" >&2
    exit 1
  fi
  if curl --disable --noproxy "*" --silent --fail --connect-timeout 1 --max-time 1 \
    http://127.0.0.1:4301/health >/dev/null 2>&1; then
    printf "foreign/root UID reached the protected legacy child port\n" >&2
    exit 1
  fi
' leetplus-egress-netns leetplus-api-nminus1 leetplus-web-nminus1 "$node_binary" \
  /tmp/leetplus-legacy-child-fixture.mjs "${DEPLOY_ROOT}/apply-legacy-rollback-egress.sh"

rm -f /tmp/leetplus-legacy-api-preflight.out \
  /tmp/leetplus-legacy-web-preflight.out \
  /tmp/leetplus-legacy-unreadable-preflight.out \
  /tmp/leetplus-legacy-owner-preflight.out \
  /tmp/leetplus-legacy-nested-preflight.out \
  /tmp/leetplus-legacy-child-fixture.mjs
printf 'production legacy rollback service-user fixture: PASS\n'
