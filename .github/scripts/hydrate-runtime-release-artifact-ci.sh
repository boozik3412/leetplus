#!/usr/bin/bash -p
# Build one disposable CI runtime from the exact release artifact with the same
# dependency-install semantics used by the production hydration authority.

invoking_sudo_uid="${SUDO_UID:-}"
invoking_sudo_gid="${SUDO_GID:-}"

[[ "$-" == *p* ]] || {
  printf 'hydrate-runtime-release-artifact-ci: invoke with /usr/bin/bash -p\n' >&2
  exit 1
}

set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly RELEASE_STAGER_AUTHORITY_SHA256='71325e3099d84790cfcba81aac5608787df7234026468cffb7125e0ce3fe6962'
readonly RUNTIME_EXTRACTOR_AUTHORITY_SHA256='8b2e687f20a0c3c34bcd7c9108679c28f3a20305debe1aa17d248b4f7115cb6c'
readonly RUNTIME_VERIFIER_AUTHORITY_SHA256='69de1a93ce9971a95566d3cf7151817dd76ef7ca0ce1bb4aed96df667b205c03'

while IFS= read -r exported_name; do
  case "$exported_name" in
    CI|GITHUB_ACTIONS|LANG|LC_ALL|PATH|TZ) ;;
    *) unset "$exported_name" ;;
  esac
done < <(compgen -e)
PATH=/usr/bin:/bin
LANG=C.UTF-8
LC_ALL=C.UTF-8
TZ=UTC
export PATH LANG LC_ALL TZ

die() {
  printf 'hydrate-runtime-release-artifact-ci: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  hydrate-runtime-release-artifact-ci.sh \
    --validate-fixed-tools-only --release-sha <40-lowercase-hex> \
    --runner-uid <calling-runner-uid> --runner-gid <calling-runner-gid>

  hydrate-runtime-release-artifact-ci.sh \
    --release-sha <40-lowercase-hex> \
    --repository-root <exact-checkout-root> \
    --runner-tool-cache <canonical-runner-tool-cache> \
    --node-path <exact-Node-22-path> \
    --pnpm-path <exact-pnpm-10.33.2-path> \
    --pnpm-package-root <canonical-pnpm-10.33.2-package-root> \
    --runner-uid <calling-runner-uid> \
    --runner-gid <calling-runner-gid> \
    --artifact <leetplus-release-<sha>.tar.gz> \
    --artifact-sha256 <artifact>.sha256 \
    --work-root </srv/leetplus-ci-runtime-output/<release-sha>>

The command creates <work-root>/releases/.untrusted-test-<sha> and prints its
absolute path as CI_HYDRATED_RELEASE_DIRECTORY. It fetches a fresh lockfile-
bound store, materializes only the reviewed production dependency side effects
inside a disposable workspace, freezes that store as root-owned read-only input,
and delegates the offline copy-only, ignore-scripts install plus explicit Prisma
generation to the reviewed production stager. It never creates a deployable
production release.
USAGE
}

release_sha=''
repository_root=''
runner_tool_cache=''
node_path=''
pnpm_path=''
pnpm_package_root=''
runner_uid=''
runner_gid=''
artifact=''
artifact_sha256=''
work_root=''
validate_fixed_tools_only=false

while (($# > 0)); do
  case "$1" in
    --release-sha) release_sha="${2:-}"; shift 2 ;;
    --repository-root) repository_root="${2:-}"; shift 2 ;;
    --runner-tool-cache) runner_tool_cache="${2:-}"; shift 2 ;;
    --node-path) node_path="${2:-}"; shift 2 ;;
    --pnpm-path) pnpm_path="${2:-}"; shift 2 ;;
    --pnpm-package-root) pnpm_package_root="${2:-}"; shift 2 ;;
    --runner-uid) runner_uid="${2:-}"; shift 2 ;;
    --runner-gid) runner_gid="${2:-}"; shift 2 ;;
    --artifact) artifact="${2:-}"; shift 2 ;;
    --artifact-sha256) artifact_sha256="${2:-}"; shift 2 ;;
    --work-root) work_root="${2:-}"; shift 2 ;;
    --validate-fixed-tools-only) validate_fixed_tools_only=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ "$(/usr/bin/uname -s)" == 'Linux' ]] || die 'Linux is required'
((EUID == 0)) || die 'CI hydration controller must run as root'
[[ "${CI:-}" == 'true' && "${GITHUB_ACTIONS:-}" == 'true' ]] \
  || die 'the disposable GitHub CI boundary is absent'
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || die 'release SHA is invalid'
[[ "$runner_uid" =~ ^[1-9][0-9]*$ && "$runner_gid" =~ ^[1-9][0-9]*$ ]] \
  || die 'calling runner UID/GID are invalid'
[[ "$invoking_sudo_uid" == "$runner_uid" \
  && "$invoking_sudo_gid" == "$runner_gid" ]] \
  || die 'sudo caller identity does not match the declared GitHub runner identity'

for bootstrap_tool in /usr/bin/realpath /usr/bin/stat; do
  [[ -f "$bootstrap_tool" && -x "$bootstrap_tool" && ! -L "$bootstrap_tool" ]] \
    || die "fixed-tool verifier is absent or unsafe: ${bootstrap_tool}"
done

