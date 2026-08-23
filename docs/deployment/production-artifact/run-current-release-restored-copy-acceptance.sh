#!/usr/bin/bash -p
# Root-authoritative launcher for the current-release restored-copy runtime gate.
# Secrets are consumed only by systemd's credential transport; this process
# never places credential values in argv, environment, stdout, or durable state.

case "$-" in
  *p*) ;;
  *) builtin printf 'current-release restored-copy wrapper: privileged Bash mode is required\n' >&2; builtin exit 1 ;;
esac
while IFS= read -r inherited_environment_name; do
  if ! builtin unset "$inherited_environment_name" 2>/dev/null; then
    builtin export -n "$inherited_environment_name" 2>/dev/null \
      || { builtin printf 'current-release restored-copy wrapper: inherited environment could not be scrubbed\n' >&2; builtin exit 1; }
  fi
done < <(compgen -e)
[[ -z "$(compgen -e)" ]] \
  || { builtin printf 'current-release restored-copy wrapper: inherited environment scrub was incomplete\n' >&2; builtin exit 1; }
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C'
LC_ALL='C'
TZ='UTC'
export PATH LANG LC_ALL TZ

set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly WRAPPER_CONTRACT='LEETPLUS_CURRENT_RELEASE_RESTORED_COPY_RUNTIME_WRAPPER_V1'
readonly ACCEPTANCE_CONTRACT='LEETPLUS_CURRENT_RELEASE_RESTORED_COPY_RUNTIME_ACCEPTANCE_V2'
readonly CONFIRMATION='run-current-release-restored-copy-runtime-acceptance'
readonly SERVICE_USER='leetplus-rehearsal'
readonly SERVICE_GROUP='leetplus-rehearsal'
readonly SERVICE_HOME='/nonexistent'
readonly SERVICE_SHELL='/usr/sbin/nologin'
readonly ARTIFACT_READ_GROUP='leetplus-runtime'
readonly CREDENTIAL_NAME='current-release-runtime.json'
readonly PRODUCTION_RELEASE_ROOT='/srv/leetplus/releases'
readonly PRODUCTION_CREDENTIAL_ROOT='/etc/leetplus/rehearsal-credentials'
readonly PRODUCTION_EVIDENCE_ROOT='/var/lib/leetplus/rehearsal-evidence'
readonly PRODUCTION_CONTROL_ROOT='/var/lib/leetplus/rehearsal-control'
readonly PRODUCTION_UNIT_EVIDENCE_ROOT='/run/leetplus-current-release-evidence'
readonly PRODUCTION_SYSTEMD_RUN='/usr/bin/systemd-run'
readonly PRODUCTION_SYSTEMCTL='/usr/bin/systemctl'
readonly PRODUCTION_TIMEOUT='/usr/bin/timeout'
readonly PRODUCTION_FLOCK='/usr/bin/flock'
readonly PRODUCTION_NODE='/usr/bin/node'
readonly PRODUCTION_PROC_ROOT='/proc'
readonly MAX_CREDENTIAL_BYTES=32768
readonly MAX_EVIDENCE_BYTES=8388608
readonly MAIN_RUNTIME_MAX='840s'
readonly MAIN_OUTER_TIMEOUT='900s'
readonly VERIFY_RUNTIME_MAX='30s'
readonly VERIFY_OUTER_TIMEOUT='45s'
readonly RESET_FAILED_TIMEOUT='10s'
readonly UNIT_UNSET_ENVIRONMENT='CURRENT_RELEASE_RESTORED_DATABASE_URL CURRENT_RELEASE_EVIDENCE_HMAC_KEY CURRENT_RELEASE_LOGIN_EMAIL CURRENT_RELEASE_LOGIN_PASSWORD BASH_ENV ENV SGX_AESM_ADDR NODE_OPTIONS NODE_PATH NODE_EXTRA_CA_CERTS NODE_DEBUG NODE_V8_COVERAGE NODE_COMPILE_CACHE SSLKEYLOGFILE LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES GLIBC_TUNABLES MALLOC_CHECK_ MALLOC_PERTURB_ HTTP_PROXY HTTPS_PROXY FTP_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy ftp_proxy all_proxy no_proxy NODE_USE_ENV_PROXY CURL_HOME CURL_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR TMP TMPDIR TEMP XDG_CONFIG_HOME XDG_CACHE_HOME NPM_CONFIG_USERCONFIG npm_config_userconfig NPM_CONFIG_GLOBALCONFIG npm_config_globalconfig NPM_CONFIG_NODE_OPTIONS npm_config_node_options NPM_CONFIG_SCRIPT_SHELL npm_config_script_shell PNPM_HOME COREPACK_HOME GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM'

die() {
  printf 'current-release restored-copy wrapper: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  run-current-release-restored-copy-acceptance.sh \
    --operation-id <8..32-lowercase-alnum> \
    --release-sha <40-lowercase-hex> \
    --tenant-slug <active-tenant-slug> \
    --expected-system-identifier <restored-cluster-system-id> \
    --expected-migration-count <exact-positive-count> \
    --expected-migration-head <exact-migration-name> \
    --api-port <alternate-loopback-port> \
    --web-port <different-alternate-loopback-port> \
    --credential-id <root-owned-credential-basename> \
    --evidence-key-id <non-secret-key-id> \
    [--with-reversible-write] [--reconcile]

Production paths, executables, service identity and isolation policy are fixed.
--reconcile never starts the runtime: it verifies the existing signed receipt
bound to the exact durable intent for the supplied operation ID.

The --unprivileged-test-mode and --test-* overrides are accepted together only
from a non-root process. They exist solely for the repository fixture.
USAGE
}

operation_id=''
release_sha=''
tenant_slug=''
expected_system_identifier=''
expected_migration_count=''
expected_migration_head=''
api_port=''
web_port=''
credential_id=''
evidence_key_id=''
with_reversible_write=false
reconcile=false
test_mode=false
test_override_count=0

release_root="$PRODUCTION_RELEASE_ROOT"
credential_root="$PRODUCTION_CREDENTIAL_ROOT"
evidence_root="$PRODUCTION_EVIDENCE_ROOT"
control_root="$PRODUCTION_CONTROL_ROOT"
unit_evidence_root="$PRODUCTION_UNIT_EVIDENCE_ROOT"
systemd_run_bin="$PRODUCTION_SYSTEMD_RUN"
systemctl_bin="$PRODUCTION_SYSTEMCTL"
timeout_bin="$PRODUCTION_TIMEOUT"
flock_bin="$PRODUCTION_FLOCK"
node_bin="$PRODUCTION_NODE"
proc_root="$PRODUCTION_PROC_ROOT"
test_cli_path=''
declare -A seen_arguments=()

mark_argument_once() {
  local argument="$1"
  [[ -z "${seen_arguments[$argument]+present}" ]] || die "duplicate argument: ${argument}"
  seen_arguments[$argument]=1
}

while (($#)); do
  case "$1" in
    --operation-id) mark_argument_once "$1"; operation_id="${2:-}"; shift 2 ;;
    --release-sha) mark_argument_once "$1"; release_sha="${2:-}"; shift 2 ;;
    --tenant-slug) mark_argument_once "$1"; tenant_slug="${2:-}"; shift 2 ;;
    --expected-system-identifier) mark_argument_once "$1"; expected_system_identifier="${2:-}"; shift 2 ;;
    --expected-migration-count) mark_argument_once "$1"; expected_migration_count="${2:-}"; shift 2 ;;
    --expected-migration-head) mark_argument_once "$1"; expected_migration_head="${2:-}"; shift 2 ;;
    --api-port) mark_argument_once "$1"; api_port="${2:-}"; shift 2 ;;
    --web-port) mark_argument_once "$1"; web_port="${2:-}"; shift 2 ;;
    --credential-id) mark_argument_once "$1"; credential_id="${2:-}"; shift 2 ;;
    --evidence-key-id) mark_argument_once "$1"; evidence_key_id="${2:-}"; shift 2 ;;
    --with-reversible-write) mark_argument_once "$1"; with_reversible_write=true; shift ;;
    --reconcile) mark_argument_once "$1"; reconcile=true; shift ;;
    --unprivileged-test-mode) mark_argument_once "$1"; test_mode=true; shift ;;
    --test-release-root) mark_argument_once "$1"; release_root="${2:-}"; ((test_override_count += 1)); shift 2 ;;
    --test-credential-root) mark_argument_once "$1"; credential_root="${2:-}"; ((test_override_count += 1)); shift 2 ;;
    --test-evidence-root) mark_argument_once "$1"; evidence_root="${2:-}"; ((test_override_count += 1)); shift 2 ;;
    --test-control-root) mark_argument_once "$1"; control_root="${2:-}"; ((test_override_count += 1)); shift 2 ;;
    --test-systemd-run-bin) mark_argument_once "$1"; systemd_run_bin="${2:-}"; ((test_override_count += 1)); shift 2 ;;
    --test-systemctl-bin) mark_argument_once "$1"; systemctl_bin="${2:-}"; ((test_override_count += 1)); shift 2 ;;
    --test-timeout-bin) mark_argument_once "$1"; timeout_bin="${2:-}"; ((test_override_count += 1)); shift 2 ;;
    --test-flock-bin) mark_argument_once "$1"; flock_bin="${2:-}"; ((test_override_count += 1)); shift 2 ;;
    --test-node-bin) mark_argument_once "$1"; node_bin="${2:-}"; ((test_override_count += 1)); shift 2 ;;
    --test-proc-root) mark_argument_once "$1"; proc_root="${2:-}"; ((test_override_count += 1)); shift 2 ;;
    --test-cli-path) mark_argument_once "$1"; test_cli_path="${2:-}"; ((test_override_count += 1)); shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; die "unknown or incomplete argument: ${1:-<empty>}" ;;
  esac
done

if [[ "$test_mode" == true ]]; then
  ((EUID != 0)) || die 'unprivileged test mode is forbidden for root'
  ((test_override_count == 11)) || die 'test mode requires every --test-* override exactly once'
  unit_evidence_root="${control_root}/unit-evidence"
else
  ((EUID == 0)) || die 'production acceptance wrapper must run as root'
  ((test_override_count == 0)) || die 'test overrides require explicit unprivileged test mode'
  [[ "$release_root" == "$PRODUCTION_RELEASE_ROOT" \
    && "$credential_root" == "$PRODUCTION_CREDENTIAL_ROOT" \
    && "$evidence_root" == "$PRODUCTION_EVIDENCE_ROOT" \
    && "$control_root" == "$PRODUCTION_CONTROL_ROOT" \
    && "$unit_evidence_root" == "$PRODUCTION_UNIT_EVIDENCE_ROOT" \
    && "$systemd_run_bin" == "$PRODUCTION_SYSTEMD_RUN" \
    && "$systemctl_bin" == "$PRODUCTION_SYSTEMCTL" \
    && "$timeout_bin" == "$PRODUCTION_TIMEOUT" \
    && "$flock_bin" == "$PRODUCTION_FLOCK" \
    && "$node_bin" == "$PRODUCTION_NODE" \
    && "$proc_root" == "$PRODUCTION_PROC_ROOT" \
    && -z "$test_cli_path" ]] || die 'production authority is not overrideable'
fi

[[ "$operation_id" =~ ^[a-z0-9]{8,32}$ ]] || die 'operation ID is invalid'
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || die 'release SHA is invalid'
[[ "$tenant_slug" =~ ^[a-z0-9][a-z0-9-]{1,62}$ ]] || die 'tenant slug is invalid'
[[ "$expected_system_identifier" =~ ^[0-9]{10,24}$ ]] || die 'system identifier is invalid'
[[ "$expected_migration_count" =~ ^[1-9][0-9]{0,5}$ ]] || die 'migration count is invalid'
[[ "$expected_migration_head" =~ ^[0-9]{14}_[a-z0-9_]{3,100}$ ]] || die 'migration head is invalid'
[[ "$credential_id" =~ ^[a-z0-9][a-z0-9._-]{2,63}$ ]] || die 'credential ID is invalid'
[[ "$evidence_key_id" =~ ^[a-z0-9][a-z0-9._-]{2,63}$ ]] || die 'evidence key ID is invalid'
for port in "$api_port" "$web_port"; do
  [[ "$port" =~ ^[0-9]{4,5}$ ]] || die 'runtime port is invalid'
  ((port >= 1024 && port <= 65535)) || die 'runtime port is out of range'
  case "$port" in 3000|3001|4000|5432) die 'production/default runtime port is forbidden' ;; esac
done
[[ "$api_port" != "$web_port" ]] || die 'API and Web ports must differ'

