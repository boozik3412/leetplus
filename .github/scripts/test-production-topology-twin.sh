#!/usr/bin/bash -p

[[ $- == *p* ]] || {
  printf 'production topology twin: privileged Bash mode (-p) is required\n' >&2
  exit 1
}

TWIN_BOOTSTRAP_CONFIRM="${PRODUCTION_TOPOLOGY_TWIN_CONFIRM:-}"
TWIN_BOOTSTRAP_NODE_SOURCE="${LEETPLUS_TWIN_NODE_SOURCE:-}"
TWIN_BOOTSTRAP_CI="${CI:-}"
TWIN_BOOTSTRAP_GITHUB_ACTIONS="${GITHUB_ACTIONS:-}"
while IFS= read -r TWIN_INHERITED_NAME; do
  unset "$TWIN_INHERITED_NAME" 2>/dev/null || true
done < <(compgen -e)
unset TWIN_INHERITED_NAME
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C.UTF-8'
LC_ALL='C.UTF-8'
TZ='UTC'
export PATH LANG LC_ALL TZ

set -Eeuo pipefail
IFS=$'\n\t'
umask 0077

readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly CONTRACT_VERIFIER="${REPOSITORY_ROOT}/docs/deployment/production-artifact/verify-production-topology-contract.mjs"
readonly API_TEMPLATE="${REPOSITORY_ROOT}/docs/deployment/production-artifact/systemd/leetplus-api@.service"
readonly WEB_TEMPLATE="${REPOSITORY_ROOT}/docs/deployment/production-artifact/systemd/leetplus-web@.service"
readonly LISTENER_SOURCE="${REPOSITORY_ROOT}/.github/scripts/production-topology-twin-listener.mjs"
readonly FIXED_NODE='/usr/local/libexec/leetplus/production-topology-twin-node22'
readonly FIXED_LISTENER='/usr/local/libexec/leetplus/production-topology-twin-listener.mjs'
readonly API_UNIT_PATH='/run/systemd/system/leetplus-api@.service'
readonly WEB_UNIT_PATH='/run/systemd/system/leetplus-web@.service'
readonly API_DROPIN_ROOT='/run/systemd/system/leetplus-api@.service.d'
readonly WEB_DROPIN_ROOT='/run/systemd/system/leetplus-web@.service.d'
readonly REHEARSAL_UNIT='leetplus-topology-rehearsal-twin.service'
readonly RELEASE_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly -a SLOT_UNITS=(
  leetplus-api@blue.service
  leetplus-web@blue.service
  leetplus-api@green.service
  leetplus-web@green.service
)
readonly -a RUNTIME_USERS=(
  leetplus-api-blue
  leetplus-api-green
  leetplus-api-nminus1
  leetplus-web-blue
  leetplus-web-green
  leetplus-web-nminus1
)
readonly -a RUNTIME_GROUPS=(leetplus-api-runtime leetplus-web-runtime leetplus-runtime)

die() {
  printf 'production topology twin: %s\n' "$*" >&2
  exit 1
}

[[ "${TWIN_BOOTSTRAP_CI}" == true && "${TWIN_BOOTSTRAP_GITHUB_ACTIONS}" == true ]] \
  || die 'fixture is restricted to GitHub Actions CI'
[[ "${TWIN_BOOTSTRAP_CONFIRM}" == 'run-root-production-topology-twin-v1' ]] \
  || die 'exact fixture confirmation is absent'
[[ "${1:-}" == '--live-fixture' && "$#" == 1 ]] \
  || die 'fixture accepts only --live-fixture'
[[ "$(uname -s)" == Linux && EUID -eq 0 ]] || die 'fixture is Linux/root-only'
[[ -d /run/systemd/system ]] || die 'a real systemd manager is required'
[[ -f "$CONTRACT_VERIFIER" && ! -L "$CONTRACT_VERIFIER" \
  && -f "$API_TEMPLATE" && ! -L "$API_TEMPLATE" \
  && -f "$WEB_TEMPLATE" && ! -L "$WEB_TEMPLATE" \
  && -f "$LISTENER_SOURCE" && ! -L "$LISTENER_SOURCE" ]] \
  || die 'repository topology inputs are absent or unsafe'

node_source="$(realpath -e -- "$TWIN_BOOTSTRAP_NODE_SOURCE")" \
  || die 'fixture Node source cannot be resolved'