assert_root_controlled_tool_directory() {
  local directory="$1"
  local mode
  [[ -d "$directory" && ! -L "$directory" \
    && "$(/usr/bin/stat -c '%u:%g' -- "$directory")" == '0:0' ]] \
    || die "fixed-tool authority directory is unsafe: ${directory}"
  mode="$(/usr/bin/stat -c '%a' -- "$directory")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] \
    || die "fixed-tool authority directory mode is invalid: ${directory}"
  (( (8#$mode & 8#22) == 0 )) \
    || die "fixed-tool authority directory is writable outside root: ${directory}"
}

for authority_directory in /usr /usr/bin /usr/sbin /etc /etc/alternatives; do
  assert_root_controlled_tool_directory "$authority_directory"
done

assert_fixed_tool() {
  local command_path="$1"
  local resolved_path mode
  [[ -x "$command_path" ]] \
    || die "required fixed tool is absent: ${command_path}"
  resolved_path="$(/usr/bin/realpath -e -- "$command_path")" \
    || die "required fixed tool cannot be resolved: ${command_path}"
  case "$resolved_path" in
    /usr/bin/*|/usr/sbin/*) ;;
    *) die "required fixed tool resolves outside the system authority: ${command_path}" ;;
  esac
  [[ -f "$resolved_path" && -x "$resolved_path" && ! -L "$resolved_path" \
    && "$(/usr/bin/stat -c '%u:%g' -- "$resolved_path")" == '0:0' ]] \
    || die "required fixed tool target is unsafe: ${command_path}"
  mode="$(/usr/bin/stat -c '%a' -- "$resolved_path")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] \
    || die "required fixed tool mode is invalid: ${command_path}"
  (( (8#$mode & 8#22) == 0 )) \
    || die "required fixed tool is writable outside root: ${command_path}"
}

for command_path in \
  /usr/bin/awk /usr/bin/bash /usr/bin/basename /usr/bin/chmod /usr/bin/chown \
  /usr/bin/cmp /usr/bin/dirname /usr/bin/env /usr/bin/find \
  /usr/bin/getent /usr/bin/id \
  /usr/bin/install /usr/bin/mkdir /usr/bin/mktemp /usr/bin/python3 \
  /usr/bin/pgrep /usr/bin/pkill /usr/bin/realpath /usr/bin/rm \
  /usr/bin/sha256sum /usr/bin/sort /usr/bin/stat /usr/bin/sudo \
  /usr/bin/systemctl /usr/bin/systemd-run /usr/bin/test /usr/bin/true \
  /usr/bin/uname /usr/bin/xargs \
  /usr/sbin/groupadd /usr/sbin/groupdel /usr/sbin/runuser \
  /usr/sbin/useradd /usr/sbin/userdel; do
  assert_fixed_tool "$command_path"
done

if [[ "$validate_fixed_tools_only" == true ]]; then
  printf 'CI_RUNTIME_FIXED_TOOLS=PASS\n'
  exit 0
fi

runner_passwd_rows="$(/usr/bin/getent passwd | /usr/bin/awk -F: -v uid="$runner_uid" '$3 == uid { print }')"
runner_group_rows="$(/usr/bin/getent group | /usr/bin/awk -F: -v gid="$runner_gid" '$3 == gid { print }')"
[[ -n "$runner_passwd_rows" && -n "$runner_group_rows" \
  && "$(/usr/bin/awk 'END { print NR }' <<< "$runner_passwd_rows")" == '1' \
  && "$(/usr/bin/awk 'END { print NR }' <<< "$runner_group_rows")" == '1' \
  && "$(/usr/bin/awk -F: '{ print $3 ":" $4 }' <<< "$runner_passwd_rows")" == \
    "${runner_uid}:${runner_gid}" ]] \
  || die 'calling runner numeric identity is not unique'

provided_repository_root="$repository_root"
provided_runner_tool_cache="$runner_tool_cache"
provided_node_path="$node_path"
provided_pnpm_path="$pnpm_path"
provided_pnpm_package_root="$pnpm_package_root"
provided_artifact="$artifact"
provided_artifact_sha256="$artifact_sha256"
repository_root="$(/usr/bin/realpath -e -- "$provided_repository_root")"
runner_tool_cache="$(/usr/bin/realpath -e -- "$provided_runner_tool_cache")"
node_path="$(/usr/bin/realpath -e -- "$provided_node_path")"
pnpm_path="$(/usr/bin/realpath -e -- "$provided_pnpm_path")"
pnpm_package_root="$(/usr/bin/realpath -e -- "$provided_pnpm_package_root")"
artifact="$(/usr/bin/realpath -e -- "$provided_artifact")"
artifact_sha256="$(/usr/bin/realpath -e -- "$provided_artifact_sha256")"

[[ "$provided_repository_root" == "$repository_root" \
  && "$provided_runner_tool_cache" == "$runner_tool_cache" \
  && "$provided_node_path" == "$node_path" \
  && "$provided_pnpm_path" == "$pnpm_path" \
  && "$provided_pnpm_package_root" == "$pnpm_package_root" \
  && "$provided_artifact" == "$artifact" \
  && "$provided_artifact_sha256" == "$artifact_sha256" ]] \
  || die 'an authority input path is non-canonical or traverses a symlink'

[[ -d "$repository_root" && ! -L "$repository_root" ]] \
  || die 'repository root is absent or unsafe'
[[ "$(/usr/bin/stat -c '%u' -- "$repository_root")" == "$runner_uid" ]] \
  || die 'repository root does not belong to the calling runner identity'
case "$node_path" in
  "$runner_tool_cache"/node/22.*/x64/bin/node) ;;
  *) die 'Node path is outside the exact runner Node 22 toolcache' ;;
esac
[[ -x "$node_path" && ! -L "$node_path" ]] \
  || die 'exact Node 22 runtime is invalid'
[[ -f "$pnpm_path" && -x "$pnpm_path" && ! -L "$pnpm_path" ]] \
  || die 'resolved pnpm command is absent or unsafe'
pnpm_package_entrypoint="${pnpm_package_root}/bin/pnpm.cjs"
[[ -d "$pnpm_package_root" && ! -L "$pnpm_package_root" \
  && "$(/usr/bin/realpath -e -- "$pnpm_package_root")" == \
    "$pnpm_package_root" \
  && -f "${pnpm_package_root}/package.json" \
  && -f "${pnpm_package_root}/dist/pnpm.cjs" \
  && -f "$pnpm_package_entrypoint" \
  && ! -L "$pnpm_package_entrypoint" ]] \
  || die 'resolved pnpm command is outside an exact pnpm package root'
if [[ "$pnpm_path" != "$pnpm_package_entrypoint" ]]; then
  pnpm_command_root="$(/usr/bin/dirname -- "$pnpm_path")"
  pnpm_node_modules_root="$(/usr/bin/dirname -- "$pnpm_command_root")"
  [[ "$(/usr/bin/basename -- "$pnpm_path")" == 'pnpm' \
    && "$(/usr/bin/basename -- "$pnpm_command_root")" == '.bin' \
    && "$(/usr/bin/basename -- "$pnpm_node_modules_root")" == 'node_modules' \
    && "$(/usr/bin/realpath -e -- "${pnpm_node_modules_root}/pnpm")" == \
      "$pnpm_package_root" ]] \
    || die 'resolved pnpm command is outside its exact package installation'
fi
[[ -f "$artifact" && ! -L "$artifact" \
  && "$(/usr/bin/stat -c '%h' -- "$artifact")" == '1' ]] \
  || die 'release archive is absent, linked or unsafe'
[[ -f "$artifact_sha256" && ! -L "$artifact_sha256" \
  && "$(/usr/bin/stat -c '%h' -- "$artifact_sha256")" == '1' ]] \
  || die 'release checksum is absent, linked or unsafe'
[[ "$(/usr/bin/stat -c '%u' -- "$artifact")" == "$runner_uid" \
  && "$(/usr/bin/stat -c '%u' -- "$artifact_sha256")" == "$runner_uid" ]] \
  || die 'release inputs do not belong to the calling runner identity'
[[ "$(/usr/bin/basename -- "$artifact")" == "leetplus-release-${release_sha}.tar.gz" \
  && "$(/usr/bin/basename -- "$artifact_sha256")" == "leetplus-release-${release_sha}.tar.gz.sha256" ]] \
  || die 'release inputs are not named for the exact SHA'

stager="${repository_root}/docs/deployment/production-artifact/stage-release-artifact.sh"
extractor="${repository_root}/.github/scripts/extract-runtime-release-artifact.py"
runtime_verifier="${repository_root}/.github/scripts/verify-runtime-release-artifact.mjs"
[[ -f "$stager" && ! -L "$stager" ]] || die 'reviewed release stager is absent'
[[ -f "$extractor" && ! -L "$extractor" \
  && -f "$runtime_verifier" && ! -L "$runtime_verifier" ]] \
  || die 'reviewed runtime extraction authorities are absent'

build_user='leetplus-ci-hydration'
build_group='leetplus-ci-hydration'
build_user_created=false
build_group_created=false
build_uid=''
build_gid=''
store_authority_root=''
hydration_unit_name=''
retain_verified_output=false
store_authority_root_created=false
work_root_created=false
cleanup_ci_authority() {
  local cleanup_status=$?
  local restore_errexit=false
  [[ "$-" == *e* ]] && restore_errexit=true
  set +e
  if [[ -n "$hydration_unit_name" ]]; then
    /usr/bin/systemctl stop "$hydration_unit_name" >/dev/null 2>&1 || true
    /usr/bin/systemctl reset-failed "$hydration_unit_name" >/dev/null 2>&1 || true
  fi
  if [[ -n "$build_uid" ]]; then
    /usr/bin/pkill -TERM -u "$build_uid" >/dev/null 2>&1 || true
    /usr/bin/pkill -KILL -u "$build_uid" >/dev/null 2>&1 || true
  fi
  if [[ "$build_user_created" == true ]]; then
    /usr/sbin/userdel "$build_user" >/dev/null 2>&1 || true
  fi
  if [[ "$build_group_created" == true ]]; then
    /usr/sbin/groupdel "$build_group" >/dev/null 2>&1 || true
  fi
  if [[ "$store_authority_root_created" == true \
    && -n "$store_authority_root" \
    && "$store_authority_root" == "/srv/leetplus-ci-runtime-hydration/${release_sha}" ]]; then
    /usr/bin/rm -rf -- "$store_authority_root"
  fi
  if [[ "$work_root_created" == true \
    && "$retain_verified_output" != true \
    && -n "$work_root" \
    && "$work_root" == "/srv/leetplus-ci-runtime-output/${release_sha}" ]]; then
    /usr/bin/rm -rf -- "$work_root"
  fi
  [[ "$restore_errexit" == true ]] && set -e
  return "$cleanup_status"
}
trap cleanup_ci_authority EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

[[ -z "$(/usr/bin/getent passwd "$build_user" || true)" \
  && -z "$(/usr/bin/getent group "$build_group" || true)" ]] \
  || die 'ephemeral CI hydration identity already exists'
/usr/sbin/groupadd --system "$build_group"
build_group_created=true
/usr/sbin/useradd --system --no-create-home --home-dir /nonexistent \
  --shell /usr/sbin/nologin --gid "$build_group" "$build_user"
build_user_created=true
build_uid="$(/usr/bin/id -u "$build_user")"
build_gid="$(/usr/bin/id -g "$build_user")"
[[ "$build_uid" =~ ^[1-9][0-9]*$ && "$build_gid" =~ ^[1-9][0-9]*$ \
  && "$(/usr/bin/id -G "$build_user")" == "$build_gid" ]] \
  || die 'ephemeral CI hydration identity has unexpected groups'
build_passwd_rows="$(/usr/bin/getent passwd | /usr/bin/awk -F: -v uid="$build_uid" '$3 == uid { print }')"
build_group_rows="$(/usr/bin/getent group | /usr/bin/awk -F: -v gid="$build_gid" '$3 == gid { print }')"
[[ -n "$build_passwd_rows" && -n "$build_group_rows" \
  && "$(/usr/bin/awk 'END { print NR }' <<< "$build_passwd_rows")" == '1' \
  && "$(/usr/bin/awk 'END { print NR }' <<< "$build_group_rows")" == '1' \
  && "$(/usr/bin/awk -F: '{ print $1 ":" $3 ":" $4 ":" $6 ":" $7 }' <<< "$build_passwd_rows")" == \
    "${build_user}:${build_uid}:${build_gid}:/nonexistent:/usr/sbin/nologin" \
  && "$(/usr/bin/awk -F: '{ print $1 ":" $3 ":" $4 }' <<< "$build_group_rows")" == \
    "${build_group}:${build_gid}:" ]] \
  || die 'ephemeral CI hydration passwd/group authority is not exact'
if /usr/sbin/runuser -u "$build_user" -- /usr/bin/sudo -n /usr/bin/true \
  >/dev/null 2>&1; then
  die 'ephemeral CI hydration identity unexpectedly has passwordless sudo'
fi
assert_build_uid_quiescent() {
  local observed_pids pgrep_status
  set +e
  observed_pids="$(/usr/bin/pgrep -u "$build_uid" 2>/dev/null)"
  pgrep_status=$?
  set -e
  case "$pgrep_status" in
    0)
      [[ -n "$observed_pids" ]] \
        || die 'build-UID process inventory returned an empty success result'
      die 'ephemeral CI hydration identity owns a process outside the bounded child execution'
      ;;
    1)
      [[ -z "$observed_pids" ]] \
        || die 'build-UID empty process inventory returned unexpected output'
      ;;
    *)
      die 'build-UID process inventory failed'
      ;;
  esac
}
assert_build_uid_quiescent

