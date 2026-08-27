#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly TEMPLATE_ROOT="${REPOSITORY_ROOT}/docs/deployment/production-artifact/systemd"
readonly ROOT_ENV_EXAMPLE="${REPOSITORY_ROOT}/.env.example"
readonly DESIGN_PARTNER_SAFETY_OVERLAY="${REPOSITORY_ROOT}/docs/open-beta/design-partner-runtime.env.example"

api_unit="${TEMPLATE_ROOT}/leetplus-api.service"
web_unit="${TEMPLATE_ROOT}/leetplus-web.service"
migration_unit="${TEMPLATE_ROOT}/leetplus-release-migrate@.service"
hydration_unit="${TEMPLATE_ROOT}/leetplus-release-hydrate@.service"
recovery_unit="${TEMPLATE_ROOT}/leetplus-blue-green-recovery.service"
recovery_watchdog_unit="${TEMPLATE_ROOT}/leetplus-blue-green-recovery-watchdog.service"
recovery_timer="${TEMPLATE_ROOT}/leetplus-blue-green-recovery.timer"
nginx_recovery_dropin="${TEMPLATE_ROOT}/nginx.service.d/leetplus-blue-green-recovery.conf"
hydration_tmpfiles="${TEMPLATE_ROOT}/tmpfiles.d/leetplus-release.conf"
release_environment="${TEMPLATE_ROOT}/release.env.example"
slot_api_unit="${TEMPLATE_ROOT}/leetplus-api@.service"
slot_web_unit="${TEMPLATE_ROOT}/leetplus-web@.service"
identity_mail_egress_unit="${TEMPLATE_ROOT}/leetplus-identity-mail-smtp-egress@.service"
identity_mail_worker_unit="${TEMPLATE_ROOT}/leetplus-identity-mail-worker@.service"
identity_mail_egress_environment="${TEMPLATE_ROOT}/identity-mail-smtp-egress.env.example"
identity_mail_worker_environment="${TEMPLATE_ROOT}/identity-mail-worker.env.example"
safe_overlay="${TEMPLATE_ROOT}/canary-safe.env.example"
slot_preflight="${REPOSITORY_ROOT}/docs/deployment/production-artifact/preflight-release-slot.sh"
cache_preparer="${REPOSITORY_ROOT}/docs/deployment/production-artifact/prepare-web-slot-cache.sh"
release_promoter="${REPOSITORY_ROOT}/docs/deployment/production-artifact/promote-release-artifact.sh"
release_sealer="${REPOSITORY_ROOT}/docs/deployment/production-artifact/seal-release-artifact.sh"
store_stager="${REPOSITORY_ROOT}/docs/deployment/production-artifact/stage-pnpm-store.sh"
blue_environment="${TEMPLATE_ROOT}/blue.env.example"
green_environment="${TEMPLATE_ROOT}/green.env.example"
web_runtime_environment="${TEMPLATE_ROOT}/web-runtime.env.example"
blue_nginx="${REPOSITORY_ROOT}/docs/deployment/production-artifact/nginx/blue.conf.example"
green_nginx="${REPOSITORY_ROOT}/docs/deployment/production-artifact/nginx/green.conf.example"
legacy_safe_nginx="${REPOSITORY_ROOT}/docs/deployment/production-artifact/nginx/legacy-safe.conf.example"
blue_green_cutover="${REPOSITORY_ROOT}/docs/deployment/production-artifact/blue-green-cutover.sh"
release_readiness="${REPOSITORY_ROOT}/docs/deployment/production-artifact/verify-release-readiness.sh"
legacy_readiness="${REPOSITORY_ROOT}/docs/deployment/production-artifact/verify-legacy-rollback-readiness.sh"
legacy_installer="${REPOSITORY_ROOT}/docs/deployment/production-artifact/install-legacy-rollback-contour.sh"
authenticated_reads="${REPOSITORY_ROOT}/docs/deployment/production-artifact/verify-legacy-rollback-authenticated-reads.mjs"
production_control_install_map="${REPOSITORY_ROOT}/docs/deployment/production-control-authority/production-control-install-map.tsv"

# Closed root-authority inventory: every privileged operational entrypoint must
# enter Bash privileged mode before parsing, scrub the complete inherited
# exported environment, and then install the one reviewed command path.
root_authorities=(
  activate-legacy-rollback-contour.sh
  apply-legacy-database-login-fence.sh
  apply-legacy-rollback-egress.sh
  bind-release-slot.sh
  blue-green-cutover.sh
  install-legacy-rollback-contour.sh
  prepare-web-slot-cache.sh
  promote-release-artifact.sh
  run-current-release-restored-copy-acceptance.sh
  seal-release-artifact.sh
  stage-pnpm-store.sh
  stage-release-artifact.sh
  verify-legacy-rollback-readiness.sh
  verify-legacy-runtime-drain.sh
  verify-release-readiness.sh
)
for authority_name in "${root_authorities[@]}"; do
  authority_path="${REPOSITORY_ROOT}/docs/deployment/production-artifact/${authority_name}"
  test "$(sed -n '1p' "$authority_path")" = '#!/usr/bin/bash -p'
  grep -E '(== \*p\*|\*p\*\))' "$authority_path" >/dev/null
  grep -F 'compgen -e' "$authority_path" >/dev/null
  grep -F "PATH='/usr/sbin:/usr/bin:/sbin:/bin'" "$authority_path" >/dev/null
done

for required_file in \
  "$api_unit" "$web_unit" "$migration_unit" "$hydration_unit" "$release_environment" \
  "$slot_api_unit" "$slot_web_unit" "$identity_mail_egress_unit" "$identity_mail_worker_unit" "$identity_mail_egress_environment" "$identity_mail_worker_environment" "$safe_overlay" "$slot_preflight" "$cache_preparer" "$release_promoter" "$release_sealer" "$store_stager" "$blue_environment" "$green_environment" "$web_runtime_environment" "$blue_nginx" "$green_nginx" "$recovery_unit" "$recovery_watchdog_unit" "$recovery_timer" "$nginx_recovery_dropin" "$hydration_tmpfiles"; do
  test -f "$required_file"
