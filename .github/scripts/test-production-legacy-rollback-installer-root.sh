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
readonly CONTROL_ROOT="/srv/leetplus/control-bundles/${CONTROL_ID}"
readonly AUTHORITY_PATH='/usr/local/sbin/leetplus-install-scheduler-free-nminus1-v1'

die() {
  printf 'production legacy root fixture: %s\n' "$*" >&2
  exit 1
}

((EUID == 0)) || die 'must run as root inside a disposable Linux root'
[[ "$LEETPLUS_FIXTURE_ACKNOWLEDGEMENT" == 'CONFIRMED_DESTROYABLE_CI_ROOT' ]] \
  || die 'explicit disposable-root acknowledgement is absent'
unset LEETPLUS_FIXTURE_ACKNOWLEDGEMENT
[[ -e /.dockerenv || -e /run/.containerenv ]] \
  || die 'refusing exact production-path mutation outside a disposable container root'
[[ "$(uname -s)" == Linux ]] || die 'Linux is required'

for command_name in awk cat chmod chown cp find findmnt flock getent grep groupadd id install kill ln \
  mktemp node paste pkill readlink realpath rm runuser sed sha256sum sleep sort stat sync timeout tr \
  uname useradd userdel xargs; do
  command -v "$command_name" >/dev/null 2>&1 || die "missing fixture command: ${command_name}"
done
[[ -f "$DEPLOY_ROOT/CONTROL_BUNDLE_SHA256SUMS" && -f "$AUTHORITY_SOURCE" ]] \
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
: > "$release_directory/N_MINUS_ONE_SYMLINKS"
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
    LoadState) printf 'loaded\n' ;;
    ActiveState) printf 'inactive\n' ;;
    SubState) printf 'dead\n' ;;
    MainPID|ControlPID|ExecMainPID) printf '0\n' ;;
    ControlGroup|DropInPaths)
      if [[ "$unit" == nginx.service && "$property" == DropInPaths ]]; then
        printf '/etc/systemd/system/nginx.service.d/leetplus-blue-green-recovery.conf\n'
      else printf '\n'; fi
      ;;
    FragmentPath) printf '%s\n' "$fragment" ;;
    NeedDaemonReload) [[ -e /run/fixture-stale-manager ]] && printf 'yes\n' || printf 'no\n' ;;
    User) [[ "$unit" == leetplus-api-* ]] && printf 'leetplus-api-nminus1\n' || printf 'leetplus-web-nminus1\n' ;;
    Group) printf 'leetplus-runtime\n' ;;
    WorkingDirectory)
      [[ "$unit" == leetplus-api-* ]] \
        && printf '/srv/leetplus/rollback-releases/%s\n' "$legacy_sha" \
        || printf '/srv/leetplus/rollback-releases/%s/apps/web\n' "$legacy_sha"
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
      else
        printf '{ path=/usr/bin/node ; argv[]=/usr/bin/node /srv/leetplus/rollback-releases/%s/apps/web/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3300 ; ignore_errors=no ; }\n' "$legacy_sha"
      fi
      ;;
    UnsetEnvironment|RestrictAddressFamilies|SocketBindDeny|SocketBindAllow)
      awk -F= -v property="$property" '$1 == property { print substr($0, length($1) + 2) }' "$fragment" | paste -sd' ' -
      ;;
    NoNewPrivileges|PrivateTmp|PrivateDevices|ProtectHome) printf 'yes\n' ;;
    ProtectSystem) printf 'strict\n' ;;
    RestrictNetworkInterfaces) printf 'lo\n' ;;
    IPAddressDeny) printf 'any\n' ;;
    IPAddressAllow) printf 'localhost\n' ;;
    *) printf '\n' ;;
  esac
}
case "$command_name" in
  list-units|list-unit-files) exit 0 ;;
  is-active|is-enabled) exit 3 ;;
  daemon-reload)
    count=0; [[ ! -f /run/fixture-daemon-reload-count ]] || count="$(</run/fixture-daemon-reload-count)"
    count=$((count + 1)); printf '%s\n' "$count" > /run/fixture-daemon-reload-count
    if [[ -e /run/fixture-fail-second-reload && "$count" == 2 ]]; then exit 90; fi
    exit 0
    ;;
  mask)
    for argument in "$@"; do
      [[ "$argument" == leetplus-* ]] || continue
      ln -s /dev/null "/run/systemd/system/${argument}"
    done
    ;;
  unmask)
    for argument in "$@"; do
      [[ "$argument" == leetplus-* ]] || continue
      rm -f "/run/systemd/system/${argument}"
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
    if ((${#properties[@]} == 0)); then
      printf '%s\n' \
        'ActiveState=inactive' 'SubState=dead' 'MainPID=0' \
        "ControlGroup=/system.slice/${unit}" \
        'UnitFileState=enabled' 'NeedDaemonReload=no'
      exit 0
    fi
    for property in "${properties[@]}"; do
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
    set -a
    source /etc/leetplus/rollback-runtime.env
    source /etc/leetplus/rollback-releases/7de04ff4ccc814494810730be3fa6bf661097b07.env
    source /etc/leetplus/rollback-safe.env
    set +a
    exec /usr/bin/bash -p /usr/local/libexec/leetplus/preflight-legacy-rollback.sh \
      --release-sha 7de04ff4ccc814494810730be3fa6bf661097b07 --api-runtime
  ' > /run/fixture-api-preflight.out
grep -F -x 'LEGACY_ROLLBACK_PREFLIGHT_RUNTIME=api' /run/fixture-api-preflight.out >/dev/null

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
    "/run/${foreign_identity}.out" >/dev/null
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
  /run/fixture-cache-foreign-process.out >/dev/null
pkill -TERM -u leetplus-web-blue 2>/dev/null || true
kill "$foreign_web_pid" 2>/dev/null || true
wait "$foreign_web_pid" 2>/dev/null || true

/usr/bin/bash -p /usr/local/libexec/leetplus/prepare-web-slot-cache.sh \
  --slot blue --release-sha 1111111111111111111111111111111111111111 \
  > /run/fixture-cache-prepared.out
grep -F -x 'WEB_CACHE_PREPARED_SLOT=blue' /run/fixture-cache-prepared.out >/dev/null

printf 'production legacy rollback installer root fixture: PASS\n'