assert_build_cannot_replace_path() {
  local candidate_path="$1"
  while :; do
    if /usr/sbin/runuser -u "$build_user" -- /usr/bin/test -w "$candidate_path"; then
      die "ephemeral CI hydration identity can replace an authority path component: ${candidate_path}"
    fi
    [[ "$candidate_path" == '/' ]] && break
    candidate_path="$(/usr/bin/dirname -- "$candidate_path")"
  done
}
assert_build_cannot_replace_path "$pnpm_path"
assert_build_cannot_replace_path "$pnpm_package_root"

snapshot_regular_file() {
  local source_path="$1"
  local destination_path="$2"
  local maximum_bytes="$3"
  local destination_mode="$4"
  local expected_sha256="${5:-}"
  local allow_empty="${6:-false}"
  local allow_shared_source="${7:-false}"
  /usr/bin/python3 -I -S -E - \
    "$source_path" "$destination_path" "$maximum_bytes" \
    "$destination_mode" "$build_gid" "$expected_sha256" \
    "$allow_empty" "$allow_shared_source" <<'PY'
import hashlib
import os
import stat
import sys

(
    source,
    destination,
    maximum_text,
    mode_text,
    gid_text,
    expected,
    allow_empty_text,
    allow_shared_source_text,
) = sys.argv[1:]
maximum = int(maximum_text, 10)
mode = int(mode_text, 8)
gid = int(gid_text, 10)
if (
    maximum <= 0
    or gid <= 0
    or allow_empty_text not in {"false", "true"}
    or allow_shared_source_text not in {"false", "true"}
):
    raise SystemExit("invalid snapshot authority arguments")
allow_empty = allow_empty_text == "true"
allow_shared_source = allow_shared_source_text == "true"

source_flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
destination_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC | os.O_NOFOLLOW
source_fd = os.open(source, source_flags)
destination_fd = -1
try:
    before = os.fstat(source_fd)
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_nlink < 1
        or (before.st_nlink != 1 and not allow_shared_source)
    ):
        raise SystemExit("snapshot source is not an allowed regular file")
    if before.st_size < 0 or (before.st_size == 0 and not allow_empty) or before.st_size > maximum:
        raise SystemExit("snapshot source size is outside its exact bound")
    destination_fd = os.open(destination, destination_flags, mode)
    digest = hashlib.sha256()
    total = 0
    while True:
        chunk = os.read(source_fd, min(1024 * 1024, maximum - total + 1))
        if not chunk:
            break
        total += len(chunk)
        if total > maximum:
            raise SystemExit("snapshot source exceeded its exact bound")
        digest.update(chunk)
        view = memoryview(chunk)
        while view:
            written = os.write(destination_fd, view)
            if written <= 0:
                raise SystemExit("snapshot destination write made no progress")
            view = view[written:]
    observed = digest.hexdigest()
    if total != before.st_size:
        raise SystemExit("snapshot source size changed during descriptor read")
    if expected and observed != expected:
        raise SystemExit("snapshot source digest differs from the reviewed authority")
    os.fchmod(destination_fd, mode)
    os.fchown(destination_fd, 0, gid)
    os.fsync(destination_fd)
    after = os.fstat(source_fd)
    path_after = os.stat(source, follow_symlinks=False)
    identity_fields = (
        "st_dev",
        "st_ino",
        "st_size",
        "st_mtime_ns",
        "st_ctime_ns",
        "st_mode",
        "st_uid",
        "st_gid",
        "st_nlink",
    )
    if any(getattr(before, field) != getattr(after, field) for field in identity_fields):
        raise SystemExit("snapshot source descriptor identity changed")
    if any(getattr(before, field) != getattr(path_after, field) for field in identity_fields):
        raise SystemExit("snapshot source pathname no longer names the opened file")
    if (
        not stat.S_ISREG(path_after.st_mode)
        or path_after.st_nlink < 1
        or (path_after.st_nlink != 1 and not allow_shared_source)
    ):
        raise SystemExit("snapshot source pathname became unsafe")
    print(observed)
finally:
    if destination_fd >= 0:
        os.close(destination_fd)
    os.close(source_fd)
PY
}

find_has_match() {
  local probe_path find_status
  probe_path="$(/usr/bin/mktemp /run/leetplus-ci-find-probe.XXXXXX)" \
    || die 'could not allocate a root-controlled find probe'
  set +e
  /usr/bin/find "$@" -print0 -quit > "$probe_path"
  find_status=$?
  set -e
  if ((find_status != 0)); then
    /usr/bin/rm -f -- "$probe_path"
    die 'a required filesystem inventory producer failed'
  fi
  if [[ -s "$probe_path" ]]; then
    /usr/bin/rm -f -- "$probe_path"
    return 0
  fi
  /usr/bin/rm -f -- "$probe_path"
  return 1
}