[[ -f "$node_source" && ! -L "$node_source" && -x "$node_source" \
  && "$($node_source -p 'process.versions.node.split(".")[0]')" == 22 ]] \
  || die 'fixture requires an exact regular Node 22 source'
unset TWIN_BOOTSTRAP_CONFIRM TWIN_BOOTSTRAP_NODE_SOURCE TWIN_BOOTSTRAP_CI TWIN_BOOTSTRAP_GITHUB_ACTIONS

for command_path in \
  /usr/bin/curl /usr/bin/find /usr/bin/getent /usr/bin/grep /usr/bin/id \
  /usr/bin/install /usr/bin/journalctl /usr/bin/realpath /usr/bin/rm \
  /usr/bin/rmdir /usr/bin/sed /usr/bin/sleep /usr/bin/sort /usr/bin/ss \
  /usr/bin/systemctl /usr/bin/systemd-run /usr/bin/test /usr/bin/tr \
  /usr/sbin/groupadd /usr/sbin/groupdel /usr/sbin/useradd /usr/sbin/userdel; do
  [[ -x "$command_path" && ! -L "$command_path" ]] \
    || die "required command is absent or unsafe: ${command_path}"
done

for identity in "${RUNTIME_USERS[@]}" leetplus-rehearsal; do
  if /usr/bin/getent passwd "$identity" >/dev/null 2>&1; then
    die "fixture user already exists: ${identity}"
  fi
done
for identity in "${RUNTIME_GROUPS[@]}" leetplus-rehearsal; do
  if /usr/bin/getent group "$identity" >/dev/null 2>&1; then
    die "fixture group already exists: ${identity}"
  fi
done
for unit in "${SLOT_UNITS[@]}"; do
  [[ "$(/usr/bin/systemctl show "$unit" --value --property=LoadState 2>/dev/null || true)" == not-found ]] \
    || die "fixture unit already exists: ${unit}"
done
for target in \
  /etc/leetplus /srv/leetplus /var/lib/leetplus /var/log/leetplus \
  /var/cache/leetplus-web-blue /var/cache/leetplus-web-green \
  "$FIXED_NODE" "$FIXED_LISTENER" "$API_UNIT_PATH" "$WEB_UNIT_PATH" \
  "$API_DROPIN_ROOT" "$WEB_DROPIN_ROOT"; do
  [[ ! -e "$target" && ! -L "$target" ]] || die "fixture target already exists: ${target}"
done

libexec_parent_preexisting=false
[[ -d /usr/local/libexec/leetplus ]] && libexec_parent_preexisting=true

remove_fixture_tree() {
  local target="$1"
  case "$target" in
    /etc/leetplus|/srv/leetplus|/var/lib/leetplus|/var/log/leetplus|\
    /var/cache/leetplus-web-blue|/var/cache/leetplus-web-green|\
    /run/systemd/system/leetplus-api@.service.d|/run/systemd/system/leetplus-web@.service.d) ;;
    *) return 1 ;;
  esac
  if [[ -d "$target" && ! -L "$target" ]]; then
    /usr/bin/find -P "$target" -depth -mindepth 1 -delete
    /usr/bin/rmdir -- "$target"
  fi
}