done

for identity_mail_unit in "$identity_mail_egress_unit" "$identity_mail_worker_unit"; do
  grep -F -x 'DynamicUser=yes' "$identity_mail_unit" > /dev/null
  grep -F -x 'SupplementaryGroups=leetplus-runtime' "$identity_mail_unit" > /dev/null
  grep -F -x 'WorkingDirectory=/srv/leetplus/slots/%i' "$identity_mail_unit" > /dev/null
  grep -F -x 'EnvironmentFile=/etc/leetplus/identity-mail-smtp-egress-%i.env' "$identity_mail_unit" > /dev/null
  grep -F -x 'NoNewPrivileges=true' "$identity_mail_unit" > /dev/null
  grep -F -x 'CapabilityBoundingSet=' "$identity_mail_unit" > /dev/null
  grep -F -x 'AmbientCapabilities=' "$identity_mail_unit" > /dev/null
  grep -F -x 'ProtectSystem=strict' "$identity_mail_unit" > /dev/null
  grep -F -x 'ProtectProc=invisible' "$identity_mail_unit" > /dev/null
  grep -F -x 'RestrictAddressFamilies=AF_INET AF_INET6 AF_NETLINK' "$identity_mail_unit" > /dev/null
  grep -F -x 'ReadOnlyPaths=/srv/leetplus/releases /srv/leetplus/slots' "$identity_mail_unit" > /dev/null
  grep -F -x 'InaccessiblePaths=/etc/leetplus' "$identity_mail_unit" > /dev/null
  if grep -F -x 'EnvironmentFile=/etc/leetplus/slots/%i.env' "$identity_mail_unit" > /dev/null; then
    printf 'identity-mail unit receives the broad slot environment\n' >&2
    exit 1
  fi
done
grep -F -x 'EnvironmentFile=/etc/leetplus/identity-mail-worker-%i.env' "$identity_mail_worker_unit" > /dev/null
grep -F -x 'RestrictNetworkInterfaces=lo' "$identity_mail_worker_unit" > /dev/null
grep -F -x 'IPAddressDeny=any' "$identity_mail_worker_unit" > /dev/null
grep -F -x 'IPAddressAllow=localhost' "$identity_mail_worker_unit" > /dev/null
grep -F '/usr/bin/flock --exclusive --no-fork /run/leetplus-identity-mail/worker.lock' "$identity_mail_worker_unit" > /dev/null
if grep -E -x 'EnvironmentFile=/etc/leetplus/identity-mail-worker(-%i)?[.]env' "$identity_mail_egress_unit" > /dev/null; then
  printf 'SMTP egress broker receives worker credentials\n' >&2
  exit 1
fi
grep -F 'identity-mail-smtp-egress-broker.cli.js' "$identity_mail_egress_unit" > /dev/null
grep -F 'identity-mail-worker.cli.js' "$identity_mail_worker_unit" > /dev/null
grep -F -x 'IDENTITY_MAIL_SMTP_EGRESS_ENABLED=false' "$identity_mail_egress_environment" > /dev/null
grep -F -x 'IDENTITY_MAIL_WORKER_ENABLED=false' "$identity_mail_worker_environment" > /dev/null
grep -F -x 'IDENTITY_MAIL_WORKER_REAL_SEND_ENABLED=false' "$identity_mail_worker_environment" > /dev/null
grep -F -x 'IDENTITY_MAIL_WORKER_LIVE_CANARY_ENABLED=false' "$identity_mail_worker_environment" > /dev/null
grep -F -x 'RELEASE_SHA=<same-exact-40-character-release-sha>' "$identity_mail_worker_environment" > /dev/null
grep -F -x 'EXPECTED_DATABASE_MIGRATION=<same-exact-migration-as-slot>' "$identity_mail_worker_environment" > /dev/null
grep -F -x 'EXPECTED_DATABASE_MIGRATION_COUNT=<same-exact-count-as-slot>' "$identity_mail_worker_environment" > /dev/null

assert_inventory_producer_failure_is_fatal() {
  local authority_path="$1"
  local expected_message="$2"
  local function_source output status
  test "$(grep -c '^find_has_match() {$' "$authority_path")" = '1'
  function_source="$(sed -n '/^find_has_match() {$/,/^}$/p' "$authority_path")"
  test -n "$function_source"
  set +e
  output="$(
    LEETPLUS_FIND_FUNCTION="$function_source" bash --noprofile --norc -c '
      set -euo pipefail
      eval "$LEETPLUS_FIND_FUNCTION"
      die() { printf "%s\n" "$*" >&2; exit 91; }
      find() { return 73; }
      mktemp() { command mktemp "${TMPDIR:-/tmp}/leetplus-find-fixture.XXXXXX"; }
      find_has_match -P .
    ' 2>&1
  )"
  status=$?
  set -e
  test "$status" = '91'
  grep -F "$expected_message" <<< "$output" >/dev/null
}

assert_inventory_producer_failure_is_fatal \
  "$release_sealer" 'required filesystem inventory producer failed'
assert_inventory_producer_failure_is_fatal \
  "$release_promoter" 'required promotion filesystem inventory producer failed'

assert_complete_systemd_property_snapshot() {
  local authority_path="$1" function_source
  function_source="$(sed -n '/^load_unit_property_snapshot() {$/,/^}$/p' "$authority_path")"
  test -n "$function_source"
  grep -F 'show --all --no-pager' <<< "$function_source" >/dev/null
}

# `systemctl show` omits empty values by default. Both atomic unit attestations
# must retain them so an exact empty DropInPaths is not misclassified as absent.
assert_complete_systemd_property_snapshot "$blue_green_cutover"
assert_complete_systemd_property_snapshot "$legacy_readiness"

