#!/usr/bin/bash -p
#
# Verify and stage one exact LeetPlus release artifact.
#
# This script deliberately has no database, systemd, network-download or
# symlink-switch capability. It can prepare a verified immutable directory;
# migration, runtime switch and rollback remain separately reviewed operations.

set -euo pipefail
IFS=$'\n\t'

readonly RELEASE_SHA_PATTERN='^[0-9a-f]{40}$'
readonly INSTALLED_STAGER='/usr/local/libexec/leetplus/stage-release-artifact.sh'
readonly PRODUCTION_BUILD_ROOT='/srv/leetplus/release-builds'
readonly HYDRATION_LOCK='/run/leetplus-release/hydration.lock'
readonly FORBIDDEN_HYDRATION_ENV_KEYS=(
  DATABASE_URL
  JWT_SECRET
  GUEST_PORTAL_JWT_SECRET
  APP_ENCRYPTION_KEY
  INTEGRATION_ENCRYPTION_KEY
  SYNC_SERVICE_TOKEN
  LANGAME_API_KEY
  BASH_ENV
  ENV
  NODE_OPTIONS
  NODE_PATH
  NODE_EXTRA_CA_CERTS
  NODE_USE_ENV_PROXY
  NODE_V8_COVERAGE
  NODE_COMPILE_CACHE
  LD_PRELOAD
  LD_LIBRARY_PATH
  LD_AUDIT
  GCONV_PATH
  LOCPATH
  OPENSSL_CONF
  OPENSSL_MODULES
  HTTP_PROXY
  HTTPS_PROXY
  ALL_PROXY
  NO_PROXY
  http_proxy
  https_proxy
  all_proxy
  no_proxy
  NPM_CONFIG_USERCONFIG
  npm_config_userconfig
  NPM_CONFIG_GLOBALCONFIG
  npm_config_globalconfig
  NPM_CONFIG_NODE_OPTIONS
  npm_config_node_options
  NPM_CONFIG_SCRIPT_SHELL
  npm_config_script_shell
  PNPM_HOME
  COREPACK_HOME
  SSL_CERT_FILE
  SSL_CERT_DIR
  GIT_CONFIG_GLOBAL
  GIT_CONFIG_SYSTEM
)

usage() {
  cat <<'USAGE'
Usage:
  stage-release-artifact.sh \
    --release-sha <40-lowercase-hex> \
    --artifact <leetplus-release-<sha>.tar.gz> \
    --artifact-sha256 <artifact>.sha256 \
    --output-root <existing-absolute-directory> \
    [--pnpm-store-dir /srv/leetplus/pnpm-store] \
    [--hydrate] \
    [--unprivileged-test-mode]

Verifies the outer artifact checksum, gzip stream, archive paths, absence of
symlinks/node_modules, the canonical full-tree SHA256SUMS and release
provenance. Production mode consumes root-controlled 0440 input through a
private non-reflink snapshot and atomically moves the verified tree to
<output-root>/<sha>.

--hydrate additionally runs a copy-only locked, offline production dependency
install and Prisma generate inside that new directory, rejects shared hardlinks,
then writes a complete post-hydration runtime checksum manifest.
It never reads runtime secrets, connects to PostgreSQL, switches a live release
or restarts systemd.

--unprivileged-test-mode is only for disposable fixtures. It never creates the
production <output-root>/<sha> path and leaves an unmanifested test-only marker,
so its result cannot satisfy production binding checks.
USAGE
}