cleanup() {
  local cleanup_status=$?
  local cleanup_failed=false
  trap - EXIT
  set +e
  if ((cleanup_status != 0)); then
    for unit in "${SLOT_UNITS[@]}" "$REHEARSAL_UNIT"; do
      /usr/bin/journalctl --no-pager -n 40 -u "$unit" >&2
    done
  fi
  for unit in "${SLOT_UNITS[@]}" "$REHEARSAL_UNIT"; do
    /usr/bin/systemctl stop "$unit" >/dev/null 2>&1 || true
    /usr/bin/systemctl reset-failed "$unit" >/dev/null 2>&1 || true
  done
  /usr/bin/rm -f -- /run/leetplus-topology-twin-drift.out \
    /run/leetplus-topology-twin-phase.out
  /usr/bin/rm -f -- "$API_UNIT_PATH" "$WEB_UNIT_PATH" "$FIXED_LISTENER" "$FIXED_NODE"
  remove_fixture_tree "$API_DROPIN_ROOT"
  remove_fixture_tree "$WEB_DROPIN_ROOT"
  /usr/bin/systemctl daemon-reload >/dev/null 2>&1
  if /usr/bin/getent passwd leetplus-rehearsal >/dev/null 2>&1; then
    /usr/sbin/userdel leetplus-rehearsal
  fi
  if /usr/bin/getent group leetplus-rehearsal >/dev/null 2>&1; then
    /usr/sbin/groupdel leetplus-rehearsal
  fi
  for identity in "${RUNTIME_USERS[@]}"; do
    if /usr/bin/getent passwd "$identity" >/dev/null 2>&1; then
      /usr/sbin/userdel "$identity"
    fi
  done
  for identity in "${RUNTIME_GROUPS[@]}"; do
    if /usr/bin/getent group "$identity" >/dev/null 2>&1; then
      /usr/sbin/groupdel "$identity"
    fi
  done
  remove_fixture_tree /var/cache/leetplus-web-blue
  remove_fixture_tree /var/cache/leetplus-web-green
  remove_fixture_tree /var/log/leetplus
  remove_fixture_tree /var/lib/leetplus
  remove_fixture_tree /srv/leetplus
  remove_fixture_tree /etc/leetplus
  if [[ "$libexec_parent_preexisting" == false \
    && -d /usr/local/libexec/leetplus && ! -L /usr/local/libexec/leetplus ]]; then
    /usr/bin/rmdir -- /usr/local/libexec/leetplus
  fi
  for unit in "${SLOT_UNITS[@]}" "$REHEARSAL_UNIT"; do
    if [[ "$(/usr/bin/systemctl show "$unit" --value --property=LoadState 2>/dev/null || true)" != not-found ]]; then
      printf 'production topology twin: cleanup left unit %s\n' "$unit" >&2
      cleanup_failed=true
    fi
  done
  for identity in "${RUNTIME_USERS[@]}" leetplus-rehearsal; do
    if /usr/bin/getent passwd "$identity" >/dev/null 2>&1; then
      printf 'production topology twin: cleanup left user %s\n' "$identity" >&2
      cleanup_failed=true
    fi
  done
  for identity in "${RUNTIME_GROUPS[@]}" leetplus-rehearsal; do
    if /usr/bin/getent group "$identity" >/dev/null 2>&1; then
      printf 'production topology twin: cleanup left group %s\n' "$identity" >&2
      cleanup_failed=true
    fi
  done
  for target in \
    /etc/leetplus /srv/leetplus /var/lib/leetplus /var/log/leetplus \
    /var/cache/leetplus-web-blue /var/cache/leetplus-web-green \
    "$FIXED_NODE" "$FIXED_LISTENER" "$API_UNIT_PATH" "$WEB_UNIT_PATH" \
    "$API_DROPIN_ROOT" "$WEB_DROPIN_ROOT" \
    /run/leetplus-topology-twin-drift.out /run/leetplus-topology-twin-phase.out; do
    if [[ -e "$target" || -L "$target" ]]; then
      printf 'production topology twin: cleanup left target %s\n' "$target" >&2
      cleanup_failed=true
    fi
  done
  for port in 4100 4200 3100 3200; do
    if [[ -n "$(/usr/bin/ss -H -ltn "sport = :${port}" 2>/dev/null)" ]]; then
      printf 'production topology twin: cleanup left listener on %s\n' "$port" >&2
      cleanup_failed=true
    fi
  done
  if [[ "$cleanup_failed" == true && "$cleanup_status" -eq 0 ]]; then
    cleanup_status=1
  fi
  exit "$cleanup_status"
}
trap cleanup EXIT

/usr/bin/install -d -o root -g root -m 0755 /usr/local/libexec/leetplus
/usr/bin/install -o root -g root -m 0755 "$node_source" "$FIXED_NODE"
/usr/bin/install -o root -g root -m 0755 "$LISTENER_SOURCE" "$FIXED_LISTENER"

/usr/sbin/groupadd --system leetplus-runtime
/usr/sbin/groupadd --system leetplus-api-runtime
/usr/sbin/groupadd --system leetplus-web-runtime
for slot in blue green nminus1; do
  /usr/sbin/useradd --system --gid leetplus-runtime --groups leetplus-api-runtime \
    --comment '' --home-dir /nonexistent --shell /usr/sbin/nologin --no-create-home \
    "leetplus-api-${slot}"
  /usr/sbin/useradd --system --gid leetplus-runtime --groups leetplus-web-runtime \
    --comment '' --home-dir /nonexistent --shell /usr/sbin/nologin --no-create-home \
    "leetplus-web-${slot}"
done