assert_multivalue_systemd_property_contract() {
  local authority_path="$1" function_source
  function_source="$(sed -n '/^unit_property() {$/,/^}$/p' "$authority_path")"
  test -n "$function_source"
  UNIT_PROPERTY_FUNCTION="$function_source" bash --noprofile --norc -c '
    set -euo pipefail
    eval "$UNIT_PROPERTY_FUNCTION"
    unit_property_snapshot_unit=fixture.service
    unit_property_snapshot=$'"'"'ActiveState=active\nEnvironmentFiles=/one (ignore_errors=no)\nEnvironmentFiles=/two (ignore_errors=no)\nSocketBindAllow=ipv4:tcp:4300\nSocketBindAllow=ipv4:tcp:4301'"'"'
    test "$(unit_property fixture.service EnvironmentFiles)" = $'"'"'/one (ignore_errors=no)\n/two (ignore_errors=no)'"'"'
    test "$(unit_property fixture.service SocketBindAllow)" = $'"'"'ipv4:tcp:4300\nipv4:tcp:4301'"'"'
    test "$(unit_property fixture.service ActiveState)" = active
    unit_property_snapshot+=$'"'"'\nActiveState=failed'"'"'
    if unit_property fixture.service ActiveState >/dev/null; then
      exit 1
    fi
  '
}

assert_multivalue_systemd_property_contract "$blue_green_cutover"
assert_multivalue_systemd_property_contract "$legacy_readiness"

assert_systemd_socket_bind_rendering_contract() {
  local authority_path="$1" function_source
  function_source="$(sed -n '/^normalized_word_set() {$/,/^}$/p' "$authority_path")"$'\n'
  function_source+="$(sed -n '/^normalized_systemd_socket_bind_set() {$/,/^}$/p' "$authority_path")"
  test -n "$function_source"
  NORMALIZATION_FUNCTIONS="$function_source" bash --noprofile --norc -c '
    set -euo pipefail
    eval "$NORMALIZATION_FUNCTIONS"
    expected="ipv4:tcp4300 ipv4:tcp4301"
    test "$(printf "%s" "ipv4:tcp:4300 ipv4:tcp:4301" | normalized_systemd_socket_bind_set)" = "$expected"
    test "$(printf "%s\n" "ipv4:tcp4301" "ipv4:tcp4300" | normalized_systemd_socket_bind_set)" = "$expected"
    test "$(printf "%s" "ipv4:tcp:4300 ipv4:tcp4301 ipv6:udp:53" | normalized_systemd_socket_bind_set)" \
      = "ipv4:tcp4300 ipv4:tcp4301 ipv6:udp53"
  '
  test "$(grep -Fc 'normalized_systemd_socket_bind_set)' "$authority_path")" = 2
}

assert_systemd_socket_bind_rendering_contract "$legacy_readiness"

assert_systemd_ip_address_rendering_contract() {
  local authority_path="$1" function_source
  function_source="$(sed -n '/^normalized_word_set() {$/,/^}$/p' "$authority_path")"$'\n'
  function_source+="$(sed -n '/^systemd_localhost_ip_boundary_is_exact() {$/,/^}$/p' "$authority_path")"
  test -n "$function_source"
  IP_BOUNDARY_FUNCTIONS="$function_source" bash --noprofile --norc -c '
    set -euo pipefail
    eval "$IP_BOUNDARY_FUNCTIONS"
    systemd_localhost_ip_boundary_is_exact "::/0 0.0.0.0/0" "::1/128 127.0.0.0/8"
    systemd_localhost_ip_boundary_is_exact $'"'"'0.0.0.0/0\n::/0'"'"' $'"'"'127.0.0.0/8\n::1/128'"'"'
    for boundary in \
      "any|localhost" \
      "0.0.0.0/0|127.0.0.0/8 ::1/128" \
      "0.0.0.0/0 ::/0|127.0.0.1/32 ::1/128" \
      "0.0.0.0/0 ::/0|127.0.0.0/8 ::1/128 10.0.0.0/8"; do
      IFS="|" read -r deny allow <<< "$boundary"
      if systemd_localhost_ip_boundary_is_exact "$deny" "$allow"; then
        exit 1
      fi
    done
  '
  test "$(grep -Fc 'systemd_localhost_ip_boundary_is_exact' "$authority_path")" = 2
}

assert_systemd_ip_address_rendering_contract "$blue_green_cutover"
assert_systemd_ip_address_rendering_contract "$legacy_readiness"

# systemd 255 reports ExecStart before EnvironmentFile expansion. Keep the
# verifier bound to that exact literal token while separately requiring the
# preflight and listener boundary to prove its admitted value.
grep -F 'expected_exec="/usr/bin/node ${release_directory}/apps/web/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port \${WEB_PORT}"' \
  "$legacy_readiness" >/dev/null
grep -F -x '[[ "${WEB_PORT:-}" == '\''3300'\'' ]] || die '\''rollback Web port must be 3300'\''' \
  "${REPOSITORY_ROOT}/docs/deployment/production-artifact/preflight-legacy-rollback.sh" >/dev/null
grep -F -x '      expected_port=3300' "$legacy_readiness" >/dev/null
if grep -F 'expected_exec="/usr/bin/node ${release_directory}/apps/web/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3300"' \
  "$legacy_readiness" >/dev/null; then
  printf 'legacy readiness expects post-expansion Web ExecStart rendering\n' >&2
  exit 1
fi

awk '
  /publish_state_record "\$control_preparing"/ { published = 1; next }
  published && /preparing_record_sha=/ { hashed = 1; next }
  hashed && $0 == "  preparing_generation=current" { accepted = 1; exit }
  END { exit !accepted }
' "$legacy_installer"

for candidate_nginx in "$blue_nginx" "$green_nginx"; do
  ! grep -E '[[:space:]]backup([[:space:];]|$)' "$candidate_nginx" > /dev/null
  test "$(grep -Ec '^[[:space:]]+server 127\.0\.0\.1:[0-9]+ max_fails=2 fail_timeout=5s;$' "$candidate_nginx")" = 2