for safe_path in "$release_root" "$credential_root" "$evidence_root" "$control_root" \
  "$unit_evidence_root" "$systemd_run_bin" "$systemctl_bin" "$timeout_bin" \
  "$flock_bin" "$node_bin" "$proc_root"; do
  [[ "$safe_path" == /* && "$safe_path" != '/' && ! "$safe_path" =~ [[:space:][:cntrl:]] ]] \
    || die 'an authority path is not an absolute whitespace-free non-root path'
done

assert_real_directory() {
  local directory="$1"
  [[ -d "$directory" && ! -L "$directory" ]] || die "directory is absent or symlinked: ${directory}"
  [[ "$(realpath -e -- "$directory")" == "$directory" ]] || die "directory is not canonical: ${directory}"
}

assert_owned_nonwritable_directory() {
  local directory="$1" owner_uid="$2"
  assert_real_directory "$directory"
  [[ "$(stat -c '%u' -- "$directory")" == "$owner_uid" ]] || die "directory owner is untrusted: ${directory}"
  (( (8#$(stat -c '%a' -- "$directory") & 8#022) == 0 )) \
    || die "directory is group/other-writable: ${directory}"
}

assert_exact_directory() {
  local directory="$1" owner_uid="$2" owner_gid="$3" expected_mode="$4"
  assert_real_directory "$directory"
  [[ "$(stat -c '%u:%g:%a' -- "$directory")" == "${owner_uid}:${owner_gid}:${expected_mode}" ]] \
    || die "directory owner/mode is untrusted: ${directory}"
}

assert_trusted_executable() {
  local executable="$1" expected_uid="$2"
  [[ -f "$executable" && ! -L "$executable" && -x "$executable" ]] \
    || die "executable is absent, symlinked or not executable: ${executable}"
  [[ "$(realpath -e -- "$executable")" == "$executable" \
    && "$(stat -c '%u' -- "$executable")" == "$expected_uid" ]] \
    || die "executable authority is untrusted: ${executable}"
  (( (8#$(stat -c '%a' -- "$executable") & 8#022) == 0 )) \
    || die "executable is group/other-writable: ${executable}"
}

if [[ "$test_mode" == true ]]; then
  authority_uid="$EUID"
  authority_gid="$(id -g)"
  service_uid="$authority_uid"
  service_gid="$authority_gid"
  artifact_read_gid="$authority_gid"
  service_shell="$SERVICE_SHELL"
  if [[ -f "${control_root}/test-bad-service-shell" ]]; then
    service_shell='/bin/bash'
  fi
  service_passwd_record="${SERVICE_USER}:x:${service_uid}:${service_gid}::${SERVICE_HOME}:${service_shell}"
  uid_passwd_record="$service_passwd_record"
  uid_passwd_records="$service_passwd_record"
  if [[ -f "${control_root}/test-duplicate-service-uid" ]]; then
    uid_passwd_records+=$'\n'"foreign-rehearsal:x:${service_uid}:65534::/nonexistent:/usr/sbin/nologin"
  fi
  service_group_record="${SERVICE_GROUP}:x:${service_gid}:"
  if [[ -f "${control_root}/test-explicit-service-group-member" ]]; then
    service_group_record="${SERVICE_GROUP}:x:${service_gid}:foreign-user"
  fi
  gid_group_record="$service_group_record"
  gid_group_records="$service_group_record"
  if [[ -f "${control_root}/test-duplicate-service-gid" ]]; then
    gid_group_records+=$'\n'"foreign-rehearsal:x:${service_gid}:"
  fi
  primary_gid_users="$SERVICE_USER"
  if [[ -f "${control_root}/test-foreign-primary-gid" ]]; then
    primary_gid_users="${SERVICE_USER}"$'\n''foreign-user'
  fi
else
  authority_uid=0
  authority_gid=0
  service_passwd_record="$(getent passwd "$SERVICE_USER")" \
    || die 'fixed rehearsal service user is absent'
  IFS=: read -r passwd_name passwd_secret service_uid passwd_primary_gid \
    passwd_gecos passwd_home passwd_shell <<< "$service_passwd_record"
  IFS=$'\n\t'
  [[ "$passwd_name" == "$SERVICE_USER" && -n "$passwd_secret" \
    && "$passwd_home" == "$SERVICE_HOME" && "$passwd_shell" == "$SERVICE_SHELL" \
    && "$service_uid" =~ ^[1-9][0-9]*$ && "$passwd_primary_gid" =~ ^[1-9][0-9]*$ ]] \
    || die 'fixed rehearsal passwd identity/home/shell is invalid'

  service_group_record="$(getent group "$SERVICE_GROUP")" \
    || die 'fixed rehearsal service group is absent'
  IFS=: read -r group_name group_secret service_gid explicit_group_members <<< "$service_group_record"
  IFS=$'\n\t'
  [[ "$group_name" == "$SERVICE_GROUP" && -n "$group_secret" \
    && "$service_gid" =~ ^[1-9][0-9]*$ && -z "$explicit_group_members" \
    && "$passwd_primary_gid" == "$service_gid" ]] \
    || die 'fixed rehearsal primary group or reverse membership is invalid'

  uid_passwd_record="$(getent passwd "$service_uid")" \
    || die 'fixed rehearsal UID has no exact reverse passwd record'
  gid_group_record="$(getent group "$service_gid")" \
    || die 'fixed rehearsal GID has no exact reverse group record'
  uid_passwd_records="$(getent passwd | awk -F: -v expected_uid="$service_uid" '
    NR > 1000000 { exit 91 }
    NF != 7 { exit 92 }
    $3 == expected_uid { print $0 }
  ')" || die 'fixed rehearsal UID full NSS enumeration failed'
  gid_group_records="$(getent group | awk -F: -v expected_gid="$service_gid" '
    NR > 1000000 { exit 91 }
    NF != 4 { exit 92 }
    $3 == expected_gid { print $0 }
  ')" || die 'fixed rehearsal GID full NSS enumeration failed'
  primary_gid_users="$(getent passwd | awk -F: -v expected_gid="$service_gid" \
    'NR > 1000000 { exit 91 }
     NF != 7 { exit 92 }
     $4 == expected_gid { print $1 }')" \
    || die 'fixed rehearsal primary-GID reverse enumeration failed'

  artifact_group_record="$(getent group "$ARTIFACT_READ_GROUP")" \
    || die 'fixed artifact read group is absent'
  IFS=: read -r artifact_group_name artifact_group_secret artifact_read_gid \
    artifact_group_members <<< "$artifact_group_record"
  IFS=$'\n\t'
  [[ "$artifact_group_name" == "$ARTIFACT_READ_GROUP" && -n "$artifact_group_secret" \
    && "$artifact_group_members" =~ ^([a-z_][a-z0-9_-]*(,[a-z_][a-z0-9_-]*)*)?$ ]] \
    || die 'fixed artifact read group record is malformed'
  artifact_gid_group_records="$(getent group | awk -F: -v expected_gid="$artifact_read_gid" '
    NR > 1000000 { exit 91 }
    NF != 4 { exit 92 }
    $3 == expected_gid { print $0 }
  ')" || die 'fixed artifact read GID full NSS enumeration failed'
  [[ "$artifact_gid_group_records" == "$artifact_group_record" ]] \
    || die 'artifact read GID has a duplicate reverse group identity'

  [[ "$service_uid" =~ ^[1-9][0-9]*$ && "$service_gid" =~ ^[1-9][0-9]*$ ]] \
    || die 'fixed rehearsal service identity is privileged or invalid'
  [[ "$artifact_read_gid" =~ ^[1-9][0-9]*$ && "$artifact_read_gid" != "$service_gid" ]] \
    || die 'artifact read group is privileged, invalid or equals the rehearsal primary group'
  [[ "$(id -g "$SERVICE_USER")" == "$service_gid" ]] \
    || die 'fixed rehearsal user does not use the fixed rehearsal primary group'
  group_output="$(id -G "$SERVICE_USER")"
  IFS=' ' read -r -a service_group_ids <<< "$group_output"
  IFS=$'\n\t'
  declare -A service_group_set=()
  for group_id in "${service_group_ids[@]}"; do
    [[ "$group_id" =~ ^[1-9][0-9]*$ ]] || die 'rehearsal service group set is invalid'
    service_group_set[$group_id]=1
  done
  [[ "${#service_group_set[@]}" == 2 \
    && -n "${service_group_set[$service_gid]+present}" \
    && -n "${service_group_set[$artifact_read_gid]+present}" ]] \
    || die 'rehearsal service must belong only to its primary group and leetplus-runtime'
fi

IFS=: read -r admitted_passwd_name admitted_passwd_secret admitted_service_uid \
  admitted_service_gid admitted_passwd_gecos admitted_passwd_home admitted_passwd_shell \
  <<< "$service_passwd_record"
IFS=$'\n\t'
[[ "$admitted_passwd_name" == "$SERVICE_USER" && -n "$admitted_passwd_secret" \
  && "$admitted_service_uid" == "$service_uid" && "$admitted_service_gid" == "$service_gid" \
  && "$admitted_passwd_home" == "$SERVICE_HOME" \
  && "$admitted_passwd_shell" == "$SERVICE_SHELL" ]] \
  || die 'fixed rehearsal passwd identity/home/shell is invalid'
IFS=: read -r admitted_group_name admitted_group_secret admitted_group_gid \
  admitted_group_members <<< "$service_group_record"
IFS=$'\n\t'
[[ "$admitted_group_name" == "$SERVICE_GROUP" && -n "$admitted_group_secret" \
  && "$admitted_group_gid" == "$service_gid" && -z "$admitted_group_members" ]] \
  || die 'fixed rehearsal primary group or reverse membership is invalid'
[[ "$uid_passwd_record" == "$service_passwd_record" \
  && "$gid_group_record" == "$service_group_record" \
  && "$uid_passwd_records" == "$service_passwd_record" \
  && "$gid_group_records" == "$service_group_record" \
  && "$primary_gid_users" == "$SERVICE_USER" ]] \
  || die 'rehearsal UID/GID has a duplicate or foreign reverse identity'

assert_trusted_executable "$systemd_run_bin" "$authority_uid"
assert_trusted_executable "$systemctl_bin" "$authority_uid"
assert_trusted_executable "$timeout_bin" "$authority_uid"
assert_trusted_executable "$flock_bin" "$authority_uid"
assert_trusted_executable "$node_bin" "$authority_uid"
if [[ "$test_mode" == false ]]; then
  assert_trusted_executable "$SERVICE_SHELL" 0
  [[ ! -e "$SERVICE_HOME" && ! -L "$SERVICE_HOME" ]] \
    || die 'fixed rehearsal home path must remain absent'
fi
node_version="$("$node_bin" --no-warnings --eval 'process.stdout.write(process.versions.node)' 2>/dev/null)" \
  || die 'trusted Node runtime version could not be read'
[[ "$node_version" =~ ^22\.[0-9]+\.[0-9]+$ ]] \
  || die 'current-release acceptance requires exact Node major 22'

assert_real_directory "$proc_root"
assert_no_foreign_service_uid_processes() {
  if ! "$node_bin" --input-type=module - "$proc_root" "$service_uid" <<'NODE'
import fs from "node:fs";
const root = fs.realpathSync.native(process.argv[2]);
const serviceUid = process.argv[3];
if (!/^[1-9][0-9]*$/u.test(serviceUid)) process.exit(64);
const readBoundedProcFile = (file, maximum) => {
  let descriptor;
  try {
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) process.exit(65);
    const chunks = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.alloc(4096);
      const count = fs.readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      total += count;
      if (total > maximum) process.exit(66);
      chunks.push(chunk.subarray(0, count));
    }
    const after = fs.fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode) process.exit(67);
    return Buffer.concat(chunks, total).toString("utf8");
  } finally {
    fs.closeSync(descriptor);
  }
};
const directory = fs.opendirSync(root);
let inspected = 0;
try {
  for (;;) {
    const entry = directory.readSync();
    if (entry === null) break;
    if (!/^[1-9][0-9]*$/u.test(entry.name)) continue;
    inspected += 1;
    if (inspected > 1_000_000) process.exit(68);
    const processRoot = `${root}/${entry.name}`;
    const status = readBoundedProcFile(`${processRoot}/status`, 65_536);
    if (status === null) continue;
    if (status.includes("\0") || status.includes("\r")) process.exit(69);
    const uidLines = status.match(/^Uid:\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s*$/gmu);
    if (!uidLines || uidLines.length !== 1) process.exit(70);
    const values = uidLines[0].match(/[0-9]+/gu);
    if (!values?.includes(serviceUid)) continue;
    const cgroup = readBoundedProcFile(`${processRoot}/cgroup`, 65_536);
    if (cgroup === null || cgroup.length < 1 || cgroup.includes("\0") || cgroup.includes("\r")) process.exit(71);
    process.exit(72);
  }
} finally {
  directory.closeSync();
}
NODE
  then
    die 'a foreign rehearsal service-UID process/cgroup exists or cannot be excluded'
  fi
}

assert_no_foreign_service_uid_processes

assert_owned_nonwritable_directory "$release_root" "$authority_uid"
artifact_root="${release_root}/${release_sha}"
assert_owned_nonwritable_directory "$artifact_root" "$authority_uid"
[[ "$(realpath -e -- "$artifact_root")" == "$artifact_root" ]] \
  || die 'artifact root does not equal the exact release root/SHA path'

if [[ "$test_mode" == false ]]; then
  wrapper_path="$(realpath -e -- "${BASH_SOURCE[0]}")"
  expected_wrapper_path="${artifact_root}/packages/database/scripts/run-current-release-restored-copy-acceptance.sh"
  [[ "$wrapper_path" == "$expected_wrapper_path" \
    && -f "$wrapper_path" && ! -L "$wrapper_path" \
    && "$(stat -c '%u:%h' -- "$wrapper_path")" == '0:1' ]] \
    || die 'production wrapper must be the exact single-link byte inside the release artifact'
  (( (8#$(stat -c '%a' -- "$wrapper_path") & 8#022) == 0 )) \
    || die 'production wrapper byte is writable by group/other'
  ancestor="$(dirname -- "$wrapper_path")"
  while [[ "$ancestor" != '/' ]]; do
    assert_owned_nonwritable_directory "$ancestor" 0
    ancestor="$(dirname -- "$ancestor")"
  done
  for trusted_ancestor in /srv /srv/leetplus "$release_root"; do
    assert_owned_nonwritable_directory "$trusted_ancestor" 0
  done
fi

[[ -z "$(find -P "$artifact_root" -xdev \
  \( ! -uid "$authority_uid" -o ! -gid "$artifact_read_gid" \
     -o \( ! -type l -perm /022 \) \) -print -quit)" ]] \
  || die 'artifact tree contains an untrusted owner/group or writable entry'
[[ -z "$(find -P "$artifact_root" -xdev ! -type d ! -type f ! -type l -print -quit)" ]] \
  || die 'artifact tree contains a special entry'
[[ -z "$(find -P "$artifact_root" -xdev -type f -links +1 -print -quit)" ]] \
  || die 'artifact tree contains a hardlinked regular file'

if [[ "$test_mode" == false ]]; then
  "$node_bin" --input-type=module - "$artifact_root" <<'NODE'
import fs from "node:fs";
import path from "node:path";
const root = path.posix.normalize(process.argv[2]);
const decode = (value) => value.replace(/\\([0-7]{3})/gu,
  (_match, octal) => String.fromCharCode(Number.parseInt(octal, 8)));
const raw = fs.readFileSync("/proc/self/mountinfo", "utf8");
if (Buffer.byteLength(raw) > 8 * 1024 * 1024) process.exit(1);
for (const line of raw.split("\n")) {
  if (!line) continue;
  const separator = line.indexOf(" - ");
  const fields = line.slice(0, separator).split(" ");
  if (separator < 1 || fields.length < 6) process.exit(1);
  const target = path.posix.normalize(decode(fields[4]));
  if (target === root || target.startsWith(`${root}/`)) process.exit(1);
}
NODE
  [[ $? == 0 ]] || die 'artifact contains an exact/nested mount'
fi

source_manifest="${artifact_root}/SHA256SUMS"
hydrated_manifest="${artifact_root}/HYDRATED_SHA256SUMS"
symlink_manifest="${artifact_root}/HYDRATED_SYMLINKS.json"
for manifest in "$source_manifest" "$hydrated_manifest" "$symlink_manifest"; do
  [[ -f "$manifest" && ! -L "$manifest" && "$(stat -c '%u:%h' -- "$manifest")" == "${authority_uid}:1" ]] \
    || die "artifact manifest is absent, symlinked, multiply-linked or untrusted: ${manifest}"
  (( (8#$(stat -c '%a' -- "$manifest") & 8#022) == 0 )) \
    || die "artifact manifest is writable by group/other: ${manifest}"
done

validate_hash_manifest() {
  local manifest="$1" forbidden_basename="$2"
  awk -v forbidden="./${forbidden_basename}" '
    NF != 2 || length($1) != 64 || $1 !~ /^[0-9a-f]+$/ ||
    $2 !~ /^\.\/[A-Za-z0-9_.@+\/-]+$/ ||
    $2 ~ /\/\.\.?($|\/)/ || $2 ~ /\/\// || $2 == forbidden { exit 1 }
    seen[$2]++ > 0 { exit 1 }
    { print $2 }
  ' "$manifest" | LC_ALL=C sort -c -u \
    || die "artifact hash manifest is malformed or non-canonical: ${manifest}"
}

validate_hash_manifest "$source_manifest" 'SHA256SUMS'
validate_hash_manifest "$hydrated_manifest" 'HYDRATED_SHA256SUMS'
grep -F -x "$(sha256sum "$symlink_manifest" | awk '{ print $1 }')  ./HYDRATED_SYMLINKS.json" \
  "$hydrated_manifest" >/dev/null || die 'symlink topology manifest is not bound by the hydrated manifest'
grep -F '  ./SHA256SUMS' "$hydrated_manifest" >/dev/null \
  || die 'source manifest is not bound by the hydrated manifest'
if [[ "$test_mode" == false ]]; then
  wrapper_relative='./packages/database/scripts/run-current-release-restored-copy-acceptance.sh'
  wrapper_digest="$(sha256sum "$wrapper_path" | awk '{ print $1 }')"
  grep -F -x "${wrapper_digest}  ${wrapper_relative}" "$source_manifest" >/dev/null \
    || die 'exact production wrapper is not bound by the source manifest'
  grep -F -x "${wrapper_digest}  ${wrapper_relative}" "$hydrated_manifest" >/dev/null \
    || die 'exact production wrapper is not bound by the hydrated manifest'
fi
(
  cd -- "$artifact_root"
  sha256sum --check --strict --quiet SHA256SUMS
  sha256sum --check --strict --quiet HYDRATED_SHA256SUMS
) || die 'artifact hash verification failed'

cmp -s \
  <(cd -- "$artifact_root" && find . -xdev -type f ! -path './HYDRATED_SHA256SUMS' -print | LC_ALL=C sort) \
  <(awk '{ print $2 }' "$hydrated_manifest" | LC_ALL=C sort) \
  || die 'hydrated manifest does not exactly cover every regular artifact file'
[[ -z "$(comm -23 \
  <(awk '{ print $2 }' "$source_manifest" | LC_ALL=C sort) \
  <(awk '{ print $2 }' "$hydrated_manifest" | LC_ALL=C sort))" ]] \
  || die 'source manifest contains a path absent from the hydrated manifest'

"$node_bin" --input-type=module - "$artifact_root" <<'NODE'
import fs from "node:fs";
import path from "node:path";
const root = fs.realpathSync.native(process.argv[2]);
const manifestPath = path.join(root, "HYDRATED_SYMLINKS.json");
const raw = fs.readFileSync(manifestPath, "utf8");
if (Buffer.byteLength(raw) > 8 * 1024 * 1024) process.exit(1);
const links = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(absolute);
      const resolved = fs.realpathSync.native(absolute);
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) process.exit(1);
      links.push({ path: relative, target });
    } else if (entry.isDirectory()) {
      walk(absolute);
    }
  }
}
walk(root);
links.sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
if (raw !== `${JSON.stringify({ links, version: 1 })}\n`) process.exit(1);
NODE
[[ $? == 0 ]] || die 'hydrated symlink topology is invalid'

if [[ "$test_mode" == true ]]; then
  cli_path="$(realpath -e -- "$test_cli_path")"
else
  cli_path="${artifact_root}/packages/database/scripts/current-release-restored-copy-runtime-acceptance.cli.mjs"
fi
[[ -f "$cli_path" && ! -L "$cli_path" ]] || die 'exact acceptance CLI is absent or symlinked'
if [[ "$test_mode" == false ]]; then
  case "$cli_path" in "$artifact_root"/*) ;; *) die 'acceptance CLI escapes the exact artifact' ;; esac
  [[ "$(stat -c '%u:%h' -- "$cli_path")" == '0:1' ]] || die 'acceptance CLI ownership is untrusted'
fi

assert_exact_directory "$credential_root" "$authority_uid" "$authority_gid" 700
assert_exact_directory "$evidence_root" "$authority_uid" "$service_gid" 710
assert_exact_directory "$control_root" "$authority_uid" "$authority_gid" 700
if [[ "$test_mode" == true ]]; then
  cgroup_root="${control_root}/test-cgroup"
else
  cgroup_root='/sys/fs/cgroup'
fi
assert_real_directory "$cgroup_root"
if [[ "$test_mode" == false ]]; then
  for trusted_ancestor in /etc /etc/leetplus /var /var/lib /var/lib/leetplus /run; do
    assert_owned_nonwritable_directory "$trusted_ancestor" 0
  done
fi

global_lock_path="${control_root}/current-release-runtime.lock"
if [[ ! -e "$global_lock_path" && ! -L "$global_lock_path" ]]; then
  if ! (set -o noclobber; : > "$global_lock_path") 2>/dev/null; then
    [[ -e "$global_lock_path" ]] || die 'global lock file could not be created atomically'
  else
    chmod 0600 -- "$global_lock_path"
    sync -f "$global_lock_path"
    sync -d "$control_root"
  fi
fi
[[ -f "$global_lock_path" && ! -L "$global_lock_path" \
  && "$(realpath -e -- "$global_lock_path")" == "$global_lock_path" \
  && "$(stat -c '%u:%g:%a:%h' -- "$global_lock_path")" == "${authority_uid}:${authority_gid}:600:1" ]] \
  || die 'global operation lock file is untrusted'
exec {global_lock_fd}<> "$global_lock_path"
"$flock_bin" --nonblock "$global_lock_fd" \
  || die 'another current-release acceptance wrapper holds the global operation lock'

if [[ ! -e "$unit_evidence_root" && ! -L "$unit_evidence_root" ]]; then
  mkdir --mode=0710 -- "$unit_evidence_root" \
    || die 'operation-scoped unit evidence root could not be created'
  chown "${authority_uid}:${service_gid}" -- "$unit_evidence_root"
  chmod 0710 -- "$unit_evidence_root"
  sync -d "$(dirname -- "$unit_evidence_root")"
fi
assert_exact_directory "$unit_evidence_root" "$authority_uid" "$service_gid" 710

credential_file="${credential_root}/${credential_id}.json"
[[ -f "$credential_file" && ! -L "$credential_file" \
  && "$(realpath -e -- "$credential_file")" == "$credential_file" ]] \
  || die 'credential file is absent, symlinked or non-canonical'
credential_stat="$(stat -c '%u:%g:%a:%h:%s' -- "$credential_file")"
IFS=: read -r credential_uid credential_gid credential_mode credential_links credential_size <<< "$credential_stat"
IFS=$'\n\t'
[[ "$credential_uid" == "$authority_uid" && "$credential_gid" == "$authority_gid" \
  && "$credential_mode" == 400 && "$credential_links" == 1 \
  && "$credential_size" =~ ^[0-9]+$ && "$credential_size" -ge 2 \
  && "$credential_size" -le "$MAX_CREDENTIAL_BYTES" ]] \
  || die 'credential file must be authority-owned mode 0400, single-link and bounded'

credential_stat_identity="$("$node_bin" --input-type=module - \
  "$credential_file" "$MAX_CREDENTIAL_BYTES" "$authority_uid" "$authority_gid" <<'NODE'
import fs from "node:fs";
const file = process.argv[2];
const maximum = Number(process.argv[3]);
const expectedUid = BigInt(process.argv[4]);
const expectedGid = BigInt(process.argv[5]);
const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
const before = fs.fstatSync(descriptor, { bigint: true });
if (!before.isFile() || before.nlink !== 1n || before.uid !== expectedUid ||
    before.gid !== expectedGid || (before.mode & 0o777n) !== 0o400n ||
    before.size < 2n || before.size > BigInt(maximum)) process.exit(1);
const raw = Buffer.alloc(Number(before.size));
let offset = 0;
while (offset < raw.length) {
  const count = fs.readSync(descriptor, raw, offset, raw.length - offset, offset);
  if (count === 0) break;
  offset += count;
}
const after = fs.fstatSync(descriptor, { bigint: true });
fs.closeSync(descriptor);
if (offset !== raw.length || before.dev !== after.dev || before.ino !== after.ino ||
    before.size !== after.size || before.mtimeNs !== after.mtimeNs ||
    before.ctimeNs !== after.ctimeNs || before.mode !== after.mode ||
    before.uid !== after.uid || before.gid !== after.gid || before.nlink !== after.nlink ||
    raw.includes(0) || raw.at(-1) !== 10 || raw.includes(13)) process.exit(1);
let parsed;
try { parsed = JSON.parse(raw.toString("utf8")); } catch { process.exit(1); }
const keys = ["databaseUrl", "evidenceHmacKey", "loginEmail", "loginPassword"];
if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" ||
    Object.keys(parsed).sort().join("\0") !== keys.sort().join("\0") ||
    keys.some((key) => typeof parsed[key] !== "string" || parsed[key].length < 1) ||
    parsed.evidenceHmacKey.length < 32 || parsed.evidenceHmacKey.length > 4096) process.exit(1);
process.stdout.write([before.dev, before.ino, before.size, before.mtimeNs, before.ctimeNs]
  .map((value) => value.toString()).join(":"));
NODE
)" || die 'credential JSON shape or stable-read contract is invalid'
[[ "$credential_stat_identity" =~ ^[0-9]+(:[0-9]+){4}$ ]] \
  || die 'credential stat identity is invalid'

evidence_directory="${evidence_root}/${operation_id}"
evidence_path="${evidence_directory}/receipt.json"
unit_evidence_directory="${unit_evidence_root}/${operation_id}"
unit_evidence_path="${unit_evidence_directory}/receipt.json"
intent_path="${control_root}/${operation_id}.intent.json"
active_marker_path="${control_root}/active-operation.json"
main_launch_path="${control_root}/${operation_id}.main.launch.json"
verify_launch_path="${control_root}/${operation_id}.verify.launch.json"
drain_launch_path="${control_root}/${operation_id}.drain.launch.json"
completion_path="${control_root}/${operation_id}.completion.json"
main_unit="leetplus-current-release-acceptance-${operation_id}.service"
verify_unit="leetplus-current-release-verify-${operation_id}.service"
drain_unit="leetplus-current-release-drain-${operation_id}.service"

request_digest="$(printf '%s\0' "$WRAPPER_CONTRACT" "$release_sha" "$tenant_slug" \
  "$expected_system_identifier" "$expected_migration_count" "$expected_migration_head" \
  "$api_port" "$web_port" "$credential_id" "$credential_stat_identity" \
  "$evidence_key_id" "$with_reversible_write" \
  | sha256sum | awk '{ print $1 }')"
expected_intent="$(printf \
  '{"artifactRoot":"%s","contractVersion":"%s","credentialId":"%s","credentialStatIdentity":"%s","evidenceDirectory":"%s","evidenceKeyId":"%s","evidencePath":"%s","operationId":"%s","releaseSha":"%s","requestDigest":"%s","unitEvidenceDirectory":"%s","unitEvidencePath":"%s"}' \
  "$artifact_root" "$WRAPPER_CONTRACT" "$credential_id" "$credential_stat_identity" \
  "$evidence_directory" "$evidence_key_id" "$evidence_path" "$operation_id" "$release_sha" "$request_digest" \
  "$unit_evidence_directory" "$unit_evidence_path")"
expected_active_marker="$(printf \
  '{"contractVersion":"%s","credentialId":"%s","credentialStatIdentity":"%s","evidenceDirectory":"%s","mainUnit":"%s","operationId":"%s","releaseSha":"%s","requestDigest":"%s","unitEvidenceDirectory":"%s"}' \
  "$WRAPPER_CONTRACT" "$credential_id" "$credential_stat_identity" "$evidence_directory" \
  "$main_unit" "$operation_id" "$release_sha" "$request_digest" "$unit_evidence_directory")"
expected_main_launch="$(printf \
  '{"contractVersion":"%s","operationId":"%s","phase":"main","requestDigest":"%s","state":"SUBMISSION_INTENT","unit":"%s"}' \
  "$WRAPPER_CONTRACT" "$operation_id" "$request_digest" "$main_unit")"
expected_verify_launch="$(printf \
  '{"contractVersion":"%s","operationId":"%s","phase":"verify","requestDigest":"%s","state":"SUBMISSION_INTENT","unit":"%s"}' \
  "$WRAPPER_CONTRACT" "$operation_id" "$request_digest" "$verify_unit")"
expected_drain_launch="$(printf \
  '{"contractVersion":"%s","operationId":"%s","phase":"drain","requestDigest":"%s","state":"SUBMISSION_INTENT","unit":"%s"}' \
  "$WRAPPER_CONTRACT" "$operation_id" "$request_digest" "$drain_unit")"
expected_completion_pass="$(printf \
  '{"contractVersion":"%s","evidenceDirectory":"%s","operationId":"%s","releaseSha":"%s","requestDigest":"%s","result":"PASS"}' \
  "$WRAPPER_CONTRACT" "$evidence_directory" "$operation_id" "$release_sha" "$request_digest")"
expected_completion_fail="$(printf \
  '{"contractVersion":"%s","evidenceDirectory":"%s","operationId":"%s","releaseSha":"%s","requestDigest":"%s","result":"FAIL"}' \
  "$WRAPPER_CONTRACT" "$evidence_directory" "$operation_id" "$release_sha" "$request_digest")"

read_control_file() {
  local file="$1" metadata size content
  [[ -f "$file" && ! -L "$file" && "$(realpath -e -- "$file")" == "$file" ]] \
    || die "durable control file is absent or untrusted: ${file}"
  metadata="$(stat -c '%u:%g:%a:%h:%s' -- "$file")"
  IFS=: read -r file_uid file_gid file_mode file_links size <<< "$metadata"
  IFS=$'\n\t'
  [[ "$file_uid" == "$authority_uid" && "$file_gid" == "$authority_gid" \
    && "$file_mode" == 600 && "$file_links" == 1 \
    && "$size" =~ ^[0-9]+$ && "$size" -ge 2 && "$size" -le 8192 ]] \
    || die "durable control file metadata is invalid: ${file}"
  content="$(< "$file")"
  [[ ! "$content" =~ [[:cntrl:]] ]] || die "durable control file content is invalid: ${file}"
  printf '%s' "$content"
}

assert_exact_control_file() {
  local file="$1" expected="$2"
  [[ "$(read_control_file "$file")" == "$expected" ]] \
    || die "durable control file content is invalid: ${file}"
}

create_durable_control_file() {
  local file="$1" content="$2"
  [[ ! -e "$file" && ! -L "$file" ]] || die "durable control file already exists: ${file}"
  if ! (set -o noclobber; printf '%s\n' "$content" > "$file") 2>/dev/null; then
    die "durable control file could not be created with O_EXCL: ${file}"
  fi
  chmod 0600 -- "$file"
  sync -f "$file"
  sync -d "$control_root"
  assert_exact_control_file "$file" "$content"
}

remove_durable_control_file() {
  local file="$1" expected="$2"
  assert_exact_control_file "$file" "$expected"
  unlink -- "$file" || die "durable control file could not be removed: ${file}"
  if ! sync -d "$control_root"; then
    # The unlink was not durably committed. Recreate the exact global marker so
    # a cleanup/fsync failure cannot admit another operation in this boot.
    if [[ ! -e "$file" && ! -L "$file" ]]; then
      (set -o noclobber; printf '%s\n' "$expected" > "$file") 2>/dev/null \
        || die "durable control removal fsync failed and marker recovery failed: ${file}"
      chmod 0600 -- "$file" \
        || die "durable control removal fsync failed; recovered marker metadata is incomplete: ${file}"
      sync -f "$file" >/dev/null 2>&1 || true
      sync -d "$control_root" >/dev/null 2>&1 || true
    fi
    die "durable control removal fsync failed; marker retained: ${file}"
  fi
  [[ ! -e "$file" && ! -L "$file" ]] || die "durable control file removal was partial: ${file}"
}

assert_unit_evidence_root_entries() {
  local expected_name="$1"
  if ! "$node_bin" --input-type=module - "$unit_evidence_root" "$expected_name" <<'NODE'
import fs from "node:fs";
const root = process.argv[2];
const expected = Buffer.from(process.argv[3], "utf8");
const directory = fs.opendirSync(root, { encoding: "buffer", bufferSize: 1 });
let count = 0;
try {
  for (;;) {
    const entry = directory.readSync();
    if (entry === null) break;
    count += 1;
    if (expected.length === 0 || count > 1 || !Buffer.isBuffer(entry.name) ||
        !entry.name.equals(expected) || !entry.isDirectory()) process.exit(64);
  }
} finally {
  directory.closeSync();
}
if (count !== (expected.length === 0 ? 0 : 1)) process.exit(65);
NODE
  then
    die 'operation-scoped unit evidence root contains an unexpected or unsafe entry'
  fi
}

assert_empty_unit_evidence_target() {
  assert_unit_evidence_root_entries "$operation_id"
  assert_exact_directory "$unit_evidence_directory" "$authority_uid" "$authority_gid" 700
  if ! "$node_bin" --input-type=module - "$unit_evidence_directory" <<'NODE'
import fs from "node:fs";
const directoryPath = process.argv[2];
const directory = fs.opendirSync(directoryPath, { encoding: "buffer", bufferSize: 1 });
try {
  if (directory.readSync() !== null) process.exit(64);
} finally {
  directory.closeSync();
}
NODE
  then
    die 'operation-scoped unit evidence target is not exactly empty'
  fi
}

ensure_unit_evidence_target() {
  if [[ ! -e "$unit_evidence_directory" && ! -L "$unit_evidence_directory" ]]; then
    mkdir --mode=0700 -- "$unit_evidence_directory" \
      || die 'operation-scoped unit evidence target could not be created'
    chown "${authority_uid}:${authority_gid}" -- "$unit_evidence_directory"
    chmod 0700 -- "$unit_evidence_directory"
    sync -d "$unit_evidence_root"
  fi
  assert_empty_unit_evidence_target
}

remove_unit_evidence_target() {
  assert_empty_unit_evidence_target
  rmdir -- "$unit_evidence_directory" \
    || die 'operation-scoped unit evidence target cleanup was partial'
  sync -d "$unit_evidence_root"
  assert_unit_evidence_root_entries ''
  [[ ! -e "$unit_evidence_directory" && ! -L "$unit_evidence_directory" ]] \
    || die 'operation-scoped unit evidence target remained after cleanup'
}

active_marker_owned=false
completed_operation=false
completion_result=''
if [[ -e "$active_marker_path" || -L "$active_marker_path" ]]; then
  assert_exact_control_file "$active_marker_path" "$expected_active_marker"
  [[ "$reconcile" == true ]] \
    || die 'the exact active operation exists; only --reconcile may resume it'
  active_marker_owned=true
fi

if [[ "$reconcile" == true ]]; then
  assert_exact_control_file "$intent_path" "$expected_intent"
  if [[ -e "$completion_path" || -L "$completion_path" ]]; then
    completion_content="$(read_control_file "$completion_path")"
    [[ "$completion_content" == "$expected_completion_pass" \
      || "$completion_content" == "$expected_completion_fail" ]] \
      || die 'completed-operation receipt is not bound to the exact request'
    completed_operation=true
    if [[ "$completion_content" == "$expected_completion_pass" ]]; then
      completion_result=PASS
    else
      completion_result=FAIL
    fi
  fi
  ensure_unit_evidence_target
else
  [[ "$active_marker_owned" == false ]] || die 'a new operation cannot replace the active operation'
  [[ ! -e "$intent_path" && ! -L "$intent_path" ]] \
    || die 'operation intent already exists; use --reconcile with the exact original request'
  [[ ! -e "$evidence_directory" && ! -L "$evidence_directory" ]] \
    || die 'per-operation evidence directory already exists before the operation intent'
  [[ ! -e "$unit_evidence_directory" && ! -L "$unit_evidence_directory" ]] \
    || die 'operation-scoped unit evidence target already exists before the operation intent'
  assert_unit_evidence_root_entries ''
  for stale_path in "$main_launch_path" "$verify_launch_path" "$drain_launch_path" "$completion_path"; do
    [[ ! -e "$stale_path" && ! -L "$stale_path" ]] \
      || die "new operation has preexisting durable phase state: ${stale_path}"
  done
  create_durable_control_file "$intent_path" "$expected_intent"
  mkdir --mode=0700 -- "$evidence_directory" \
    || die 'fresh per-operation evidence directory could not be created'
  chown "${service_uid}:${service_gid}" -- "$evidence_directory"
  chmod 0700 -- "$evidence_directory"
  sync -d "$evidence_root"
  assert_exact_directory "$evidence_directory" "$service_uid" "$service_gid" 700
  ensure_unit_evidence_target
  create_durable_control_file "$active_marker_path" "$expected_active_marker"
  active_marker_owned=true
  if [[ "$test_mode" == true && -f "${control_root}/test-crash-after-marker" ]]; then
    exit 97
  fi
fi

assert_empty_cgroup_procs() {
  local cgroup_procs_path="$1"
  [[ -f "$cgroup_procs_path" && ! -L "$cgroup_procs_path" && -r "$cgroup_procs_path" ]] \
    || die "systemd unit cgroup is unreadable, nonempty or unbounded: ${cgroup_procs_path}"
  if ! "$node_bin" --input-type=module - "$cgroup_procs_path" <<'NODE'
import fs from "node:fs";
const file = process.argv[2];
const maximum = 1_048_576;
const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
try {
  const before = fs.fstatSync(descriptor, { bigint: true });
  if (!before.isFile()) process.exit(64);
  let total = 0;
  for (;;) {
    const chunk = Buffer.alloc(4096);
    const count = fs.readSync(descriptor, chunk, 0, chunk.length, null);
    if (count === 0) break;
    total += count;
    if (total > maximum) process.exit(65);
  }
  const after = fs.fstatSync(descriptor, { bigint: true });
  if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode) process.exit(66);
  if (total !== 0) process.exit(67);
} finally {
  fs.closeSync(descriptor);
}
NODE
  then
    die "systemd unit cgroup is unreadable, nonempty or unbounded: ${cgroup_procs_path}"
  fi
}

unit_is_exactly_absent() {
  local unit="$1" status output key value count=0
  local -A state=()
  set +e
  output="$("$timeout_bin" --signal=KILL --kill-after=1s 5s \
    "$systemctl_bin" show "$unit" --all --no-pager \
    --property=Id --property=LoadState --property=ActiveState \
    --property=SubState --property=MainPID --property=ControlGroup 2>/dev/null)"
  status=$?
  set -e
  [[ "$status" == 0 && "${#output}" -le 4096 && ! "$output" =~ $'\r' ]] || return 1
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^(Id|LoadState|ActiveState|SubState|MainPID|ControlGroup)$ \
      && ! "$value" =~ [[:cntrl:]] && -z "${state[$key]+present}" ]] || return 1
    state[$key]="$value"
    ((count += 1))
  done <<< "$output"
  [[ "$count" == 6 \
    && "${state[Id]+present}" == present \
    && "${state[LoadState]+present}" == present \
    && "${state[ActiveState]+present}" == present \
    && "${state[SubState]+present}" == present \
    && "${state[MainPID]+present}" == present \
    && "${state[ControlGroup]+present}" == present \
    && "${state[Id]}" == "$unit" \
    && "${state[LoadState]}" == not-found \
    && "${state[ActiveState]}" == inactive \
    && "${state[SubState]}" == dead \
    && "${state[MainPID]}" == 0 \
    && -z "${state[ControlGroup]}" ]] || return 1
  assert_no_foreign_service_uid_processes
  return 0
}

assert_unit_safely_stopped() {
  local unit="$1" launch_proven="$2" allow_absent_after_completion="${3:-false}"
  local status output key value count=0 cgroup_path
  local -A state=()
  set +e
  output="$("$timeout_bin" --signal=KILL --kill-after=1s 5s \
    "$systemctl_bin" show "$unit" --all --no-pager \
    --property=Id --property=LoadState --property=ActiveState \
    --property=SubState --property=MainPID --property=ControlGroup 2>/dev/null)"
  status=$?
  set -e
  [[ "$status" == 0 && "${#output}" -le 4096 && ! "$output" =~ $'\r' ]] \
    || die "systemd unit state is unavailable or unbounded: ${unit}"
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^(Id|LoadState|ActiveState|SubState|MainPID|ControlGroup)$ \
      && ! "$value" =~ [[:cntrl:]] && -z "${state[$key]+present}" ]] \
      || die "systemd unit state is malformed: ${unit}"
    state[$key]="$value"
    ((count += 1))
  done <<< "$output"
  [[ "$count" == 6 \
    && -n "${state[Id]+present}" \
    && -n "${state[LoadState]+present}" \
    && -n "${state[ActiveState]+present}" \
    && -n "${state[SubState]+present}" \
    && -n "${state[MainPID]+present}" \
    && -n "${state[ControlGroup]+present}" \
    && "${state[Id]}" == "$unit" \
    && "${state[MainPID]}" == 0 ]] \
    || die "systemd unit state is incomplete: ${unit}"
  if [[ ( "$launch_proven" == false || "$allow_absent_after_completion" == true ) \
    && "${state[LoadState]}" == not-found \
    && "${state[ActiveState]}" == inactive \
    && "${state[SubState]}" == dead \
    && -z "${state[ControlGroup]}" ]]; then
    assert_no_foreign_service_uid_processes
    return 0
  fi
  [[ "$launch_proven" == true \
    && "${state[LoadState]}" == loaded \
    && ( ( "${state[ActiveState]}" == inactive && "${state[SubState]}" == dead ) \
      || ( "${state[ActiveState]}" == failed && "${state[SubState]}" == failed ) ) \
    && "${state[ControlGroup]}" == "/system.slice/${unit}" ]] \
    || die "systemd unit is active, transitional, not-found-after-launch or ambiguous: ${unit}"
  assert_unit_effective_policy "$unit"
  cgroup_path="${cgroup_root}${state[ControlGroup]}"
  assert_empty_cgroup_procs "$cgroup_path/cgroup.procs"
  assert_no_foreign_service_uid_processes
}

bounded_reset_failed() {
  local status
  set +e
  "$timeout_bin" --signal=KILL --kill-after=1s "$RESET_FAILED_TIMEOUT" \
    "$systemctl_bin" reset-failed "$@" >/dev/null 2>&1
  status=$?
  set -e
  [[ "$status" == 0 ]] || die 'bounded systemd reset-failed cleanup did not complete'
}

bounded_reset_failed_after_completion() {
  local status unit
  set +e
  "$timeout_bin" --signal=KILL --kill-after=1s "$RESET_FAILED_TIMEOUT" \
    "$systemctl_bin" reset-failed "$@" >/dev/null 2>&1
  status=$?
  set -e
  if [[ "$status" != 0 ]]; then
    for unit in "$@"; do
      assert_unit_safely_stopped "$unit" true true
    done
  fi
}

prepare_readonly_phase_retry() {
  local unit="$1"
  # Drain/verifier phases are exact, credential-bound and read-only. If their
  # transient metadata was already collected, rerunning the same oracle is the
  # proof; a loaded unit must still pass the strict cgroup drain first.
  if unit_is_exactly_absent "$unit"; then
    return 0
  fi
  assert_unit_safely_stopped "$unit" true
  bounded_reset_failed "$unit"
}

assert_readonly_phase_safely_stopped() {
  local unit="$1"
  if unit_is_exactly_absent "$unit"; then
    return 0
  fi
  assert_unit_safely_stopped "$unit" true
}

common_properties=(
  '--property=User=leetplus-rehearsal'
  '--property=Group=leetplus-rehearsal'
  '--property=SupplementaryGroups=leetplus-runtime'
  "--property=LoadCredential=${CREDENTIAL_NAME}:${credential_file}"
  "--property=WorkingDirectory=${artifact_root}/packages/database"
  '--property=Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C LC_ALL=C TZ=UTC SHELL=/usr/sbin/nologin'
  '--property=SetLoginEnvironment=yes'
  '--property=NoNewPrivileges=yes'
  '--property=CapabilityBoundingSet='
  '--property=AmbientCapabilities='
  '--property=IPAddressDeny=any'
  '--property=IPAddressAllow=localhost'
  '--property=Delegate=no'
  '--property=MemoryPressureWatch=skip'
  '--property=PrivateTmp=yes'
  '--property=PrivateDevices=yes'
  '--property=ProtectSystem=strict'
  '--property=ProtectHome=yes'
  '--property=ProtectProc=invisible'
  '--property=ProcSubset=pid'
  '--property=ProtectKernelTunables=yes'
  '--property=ProtectKernelModules=yes'
  '--property=ProtectKernelLogs=yes'
  '--property=ProtectControlGroups=yes'
  '--property=ProtectClock=yes'
  '--property=ProtectHostname=yes'
  '--property=LockPersonality=yes'
  '--property=RestrictRealtime=yes'
  '--property=RestrictSUIDSGID=yes'
  '--property=SystemCallArchitectures=native'
  '--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6'
  "--property=InaccessiblePaths=${evidence_root}"
  "--property=ReadOnlyPaths=${artifact_root}"
  '--property=KillMode=control-group'
  '--property=TimeoutStopSec=20s'
  '--property=UMask=0077'
  "--property=UnsetEnvironment=${UNIT_UNSET_ENVIRONMENT}"
  '--property=StandardOutput=null'
  '--property=StandardError=null'
)

IFS= read -r -d '' child_policy_eval <<'NODE' || true
import childProcess from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const fail = (code) => process.exit(code);
const markerIndex = process.argv.indexOf("--leetplus-child-policy-v1");
if (markerIndex !== 1) fail(80);
const fixed = process.argv.slice(markerIndex + 1, markerIndex + 18);
if (fixed.length !== 17) fail(81);
const [phase, contractMode, unit, systemctlPath, nodePath, expectedUidRaw, expectedGidRaw,
  artifactGidRaw, expectedUser, expectedGroup, artifactGroup, artifactRoot,
  credentialSource, evidenceRoot, operationId, unitEvidenceDirectory, payloadMode] = fixed;
const payloadMarker = process.argv.indexOf("--child-payload", markerIndex + 18);
if (payloadMarker !== markerIndex + 18) fail(82);
const payload = process.argv.slice(payloadMarker + 1);
const hostEvidenceDirectory = phase === "drain" ? "-" : `${evidenceRoot}/${operationId}`;
if (!/^(main|verify|replay|drain)$/u.test(phase) ||
    !/^(production|fixture)$/u.test(contractMode)) fail(110);
if (!/^leetplus-current-release-[a-z-]+[a-z0-9]+\.service$/u.test(unit) ||
    !/^[a-z0-9]{8,32}$/u.test(operationId)) fail(111);
if (![expectedUser, expectedGroup, artifactGroup]
    .every((value) => /^[a-z_][a-z0-9_-]{2,63}$/u.test(value))) fail(112);
if (![systemctlPath, nodePath, artifactRoot, credentialSource, evidenceRoot]
    .every((value) => value.startsWith("/") && !/[\u0000-\u0020\\]/u.test(value))) fail(113);
if (![hostEvidenceDirectory, unitEvidenceDirectory].every((value) => value === "-" ||
    (value.startsWith("/") && !/[\u0000-\u0020\\]/u.test(value)))) fail(114);
if ((phase === "main" && unit !== `leetplus-current-release-acceptance-${operationId}.service`) ||
    (phase === "verify" && unit !== `leetplus-current-release-verify-${operationId}.service`) ||
    (phase === "drain" && unit !== `leetplus-current-release-drain-${operationId}.service`) ||
    (phase === "replay" && !unit.startsWith(`leetplus-current-release-replay-${operationId}`))) fail(115);
if (!/^(cli|drain)$/u.test(payloadMode) ||
    (phase === "drain") !== (payloadMode === "drain")) fail(116);
if (contractMode === "production" && (
    expectedUser !== "leetplus-rehearsal" || expectedGroup !== "leetplus-rehearsal" ||
    artifactGroup !== "leetplus-runtime" || systemctlPath !== "/usr/bin/systemctl" ||
    nodePath !== "/usr/bin/node" || evidenceRoot !== "/var/lib/leetplus/rehearsal-evidence" ||
    unitEvidenceDirectory !== (phase === "drain" ? "-" :
      `/run/leetplus-current-release-evidence/${operationId}`) ||
    !/^\/srv\/leetplus\/releases\/[0-9a-f]{40}$/u.test(artifactRoot) ||
    !/^\/etc\/leetplus\/rehearsal-credentials\/[a-z0-9][a-z0-9._-]{2,63}\.json$/u
      .test(credentialSource))) fail(117);
const fixtureRoot = contractMode === "fixture"
  ? artifactRoot.match(/^(\/run\/leetplus-current-evidence-isolation\.[A-Za-z0-9]{8})\/artifact$/u)?.[1]
  : undefined;
if (contractMode === "fixture" && (!fixtureRoot ||
    expectedUser !== "leetplus-evidence-fixture" ||
    expectedGroup !== "leetplus-evidence-fixture" ||
    artifactGroup !== "leetplus-evidence-runtime" ||
    systemctlPath !== "/usr/bin/systemctl" ||
    nodePath !== "/usr/local/libexec/leetplus/current-wrapper-fixture-node22" ||
    credentialSource !== `${fixtureRoot}/credential.json` ||
    evidenceRoot !== `${fixtureRoot}/evidence` ||
    unitEvidenceDirectory !== (phase === "drain" ? "-" :
      `${fixtureRoot}/unit-evidence/${operationId}`))) fail(118);
const expectedUid = Number(expectedUidRaw);
const expectedGid = Number(expectedGidRaw);
const artifactGid = Number(artifactGidRaw);
if (![expectedUid, expectedGid, artifactGid]
    .every((value) => Number.isSafeInteger(value) && value > 0) ||
    expectedGid === artifactGid || process.execPath !== nodePath) fail(84);

const status = fs.readFileSync("/proc/self/status", "utf8");
const readStatusIds = (name) => {
  const match = status.match(new RegExp(`^${name}:\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)$`, "mu"));
  if (!match) fail(85);
  return match.slice(1).map(Number);
};
const uidSet = readStatusIds("Uid");
const gidSet = readStatusIds("Gid");
const groupMatch = status.match(/^Groups:\s*([0-9 ]*)$/mu);
if (!groupMatch || uidSet.some((value) => value !== expectedUid) ||
    gidSet.some((value) => value !== expectedGid) ||
    process.getuid?.() !== expectedUid || process.geteuid?.() !== expectedUid ||
    process.getgid?.() !== expectedGid || process.getegid?.() !== expectedGid) fail(86);
const statusGroups = groupMatch[1].trim() === "" ? [] :
  groupMatch[1].trim().split(/ +/u).map(Number).sort((a, b) => a - b);
const processGroups = (process.getgroups?.() ?? []).sort((a, b) => a - b);
const expectedGroups = [expectedGid, artifactGid].sort((a, b) => a - b);
if (JSON.stringify(statusGroups) !== JSON.stringify(expectedGroups) ||
    JSON.stringify(processGroups) !== JSON.stringify(expectedGroups)) fail(87);

const expectedCredentialDirectory = `/run/credentials/${unit}`;
const requiredEnvironment = new Map([
  ["PATH", "/usr/sbin:/usr/bin:/sbin:/bin"],
  ["LANG", "C"],
  ["LC_ALL", "C"],
  ["TZ", "UTC"],
  ["USER", expectedUser],
  ["LOGNAME", expectedUser],
  ["HOME", "/nonexistent"],
  ["SHELL", "/usr/sbin/nologin"],
  ["CREDENTIALS_DIRECTORY", expectedCredentialDirectory],
  ["SYSTEMD_EXEC_PID", String(process.pid)],
]);
if (!/^[0-9a-f]{64}$/u.test(process.env.LEETPLUS_CHILD_POLICY_SHA256 ?? "")) fail(88);
requiredEnvironment.set("LEETPLUS_CHILD_POLICY_SHA256", process.env.LEETPLUS_CHILD_POLICY_SHA256);
const environmentNames = Object.keys(process.env).sort();
const allowedEnvironmentNames = [...requiredEnvironment.keys(), "INVOCATION_ID"].sort();
const unexpectedEnvironmentNames = environmentNames.filter(
  (name) => !allowedEnvironmentNames.includes(name),
);
const missingEnvironmentNames = allowedEnvironmentNames.filter(
  (name) => !environmentNames.includes(name),
);
const mismatchedEnvironmentNames = [...requiredEnvironment]
  .filter(([name, value]) => process.env[name] !== value)
  .map(([name]) => name);
const invocationIdValid = /^[0-9a-f]{32}$/u.test(process.env.INVOCATION_ID ?? "");
const writeFixturePolicyDiagnostic = (diagnostic) => {
  if (contractMode !== "fixture" || unitEvidenceDirectory === "-") return;
  try {
    fs.writeFileSync(
      `${unitEvidenceDirectory}/child-policy-diagnostic.json`,
      `${JSON.stringify(diagnostic)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
  } catch {
    // Keep the policy exit status authoritative when best-effort diagnostics cannot be persisted.
  }
};
if (unexpectedEnvironmentNames.length !== 0 || missingEnvironmentNames.length !== 0 ||
    mismatchedEnvironmentNames.length !== 0 || !invocationIdValid) {
  writeFixturePolicyDiagnostic({ stage: "environment", invocationIdValid,
    mismatchedEnvironmentNames, missingEnvironmentNames, unexpectedEnvironmentNames });
  fail(123);
}
const commandLine = fs.readFileSync("/proc/self/cmdline");
if (commandLine.length < 32 || commandLine.length > 262144 ||
    commandLine[commandLine.length - 1] !== 0) fail(124);
const commandArguments = commandLine.subarray(0, -1).toString("utf8").split("\0");
if (commandArguments.length < 7 || commandArguments[0] !== nodePath ||
    commandArguments[1] !== "--input-type=module" || commandArguments[2] !== "--eval" ||
    commandArguments[4] !== "--" ||
    JSON.stringify(commandArguments.slice(5)) !== JSON.stringify(process.argv.slice(1))) fail(125);
const sourceDigest = (await import("node:crypto")).createHash("sha256")
  .update(commandArguments[3], "utf8").digest("hex");
if (sourceDigest !== process.env.LEETPLUS_CHILD_POLICY_SHA256) fail(126);
if (fs.realpathSync.native(process.cwd()) !==
    fs.realpathSync.native(`${artifactRoot}/packages/database`)) fail(89);
const cgroup = fs.readFileSync("/proc/self/cgroup", "utf8");
if (cgroup !== `0::/system.slice/${unit}\n`) fail(90);

// systemd redacts LoadCredential as [unprintable] from this unprivileged
// process. The privileged parent attests its exact source after the unit
// stops; this child separately opens and validates the delivered credential.
const propertyNames = [
  "Id", "LoadState", "ActiveState", "SubState", "MainPID", "ControlGroup",
  "User", "Group", "SupplementaryGroups", "DynamicUser", "WorkingDirectory",
  "Environment", "EnvironmentFiles", "PassEnvironment", "SetLoginEnvironment",
  "UnsetEnvironment", "NoNewPrivileges",
  "CapabilityBoundingSet", "AmbientCapabilities", "IPAddressDeny", "IPAddressAllow",
  "Delegate", "MemoryPressureWatch", "PrivateTmp", "PrivateDevices", "ProtectSystem", "ProtectHome",
  "ProtectProc", "ProcSubset", "ProtectKernelTunables", "ProtectKernelModules",
  "ProtectKernelLogs", "ProtectControlGroups", "ProtectClock", "ProtectHostname",
  "LockPersonality", "RestrictRealtime", "RestrictSUIDSGID", "SystemCallArchitectures",
  "RestrictAddressFamilies", "RootDirectory", "RootImage", "InaccessiblePaths",
  "BindPaths", "BindReadOnlyPaths", "ReadOnlyPaths", "ReadWritePaths", "KillMode",
  "TimeoutStopUSec", "UMask", "StandardOutput", "StandardError", "RuntimeMaxUSec",
];
let rawProperties;
try {
  rawProperties = childProcess.execFileSync(systemctlPath,
    ["show", unit, "--all", "--no-pager", ...propertyNames.map((name) => `--property=${name}`)],
    { encoding: "utf8", env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin", LANG: "C", LC_ALL: "C" },
      maxBuffer: 262144, timeout: 5000 });
} catch { fail(91); }
if (rawProperties.length > 262144 || rawProperties.includes("\r")) fail(92);
const actual = new Map();
for (const line of rawProperties.split("\n")) {
  if (line === "") continue;
  const separator = line.indexOf("=");
  if (separator < 1) fail(93);
  const key = line.slice(0, separator);
  const value = line.slice(separator + 1);
  if (!propertyNames.includes(key) || actual.has(key) || /[\u0000-\u001f\u007f]/u.test(value)) fail(94);
  actual.set(key, value);
}
// systemctl omits an empty EnvironmentFiles a(sb) property even with --all.
if (!actual.has("EnvironmentFiles")) actual.set("EnvironmentFiles", "");
if (actual.size !== propertyNames.length) fail(95);
const expectedReadOnlyPaths = phase === "verify" || phase === "replay"
  ? `${artifactRoot} ${unitEvidenceDirectory}` : artifactRoot;
const expected = new Map([
  ["Id", unit], ["LoadState", "loaded"], ["ActiveState", "active"], ["SubState", "running"],
  ["MainPID", String(process.pid)], ["ControlGroup", `/system.slice/${unit}`],
  ["User", expectedUser], ["Group", expectedGroup],
  ["SupplementaryGroups", artifactGroup], ["DynamicUser", "no"],
  ["WorkingDirectory", `${artifactRoot}/packages/database`],
  ["Environment", `PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C LC_ALL=C TZ=UTC SHELL=/usr/sbin/nologin LEETPLUS_CHILD_POLICY_SHA256=${process.env.LEETPLUS_CHILD_POLICY_SHA256}`],
  ["EnvironmentFiles", ""], ["PassEnvironment", ""], ["SetLoginEnvironment", "yes"],
  ["UnsetEnvironment", "CURRENT_RELEASE_RESTORED_DATABASE_URL CURRENT_RELEASE_EVIDENCE_HMAC_KEY CURRENT_RELEASE_LOGIN_EMAIL CURRENT_RELEASE_LOGIN_PASSWORD BASH_ENV ENV SGX_AESM_ADDR NODE_OPTIONS NODE_PATH NODE_EXTRA_CA_CERTS NODE_DEBUG NODE_V8_COVERAGE NODE_COMPILE_CACHE SSLKEYLOGFILE LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT GCONV_PATH LOCPATH OPENSSL_CONF OPENSSL_MODULES GLIBC_TUNABLES MALLOC_CHECK_ MALLOC_PERTURB_ HTTP_PROXY HTTPS_PROXY FTP_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy ftp_proxy all_proxy no_proxy NODE_USE_ENV_PROXY CURL_HOME CURL_CA_BUNDLE SSL_CERT_FILE SSL_CERT_DIR TMP TMPDIR TEMP XDG_CONFIG_HOME XDG_CACHE_HOME NPM_CONFIG_USERCONFIG npm_config_userconfig NPM_CONFIG_GLOBALCONFIG npm_config_globalconfig NPM_CONFIG_NODE_OPTIONS npm_config_node_options NPM_CONFIG_SCRIPT_SHELL npm_config_script_shell PNPM_HOME COREPACK_HOME GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM"],
  ["NoNewPrivileges", "yes"], ["CapabilityBoundingSet", ""], ["AmbientCapabilities", ""],
  ["IPAddressDeny", "0.0.0.0/0 ::/0"],
  ["IPAddressAllow", "127.0.0.0/8 ::1/128"], ["Delegate", "no"],
  ["MemoryPressureWatch", "skip"],
  ["PrivateTmp", "yes"], ["PrivateDevices", "yes"], ["ProtectSystem", "strict"],
  ["ProtectHome", "yes"], ["ProtectProc", "invisible"], ["ProcSubset", "pid"],
  ["ProtectKernelTunables", "yes"], ["ProtectKernelModules", "yes"],
  ["ProtectKernelLogs", "yes"], ["ProtectControlGroups", "yes"],
  ["ProtectClock", "yes"], ["ProtectHostname", "yes"], ["LockPersonality", "yes"],
  ["RestrictRealtime", "yes"], ["RestrictSUIDSGID", "yes"],
  ["SystemCallArchitectures", "native"],
  ["RestrictAddressFamilies", "AF_UNIX AF_INET AF_INET6"],
  ["RootDirectory", ""], ["RootImage", ""],
  ["InaccessiblePaths", evidenceRoot],
  ["BindPaths", phase === "main" ? `${hostEvidenceDirectory}:${unitEvidenceDirectory}` : ""],
  ["BindReadOnlyPaths", phase === "verify" || phase === "replay"
    ? `${hostEvidenceDirectory}:${unitEvidenceDirectory}` : ""],
  ["ReadOnlyPaths", expectedReadOnlyPaths],
  ["ReadWritePaths", phase === "main" ? unitEvidenceDirectory : ""],
  ["KillMode", "control-group"], ["TimeoutStopUSec", "20s"], ["UMask", "0077"],
  ["StandardOutput", "null"], ["StandardError", "null"],
  ["RuntimeMaxUSec", phase === "main" ? "14min" : "30s"],
]);
const setProperties = new Set(["Environment", "UnsetEnvironment", "SupplementaryGroups",
  "IPAddressDeny", "IPAddressAllow", "RestrictAddressFamilies", "ReadOnlyPaths"]);
const exactTokenSet = (value) => {
  if (value === "") return [];
  const tokens = value.split(" ");
  if (tokens.some((token) => token === "") || new Set(tokens).size !== tokens.length) return null;
  return tokens.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
};
for (const [key, value] of expected) {
  let matches;
  if (setProperties.has(key)) {
    const actualTokens = exactTokenSet(actual.get(key) ?? "");
    const expectedTokens = exactTokenSet(value);
    matches = actualTokens !== null && expectedTokens !== null &&
      JSON.stringify(actualTokens) === JSON.stringify(expectedTokens);
  } else {
    matches = actual.get(key) === value;
  }
  if (!matches) {
    writeFixturePolicyDiagnostic({ stage: "effective-property", key,
      actual: (actual.get(key) ?? "").slice(0, 2048), expected: value.slice(0, 2048) });
    fail(96);
  }
}
if (payloadMode === "cli") {
  if (payload.length < 2 || !payload[0].startsWith("/") || payload[0] !==
      `${artifactRoot}/packages/database/scripts/current-release-restored-copy-runtime-acceptance.cli.mjs`) fail(98);
  const implementation = await import(pathToFileURL(payload[0]).href);
  if (typeof implementation.main !== "function") fail(99);
  process.exitCode = await implementation.main(payload.slice(1), process.env);
} else {
  if (phase !== "drain" || payload.length !== 1 || payload[0] !== "--drain-check") fail(100);
  const credentialPath = `${process.env.CREDENTIALS_DIRECTORY}/current-release-runtime.json`;
  const descriptor = fs.openSync(credentialPath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  const before = fs.fstatSync(descriptor, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n || before.size < 2n || before.size > 32768n) fail(101);
  const raw = Buffer.alloc(Number(before.size));
  let offset = 0;
  while (offset < raw.length) {
    const count = fs.readSync(descriptor, raw, offset, raw.length - offset, offset);
    if (count === 0) break;
    offset += count;
  }
  const after = fs.fstatSync(descriptor, { bigint: true });
  fs.closeSync(descriptor);
  if (offset !== raw.length || before.dev !== after.dev || before.ino !== after.ino ||
      before.size !== after.size || before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs || before.mode !== after.mode ||
      before.uid !== after.uid || before.gid !== after.gid || before.nlink !== after.nlink) fail(102);
  let credential;
  try { credential = JSON.parse(raw.toString("utf8")); } catch { fail(103); }
  const exactKeys = ["databaseUrl", "evidenceHmacKey", "loginEmail", "loginPassword"];
  if (!credential || Array.isArray(credential) ||
      Object.keys(credential).sort().join("\0") !== exactKeys.sort().join("\0")) fail(104);
  let target;
  try { target = new URL(credential.databaseUrl); } catch { fail(105); }
  const expectedDatabase = decodeURIComponent(target.pathname.slice(1));
  const expectedPort = Number(target.port);
  if (!(target.protocol === "postgresql:" || target.protocol === "postgres:") ||
      target.hostname !== "127.0.0.1" || expectedPort === 5432 ||
      !Number.isInteger(expectedPort) || expectedPort < 1024 || expectedPort > 65535 ||
      !/^leetplus_restored_[a-z0-9_]{3,48}$/u.test(expectedDatabase)) fail(106);
  const imported = await import("pg");
  const Client = imported.default?.Client ?? imported.Client;
  const client = new Client({ connectionString: credential.databaseUrl,
    application_name: "leetplus_current_release_drain" });
  const timer = setTimeout(() => client.end().catch(() => {}), 10_000);
  try {
    await client.connect();
    const result = await client.query(`
      SELECT current_database() AS database,
             host(inet_server_addr()) AS address,
             inet_server_port()::int AS port,
             (SELECT COUNT(*)::int FROM pg_stat_activity
               WHERE datname = current_database() AND pid <> pg_backend_pid()) AS sessions
    `);
    const row = result.rows[0];
    if (result.rows.length !== 1 || row.database !== expectedDatabase ||
        !["127.0.0.1", "::1"].includes(row.address) || row.port !== expectedPort ||
        row.sessions !== 0) process.exitCode = 107;
  } finally {
    clearTimeout(timer);
    await client.end().catch(() => {});
  }
}
NODE

child_policy_sha256="$(printf '%s' "$child_policy_eval" \
  | "$node_bin" --input-type=module --eval \
    'import crypto from "node:crypto"; const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); process.stdout.write(crypto.createHash("sha256").update(Buffer.concat(chunks)).digest("hex"));')" \
  || die 'child policy source digest could not be computed'
[[ "$child_policy_sha256" =~ ^[0-9a-f]{64}$ ]] \
  || die 'child policy source digest is malformed'
# systemd expands $NAME and ${NAME} in ExecStart arguments. Doubling every
# dollar preserves the exact reviewed JavaScript source delivered to Node.
child_policy_systemd_eval="${child_policy_eval//\$/\$\$}"
[[ "${child_policy_systemd_eval//\$\$/\$}" == "$child_policy_eval" ]] \
  || die 'child policy systemd dollar escaping is not reversible'
common_properties+=("--property=Environment=LEETPLUS_CHILD_POLICY_SHA256=${child_policy_sha256}")

exact_space_token_set_equal() {
  local left="$1" right="$2" token
  local -a left_tokens=() right_tokens=()
  local -A left_set=() right_set=()
  if [[ -n "$left" ]]; then
    IFS=' ' read -r -a left_tokens <<< "$left"
    IFS=$'\n\t'
  fi
  if [[ -n "$right" ]]; then
    IFS=' ' read -r -a right_tokens <<< "$right"
    IFS=$'\n\t'
  fi
  for token in "${left_tokens[@]}"; do
    [[ -n "$token" && -z "${left_set[$token]+present}" ]] || return 1
    left_set[$token]=1
  done
  for token in "${right_tokens[@]}"; do
    [[ -n "$token" && -z "${right_set[$token]+present}" ]] || return 1
    right_set[$token]=1
  done
  [[ "${#left_set[@]}" == "${#right_set[@]}" ]] || return 1
  for token in "${!left_set[@]}"; do
    [[ "${right_set[$token]+present}" == present ]] || return 1
  done
}

assert_unit_effective_policy() {
  local unit="$1" phase output status key value count=0 expected_read_only expected_bind=''
  local expected_bind_read_only='' expected_read_write='' expected_runtime exec_start
  local exec_start_remainder
  local -A actual=() expected=()
  if [[ "$unit" == "$main_unit" ]]; then
    phase=main
  elif [[ "$unit" == "$verify_unit" ]]; then
    phase=verify
  elif [[ "$unit" == "$drain_unit" ]]; then
    phase=drain
  elif [[ "$unit" == leetplus-current-release-replay-${operation_id}*.service ]]; then
    phase=replay
  else
    die "systemd unit does not belong to an exact acceptance phase: ${unit}"
  fi
  expected_read_only="$artifact_root"
  expected_runtime='30s'
  case "$phase" in
    main)
      expected_bind="${evidence_directory}:${unit_evidence_directory}"
      expected_read_write="$unit_evidence_directory"
      expected_runtime='14min'
      ;;
    verify|replay)
      expected_bind_read_only="${evidence_directory}:${unit_evidence_directory}"
      expected_read_only+=" ${unit_evidence_directory}"
      ;;
    drain) ;;
  esac
  set +e
  output="$("$timeout_bin" --signal=KILL --kill-after=1s 5s \
    "$systemctl_bin" show "$unit" --all --no-pager \
    --property=User --property=Group --property=SupplementaryGroups --property=DynamicUser \
    --property=LoadCredential --property=WorkingDirectory --property=Environment \
    --property=EnvironmentFiles --property=PassEnvironment --property=SetLoginEnvironment \
    --property=UnsetEnvironment --property=NoNewPrivileges \
    --property=CapabilityBoundingSet --property=AmbientCapabilities \
    --property=IPAddressDeny --property=IPAddressAllow --property=Delegate \
    --property=MemoryPressureWatch \
    --property=PrivateTmp --property=PrivateDevices --property=ProtectSystem --property=ProtectHome \
    --property=ProtectProc --property=ProcSubset --property=ProtectKernelTunables \
    --property=ProtectKernelModules --property=ProtectKernelLogs \
    --property=ProtectControlGroups --property=ProtectClock --property=ProtectHostname \
    --property=LockPersonality --property=RestrictRealtime --property=RestrictSUIDSGID \
    --property=SystemCallArchitectures --property=RestrictAddressFamilies \
    --property=RootDirectory --property=RootImage \
    --property=InaccessiblePaths --property=BindPaths --property=BindReadOnlyPaths \
    --property=ReadOnlyPaths --property=ReadWritePaths --property=KillMode \
    --property=TimeoutStopUSec --property=UMask --property=StandardOutput \
    --property=StandardError --property=RuntimeMaxUSec 2>/dev/null)"
  status=$?
  set -e
  [[ "$status" == 0 && "${#output}" -le 262144 && ! "$output" =~ $'\r' ]] \
    || die "systemd unit policy is unavailable or unbounded: ${unit}"
  if [[ "$output" != EnvironmentFiles=* \
    && "$output" != *$'\nEnvironmentFiles='* ]]; then
    # systemctl omits an empty EnvironmentFiles a(sb) property even with --all.
    output+=$'\nEnvironmentFiles='
  fi
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^(User|Group|SupplementaryGroups|DynamicUser|LoadCredential|WorkingDirectory|Environment|EnvironmentFiles|PassEnvironment|SetLoginEnvironment|UnsetEnvironment|NoNewPrivileges|CapabilityBoundingSet|AmbientCapabilities|IPAddressDeny|IPAddressAllow|Delegate|MemoryPressureWatch|PrivateTmp|PrivateDevices|ProtectSystem|ProtectHome|ProtectProc|ProcSubset|ProtectKernelTunables|ProtectKernelModules|ProtectKernelLogs|ProtectControlGroups|ProtectClock|ProtectHostname|LockPersonality|RestrictRealtime|RestrictSUIDSGID|SystemCallArchitectures|RestrictAddressFamilies|RootDirectory|RootImage|InaccessiblePaths|BindPaths|BindReadOnlyPaths|ReadOnlyPaths|ReadWritePaths|KillMode|TimeoutStopUSec|UMask|StandardOutput|StandardError|RuntimeMaxUSec)$ \
      && ! "$value" =~ [[:cntrl:]] && -z "${actual[$key]+present}" ]] \
      || die "systemd unit policy is malformed: ${unit}"
    actual[$key]="$value"
    ((count += 1))
  done <<< "$output"
  expected=(
    [User]="$SERVICE_USER"
    [Group]="$SERVICE_GROUP"
    [SupplementaryGroups]="$ARTIFACT_READ_GROUP"
    [DynamicUser]=no
    [LoadCredential]="${CREDENTIAL_NAME}:${credential_file}"
    [WorkingDirectory]="${artifact_root}/packages/database"
    [Environment]="PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C LC_ALL=C TZ=UTC SHELL=/usr/sbin/nologin LEETPLUS_CHILD_POLICY_SHA256=${child_policy_sha256}"
    [EnvironmentFiles]=''
    [PassEnvironment]=''
    [SetLoginEnvironment]=yes
    [UnsetEnvironment]="$UNIT_UNSET_ENVIRONMENT"
    [NoNewPrivileges]=yes
    [CapabilityBoundingSet]=''
    [AmbientCapabilities]=''
    [IPAddressDeny]='0.0.0.0/0 ::/0'
    [IPAddressAllow]='127.0.0.0/8 ::1/128'
    [Delegate]=no
    [MemoryPressureWatch]=skip
    [PrivateTmp]=yes
    [PrivateDevices]=yes
    [ProtectSystem]=strict
    [ProtectHome]=yes
    [ProtectProc]=invisible
    [ProcSubset]=pid
    [ProtectKernelTunables]=yes
    [ProtectKernelModules]=yes
    [ProtectKernelLogs]=yes
    [ProtectControlGroups]=yes
    [ProtectClock]=yes
    [ProtectHostname]=yes
    [LockPersonality]=yes
    [RestrictRealtime]=yes
    [RestrictSUIDSGID]=yes
    [SystemCallArchitectures]=native
    [RestrictAddressFamilies]='AF_UNIX AF_INET AF_INET6'
    [RootDirectory]=''
    [RootImage]=''
    [InaccessiblePaths]="$evidence_root"
    [BindPaths]="$expected_bind"
    [BindReadOnlyPaths]="$expected_bind_read_only"
    [ReadOnlyPaths]="$expected_read_only"
    [ReadWritePaths]="$expected_read_write"
    [KillMode]=control-group
    [TimeoutStopUSec]=20s
    [UMask]=0077
    [StandardOutput]=null
    [StandardError]=null
    [RuntimeMaxUSec]="$expected_runtime"
  )
  [[ "$count" == 48 ]] || die "systemd unit policy property count is not exact: ${unit}"
  for key in "${!expected[@]}"; do
    [[ "${actual[$key]+present}" == present ]] \
      || die "systemd unit effective policy is missing ${key}: ${unit}"
    case "$key" in
      Environment|UnsetEnvironment|SupplementaryGroups|IPAddressDeny|IPAddressAllow|RestrictAddressFamilies|ReadOnlyPaths)
        exact_space_token_set_equal "${actual[$key]}" "${expected[$key]}" \
          || die "systemd unit effective policy differs for ${key}: ${unit}"
        ;;
      *)
        [[ "${actual[$key]}" == "${expected[$key]}" ]] \
          || die "systemd unit effective policy differs for ${key}: ${unit}"
        ;;
    esac
  done
  set +e
  exec_start="$("$systemctl_bin" show "$unit" --value --property=ExecStart 2>/dev/null)"
  status=$?
  set -e
  [[ "$status" == 0 && -n "$exec_start" && "${#exec_start}" -le 262144 \
    && ! "$exec_start" =~ $'\r' ]] \
    || die "systemd unit ExecStart is unavailable or unbounded: ${unit}"
  exec_start_remainder="${exec_start#*'{ path='}"
  [[ "$exec_start_remainder" != "$exec_start" \
    && "${exec_start_remainder#*'{ path='}" == "$exec_start_remainder" \
    && "$exec_start" == *"path=${node_bin}"* \
    && "$exec_start" == *'--leetplus-child-policy-v1'* \
    && "$exec_start" == *"${phase}"* \
    && "$exec_start" == *'production'* \
    && "$exec_start" == *"${unit}"* ]] \
    || die "systemd unit ExecStart is not the exact child-policy contour: ${unit}"
}

phase_was_launched() {
  local marker="$1" expected="$2"
  if [[ -e "$marker" || -L "$marker" ]]; then
    assert_exact_control_file "$marker" "$expected"
    return 0
  fi
  return 1
}

assert_ports_drained() {
  "$node_bin" --input-type=module - "$api_port" "$web_port" <<'NODE'
import net from "node:net";
const ports = process.argv.slice(2).map(Number);
const probe = (port) => new Promise((resolve, reject) => {
  const socket = net.createConnection({ host: "127.0.0.1", port });
  const timer = setTimeout(() => {
    socket.destroy();
    reject(new Error("PORT_DRAIN_TIMEOUT"));
  }, 2_000);
  socket.once("connect", () => {
    clearTimeout(timer);
    socket.destroy();
    reject(new Error("PORT_STILL_LISTENING"));
  });
  socket.once("error", (error) => {
    clearTimeout(timer);
    if (error?.code !== "ECONNREFUSED") reject(error);
    else resolve();
  });
});
await Promise.all(ports.map(probe));
NODE
}

freeze_evidence_result=''
classify_evidence_child_entries() {
  local classified
  classified="$("$node_bin" --input-type=module - "$evidence_directory" <<'NODE'
import fs from "node:fs";
const directoryPath = process.argv[2];
const expected = Buffer.from("receipt.json", "utf8");
const directory = fs.opendirSync(directoryPath, { encoding: "buffer", bufferSize: 1 });
let count = 0;
let receipt = false;
try {
  for (;;) {
    const entry = directory.readSync();
    if (entry === null) break;
    count += 1;
    if (count > 1 || !Buffer.isBuffer(entry.name) ||
        !entry.name.equals(expected) || !entry.isFile()) process.exit(64);
    receipt = true;
  }
} finally {
  directory.closeSync();
}
process.stdout.write(receipt ? "RECEIPT" : "EMPTY");
NODE
  )" || die 'evidence child contains an unexpected or unsafe entry'
  [[ "$classified" == EMPTY || "$classified" == RECEIPT ]] \
    || die 'evidence child entry classification is malformed'
  evidence_entry_state="$classified"
}

freeze_evidence_child() {
  local directory_metadata receipt_metadata receipt_size
  assert_real_directory "$evidence_directory"
  directory_metadata="$(stat -c '%u:%g:%a' -- "$evidence_directory")"
  if [[ "$directory_metadata" == "${authority_uid}:${service_gid}:750" ]]; then
    classify_evidence_child_entries
    [[ "$evidence_entry_state" == RECEIPT ]] \
      || die 'frozen evidence child does not contain exactly one receipt'
    [[ -f "$evidence_path" && ! -L "$evidence_path" \
      && "$(stat -c '%u:%g:%a:%h' -- "$evidence_path")" == "${authority_uid}:${service_gid}:440:1" ]] \
      || die 'frozen evidence child is incomplete or untrusted'
  elif [[ "$directory_metadata" == "${service_uid}:${service_gid}:700" ]]; then
    classify_evidence_child_entries
    if [[ "$evidence_entry_state" == EMPTY ]]; then
      freeze_evidence_result=empty
      return 0
    fi
    [[ "$evidence_entry_state" == RECEIPT && -f "$evidence_path" && ! -L "$evidence_path" ]] \
      || die 'active evidence child contains an unexpected or unsafe entry'
    receipt_metadata="$(stat -c '%u:%g:%a:%h' -- "$evidence_path")"
    [[ "$receipt_metadata" == "${service_uid}:${service_gid}:600:1" ]] \
      || die 'active evidence receipt metadata is unsafe'
    chown "${authority_uid}:${service_gid}" -- "$evidence_path"
    chmod 0440 -- "$evidence_path"
    sync -f "$evidence_path"
    chown "${authority_uid}:${service_gid}" -- "$evidence_directory"
    chmod 0750 -- "$evidence_directory"
    sync -d "$evidence_directory"
    sync -d "$evidence_root"
  else
    die 'per-operation evidence child owner/mode is unsafe'
  fi
  [[ "$(stat -c '%u:%g:%a' -- "$evidence_directory")" == "${authority_uid}:${service_gid}:750" \
    && "$(stat -c '%u:%g:%a:%h' -- "$evidence_path")" == "${authority_uid}:${service_gid}:440:1" ]] \
    || die 'evidence freeze was partial'
  receipt_size="$(stat -c '%s' -- "$evidence_path")"
  if [[ "$receipt_size" =~ ^[0-9]+$ && "$receipt_size" -ge 2 \
    && "$receipt_size" -le "$MAX_EVIDENCE_BYTES" ]]; then
    freeze_evidence_result=valid
  else
    freeze_evidence_result=invalid
  fi
}

assert_frozen_evidence_child() {
  freeze_evidence_child
  [[ "$freeze_evidence_result" == valid ]] || die 'completed evidence child is absent or invalid'
}

verify_reversible_write_cleanup_projection() {
  "$node_bin" --input-type=module - "$evidence_path" "$MAX_EVIDENCE_BYTES" <<'NODE'
import fs from "node:fs";
const file = process.argv[2];
const maximum = BigInt(process.argv[3]);
const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
try {
  const before = fs.fstatSync(descriptor, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n || before.size < 2n || before.size > maximum) process.exit(64);
  const raw = Buffer.alloc(Number(before.size));
  let offset = 0;
  while (offset < raw.length) {
    const count = fs.readSync(descriptor, raw, offset, raw.length - offset, offset);
    if (count === 0) break;
    offset += count;
  }
  const after = fs.fstatSync(descriptor, { bigint: true });
  if (offset !== raw.length || before.dev !== after.dev || before.ino !== after.ino ||
      before.size !== after.size || before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs || before.mode !== after.mode ||
      before.uid !== after.uid || before.gid !== after.gid || before.nlink !== after.nlink) process.exit(65);
  let receipt;
  try { receipt = JSON.parse(raw.toString("utf8")); } catch { process.exit(66); }
  const cleanup = receipt?.evidence?.cleanup;
  const http = receipt?.evidence?.http;
  const cleanupKeys = cleanup && typeof cleanup === "object" && !Array.isArray(cleanup)
    ? Object.keys(cleanup).sort().join("\0") : "";
  if (receipt?.decision !== "PASS" || cleanupKeys !== "directCleanupRequired\0residue" ||
      cleanup.directCleanupRequired !== false || cleanup.residue !== 0 ||
      http?.reversibleWriteExercised !== true) process.exit(67);
} finally {
  fs.closeSync(descriptor);
}
NODE
}

run_database_drain() {
  local status
  if phase_was_launched "$drain_launch_path" "$expected_drain_launch"; then
    prepare_readonly_phase_retry "$drain_unit"
  else
    create_durable_control_file "$drain_launch_path" "$expected_drain_launch"
  fi
  assert_no_foreign_service_uid_processes
  set +e
  "$timeout_bin" --signal=TERM --kill-after=5s "$VERIFY_OUTER_TIMEOUT" \
    "$systemd_run_bin" --no-ask-password --quiet --wait --service-type=exec \
    "--unit=${drain_unit}" "${common_properties[@]}" \
    "--property=RuntimeMaxSec=${VERIFY_RUNTIME_MAX}" \
    -- "$node_bin" --input-type=module --eval "$child_policy_systemd_eval" -- \
    --leetplus-child-policy-v1 drain production "$drain_unit" "$systemctl_bin" "$node_bin" \
    "$service_uid" "$service_gid" "$artifact_read_gid" "$SERVICE_USER" "$SERVICE_GROUP" \
    "$ARTIFACT_READ_GROUP" "$artifact_root" "$credential_file" "$evidence_root" \
    "$operation_id" - drain --child-payload --drain-check
  status=$?
  set -e
  if [[ "$test_mode" == true && -f "${control_root}/test-crash-after-drain-response" ]]; then
    exit 100
  fi
  assert_readonly_phase_safely_stopped "$drain_unit"
  [[ "$status" == 0 ]] || die 'independent restored-copy database-session drain failed'
}

run_signed_verifier() {
  local status
  if phase_was_launched "$verify_launch_path" "$expected_verify_launch"; then
    prepare_readonly_phase_retry "$verify_unit"
  else
    create_durable_control_file "$verify_launch_path" "$expected_verify_launch"
  fi
  assert_no_foreign_service_uid_processes
  set +e
  "$timeout_bin" --signal=TERM --kill-after=5s "$VERIFY_OUTER_TIMEOUT" \
    "$systemd_run_bin" --no-ask-password --quiet --wait --service-type=exec \
    "--unit=${verify_unit}" "${common_properties[@]}" \
    "--property=BindReadOnlyPaths=${evidence_directory}:${unit_evidence_directory}:norbind" \
    "--property=ReadOnlyPaths=${unit_evidence_directory}" \
    "--property=RuntimeMaxSec=${VERIFY_RUNTIME_MAX}" \
    -- "$node_bin" --input-type=module --eval "$child_policy_systemd_eval" -- \
    --leetplus-child-policy-v1 verify production "$verify_unit" "$systemctl_bin" "$node_bin" \
    "$service_uid" "$service_gid" "$artifact_read_gid" "$SERVICE_USER" "$SERVICE_GROUP" \
    "$ARTIFACT_READ_GROUP" "$artifact_root" "$credential_file" "$evidence_root" \
    "$operation_id" "$unit_evidence_directory" cli \
    --child-payload "$cli_path" --verify-evidence \
    --release-sha "$release_sha" --evidence-key-id "$evidence_key_id" \
    --evidence "$unit_evidence_path"
  signed_verifier_status=$?
  set -e
  if [[ "$test_mode" == true && -f "${control_root}/test-crash-after-verify-response" ]]; then
    exit 101
  fi
  assert_readonly_phase_safely_stopped "$verify_unit"
}

run_completed_replay() {
  local replay_unit status
  replay_unit="leetplus-current-release-replay-${operation_id}${RANDOM}${RANDOM}.service"
  assert_no_foreign_service_uid_processes
  set +e
  "$timeout_bin" --signal=TERM --kill-after=5s "$VERIFY_OUTER_TIMEOUT" \
    "$systemd_run_bin" --no-ask-password --quiet --wait --service-type=exec \
    "--unit=${replay_unit}" "${common_properties[@]}" \
    "--property=BindReadOnlyPaths=${evidence_directory}:${unit_evidence_directory}:norbind" \
    "--property=ReadOnlyPaths=${unit_evidence_directory}" \
    "--property=RuntimeMaxSec=${VERIFY_RUNTIME_MAX}" \
    -- "$node_bin" --input-type=module --eval "$child_policy_systemd_eval" -- \
    --leetplus-child-policy-v1 replay production "$replay_unit" "$systemctl_bin" "$node_bin" \
    "$service_uid" "$service_gid" "$artifact_read_gid" "$SERVICE_USER" "$SERVICE_GROUP" \
    "$ARTIFACT_READ_GROUP" "$artifact_root" "$credential_file" "$evidence_root" \
    "$operation_id" "$unit_evidence_directory" cli \
    --child-payload "$cli_path" --verify-evidence \
    --release-sha "$release_sha" --evidence-key-id "$evidence_key_id" \
    --evidence "$unit_evidence_path"
  status=$?
  set -e
  assert_readonly_phase_safely_stopped "$replay_unit"
  bounded_reset_failed_after_completion "$replay_unit"
  [[ "$status" == 0 ]] || die 'completed signed evidence replay did not return PASS'
}

if [[ "$completed_operation" == true ]]; then
  if [[ "$completion_result" == PASS ]]; then
    assert_frozen_evidence_child
    run_completed_replay
  elif [[ -e "$evidence_directory" || -L "$evidence_directory" ]]; then
    freeze_evidence_child
    if [[ "$freeze_evidence_result" == empty ]]; then
      rmdir -- "$evidence_directory" || die 'completed empty evidence child cleanup was partial'
      sync -d "$evidence_root"
    fi
  fi

  completed_reset_units=()
  phase_was_launched "$main_launch_path" "$expected_main_launch" \
    || die 'completed operation is missing its exact main submission-intent record'
  completed_reset_units+=("$main_unit")
  phase_was_launched "$drain_launch_path" "$expected_drain_launch" \
    || die 'completed operation is missing its exact drain launch record'
  completed_reset_units+=("$drain_unit")
  if phase_was_launched "$verify_launch_path" "$expected_verify_launch"; then
    completed_reset_units+=("$verify_unit")
  elif [[ "$completion_result" == PASS ]]; then
    die 'completed PASS operation is missing its exact signed-verifier launch record'
  fi
  bounded_reset_failed_after_completion "${completed_reset_units[@]}"
  assert_no_foreign_service_uid_processes
  remove_unit_evidence_target
  if [[ "$active_marker_owned" == true ]]; then
    remove_durable_control_file "$active_marker_path" "$expected_active_marker"
    active_marker_owned=false
  fi
  [[ "$completion_result" == PASS ]] \
    || die "current-release acceptance evidence failed closed; durable result is preserved: ${completion_path}"
  printf 'CURRENT_RELEASE_RESTORED_COPY_RUNTIME_ACCEPTANCE=PASS\n'
  printf 'OPERATION_ID=%s\n' "$operation_id"
  printf 'RESPONSE_RECONCILED=true\n'
  printf 'EVIDENCE_PATH=%s\n' "$evidence_path"
  exit 0
fi

main_submission_intent_exists=false
if phase_was_launched "$main_launch_path" "$expected_main_launch"; then
  main_submission_intent_exists=true
fi

if [[ "$active_marker_owned" == false ]]; then
  [[ "$reconcile" == true && "$main_submission_intent_exists" == false ]] \
    || die 'reconciliation has neither an exact active marker nor a completion record'
  assert_unit_safely_stopped "$main_unit" false
  if [[ -d "$evidence_directory" && ! -L "$evidence_directory" \
    && -z "$(find -P "$evidence_directory" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    rmdir -- "$evidence_directory" || die 'orphan pre-launch evidence child cleanup failed'
    sync -d "$evidence_root"
  fi
  remove_unit_evidence_target
  die 'operation ended before its active marker was durable; no runtime was launched'
fi

response_reconciled="$reconcile"
main_status=0
main_unit_absent_recovery=false
if [[ "$main_submission_intent_exists" == true ]]; then
  [[ "$reconcile" == true ]] || die 'main submission-intent record already exists; use exact --reconcile'
  # The durable main record is a submission intent, not proof that systemd
  # accepted or retained the transient unit. Exact not-found is usable only by
  # reconciliation; evidence and the independent drains below decide FAIL/PASS.
  if unit_is_exactly_absent "$main_unit"; then
    main_unit_absent_recovery=true
  else
    assert_unit_safely_stopped "$main_unit" true
  fi
  response_reconciled=true
else
  if [[ "$reconcile" == true ]]; then
    assert_unit_safely_stopped "$main_unit" false
    assert_real_directory "$evidence_directory"
    [[ -z "$(find -P "$evidence_directory" -mindepth 1 -maxdepth 1 -print -quit)" ]] \
      || die 'never-launched operation unexpectedly contains evidence'
    rmdir -- "$evidence_directory" || die 'never-launched evidence child cleanup failed'
    sync -d "$evidence_root"
    remove_unit_evidence_target
    remove_durable_control_file "$active_marker_path" "$expected_active_marker"
    die 'active marker reconciled as never launched; start a new operation ID'
  fi
  create_durable_control_file "$main_launch_path" "$expected_main_launch"
  main_submission_intent_exists=true
  if [[ "$test_mode" == true \
    && -f "${control_root}/test-crash-after-main-submission-intent" ]]; then
    exit 99
  fi
  main_command=(
    "$node_bin" --input-type=module --eval "$child_policy_systemd_eval" --
    --leetplus-child-policy-v1 main production "$main_unit" "$systemctl_bin" "$node_bin"
    "$service_uid" "$service_gid" "$artifact_read_gid" "$SERVICE_USER" "$SERVICE_GROUP"
    "$ARTIFACT_READ_GROUP" "$artifact_root" "$credential_file" "$evidence_root"
    "$operation_id" "$unit_evidence_directory" cli
    --child-payload "$cli_path"
    --confirm "$CONFIRMATION"
    --artifact-root "$artifact_root"
    --release-sha "$release_sha"
    --tenant-slug "$tenant_slug"
    --expected-system-identifier "$expected_system_identifier"
    --expected-migration-count "$expected_migration_count"
    --expected-migration-head "$expected_migration_head"
    --api-port "$api_port"
    --web-port "$web_port"
    --evidence-key-id "$evidence_key_id"
    --evidence "$unit_evidence_path"
  )
  [[ "$with_reversible_write" == false ]] || main_command+=(--with-reversible-write)
  assert_no_foreign_service_uid_processes
  set +e
  "$timeout_bin" --signal=TERM --kill-after=15s "$MAIN_OUTER_TIMEOUT" \
    "$systemd_run_bin" --no-ask-password --quiet --wait --service-type=exec \
    "--unit=${main_unit}" "${common_properties[@]}" \
    "--property=BindPaths=${evidence_directory}:${unit_evidence_directory}:norbind" \
    "--property=ReadWritePaths=${unit_evidence_directory}" \
    "--property=RuntimeMaxSec=${MAIN_RUNTIME_MAX}" \
    -- "${main_command[@]}"
  main_status=$?
  set -e
  [[ "$main_status" == 0 ]] || response_reconciled=true
  assert_unit_safely_stopped "$main_unit" true
fi

freeze_evidence_child
assert_ports_drained || die 'independent API/Web port drain failed'
run_database_drain

evidence_leak_free=false
signed_verifier_status=1
reversible_write_cleanup_verified=false
[[ "$with_reversible_write" == true ]] || reversible_write_cleanup_verified=true
if [[ "$freeze_evidence_result" == valid ]]; then
  set +e
  "$node_bin" --input-type=module - "$credential_file" "$evidence_path" "$MAX_EVIDENCE_BYTES" <<'NODE'
import fs from "node:fs";
const readStable = (file, maximum) => {
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size < 2n || before.size > BigInt(maximum)) process.exit(1);
    const buffer = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < buffer.length) {
      const count = fs.readSync(descriptor, buffer, offset, buffer.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    const after = fs.fstatSync(descriptor, { bigint: true });
    if (offset !== buffer.length || before.dev !== after.dev || before.ino !== after.ino ||
        before.size !== after.size || before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs || before.mode !== after.mode ||
        before.uid !== after.uid || before.gid !== after.gid || before.nlink !== after.nlink) process.exit(1);
    return buffer.toString("utf8");
  } finally { fs.closeSync(descriptor); }
};
const credential = JSON.parse(readStable(process.argv[2], 32768));
const receipt = readStable(process.argv[3], Number(process.argv[4]));
if ([credential.databaseUrl, credential.evidenceHmacKey, credential.loginEmail, credential.loginPassword]
    .some((value) => receipt.includes(value))) process.exit(1);
NODE
  leak_status=$?
  set -e
  [[ "$leak_status" == 0 ]] && evidence_leak_free=true
  run_signed_verifier
  if [[ "$with_reversible_write" == true && "$signed_verifier_status" == 0 ]]; then
    set +e
    verify_reversible_write_cleanup_projection
    cleanup_projection_status=$?
    set -e
    [[ "$cleanup_projection_status" == 0 ]] && reversible_write_cleanup_verified=true
  fi
else
  assert_unit_safely_stopped "$verify_unit" false
fi

if [[ "$main_unit_absent_recovery" == true ]]; then
  unit_is_exactly_absent "$main_unit" \
    || die 'reconciled absent main unit changed before durable completion'
else
  assert_unit_safely_stopped "$main_unit" true
fi
assert_readonly_phase_safely_stopped "$drain_unit"
reset_units=()
if [[ "$main_unit_absent_recovery" == false ]]; then
  reset_units+=("$main_unit")
fi
if phase_was_launched "$verify_launch_path" "$expected_verify_launch"; then
  assert_readonly_phase_safely_stopped "$verify_unit"
  reset_units+=("$drain_unit" "$verify_unit")
else
  assert_unit_safely_stopped "$verify_unit" false
  reset_units+=("$drain_unit")
fi
assert_ports_drained || die 'final independent API/Web port drain failed'

# A write-enabled main may have committed its fixture and disappeared before it
# could publish cleanup evidence. Port/process/session drain cannot prove that
# database residue is zero, so only a leak-free signed PASS may release the
# global marker. All other write outcomes remain a manual recovery state.
if [[ "$with_reversible_write" == true \
  && ! ( "$freeze_evidence_result" == valid && "$evidence_leak_free" == true \
    && "$signed_verifier_status" == 0 \
    && "$reversible_write_cleanup_verified" == true ) ]]; then
  die 'reversible-write operation lacks independently verified zero-residue PASS evidence; active marker is retained for manual review'
fi

operation_result=FAIL
if [[ "$freeze_evidence_result" == valid && "$evidence_leak_free" == true \
  && "$signed_verifier_status" == 0 \
  && "$reversible_write_cleanup_verified" == true ]]; then
  operation_result=PASS
fi
if [[ "$operation_result" == PASS ]]; then
  expected_completion="$expected_completion_pass"
else
  expected_completion="$expected_completion_fail"
fi
if [[ -e "$completion_path" || -L "$completion_path" ]]; then
  assert_exact_control_file "$completion_path" "$expected_completion"
else
  create_durable_control_file "$completion_path" "$expected_completion"
fi

# Completion is the durable safety boundary. Unit metadata cleanup may unload a
# transient unit, so it must never happen before this exact result is fsynced.
bounded_reset_failed "${reset_units[@]}"
if [[ "$test_mode" == true && -f "${control_root}/test-crash-after-reset" ]]; then
  exit 98
fi
assert_no_foreign_service_uid_processes
remove_unit_evidence_target

if [[ "$freeze_evidence_result" == empty ]]; then
  rmdir -- "$evidence_directory" || die 'empty failed evidence child cleanup was partial'
  sync -d "$evidence_root"
fi
remove_durable_control_file "$active_marker_path" "$expected_active_marker"

[[ "$operation_result" == PASS ]] \
  || die "current-release acceptance evidence failed closed; durable result is preserved: ${completion_path}"

printf 'CURRENT_RELEASE_RESTORED_COPY_RUNTIME_ACCEPTANCE=PASS\n'
printf 'OPERATION_ID=%s\n' "$operation_id"
printf 'RESPONSE_RECONCILED=%s\n' "$response_reconciled"
printf 'EVIDENCE_PATH=%s\n' "$evidence_path"
