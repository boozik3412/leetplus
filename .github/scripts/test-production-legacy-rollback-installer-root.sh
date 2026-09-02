#!/usr/bin/bash -p
# Production-branch fixture for the scheduler-free N-1 control installer.
# This test intentionally writes exact production paths and therefore refuses
# to run anywhere except an explicitly acknowledged disposable Linux root.

[[ $- == *p* ]] || { printf 'root installer fixture requires Bash -p\n' >&2; exit 1; }
LEETPLUS_FIXTURE_ACKNOWLEDGEMENT="${LEETPLUS_DISPOSABLE_ROOT_FIXTURE:-}"
while IFS= read -r LEETPLUS_FIXTURE_INHERITED_NAME; do
  unset "$LEETPLUS_FIXTURE_INHERITED_NAME" 2>/dev/null || true
done < <(compgen -e)
unset LEETPLUS_FIXTURE_INHERITED_NAME
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C.UTF-8'
LC_ALL='C.UTF-8'
TZ='UTC'
export PATH LANG LC_ALL TZ
set -euo pipefail
IFS=$'\n\t'
umask 0027

readonly LEGACY_SHA='7de04ff4ccc814494810730be3fa6bf661097b07'
readonly CONTROL_ID='scheduler-free-nminus1-v1'
readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly DEPLOY_ROOT="${REPOSITORY_ROOT}/docs/deployment/production-artifact"
readonly AUTHORITY_SOURCE="${REPOSITORY_ROOT}/docs/deployment/production-control-authority/leetplus-install-scheduler-free-nminus1-v1"
readonly FENCED_PREDECESSOR_FIXTURE_ROOT="${REPOSITORY_ROOT}/.github/fixtures/scheduler-free-control-install-fenced-predecessor"
readonly CONTROL_ROOT="/srv/leetplus/control-bundles/${CONTROL_ID}"
readonly AUTHORITY_PATH='/usr/local/sbin/leetplus-install-scheduler-free-nminus1-v1'

die() {
  printf 'production legacy root fixture: %s\n' "$*" >&2
  exit 1
}

trap 'status=$?; printf "production legacy root fixture: unhandled failure at line %s (exit %s): %s\n" "$LINENO" "$status" "$BASH_COMMAND" >&2; exit "$status"' ERR

((EUID == 0)) || die 'must run as root inside a disposable Linux root'
[[ "$LEETPLUS_FIXTURE_ACKNOWLEDGEMENT" == 'CONFIRMED_DESTROYABLE_CI_ROOT' ]] \
  || die 'explicit disposable-root acknowledgement is absent'
unset LEETPLUS_FIXTURE_ACKNOWLEDGEMENT
[[ -e /.dockerenv || -e /run/.containerenv ]] \
  || die 'refusing exact production-path mutation outside a disposable container root'
[[ "$(uname -s)" == Linux ]] || die 'Linux is required'

for command_name in awk cat chmod chown cmp cp find findmnt flock getent grep groupadd id install kill ln \
  mktemp node paste pkill readlink realpath rm runuser sed sha256sum sleep sort stat sync timeout tr \
  uname useradd userdel xargs; do
  command -v "$command_name" >/dev/null 2>&1 || die "missing fixture command: ${command_name}"
done
[[ -f "$DEPLOY_ROOT/CONTROL_BUNDLE_SHA256SUMS" && -f "$AUTHORITY_SOURCE" \
  && -f "$FENCED_PREDECESSOR_FIXTURE_ROOT/scheduler-free-control-install.preparing" \
  && -f "$FENCED_PREDECESSOR_FIXTURE_ROOT/scheduler-free-control-install.fence" \
  && -f "$FENCED_PREDECESSOR_FIXTURE_ROOT/scheduler-free-control-install.intent" \
  && -f "$FENCED_PREDECESSOR_FIXTURE_ROOT/leetplus-rollback-egress.service" ]] \
  || die 'reviewed control sources are absent'
(
  cd -- "$DEPLOY_ROOT"
  sha256sum --check --strict --quiet CONTROL_BUNDLE_SHA256SUMS
) || die 'inner control manifest is stale before the root fixture'

for forbidden_existing in /srv/leetplus /etc/leetplus /etc/nginx/leetplus \
  /usr/local/libexec/leetplus /var/lib/leetplus/legacy-drain \
  /var/lib/leetplus/deploy-receipts "$AUTHORITY_PATH"; do
  [[ ! -e "$forbidden_existing" && ! -L "$forbidden_existing" ]] \
    || die "disposable root is not clean at ${forbidden_existing}"
done

groupadd --system leetplus-runtime
groupadd --system leetplus-api-runtime
groupadd --system leetplus-web-runtime
for identity in leetplus-api-blue leetplus-api-green leetplus-api-nminus1; do
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin \
    --gid leetplus-runtime --groups leetplus-api-runtime "$identity"
done
for identity in leetplus-web-blue leetplus-web-green leetplus-web-nminus1; do
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin \
    --gid leetplus-runtime --groups leetplus-web-runtime "$identity"
done

install -d -o root -g root -m 0755 \
  /srv/leetplus/control-bundles "$CONTROL_ROOT" \
  /etc/leetplus /etc/systemd/system/nginx.service.d \
  /usr/local/libexec/leetplus /usr/local/sbin \
  /etc/nginx/leetplus/upstreams /var/lib/leetplus
install -d -o root -g root -m 0700 \
  /var/lib/leetplus/legacy-drain /var/lib/leetplus/deploy-receipts
install -d -o root -g leetplus-runtime -m 0750 /etc/leetplus/rollback-releases
install -d -o root -g root -m 0755 /run/systemd/system