done

for slot_unit in "$slot_api_unit" "$slot_web_unit"; do
  grep -F -x 'Group=leetplus-runtime' "$slot_unit" > /dev/null
  grep -F -x 'Slice=system.slice' "$slot_unit" > /dev/null
  grep -F -x 'EnvironmentFile=/etc/leetplus/slots/%i.env' "$slot_unit" > /dev/null
  grep -F -x 'EnvironmentFile=/etc/leetplus/canary-safe.env' "$slot_unit" > /dev/null
  grep -F -x 'Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin' "$slot_unit" > /dev/null
  grep -F -x 'UnsetEnvironment=BASH_ENV ENV HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy all_proxy no_proxy NODE_USE_ENV_PROXY NODE_OPTIONS NODE_PATH NODE_EXTRA_CA_CERTS NODE_DEBUG NODE_V8_COVERAGE NODE_COMPILE_CACHE SSLKEYLOGFILE LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES GLIBC_TUNABLES MALLOC_CHECK_ MALLOC_PERTURB_ CURL_HOME CURL_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR PRISMA_QUERY_ENGINE_BINARY PRISMA_QUERY_ENGINE_LIBRARY PRISMA_SCHEMA_ENGINE_BINARY PRISMA_FMT_BINARY TMPDIR TMP TEMP XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME NPM_CONFIG_USERCONFIG npm_config_userconfig PNPM_HOME COREPACK_HOME COREPACK_NPM_REGISTRY COREPACK_INTEGRITY_KEYS GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM' "$slot_unit" > /dev/null
  grep -F 'ExecStartPre=/usr/bin/bash -p /usr/local/libexec/leetplus/preflight-release-slot.sh --slot %i' "$slot_unit" > /dev/null
  grep -F -x 'ReadOnlyPaths=/srv/leetplus/releases /srv/leetplus/slots' "$slot_unit" > /dev/null
  grep -F -x 'ProtectSystem=strict' "$slot_unit" > /dev/null
  grep -F -x 'ProtectProc=invisible' "$slot_unit" > /dev/null
  grep -F -x 'ProcSubset=pid' "$slot_unit" > /dev/null
  grep -F -x 'NoNewPrivileges=true' "$slot_unit" > /dev/null
  grep -F -x 'CapabilityBoundingSet=' "$slot_unit" > /dev/null
  grep -F -x 'AmbientCapabilities=' "$slot_unit" > /dev/null
  grep -F -x 'PrivateDevices=true' "$slot_unit" > /dev/null
  grep -F -x 'ProtectKernelTunables=true' "$slot_unit" > /dev/null
  grep -F -x 'ProtectKernelModules=true' "$slot_unit" > /dev/null
  grep -F -x 'ProtectKernelLogs=true' "$slot_unit" > /dev/null
  grep -F -x 'ProtectControlGroups=true' "$slot_unit" > /dev/null
  grep -F -x 'ProtectClock=true' "$slot_unit" > /dev/null
  grep -F -x 'ProtectHostname=true' "$slot_unit" > /dev/null
  grep -F -x 'LockPersonality=true' "$slot_unit" > /dev/null
  grep -F -x 'RestrictSUIDSGID=true' "$slot_unit" > /dev/null
  grep -F -x 'RemoveIPC=true' "$slot_unit" > /dev/null
  grep -F -x 'SystemCallArchitectures=native' "$slot_unit" > /dev/null
  grep -F -x 'RestrictNetworkInterfaces=lo' "$slot_unit" > /dev/null
  grep -F -x 'RestrictAddressFamilies=AF_INET AF_INET6 AF_NETLINK' "$slot_unit" > /dev/null
  if grep -F 'AF_UNIX' "$slot_unit" > /dev/null; then
    printf 'candidate runtime unit retains AF_UNIX outside the inet egress fence\n' >&2
    exit 1
  fi
  grep -F -x 'IPAddressDeny=any' "$slot_unit" > /dev/null
  grep -F -x 'IPAddressAllow=localhost' "$slot_unit" > /dev/null
  grep -F -x 'Before=nginx.service' "$slot_unit" > /dev/null
  grep -F -x 'WantedBy=multi-user.target' "$slot_unit" > /dev/null
  if grep -E '/home/admin/leetplus|ExecStart=.*/srv/leetplus/current|Restart=always' "$slot_unit" > /dev/null; then
    printf 'slot unit is coupled to mutable/single-instance runtime: %s\n' "$slot_unit" >&2
    exit 1
  fi
done

grep -F "entry.family === \"IPv4\" && entry.internal === false" "$slot_preflight" > /dev/null
grep -F 'error?.code === "EACCES" || error?.code === "EPERM"' "$slot_preflight" > /dev/null
grep -F 'socket.setTimeout(1500, () => finish(true))' "$slot_preflight" > /dev/null
grep -F "socket.connect({ family: 4, host: target, port: 1 })" "$slot_preflight" > /dev/null
grep -F "RELEASE_SLOT_LIVE_KERNEL_NO_EGRESS=true" "$slot_preflight" > /dev/null