assert_exact_pnpm_project_registration() {
  local registry_root="$1"
  local registration_kind="$2"
  local expected_root="$3"
  local expected_sha="${4:-}"

  /usr/bin/python3 - \
    "$registry_root" "$registration_kind" "$expected_root" "$expected_sha" \
    "$build_uid" "$build_gid" <<'PY'
import hashlib
import os
import stat
import sys

registry_root, registration_kind, expected_root, expected_sha, uid_text, gid_text = sys.argv[1:]
expected_uid = int(uid_text)
expected_gid = int(gid_text)

registry_stat = os.lstat(registry_root)
if not stat.S_ISDIR(registry_stat.st_mode):
    raise SystemExit("pnpm project registry is not a real directory")
if (
    registry_stat.st_uid != expected_uid
    or registry_stat.st_gid != expected_gid
    or stat.S_IMODE(registry_stat.st_mode) != 0o700
):
    raise SystemExit("pnpm project registry metadata is not exact")

with os.scandir(registry_root) as iterator:
    entries = list(iterator)
if len(entries) != 1:
    raise SystemExit("pnpm project registry does not contain exactly one entry")

entry = entries[0]
entry_stat = entry.stat(follow_symlinks=False)
if not stat.S_ISLNK(entry_stat.st_mode):
    raise SystemExit("pnpm project registration is not a symlink")
if entry_stat.st_uid != expected_uid or entry_stat.st_gid != expected_gid:
    raise SystemExit("pnpm project registration ownership is not exact")

raw_target = os.readlink(entry.path)
if os.path.isabs(raw_target):
    target = os.path.normpath(raw_target)
else:
    target = os.path.normpath(os.path.join(registry_root, raw_target))
target = os.path.abspath(target)

if registration_kind == "exact":
    expected_target = os.path.abspath(os.path.normpath(expected_root))
    if target != expected_target or os.path.realpath(entry.path) != expected_target:
        raise SystemExit("pnpm project registration target is not exact")
elif registration_kind == "untrusted-staging":
    output_root = os.path.abspath(os.path.normpath(expected_root))
    target_name = os.path.basename(target)
    prefix = f".{expected_sha}.untrusted-test-staging."
    suffix = target_name[len(prefix):] if target_name.startswith(prefix) else ""
    if (
        os.path.dirname(target) != output_root
        or len(suffix) != 6
        or not suffix.isascii()
        or not suffix.isalnum()
    ):
        raise SystemExit("pnpm project registration escaped the disposable staging namespace")
else:
    raise SystemExit("unknown pnpm project registration assertion mode")

expected_name = hashlib.sha256(target.encode("utf-8")).hexdigest()[:32]
if entry.name != expected_name:
    raise SystemExit("pnpm project registration name is not bound to its target")
PY
}

store_authority_parent='/srv/leetplus-ci-runtime-hydration'
store_authority_root="${store_authority_parent}/${release_sha}"
output_authority_parent='/srv/leetplus-ci-runtime-output'
[[ "$work_root" == "${output_authority_parent}/${release_sha}" ]] \
  || die 'work root is outside the fixed root-controlled CI output authority'
home_root="${work_root}/home"
tool_root="${store_authority_root}/tools"
store_root="${store_authority_root}/store"
store_version_root="${store_root}/v10"
project_registry_root="${store_version_root}/projects"
input_root="${store_authority_root}/inputs"
release_output_root="${work_root}/releases"
[[ -d /srv && ! -L /srv && "$(/usr/bin/realpath -e -- /srv)" == '/srv' \
  && "$(/usr/bin/stat -c '%u:%g' -- /srv)" == '0:0' \
  && "$((8#$(/usr/bin/stat -c '%a' -- /srv) & 8#22))" == '0' ]] \
  || die '/srv is not an exact root-controlled authority ancestor'
for authority_parent in "$store_authority_parent" "$output_authority_parent"; do
  [[ ! -L "$authority_parent" ]] \
    || die "fixed CI authority parent is a symlink: ${authority_parent}"
  if [[ ! -e "$authority_parent" ]]; then
    /usr/bin/install -d -o root -g root -m 0755 -- "$authority_parent"
  fi
  [[ -d "$authority_parent" && ! -L "$authority_parent" \
    && "$(/usr/bin/realpath -e -- "$authority_parent")" == "$authority_parent" \
    && "$(/usr/bin/stat -c '%u:%g:%a' -- "$authority_parent")" == '0:0:755' ]] \
    || die "fixed CI authority parent is not exact root:root 0755: ${authority_parent}"
done
[[ ! -e "$store_authority_root" && ! -L "$store_authority_root" ]] \
  || die 'exact CI store authority operation already exists'
[[ ! -e "$work_root" && ! -L "$work_root" ]] \
  || die 'exact CI output authority operation already exists'
/usr/bin/install -d -o "$build_user" -g "$build_group" -m 0700 -- "$work_root"
work_root_created=true
[[ "$(/usr/bin/realpath -e -- "$work_root")" == "$work_root" ]] \
  || die 'created work root is not canonical'
/usr/bin/install -d -o "$build_user" -g "$build_group" -m 0700 -- "$home_root"
/usr/bin/install -d -o "$build_user" -g "$build_group" -m 0750 -- "$release_output_root"
/usr/bin/install -d \
  -o "$build_user" -g "$build_group" -m 0700 -- \
  "$store_authority_root"
store_authority_root_created=true
/usr/bin/install -d -o root -g "$build_group" -m 0550 -- "$tool_root"
/usr/bin/install -d -o "$build_user" -g "$build_group" -m 0700 -- "$store_root"
/usr/bin/install -d -o root -g "$build_group" -m 0550 -- "$input_root"
artifact_snapshot="${input_root}/leetplus-release-${release_sha}.tar.gz"
artifact_sha256_snapshot="${artifact_snapshot}.sha256"
stager_snapshot="${tool_root}/stage-release-artifact.sh"
extractor_snapshot="${tool_root}/extract-runtime-release-artifact.py"
runtime_verifier_snapshot="${tool_root}/verify-runtime-release-artifact.mjs"
pnpm_runtime_root="${tool_root}/pnpm-runtime"
pnpm_entry_snapshot="${pnpm_runtime_root}/bin/pnpm.cjs"
pnpm_command="${tool_root}/pnpm"
pinned_lockfile="${store_authority_root}/PINNED_PNPM_LOCKFILE"
source_node_sha256="$(snapshot_regular_file \
  "$node_path" "${tool_root}/node" 268435456 0550)"
source_stager_sha256="$(snapshot_regular_file \
  "$stager" "$stager_snapshot" 4194304 0550 \
  "$RELEASE_STAGER_AUTHORITY_SHA256")"
snapshot_regular_file \
  "$extractor" "$extractor_snapshot" 1048576 0440 \
  "$RUNTIME_EXTRACTOR_AUTHORITY_SHA256" \
  >/dev/null
snapshot_regular_file \
  "$runtime_verifier" "$runtime_verifier_snapshot" 1048576 0440 \
  "$RUNTIME_VERIFIER_AUTHORITY_SHA256" \
  >/dev/null
/usr/bin/install -d -o root -g "$build_group" -m 0750 -- "$pnpm_runtime_root"
pnpm_source_inventory="${store_authority_root}/.pnpm-source-inventory"
/usr/bin/find -P "$pnpm_package_root" -mindepth 1 -print0 \
  > "$pnpm_source_inventory" \
  || die 'exact pnpm package inventory failed'