"$FIXED_NODE" "$CONTRACT_VERIFIER" --root "$REPOSITORY_ROOT" \
  --live-nss-phase steady-state

/usr/bin/install -d -o root -g leetplus-runtime -m 0750 /etc/leetplus
/usr/bin/install -d -o root -g leetplus-runtime -m 0750 /etc/leetplus/slots
/usr/bin/install -o root -g leetplus-api-runtime -m 0640 /dev/null /etc/leetplus/runtime.env
/usr/bin/install -o root -g leetplus-web-runtime -m 0640 /dev/null /etc/leetplus/web-runtime.env
/usr/bin/install -o root -g leetplus-runtime -m 0640 /dev/null /etc/leetplus/canary-safe.env
/usr/bin/install -o root -g leetplus-api-runtime -m 0640 /dev/null /etc/leetplus/guest-user-call-live.env
printf 'NODE_ENV=production\n' > /etc/leetplus/runtime.env
printf 'NODE_ENV=production\n' > /etc/leetplus/web-runtime.env
printf 'GUEST_BUG_REPORTING_MODE=OFF\nGUEST_SUPPORT_SCHEMA_BRIDGE_MODE=OFF\n' \
  > /etc/leetplus/canary-safe.env
printf 'GUEST_USER_CALL_MODE=OFF\n' > /etc/leetplus/guest-user-call-live.env
for slot in blue green; do
  if [[ "$slot" == blue ]]; then api_port=4100; web_port=3100; else api_port=4200; web_port=3200; fi
  /usr/bin/install -o root -g leetplus-runtime -m 0640 /dev/null "/etc/leetplus/slots/${slot}.env"
  {
    printf 'RELEASE_SHA=%s\n' "$RELEASE_SHA"
    printf 'RELEASE_SLOT=%s\n' "$slot"
    printf 'WEB_BUILD_ID=topology-twin-%s\n' "$slot"
    printf 'API_PORT=%s\n' "$api_port"
    printf 'WEB_PORT=%s\n' "$web_port"
  } > "/etc/leetplus/slots/${slot}.env"
done

/usr/bin/install -d -o root -g leetplus-runtime -m 0755 \
  /srv/leetplus /srv/leetplus/releases /srv/leetplus/slots
for slot in blue green; do
  /usr/bin/install -d -o root -g leetplus-runtime -m 0755 \
    "/srv/leetplus/slots/${slot}" \
    "/srv/leetplus/slots/${slot}/apps" \
    "/srv/leetplus/slots/${slot}/apps/web" \
    "/srv/leetplus/slots/${slot}/apps/web/.next" \
    "/srv/leetplus/slots/${slot}/apps/web/.next/cache"
done
/usr/bin/install -d -o root -g leetplus-api-runtime -m 0750 \
  /var/lib/leetplus /var/lib/leetplus/langame-sync

/usr/bin/install -o root -g root -m 0644 "$API_TEMPLATE" "$API_UNIT_PATH"
/usr/bin/install -o root -g root -m 0644 "$WEB_TEMPLATE" "$WEB_UNIT_PATH"
/usr/bin/install -d -o root -g root -m 0755 "$API_DROPIN_ROOT" "$WEB_DROPIN_ROOT"
printf '%s\n' '[Service]' 'ExecStartPre=' \
  "ExecStartPre=/usr/bin/test -x ${FIXED_LISTENER}" 'ExecStart=' \
  "ExecStart=${FIXED_NODE} ${FIXED_LISTENER} api %i" \
  > "${API_DROPIN_ROOT}/90-topology-twin.conf"
printf '%s\n' '[Service]' 'ExecStartPre=' \
  "ExecStartPre=/usr/bin/test -x ${FIXED_LISTENER}" 'ExecStart=' \
  "ExecStart=${FIXED_NODE} ${FIXED_LISTENER} web %i" \
  > "${WEB_DROPIN_ROOT}/90-topology-twin.conf"
chmod 0644 "${API_DROPIN_ROOT}/90-topology-twin.conf" \
  "${WEB_DROPIN_ROOT}/90-topology-twin.conf"

/usr/bin/systemctl daemon-reload
/usr/bin/systemctl start leetplus-api@blue.service leetplus-api@green.service
/usr/bin/systemctl start leetplus-web@blue.service leetplus-web@green.service
for port in 4100 4200 3100 3200; do
  ready=false
  for _ in {1..30}; do
    if /usr/bin/curl --fail --silent --show-error --connect-timeout 1 --max-time 2 \
      "http://127.0.0.1:${port}/health/ready" >/dev/null; then
      ready=true
      break
    fi
    /usr/bin/sleep 0.2
  done
  [[ "$ready" == true ]] || die "slot listener did not become ready on ${port}"