if command -v systemd-analyze >/dev/null 2>&1; then
  verification_root="$(mktemp -d)"
  verification_slot="${verification_root}/slot-blue"
  verification_libexec="${verification_root}/libexec"
  verification_environment="${verification_root}/environment"
  verification_cache="${verification_root}/cache"
  verification_node="${verification_root}/node"
  mkdir -p "$verification_slot/apps/api/dist/config" \
    "$verification_slot/apps/web/node_modules/next/dist/bin" \
    "$verification_slot/apps/web/.next/cache" "$verification_libexec" \
    "$verification_environment/slots" "$verification_cache"
  printf 'NODE_ENV=production\n' > "$verification_environment/runtime.env"
  cp "$verification_environment/runtime.env" "$verification_environment/web-runtime.env"
  cp "$verification_environment/runtime.env" "$verification_environment/canary-safe.env"
  cp "$verification_environment/runtime.env" "$verification_environment/slots/blue.env"
  for executable in \
    "$verification_node" \
    "$verification_libexec/preflight-release-slot.sh" \
    "$verification_slot/apps/api/dist/config/validate-production-environment.cli.js" \
    "$verification_slot/apps/api/dist/main.js" \
    "$verification_slot/apps/web/node_modules/next/dist/bin/next"; do
    printf '#!/bin/sh\nexit 0\n' > "$executable"
    chmod 0755 "$executable"
  done
  sed -e 's/%i/blue/g' \
    -e "s#/usr/bin/node#${verification_node}#g" \
    -e "s#/usr/local/libexec/leetplus#${verification_libexec}#g" \
    -e "s#/srv/leetplus/slots/blue#${verification_slot}#g" \
    -e "s#/etc/leetplus#${verification_environment}#g" \
    -e "s#^User=.*#User=$(id -un)#" -e "s#^Group=.*#Group=$(id -gn)#" \
    "$slot_api_unit" > "$verification_root/leetplus-api@blue.service"
  sed -e 's/%i/blue/g' \
    -e "s#/usr/bin/node#${verification_node}#g" \
    -e "s#/usr/local/libexec/leetplus#${verification_libexec}#g" \
    -e "s#/srv/leetplus/slots/blue#${verification_slot}#g" \
    -e "s#/etc/leetplus#${verification_environment}#g" \
    -e "s#/var/cache/leetplus-web-blue#${verification_cache}#g" \
    -e "s#^User=.*#User=$(id -un)#" -e "s#^Group=.*#Group=$(id -gn)#" \
    "$slot_web_unit" > "$verification_root/leetplus-web@blue.service"
  printf '[Unit]\nDescription=fixture target\n' > "$verification_root/network-online.target"
  cp "$verification_root/network-online.target" "$verification_root/multi-user.target"
  printf '[Unit]\nDescription=fixture nginx\n[Service]\nType=oneshot\nExecStart=/bin/true\n' \
    > "$verification_root/nginx.service"
  SYSTEMD_UNIT_PATH="$verification_root:/usr/lib/systemd/system:/lib/systemd/system" \
    systemd-analyze verify \
      "$verification_root/leetplus-api@blue.service" \
      "$verification_root/leetplus-web@blue.service"
  case "$verification_root" in /tmp/tmp.*) ;; *) printf 'unsafe systemd verification root\n' >&2; exit 1 ;; esac
  rm -rf -- "$verification_root"
fi

grep -F -x 'WorkingDirectory=/srv/leetplus/slots/%i' "$slot_api_unit" > /dev/null
grep -F -x 'User=leetplus-api-%i' "$slot_api_unit" > /dev/null
grep -F -x 'EnvironmentFile=/etc/leetplus/runtime.env' "$slot_api_unit" > /dev/null
grep -F 'ExecStartPre=/usr/bin/node /srv/leetplus/slots/%i/apps/api/dist/config/validate-production-environment.cli.js' "$slot_api_unit" > /dev/null
grep -F -- '--api-runtime' "$slot_api_unit" > /dev/null
grep -F -x 'ExecStart=/usr/bin/node /srv/leetplus/slots/%i/apps/api/dist/main.js' "$slot_api_unit" > /dev/null
grep -F -x 'ReadWritePaths=/var/lib/leetplus/langame-sync' "$slot_api_unit" > /dev/null
grep -F -x 'LogsDirectory=leetplus/api-%i' "$slot_api_unit" > /dev/null
grep -F -x 'LogsDirectoryMode=0750' "$slot_api_unit" > /dev/null
if grep -F -x 'ReadWritePaths=/var/lib/leetplus /var/log/leetplus' "$slot_api_unit" > /dev/null; then
  printf 'API slot retains broad deployment-state write access\n' >&2
  exit 1
fi
grep -F -x 'WorkingDirectory=/srv/leetplus/slots/%i/apps/web' "$slot_web_unit" > /dev/null
grep -F -x 'User=leetplus-web-%i' "$slot_web_unit" > /dev/null
grep -F -x 'Requires=leetplus-api@%i.service' "$slot_web_unit" > /dev/null
grep -F -x 'EnvironmentFile=/etc/leetplus/web-runtime.env' "$slot_web_unit" > /dev/null
if grep -F -x 'EnvironmentFile=/etc/leetplus/runtime.env' "$slot_web_unit" > /dev/null \
  || grep -F 'validate-production-environment.cli.js' "$slot_web_unit" > /dev/null; then
  printf 'Web slot inherits API secrets or API-only validator\n' >&2
  exit 1
fi
grep -F 'ExecStart=/usr/bin/node /srv/leetplus/slots/%i/apps/web/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${WEB_PORT}' "$slot_web_unit" > /dev/null
grep -F -- '--web-runtime' "$slot_web_unit" > /dev/null
grep -F -- '--require-web-cache-bind' "$slot_web_unit" > /dev/null
if grep -F -- '--require-web-cache-bind' "$slot_api_unit" > /dev/null; then
  printf 'API slot must not receive the Web-only cache bind preflight\n' >&2
  exit 1