pnpm_tree_entry_count=0
pnpm_tree_total_bytes=0
source_pnpm_sha256=''
while IFS= read -r -d '' pnpm_source_entry; do
  pnpm_relative_entry="${pnpm_source_entry#"${pnpm_package_root}/"}"
  [[ -n "$pnpm_relative_entry" \
    && "$pnpm_relative_entry" != "$pnpm_source_entry" ]] \
    || die 'exact pnpm package inventory escaped its source root'
  pnpm_destination_entry="${pnpm_runtime_root}/${pnpm_relative_entry}"
  pnpm_tree_entry_count=$((pnpm_tree_entry_count + 1))
  ((pnpm_tree_entry_count <= 5000)) \
    || die 'exact pnpm package inventory exceeds its entry bound'
  [[ "$(/usr/bin/stat -c '%u' -- "$pnpm_source_entry")" == "$runner_uid" ]] \
    || die 'exact pnpm package entry has an unexpected owner'
  pnpm_source_mode="$(/usr/bin/stat -c '%a' -- "$pnpm_source_entry")"
  [[ "$pnpm_source_mode" =~ ^[0-7]{3,4}$ ]] \
    || die 'exact pnpm package entry has an invalid mode'
  if [[ -d "$pnpm_source_entry" && ! -L "$pnpm_source_entry" ]]; then
    /usr/bin/install -d \
      -o root -g "$build_group" -m 0750 -- "$pnpm_destination_entry"
  elif [[ -f "$pnpm_source_entry" && ! -L "$pnpm_source_entry" ]]; then
    pnpm_source_size="$(/usr/bin/stat -c '%s' -- "$pnpm_source_entry")"
    [[ "$pnpm_source_size" =~ ^[0-9]+$ ]] \
      || die 'exact pnpm package file has an invalid size'
    pnpm_tree_total_bytes=$((pnpm_tree_total_bytes + pnpm_source_size))
    ((pnpm_source_size <= 67108864 && pnpm_tree_total_bytes <= 268435456)) \
      || die 'exact pnpm package tree exceeds its byte bound'
    /usr/bin/install -d -o root -g "$build_group" -m 0750 -- \
      "$(/usr/bin/dirname -- "$pnpm_destination_entry")"
    pnpm_destination_mode=0440
    if (( (8#$pnpm_source_mode & 8#111) != 0 )); then
      pnpm_destination_mode=0550
    fi
    pnpm_source_digest="$(snapshot_regular_file \
      "$pnpm_source_entry" "$pnpm_destination_entry" 67108864 \
      "$pnpm_destination_mode" '' true true)"
    if [[ "$pnpm_source_entry" == "$pnpm_package_entrypoint" ]]; then
      source_pnpm_sha256="$pnpm_source_digest"
    fi
  else
    die 'exact pnpm package tree contains a link or special entry'
  fi
done < "$pnpm_source_inventory"
/usr/bin/rm -f -- "$pnpm_source_inventory"
[[ "$pnpm_tree_entry_count" -gt 0 \
  && "$pnpm_tree_total_bytes" -gt 0 \
  && "$source_pnpm_sha256" =~ ^[0-9a-f]{64}$ \
  && -f "$pnpm_entry_snapshot" \
  && -f "${pnpm_runtime_root}/dist/pnpm.cjs" \
  && -f "${pnpm_runtime_root}/package.json" ]] \
  || die 'exact pnpm package snapshot is incomplete'
printf '#!/usr/bin/bash -p\nexec "%s" "%s" "$@"\n' \
  "${tool_root}/node" "$pnpm_entry_snapshot" > "$pnpm_command"
/usr/bin/chown "0:${build_gid}" -- "$pnpm_command"
/usr/bin/chmod 0550 -- "$pnpm_command"
source_lockfile_sha256="$(snapshot_regular_file \
  "${repository_root}/pnpm-lock.yaml" "$pinned_lockfile" 33554432 0440)"
source_artifact_sha256="$(snapshot_regular_file \
  "$artifact" "$artifact_snapshot" 1073741824 0440)"
source_checksum_sha256="$(snapshot_regular_file \
  "$artifact_sha256" "$artifact_sha256_snapshot" 4096 0440)"

/usr/bin/bash -n "$stager_snapshot" \
  || die 'reviewed release stager snapshot has invalid Bash syntax'
[[ "$(/usr/bin/env -i PATH=/usr/bin:/bin "${tool_root}/node" \
  -p 'process.versions.node.split(".")[0]')" == '22' ]] \
  || die 'root-snapshotted Node runtime is not major 22'

reference_root="${store_authority_root}/reference"
reference_manifest="${store_authority_root}/ROOT_SOURCE_SHA256SUMS"
[[ ! -e "$reference_root" && ! -L "$reference_root" ]] \
  || die 'reference extraction root unexpectedly exists'
/usr/bin/install -d \
  -o "$build_user" -g "$build_group" -m 0700 -- "$reference_root"
[[ -d "$reference_root" && ! -L "$reference_root" \
  && "$(/usr/bin/realpath -e -- "$reference_root")" == "$reference_root" \
  && "$(/usr/bin/stat -c '%u:%g:%a' -- "$reference_root")" == \
    "${build_uid}:${build_gid}:700" ]] \
  || die 'reference extraction root is not exact private build authority'
/usr/sbin/runuser -u "$build_user" -- /usr/bin/env -i \
  PATH=/usr/bin:/bin \
  LANG=C.UTF-8 \
  LC_ALL=C.UTF-8 \
  TZ=UTC \
  /usr/bin/python3 -I -S -E "$extractor_snapshot" \
    --archive "$artifact_snapshot" \
    --archive-owner-uid 0 \
    --destination "$reference_root" \
  || die 'root controller rejected the release archive during safe extraction'
assert_build_uid_quiescent
/usr/bin/env -i \
  PATH="${tool_root}:/usr/bin:/bin" \
  LANG=C.UTF-8 \
  LC_ALL=C.UTF-8 \
  TZ=UTC \
  "${tool_root}/node" "$runtime_verifier_snapshot" \
    --release-root "$reference_root" \
    --expected-release-sha "$release_sha" \
  || die 'root controller rejected the exact runtime artifact identity'
/usr/bin/install -o root -g "$build_group" -m 0440 -- \
  "${reference_root}/SHA256SUMS" "$reference_manifest"
[[ -f "$reference_manifest" && ! -L "$reference_manifest" \
  && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$reference_manifest")" == \
    "0:${build_gid}:440:1" ]] \
  || die 'root-controlled source manifest snapshot is unsafe'
reference_lockfile_sha256="$(/usr/bin/sha256sum -- "${reference_root}/pnpm-lock.yaml")"
reference_lockfile_sha256="${reference_lockfile_sha256%% *}"
[[ "$reference_lockfile_sha256" == "$source_lockfile_sha256" ]] \
  || die 'verified release lockfile differs from the exact checkout'

tool_path="${tool_root}:/usr/bin:/bin"
for runner_owned_input in "$repository_root" "$artifact" "$artifact_sha256" \
  "$pnpm_path" "$pnpm_package_root"; do
  if /usr/sbin/runuser -u "$build_user" -- /usr/bin/test -w "$runner_owned_input"; then
    die "ephemeral CI hydration identity can write a runner-owned input: ${runner_owned_input}"
  fi
done
for runtime_manifest in \
  package.json pnpm-workspace.yaml \
  apps/api/package.json apps/web/package.json packages/database/package.json; do
  [[ -f "${reference_root}/${runtime_manifest}" \
    && ! -L "${reference_root}/${runtime_manifest}" \
    && -f "${repository_root}/${runtime_manifest}" \
    && ! -L "${repository_root}/${runtime_manifest}" ]] \
    || die "runtime package manifest is absent or unsafe: ${runtime_manifest}"
  /usr/bin/cmp --silent -- \
    "${reference_root}/${runtime_manifest}" \
    "${repository_root}/${runtime_manifest}" \
    || die "runtime package manifest differs from the exact checkout: ${runtime_manifest}"
done
[[ "$(/usr/sbin/runuser -u "$build_user" -- /usr/bin/env -i \
  PATH="$tool_path" HOME="$home_root" \
  LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC \
  /usr/bin/bash --noprofile --norc -p -c '
    cd -- "$1"
    shift
    exec "$@"
  ' ci-pnpm-version "$home_root" "$pnpm_command" --version)" == '10.33.2' ]] \
  || die 'exact pnpm runtime is not version 10.33.2'

/usr/sbin/runuser -u "$build_user" -- /usr/bin/env -i \
    PATH="$tool_path" \
    HOME="$home_root" \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TZ=UTC \
    CI=true \
    GITHUB_ACTIONS=true \
    /usr/bin/bash --noprofile --norc -p -c '
      cd -- "$1"
      shift
      exec "$@"
    ' ci-fetch "$reference_root" "$pnpm_command" \
      fetch --prod --frozen-lockfile --ignore-scripts \
        --package-import-method=copy --store-dir "$store_root" \
  || die 'fresh exact-lockfile production dependency fetch failed'
assert_build_uid_quiescent
[[ -d "$reference_root" && ! -L "$reference_root" \
  && "$(/usr/bin/realpath -e -- "$reference_root")" == "$reference_root" \
  && "$(/usr/bin/stat -c '%u:%g:%a' -- "$reference_root")" == \
    "${build_uid}:${build_gid}:700" ]] \
  || die 'exact-lockfile fetch source root became unsafe'
if [[ -e "${reference_root}/node_modules" \
  || -L "${reference_root}/node_modules" ]]; then
  [[ -d "${reference_root}/node_modules" \
    && ! -L "${reference_root}/node_modules" ]] \
    || die 'exact-lockfile fetch created an unsafe virtual store root'
  /usr/bin/rm -rf -- "${reference_root}/node_modules"
fi
/usr/bin/cmp --silent -- \
  "${reference_root}/SHA256SUMS" "$reference_manifest" \
  || die 'exact-lockfile fetch mutated the source manifest'
/usr/bin/env -i \
  PATH="${tool_root}:/usr/bin:/bin" \
  LANG=C.UTF-8 \
  LC_ALL=C.UTF-8 \
  TZ=UTC \
  "${tool_root}/node" "$runtime_verifier_snapshot" \
    --release-root "$reference_root" \
    --expected-release-sha "$release_sha" \
  || die 'exact-lockfile fetch mutated the verified release source'
[[ -d "$store_version_root" && ! -L "$store_version_root" \
  && "$(/usr/bin/realpath -e -- "$store_version_root")" == "$store_version_root" ]] \
  || die 'pinned pnpm did not create its exact v10 store layout'
assert_exact_pnpm_project_registration \
  "$project_registry_root" exact "$reference_root" \
  || die 'pinned pnpm fetch created an unexpected project registration'
/usr/bin/rm -rf -- "$project_registry_root"
[[ ! -e "$project_registry_root" && ! -L "$project_registry_root" ]] \
  || die 'temporary pnpm fetch project registration did not retire'

prewarm_parent_paths=(
  "$reference_root"
  "${reference_root}/apps/api"
  "${reference_root}/apps/web"
  "${reference_root}/packages/database"
)
prewarm_parent_modes=()
for prewarm_parent in "${prewarm_parent_paths[@]}"; do
  [[ -d "$prewarm_parent" && ! -L "$prewarm_parent" \
    && "$(/usr/bin/realpath -e -- "$prewarm_parent")" == "$prewarm_parent" \
    && "$(/usr/bin/stat -c '%u:%g' -- "$prewarm_parent")" == \
      "${build_uid}:${build_gid}" ]] \
    || die "dependency prewarm parent is absent or unsafe: ${prewarm_parent}"
  prewarm_parent_mode="$(/usr/bin/stat -c '%a' -- "$prewarm_parent")"
  [[ "$prewarm_parent_mode" =~ ^[0-7]{3,4}$ \
    && "$((8#$prewarm_parent_mode & 8#22))" == '0' ]] \
    || die "dependency prewarm parent has unsafe metadata: ${prewarm_parent}"
  prewarm_parent_modes+=("$prewarm_parent_mode")
  /usr/bin/chmod u+w -- "$prewarm_parent"
done

/usr/sbin/runuser -u "$build_user" -- /usr/bin/env -i \
    PATH="$tool_path" \
    HOME="$home_root" \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TZ=UTC \
    CI=true \
    GITHUB_ACTIONS=true \
    /usr/bin/bash --noprofile --norc -p -c '
      cd -- "$1"
      shift
      exec "$@"
    ' ci-prewarm "$reference_root" "$pnpm_command" \
      install --prod --offline --frozen-lockfile --side-effects-cache \
        --package-import-method=copy --store-dir "$store_root" \
  || die 'reviewed production dependency side-effect prewarm failed'
assert_build_uid_quiescent

prewarmed_prisma_engine_root="${reference_root}/node_modules/.pnpm/@prisma+engines@6.19.3/node_modules/@prisma/engines"
prewarmed_prisma_schema_engine="${prewarmed_prisma_engine_root}/schema-engine-debian-openssl-3.0.x"
prewarmed_prisma_query_engine="${prewarmed_prisma_engine_root}/libquery_engine-debian-openssl-3.0.x.so.node"
for prewarmed_engine in \
  "$prewarmed_prisma_schema_engine" "$prewarmed_prisma_query_engine"; do
  [[ -f "$prewarmed_engine" && ! -L "$prewarmed_engine" \
    && "$(/usr/bin/stat -c '%u:%g:%h' -- "$prewarmed_engine")" == \
      "${build_uid}:${build_gid}:1" ]] \
    || die "reviewed dependency prewarm did not materialize an exact Prisma engine: ${prewarmed_engine}"
  prewarmed_engine_size="$(/usr/bin/stat -c '%s' -- "$prewarmed_engine")"
  [[ "$prewarmed_engine_size" =~ ^[1-9][0-9]*$ \
    && "$prewarmed_engine_size" -le 134217728 ]] \
    || die "prewarmed Prisma engine size is outside its bound: ${prewarmed_engine}"
done
prewarmed_prisma_schema_sha256="$(/usr/bin/sha256sum -- "$prewarmed_prisma_schema_engine")"
prewarmed_prisma_schema_sha256="${prewarmed_prisma_schema_sha256%% *}"
prewarmed_prisma_query_sha256="$(/usr/bin/sha256sum -- "$prewarmed_prisma_query_engine")"
prewarmed_prisma_query_sha256="${prewarmed_prisma_query_sha256%% *}"
prisma_engine_authority_root="${store_root}/.leetplus-tools/prisma-engines/6.19.3/debian-openssl-3.0.x"
/usr/bin/install -d -o root -g "$build_group" -m 0550 -- \
  "$prisma_engine_authority_root"
/usr/bin/install -o root -g "$build_group" -m 0440 -- \
  "$prewarmed_prisma_schema_engine" \
  "${prisma_engine_authority_root}/schema-engine"
/usr/bin/install -o root -g "$build_group" -m 0440 -- \
  "$prewarmed_prisma_query_engine" \
  "${prisma_engine_authority_root}/libquery_engine-debian-openssl-3.0.x.so.node"
[[ "$(/usr/bin/sha256sum -- "${prisma_engine_authority_root}/schema-engine")" == \
    "${prewarmed_prisma_schema_sha256}  ${prisma_engine_authority_root}/schema-engine" \
  && "$(/usr/bin/sha256sum -- "${prisma_engine_authority_root}/libquery_engine-debian-openssl-3.0.x.so.node")" == \
    "${prewarmed_prisma_query_sha256}  ${prisma_engine_authority_root}/libquery_engine-debian-openssl-3.0.x.so.node" ]] \
  || die 'sealed Prisma engine authority differs from reviewed prewarm output'

for prewarm_module_root in \
  "${reference_root}/node_modules" \
  "${reference_root}/apps/api/node_modules" \
  "${reference_root}/apps/web/node_modules" \
  "${reference_root}/packages/database/node_modules"; do
  if [[ -e "$prewarm_module_root" || -L "$prewarm_module_root" ]]; then
    [[ -d "$prewarm_module_root" && ! -L "$prewarm_module_root" ]] \
      || die "dependency prewarm produced an unsafe module root: ${prewarm_module_root}"
    /usr/bin/rm -rf -- "$prewarm_module_root"
  fi
done
for prewarm_index in "${!prewarm_parent_paths[@]}"; do
  /usr/bin/chmod "${prewarm_parent_modes[$prewarm_index]}" -- \
    "${prewarm_parent_paths[$prewarm_index]}"
done

/usr/bin/cmp --silent -- \
  "${reference_root}/SHA256SUMS" "$reference_manifest" \
  || die 'dependency side-effect prewarm mutated the source manifest'
/usr/bin/env -i \
  PATH="${tool_root}:/usr/bin:/bin" \
  LANG=C.UTF-8 \
  LC_ALL=C.UTF-8 \
  TZ=UTC \
  "${tool_root}/node" "$runtime_verifier_snapshot" \
    --release-root "$reference_root" \
    --expected-release-sha "$release_sha" \
  || die 'dependency side-effect prewarm mutated the verified release source'
assert_exact_pnpm_project_registration \
  "$project_registry_root" exact "$reference_root" \
  || die 'dependency side-effect prewarm created an unexpected project registration'
/usr/bin/rm -rf -- "$project_registry_root"
[[ ! -e "$project_registry_root" && ! -L "$project_registry_root" ]] \
  || die 'temporary dependency prewarm project registration did not retire'
/usr/bin/rm -rf -- "$reference_root"
printf 'CI_PNPM_FETCH_SOURCE_INTEGRITY=PASS\n'
printf 'CI_PNPM_APPROVED_SIDE_EFFECTS=PREWARMED_EXACT\n'

find_has_match -P "$store_root" -mindepth 1 \
  || die 'fresh CI pnpm store is empty'
if find_has_match -P "$store_root" ! -type d ! -type f; then
  die 'fresh CI pnpm store contains a link or special entry'
fi
if find_has_match -P "$store_root" -type f -links +1; then
  die 'fresh CI pnpm store contains a multiply-linked file'
fi

store_manifest_before="${store_authority_root}/STORE_SHA256SUMS"
(
  cd -- "$store_root"
  /usr/bin/find -P . -type f -print0 \
    | LC_ALL=C /usr/bin/sort -z \
    | /usr/bin/xargs -0 /usr/bin/sha256sum --text
) > "$store_manifest_before"
/usr/bin/find -P "$store_root" -type d -exec /usr/bin/chmod 0550 -- {} +
/usr/bin/find -P "$store_root" -type f -exec /usr/bin/chmod 0440 -- {} +
/usr/bin/find -P "$pnpm_runtime_root" -type d \
  -exec /usr/bin/chmod 0550 -- {} +
/usr/bin/chmod 0440 -- "$store_manifest_before"
/usr/bin/chmod 0440 -- "$pinned_lockfile"
/usr/bin/chmod 0550 -- \
  "$tool_root" "${tool_root}/node" "$stager_snapshot" \
  "$pnpm_entry_snapshot" "$pnpm_command"
/usr/bin/chmod 0550 -- "$store_authority_root"
/usr/bin/chown -hR "0:${build_gid}" -- "$store_authority_root"
copied_node_sha256="$(/usr/bin/sha256sum -- "${tool_root}/node")"
copied_node_sha256="${copied_node_sha256%% *}"
copied_stager_sha256="$(/usr/bin/sha256sum -- "$stager_snapshot")"
copied_stager_sha256="${copied_stager_sha256%% *}"
copied_pnpm_sha256="$(/usr/bin/sha256sum -- "$pnpm_entry_snapshot")"
copied_pnpm_sha256="${copied_pnpm_sha256%% *}"
copied_lockfile_sha256="$(/usr/bin/sha256sum -- "$pinned_lockfile")"
copied_lockfile_sha256="${copied_lockfile_sha256%% *}"
copied_artifact_sha256="$(/usr/bin/sha256sum -- "$artifact_snapshot")"
copied_artifact_sha256="${copied_artifact_sha256%% *}"
copied_checksum_sha256="$(/usr/bin/sha256sum -- "$artifact_sha256_snapshot")"
copied_checksum_sha256="${copied_checksum_sha256%% *}"
[[ "$(/usr/bin/stat -c '%u:%g:%a' -- "$store_authority_parent")" == '0:0:755' \
  && "$(/usr/bin/stat -c '%u:%g:%a' -- "$store_authority_root")" == "0:${build_gid}:550" \
  && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$store_manifest_before")" == "0:${build_gid}:440:1" \
  && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "${tool_root}/node")" == "0:${build_gid}:550:1" \
  && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$stager_snapshot")" == "0:${build_gid}:550:1" \
  && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$pnpm_entry_snapshot")" == "0:${build_gid}:550:1" \
  && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$pnpm_command")" == "0:${build_gid}:550:1" \
  && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$pinned_lockfile")" == "0:${build_gid}:440:1" \
  && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$artifact_snapshot")" == "0:${build_gid}:440:1" \
  && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$artifact_sha256_snapshot")" == "0:${build_gid}:440:1" \
  && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$reference_manifest")" == "0:${build_gid}:440:1" \
  && "$copied_node_sha256" == "$source_node_sha256" \
  && "$copied_stager_sha256" == "$source_stager_sha256" \
  && "$copied_pnpm_sha256" == "$source_pnpm_sha256" \
  && "$copied_lockfile_sha256" == "$source_lockfile_sha256" \
  && "$copied_artifact_sha256" == "$source_artifact_sha256" \
  && "$copied_checksum_sha256" == "$source_checksum_sha256" ]] \
  || die 'fresh CI pnpm store did not freeze as exact root-owned read-only input'