done
"$FIXED_NODE" "$CONTRACT_VERIFIER" --root "$REPOSITORY_ROOT" \
  --live-nss-phase steady-state --live-systemd

# Effective EnvironmentFiles drift must be caught from the live manager, not
# only from the checked-in template.
/usr/bin/install -o root -g leetplus-runtime -m 0640 /dev/null /etc/leetplus/twin-drift.env
printf 'TOPOLOGY_TWIN_DRIFT=true\n' > /etc/leetplus/twin-drift.env
printf '%s\n' '[Service]' 'EnvironmentFile=/etc/leetplus/twin-drift.env' \
  > "${API_DROPIN_ROOT}/99-topology-drift.conf"
chmod 0644 "${API_DROPIN_ROOT}/99-topology-drift.conf"
/usr/bin/systemctl daemon-reload
if "$FIXED_NODE" "$CONTRACT_VERIFIER" --root "$REPOSITORY_ROOT" \
  --live-nss-phase steady-state --live-systemd \
  > /run/leetplus-topology-twin-drift.out 2>&1; then
  die 'live systemd verifier accepted an extra API EnvironmentFile'
fi
/usr/bin/grep -F 'EnvironmentFiles must be exactly' \
  /run/leetplus-topology-twin-drift.out >/dev/null \
  || die 'live systemd drift rejection was not specific'
/usr/bin/rm -f -- "${API_DROPIN_ROOT}/99-topology-drift.conf" \
  /etc/leetplus/twin-drift.env /run/leetplus-topology-twin-drift.out
/usr/bin/systemctl daemon-reload
"$FIXED_NODE" "$CONTRACT_VERIFIER" --root "$REPOSITORY_ROOT" \
  --live-nss-phase steady-state --live-systemd

# Restored-copy acceptance temporarily needs artifact-read membership. The
# steady-state/cutover contract must reject that phase until exact cleanup.
/usr/sbin/groupadd --system leetplus-rehearsal
/usr/sbin/useradd --system --gid leetplus-rehearsal --groups leetplus-runtime \
  --comment '' --home-dir /nonexistent --shell /usr/sbin/nologin --no-create-home \
  leetplus-rehearsal
if "$FIXED_NODE" "$CONTRACT_VERIFIER" --root "$REPOSITORY_ROOT" \
  --live-nss-phase steady-state > /run/leetplus-topology-twin-phase.out 2>&1; then
  die 'steady-state verifier accepted the active restored-copy identity'
fi
/usr/bin/grep -F 'leetplus-runtime.liveExplicitMembers must be exactly' \
  /run/leetplus-topology-twin-phase.out >/dev/null \
  || die 'transient rehearsal rejection was not specific'
"$FIXED_NODE" "$CONTRACT_VERIFIER" --root "$REPOSITORY_ROOT" \
  --live-nss-phase restored-copy-acceptance
rehearsal_groups="$(/usr/bin/systemd-run --quiet --wait --collect --pipe \
  --unit "$REHEARSAL_UNIT" --property=Type=oneshot \
  --property=User=leetplus-rehearsal --property=Group=leetplus-rehearsal \
  --property=SupplementaryGroups=leetplus-runtime /usr/bin/id -nG)"
normalized_rehearsal_groups="$(printf '%s\n' "$rehearsal_groups" \
  | /usr/bin/tr ' ' '\n' | /usr/bin/sort | /usr/bin/tr '\n' ' ' \
  | /usr/bin/sed 's/ $//')"
[[ "$normalized_rehearsal_groups" == 'leetplus-rehearsal leetplus-runtime' ]] \
  || die 'transient rehearsal process did not receive its exact group set'
/usr/sbin/userdel leetplus-rehearsal
/usr/sbin/groupdel leetplus-rehearsal
/usr/bin/rm -f -- /run/leetplus-topology-twin-phase.out
"$FIXED_NODE" "$CONTRACT_VERIFIER" --root "$REPOSITORY_ROOT" \
  --live-nss-phase steady-state --live-systemd

printf 'PRODUCTION_TOPOLOGY_TWIN=PASS slots=blue,green transientCleanup=PASS\n'