fi
grep -F -x 'CacheDirectory=leetplus-web-%i' "$slot_web_unit" > /dev/null
grep -F -x 'BindPaths=/var/cache/leetplus-web-%i:/srv/leetplus/slots/%i/apps/web/.next/cache' "$slot_web_unit" > /dev/null
grep -F -x 'ReadWritePaths=/var/cache/leetplus-web-%i' "$slot_web_unit" > /dev/null
grep -F -x 'InaccessiblePaths=/etc/leetplus/runtime.env' "$slot_web_unit" > /dev/null
grep -F 'cache_release_marker="${cache_marker_root}/${slot}.sha"' "$slot_preflight" > /dev/null
grep -F "Web slot must be stopped with no MainPID before cache preparation" "$cache_preparer" > /dev/null
grep -F 'WEB_CACHE_OLD_DATA_DELETED=false' "$cache_preparer" > /dev/null
grep -F -x 'User=leetplus-build' "$hydration_unit" > /dev/null
grep -F -x 'Slice=system.slice' "$hydration_unit" > /dev/null
grep -F -x 'IPAddressDeny=any' "$hydration_unit" > /dev/null
grep -F -x 'RestrictAddressFamilies=none' "$hydration_unit" > /dev/null
grep -F -x 'MemoryPressureWatch=skip' "$hydration_unit" > /dev/null
grep -F -x 'KillMode=control-group' "$hydration_unit" > /dev/null
grep -F '/usr/bin/flock --exclusive --no-fork /run/leetplus-release/hydration.lock' "$hydration_unit" > /dev/null
grep -F -- '--hydrate' "$hydration_unit" > /dev/null
grep -F 'production promotion must run as root' "$release_promoter" > /dev/null
grep -F 'HYDRATION_SANDBOX_RECEIPT' "$release_promoter" > /dev/null
grep -F 'assert_empty_hydration_cgroup' "$release_promoter" > /dev/null
grep -F 'systemctl stop "$hydration_unit"' "$release_promoter" > /dev/null
grep -F "another hydration or promotion operation holds the global lock" "$release_promoter" > /dev/null
grep -F 'effective hydration snapshot EnvironmentFiles count is malformed' "$release_promoter" > /dev/null
grep -F "printf 'EnvironmentFiles=\\n' >> \"\$output_path\"" "$release_promoter" > /dev/null
grep -F '[[ -z "$control_group" || "$control_group" == "$expected_control_group" ]]' "$release_promoter" > /dev/null
grep -F 'systemd may prune a completed oneshot cgroup before ControlGroup is read' "$release_promoter" > /dev/null
grep -F -x 'f /run/leetplus-release/hydration.lock 0660 root leetplus-build -' "$hydration_tmpfiles" > /dev/null
grep -F -x 'd /run/leetplus-identity-mail 0750 root leetplus-runtime -' "$hydration_tmpfiles" > /dev/null
grep -F -x 'f /run/leetplus-identity-mail/worker.lock 0660 root leetplus-runtime -' "$hydration_tmpfiles" > /dev/null
grep -F -x 'ExecStart=/usr/bin/bash -p /usr/local/sbin/leetplus-blue-green-cutover recover-before-nginx' "$recovery_unit" > /dev/null
grep -F -x 'Before=nginx.service' "$recovery_unit" > /dev/null
grep -F -x 'ExecStart=/usr/bin/bash -p /usr/local/sbin/leetplus-blue-green-cutover recover-pending' "$recovery_watchdog_unit" > /dev/null
for recovery_runtime_unit in "$recovery_unit" "$recovery_watchdog_unit"; do
  grep -F -x 'Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin' "$recovery_runtime_unit" > /dev/null
  grep -F -x 'UnsetEnvironment=BASH_ENV ENV HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy all_proxy no_proxy NODE_USE_ENV_PROXY NODE_OPTIONS NODE_PATH NODE_EXTRA_CA_CERTS NODE_DEBUG NODE_V8_COVERAGE NODE_COMPILE_CACHE SSLKEYLOGFILE LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES GLIBC_TUNABLES MALLOC_CHECK_ MALLOC_PERTURB_ CURL_HOME CURL_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR PRISMA_QUERY_ENGINE_BINARY PRISMA_QUERY_ENGINE_LIBRARY PRISMA_SCHEMA_ENGINE_BINARY PRISMA_FMT_BINARY TMPDIR TMP TEMP XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME NPM_CONFIG_USERCONFIG npm_config_userconfig PNPM_HOME COREPACK_HOME COREPACK_NPM_REGISTRY COREPACK_INTEGRITY_KEYS GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM' "$recovery_runtime_unit" > /dev/null
  grep -F -x 'ProtectSystem=strict' "$recovery_runtime_unit" > /dev/null
  grep -F -x 'PrivateTmp=true' "$recovery_runtime_unit" > /dev/null
  grep -F -x 'ReadWritePaths=/etc/nginx/leetplus /var/lib/leetplus/deploy-receipts' "$recovery_runtime_unit" > /dev/null
done
grep -F 'inventory="$(findmnt --task 1 --raw --noheadings --output TARGET)"' \
  "$blue_green_cutover" > /dev/null
assert_cutover_sha_pin() {
  local pin_name="$1" source_path="$2" source_digest
  source_digest="$(sha256sum "$source_path" | awk '{ print $1 }')"
  grep -F -x "readonly ${pin_name}='${source_digest}'" "$blue_green_cutover" > /dev/null
}
assert_cutover_sha_pin SLOT_API_UNIT_SHA256 "$slot_api_unit"
assert_cutover_sha_pin SLOT_WEB_UNIT_SHA256 "$slot_web_unit"
assert_cutover_sha_pin CANARY_SAFE_ENV_SHA256 "$safe_overlay"
assert_cutover_sha_pin SLOT_PREFLIGHT_SHA256 "$slot_preflight"
assert_cutover_sha_pin BLUE_NGINX_SHA256 "$blue_nginx"
assert_cutover_sha_pin GREEN_NGINX_SHA256 "$green_nginx"
assert_cutover_sha_pin LEGACY_SAFE_NGINX_SHA256 "$legacy_safe_nginx"
assert_cutover_sha_pin RELEASE_READINESS_SHA256 "$release_readiness"
assert_cutover_sha_pin LEGACY_READINESS_SHA256 "$legacy_readiness"
assert_cutover_sha_pin AUTHENTICATED_READS_SHA256 "$authenticated_reads"
grep -F 'trusted_installed_file "$fragment" "$fragment_digest" root 444' "$blue_green_cutover" > /dev/null
grep -F 'trusted_installed_file "${libexec_root}/preflight-release-slot.sh" "$SLOT_PREFLIGHT_SHA256" root 555' "$blue_green_cutover" > /dev/null
grep -F 'trusted_installed_file "$probe" "$RELEASE_READINESS_SHA256" root 555' "$blue_green_cutover" > /dev/null
grep -F 'validation_root="$(mktemp -d /tmp/leetplus-nginx-validation.XXXXXX)"' "$blue_green_cutover" > /dev/null
grep -F 'temporary="$(mktemp /tmp/leetplus-cutover-record-inventory.XXXXXX)"' "$blue_green_cutover" > /dev/null
if grep -F '/run/leetplus-' "$blue_green_cutover" > /dev/null; then
  printf 'blue-green recovery uses a ProtectSystem-strict read-only /run path\n' >&2
  exit 1