if find_has_match -P "$store_root" -mindepth 0 ! -user root \
  || find_has_match -P "$store_root" -mindepth 0 ! -gid "$build_gid" \
  || find_has_match -P "$store_root" -type d ! -perm 0550 \
  || find_has_match -P "$store_root" -type f ! -perm 0440; then
  die 'fresh CI pnpm store tree metadata is not exact'
fi
if find_has_match -P "$pnpm_runtime_root" -mindepth 0 ! -user root \
  || find_has_match -P "$pnpm_runtime_root" -mindepth 0 ! -gid "$build_gid" \
  || find_has_match -P "$pnpm_runtime_root" -type d ! -perm 0550 \
  || find_has_match -P "$pnpm_runtime_root" -type f \
    ! -perm 0440 ! -perm 0550; then
  die 'exact pnpm runtime tree metadata is not frozen'
fi

/usr/bin/install -d \
  -o "$build_user" -g "$build_group" -m 0700 -- "$project_registry_root"
[[ -d "$project_registry_root" && ! -L "$project_registry_root" \
  && "$(/usr/bin/realpath -e -- "$project_registry_root")" == "$project_registry_root" \
  && "$(/usr/bin/stat -c '%u:%g:%a' -- "$project_registry_root")" == \
    "${build_uid}:${build_gid}:700" ]] \
  || die 'isolated pnpm project registry metadata is not exact'