while IFS=' ' read -r expected_digest relative_path extra; do
  [[ "$expected_digest" =~ ^[0-9a-f]{64}$ && "$relative_path" == ./* && -z "${extra:-}" ]] \
    || die 'inner control manifest row is malformed'
  source_path="${DEPLOY_ROOT}/${relative_path#./}"
  destination_path="${CONTROL_ROOT}/${relative_path#./}"
  install -d -o root -g root -m 0555 "$(dirname -- "$destination_path")"
  install -o root -g root -m 0444 "$source_path" "$destination_path"
  [[ "$(sha256sum "$destination_path" | awk '{ print $1 }')" == "$expected_digest" ]] \
    || die "copied control member drifted: ${relative_path}"
done < "$DEPLOY_ROOT/CONTROL_BUNDLE_SHA256SUMS"
install -o root -g root -m 0400 "$DEPLOY_ROOT/CONTROL_BUNDLE_SHA256SUMS" \
  "$CONTROL_ROOT/CONTROL_BUNDLE_SHA256SUMS"
find -P /srv/leetplus/control-bundles -type d -exec chmod 0555 {} +
install -o root -g root -m 0500 "$AUTHORITY_SOURCE" "$AUTHORITY_PATH"
manifest_digest="$(sha256sum "$CONTROL_ROOT/CONTROL_BUNDLE_SHA256SUMS" | awk '{ print $1 }')"
printf '%s\n' "$manifest_digest" > /etc/leetplus/rollback-control-manifest.sha256
chown root:root /etc/leetplus/rollback-control-manifest.sha256
chmod 0400 /etc/leetplus/rollback-control-manifest.sha256

release_root="/srv/leetplus/rollback-releases"
release_directory="${release_root}/${LEGACY_SHA}"
install -d -o root -g leetplus-runtime -m 0550 \
  "$release_root" "$release_directory/apps/api/dist" \
  "$release_directory/apps/web/node_modules/next/dist/bin" \
  "$release_directory/apps/web/.next/cache"
printf '%s\n' "$LEGACY_SHA" > "$release_directory/.leetplus-source-sha"
printf 'fixture-api\n' > "$release_directory/apps/api/dist/main.js"
printf '#!/usr/bin/node\n' > "$release_directory/apps/web/node_modules/next/dist/bin/next"
printf '%s\n' "$LEGACY_SHA" > "$release_directory/apps/web/.next/BUILD_ID"
ln -s main.js "$release_directory/apps/api/dist/main-link.js"
printf 'apps/api/dist/main-link.js|main.js\n' > "$release_directory/N_MINUS_ONE_SYMLINKS"
(
  cd -- "$release_directory"
  find . -xdev -path './apps/web/.next/cache' -prune -o -type f \
    ! -path './N_MINUS_ONE_SHA256SUMS' -print0 \
    | LC_ALL=C sort -z | xargs -0 sha256sum > N_MINUS_ONE_SHA256SUMS
)
chown -R root:leetplus-runtime "$release_root"
find -P "$release_root" -type d -exec chmod 0550 {} +
find -P "$release_root" -type f -exec chmod 0440 {} +
chmod 0550 "$release_directory/apps/web/node_modules/next/dist/bin/next"
[[ -L "$release_directory/apps/api/dist/main-link.js" \
  && "$(readlink -- "$release_directory/apps/api/dist/main-link.js")" == main.js \
  && "$(stat -c '%U:%G:%a:%h' -- "$release_directory/apps/api/dist/main-link.js")" == 'root:leetplus-runtime:777:1' ]] \
  || die 'fixture did not create the exact Linux symlink permission boundary'
[[ "$(stat -c '%h' -- "$release_directory/apps/web/.next/cache")" -ge 2 ]] \
  || die 'fixture did not create a normal Linux directory link count'

cat > /etc/leetplus/rollback-runtime.env <<'RUNTIME_ENV'
NODE_ENV=production
JWT_SECRET=fixture-only-strong-jwt-secret-00000000000000000000000000000000
DATABASE_URL=postgresql://leetplus_legacy_rollback:fixture@127.0.0.1:5432/leetplus?application_name=leetplus-nminus1-http-7de04ff4&options=-c%20role%3Dleetplus&schema=public
RUNTIME_ENV
cat > /etc/leetplus/rollback-web-runtime.env <<'WEB_RUNTIME_ENV'
NODE_ENV=production
WEB_RUNTIME_ENV
cat > /etc/leetplus/pg_service.conf <<'PG_SERVICE'
[leetplus_legacy_drain_audit]
host=127.0.0.1
port=5432
dbname=leetplus
user=leetplus_legacy_drain_audit
PG_SERVICE
cat > /etc/leetplus/legacy-drain-database-target.conf <<'DB_TARGET'
DATABASE_NAME=leetplus
DATABASE_HOST=127.0.0.1
DATABASE_PORT=5432
DATABASE_SYSTEM_IDENTIFIER=123456789
DATABASE_AUDIT_SESSION_USER=leetplus_legacy_drain_audit
DB_TARGET
cp "$DEPLOY_ROOT/systemd/legacy-drain-units.conf.example" /etc/leetplus/legacy-drain-units.conf
cat > /etc/leetplus/legacy-rollback-smoke.env <<'SMOKE_ENV'
SMOKE_OWNER_EMAIL=fixture@example.invalid
SMOKE_OWNER_PASSWORD=fixture-only
SMOKE_TENANT_SLUG=fixture
SMOKE_ENV
chown root:leetplus-api-runtime /etc/leetplus/rollback-runtime.env
chown root:leetplus-web-runtime /etc/leetplus/rollback-web-runtime.env
chmod 0640 /etc/leetplus/rollback-runtime.env /etc/leetplus/rollback-web-runtime.env
chown root:root /etc/leetplus/pg_service.conf \
  /etc/leetplus/legacy-drain-database-target.conf \
  /etc/leetplus/legacy-drain-units.conf /etc/leetplus/legacy-rollback-smoke.env
chmod 0600 /etc/leetplus/pg_service.conf \
  /etc/leetplus/legacy-drain-database-target.conf \
  /etc/leetplus/legacy-drain-units.conf /etc/leetplus/legacy-rollback-smoke.env

# A deterministic systemd manager facade is installed only inside the guarded
# disposable root. The installer still executes its full production path,
# fixed commands, NSS/proc checks, persistent masks/drop-ins and fsync logic.
rm -f /usr/bin/systemctl
cat > /usr/bin/systemctl <<'SYSTEMCTL_STUB'
#!/usr/bin/bash
set -euo pipefail
legacy_sha='7de04ff4ccc814494810730be3fa6bf661097b07'
command_name="${1:-}"; shift || true
property_value() {
  local unit="$1" property="$2" fragment=''
  case "$unit" in
    leetplus-api-rollback@*.service) fragment='/etc/systemd/system/leetplus-api-rollback@.service' ;;
    leetplus-web-rollback@*.service) fragment='/etc/systemd/system/leetplus-web-rollback@.service' ;;
    leetplus-rollback-egress.service) fragment='/etc/systemd/system/leetplus-rollback-egress.service' ;;
    leetplus-blue-green-recovery.service) fragment='/etc/systemd/system/leetplus-blue-green-recovery.service' ;;
    leetplus-blue-green-recovery-watchdog.service) fragment='/etc/systemd/system/leetplus-blue-green-recovery-watchdog.service' ;;
    leetplus-blue-green-recovery.timer) fragment='/etc/systemd/system/leetplus-blue-green-recovery.timer' ;;
  esac
  case "$property" in
    LoadState)
      if [[ -L "/etc/systemd/system/${unit}" \
        && "$(readlink -- "/etc/systemd/system/${unit}")" == /dev/null ]]; then
        printf 'masked\n'
      elif [[ -L "/run/systemd/system/${unit}" \
        && "$(readlink -- "/run/systemd/system/${unit}")" == /dev/null ]] \
        && { [[ "$unit" == leetplus-rollback-egress.service \
            && -e /run/fixture-systemd255-loaded-egress ]] \
          || [[ "$unit" =~ ^leetplus-blue-green-recovery(-watchdog)?\.(service|timer)$ \
            && -e /run/fixture-systemd255-loaded-recovery ]]; }; then
        printf 'loaded\n'
      elif [[ -L "/run/systemd/system/${unit}" \
        && "$(readlink -- "/run/systemd/system/${unit}")" == /dev/null ]]; then
        printf 'masked\n'
      else
        printf 'loaded\n'
      fi
      ;;
    ActiveState) printf 'inactive\n' ;;
    SubState) printf 'dead\n' ;;
    MainPID|ControlPID|ExecMainPID) printf '0\n' ;;
    ControlGroup) printf '\n' ;;
    DropInPaths)
      if [[ "$unit" == nginx.service ]]; then
        printf '/etc/systemd/system/nginx.service.d/leetplus-blue-green-recovery.conf\n'
      elif [[ "$unit" =~ ^leetplus-(rollback-egress|blue-green-recovery(-watchdog)?)\.(service|timer)$ \
        && -f "/etc/systemd/system/${unit}.d/90-leetplus-control-install-fence.conf" ]]; then
        if [[ "$unit" == leetplus-blue-green-recovery.service \
          && -e /run/fixture-recovery-dropin-unsafe ]]; then
          printf '\n'
        else
          printf '/etc/systemd/system/%s.d/90-leetplus-control-install-fence.conf\n' "$unit"
        fi
      else
        printf '\n'
      fi
      ;;
    FragmentPath) printf '%s\n' "$fragment" ;;
    Id|Names) printf '%s\n' "$unit" ;;
    UnitFileState)
      if [[ "$unit" == leetplus-blue-green-recovery-watchdog.service ]]; then
        printf 'static\n'
      elif [[ "$unit" == leetplus-blue-green-recovery.service \
        && -e /run/fixture-recovery-enabled ]]; then
        printf 'enabled\n'
      else
        printf 'disabled\n'
      fi
      ;;
    Requires) printf 'leetplus-rollback-egress.service\n' ;;
    ConditionResult)
      if [[ "$unit" =~ ^leetplus-(rollback-egress|blue-green-recovery(-watchdog)?)\.(service|timer)$ \
        && -f /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.fence \
        && -f "/etc/systemd/system/${unit}.d/90-leetplus-control-install-fence.conf" \
        && ! ( "$unit" == leetplus-rollback-egress.service \
          && -e /run/fixture-egress-condition-unsafe ) \
        && ! ( "$unit" == leetplus-blue-green-recovery.service \
          && -e /run/fixture-recovery-condition-unsafe ) ]]; then
        printf 'no\n'
      else
        printf 'yes\n'
      fi
      ;;
    NeedDaemonReload)
      [[ ! -e /run/fixture-stale-manager && ! -e /run/fixture-egress-need-reload ]] \
        && printf 'no\n' || printf 'yes\n'
      ;;
    User) [[ "$unit" == leetplus-api-* ]] && printf 'leetplus-api-nminus1\n' || printf 'leetplus-web-nminus1\n' ;;
    Group) printf 'leetplus-runtime\n' ;;
    WorkingDirectory)
      if [[ "$unit" == leetplus-api-rollback@leetplus-rollback-egress.service ]]; then
        printf '/srv/leetplus/rollback-releases/leetplus-rollback-egress\n'
      elif [[ "$unit" == leetplus-web-rollback@leetplus-rollback-egress.service ]]; then
        printf '/srv/leetplus/rollback-releases/leetplus-rollback-egress/apps/web\n'
      elif [[ "$unit" == leetplus-api-* ]]; then
        printf '/srv/leetplus/rollback-releases/%s\n' "$legacy_sha"
      else
        printf '/srv/leetplus/rollback-releases/%s/apps/web\n' "$legacy_sha"
      fi
      ;;
    Environment) printf 'PATH=/usr/sbin:/usr/bin:/sbin:/bin\n' ;;
    EnvironmentFiles)
      if [[ "$unit" == leetplus-api-* ]]; then
        printf '{ path=/etc/leetplus/rollback-runtime.env ; ignore_errors=no } '
      else
        printf '{ path=/etc/leetplus/rollback-web-runtime.env ; ignore_errors=no } '
      fi
      printf '{ path=/etc/leetplus/rollback-releases/%s.env ; ignore_errors=no } ' "$legacy_sha"
      printf '{ path=/etc/leetplus/rollback-safe.env ; ignore_errors=no }\n'
      ;;
    ExecStart)
      if [[ "$unit" == leetplus-api-* ]]; then
        printf '{ path=/usr/bin/node ; argv[]=/usr/bin/node /usr/local/libexec/leetplus/legacy-rollback-auth-edge.mjs --release-sha %s ; ignore_errors=no ; }\n' "$legacy_sha"
      elif [[ -e /run/fixture-exec-start-unsafe ]]; then
        printf '{ path=/usr/bin/node ; argv[]=/usr/bin/node /srv/leetplus/rollback-releases/%s/apps/web/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3399 ; ignore_errors=no ; }\n' "$legacy_sha"
      else
        printf '{ path=/usr/bin/node ; argv[]=/usr/bin/node /srv/leetplus/rollback-releases/%s/apps/web/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${WEB_PORT} ; ignore_errors=no ; }\n' "$legacy_sha"
      fi
      ;;
    UnsetEnvironment|RestrictAddressFamilies|SocketBindDeny)
      awk -F= -v property="$property" '$1 == property { print substr($0, length($1) + 2) }' "$fragment" | paste -sd' ' -
      ;;
    SocketBindAllow)
      awk -F= -v property="$property" '$1 == property { print substr($0, length($1) + 2) }' "$fragment" \
        | sed -E 's/^((ipv4|ipv6):(tcp|udp)):/\1/' \
        | { if [[ -e /run/fixture-socket-bind-unsafe && "$unit" == leetplus-api-* ]]; then
              grep -F -v 'ipv4:tcp4301'
            else
              cat
            fi; } \
        | paste -sd' ' -
      ;;
    NoNewPrivileges|PrivateTmp|PrivateDevices|ProtectHome) printf 'yes\n' ;;
    ProtectSystem) printf 'strict\n' ;;
    RestrictNetworkInterfaces) printf 'lo\n' ;;
    IPAddressDeny)
      [[ ! -e /run/fixture-ip-address-unsafe ]] \
        && printf '::/0 0.0.0.0/0\n' || printf '0.0.0.0/0\n'
      ;;
    IPAddressAllow) printf '127.0.0.0/8 ::1/128\n' ;;
    *) printf '\n' ;;
  esac
}
case "$command_name" in
  list-units)
    if [[ -e /run/fixture-systemd255-template-aliases \
      && ( -L /run/systemd/system/leetplus-rollback-egress.service \
        || "$(tr -d '\r\n' < /run/fixture-systemd255-template-aliases)" == always ) ]]; then
      printf '%s loaded inactive dead fixture\n' \
        leetplus-api-rollback@leetplus-rollback-egress.service \
        leetplus-web-rollback@leetplus-rollback-egress.service
    fi
    ;;
  list-unit-files) exit 0 ;;
  is-active|is-enabled) exit 3 ;;
  daemon-reload)
    count=0; [[ ! -f /run/fixture-daemon-reload-count ]] || count="$(</run/fixture-daemon-reload-count)"
    count=$((count + 1)); printf '%s\n' "$count" > /run/fixture-daemon-reload-count
    if [[ -e /run/fixture-fail-second-reload && "$count" == 2 ]]; then exit 90; fi
    exit 0
    ;;
  mask)
    mask_root=/etc/systemd/system
    for argument in "$@"; do
      [[ "$argument" != --runtime ]] || mask_root=/run/systemd/system
    done
    for argument in "$@"; do
      [[ "$argument" == leetplus-* ]] || continue
      ln -s /dev/null "${mask_root}/${argument}"
    done
    ;;
  unmask)
    mask_root=/etc/systemd/system
    for argument in "$@"; do
      [[ "$argument" != --runtime ]] || mask_root=/run/systemd/system
    done
    for argument in "$@"; do
      [[ "$argument" == leetplus-* ]] || continue
      rm -f "${mask_root}/${argument}"
    done
    ;;
  show)
    unit=''; value_only=false; declare -a properties=()
    for argument in "$@"; do
      case "$argument" in
        --value) value_only=true ;;
        --property=*) properties+=("${argument#--property=}") ;;
        --*) ;;
        *) [[ -n "$unit" ]] || unit="$argument" ;;
      esac
    done
    case "$unit" in
      leetplus-api-rollback@.service|leetplus-web-rollback@.service)
        printf 'Unit name %s requires an instance.\n' "$unit" >&2
        exit 64
        ;;
    esac
    if ((${#properties[@]} == 0)); then
      load_state="$(property_value "$unit" LoadState)"
      unit_file_state=enabled
      [[ "$load_state" != masked ]] || unit_file_state=masked
      printf '%s\n' \
        'ActiveState=inactive' 'SubState=dead' 'MainPID=0' \
        "ControlGroup=/system.slice/${unit}" \
        "LoadState=${load_state}" "UnitFileState=${unit_file_state}" 'NeedDaemonReload=no'
      exit 0
    fi
    for property in "${properties[@]}"; do
      case "$unit:$property" in
        *.timer:MainPID|*.timer:ControlGroup) continue ;;
      esac
      value="$(property_value "$unit" "$property")"
      if [[ "$value_only" == true ]]; then printf '%s\n' "$value"; else printf '%s=%s\n' "$property" "$value"; fi
    done
    ;;
  *) exit 64 ;;
esac
SYSTEMCTL_STUB
chmod 0755 /usr/bin/systemctl
rm -f /usr/bin/ss
cat > /usr/bin/ss <<'SS_STUB'
#!/usr/bin/bash
exit 0
SS_STUB
chmod 0755 /usr/bin/ss

chmod 0660 "$release_directory/apps/api/dist/main.js"
if "$AUTHORITY_PATH" > /run/fixture-writable-regular.out 2>&1; then
  die 'installer accepted a group-writable regular release file'
fi
grep -F 'rollback release ownership/write boundary is unsafe' \
  /run/fixture-writable-regular.out >/dev/null || {
  sed -n '1,120p' /run/fixture-writable-regular.out >&2
  die 'writable regular-file negative failed for another invariant'
}
chmod 0440 "$release_directory/apps/api/dist/main.js"

touch /run/fixture-fail-second-reload
if "$AUTHORITY_PATH" > /run/fixture-first-install.out 2>&1; then
  die 'installer ignored the simulated post-drop-in/pre-marker daemon-reload loss'
fi
if ! grep -F -x \
  'install-legacy-rollback-contour: systemd daemon-reload failed or timed out during control installation' \
  /run/fixture-first-install.out >/dev/null; then
  sed -n '1,120p' /run/fixture-first-install.out >&2
  die 'first install failed before the simulated pre-marker daemon-reload loss'
fi
[[ -f /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.preparing ]] \
  || die 'pre-marker failure did not leave the durable preparation record'
[[ ! -e /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.fence ]] \
  || die 'pre-marker failure published the boot-fence commit record too early'
[[ ! -e /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.intent ]] \
  || die 'pre-marker failure published the install intent too early'
[[ ! -e /usr/local/libexec/leetplus/preflight-legacy-rollback.sh ]] \
  || die 'pre-marker failure crossed the first destination-mutation boundary'
for unit in leetplus-api-rollback@.service leetplus-api-rollback@${LEGACY_SHA}.service \
  leetplus-web-rollback@.service leetplus-web-rollback@${LEGACY_SHA}.service \
  leetplus-rollback-egress.service leetplus-blue-green-recovery.service \
  leetplus-blue-green-recovery-watchdog.service leetplus-blue-green-recovery.timer; do
  [[ -f "/etc/systemd/system/${unit}.d/90-leetplus-control-install-fence.conf" ]] \
    || die "persistent pre-commit fence is absent: ${unit}"
done
rm -f /run/fixture-fail-second-reload
"$AUTHORITY_PATH" > /run/fixture-same-boot-resumed-install.out
grep -F -x 'LEGACY_ROLLBACK_CONTOUR_INSTALLED=true' \
  /run/fixture-same-boot-resumed-install.out >/dev/null
[[ ! -e /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.preparing \
  && ! -e /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.fence \
  && ! -e /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.intent ]] \
  || die 'same-boot resumed installer left a durable transaction residue'
for unit in leetplus-api-rollback@.service leetplus-api-rollback@${LEGACY_SHA}.service \
  leetplus-web-rollback@.service leetplus-web-rollback@${LEGACY_SHA}.service \
  leetplus-rollback-egress.service leetplus-blue-green-recovery.service \
  leetplus-blue-green-recovery-watchdog.service leetplus-blue-green-recovery.timer; do
  [[ ! -e "/run/systemd/system/${unit}" && ! -L "/run/systemd/system/${unit}" ]] \
    || die "same-boot resumed installer left a runtime mask: ${unit}"
done

# Repeat the same preparatory failure and prove that reboot recovery remains
# valid when /run masks disappear while the durable preparation/drop-ins stay.
printf '\nfixture-reboot-resume-drift\n' >> /etc/nginx/leetplus/upstreams/blue.conf
printf '0\n' > /run/fixture-daemon-reload-count
touch /run/fixture-fail-second-reload
if "$AUTHORITY_PATH" > /run/fixture-reboot-preparation.out 2>&1; then
  die 'installer ignored the second simulated post-drop-in/pre-marker daemon-reload loss'
fi
grep -F -x \
  'install-legacy-rollback-contour: systemd daemon-reload failed or timed out during control installation' \
  /run/fixture-reboot-preparation.out >/dev/null
[[ -f /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.preparing ]] \
  || die 'reboot fixture did not leave the durable preparation record'
# Model reboot: /run masks disappear, while durable drop-ins/preparing survive.
find /run/systemd/system -maxdepth 1 -type l -name 'leetplus-*' -delete
rm -f /run/fixture-fail-second-reload
"$AUTHORITY_PATH" > /run/fixture-resumed-install.out
grep -F -x 'LEGACY_ROLLBACK_CONTOUR_INSTALLED=true' /run/fixture-resumed-install.out >/dev/null
[[ ! -e /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.preparing \
  && ! -e /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.fence \
  && ! -e /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.intent ]] \
  || die 'resumed installer left a durable transaction residue'
[[ "$(stat -c '%U:%G:%a' -- /etc/leetplus/rollback-releases)" == 'root:leetplus-runtime:750' \
  && "$(stat -c '%h' -- /etc/leetplus/rollback-releases)" -ge 2 ]] \
  || die 'group-owned runtime overlay directory contract is not exact'
[[ "$(stat -c '%U:%G:%a' -- "$release_directory/apps/web/.next/cache")" == 'root:leetplus-runtime:550' ]] \
  || die 'installed immutable cache bind target contract is not exact'

touch /run/fixture-stale-manager
if "$AUTHORITY_PATH" > /run/fixture-stale-manager.out 2>&1; then
  die 'no-drift installer accepted a stale effective systemd generation'
fi
grep -F 'effective loaded control unit source/drop-in generation is not exact' \
  /run/fixture-stale-manager.out >/dev/null
rm -f /run/fixture-stale-manager
"$AUTHORITY_PATH" > /run/fixture-no-drift.out
grep -F -x 'LEGACY_ROLLBACK_CONTOUR_INSTALL_DRIFT=false' /run/fixture-no-drift.out >/dev/null

# An admitted predecessor stopped before its fence/intent commit on the real
# systemd 255 host. Prove that only its pinned preparation pair plus the exact
# complete runtime-mask set can be resumed by this generation.
printf '\nfixture-compatible-predecessor-drift\n' >> /etc/nginx/leetplus/upstreams/blue.conf
cat > /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.preparing <<'PREDECESSOR_PREPARING'
CONTRACT=LEETPLUS_SCHEDULER_FREE_CONTROL_INSTALL_V1
CONTROL_MANIFEST_SHA256=815849b9225b612f4468773b3fb883782eda5abbc3dcc8d761db530a3d5a28d8
INSTALL_PLAN_SHA256=86bfb46c71d385051b5087c6eb0231cf77fb36798372dc9f4540d51a9edac849
ORIGINAL_DRIFT_DESTINATIONS=/etc/nginx/leetplus/upstreams/blue.conf
PREEXISTING_RUNTIME_MASKS=NONE
PREDECESSOR_PREPARING
chown root:root /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.preparing
chmod 0600 /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.preparing
systemctl mask --runtime --no-reload \
  leetplus-api-rollback@.service leetplus-api-rollback@${LEGACY_SHA}.service \
  leetplus-web-rollback@.service leetplus-web-rollback@${LEGACY_SHA}.service \
  leetplus-rollback-egress.service leetplus-blue-green-recovery.service \
  leetplus-blue-green-recovery-watchdog.service leetplus-blue-green-recovery.timer
systemctl daemon-reload
touch /run/fixture-systemd255-template-aliases
touch /run/fixture-systemd255-loaded-egress
if "$AUTHORITY_PATH" > /run/fixture-compatible-predecessor-loaded-egress.out 2>&1; then
  die 'installer accepted a loaded masked egress before the durable boot fence commit'
fi
grep -F 'loaded masked protected unit lacks the exact uncommitted preparation: leetplus-rollback-egress.service' \
  /run/fixture-compatible-predecessor-loaded-egress.out >/dev/null
rm -f /run/fixture-systemd255-loaded-egress
touch /run/fixture-systemd255-loaded-recovery
if "$AUTHORITY_PATH" > /run/fixture-compatible-predecessor-loaded-recovery.out 2>&1; then
  die 'installer accepted loaded masked recovery units before the durable boot fence commit'
fi
grep -F 'loaded masked protected unit lacks the exact uncommitted preparation: leetplus-blue-green-recovery.service' \
  /run/fixture-compatible-predecessor-loaded-recovery.out >/dev/null
rm -f /run/fixture-systemd255-loaded-recovery
"$AUTHORITY_PATH" > /run/fixture-compatible-predecessor.out
grep -F -x 'LEGACY_ROLLBACK_CONTOUR_INSTALLED=true' \
  /run/fixture-compatible-predecessor.out >/dev/null
[[ ! -e /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.preparing ]] \
  || die 'compatible predecessor recovery left its preparation record'
rm -f /run/fixture-systemd255-template-aliases

# The latest admitted production generation stopped in PREPARING after all
# runtime masks were committed, while previously used systemd 255 units stayed
# cached as loaded/inactive. Reproduce its exact record and prove that the next
# generation first commits an effective boot fence, rejects an unsafe drop-in,
# leaves destination bytes untouched, and then rolls the transaction forward.
printf '\nfixture-compatible-loaded-predecessor-drift\n' \
  >> /usr/local/libexec/leetplus/preflight-legacy-rollback.sh
cat > /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.preparing <<'LOADED_PREDECESSOR_PREPARING'
CONTRACT=LEETPLUS_SCHEDULER_FREE_CONTROL_INSTALL_V1
CONTROL_MANIFEST_SHA256=bc69b6cfd9189ed1877b3fcaec4dfe5746fd20e5ba43b4b18f318b515a89f532
INSTALL_PLAN_SHA256=a73ce1452933b4b620a5ab46a963592d4e53afd3e385f5882235f41d944b9ef6
ORIGINAL_DRIFT_DESTINATIONS=/usr/local/libexec/leetplus/preflight-legacy-rollback.sh
PREEXISTING_RUNTIME_MASKS=NONE
LOADED_PREDECESSOR_PREPARING
chown root:root /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.preparing
chmod 0600 /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.preparing
[[ "$(sha256sum /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.preparing | awk '{ print $1 }')" \
  == a13e4ee4db0322bb7b1ef74677e638cf9aa7bc842bcf68abd465c9442f525d65 ]] \
  || die 'loaded predecessor preparation fixture lost its exact production identity'
systemctl mask --runtime --no-reload \
  leetplus-api-rollback@.service leetplus-api-rollback@${LEGACY_SHA}.service \
  leetplus-web-rollback@.service leetplus-web-rollback@${LEGACY_SHA}.service \
  leetplus-rollback-egress.service leetplus-blue-green-recovery.service \
  leetplus-blue-green-recovery-watchdog.service leetplus-blue-green-recovery.timer
systemctl daemon-reload
touch /run/fixture-systemd255-loaded-egress /run/fixture-systemd255-loaded-recovery \
  /run/fixture-recovery-enabled /run/fixture-recovery-condition-unsafe \
  /run/fixture-recovery-dropin-unsafe
if "$AUTHORITY_PATH" > /run/fixture-compatible-loaded-predecessor-unsafe.out 2>&1; then
  die 'installer accepted a loaded recovery unit before its boot fence became effective'
fi
if ! grep -F 'loaded fenced current unit is not held by the exact effective boot fence: leetplus-blue-green-recovery.service' \
  /run/fixture-compatible-loaded-predecessor-unsafe.out >/dev/null; then
  printf '%s\n' 'loaded predecessor negative stopped at an unexpected guard:' >&2
  cat /run/fixture-compatible-loaded-predecessor-unsafe.out >&2
  die 'loaded predecessor negative stopped at an unexpected guard'
fi
[[ -f /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.fence \
  && ! -e /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.intent ]] \
  || die 'loaded predecessor negative did not stop between fence and intent commits'
if cmp -s -- "$DEPLOY_ROOT/preflight-legacy-rollback.sh" \
  /usr/local/libexec/leetplus/preflight-legacy-rollback.sh; then
  die 'loaded predecessor negative mutated its drifting destination before install intent'
fi
rm -f /run/fixture-recovery-dropin-unsafe
"$AUTHORITY_PATH" > /run/fixture-compatible-loaded-predecessor.out
grep -F -x 'LEGACY_ROLLBACK_CONTOUR_INSTALLED=true' \
  /run/fixture-compatible-loaded-predecessor.out >/dev/null
for record_name in preparing fence intent; do
  [[ ! -e "/var/lib/leetplus/deploy-receipts/scheduler-free-control-install.${record_name}" ]] \
    || die "loaded predecessor recovery left transaction residue: ${record_name}"
done
cmp -s -- "$DEPLOY_ROOT/preflight-legacy-rollback.sh" \
  /usr/local/libexec/leetplus/preflight-legacy-rollback.sh \
  || die 'loaded predecessor recovery did not install the admitted preflight bytes'
rm -f /run/fixture-systemd255-loaded-egress /run/fixture-systemd255-loaded-recovery \
  /run/fixture-recovery-enabled /run/fixture-recovery-condition-unsafe

# The next admitted generation encountered the same aliases only after the
# predecessor had durably committed its exact fence and PREPARED intent. Model
# the byte-identical production records and prove bounded cross-generation
# roll-forward, including preservation of the old record generation through
# POST_ATTESTED and complete cleanup only after the new bytes are exact.
install -o root -g root -m 0644 \
  "$FENCED_PREDECESSOR_FIXTURE_ROOT/leetplus-rollback-egress.service" \
  /etc/systemd/system/leetplus-rollback-egress.service
[[ "$(sha256sum /etc/systemd/system/leetplus-rollback-egress.service | awk '{ print $1 }')" \
  == f5946711d0b638c13d84af64c576cf41e128e51491082e0ae10120fd3615884c ]] \
  || die 'fenced predecessor egress fixture lost its exact production identity'
for record_name in preparing fence intent; do
  install -o root -g root -m 0600 \
    "$FENCED_PREDECESSOR_FIXTURE_ROOT/scheduler-free-control-install.${record_name}" \
    "/var/lib/leetplus/deploy-receipts/scheduler-free-control-install.${record_name}"
done
[[ "$(sha256sum /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.preparing | awk '{ print $1 }')" \
  == ca3888a804c8087528962dab6829db6737952045816737cd4c73a5a76d9511fd \
  && "$(sha256sum /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.fence | awk '{ print $1 }')" \
  == 4d19f787eed9136f32e9fce87b4e42d0ad99cfe0acd2eb0a67f889f8310f435c \
  && "$(sha256sum /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.intent | awk '{ print $1 }')" \
  == c44e87d16ab8f9da0309aba41928210f3e0b970d29a2288f5811ea9998831b7d ]] \
  || die 'fenced predecessor fixture records lost their exact production identities'
for unit in leetplus-api-rollback@.service leetplus-api-rollback@${LEGACY_SHA}.service \
  leetplus-web-rollback@.service leetplus-web-rollback@${LEGACY_SHA}.service \
  leetplus-rollback-egress.service leetplus-blue-green-recovery.service \
  leetplus-blue-green-recovery-watchdog.service leetplus-blue-green-recovery.timer; do
  install -d -o root -g root -m 0755 "/etc/systemd/system/${unit}.d"
  printf '%s\n' \
    '[Unit]' \
    'ConditionPathExists=!/var/lib/leetplus/deploy-receipts/scheduler-free-control-install.fence' \
    > "/etc/systemd/system/${unit}.d/90-leetplus-control-install-fence.conf"
  chown root:root "/etc/systemd/system/${unit}.d/90-leetplus-control-install-fence.conf"
  chmod 0644 "/etc/systemd/system/${unit}.d/90-leetplus-control-install-fence.conf"
done
systemctl mask --runtime --no-reload \
  leetplus-api-rollback@.service leetplus-api-rollback@${LEGACY_SHA}.service \
  leetplus-web-rollback@.service leetplus-web-rollback@${LEGACY_SHA}.service \
  leetplus-rollback-egress.service leetplus-blue-green-recovery.service \
  leetplus-blue-green-recovery-watchdog.service leetplus-blue-green-recovery.timer
systemctl daemon-reload
touch /run/fixture-systemd255-template-aliases
touch /run/fixture-systemd255-loaded-egress
touch /run/fixture-systemd255-loaded-recovery
printf '\nfixture-loaded-egress-digest-drift\n' >> /etc/systemd/system/leetplus-rollback-egress.service
if "$AUTHORITY_PATH" > /run/fixture-fenced-predecessor-egress-drift.out 2>&1; then
  die 'installer accepted an unpinned loaded egress byte during fenced recovery'
fi
grep -F 'compatible loaded egress unit file digest is not exact' \
  /run/fixture-fenced-predecessor-egress-drift.out >/dev/null
install -o root -g root -m 0644 \
  "$FENCED_PREDECESSOR_FIXTURE_ROOT/leetplus-rollback-egress.service" \
  /etc/systemd/system/leetplus-rollback-egress.service
systemctl daemon-reload
touch /run/fixture-egress-condition-unsafe
if "$AUTHORITY_PATH" > /run/fixture-fenced-predecessor-egress-condition.out 2>&1; then
  die 'installer accepted a loaded egress without the effective false boot condition'
fi
grep -F 'loaded masked egress is not held by the exact effective boot fence' \
  /run/fixture-fenced-predecessor-egress-condition.out >/dev/null
rm -f /run/fixture-egress-condition-unsafe
printf '\nfixture-loaded-recovery-digest-drift\n' \
  >> /etc/systemd/system/leetplus-blue-green-recovery.service
if "$AUTHORITY_PATH" > /run/fixture-fenced-predecessor-recovery-drift.out 2>&1; then
  die 'installer accepted a drifting loaded recovery unit during fenced recovery'
fi
grep -F 'loaded fenced current unit file identity is not exact: leetplus-blue-green-recovery.service' \
  /run/fixture-fenced-predecessor-recovery-drift.out >/dev/null
install -o root -g root -m 0644 \
  "$DEPLOY_ROOT/systemd/leetplus-blue-green-recovery.service" \
  /etc/systemd/system/leetplus-blue-green-recovery.service
systemctl daemon-reload
touch /run/fixture-recovery-condition-unsafe
if "$AUTHORITY_PATH" > /run/fixture-fenced-predecessor-recovery-condition.out 2>&1; then
  die 'installer accepted a loaded recovery unit without the effective false boot condition'
fi
grep -F 'loaded fenced current unit is not held by the exact effective boot fence: leetplus-blue-green-recovery.service' \
  /run/fixture-fenced-predecessor-recovery-condition.out >/dev/null
rm -f /run/fixture-recovery-condition-unsafe
touch /run/fixture-ip-address-unsafe
if "$AUTHORITY_PATH" > /run/fixture-post-attested-ip-normalization.out 2>&1; then
  die 'installer accepted an incomplete effective systemd IP deny normalization'
fi
grep -F 'effective rollback IP address boundary is not exact: leetplus-api-rollback@7de04ff4ccc814494810730be3fa6bf661097b07.service' \
  /run/fixture-post-attested-ip-normalization.out >/dev/null
[[ "$(sha256sum /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.intent | awk '{ print $1 }')" \
  == 73f199b02fd9202bc69853151dc2109f69cfa2fef8ab2e97abd659b031291c8a \
  && "$(tail -n 1 /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.intent)" \
  == 'PHASE=POST_ATTESTED' ]] \
  || die 'effective-IP negative did not retain the exact post-attested recovery intent'
for unit in leetplus-api-rollback@.service leetplus-api-rollback@${LEGACY_SHA}.service \
  leetplus-web-rollback@.service leetplus-web-rollback@${LEGACY_SHA}.service \
  leetplus-rollback-egress.service leetplus-blue-green-recovery.service \
  leetplus-blue-green-recovery-watchdog.service leetplus-blue-green-recovery.timer; do
  [[ ! -e "/run/systemd/system/${unit}" && ! -L "/run/systemd/system/${unit}" \
    && ! -e "/etc/systemd/system/${unit}.d/90-leetplus-control-install-fence.conf" ]] \
    || die "post-attested effective-IP negative retained a fence or mask: ${unit}"
done
rm -f /run/fixture-ip-address-unsafe
touch /run/fixture-socket-bind-unsafe
if "$AUTHORITY_PATH" > /run/fixture-post-attested-socket-bind-normalization.out 2>&1; then
  die 'installer accepted an incomplete effective systemd socket-bind allow set'
fi
grep -F 'effective rollback SocketBindAllow is not exact: leetplus-api-rollback@7de04ff4ccc814494810730be3fa6bf661097b07.service' \
  /run/fixture-post-attested-socket-bind-normalization.out >/dev/null
[[ "$(sha256sum /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.intent | awk '{ print $1 }')" \
  == 73f199b02fd9202bc69853151dc2109f69cfa2fef8ab2e97abd659b031291c8a \
  && "$(tail -n 1 /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.intent)" \
  == 'PHASE=POST_ATTESTED' ]] \
  || die 'effective socket-bind negative did not retain the exact post-attested recovery intent'
rm -f /run/fixture-socket-bind-unsafe
touch /run/fixture-exec-start-unsafe
if "$AUTHORITY_PATH" > /run/fixture-post-attested-exec-start.out 2>&1; then
  die 'installer accepted a non-admitted effective Web ExecStart argv'
fi
grep -F 'effective rollback ExecStart is not exact: leetplus-web-rollback@7de04ff4ccc814494810730be3fa6bf661097b07.service' \
  /run/fixture-post-attested-exec-start.out >/dev/null
[[ "$(sha256sum /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.intent | awk '{ print $1 }')" \
  == 73f199b02fd9202bc69853151dc2109f69cfa2fef8ab2e97abd659b031291c8a \
  && "$(tail -n 1 /var/lib/leetplus/deploy-receipts/scheduler-free-control-install.intent)" \
  == 'PHASE=POST_ATTESTED' ]] \
  || die 'effective ExecStart negative did not retain the exact post-attested recovery intent'
rm -f /run/fixture-exec-start-unsafe
# The admitted production-control installer republishes this shared fixed
# authority as root:root 0500. Reproduce that exact overlap after POST_ATTESTED
# and prove recovery does not misclassify the control generation as drifted.
install -o root -g root -m 0500 \
  "$DEPLOY_ROOT/blue-green-cutover.sh" \
  /usr/local/sbin/leetplus-blue-green-cutover
[[ "$(stat -c '%U:%G:%a:%h' -- /usr/local/sbin/leetplus-blue-green-cutover)" \
  == 'root:root:500:1' ]] \
  || die 'production-control cutover authority overlap mode is not exact'
"$AUTHORITY_PATH" > /run/fixture-fenced-predecessor.out
grep -F -x 'LEGACY_ROLLBACK_CONTOUR_INSTALLED=true' \
  /run/fixture-fenced-predecessor.out >/dev/null
for record_name in preparing fence intent; do
  [[ ! -e "/var/lib/leetplus/deploy-receipts/scheduler-free-control-install.${record_name}" ]] \
    || die "fenced predecessor recovery left transaction residue: ${record_name}"
done
cmp -s -- "$DEPLOY_ROOT/systemd/leetplus-rollback-egress.service" \
  /etc/systemd/system/leetplus-rollback-egress.service \
  || die 'fenced predecessor recovery did not install the corrected egress unit'
rm -f /run/fixture-systemd255-template-aliases /run/fixture-systemd255-loaded-egress \
  /run/fixture-systemd255-loaded-recovery

printf '\nfixture-systemd255-unmasked-alias-drift\n' >> /etc/nginx/leetplus/upstreams/blue.conf
printf 'always\n' > /run/fixture-systemd255-template-aliases
if "$AUTHORITY_PATH" > /run/fixture-systemd255-unmasked-alias.out 2>&1; then
  die 'installer accepted a systemd 255 template alias without its exact runtime masks'
fi
grep -F 'unclassified rollback/recovery unit is loaded: leetplus-api-rollback@leetplus-rollback-egress.service' \
  /run/fixture-systemd255-unmasked-alias.out >/dev/null
rm -f /run/fixture-systemd255-template-aliases
"$AUTHORITY_PATH" > /run/fixture-systemd255-alias-repair.out

printf '\nfixture-drift\n' >> /etc/nginx/leetplus/upstreams/blue.conf
ln -s /dev/null /run/systemd/system/leetplus-api-rollback@.service
if "$AUTHORITY_PATH" > /run/fixture-preexisting-mask.out 2>&1; then
  die 'installer accepted an operator-owned pre-existing runtime mask'
fi
grep -F 'pre-existing runtime mask is not owned by this control-install operation' \
  /run/fixture-preexisting-mask.out >/dev/null
rm -f /run/systemd/system/leetplus-api-rollback@.service
"$AUTHORITY_PATH" > /run/fixture-repair.out

chmod 0711 /etc/leetplus/rollback-releases
"$AUTHORITY_PATH" > /run/fixture-directory-mode-repair.out
[[ "$(stat -c '%U:%G:%a' -- /etc/leetplus/rollback-releases)" == 'root:leetplus-runtime:750' ]] \
  || die 'installer did not repair exact planned directory mode'

env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC \
  /usr/sbin/runuser -u leetplus-api-nminus1 -- /usr/bin/bash --noprofile --norc -p -c '
    for environment_file in \
      /etc/leetplus/rollback-runtime.env \
      /etc/leetplus/rollback-releases/7de04ff4ccc814494810730be3fa6bf661097b07.env \
      /etc/leetplus/rollback-safe.env; do
      while IFS= read -r assignment || [[ -n "$assignment" ]]; do
        [[ "$assignment" != *$'"'"'\r'"'"'* ]] || exit 70
        [[ -n "$assignment" && "$assignment" != \#* ]] || continue
        [[ "$assignment" =~ ^[A-Z][A-Z0-9_]*=.*$ ]] || exit 70
        export "$assignment"
      done < "$environment_file"
    done
    exec /usr/bin/bash -p /usr/local/libexec/leetplus/preflight-legacy-rollback.sh \
      --release-sha 7de04ff4ccc814494810730be3fa6bf661097b07 --api-runtime
  ' > /run/fixture-api-preflight.out
grep -F -x 'LEGACY_ROLLBACK_PREFLIGHT_RUNTIME=api' /run/fixture-api-preflight.out >/dev/null || {
  sed -n '1,120p' /run/fixture-api-preflight.out >&2
  die 'installed API preflight did not publish its exact runtime receipt'
}

install -o root -g root -m 0755 "$DEPLOY_ROOT/prepare-web-slot-cache.sh" \
  /usr/local/libexec/leetplus/prepare-web-slot-cache.sh
for primary_group in leetplus-runtime leetplus-api-runtime leetplus-web-runtime; do
  foreign_identity="fixture-foreign-${primary_group#leetplus-}"
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin \
    --gid "$primary_group" "$foreign_identity"
  if /usr/bin/bash -p /usr/local/libexec/leetplus/prepare-web-slot-cache.sh \
    --slot blue --release-sha 1111111111111111111111111111111111111111 \
    > "/run/${foreign_identity}.out" 2>&1; then
    die "cache preparer accepted foreign primary-GID identity in ${primary_group}"
  fi
  grep -F 'runtime secret-group reverse primary-GID sets are not exact' \
    "/run/${foreign_identity}.out" >/dev/null || {
    sed -n '1,120p' "/run/${foreign_identity}.out" >&2
    die "cache preparer foreign primary-GID negative failed for another invariant: ${primary_group}"
  }
  userdel "$foreign_identity"
done

/usr/sbin/runuser -u leetplus-web-blue -- /usr/bin/sleep 30 &
foreign_web_pid=$!
sleep 1
if /usr/bin/bash -p /usr/local/libexec/leetplus/prepare-web-slot-cache.sh \
  --slot blue --release-sha 1111111111111111111111111111111111111111 \
  > /run/fixture-cache-foreign-process.out 2>&1; then
  pkill -TERM -u leetplus-web-blue 2>/dev/null || true
  kill "$foreign_web_pid" 2>/dev/null || true
  wait "$foreign_web_pid" 2>/dev/null || true
  die 'cache preparer accepted a foreign same-UID process'
fi
grep -F 'Web slot identity owns a process while cache preparation requires global UID quiescence' \
  /run/fixture-cache-foreign-process.out >/dev/null || {
  sed -n '1,120p' /run/fixture-cache-foreign-process.out >&2
  die 'cache preparer foreign-process negative failed for another invariant'
}
pkill -TERM -u leetplus-web-blue 2>/dev/null || true
kill "$foreign_web_pid" 2>/dev/null || true
wait "$foreign_web_pid" 2>/dev/null || true

/usr/bin/bash -p /usr/local/libexec/leetplus/prepare-web-slot-cache.sh \
  --slot blue --release-sha 1111111111111111111111111111111111111111 \
  > /run/fixture-cache-prepared.out
grep -F -x 'WEB_CACHE_PREPARED_SLOT=blue' /run/fixture-cache-prepared.out >/dev/null || {
  sed -n '1,120p' /run/fixture-cache-prepared.out >&2
  die 'cache preparer did not publish its exact success receipt'
}
/usr/bin/systemctl mask --now leetplus-web@blue.service
[[ -L /etc/systemd/system/leetplus-web@blue.service \
  && "$(realpath -- /etc/systemd/system/leetplus-web@blue.service)" == /dev/null ]] \
  || die 'real systemd fixture did not create the exact Web instance mask'
/usr/bin/bash -p /usr/local/libexec/leetplus/prepare-web-slot-cache.sh \
  --slot blue --release-sha 1111111111111111111111111111111111111111 \
  > /run/fixture-cache-masked-retry.out
grep -F -x 'WEB_CACHE_ALREADY_PREPARED_SLOT=blue' \
  /run/fixture-cache-masked-retry.out >/dev/null || {
    sed -n '1,120p' /run/fixture-cache-masked-retry.out >&2
    die 'cache preparer did not accept an exact masked inactive Web slot'
  }
/usr/bin/systemctl unmask leetplus-web@blue.service

printf 'production legacy rollback installer root fixture: PASS\n'