die() {
  printf 'stage-release-artifact: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

path_is_not_group_or_other_writable() {
  local candidate_mode
  candidate_mode="$(stat -c '%a' -- "$1")" || return 1
  (( (8#$candidate_mode & 8#22) == 0 ))
}

find_has_match() {
  local probe_path find_status
  probe_path="$(mktemp "${TMPDIR:-/tmp}/leetplus-stage-find.XXXXXX")" \
    || die 'cannot allocate a bounded filesystem inventory probe'
  set +e
  find "$@" -print0 -quit > "$probe_path"
  find_status=$?
  set -e
  if ((find_status != 0)); then
    rm -f -- "$probe_path"
    die 'required filesystem inventory producer failed'
  fi
  if [[ -s "$probe_path" ]]; then
    rm -f -- "$probe_path"
    return 0
  fi
  rm -f -- "$probe_path"
  return 1
}

sanitize_production_environment() {
  local preserved_hydration_sandbox="$1"
  local preserved_invocation_id="$2"
  local inherited_environment_name
  while IFS= read -r inherited_environment_name; do
    unset "$inherited_environment_name" 2>/dev/null || true
  done < <(compgen -e)
  PATH='/usr/sbin:/usr/bin:/sbin:/bin'
  LANG='C.UTF-8'
  LC_ALL='C.UTF-8'
  TZ='UTC'
  export PATH LANG LC_ALL TZ
  if [[ "$hydrate" == true ]]; then
    LEETPLUS_HYDRATION_SANDBOX="$preserved_hydration_sandbox"
    INVOCATION_ID="$preserved_invocation_id"
    export LEETPLUS_HYDRATION_SANDBOX INVOCATION_ID
  fi
}

assert_exact_production_environment() {
  local environment_name
  local environment_count=0
  local expected_count=4
  [[ "$hydrate" == false ]] || expected_count=6
  while IFS= read -r environment_name; do
    case "$environment_name" in
      PATH|LANG|LC_ALL|TZ) ;;
      LEETPLUS_HYDRATION_SANDBOX|INVOCATION_ID)
        [[ "$hydrate" == true ]] \
          || die "unexpected exported production environment variable: ${environment_name}"
        ;;
      *) die "unexpected exported production environment variable: ${environment_name}" ;;
    esac
    environment_count=$((environment_count + 1))
  done < <(compgen -e)
  [[ "$environment_count" == "$expected_count" ]] \
    || die 'production environment allowlist is incomplete'
}

is_regular_nonsymlink() {
  [[ -f "$1" && ! -L "$1" ]]
}

assert_exact_empty_production_build_root() {
  [[ -d "$PRODUCTION_BUILD_ROOT" && ! -L "$PRODUCTION_BUILD_ROOT" \
    && "$(realpath -e -- "$PRODUCTION_BUILD_ROOT")" == "$PRODUCTION_BUILD_ROOT" \
    && "$(stat -c '%U:%G:%a' -- "$PRODUCTION_BUILD_ROOT")" == \
      'leetplus-build:leetplus-build:750' ]] \
    || die 'production hydration build root must be exact leetplus-build:leetplus-build mode 0750'
  if find_has_match -P "$PRODUCTION_BUILD_ROOT" -mindepth 1 -maxdepth 1; then
    die 'production hydration requires an exact-empty global build root'
  fi
}

assert_no_unreviewed_mountpoint() {
  local candidate="$1"
  local allow_readonly_hydration_inbox="$2"
  local mount_options

  [[ "$candidate" != '/' ]] || return 0
  mount_options="$(findmnt --raw --noheadings --output VFS-OPTIONS --mountpoint "$candidate" 2>/dev/null)" \
    || return 0
  if [[ "$allow_readonly_hydration_inbox" == true && "$hydrate" == true ]]; then
    while IFS= read -r mount_option_line; do
      [[ -n "$mount_option_line" && ",${mount_option_line}," == *,ro,* ]] \
        || die "reviewed hydration inbox mount is not read-only: ${candidate}"
    done <<< "$mount_options"
    return 0
  fi
  die "production input path crosses an unreviewed mount boundary: ${candidate}"
}

assert_root_controlled_ancestor_chain() {
  local candidate="$1"
  local parent candidate_device parent_device

  while :; do
    [[ -d "$candidate" && ! -L "$candidate" \
      && "$(realpath -e -- "$candidate")" == "$candidate" \
      && "$(stat -c '%u' -- "$candidate")" == '0' ]] \
      && path_is_not_group_or_other_writable "$candidate" \
      || die "production input ancestor is not canonical and root-controlled: ${candidate}"
    [[ "$candidate" == '/' ]] && break
    assert_no_unreviewed_mountpoint \
      "$candidate" "$([[ "$candidate" == "$artifact_parent" ]] && printf true || printf false)"
    parent="$(dirname -- "$candidate")"
    candidate_device="$(stat -c '%d' -- "$candidate")"
    parent_device="$(stat -c '%d' -- "$parent")"
    [[ "$candidate_device" == "$parent_device" ]] \
      || die "production input ancestor crosses a mount boundary: ${candidate}"
    candidate="$parent"
  done
}

assert_production_input_file() {
  local candidate="$1"
  local build_gid="$2"
  local parent

  is_regular_nonsymlink "$candidate" \
    && [[ "$(realpath -e -- "$candidate")" == "$candidate" \
      && "$(stat -c '%u:%g:%a:%h' -- "$candidate")" == "0:${build_gid}:440:1" ]] \
    || die "production input must be canonical root:leetplus-build 0440 with one link: ${candidate}"
  [[ -r "$candidate" ]] || die "production input is not readable by the staging identity: ${candidate}"
  parent="$(dirname -- "$candidate")"
  assert_no_unreviewed_mountpoint "$candidate" false
  [[ "$(stat -c '%d' -- "$candidate")" == "$(stat -c '%d' -- "$parent")" ]] \
    || die "production input file crosses a mount boundary: ${candidate}"
}

assert_installed_stager_authority() {
  local candidate="${BASH_SOURCE[0]}"
  local ancestor

  [[ "$candidate" == "$INSTALLED_STAGER" \
    && "$(realpath -e -- "$candidate")" == "$INSTALLED_STAGER" \
    && "$(stat -c '%u:%g:%a:%h' -- "$candidate")" == '0:0:755:1' ]] \
    || die 'production staging authority is not the exact root-owned installed stager'
  ancestor="$(dirname -- "$candidate")"
  while :; do
    [[ -d "$ancestor" && ! -L "$ancestor" \
      && "$(realpath -e -- "$ancestor")" == "$ancestor" \
      && "$(stat -c '%u' -- "$ancestor")" == '0' ]] \
      && path_is_not_group_or_other_writable "$ancestor" \
      || die "installed stager ancestor is not root-controlled: ${ancestor}"
    [[ "$ancestor" == '/' ]] && break
    ancestor="$(dirname -- "$ancestor")"
  done
}

assert_exact_build_identity() {
  local require_current_process="${1:-true}"
  local passwd_record group_record
  local foreign_gid_group foreign_primary_identity foreign_uid_identity
  local passwd_name passwd_secret passwd_uid passwd_gid passwd_gecos passwd_home passwd_shell
  local group_name group_secret group_gid group_members

  [[ "$(getent passwd leetplus-build | awk 'END { print NR }')" == '1' ]] \
    || die 'leetplus-build must resolve to exactly one NSS passwd record'
  passwd_record="$(getent passwd leetplus-build)"
  IFS=: read -r passwd_name passwd_secret passwd_uid passwd_gid passwd_gecos passwd_home passwd_shell \
    <<< "$passwd_record"
  [[ "$passwd_name" == 'leetplus-build' && "$passwd_uid" =~ ^[1-9][0-9]*$ \
    && "$passwd_gid" =~ ^[1-9][0-9]*$ ]] \
    || die 'leetplus-build NSS passwd identity is invalid'
  [[ "$passwd_shell" == '/usr/sbin/nologin' ]] \
    || die 'leetplus-build must use the exact /usr/sbin/nologin shell'
  [[ "$passwd_home" == /* && "$passwd_home" != '/' \
    && ! -e "$passwd_home" && ! -L "$passwd_home" ]] \
    || die 'leetplus-build home path must be absolute, absent and non-root'

  [[ "$(getent group leetplus-build | awk 'END { print NR }')" == '1' ]] \
    || die 'leetplus-build must resolve to exactly one NSS group record'
  group_record="$(getent group leetplus-build)"
  IFS=: read -r group_name group_secret group_gid group_members <<< "$group_record"
  [[ "$group_name" == 'leetplus-build' && "$group_gid" == "$passwd_gid" \
    && -z "$group_members" ]] \
    || die 'leetplus-build primary NSS group is not exact'
  foreign_uid_identity="$(getent passwd | awk -F: -v uid="$passwd_uid" \
    '$3 == uid && $1 != "leetplus-build" { print $1; exit }')"
  [[ -z "$foreign_uid_identity" ]] \
    || die "another NSS identity uses the leetplus-build UID: ${foreign_uid_identity}"
  foreign_primary_identity="$(getent passwd | awk -F: -v gid="$passwd_gid" \
    '$4 == gid && $1 != "leetplus-build" { print $1; exit }')"
  [[ -z "$foreign_primary_identity" ]] \
    || die "another NSS identity uses the leetplus-build primary GID: ${foreign_primary_identity}"
  foreign_gid_group="$(getent group | awk -F: -v gid="$passwd_gid" \
    '$3 == gid && $1 != "leetplus-build" { print $1; exit }')"
  [[ -z "$foreign_gid_group" ]] \
    || die "another NSS group aliases the leetplus-build GID: ${foreign_gid_group}"
  [[ "$(id -u leetplus-build)" == "$passwd_uid" \
    && "$(id -g leetplus-build)" == "$passwd_gid" \
    && "$(id -gn leetplus-build)" == 'leetplus-build' \
    && "$(id -G leetplus-build)" == "$passwd_gid" \
    && "$(id -nG leetplus-build)" == 'leetplus-build' ]] \
    || die 'leetplus-build has an unexpected primary or supplementary NSS group'
  if [[ "$require_current_process" == true ]]; then
    [[ "$(id -u)" == "$passwd_uid" \
      && "$(id -g)" == "$passwd_gid" \
      && "$(id -G)" == "$passwd_gid" \
      && "$(id -nG)" == 'leetplus-build' ]] \
      || die 'current staging process has an unexpected build UID or group set'
  else
    [[ "$require_current_process" == false ]] \
      || die 'build identity assertion mode is invalid'
  fi
}

assert_build_uid_process_fence() {
  local fence_mode="$1"
  local build_uid expected_cgroup current_shell_pid fence_status

  [[ "$fence_mode" == zero || "$fence_mode" == current ]] \
    || die 'build UID process fence mode is invalid'
  build_uid="$(id -u leetplus-build)"
  expected_cgroup="/system.slice/leetplus-release-hydrate@${release_sha}.service"
  current_shell_pid="$BASHPID"
  if /usr/bin/node --input-type=module - \
    /proc "$build_uid" "$expected_cgroup" "$fence_mode" \
    "${stager_main_pid:-$current_shell_pid}" "$current_shell_pid" <<'NODE'
import fs from 'node:fs';

const [procRootInput, buildUid, expectedCgroup, mode, mainPid, shellPid] =
  process.argv.slice(2);
if (
  procRootInput !== '/proc' ||
  !/^[1-9][0-9]*$/u.test(buildUid) ||
  !/^\/system\.slice\/leetplus-release-hydrate@[0-9a-f]{40}\.service$/u.test(expectedCgroup) ||
  !['zero', 'current'].includes(mode) ||
  !/^[1-9][0-9]*$/u.test(mainPid) ||
  !/^[1-9][0-9]*$/u.test(shellPid)
) {
  process.exit(64);
}

const readBounded = (file, maximum) => {
  let descriptor;
  try {
    descriptor = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | (fs.constants.O_NOFOLLOW ?? 0),
    );
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
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
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.mode !== after.mode
    ) {
      process.exit(67);
    }
    return Buffer.concat(chunks, total).toString('utf8');
  } finally {
    fs.closeSync(descriptor);
  }
};

const selfCgroup = readBounded('/proc/self/cgroup', 65_536);
if (selfCgroup !== `0::${expectedCgroup}\n`) process.exit(68);
if (mode === 'zero') {
  if (process.getuid?.() !== 0 || process.geteuid?.() !== 0) process.exit(69);
} else if (
  String(process.getuid?.()) !== buildUid ||
  String(process.geteuid?.()) !== buildUid ||
  String(process.ppid) !== shellPid
) {
  process.exit(70);
}

const allowed = new Set();
if (mode === 'current') {
  allowed.add(mainPid);
  allowed.add(shellPid);
  allowed.add(String(process.pid));
}
const observed = new Set();
let inspected = 0;
const directory = fs.opendirSync(procRootInput, {
  encoding: 'buffer',
  bufferSize: 32,
});
try {
  for (;;) {
    const entry = directory.readSync();
    if (entry === null) break;
    if (!Buffer.isBuffer(entry.name)) process.exit(71);
    const name = entry.name.toString('ascii');
    if (!/^[1-9][0-9]*$/u.test(name)) continue;
    inspected += 1;
    if (inspected > 1_000_000) process.exit(72);
    const processRoot = `${procRootInput}/${name}`;
    const statusBefore = readBounded(`${processRoot}/status`, 65_536);
    if (statusBefore === null) continue;
    if (statusBefore.includes('\0') || statusBefore.includes('\r')) process.exit(73);
    const pidLines = statusBefore.match(/^Pid:\s+([0-9]+)\s*$/gmu);
    const uidLines = statusBefore.match(
      /^Uid:\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s*$/gmu,
    );
    if (!pidLines || pidLines.length !== 1 || !uidLines || uidLines.length !== 1) {
      process.exit(74);
    }
    const parsedPid = pidLines[0].match(/[0-9]+/u)?.[0];
    const uidValues = uidLines[0].match(/[0-9]+/gu);
    if (parsedPid !== name || !uidValues || uidValues.length !== 4) process.exit(75);
    if (!uidValues.includes(buildUid)) continue;

    const cgroupBefore = readBounded(`${processRoot}/cgroup`, 65_536);
    const statusAfter = readBounded(`${processRoot}/status`, 65_536);
    const cgroupAfter = readBounded(`${processRoot}/cgroup`, 65_536);
    if (cgroupBefore === null || statusAfter === null || cgroupAfter === null) {
      process.exit(76);
    }
    const pidAfter = statusAfter.match(/^Pid:\s+([0-9]+)\s*$/gmu);
    const uidAfter = statusAfter.match(
      /^Uid:\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s*$/gmu,
    );
    if (
      !pidAfter || pidAfter.length !== 1 ||
      !uidAfter || uidAfter.length !== 1 ||
      pidAfter[0].match(/[0-9]+/u)?.[0] !== name ||
      uidAfter[0] !== uidLines[0] ||
      cgroupBefore !== cgroupAfter
    ) {
      process.exit(76);
    }
    if (!allowed.has(name) || observed.has(name)) process.exit(77);
    if (cgroupBefore !== `0::${expectedCgroup}\n`) process.exit(76);
    observed.add(name);
  }
} finally {
  directory.closeSync();
}
if (observed.size !== allowed.size) process.exit(78);
for (const pid of allowed) {
  if (!observed.has(pid)) process.exit(79);
}
NODE
  then
    return 0
  else
    fence_status=$?
    printf 'stage-release-artifact: build UID process fence rejected execution (status %s)\n' \
      "$fence_status" >&2
    exit "$fence_status"
  fi
}

release_sha=''
artifact=''
artifact_sha256=''
output_root=''
hydrate=false
unprivileged_test_mode=false
preflight_build_uid_fence=false
pnpm_store_dir='/srv/leetplus/pnpm-store'
show_help=false

while (($# > 0)); do
  case "$1" in
    --release-sha)
      (($# >= 2)) || die '--release-sha requires a value'
      release_sha="$2"
      shift 2
      ;;
    --artifact)
      (($# >= 2)) || die '--artifact requires a value'
      artifact="$2"
      shift 2
      ;;
    --artifact-sha256)
      (($# >= 2)) || die '--artifact-sha256 requires a value'
      artifact_sha256="$2"
      shift 2
      ;;
    --output-root)
      (($# >= 2)) || die '--output-root requires a value'
      output_root="$2"
      shift 2
      ;;
    --hydrate)
      hydrate=true
      shift
      ;;
    --unprivileged-test-mode)
      unprivileged_test_mode=true
      shift
      ;;
    --preflight-build-uid-fence)
      preflight_build_uid_fence=true
      shift
      ;;
    --pnpm-store-dir)
      (($# >= 2)) || die '--pnpm-store-dir requires a value'
      pnpm_store_dir="$2"
      shift 2
      ;;
    --help|-h)
      show_help=true
      shift
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

preserved_hydration_sandbox="${LEETPLUS_HYDRATION_SANDBOX:-}"
preserved_invocation_id="${INVOCATION_ID:-}"
export -n \
  release_sha artifact artifact_sha256 output_root hydrate \
  unprivileged_test_mode preflight_build_uid_fence pnpm_store_dir show_help \
  preserved_hydration_sandbox preserved_invocation_id 2>/dev/null || true

if [[ "$unprivileged_test_mode" == false ]]; then
  case "$-" in
    *p*) ;;
    *) die 'production staging must execute the installed script directly with /usr/bin/bash -p' ;;
  esac
  if [[ "$hydrate" == true ]]; then
    for forbidden_key in "${FORBIDDEN_HYDRATION_ENV_KEYS[@]}"; do
      [[ -z "${!forbidden_key:-}" ]] \
        || die "hydration inherited a forbidden environment variable: ${forbidden_key}"
    done
  fi
  sanitize_production_environment \
    "$preserved_hydration_sandbox" "$preserved_invocation_id"
  assert_exact_production_environment
  assert_installed_stager_authority
else
  ((EUID != 0)) || die 'unprivileged test mode refuses root execution'
  if [[ "$hydrate" == true ]]; then
    for forbidden_key in "${FORBIDDEN_HYDRATION_ENV_KEYS[@]}"; do
      [[ -z "${!forbidden_key:-}" ]] \
        || die "test hydration inherited a forbidden environment variable: ${forbidden_key}"
    done
  fi
fi

if [[ "$show_help" == true ]]; then
  usage
  exit 0
fi

if [[ "$hydrate" == true ]]; then
  ((EUID != 0)) || die 'hydration must never execute package/project code as root'
  if [[ "$unprivileged_test_mode" == true ]]; then
    [[ -z "${INVOCATION_ID:-}" ]] || die 'test hydration mode cannot impersonate a systemd invocation'
  else
    [[ "$pnpm_store_dir" == '/srv/leetplus/pnpm-store' ]] \
      || die 'production hydration pnpm store path cannot be overridden'
    [[ "${LEETPLUS_HYDRATION_SANDBOX:-}" == 'SYSTEMD_IP_DENY_ANY_V1' ]] \
      || die 'hydration has no reviewed no-egress sandbox marker'
    [[ "${INVOCATION_ID:-}" =~ ^[0-9a-f]{32}$ ]] \
      || die 'hydration is not running in a systemd invocation'
  fi
fi

[[ "$release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'release SHA must be 40 lowercase hexadecimal characters'
if [[ "$preflight_build_uid_fence" == true ]]; then
  [[ "$unprivileged_test_mode" == false && "$hydrate" == false \
    && -z "$artifact" && -z "$artifact_sha256" && -z "$output_root" \
    && "$pnpm_store_dir" == '/srv/leetplus/pnpm-store' ]] \
    || die 'build UID preflight accepts only the exact production release SHA'
else
  [[ -n "$artifact" && -n "$artifact_sha256" && -n "$output_root" ]] || {
    usage >&2
    exit 1
  }
fi

for command_name in awk basename chmod cp dirname find grep gzip id mktemp mv node realpath rm sha256sum sort stat tar xargs; do
  require_command "$command_name"
done

if [[ "$unprivileged_test_mode" == false ]]; then
  require_command getent
  require_command findmnt
  if [[ "$preflight_build_uid_fence" == true ]]; then
    require_command flock
    ((EUID == 0)) || die 'build UID preflight must run as root from the hydration unit'
    [[ "$(command -v node)" == '/usr/bin/node' ]] \
      || die 'build UID preflight Node path is not exact /usr/bin/node'
    assert_exact_build_identity false
    assert_build_uid_process_fence zero
    [[ -f "$HYDRATION_LOCK" && ! -L "$HYDRATION_LOCK" \
      && "$(stat -c '%U:%G:%a' -- "$HYDRATION_LOCK")" == \
        'root:leetplus-build:660' ]] \
      || die 'global hydration lock authority is absent or unsafe'
    exec {preflight_lock_fd}<> "$HYDRATION_LOCK"
    flock --exclusive --nonblock "$preflight_lock_fd" \
      || die 'another hydration or promotion operation holds the global lock'
    assert_exact_empty_production_build_root
    printf 'HYDRATION_BUILD_UID_PREFLIGHT=PASS\n'
    exit 0
  fi
  ((EUID != 0)) || die 'production staging must run as the dedicated non-root build identity'
  [[ "$(id -un)" == 'leetplus-build' ]] \
    || die 'production staging must run as the dedicated leetplus-build identity'
  assert_exact_build_identity
  if [[ "$hydrate" == true ]]; then
    expected_hydration_cgroup="/system.slice/leetplus-release-hydrate@${release_sha}.service"
    [[ "$(< /proc/self/cgroup)" == "0::${expected_hydration_cgroup}" ]] \
      || die 'hydration is outside the reviewed systemd unit cgroup'
    stager_main_pid="$BASHPID"
    export -n stager_main_pid expected_hydration_cgroup 2>/dev/null || true
  fi
fi

provided_artifact="$artifact"
provided_artifact_sha256="$artifact_sha256"
provided_output_root="$output_root"
artifact="$(realpath -e -- "$artifact")"
artifact_sha256="$(realpath -e -- "$artifact_sha256")"
output_root="$(realpath -e -- "$output_root")"

if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$provided_artifact" == /* && "$provided_artifact" == "$artifact" ]] \
    || die 'production artifact path must be absolute, canonical and symlink-free'
  [[ "$provided_artifact_sha256" == /* && "$provided_artifact_sha256" == "$artifact_sha256" ]] \
    || die 'production checksum path must be absolute, canonical and symlink-free'
  [[ "$provided_output_root" == /* && "$provided_output_root" == "$output_root" ]] \
    || die 'production output root must be absolute, canonical and symlink-free'
fi

is_regular_nonsymlink "$artifact" || die 'artifact must be a regular non-symlink file'
is_regular_nonsymlink "$artifact_sha256" || die 'artifact checksum must be a regular non-symlink file'
[[ -d "$output_root" && ! -L "$output_root" && "$output_root" != '/' ]] || die 'output root must be an existing non-root directory, not a symlink'
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$(stat -c '%u:%g:%a' -- "$output_root")" == "${EUID}:$(id -g):750" ]] \
    || die 'production output root must be exact leetplus-build:leetplus-build 0750'
  if [[ "$hydrate" == true ]]; then
    [[ "$output_root" == "$PRODUCTION_BUILD_ROOT" ]] \
      || die 'production hydration output root must be the exact global build root'
    assert_exact_empty_production_build_root
  fi
fi

artifact_name="$(basename -- "$artifact")"
[[ "$artifact_name" == "leetplus-release-${release_sha}.tar.gz" ]] || die 'artifact file name is not bound to release SHA'
[[ "$(basename -- "$artifact_sha256")" == "${artifact_name}.sha256" ]] || die 'checksum file name is not bound to artifact'

if [[ "$unprivileged_test_mode" == true ]]; then
  release_directory="${output_root}/.untrusted-test-${release_sha}"
  staging_prefix=".${release_sha}.untrusted-test-staging"
else
  release_directory="${output_root}/${release_sha}"
  staging_prefix=".${release_sha}.staging"
fi
[[ ! -e "$release_directory" && ! -L "$release_directory" ]] || die 'release directory already exists; refusing overwrite'

input_snapshot_directory=''
archive_listing=''
archive_type_listing=''
cleanup_ephemeral_inputs() {
  [[ -z "$archive_listing" ]] || rm -f -- "$archive_listing"
  [[ -z "$archive_type_listing" ]] || rm -f -- "$archive_type_listing"
  [[ -z "$input_snapshot_directory" ]] || rm -rf -- "$input_snapshot_directory"
}
trap cleanup_ephemeral_inputs EXIT

assert_exact_hydration_output_inventory() {
  local active_tree="$1"
  local candidate observed_path matched inventory_path find_status
  local -a expected_paths=() observed_paths=()
  [[ "$hydrate" == true ]] || return 0
  for candidate in \
    "$input_snapshot_directory" "$archive_listing" "$archive_type_listing" "$active_tree"; do
    [[ -n "$candidate" ]] || continue
    [[ "$(dirname -- "$candidate")" == "$output_root" ]] \
      || die 'hydration authority path escaped the exact build root'
    expected_paths+=("$candidate")
  done
  ((${#expected_paths[@]} >= 1 && ${#expected_paths[@]} <= 4)) \
    || die 'hydration exact build-root inventory is internally invalid'
  inventory_path="$(mktemp "${TMPDIR:-/tmp}/leetplus-stage-inventory.XXXXXX")" \
    || die 'cannot allocate the hydration build-root inventory'
  set +e
  find -P "$output_root" -mindepth 1 -maxdepth 1 -print0 > "$inventory_path"
  find_status=$?
  set -e
  if ((find_status != 0)); then
    rm -f -- "$inventory_path"
    die 'hydration build-root inventory producer failed'
  fi
  mapfile -d '' -t observed_paths < "$inventory_path"
  rm -f -- "$inventory_path"
  ((${#observed_paths[@]} == ${#expected_paths[@]})) \
    || die 'hydration build root contains a sibling or missing authority entry'
  for observed_path in "${observed_paths[@]}"; do
    matched=false
    for candidate in "${expected_paths[@]}"; do
      if [[ "$observed_path" == "$candidate" ]]; then
        [[ "$matched" == false ]] \
          || die 'hydration build-root inventory contains a duplicate authority path'
        matched=true
      fi
    done
    [[ "$matched" == true ]] \
      || die 'hydration build root contains an unreviewed sibling entry'
  done
  for candidate in "${expected_paths[@]}"; do
    if [[ "$candidate" == "$archive_listing" \
      || "$candidate" == "$archive_type_listing" ]]; then
      [[ -f "$candidate" && ! -L "$candidate" ]] \
        || die 'hydration build-root authority listing is absent or unsafe'
    else
      [[ -d "$candidate" && ! -L "$candidate" ]] \
        || die 'hydration build-root authority directory is absent or unsafe'
    fi
  done
}

trusted_source_manifest_path=''
trusted_source_manifest_identity=''
trusted_source_manifest_sha256=''
capture_trusted_source_manifest() {
  trusted_source_manifest_path="${staging_directory}/SHA256SUMS"
  [[ -f "$trusted_source_manifest_path" && ! -L "$trusted_source_manifest_path" \
    && "$(stat -c '%h' -- "$trusted_source_manifest_path")" == '1' ]] \
    || die 'trusted source SHA256SUMS is absent or unsafe before hydration'
  trusted_source_manifest_identity="$(stat -c '%d:%i:%s:%y:%z:%h' -- \
    "$trusted_source_manifest_path")"
  trusted_source_manifest_sha256="$(sha256sum -- "$trusted_source_manifest_path" | awk '{ print $1 }')"
  [[ "$trusted_source_manifest_sha256" =~ ^[0-9a-f]{64}$ ]] \
    || die 'trusted source SHA256SUMS digest is malformed'
}

assert_trusted_source_manifest_unchanged() {
  [[ -f "$trusted_source_manifest_path" && ! -L "$trusted_source_manifest_path" \
    && "$(stat -c '%d:%i:%s:%y:%z:%h' -- "$trusted_source_manifest_path")" == \
      "$trusted_source_manifest_identity" \
    && "$(sha256sum -- "$trusted_source_manifest_path" | awk '{ print $1 }')" == \
      "$trusted_source_manifest_sha256" ]] \
    || die 'artifact-controlled hydration mutated trusted source SHA256SUMS identity or digest'
}

if [[ "$unprivileged_test_mode" == false ]]; then
  artifact_parent="$(dirname -- "$artifact")"
  checksum_parent="$(dirname -- "$artifact_sha256")"
  [[ "$artifact_parent" == "$checksum_parent" ]] \
    || die 'production artifact and checksum must share one canonical inbox directory'
  assert_root_controlled_ancestor_chain "$artifact_parent"
  if [[ "$hydrate" == true ]]; then
    assert_build_uid_process_fence current
  fi
  build_gid="$(id -g leetplus-build)"
  assert_production_input_file "$artifact" "$build_gid"
  assert_production_input_file "$artifact_sha256" "$build_gid"

  input_snapshot_directory="$(mktemp -d "${output_root}/.${release_sha}.input.XXXXXX")"
  chmod 0700 -- "$input_snapshot_directory"
  snapshot_artifact="${input_snapshot_directory}/${artifact_name}"
  snapshot_checksum="${snapshot_artifact}.sha256"
  cp --reflink=never --no-preserve=mode,ownership,timestamps -- \
    "$artifact" "$snapshot_artifact"
  cp --reflink=never --no-preserve=mode,ownership,timestamps -- \
    "$artifact_sha256" "$snapshot_checksum"
  chmod 0400 -- "$snapshot_artifact" "$snapshot_checksum"
  [[ "$(stat -c '%u:%g:%a:%h' -- "$snapshot_artifact")" == \
      "${EUID}:$(id -g):400:1" \
    && "$(stat -c '%u:%g:%a:%h' -- "$snapshot_checksum")" == \
      "${EUID}:$(id -g):400:1" ]] \
    || die 'private input snapshot ownership, mode or link count is unsafe'
  artifact="$snapshot_artifact"
  artifact_sha256="$snapshot_checksum"
fi

checksum_directory="$(dirname -- "$artifact_sha256")"
verified_artifact_digest="$(sha256sum -- "$artifact" | awk '{ print $1 }')"
(
  cd -- "$checksum_directory"
  checksum_file="$(basename -- "$artifact_sha256")"
  checksum_line_count="$(awk 'NF { count += 1 } END { print count + 0 }' "$checksum_file")"
  matching_checksum_line_count="$(awk -v digest="$verified_artifact_digest" -v artifact_name="$artifact_name" '
    $1 == digest && ($2 == artifact_name || $2 == "*" artifact_name) { count += 1 }
    END { print count + 0 }
  ' "$checksum_file")"
  [[ "$checksum_line_count" == '1' && "$matching_checksum_line_count" == '1' ]] || die 'checksum file must contain exactly the expected artifact checksum line'
  sha256sum --strict --check "$(basename -- "$artifact_sha256")" --status
) || die 'outer artifact checksum verification failed'
verified_artifact_identity="$(stat -c '%d:%i:%s:%Y:%Z:%h' -- "$artifact")"

assert_consumed_artifact_stable() {
  [[ "$(stat -c '%d:%i:%s:%Y:%Z:%h' -- "$artifact")" == "$verified_artifact_identity" \
    && "$(sha256sum -- "$artifact" | awk '{ print $1 }')" == "$verified_artifact_digest" ]] \
    || die 'verified artifact bytes or identity changed during consumption'
}

gzip --test -- "$artifact" || die 'gzip stream verification failed'
assert_consumed_artifact_stable

archive_listing="$(mktemp "${output_root}/.${release_sha}.listing.XXXXXX")"
archive_type_listing="$(mktemp "${output_root}/.${release_sha}.types.XXXXXX")"
staging_directory=''

LC_ALL=C tar --quoting-style=escape -tzf "$artifact" > "$archive_listing" || die 'cannot list artifact archive'
grep -F '\' "$archive_listing" >/dev/null \
  && die 'archive contains an escaped control or backslash path'
grep -Eq '(^/|(^|/)\.\.(/|$))' "$archive_listing" && die 'archive contains an unsafe path'
grep -Eq '(^|/)node_modules(/|$)' "$archive_listing" && die 'artifact embeds node_modules'
awk '
  {
    entry = $0
    if (entry == "./") {
      if (seen["."]++) exit 1
      next
    }
    if (index(entry, "./") != 1 || entry ~ /\/\/|\/\.\//) exit 1
    sub(/\/$/, "", entry)
    if (entry == "." || seen[entry]++) exit 1
  }
' "$archive_listing" || die 'archive paths are non-canonical or duplicated'
LC_ALL=C tar --quoting-style=escape -tvzf "$artifact" > "$archive_type_listing" \
  || die 'cannot inspect artifact archive member types'
awk 'substr($0, 1, 1) != "-" && substr($0, 1, 1) != "d" { exit 1 }' "$archive_type_listing" \
  || die 'artifact contains a non-regular, non-directory member'
assert_consumed_artifact_stable

staging_directory="$(mktemp -d "${output_root}/${staging_prefix}.XXXXXX")"
tar -xzf "$artifact" \
  --no-same-owner \
  --no-same-permissions \
  --warning=no-unknown-keyword \
  -C "$staging_directory" || die "artifact extraction failed; retained $staging_directory for inspection"
assert_consumed_artifact_stable

(
  cd -- "$staging_directory"
  if find_has_match . ! -type d ! -type f; then
    die 'extracted artifact contains a non-regular, non-directory entry'
  fi
  if find_has_match . -path './node_modules' -prune -o -type d -name node_modules; then
    die 'extracted artifact contains node_modules'
  fi
  node - <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const manifestName = 'SHA256SUMS';
const manifestRelativePath = `./${manifestName}`;
const root = fs.realpathSync.native('.');
const compareUtf8 = (left, right) =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

function assertSafePath(relativePath, source) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    relativePath !== relativePath.normalize('NFC') ||
    /[\\\p{Cc}]/u.test(relativePath)
  ) {
    throw new Error(`${source} path is not canonical UTF-8: ${JSON.stringify(relativePath)}`);
  }
  const components = relativePath.split('/');
  if (
    components.some(
      (component) => component.length === 0 || component === '.' || component === '..',
    )
  ) {
    throw new Error(`${source} path has an unsafe component: ${JSON.stringify(relativePath)}`);
  }
}

function walkRegularFiles(directory, relativeDirectory = '') {
  const paths = [];
  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareUtf8(left.name, right.name));
  for (const entry of entries) {
    assertSafePath(entry.name, 'artifact entry');
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    assertSafePath(relativePath, 'artifact entry');
    const absolutePath = path.join(root, ...relativePath.split('/'));
    const stat = fs.lstatSync(absolutePath);
    if (stat.isDirectory()) {
      paths.push(...walkRegularFiles(absolutePath, relativePath));
      continue;
    }
    if (!stat.isFile()) {
      throw new Error(`artifact entry is not a regular file: ${relativePath}`);
    }
    if (stat.nlink !== 1) {
      throw new Error(`artifact regular file has shared hardlinks: ${relativePath}`);
    }
    paths.push(`./${relativePath}`);
  }
  return paths;
}

const manifestStat = fs.lstatSync(manifestName);
if (!manifestStat.isFile() || manifestStat.nlink !== 1) {
  throw new Error('root SHA256SUMS must be one regular, non-hardlinked file');
}
const manifestBytes = fs.readFileSync(manifestName);
if (manifestBytes.length === 0 || manifestBytes.length > 64 * 1024 * 1024) {
  throw new Error('root SHA256SUMS has an invalid size');
}
const manifestText = new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes);
if (!manifestText.endsWith('\n')) {
  throw new Error('root SHA256SUMS must end with exactly one complete line');
}
const lines = manifestText.slice(0, -1).split('\n');
const manifestEntries = [];
const seenPaths = new Set();
let priorPath;
for (const line of lines) {
  const match = /^([0-9a-f]{64})  (\.\/.+)$/u.exec(line);
  if (!match) {
    throw new Error(`root SHA256SUMS line is not canonical: ${JSON.stringify(line)}`);
  }
  const [, digest, manifestPath] = match;
  const relativePath = manifestPath.slice(2);
  assertSafePath(relativePath, 'manifest');
  if (manifestPath === manifestRelativePath) {
    throw new Error('root SHA256SUMS must not hash itself');
  }
  if (seenPaths.has(manifestPath)) {
    throw new Error(`root SHA256SUMS contains a duplicate path: ${manifestPath}`);
  }
  if (priorPath !== undefined && compareUtf8(priorPath, manifestPath) >= 0) {
    throw new Error('root SHA256SUMS paths are not in canonical byte order');
  }
  priorPath = manifestPath;
  seenPaths.add(manifestPath);
  manifestEntries.push({ digest, manifestPath, relativePath });
}

const actualPaths = walkRegularFiles(root)
  .filter((candidate) => candidate !== manifestRelativePath)
  .sort(compareUtf8);
const manifestPaths = manifestEntries.map(({ manifestPath }) => manifestPath);
if (
  actualPaths.length !== manifestPaths.length ||
  actualPaths.some((actualPath, index) => actualPath !== manifestPaths[index])
) {
  const manifestSet = new Set(manifestPaths);
  const actualSet = new Set(actualPaths);
  const unlisted = actualPaths.find((candidate) => !manifestSet.has(candidate));
  const absent = manifestPaths.find((candidate) => !actualSet.has(candidate));
  throw new Error(
    `root SHA256SUMS path set differs from the regular-file tree` +
      `${unlisted ? `; unlisted=${unlisted}` : ''}` +
      `${absent ? `; absent=${absent}` : ''}`,
  );
}

for (const { digest, manifestPath, relativePath } of manifestEntries) {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  const bytes = fs.readFileSync(absolutePath);
  const actualDigest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actualDigest !== digest) {
    throw new Error(`root SHA256SUMS digest mismatch: ${manifestPath}`);
  }
}
NODE
  sha256sum --strict --check --quiet SHA256SUMS || die 'internal SHA256SUMS verification failed'
  node - "$release_sha" <<'NODE'
const fs = require('node:fs');

const [releaseSha] = process.argv.slice(2);
const provenance = JSON.parse(fs.readFileSync('release-provenance.json', 'utf8'));
const requiredFiles = [
  'apps/api/dist/main.js',
  'apps/api/package.json',
  'apps/web/.next/BUILD_ID',
  'apps/web/package.json',
  'packages/database/package.json',
  'packages/database/prisma/schema.prisma',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
];

if (provenance.releaseSha !== releaseSha) {
  throw new Error('release-provenance SHA mismatch');
}
if (!Number.isSafeInteger(provenance.databaseMigrationCount) || provenance.databaseMigrationCount < 1) {
  throw new Error('release-provenance migration count is invalid');
}
if (typeof provenance.databaseMigration !== 'string' || !/^\d{14}_[a-z0-9_]+$/u.test(provenance.databaseMigration)) {
  throw new Error('release-provenance migration name is invalid');
}
if (typeof provenance.nodeVersion !== 'string' || !/^\d+$/u.test(provenance.nodeVersion)) {
  throw new Error('release-provenance Node major is invalid');
}
if (typeof provenance.pnpmVersion !== 'string' || !/^\d+\.\d+\.\d+$/u.test(provenance.pnpmVersion)) {
  throw new Error('release-provenance pnpm version is invalid');
}
for (const requiredFile of requiredFiles) {
  const stat = fs.statSync(requiredFile);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`required release file is absent or empty: ${requiredFile}`);
  }
}
if (!fs.statSync('apps/web/public').isDirectory()) {
  throw new Error('release web public directory is absent');
}
NODE
)

if [[ "$hydrate" == true ]]; then
  capture_trusted_source_manifest
  assert_exact_hydration_output_inventory "$staging_directory"
  require_command pnpm
  actual_node_major="$(node -p 'process.versions.node.split(".")[0]')"
  actual_pnpm_version="$(pnpm --version)"
  expected_node_major="$(node -p 'require(process.argv[1]).nodeVersion' "$staging_directory/release-provenance.json")"
  expected_pnpm_version="$(node -p 'require(process.argv[1]).pnpmVersion' "$staging_directory/release-provenance.json")"
  [[ "$actual_node_major" == "$expected_node_major" ]] || die 'hydration Node major differs from release provenance'
  [[ "$actual_pnpm_version" == "$expected_pnpm_version" ]] || die 'hydration pnpm version differs from release provenance'
  if [[ "$unprivileged_test_mode" == false ]]; then
    node - <<'NODE' || die 'hydration kernel no-egress probe did not fail closed'
const net = require('node:net');
const deniedCodes = new Set(['EACCES', 'EPERM', 'EAFNOSUPPORT']);
let settled = false;
let socket;
const finish = (code) => {
  if (settled) return;
  settled = true;
  if (socket) socket.destroy();
  process.exit(code);
};
try {
  socket = net.createConnection({ host: '127.0.0.1', port: 9 });
} catch (error) {
  finish(deniedCodes.has(error?.code) ? 0 : 91);
}
if (socket) {
  socket.setTimeout(1000, () => finish(92));
  socket.once('connect', () => finish(93));
  socket.once('error', (error) => finish(deniedCodes.has(error?.code) ? 0 : 94));
}
NODE
    node - <<'NODE' || die 'hydration kernel Unix-socket no-egress probe did not fail closed'
const net = require('node:net');
const deniedCodes = new Set(['EACCES', 'EPERM', 'EAFNOSUPPORT']);
let settled = false;
let socket;
const finish = (code) => {
  if (settled) return;
  settled = true;
  if (socket) socket.destroy();
  process.exit(code);
};
try {
  socket = net.createConnection({ path: '/run/leetplus-release/hydration-hostile.sock' });
} catch (error) {
  finish(deniedCodes.has(error?.code) ? 0 : 95);
}
if (socket) {
  socket.setTimeout(1000, () => finish(96));
  socket.once('connect', () => finish(97));
  socket.once('error', (error) => finish(deniedCodes.has(error?.code) ? 0 : 98));
}
NODE
    printf 'HYDRATION_KERNEL_NO_EGRESS_PROBE=PASS\n'
    [[ -d "$pnpm_store_dir" && ! -L "$pnpm_store_dir" ]] || die 'trusted pnpm store is absent or unsafe'
    resolved_pnpm_store_dir="$(realpath -e -- "$pnpm_store_dir")"
    [[ "$resolved_pnpm_store_dir" == "$pnpm_store_dir" ]] \
      || die 'trusted pnpm store path traverses a symlink'
    pnpm_store_dir="$resolved_pnpm_store_dir"
    store_ancestor="$(dirname -- "$pnpm_store_dir")"
    while :; do
      [[ -d "$store_ancestor" && ! -L "$store_ancestor" \
        && "$(stat -c '%u:%g' -- "$store_ancestor")" == '0:0' ]] \
        && path_is_not_group_or_other_writable "$store_ancestor" \
        || die "pnpm store ancestor is not root-controlled: ${store_ancestor}"
      [[ "$store_ancestor" == '/' ]] && break
      store_ancestor="$(dirname -- "$store_ancestor")"
    done
    store_verifier='/usr/local/libexec/leetplus/verify-pnpm-store-integrity.mjs'
    [[ -f "$store_verifier" && ! -L "$store_verifier" \
      && "$(realpath -e -- "$store_verifier")" == "$store_verifier" \
      && "$(stat -c '%u:%g' -- "$store_verifier")" == '0:0' ]] \
      && path_is_not_group_or_other_writable "$store_verifier" \
      || die 'installed pnpm store verifier is absent or unsafe'
    verifier_ancestor="$(dirname -- "$store_verifier")"
    while :; do
      [[ -d "$verifier_ancestor" && ! -L "$verifier_ancestor" \
        && "$(stat -c '%u:%g' -- "$verifier_ancestor")" == '0:0' ]] \
        && path_is_not_group_or_other_writable "$verifier_ancestor" \
        || die "pnpm store verifier ancestor is not root-controlled: ${verifier_ancestor}"
      [[ "$verifier_ancestor" == '/' ]] && break
      verifier_ancestor="$(dirname -- "$verifier_ancestor")"
    done
    [[ "$(command -v node)" == '/usr/bin/node' ]] \
      || die 'production hydration Node path is not exact /usr/bin/node'
    store_receipt="${pnpm_store_dir}/LEETPLUS_STORE_RECEIPT"
    [[ -f "$store_receipt" && ! -L "$store_receipt" ]] || die 'trusted pnpm store receipt is absent'
    lockfile_sha="$(sha256sum "$staging_directory/pnpm-lock.yaml" | awk '{ print $1 }')"
    store_integrity_attestation="$(
      /usr/bin/node "$store_verifier" verify \
        --store-root "$pnpm_store_dir" \
        --lockfile-sha256 "$lockfile_sha" \
        --node-major "$expected_node_major" \
        --pnpm-version "$expected_pnpm_version"
    )" || die 'trusted pnpm store failed complete integrity verification'
    [[ "$(awk 'END { print NR }' <<< "$store_integrity_attestation")" == '3' \
      && "$(grep -c '^PNPM_STORE_INTEGRITY=PASS$' <<< "$store_integrity_attestation")" == '1' \
      && "$(grep -c '^PNPM_STORE_MANIFEST_SHA256=[0-9a-f]\{64\}$' <<< "$store_integrity_attestation")" == '1' \
      && "$(grep -c '^PNPM_STORE_REGULAR_FILE_COUNT=[1-9][0-9]*$' <<< "$store_integrity_attestation")" == '1' ]] \
      || die 'trusted pnpm store integrity attestation is malformed'
    store_manifest_sha256="$(awk -F= '$1 == "PNPM_STORE_MANIFEST_SHA256" { print $2 }' <<< "$store_integrity_attestation")"
    store_receipt_sha256="$(sha256sum -- "$store_receipt" | awk '{ print $1 }')"
  fi
  if ! (
    cd -- "$staging_directory"
    assert_exact_hydration_output_inventory "$staging_directory"
    assert_trusted_source_manifest_unchanged
    pnpm install --prod --offline --frozen-lockfile --ignore-scripts \
      --package-import-method=copy --store-dir "$pnpm_store_dir" || exit 1
    assert_trusted_source_manifest_unchanged
    assert_exact_hydration_output_inventory "$staging_directory"
    pnpm --filter database db:generate || exit 1
    assert_trusted_source_manifest_unchanged
    assert_exact_hydration_output_inventory "$staging_directory"
    sha256sum --strict --check --quiet SHA256SUMS || exit 1
    ! find_has_match -P . -xdev -type f -links +1 || exit 1
    ! find_has_match -P . -xdev ! -type d ! -type f ! -type l || exit 1
    if [[ "$unprivileged_test_mode" == false ]]; then
      assert_build_uid_process_fence current
    fi
    assert_trusted_source_manifest_unchanged
    assert_exact_hydration_output_inventory "$staging_directory"
    node - <<'NODE' || exit 1
const fs = require('node:fs');
const path = require('node:path');

const root = fs.realpathSync.native('.');
const manifestPath = path.join(root, 'HYDRATED_SYMLINKS.json');
const compareUtf8 = (left, right) =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
const links = [];

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
  ) {
    throw new Error(`hydrated symlink path is not canonical: ${relativePath}`);
  }
}

function assertTarget(relativePath, absolutePath, target) {
  if (
    typeof target !== 'string' ||
    target.length === 0 ||
    target !== target.normalize('NFC') ||
    path.posix.isAbsolute(target) ||
    path.posix.normalize(target) !== target ||
    /[\\\u0000-\u001f\u007f]/u.test(target)
  ) {
    throw new Error(`hydrated symlink target is not canonical: ${relativePath}`);
  }
  const resolved = fs.realpathSync.native(absolutePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`hydrated symlink escapes the release: ${relativePath}`);
  }
}

function walk(directory, relativeDirectory = '') {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareUtf8(left.name, right.name));
  for (const entry of entries) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    assertCanonicalPath(relativePath);
    const absolutePath = path.join(root, ...relativePath.split('/'));
    const stat = fs.lstatSync(absolutePath);
    if (stat.isDirectory()) {
      walk(absolutePath, relativePath);
      continue;
    }
    if (!stat.isSymbolicLink()) continue;
    const target = fs.readlinkSync(absolutePath, 'utf8');
    assertTarget(relativePath, absolutePath, target);
    links.push({ path: relativePath, target });
  }
}

walk(root);
links.sort((left, right) => compareUtf8(left.path, right.path) || compareUtf8(left.target, right.target));
const serialized = `${JSON.stringify({ links, version: 1 })}\n`;
if (Buffer.byteLength(serialized, 'utf8') > 8 * 1024 * 1024) {
  throw new Error('hydrated symlink manifest exceeds the 8 MiB limit');
}
fs.writeFileSync(
  manifestPath,
  serialized,
  { encoding: 'utf8', flag: 'wx', mode: 0o440 },
);
NODE
    assert_trusted_source_manifest_unchanged
    assert_exact_hydration_output_inventory "$staging_directory"
    if [[ "$unprivileged_test_mode" == false ]]; then
      {
        printf 'RECORD_VERSION=1\n'
        printf 'RELEASE_SHA=%s\n' "$release_sha"
        printf 'SANDBOX=SYSTEMD_IP_DENY_ANY_V1\n'
        printf 'INVOCATION_ID=%s\n' "$INVOCATION_ID"
        printf 'PNPM_STORE_LOCKFILE_SHA256=%s\n' "$lockfile_sha"
        printf 'PNPM_STORE_MANIFEST_SHA256=%s\n' "$store_manifest_sha256"
        printf 'PNPM_STORE_RECEIPT_SHA256=%s\n' "$store_receipt_sha256"
      } > HYDRATION_SANDBOX_RECEIPT
      chmod 0440 HYDRATION_SANDBOX_RECEIPT
    fi
    assert_trusted_source_manifest_unchanged
    assert_exact_hydration_output_inventory "$staging_directory"
    find -P . -xdev \
      -path './apps/web/.next/cache' -prune -o \
      -type f ! -path './HYDRATED_SHA256SUMS' -print0 \
      | LC_ALL=C sort -z \
      | xargs -0 sha256sum --text > HYDRATED_SHA256SUMS \
      || exit 1
    sha256sum --strict --check --quiet HYDRATED_SHA256SUMS || exit 1
    assert_trusted_source_manifest_unchanged
    assert_exact_hydration_output_inventory "$staging_directory"
    node - <<'NODE' || exit 1
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const root = fs.realpathSync.native('.');
const manifestName = 'HYDRATED_SHA256SUMS';
const mutableCache = 'apps/web/.next/cache';
const compareUtf8 = (left, right) =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

function fail(message) {
  throw new Error(`hydrated manifest exact-tree validation failed: ${message}`);
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
  ) {
    fail(`non-canonical path: ${relativePath}`);
  }
}

const actualPaths = [];
function walk(directory, relativeDirectory = '') {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareUtf8(left.name, right.name));
  for (const entry of entries) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    assertCanonicalPath(relativePath);
    const absolutePath = path.join(root, ...relativePath.split('/'));
    const stat = fs.lstatSync(absolutePath);
    if (stat.isDirectory()) {
      if (relativePath !== mutableCache) walk(absolutePath, relativePath);
      continue;
    }
    if (stat.isFile() && relativePath !== manifestName) {
      actualPaths.push(`./${relativePath}`);
    }
  }
}
walk(root);
actualPaths.sort(compareUtf8);

const manifestPath = path.join(root, manifestName);
const manifestStat = fs.lstatSync(manifestPath);
if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.nlink !== 1) {
  fail('manifest is not one regular non-linked file');
}
const manifestBytes = fs.readFileSync(manifestPath);
let manifestText;
try {
  manifestText = new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes);
} catch {
  fail('manifest is not valid UTF-8');
}
if (!manifestText.endsWith('\n') || manifestText.endsWith('\n\n')) {
  fail('manifest does not have canonical complete LF records');
}

const manifestPaths = [];
const seen = new Set();
let priorPath;
for (const line of manifestText.slice(0, -1).split('\n')) {
  const match = /^([0-9a-f]{64})  (\.\/.+)$/u.exec(line);
  if (!match) fail('manifest contains a malformed record');
  const manifestPathValue = match[2];
  const relativePath = manifestPathValue.slice(2);
  assertCanonicalPath(relativePath);
  if (relativePath === manifestName) fail('manifest hashes itself');
  if (seen.has(manifestPathValue)) fail(`manifest duplicates path: ${manifestPathValue}`);
  if (priorPath !== undefined && compareUtf8(priorPath, manifestPathValue) >= 0) {
    fail('manifest path set is not in canonical byte order');
  }
  const absolutePath = path.join(root, ...relativePath.split('/'));
  const stat = fs.lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    fail(`manifest target is not one regular file: ${manifestPathValue}`);
  }
  priorPath = manifestPathValue;
  seen.add(manifestPathValue);
  manifestPaths.push(manifestPathValue);
}

if (
  manifestPaths.length !== actualPaths.length ||
  manifestPaths.some((manifestPathValue, index) => manifestPathValue !== actualPaths[index])
) {
  const manifestSet = new Set(manifestPaths);
  const actualSet = new Set(actualPaths);
  const omitted = actualPaths.find((candidate) => !manifestSet.has(candidate));
  const absent = manifestPaths.find((candidate) => !actualSet.has(candidate));
  fail(
    `manifest does not cover the exact regular-file tree` +
      `${omitted ? `; omitted=${omitted}` : ''}` +
      `${absent ? `; absent=${absent}` : ''}`
  );
}
NODE
    assert_trusted_source_manifest_unchanged
    assert_exact_hydration_output_inventory "$staging_directory"
    if [[ "$unprivileged_test_mode" == false ]]; then
      assert_build_uid_process_fence current
    fi
  ); then
    die "locked offline hydration failed; retained $staging_directory for inspection"
  fi
fi

if [[ "$unprivileged_test_mode" == true ]]; then
  printf 'UNTRUSTED_TEST_STAGE_VERSION=1\nRELEASE_SHA=%s\n' "$release_sha" \
    > "${staging_directory}/UNTRUSTED_TEST_STAGE"
  chmod 0400 -- "${staging_directory}/UNTRUSTED_TEST_STAGE"
  staged_release_trust='UNTRUSTED_TEST_ONLY'
else
  staged_release_trust='PRODUCTION_INPUT_SNAPSHOT_VERIFIED'
fi

if [[ "$hydrate" == true ]]; then
  assert_trusted_source_manifest_unchanged
  assert_exact_hydration_output_inventory "$staging_directory"
  if [[ "$unprivileged_test_mode" == false ]]; then
    assert_build_uid_process_fence current
  fi
fi
mv -- "$staging_directory" "$release_directory"
staging_directory=''
if [[ "$hydrate" == true ]]; then
  assert_exact_hydration_output_inventory "$release_directory"
fi

printf 'STAGED_RELEASE_SHA=%s\n' "$release_sha"
printf 'STAGED_RELEASE_DIRECTORY=%s\n' "$release_directory"
printf 'STAGED_RELEASE_HYDRATED=%s\n' "$hydrate"
printf 'STAGED_RELEASE_TRUST=%s\n' "$staged_release_trust"
printf 'NEXT_STEP=reviewed migration and runtime switch; this script performed neither\n'