if find_has_match -P "$project_registry_root" -mindepth 1; then
  die 'isolated pnpm project registry did not start empty'
fi
/usr/sbin/runuser -u "$build_user" -- /usr/bin/test -w "$project_registry_root" \
  || die 'ephemeral hydration identity cannot write its isolated pnpm project registry'

for frozen_path in "$store_root" "$stager_snapshot" "${tool_root}/node" \
  "$pnpm_runtime_root" "$pnpm_entry_snapshot" "$pnpm_command" \
  "$pnpm_path" "$pnpm_package_root" \
  "$artifact_snapshot" "$artifact_sha256_snapshot" "$reference_manifest"; do
  if /usr/sbin/runuser -u "$build_user" -- /usr/bin/test -w "$frozen_path"; then
    die "ephemeral CI hydration identity can write frozen authority input: ${frozen_path}"
  fi
done

run_hydration_and_verify() {
  assert_build_uid_quiescent
  hydration_unit_name="leetplus-ci-runtime-hydrate-${release_sha:0:16}.service"
  [[ "$(/usr/bin/systemctl show --property=LoadState --value "$hydration_unit_name")" == \
    'not-found' ]] \
    || die 'ephemeral CI hydration unit name is already loaded'
  # For transient D-Bus units, the unit-file literal `none` is represented by
  # an empty address-family array; `none` as an array member is invalid.
  /usr/bin/systemd-run --quiet --wait --pipe --service-type=exec \
    --unit="$hydration_unit_name" \
    --property="User=${build_user}" \
    --property="Group=${build_group}" \
    --property=KillMode=control-group \
    --property=NoNewPrivileges=yes \
    --property=CapabilityBoundingSet= \
    --property=AmbientCapabilities= \
    --property=PrivateDevices=yes \
    --property=PrivateTmp=yes \
    --property=PrivateNetwork=yes \
    --property=RestrictAddressFamilies= \
    --property=IPAddressDeny=any \
    --property=ProtectSystem=strict \
    --property=ProtectHome=read-only \
    --property="ReadOnlyPaths=${repository_root}" \
    --property="ReadOnlyPaths=${store_authority_root}" \
    --property="ReadWritePaths=${project_registry_root}" \
    --property="ReadWritePaths=${work_root}" \
    --property=ProtectKernelTunables=yes \
    --property=ProtectKernelModules=yes \
    --property=ProtectKernelLogs=yes \
    --property=ProtectControlGroups=yes \
    --property=LockPersonality=yes \
    --property=RestrictSUIDSGID=yes \
    --property=RestrictRealtime=yes \
    --property=TasksMax=512 \
    --property=MemoryHigh=1610612736 \
    --property=MemoryMax=2147483648 \
    --property=MemorySwapMax=0 \
    --property=CPUQuota=200% \
    --property=LimitFSIZE=1073741824 \
    --property=LimitNOFILE=4096 \
    --property=RuntimeMaxSec=700 \
    --property=UMask=0077 \
    --property=WorkingDirectory=/ \
    /usr/bin/env -i \
      PATH="$tool_path" \
      LANG=C.UTF-8 \
      LC_ALL=C.UTF-8 \
      TZ=UTC \
      /usr/bin/bash -p "$stager_snapshot" \
      --release-sha "$release_sha" \
      --artifact "$artifact_snapshot" \
      --artifact-sha256 "$artifact_sha256_snapshot" \
      --output-root "$release_output_root" \
      --pnpm-store-dir "$store_root" \
      --hydrate \
      --unprivileged-test-mode \
    || die 'production-parity disposable runtime hydration failed'
  assert_build_uid_quiescent
  /usr/bin/systemctl reset-failed "$hydration_unit_name" >/dev/null 2>&1 || true

  assert_exact_pnpm_project_registration \
    "$project_registry_root" untrusted-staging "$release_output_root" "$release_sha" \
    || die 'offline hydration created an unexpected pnpm project registration'
  /usr/bin/rm -rf -- "$project_registry_root"
  [[ ! -e "$project_registry_root" && ! -L "$project_registry_root" ]] \
    || die 'isolated pnpm project registry did not retire after hydration'
  if find_has_match -P "$store_root" ! -type d ! -type f \
    || find_has_match -P "$store_root" -type f -links +1 \
    || find_has_match -P "$store_root" -mindepth 0 ! -user root \
    || find_has_match -P "$store_root" -mindepth 0 ! -gid "$build_gid" \
    || find_has_match -P "$store_root" -type d ! -perm 0550 \
    || find_has_match -P "$store_root" -type f ! -perm 0440; then
    die 'offline hydration changed frozen pnpm package-store topology or metadata'
  fi

  store_manifest_after="$(/usr/bin/mktemp "${work_root}/.pnpm-store.after.XXXXXX")"
  (
    cd -- "$store_root"
    /usr/bin/find -P . -type f -print0 \
      | LC_ALL=C /usr/bin/sort -z \
      | /usr/bin/xargs -0 /usr/bin/sha256sum --text
  ) > "$store_manifest_after"
  /usr/bin/cmp --silent -- "$store_manifest_before" "$store_manifest_after" \
    || die 'production-parity hydration mutated its frozen dependency store'
  /usr/bin/chmod 0400 -- "$store_manifest_after"

  hydrated_release="${release_output_root}/.untrusted-test-${release_sha}"
  [[ -d "$hydrated_release" && ! -L "$hydrated_release" \
    && "$(/usr/bin/realpath -e -- "$hydrated_release")" == "$hydrated_release" ]] \
    || die 'hydrated disposable release directory is absent or unsafe'
  [[ "$(< "${hydrated_release}/UNTRUSTED_TEST_STAGE")" == \
    $'UNTRUSTED_TEST_STAGE_VERSION=1\nRELEASE_SHA='"${release_sha}" ]] \
    || die 'hydrated release lacks the exact non-deployable marker'
  [[ -s "${hydrated_release}/HYDRATED_SHA256SUMS" \
    && -s "${hydrated_release}/HYDRATED_SYMLINKS.json" \
    && -d "${hydrated_release}/node_modules" ]] \
    || die 'hydrated release is incomplete'
  mapfile -d '' -t hydrated_prisma_query_engines < <(
    /usr/bin/find -P "${hydrated_release}/node_modules/.pnpm" -xdev \
      -path '*/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node' \
      -type f -print0
  )
  ((${#hydrated_prisma_query_engines[@]} == 1)) \
    || die 'offline hydration did not produce exactly one Prisma client query engine'
  hydrated_prisma_query_engine="${hydrated_prisma_query_engines[0]}"
  [[ -f "$hydrated_prisma_query_engine" && ! -L "$hydrated_prisma_query_engine" \
    && "$(/usr/bin/stat -c '%u:%g:%h' -- "$hydrated_prisma_query_engine")" == \
      "${build_uid}:${build_gid}:1" ]] \
    || die 'offline hydration produced an unsafe Prisma client query engine'
  hydrated_prisma_query_sha256="$(/usr/bin/sha256sum -- "$hydrated_prisma_query_engine")" \
    || die 'offline hydration did not materialize the sealed Prisma query engine'
  hydrated_prisma_query_sha256="${hydrated_prisma_query_sha256%% *}"
  [[ "$hydrated_prisma_query_sha256" == "$prewarmed_prisma_query_sha256" ]] \
    || die 'offline hydration Prisma client differs from the sealed engine authority'
  [[ ! -e "${hydrated_release}/node_modules/.leetplus-prisma-engine-authority" \
    && ! -L "${hydrated_release}/node_modules/.leetplus-prisma-engine-authority" ]] \
    || die 'ephemeral Prisma engine input survived offline hydration'
  hydrated_lockfile_sha256="$(/usr/bin/sha256sum -- "${hydrated_release}/pnpm-lock.yaml")"
  hydrated_lockfile_sha256="${hydrated_lockfile_sha256%% *}"
  [[ "$hydrated_lockfile_sha256" == "$source_lockfile_sha256" ]] \
    || die 'hydrated release lockfile differs from the pre-execution exact checkout'
  (
    cd -- "$hydrated_release"
    /usr/bin/sha256sum --strict --check --quiet "$reference_manifest"
    /usr/bin/sha256sum --strict --check --quiet SHA256SUMS
    /usr/bin/sha256sum --strict --check --quiet HYDRATED_SHA256SUMS
  ) || die 'root controller rejected hydrated release digest identity'
  assert_build_uid_quiescent

  /usr/bin/chown -hR "${runner_uid}:${runner_gid}" -- "$work_root"
  [[ "$(/usr/bin/stat -c '%u:%g:%a' -- "$work_root")" == \
    "${runner_uid}:${runner_gid}:700" \
    && "$(/usr/bin/stat -c '%u:%g' -- "$hydrated_release")" == \
      "${runner_uid}:${runner_gid}" ]] \
    || die 'root controller failed to transfer the verified disposable output to the caller'

  retain_verified_output=true
  cleanup_ci_authority
  set -e
  trap - EXIT HUP INT TERM
  build_user_created=false
  build_group_created=false
  [[ ! -e "$store_authority_root" && ! -L "$store_authority_root" \
    && -z "$(/usr/bin/getent passwd "$build_user" || true)" \
    && -z "$(/usr/bin/getent group "$build_group" || true)" ]] \
    || die 'ephemeral CI hydration authority did not cleanly retire'

  printf 'CI_RUNTIME_HYDRATION=PASS\n'
  printf 'CI_RUNTIME_BUILD_IDENTITY=EPHEMERAL_NOLOGIN_NO_SUDO\n'
  printf 'CI_RUNTIME_DEPENDENCY_INSTALL=OFFLINE_FROZEN_IGNORE_SCRIPTS_COPY\n'
  printf 'CI_RUNTIME_PRISMA_ENGINES=SEALED_STORE_AUTHORITY_REUSED_WITHOUT_HOME_CACHE\n'
  printf 'CI_RUNTIME_PNPM_PACKAGE_STORE_MUTATED=false\n'
  printf 'CI_RUNTIME_PNPM_PROJECT_REGISTRY=EPHEMERAL_ISOLATED_REMOVED\n'
  printf 'CI_HYDRATED_RELEASE_DIRECTORY=%s\n' "$hydrated_release"
}

run_hydration_and_verify