fi
grep -F -x $'docs/deployment/production-artifact/systemd/leetplus-api@.service\t/etc/systemd/system/leetplus-api@.service\t0444' "$production_control_install_map" > /dev/null
grep -F -x $'docs/deployment/production-artifact/systemd/leetplus-web@.service\t/etc/systemd/system/leetplus-web@.service\t0444' "$production_control_install_map" > /dev/null
grep -F -x $'docs/deployment/production-artifact/systemd/leetplus-identity-mail-smtp-egress@.service\t/etc/systemd/system/leetplus-identity-mail-smtp-egress@.service\t0444' "$production_control_install_map" > /dev/null
grep -F -x $'docs/deployment/production-artifact/systemd/leetplus-identity-mail-worker@.service\t/etc/systemd/system/leetplus-identity-mail-worker@.service\t0444' "$production_control_install_map" > /dev/null
grep -F -x $'docs/deployment/production-artifact/preflight-release-slot.sh\t/usr/local/libexec/leetplus/preflight-release-slot.sh\t0555' "$production_control_install_map" > /dev/null
grep -F -x $'docs/deployment/production-artifact/verify-release-readiness.sh\t/usr/local/libexec/leetplus/verify-release-readiness.sh\t0555' "$production_control_install_map" > /dev/null
if grep -F -x 'Before=nginx.service' "$recovery_watchdog_unit" > /dev/null; then
  printf 'post-start recovery watchdog is incorrectly ordered before nginx\n' >&2
  exit 1
fi
if grep -F -x 'After=network-online.target nginx.service' "$recovery_watchdog_unit" > /dev/null; then
  printf 'post-start recovery watchdog has an nginx job-order cycle\n' >&2
  exit 1
fi
grep -F 'verify_previous_runtime_bounded' "$REPOSITORY_ROOT/docs/deployment/production-artifact/blue-green-cutover.sh" > /dev/null
grep -F -x 'OnUnitInactiveSec=10s' "$recovery_timer" > /dev/null
grep -F -x 'Unit=leetplus-blue-green-recovery-watchdog.service' "$recovery_timer" > /dev/null
grep -F -x 'Requires=leetplus-blue-green-recovery.service' "$nginx_recovery_dropin" > /dev/null
grep -F 'production pnpm store already exists' "$store_stager" > /dev/null
grep -F 'PNPM_STORE_PACKAGE_CODE_EXECUTED=false' "$store_stager" > /dev/null
if grep -F '/var/lib/leetplus' "$slot_web_unit" > /dev/null; then
  printf 'Web slot has unnecessary API mutable-state access\n' >&2
  exit 1
fi

for safe_value in \
  'FOUNDER_OPERATOR_BETA_MODE=DISABLED' \
  'DESIGN_PARTNER_ISOLATED_MODE=false' \
  'MAIL_HOST=127.0.0.1' \
  'MAIL_PORT=1' \
  'MAIL_SECURE=false' \
  'MAIL_USER=disabled' \
  'MAIL_PASS=disabled' \
  'GUEST_GAME_BOT_CONSUMER_MAX_DELIVERY_ENDPOINT=http://127.0.0.1:1' \
  'GUEST_GAME_MAX_DELIVERY_ENDPOINT=http://127.0.0.1:1' \
  'GUEST_PORTAL_INCOMING_CALL_LAST4_ENDPOINT=http://127.0.0.1:1' \
  'GUEST_PORTAL_OTP_SMS_ENDPOINT=http://127.0.0.1:1' \
  'GUEST_PORTAL_OTP_SMS_RU_BASE_URL=http://127.0.0.1:1' \
  'GUEST_PORTAL_USER_CALL_SMS_RU_BASE_URL=http://127.0.0.1:1' \
  'GUEST_GAME_PIPELINE_SCHEDULER_ENABLED=false' \
  'LANGAME_DAILY_SYNC_SCHEDULER_ENABLED=false' \
  'REPORT_DIGEST_SCHEDULER_ENABLED=false' \
  'STAFF_TASK_RULES_SCHEDULER_ENABLED=false' \
  'GUEST_GAME_DELIVERY_REAL_SEND_ENABLED=false' \
  'IDENTITY_MAIL_WORKER_REAL_SEND_ENABLED=false' \
  'IDENTITY_MAIL_SMTP_EGRESS_ENABLED=false' \
  'TENANT_ACTIVATION_OUTBOUND_ENABLED=false'; do
  grep -F -x "$safe_value" "$safe_overlay" > /dev/null
done

# Every effect-style enable switch documented by the application must have an
# explicit fail-closed value in the final shadow-runtime overlay. A newly added
# key therefore fails CI until it is reviewed here, rather than inheriting a
# production default accidentally.
duplicate_overlay_key="$(awk -F= '/^[A-Z0-9_]+=/ { print $1 }' "$safe_overlay" | sort | uniq -d | head -n 1)"
test -z "$duplicate_overlay_key"
while IFS='=' read -r effect_key _; do
  case "$effect_key" in
    *ENABLED|*REAL_SEND_ENABLED|*LIVE_CANARY_ENABLED)
      grep -F -x "${effect_key}=false" "$safe_overlay" > /dev/null || {
        printf 'canary safety overlay does not fail-close documented effect key: %s\n' "$effect_key" >&2
        exit 1
      }
      ;;
  esac
done < "$ROOT_ENV_EXAMPLE"

# Reuse the canonical deny settings. The shared-network shadow deliberately
# differs only in isolation identity: it must be false and has no DP tenant
# slug/domain. Every scheduler, recovery and outbound deny remains identical.
while IFS='=' read -r safety_key safety_value; do
  case "$safety_key" in
    ''|DESIGN_PARTNER_ISOLATED_MODE|DESIGN_PARTNER_TENANT_SLUG|DESIGN_PARTNER_TENANT_DOMAIN) continue ;;
  esac
  grep -F -x "${safety_key}=${safety_value}" "$safe_overlay" > /dev/null || {
    printf 'canary overlay diverges from canonical deny setting: %s\n' "$safety_key" >&2
    exit 1
  }
done < <(grep -E '^[A-Z0-9_]+=' "$DESIGN_PARTNER_SAFETY_OVERLAY")

diff -u \
  <(grep -E '^[A-Z0-9_]+=' "$safe_overlay" | LC_ALL=C sort) \
  <(sed -n '/^# BEGIN CANARY_SAFE_REQUIRED_SETTINGS$/,/^# END CANARY_SAFE_REQUIRED_SETTINGS$/p' "$slot_preflight" \
    | grep -E '^[A-Z0-9_]+=' | LC_ALL=C sort)

grep -F -x 'PORT=4100' "$blue_environment" > /dev/null
grep -F -x 'API_BIND_HOST=127.0.0.1' "$blue_environment" > /dev/null
grep -F -x 'WEB_PORT=3100' "$blue_environment" > /dev/null
grep -F -x 'API_URL=http://127.0.0.1:4100' "$blue_environment" > /dev/null
grep -F -x 'PORT=4200' "$green_environment" > /dev/null
grep -F -x 'API_BIND_HOST=127.0.0.1' "$green_environment" > /dev/null
grep -F -x 'WEB_PORT=3200' "$green_environment" > /dev/null
grep -F -x 'API_URL=http://127.0.0.1:4200' "$green_environment" > /dev/null
for slot_environment in "$blue_environment" "$green_environment"; do
  grep -F -x 'WEB_BUILD_ID=<same-exact-40-character-release-sha>' "$slot_environment" > /dev/null
  for required_key in RELEASE_SHA WEB_BUILD_ID EXPECTED_DATABASE_MIGRATION EXPECTED_DATABASE_MIGRATION_COUNT BUILD_TIME; do
    grep -E "^${required_key}=" "$slot_environment" > /dev/null
  done
done

grep -F -x 'NODE_ENV=production' "$web_runtime_environment" > /dev/null
if grep -E '(^|_)(DATABASE_URL|JWT_SECRET|PASSWORD|TOKEN|SECRET|HMAC_KEY|ENCRYPTION_KEY|API_KEY)=' "$web_runtime_environment" > /dev/null; then
  printf 'Web runtime example contains an API/provider credential\n' >&2
  exit 1
fi

for runtime_unit in "$api_unit" "$web_unit"; do
  grep -F -x 'User=admin' "$runtime_unit" > /dev/null
  grep -F -x 'Group=admin' "$runtime_unit" > /dev/null
  grep -F -x 'EnvironmentFile=/etc/leetplus/runtime.env' "$runtime_unit" > /dev/null
  grep -F -x 'EnvironmentFile=/etc/leetplus/release.env' "$runtime_unit" > /dev/null
  grep -F -x 'NoNewPrivileges=true' "$runtime_unit" > /dev/null
  grep -F -x 'PrivateTmp=true' "$runtime_unit" > /dev/null
  if grep -F '/home/admin/leetplus' "$runtime_unit" > /dev/null; then
    printf 'runtime template retains legacy mutable checkout path: %s\n' "$runtime_unit" >&2
    exit 1
  fi
done

grep -F -x 'WorkingDirectory=/srv/leetplus/current' "$api_unit" > /dev/null
grep -F 'DEPRECATED FOR FIRST ARTIFACT CUTOVER' "$api_unit" > /dev/null
grep -F -x 'ExecStart=/usr/bin/pnpm --filter api start:prod' "$api_unit" > /dev/null
grep -F -x 'WorkingDirectory=/srv/leetplus/current/apps/web' "$web_unit" > /dev/null
grep -F 'DEPRECATED FOR FIRST ARTIFACT CUTOVER' "$web_unit" > /dev/null
grep -F -x 'ExecStart=/srv/leetplus/current/apps/web/node_modules/.bin/next start --hostname 127.0.0.1 --port 3000' "$web_unit" > /dev/null

grep -F -x 'User=admin' "$migration_unit" > /dev/null
grep -F -x 'Group=admin' "$migration_unit" > /dev/null
grep -F -x 'WorkingDirectory=/srv/leetplus/releases/%i' "$migration_unit" > /dev/null
grep -F -x 'EnvironmentFile=/etc/leetplus/runtime.env' "$migration_unit" > /dev/null
grep -F -x 'EnvironmentFile=/etc/leetplus/release-env/%i.env' "$migration_unit" > /dev/null
grep -F -x 'ExecStart=/usr/bin/pnpm --filter database db:deploy' "$migration_unit" > /dev/null
grep -F 'REHEARSAL ONLY' "$migration_unit" > /dev/null
if grep -E '(^|[[:space:]])(git|curl|wget|pnpm install|build)([[:space:]]|$)' "$migration_unit" > /dev/null; then
  printf 'migration template has mutable acquisition/build capability\n' >&2
  exit 1
fi

for required_key in RELEASE_SHA WEB_BUILD_ID EXPECTED_DATABASE_MIGRATION EXPECTED_DATABASE_MIGRATION_COUNT BUILD_TIME; do
  grep -E "^${required_key}=" "$release_environment" > /dev/null
done

printf 'production artifact systemd template test: PASS\n'
