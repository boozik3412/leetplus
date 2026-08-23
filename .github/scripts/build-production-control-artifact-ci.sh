#!/usr/bin/bash -p

# Build one deterministic production-control archive from exact Git objects,
# validate its tar headers before extraction, then validate a root-owned
# extraction with the verifier shipped inside the artifact. This is a CI-only
# fixture: it never installs control bytes or mutates a runtime.

case "$-" in
  *p*) ;;
  *)
    printf 'build-production-control-artifact-ci: execute with /usr/bin/bash -p\n' >&2
    exit 1
    ;;
esac

set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly RELEASE_SHA_PATTERN='^[0-9a-f]{40}$'
readonly ALLOWLIST_PATH='docs/deployment/production-control-authority/production-control-payload.allowlist'
readonly VERIFIER_PATH='docs/deployment/production-control-authority/verify-production-control-artifact.mjs'
readonly INNER_MANIFEST_PATH='docs/deployment/production-artifact/CONTROL_BUNDLE_SHA256SUMS'
readonly CLEAN_PATH='/usr/sbin:/usr/bin:/sbin:/bin'
readonly FIXTURE_CONFIRMATION='build-exact-git-production-control-artifact'

die() {
  printf 'build-production-control-artifact-ci: %s\n' "$*" >&2
  exit 1
}

release_sha=''
repository_root_input=''
node_path_input=''
runner_tool_cache_input=''
output_directory_input=''

while (($# > 0)); do
  case "$1" in
    --release-sha)
      [[ -z "$release_sha" && $# -ge 2 ]] || die 'duplicate or incomplete --release-sha'
      release_sha="$2"
      shift 2
      ;;
    --repository-root)
      [[ -z "$repository_root_input" && $# -ge 2 ]] \
        || die 'duplicate or incomplete --repository-root'
      repository_root_input="$2"
      shift 2
      ;;
    --node-path)
      [[ -z "$node_path_input" && $# -ge 2 ]] || die 'duplicate or incomplete --node-path'
      node_path_input="$2"
      shift 2
      ;;
    --runner-tool-cache)
      [[ -z "$runner_tool_cache_input" && $# -ge 2 ]] \
        || die 'duplicate or incomplete --runner-tool-cache'
      runner_tool_cache_input="$2"
      shift 2
      ;;
    --output-directory)
      [[ -z "$output_directory_input" && $# -ge 2 ]] \
        || die 'duplicate or incomplete --output-directory'
      output_directory_input="$2"
      shift 2
      ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ "${CI:-}" == 'true' && "${GITHUB_ACTIONS:-}" == 'true' ]] \
  || die 'fixture is restricted to an explicit GitHub Actions CI boundary'
[[ "${PRODUCTION_CONTROL_ARCHIVE_FIXTURE_CONFIRM:-}" == "$FIXTURE_CONFIRMATION" ]] \
  || die 'fixture confirmation is absent'
[[ "${GITHUB_SHA:-}" == "$release_sha" ]] \
  || die 'release SHA must equal the exact GitHub Actions checkout SHA'
((EUID != 0)) || die 'fixture must start as the non-root CI runner'

for forbidden_environment_name in \
  BASH_ENV ENV GCONV_PATH LD_AUDIT LD_LIBRARY_PATH LD_PRELOAD LOCPATH \
  NODE_COMPILE_CACHE NODE_EXTRA_CA_CERTS NODE_OPTIONS NODE_PATH \
  NODE_USE_ENV_PROXY NODE_V8_COVERAGE OPENSSL_CONF OPENSSL_MODULES; do
  [[ -z "${!forbidden_environment_name:-}" ]] \
    || die "unsafe bootstrap environment is present: ${forbidden_environment_name}"
done

while IFS= read -r inherited_environment_name; do
  unset "$inherited_environment_name" 2>/dev/null || true
done < <(compgen -e)
PATH="$CLEAN_PATH"
LANG='C.UTF-8'
LC_ALL='C.UTF-8'
TZ='UTC'
export PATH LANG LC_ALL TZ
export -n \
  release_sha repository_root_input node_path_input output_directory_input \
  runner_tool_cache_input forbidden_environment_name inherited_environment_name \
  2>/dev/null || true

[[ "$release_sha" =~ $RELEASE_SHA_PATTERN ]] \
  || die 'release SHA must be 40 lowercase hexadecimal characters'
[[ "$repository_root_input" == /* && "$node_path_input" == /* \
  && "$runner_tool_cache_input" == /* \
  && "$output_directory_input" == /* ]] \
  || die 'repository, toolcache, Node and output paths must be absolute'

for command_contract in \
  'chmod:/usr/bin/chmod' \
  'cmp:/usr/bin/cmp' \
  'env:/usr/bin/env' \
  'find:/usr/bin/find' \
  'git:/usr/bin/git' \
  'gzip:/usr/bin/gzip' \
  'id:/usr/bin/id' \
  'install:/usr/bin/install' \
  'mktemp:/usr/bin/mktemp' \
  'mv:/usr/bin/mv' \
  'realpath:/usr/bin/realpath' \
  'rm:/usr/bin/rm' \
  'sha256sum:/usr/bin/sha256sum' \
  'sort:/usr/bin/sort' \
  'stat:/usr/bin/stat' \
  'sudo:/usr/bin/sudo' \
  'tar:/usr/bin/tar'; do
  command_name="${command_contract%%:*}"
  expected_command="${command_contract#*:}"
  [[ "$(command -v "$command_name")" == "$expected_command" \
    && -f "$expected_command" && ! -L "$expected_command" \
    && "$(/usr/bin/stat -c '%u:%g' -- "$expected_command")" == '0:0' \
    && -z "$(/usr/bin/find -P "$expected_command" -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die "fixture command is not the exact expected binary: ${command_name}"
done
[[ -f /usr/bin/test && ! -L /usr/bin/test \
  && "$(/usr/bin/stat -c '%u:%g' -- /usr/bin/test)" == '0:0' \
  && -z "$(/usr/bin/find -P /usr/bin/test -maxdepth 0 -perm /022 -print -quit)" ]] \
  || die 'fixture command is not the exact expected binary: test'

python_path="$(/usr/bin/realpath -e -- /usr/bin/python3)"
[[ "$python_path" =~ ^/usr/bin/python3([.][0-9]+)*$ \
  && -f "$python_path" && ! -L "$python_path" && -x "$python_path" \
  && "$(/usr/bin/stat -c '%u:%g:%h' -- "$python_path")" == '0:0:1' \
  && -z "$(/usr/bin/find -P "$python_path" -maxdepth 0 -perm /022 -print -quit)" ]] \
  || die 'root snapshot helper is not the exact trusted system Python'
for python_ancestor in / /usr /usr/bin; do
  [[ -d "$python_ancestor" && ! -L "$python_ancestor" \
    && "$(/usr/bin/stat -c '%u:%g' -- "$python_ancestor")" == '0:0' \
    && -z "$(/usr/bin/find -P "$python_ancestor" -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die "root snapshot helper ancestor is not root authority: ${python_ancestor}"
done

repository_root="$(/usr/bin/realpath -e -- "$repository_root_input")"
[[ "$repository_root" == "$repository_root_input" \
  && -d "$repository_root" && ! -L "$repository_root" ]] \
  || die 'repository root must be canonical and symlink-free'

node_path="$(/usr/bin/realpath -e -- "$node_path_input")"
runner_tool_cache="$(/usr/bin/realpath -e -- "$runner_tool_cache_input")"
[[ "$runner_tool_cache" == "$runner_tool_cache_input" \
  && -d "$runner_tool_cache" && ! -L "$runner_tool_cache" ]] \
  || die 'runner toolcache must be canonical and symlink-free'
[[ "$node_path" == "$node_path_input" \
  && "$node_path" == "${runner_tool_cache}/node/22."*/x64/bin/node \
  && -f "$node_path" && ! -L "$node_path" \
  && -x "$node_path" \
  && ( "$(/usr/bin/stat -c '%u' -- "$node_path")" == '0' \
    || "$(/usr/bin/stat -c '%u' -- "$node_path")" == "$EUID" ) \
  && "$(/usr/bin/stat -c '%h' -- "$node_path")" == '1' \
  && -z "$(/usr/bin/find -P "$node_path" -maxdepth 0 -perm /022 -print -quit)" ]] \
  || die 'Node path must be the exact non-shared Node 22 toolcache executable'

output_parent_input="${output_directory_input%/*}"
[[ -n "$output_parent_input" ]] || output_parent_input='/'
output_parent="$(/usr/bin/realpath -e -- "$output_parent_input")"
[[ "$output_parent" == "$output_parent_input" \
  && -d "$output_parent" && ! -L "$output_parent" ]] \
  || die 'output parent must be canonical and symlink-free'
[[ ! -e "$output_directory_input" && ! -L "$output_directory_input" ]] \
  || die 'output directory already exists; refusing stale or mixed artifacts'

git_command() {
  GIT_NO_REPLACE_OBJECTS=1 \
  GIT_NO_LAZY_FETCH=1 \
  GIT_OPTIONAL_LOCKS=0 \
  GIT_CONFIG_NOSYSTEM=1 \
  HOME='/nonexistent-leetplus-control-artifact-home' \
  XDG_CONFIG_HOME='/nonexistent-leetplus-control-artifact-xdg' \
    /usr/bin/git -C "$repository_root" "$@"
}

[[ "$(git_command rev-parse --show-toplevel)" == "$repository_root" ]] \
  || die 'repository root differs from the exact Git top-level'
[[ "$(git_command rev-parse --verify "${release_sha}^{commit}")" == "$release_sha" ]] \
  || die 'release SHA is not the exact available commit object'

work_root=''
root_workspace=''
root_extraction=''
root_node_path=''
cleanup() {
  local resolved_cleanup=''
  set +e
  if [[ -n "$root_workspace" \
    && "$root_workspace" =~ ^/var/lib/leetplus-production-control-ci-[0-9a-f]{40}\.[A-Za-z0-9]+$ \
    && "$(/usr/bin/sudo -n /usr/bin/test -d "$root_workspace"; printf '%s' "$?")" == '0' \
    && "$(/usr/bin/sudo -n /usr/bin/test ! -L "$root_workspace"; printf '%s' "$?")" == '0' ]]; then
    resolved_cleanup="$(/usr/bin/sudo -n /usr/bin/realpath -e -- "$root_workspace")"
    if [[ "$resolved_cleanup" == "$root_workspace" ]]; then
      /usr/bin/sudo -n /usr/bin/rm -rf --one-file-system -- "$root_workspace"
    else
      printf 'refusing non-canonical root workspace cleanup: %s\n' "$root_workspace" >&2
    fi
  fi
  if [[ -n "$work_root" && "$work_root" == "${output_parent}/.production-control-build."* \
    && -d "$work_root" && ! -L "$work_root" \
    && "$(/usr/bin/realpath -e -- "$work_root")" == "$work_root" ]]; then
    /usr/bin/rm -rf --one-file-system -- "$work_root"
  fi
}
trap cleanup EXIT

work_root="$(/usr/bin/mktemp -d "${output_parent}/.production-control-build.XXXXXX")"
[[ "$(/usr/bin/realpath -e -- "$work_root")" == "$work_root" \
  && "$(/usr/bin/stat -c '%u:%g:%a' -- "$work_root")" == \
    "${EUID}:$(/usr/bin/id -g):700" ]] \
  || die 'runner workspace path is not exact, private and canonical'
root_workspace="$(/usr/bin/sudo -n /usr/bin/mktemp -d \
  "/var/lib/leetplus-production-control-ci-${release_sha}.XXXXXX")"
[[ "$root_workspace" =~ ^/var/lib/leetplus-production-control-ci-${release_sha}\.[A-Za-z0-9]+$ \
  && "$(/usr/bin/sudo -n /usr/bin/realpath -e -- "$root_workspace")" == "$root_workspace" \
  && "$(/usr/bin/sudo -n /usr/bin/stat -c '%u:%g:%a' -- "$root_workspace")" == '0:0:700' ]] \
  || die 'root workspace path is not exact, private and canonical'

node_snapshot_directory="${root_workspace}/node-snapshot"
root_node_path="${node_snapshot_directory}/node22"
node_snapshot_record="$(/usr/bin/sudo -n /usr/bin/env -i \
  PATH="$CLEAN_PATH" \
  LANG='C.UTF-8' \
  LC_ALL='C.UTF-8' \
  TZ='UTC' \
  "$python_path" -I -S -E - \
    "$node_path" "$runner_tool_cache" "$node_snapshot_directory" "$EUID" <<'PY'
import errno
import hashlib
import os
import stat
import sys

MAX_NODE_BYTES = 256 * 1024 * 1024
SOURCE_PATH, TOOLCACHE_PATH, SNAPSHOT_DIRECTORY, CI_UID_TEXT = sys.argv[1:]
CI_UID = int(CI_UID_TEXT, 10)


def fail(message):
    raise SystemExit(f"node snapshot authority: {message}")


def identity(record):
    return (
        record.st_dev,
        record.st_ino,
        record.st_size,
        record.st_mtime_ns,
        record.st_ctime_ns,
        record.st_mode,
        record.st_uid,
        record.st_gid,
        record.st_nlink,
    )


def assert_no_acl(path):
    for name in ("system.posix_acl_access", "system.posix_acl_default"):
        try:
            value = os.getxattr(path, name, follow_symlinks=False)
        except OSError as error:
            absent = {errno.ENODATA, errno.ENOTSUP, errno.EOPNOTSUPP}
            if hasattr(errno, "ENOATTR"):
                absent.add(errno.ENOATTR)
            if error.errno in absent:
                continue
            fail(f"cannot attest ACL boundary for {path}: errno {error.errno}")
        if value:
            fail(f"POSIX ACL is forbidden on Node source boundary: {path}")


def path_components(path):
    components = [os.path.sep]
    current = os.path.sep
    for component in path.split(os.path.sep)[1:]:
        if component:
            current = os.path.join(current, component)
            components.append(current)
    return components


def digest_fd(descriptor):
    os.lseek(descriptor, 0, os.SEEK_SET)
    digest = hashlib.sha256()
    total = 0
    while True:
        chunk = os.read(descriptor, 1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_NODE_BYTES:
            fail("Node source exceeds the bounded byte envelope")
        digest.update(chunk)
    return digest.hexdigest(), total


def write_all(descriptor, value):
    view = memoryview(value)
    while view:
        written = os.write(descriptor, view)
        if written <= 0:
            fail("short write while creating private Node snapshot")
        view = view[written:]


if CI_UID <= 0:
    fail("CI runner UID must be a concrete non-root identity")
for candidate in (SOURCE_PATH, TOOLCACHE_PATH, SNAPSHOT_DIRECTORY):
    if not os.path.isabs(candidate):
        fail("all snapshot paths must be absolute")
if os.path.realpath(SOURCE_PATH) != SOURCE_PATH:
    fail("Node source is not canonical or has a symlinked ancestor")
if os.path.realpath(TOOLCACHE_PATH) != TOOLCACHE_PATH:
    fail("runner toolcache is not canonical or has a symlinked ancestor")
if os.path.commonpath((SOURCE_PATH, TOOLCACHE_PATH)) != TOOLCACHE_PATH:
    fail("Node source escapes the exact runner toolcache")

for candidate in path_components(SOURCE_PATH):
    record = os.lstat(candidate)
    if stat.S_ISLNK(record.st_mode):
        fail(f"symlinked Node source boundary: {candidate}")
    if candidate == SOURCE_PATH:
        if not stat.S_ISREG(record.st_mode):
            fail("Node source is not a regular file")
    elif not stat.S_ISDIR(record.st_mode):
        fail(f"Node source ancestor is not a directory: {candidate}")
    if record.st_uid not in (0, CI_UID):
        fail(f"Node source boundary has an unexpected owner: {candidate}")
    if record.st_mode & 0o022:
        fail(f"Node source boundary has a group/other writer: {candidate}")
    assert_no_acl(candidate)

workspace = os.path.dirname(SNAPSHOT_DIRECTORY)
workspace_record = os.lstat(workspace)
if (
    os.path.realpath(workspace) != workspace
    or not stat.S_ISDIR(workspace_record.st_mode)
    or workspace_record.st_uid != 0
    or workspace_record.st_gid != 0
    or stat.S_IMODE(workspace_record.st_mode) != 0o700
):
    fail("private snapshot workspace is not exact root authority")
os.mkdir(SNAPSHOT_DIRECTORY, 0o700)
snapshot_directory_record = os.lstat(SNAPSHOT_DIRECTORY)
if (
    not stat.S_ISDIR(snapshot_directory_record.st_mode)
    or snapshot_directory_record.st_uid != 0
    or snapshot_directory_record.st_gid != 0
    or stat.S_IMODE(snapshot_directory_record.st_mode) != 0o700
):
    fail("private Node snapshot directory creation lost authority")

source_flags = os.O_RDONLY | os.O_CLOEXEC
if hasattr(os, "O_NOFOLLOW"):
    source_flags |= os.O_NOFOLLOW
source_fd = os.open(SOURCE_PATH, source_flags)
destination_fd = None
try:
    source_before = os.fstat(source_fd)
    if (
        not stat.S_ISREG(source_before.st_mode)
        or source_before.st_nlink != 1
        or source_before.st_uid not in (0, CI_UID)
        or source_before.st_mode & 0o022
        or source_before.st_mode & 0o7000
        or source_before.st_size <= 0
        or source_before.st_size > MAX_NODE_BYTES
        or not source_before.st_mode & 0o100
    ):
        fail("opened Node source violates file authority")
    if identity(os.lstat(SOURCE_PATH)) != identity(source_before):
        fail("Node source path changed before snapshot")
    first_digest, first_size = digest_fd(source_fd)
    if first_size != source_before.st_size:
        fail("Node source size changed during first digest")

    destination_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        destination_flags |= os.O_NOFOLLOW
    destination_path = os.path.join(SNAPSHOT_DIRECTORY, "node22")
    destination_fd = os.open(destination_path, destination_flags, 0o500)
    os.lseek(source_fd, 0, os.SEEK_SET)
    copy_digest = hashlib.sha256()
    copied_size = 0
    while True:
        chunk = os.read(source_fd, 1024 * 1024)
        if not chunk:
            break
        copied_size += len(chunk)
        if copied_size > MAX_NODE_BYTES:
            fail("Node source exceeds the bounded byte envelope during copy")
        copy_digest.update(chunk)
        write_all(destination_fd, chunk)
    os.fchown(destination_fd, 0, 0)
    os.fchmod(destination_fd, 0o500)
    os.fsync(destination_fd)

    second_digest, second_size = digest_fd(source_fd)
    source_after = os.fstat(source_fd)
    path_after = os.lstat(SOURCE_PATH)
    copied_digest = copy_digest.hexdigest()
    if (
        identity(source_after) != identity(source_before)
        or identity(path_after) != identity(source_before)
        or second_size != source_before.st_size
        or copied_size != source_before.st_size
        or first_digest != copied_digest
        or second_digest != first_digest
    ):
        fail("Node source identity or digest changed across private snapshot")

    destination_record = os.fstat(destination_fd)
    if (
        not stat.S_ISREG(destination_record.st_mode)
        or destination_record.st_uid != 0
        or destination_record.st_gid != 0
        or stat.S_IMODE(destination_record.st_mode) != 0o500
        or destination_record.st_nlink != 1
        or destination_record.st_size != source_before.st_size
    ):
        fail("private Node snapshot file authority is malformed")
finally:
    if destination_fd is not None:
        os.close(destination_fd)
    os.close(source_fd)

destination_fd = os.open(destination_path, os.O_RDONLY | os.O_CLOEXEC)
try:
    destination_digest, destination_size = digest_fd(destination_fd)
finally:
    os.close(destination_fd)
if destination_digest != first_digest or destination_size != source_before.st_size:
    fail("private Node snapshot bytes changed after close")
destination_path_record = os.lstat(destination_path)
if identity(destination_path_record) != identity(os.stat(destination_path, follow_symlinks=False)):
    fail("private Node snapshot path identity is unstable")
os.chmod(SNAPSHOT_DIRECTORY, 0o500)
directory_fd = os.open(SNAPSHOT_DIRECTORY, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
try:
    os.fsync(directory_fd)
finally:
    os.close(directory_fd)
workspace_fd = os.open(workspace, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
try:
    os.fsync(workspace_fd)
finally:
    os.close(workspace_fd)

print(f"NODE_SNAPSHOT_SHA256={first_digest}")
print(
    "NODE_SOURCE_IDENTITY="
    f"{source_before.st_dev}:{source_before.st_ino}:{source_before.st_size}:"
    f"{source_before.st_mtime_ns}"
)
PY
)" || die 'failed to create an identity-stable private Node snapshot'
node_snapshot_line_count=0
node_snapshot_sha256=''
node_source_identity=''
while IFS= read -r node_snapshot_line; do
  node_snapshot_line_count=$((node_snapshot_line_count + 1))
  case "$node_snapshot_line" in
    NODE_SNAPSHOT_SHA256=*)
      [[ -z "$node_snapshot_sha256" ]] || die 'duplicate private Node snapshot digest'
      node_snapshot_sha256="${node_snapshot_line#NODE_SNAPSHOT_SHA256=}"
      ;;
    NODE_SOURCE_IDENTITY=*)
      [[ -z "$node_source_identity" ]] || die 'duplicate private Node source identity'
      node_source_identity="${node_snapshot_line#NODE_SOURCE_IDENTITY=}"
      ;;
    *) die 'private Node snapshot helper returned unexpected output' ;;
  esac
done <<< "$node_snapshot_record"
[[ "$node_snapshot_line_count" == '2' \
  && "$node_snapshot_sha256" =~ ^[0-9a-f]{64}$ \
  && "$node_source_identity" =~ ^[0-9]+:[0-9]+:[1-9][0-9]*:[0-9]+$ \
  && "$(/usr/bin/sudo -n /usr/bin/stat -c '%u:%g:%a:%h' -- "$root_node_path")" == \
    '0:0:500:1' \
  && "$(/usr/bin/sudo -n /usr/bin/stat -c '%u:%g:%a' -- "$node_snapshot_directory")" == \
    '0:0:500' ]] \
  || die 'private Node snapshot evidence or authority is malformed'

node_command() {
  /usr/bin/sudo -n /usr/bin/env -i \
    PATH="$CLEAN_PATH" \
    LANG='C.UTF-8' \
    LC_ALL='C.UTF-8' \
    TZ='UTC' \
    "$root_node_path" "$@"
}
[[ "$(node_command -p 'process.versions.node.split(".")[0]')" == '22' \
  && "$(node_command -p 'process.execPath')" == "$root_node_path" ]] \
  || die 'private Node snapshot is not the exact effective Node 22 executable'

payload_root="${work_root}/payload"
/usr/bin/install -d -m 0700 -- "$payload_root"

git_blob_record() {
  local relative_path="$1"
  local record
  record="$(git_command ls-tree --full-tree "$release_sha" -- "$relative_path")"
  [[ "$record" != *$'\n'* && "$record" != *$'\r'* && "$record" == *$'\t'* ]] \
    || die "Git tree returned a non-canonical record: ${relative_path}"
  printf '%s' "$record"
}

materialize_git_blob() {
  local relative_path="$1"
  local target_path="$2"
  local record metadata returned_path object_mode object_type object_id
  local checkout_path target_parent
  record="$(git_blob_record "$relative_path")"
  metadata="${record%%$'\t'*}"
  returned_path="${record#*$'\t'}"
  IFS=' ' read -r object_mode object_type object_id <<< "$metadata"
  [[ "$returned_path" == "$relative_path" \
    && "$object_type" == 'blob' \
    && ( "$object_mode" == '100644' || "$object_mode" == '100755' ) \
    && "$object_id" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]] \
    || die "allowlisted Git path is not one regular blob: ${relative_path}"

  target_parent="${target_path%/*}"
  /usr/bin/install -d -m 0700 -- "$target_parent"
  git_command cat-file blob "$object_id" > "$target_path"
  /usr/bin/chmod 0440 -- "$target_path"
  [[ "$(git_command hash-object --stdin < "$target_path")" == "$object_id" ]] \
    || die "materialized bytes do not match the exact Git blob identity: ${relative_path}"
  [[ "$(/usr/bin/stat -c '%F:%h' -- "$target_path")" == 'regular file:1' \
    && "$(/usr/bin/stat -c '%s' -- "$target_path")" -le 16777216 ]] \
    || die "materialized Git blob is unsafe or oversized: ${relative_path}"

  checkout_path="${repository_root}/${relative_path}"
  [[ -f "$checkout_path" && ! -L "$checkout_path" \
    && "$(/usr/bin/realpath -e -- "$checkout_path")" == "$checkout_path" \
    && "$(/usr/bin/stat -c '%h' -- "$checkout_path")" == '1' ]] \
    || die "checked-out allowlisted path is absent, linked or non-canonical: ${relative_path}"
  /usr/bin/cmp --silent -- "$target_path" "$checkout_path" \
    || die "checked-out bytes differ from the exact Git object: ${relative_path}"
}

allowlist_snapshot="${work_root}/payload.allowlist"
materialize_git_blob "$ALLOWLIST_PATH" "$allowlist_snapshot"
payload_count="$(node_command --input-type=module - "$allowlist_snapshot" <<'NODE'
import fs from 'node:fs';
import { TextDecoder } from 'node:util';

const target = process.argv[2];
const before = fs.lstatSync(target, { bigint: true });
if (!before.isFile() || before.nlink !== 1n || before.size <= 0n || before.size > 64n * 1024n) {
  process.exit(80);
}
const descriptor = fs.openSync(
  target,
  fs.constants.O_RDONLY |
    (fs.constants.O_NOFOLLOW ?? 0) |
    (fs.constants.O_NONBLOCK ?? 0),
);
let bytes;
try {
  const opened = fs.fstatSync(descriptor, { bigint: true });
  if (
    !opened.isFile() ||
    opened.nlink !== 1n ||
    opened.dev !== before.dev ||
    opened.ino !== before.ino ||
    opened.size !== before.size ||
    opened.ctimeNs !== before.ctimeNs
  ) {
    process.exit(80);
  }
  bytes = Buffer.alloc(Number(opened.size));
  let offset = 0;
  while (offset < bytes.length) {
    const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
    if (count === 0) process.exit(80);
    offset += count;
  }
  const overflow = Buffer.alloc(1);
  if (fs.readSync(descriptor, overflow, 0, 1, bytes.length) !== 0) process.exit(80);
  const after = fs.fstatSync(descriptor, { bigint: true });
  if (
    after.dev !== opened.dev ||
    after.ino !== opened.ino ||
    after.size !== opened.size ||
    after.ctimeNs !== opened.ctimeNs
  ) {
    process.exit(80);
  }
} finally {
  fs.closeSync(descriptor);
}
let text;
try {
  text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
} catch {
  process.exit(81);
}
if (!text.endsWith('\n') || text.endsWith('\n\n')) process.exit(82);
const paths = text.slice(0, -1).split('\n');
if (paths.length === 0 || paths.length > 256) process.exit(83);
const safe = /^[A-Za-z0-9_.@+/-]+$/u;
const compare = (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right));
const seen = new Set();
let previous;
for (const candidate of paths) {
  const components = candidate.split('/');
  if (
    Buffer.byteLength(candidate) > 4096 ||
    candidate !== candidate.normalize('NFC') ||
    !safe.test(candidate) ||
    components.some((component) => !component || component === '.' || component === '..') ||
    seen.has(candidate) ||
    (previous !== undefined && compare(previous, candidate) >= 0)
  ) {
    process.exit(84);
  }
  seen.add(candidate);
  previous = candidate;
}
process.stdout.write(String(paths.length));
NODE
)" || die 'Git-object payload allowlist is not canonical and safe'
[[ "$payload_count" =~ ^[1-9][0-9]*$ ]] \
  || die 'payload allowlist count is malformed'

while IFS= read -r listed_path; do
  materialize_git_blob "$listed_path" "${payload_root}/${listed_path}"
done < "$allowlist_snapshot"

allowlist_digest="$(/usr/bin/sha256sum -- "${payload_root}/${ALLOWLIST_PATH}")"
allowlist_digest="${allowlist_digest%% *}"
inner_manifest_digest="$(/usr/bin/sha256sum -- "${payload_root}/${INNER_MANIFEST_PATH}")"
inner_manifest_digest="${inner_manifest_digest%% *}"
[[ "$allowlist_digest" =~ ^[0-9a-f]{64}$ \
  && "$inner_manifest_digest" =~ ^[0-9a-f]{64}$ ]] \
  || die 'payload authority digest is malformed'

provenance_path="${payload_root}/production-control-provenance.json"
printf '%s\n' \
  '{' \
  '  "schemaVersion": 1,' \
  '  "artifactKind": "leetplus-production-control",' \
  "  \"releaseSha\": \"${release_sha}\"," \
  '  "nodeMajor": 22,' \
  "  \"nodeExecutableSha256\": \"${node_snapshot_sha256}\"," \
  "  \"payloadAllowlistSha256\": \"${allowlist_digest}\"," \
  "  \"payloadFileCount\": ${payload_count}," \
  "  \"controlBundleManifestSha256\": \"${inner_manifest_digest}\"" \
  '}' > "$provenance_path"
/usr/bin/chmod 0440 -- "$provenance_path"

manifest_member_list="${work_root}/manifest-members"
{
  while IFS= read -r listed_path; do
    printf '%s\n' "$listed_path"
  done < "$allowlist_snapshot"
  printf 'production-control-provenance.json\n'
} | LC_ALL=C /usr/bin/sort > "$manifest_member_list"

root_manifest_path="${payload_root}/SHA256SUMS"
while IFS= read -r listed_path; do
  member_digest="$(/usr/bin/sha256sum -- "${payload_root}/${listed_path}")"
  member_digest="${member_digest%% *}"
  [[ "$member_digest" =~ ^[0-9a-f]{64}$ ]] \
    || die "payload digest is malformed: ${listed_path}"
  printf '%s  ./%s\n' "$member_digest" "$listed_path" >> "$root_manifest_path"
done < "$manifest_member_list"
/usr/bin/chmod 0440 -- "$root_manifest_path"

archive_member_list="${work_root}/archive-members"
{
  while IFS= read -r listed_path; do
    printf '%s\n' "$listed_path"
  done < "$manifest_member_list"
  printf 'SHA256SUMS\n'
} | LC_ALL=C /usr/bin/sort > "$archive_member_list"

make_archive_pair() {
  local tar_path="$1"
  local gzip_path="$2"
  (
    cd -- "$payload_root"
    /usr/bin/tar \
      --create \
      --file "$tar_path" \
      --format=ustar \
      --sort=name \
      --mtime='@0' \
      --owner=0 \
      --group=0 \
      --numeric-owner \
      --mode='u=r,g=r,o=' \
      --no-recursion \
      --verbatim-files-from \
      --files-from="$archive_member_list"
  )
  /usr/bin/gzip --no-name --best --stdout -- "$tar_path" > "$gzip_path"
  /usr/bin/chmod 0400 -- "$tar_path" "$gzip_path"
}

first_tar="${work_root}/control-1.tar"
first_gzip="${work_root}/control-1.tar.gz"
second_tar="${work_root}/control-2.tar"
second_gzip="${work_root}/control-2.tar.gz"
make_archive_pair "$first_tar" "$first_gzip"
make_archive_pair "$second_tar" "$second_gzip"
/usr/bin/cmp --silent -- "$first_tar" "$second_tar" \
  || die 'canonical tar construction is not deterministic'
/usr/bin/cmp --silent -- "$first_gzip" "$second_gzip" \
  || die 'canonical gzip construction is not deterministic'
canonical_tar_digest="$(/usr/bin/sha256sum -- "$first_tar")"
canonical_tar_digest="${canonical_tar_digest%% *}"
canonical_gzip_digest="$(/usr/bin/sha256sum -- "$first_gzip")"
canonical_gzip_digest="${canonical_gzip_digest%% *}"
[[ "$canonical_tar_digest" =~ ^[0-9a-f]{64}$ \
  && "$canonical_gzip_digest" =~ ^[0-9a-f]{64}$ ]] \
  || die 'canonical tar/gzip digest is malformed'
/usr/bin/gzip --test -- "$first_gzip" \
  || die 'canonical gzip stream failed integrity verification'
/usr/bin/gzip --decompress --stdout -- "$first_gzip" \
  | /usr/bin/cmp --silent -- "$first_tar" - \
  || die 'gzip stream does not decode to the exact validated tar bytes'

node_command --input-type=module - "$first_gzip" <<'NODE'
import fs from 'node:fs';
const target = process.argv[2];
const before = fs.lstatSync(target, { bigint: true });
if (!before.isFile() || before.nlink !== 1n || before.size <= 0n || before.size > 128n * 1024n * 1024n) {
  process.exit(90);
}
const descriptor = fs.openSync(
  target,
  fs.constants.O_RDONLY |
    (fs.constants.O_NOFOLLOW ?? 0) |
    (fs.constants.O_NONBLOCK ?? 0),
);
let bytes;
try {
  const opened = fs.fstatSync(descriptor, { bigint: true });
  if (
    !opened.isFile() ||
    opened.nlink !== 1n ||
    opened.dev !== before.dev ||
    opened.ino !== before.ino ||
    opened.size !== before.size ||
    opened.ctimeNs !== before.ctimeNs
  ) {
    process.exit(90);
  }
  bytes = Buffer.alloc(Number(opened.size));
  let offset = 0;
  while (offset < bytes.length) {
    const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
    if (count === 0) process.exit(90);
    offset += count;
  }
  const overflow = Buffer.alloc(1);
  if (fs.readSync(descriptor, overflow, 0, 1, bytes.length) !== 0) process.exit(90);
  const after = fs.fstatSync(descriptor, { bigint: true });
  if (
    after.dev !== opened.dev ||
    after.ino !== opened.ino ||
    after.size !== opened.size ||
    after.ctimeNs !== opened.ctimeNs
  ) {
    process.exit(90);
  }
} finally {
  fs.closeSync(descriptor);
}
if (
  bytes.length < 18 ||
  bytes[0] !== 0x1f ||
  bytes[1] !== 0x8b ||
  bytes[2] !== 8 ||
  bytes[3] !== 0 ||
  bytes.subarray(4, 8).some((value) => value !== 0) ||
  bytes[8] !== 2 ||
  bytes[9] !== 3
) {
  process.exit(91);
}
NODE

node_command --input-type=module - \
  "$first_tar" "$payload_root" "$archive_member_list" "$payload_count" <<'NODE'
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [tarPath, payloadRoot, memberListPath, expectedPayloadCountText] = process.argv.slice(2);
const MAX_MEMBER_BYTES = 16 * 1024 * 1024;

function readBoundedRegularFile(absolutePath, maximumBytes, label) {
  const before = fs.lstatSync(absolutePath, { bigint: true });
  if (
    !before.isFile() ||
    before.nlink !== 1n ||
    before.size <= 0n ||
    before.size > BigInt(maximumBytes)
  ) {
    throw new Error(`${label} violates its bounded regular-file envelope`);
  }
  const descriptor = fs.openSync(
    absolutePath,
    fs.constants.O_RDONLY |
      (fs.constants.O_NOFOLLOW ?? 0) |
      (fs.constants.O_NONBLOCK ?? 0),
  );
  try {
    const opened = fs.fstatSync(descriptor, { bigint: true });
    if (
      !opened.isFile() ||
      opened.nlink !== 1n ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size ||
      opened.ctimeNs !== before.ctimeNs
    ) {
      throw new Error(`${label} changed identity before bounded read`);
    }
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count === 0) throw new Error(`${label} became short during bounded read`);
      offset += count;
    }
    const overflow = Buffer.alloc(1);
    if (fs.readSync(descriptor, overflow, 0, 1, bytes.length) !== 0) {
      throw new Error(`${label} grew during bounded read`);
    }
    const after = fs.fstatSync(descriptor, { bigint: true });
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      after.ctimeNs !== opened.ctimeNs
    ) {
      throw new Error(`${label} changed during bounded read`);
    }
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

if (fs.realpathSync.native(payloadRoot) !== payloadRoot) {
  throw new Error('payload root is not canonical before tar verification');
}
const canonicalTar = readBoundedRegularFile(tarPath, 128 * 1024 * 1024, 'canonical tar');
const memberList = readBoundedRegularFile(
  memberListPath,
  64 * 1024,
  'archive member list',
).toString('utf8');
if (!memberList.endsWith('\n') || memberList.endsWith('\n\n')) {
  throw new Error('archive member list is not canonical');
}
const members = memberList.slice(0, -1).split('\n');
const safePath = /^[A-Za-z0-9_.@+/-]+$/u;
const expectedPayloadCount = Number.parseInt(expectedPayloadCountText, 10);
if (
  !/^[1-9][0-9]*$/u.test(expectedPayloadCountText) ||
  !Number.isSafeInteger(expectedPayloadCount) ||
  members.length !== expectedPayloadCount + 2
) {
  throw new Error('archive member count differs from the exact payload identity');
}
for (let index = 0; index < members.length; index += 1) {
  const member = members[index];
  if (
    !safePath.test(member) ||
    member.split('/').some((component) => !component || component === '.' || component === '..') ||
    (index > 0 && Buffer.compare(Buffer.from(members[index - 1]), Buffer.from(member)) >= 0)
  ) {
    throw new Error('archive member list is unsafe, duplicate or unsorted');
  }
}

function readString(field, label) {
  const zero = field.indexOf(0);
  const end = zero === -1 ? field.length : zero;
  if (zero !== -1 && field.subarray(zero).some((value) => value !== 0)) {
    throw new Error(`${label} has bytes after NUL`);
  }
  const source = field.subarray(0, end);
  if (source.some((byte) => byte < 0x20 || byte > 0x7e)) {
    throw new Error(`${label} is not printable ASCII`);
  }
  return source.toString('ascii');
}

function readOctal(field, label) {
  const text = field.toString('ascii');
  const canonical =
    (field.length === 8 && /^[0-7]{7}\0$/u.test(text)) ||
    (field.length === 12 && /^[0-7]{11}\0$/u.test(text));
  if (!canonical) throw new Error(`${label} is not canonical octal`);
  const value = Number.parseInt(text.slice(0, -1), 8);
  if (!Number.isSafeInteger(value)) throw new Error(`${label} is too large`);
  return value;
}

function readChecksum(field) {
  const text = field.toString('ascii');
  if (!/^[0-7]{6}\0 $/u.test(text)) throw new Error('checksum is not canonical octal');
  return Number.parseInt(text.slice(0, 6), 8);
}

function validateTar(tar) {
  if (tar.length === 0 || tar.length > 128 * 1024 * 1024 || tar.length % 512 !== 0) {
    throw new Error('tar byte envelope is invalid');
  }
  let offset = 0;
  for (const expectedPath of members) {
    const header = tar.subarray(offset, offset + 512);
    if (header.length !== 512 || header.every((value) => value === 0)) {
      throw new Error(`tar ended before expected member: ${expectedPath}`);
    }
    const storedChecksum = readChecksum(header.subarray(148, 156));
    let calculatedChecksum = 0;
    for (let index = 0; index < header.length; index += 1) {
      calculatedChecksum += index >= 148 && index < 156 ? 0x20 : header[index];
    }
    if (storedChecksum !== calculatedChecksum) throw new Error('tar header checksum mismatch');

    const name = readString(header.subarray(0, 100), 'name');
    const prefix = readString(header.subarray(345, 500), 'prefix');
    const memberPath = prefix ? `${prefix}/${name}` : name;
    if (
      memberPath !== expectedPath ||
      !safePath.test(memberPath) ||
      memberPath.split('/').some((component) => !component || component === '.' || component === '..')
    ) {
      throw new Error(`tar member identity mismatch: ${memberPath}`);
    }
    if (header[156] !== 0x30) {
      throw new Error(`tar member is not a regular file: ${memberPath}`);
    }
    if (
      readOctal(header.subarray(100, 108), 'mode') !== 0o440 ||
      readOctal(header.subarray(108, 116), 'uid') !== 0 ||
      readOctal(header.subarray(116, 124), 'gid') !== 0 ||
      readOctal(header.subarray(136, 148), 'mtime') !== 0 ||
      readString(header.subarray(157, 257), 'linkname') !== '' ||
      header.subarray(257, 263).toString('binary') !== 'ustar\0' ||
      header.subarray(263, 265).toString('ascii') !== '00' ||
      readString(header.subarray(265, 297), 'uname') !== '' ||
      readString(header.subarray(297, 329), 'gname') !== '' ||
      header.subarray(329, 345).some((value) => value !== 0) ||
      header.subarray(500, 512).some((value) => value !== 0)
    ) {
      throw new Error(`tar member authority metadata mismatch: ${memberPath}`);
    }

    const size = readOctal(header.subarray(124, 136), 'size');
    const source = readBoundedRegularFile(
      path.join(payloadRoot, ...memberPath.split('/')),
      MAX_MEMBER_BYTES,
      `payload member ${memberPath}`,
    );
    if (size !== source.length || size > 16 * 1024 * 1024) {
      throw new Error(`tar member size mismatch: ${memberPath}`);
    }
    const payloadStart = offset + 512;
    const payloadEnd = payloadStart + size;
    const archived = tar.subarray(payloadStart, payloadEnd);
    if (
      archived.length !== size ||
      crypto.createHash('sha256').update(archived).digest('hex') !==
        crypto.createHash('sha256').update(source).digest('hex')
    ) {
      throw new Error(`tar member bytes mismatch: ${memberPath}`);
    }
    const nextOffset = payloadStart + Math.ceil(size / 512) * 512;
    if (tar.subarray(payloadEnd, nextOffset).some((value) => value !== 0)) {
      throw new Error(`tar member padding is nonzero: ${memberPath}`);
    }
    offset = nextOffset;
  }

  if (tar.length - offset < 1024 || tar.subarray(offset).some((value) => value !== 0)) {
    throw new Error('tar has an extra member or a non-canonical trailer');
  }
  return offset;
}

function rewriteChecksum(tar, headerOffset = 0) {
  tar.fill(0x20, headerOffset + 148, headerOffset + 156);
  let checksum = 0;
  for (const byte of tar.subarray(headerOffset, headerOffset + 512)) checksum += byte;
  const record = `${checksum.toString(8).padStart(6, '0')}\0 `;
  tar.write(record, headerOffset + 148, 8, 'binary');
}

function expectRejected(label, expectedMessage, mutate) {
  const candidate = Buffer.from(canonicalTar);
  mutate(candidate);
  try {
    validateTar(candidate);
  } catch (error) {
    if (String(error?.message).includes(expectedMessage)) return;
    throw new Error(`${label} rejected for the wrong reason: ${error?.message}`);
  }
  throw new Error(`${label} tar mutation was unexpectedly accepted`);
}

const trailerOffset = validateTar(canonicalTar);
expectRejected('mode', 'authority metadata mismatch', (candidate) => {
  candidate.write('0000644\0', 100, 8, 'binary');
  rewriteChecksum(candidate);
});
expectRejected('non-canonical mode', 'mode is not canonical octal', (candidate) => {
  candidate.write('  00440\0', 100, 8, 'binary');
  rewriteChecksum(candidate);
});
expectRejected('size', 'size mismatch', (candidate) => {
  candidate.write('00000000000\0', 124, 12, 'binary');
  rewriteChecksum(candidate);
});
expectRejected('type', 'not a regular file', (candidate) => {
  candidate[156] = 0x35;
  rewriteChecksum(candidate);
});
expectRejected('legacy NUL type', 'not a regular file', (candidate) => {
  candidate[156] = 0;
  rewriteChecksum(candidate);
});
expectRejected('path traversal', 'identity mismatch', (candidate) => {
  candidate.fill(0, 0, 100);
  candidate.write('../escape', 0, 'ascii');
  rewriteChecksum(candidate);
});
expectRejected('extra trailer bytes', 'extra member', (candidate) => {
  candidate[trailerOffset] = 1;
});
NODE

post_validation_tar_digest="$(/usr/bin/sha256sum -- "$first_tar")"
post_validation_tar_digest="${post_validation_tar_digest%% *}"
post_validation_gzip_digest="$(/usr/bin/sha256sum -- "$first_gzip")"
post_validation_gzip_digest="${post_validation_gzip_digest%% *}"
[[ "$post_validation_tar_digest" == "$canonical_tar_digest" \
  && "$post_validation_gzip_digest" == "$canonical_gzip_digest" ]] \
  || die 'canonical tar/gzip bytes changed during pre-extract validation'
root_extraction="${root_workspace}/artifact"
root_tar_snapshot="${root_workspace}/control.tar"
/usr/bin/sudo -n /usr/bin/install -d -o root -g root -m 0700 -- "$root_extraction"
root_tar_snapshot_record="$(/usr/bin/sudo -n /usr/bin/env -i \
  PATH="$CLEAN_PATH" \
  LANG='C.UTF-8' \
  LC_ALL='C.UTF-8' \
  TZ='UTC' \
  "$python_path" -I -S -E - \
    "$first_tar" "$root_tar_snapshot" "$canonical_tar_digest" "$EUID" <<'PY'
import hashlib
import os
import stat
import sys

MAX_TAR_BYTES = 128 * 1024 * 1024
SOURCE_PATH, DESTINATION_PATH, EXPECTED_SHA256, CI_UID_TEXT = sys.argv[1:]
CI_UID = int(CI_UID_TEXT, 10)


def fail(message):
    raise SystemExit(f"root tar snapshot authority: {message}")


def identity(record):
    return (
        record.st_dev,
        record.st_ino,
        record.st_size,
        record.st_mtime_ns,
        record.st_ctime_ns,
        record.st_mode,
        record.st_uid,
        record.st_gid,
        record.st_nlink,
    )


def digest_fd(descriptor):
    os.lseek(descriptor, 0, os.SEEK_SET)
    digest = hashlib.sha256()
    size = 0
    while True:
        chunk = os.read(descriptor, 1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_TAR_BYTES:
            fail("tar source exceeds the bounded byte envelope")
        digest.update(chunk)
    return digest.hexdigest(), size


def write_all(descriptor, value):
    view = memoryview(value)
    while view:
        written = os.write(descriptor, view)
        if written <= 0:
            fail("short write while creating root tar snapshot")
        view = view[written:]


if CI_UID <= 0 or not os.path.isabs(SOURCE_PATH) or not os.path.isabs(DESTINATION_PATH):
    fail("snapshot identities and paths are malformed")
if os.path.realpath(SOURCE_PATH) != SOURCE_PATH:
    fail("tar source is not canonical or has a symlinked ancestor")
source_parent = os.path.dirname(SOURCE_PATH)
source_parent_record = os.lstat(source_parent)
if (
    not stat.S_ISDIR(source_parent_record.st_mode)
    or source_parent_record.st_uid != CI_UID
    or source_parent_record.st_mode & 0o077
):
    fail("tar source parent is not the private CI runner workspace")
destination_parent = os.path.dirname(DESTINATION_PATH)
destination_parent_record = os.lstat(destination_parent)
if (
    os.path.realpath(destination_parent) != destination_parent
    or not stat.S_ISDIR(destination_parent_record.st_mode)
    or destination_parent_record.st_uid != 0
    or destination_parent_record.st_gid != 0
    or stat.S_IMODE(destination_parent_record.st_mode) != 0o700
):
    fail("tar destination parent is not the private root workspace")

source_flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NONBLOCK
if hasattr(os, "O_NOFOLLOW"):
    source_flags |= os.O_NOFOLLOW
source_fd = os.open(SOURCE_PATH, source_flags)
destination_fd = None
try:
    source_before = os.fstat(source_fd)
    if (
        not stat.S_ISREG(source_before.st_mode)
        or source_before.st_nlink != 1
        or source_before.st_uid != CI_UID
        or stat.S_IMODE(source_before.st_mode) != 0o400
        or source_before.st_size <= 0
        or source_before.st_size > MAX_TAR_BYTES
        or identity(os.lstat(SOURCE_PATH)) != identity(source_before)
    ):
        fail("opened tar source violates file authority")
    opened_digest, opened_size = digest_fd(source_fd)
    if opened_digest != EXPECTED_SHA256 or opened_size != source_before.st_size:
        fail("opened tar source differs from the pre-extract validated digest")

    destination_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        destination_flags |= os.O_NOFOLLOW
    destination_fd = os.open(DESTINATION_PATH, destination_flags, 0o440)
    os.lseek(source_fd, 0, os.SEEK_SET)
    copied_digest = hashlib.sha256()
    copied_size = 0
    while True:
        chunk = os.read(source_fd, 1024 * 1024)
        if not chunk:
            break
        copied_size += len(chunk)
        if copied_size > MAX_TAR_BYTES:
            fail("tar source grew during root snapshot")
        copied_digest.update(chunk)
        write_all(destination_fd, chunk)
    os.fchown(destination_fd, 0, 0)
    os.fchmod(destination_fd, 0o440)
    os.fsync(destination_fd)
    source_after = os.fstat(source_fd)
    path_after = os.lstat(SOURCE_PATH)
    if (
        identity(source_after) != identity(source_before)
        or identity(path_after) != identity(source_before)
        or copied_size != source_before.st_size
        or copied_digest.hexdigest() != opened_digest
    ):
        fail("tar source identity or digest changed during root snapshot")
    destination_record = os.fstat(destination_fd)
    if (
        not stat.S_ISREG(destination_record.st_mode)
        or destination_record.st_uid != 0
        or destination_record.st_gid != 0
        or stat.S_IMODE(destination_record.st_mode) != 0o440
        or destination_record.st_nlink != 1
        or destination_record.st_size != source_before.st_size
    ):
        fail("root tar snapshot authority is malformed")
finally:
    if destination_fd is not None:
        os.close(destination_fd)
    os.close(source_fd)

destination_fd = os.open(DESTINATION_PATH, os.O_RDONLY | os.O_CLOEXEC)
try:
    destination_digest, destination_size = digest_fd(destination_fd)
finally:
    os.close(destination_fd)
if destination_digest != EXPECTED_SHA256 or destination_size != source_before.st_size:
    fail("root tar snapshot changed after close")
directory_fd = os.open(destination_parent, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
try:
    os.fsync(directory_fd)
finally:
    os.close(directory_fd)
print(f"ROOT_TAR_SNAPSHOT_SHA256={destination_digest}")
PY
)" || die 'failed to create a stable root-owned tar snapshot'
[[ "$root_tar_snapshot_record" == "ROOT_TAR_SNAPSHOT_SHA256=${canonical_tar_digest}" ]] \
  || die 'root-owned tar snapshot evidence is malformed'
root_tar_digest="$(/usr/bin/sudo -n /usr/bin/sha256sum -- "$root_tar_snapshot")"
root_tar_digest="${root_tar_digest%% *}"
[[ "$root_tar_digest" == "$canonical_tar_digest" \
  && "$(/usr/bin/sudo -n /usr/bin/stat -c '%u:%g:%a:%h' -- "$root_tar_snapshot")" == \
    '0:0:440:1' ]] \
  || die 'root-owned tar snapshot differs from the pre-extract validated bytes'
/usr/bin/sudo -n /usr/bin/env -i \
  PATH="$CLEAN_PATH" \
  LANG='C.UTF-8' \
  LC_ALL='C.UTF-8' \
  TZ='UTC' \
  /usr/bin/tar \
    --extract \
    --file "$root_tar_snapshot" \
    --directory "$root_extraction" \
    --same-owner \
    --same-permissions \
    --numeric-owner \
    --keep-old-files

root_verification="$(node_command "${root_extraction}/${VERIFIER_PATH}" \
    --artifact-root "$root_extraction" \
    --expected-release-sha "$release_sha" \
    --require-root-authority)" \
  || die 'root-owned extraction failed the verifier shipped inside the artifact'
root_verification_line_count=0
while IFS= read -r _; do
  root_verification_line_count=$((root_verification_line_count + 1))
done <<< "$root_verification"
[[ "$root_verification_line_count" == '8' \
  && "$root_verification" == *$'PRODUCTION_CONTROL_ARTIFACT_INTEGRITY=PASS\n'* \
  && "$root_verification" == *"PRODUCTION_CONTROL_NODE_SHA256=${node_snapshot_sha256}"* \
  && "$root_verification" == *'PRODUCTION_CONTROL_ROOT_AUTHORITY=REQUIRED'* ]] \
  || die 'root authority verifier output is malformed'

node_command --input-type=module - \
  "$root_extraction" "$repository_root" "$allowlist_snapshot" \
  "$provenance_path" "$root_manifest_path" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';

const [rootExtraction, repositoryRoot, allowlistPath, provenancePath, manifestPath] =
  process.argv.slice(2);
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
let totalBytes = 0;

function readBoundedRegularFile(absolutePath, maximumBytes, label) {
  if (fs.realpathSync.native(absolutePath) !== absolutePath) {
    throw new Error(`${label} is not canonical or has a symlinked ancestor`);
  }
  const before = fs.lstatSync(absolutePath, { bigint: true });
  if (
    !before.isFile() ||
    before.nlink !== 1n ||
    before.size <= 0n ||
    before.size > BigInt(maximumBytes)
  ) {
    throw new Error(`${label} violates its bounded regular-file envelope`);
  }
  totalBytes += Number(before.size);
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error('checkout comparison exceeds byte budget');
  const descriptor = fs.openSync(
    absolutePath,
    fs.constants.O_RDONLY |
      (fs.constants.O_NOFOLLOW ?? 0) |
      (fs.constants.O_NONBLOCK ?? 0),
  );
  try {
    const opened = fs.fstatSync(descriptor, { bigint: true });
    if (
      !opened.isFile() ||
      opened.nlink !== 1n ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size ||
      opened.ctimeNs !== before.ctimeNs
    ) {
      throw new Error(`${label} changed identity before bounded read`);
    }
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count === 0) throw new Error(`${label} became short during bounded read`);
      offset += count;
    }
    const overflow = Buffer.alloc(1);
    if (fs.readSync(descriptor, overflow, 0, 1, bytes.length) !== 0) {
      throw new Error(`${label} grew during bounded read`);
    }
    const after = fs.fstatSync(descriptor, { bigint: true });
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      after.ctimeNs !== opened.ctimeNs
    ) {
      throw new Error(`${label} changed during bounded read`);
    }
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

const allowlistBytes = readBoundedRegularFile(allowlistPath, 64 * 1024, 'allowlist snapshot');
let allowlistText;
try {
  allowlistText = new TextDecoder('utf-8', { fatal: true }).decode(allowlistBytes);
} catch {
  throw new Error('allowlist snapshot is not UTF-8');
}
if (!allowlistText.endsWith('\n') || allowlistText.endsWith('\n\n')) {
  throw new Error('allowlist snapshot is not canonical');
}
const members = allowlistText.slice(0, -1).split('\n');
const safePath = /^[A-Za-z0-9_.@+/-]+$/u;
for (const member of members) {
  if (
    !safePath.test(member) ||
    member.split('/').some((component) => !component || component === '.' || component === '..')
  ) {
    throw new Error(`unsafe checkout comparison member: ${member}`);
  }
  const extracted = readBoundedRegularFile(
    path.join(rootExtraction, ...member.split('/')),
    MAX_FILE_BYTES,
    `root extraction member ${member}`,
  );
  const checkout = readBoundedRegularFile(
    path.join(repositoryRoot, ...member.split('/')),
    MAX_FILE_BYTES,
    `exact checkout member ${member}`,
  );
  if (!extracted.equals(checkout)) {
    throw new Error(`root extraction differs from the exact checkout: ${member}`);
  }
}
for (const [member, source] of [
  ['production-control-provenance.json', provenancePath],
  ['SHA256SUMS', manifestPath],
]) {
  const extracted = readBoundedRegularFile(
    path.join(rootExtraction, member),
    MAX_FILE_BYTES,
    `root extraction metadata ${member}`,
  );
  const expected = readBoundedRegularFile(source, MAX_FILE_BYTES, `verified build metadata ${member}`);
  if (!extracted.equals(expected)) {
    throw new Error(`root extraction metadata differs from the verified build tree: ${member}`);
  }
}
NODE

archive_basename="leetplus-production-control-${release_sha}.tar.gz"
publication_directory="${work_root}/published"
/usr/bin/install -d -m 0700 -- "$publication_directory"
publication_archive="${publication_directory}/${archive_basename}"
publication_checksum="${publication_archive}.sha256"
archive_digest="$(/usr/bin/sha256sum -- "$first_gzip")"
archive_digest="${archive_digest%% *}"
[[ "$archive_digest" == "$canonical_gzip_digest" ]] \
  || die 'canonical gzip bytes changed after root verification'
checksum_source="${work_root}/archive.sha256"
printf '%s  %s\n' "$archive_digest" "$archive_basename" > "$checksum_source"
/usr/bin/chmod 0400 -- "$checksum_source"
/usr/bin/install -m 0440 -- "$first_gzip" "$publication_archive"
/usr/bin/install -m 0440 -- "$checksum_source" "$publication_checksum"
[[ "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$publication_archive")" == \
    "${EUID}:$(/usr/bin/id -g):440:1" \
  && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$publication_checksum")" == \
    "${EUID}:$(/usr/bin/id -g):440:1" ]] \
  || die 'published CI artifact files are not frozen runner authority'
/usr/bin/cmp --silent -- "$first_gzip" "$publication_archive" \
  || die 'published archive differs from the twice-built verified bytes'
(
  cd -- "$publication_directory"
  /usr/bin/sha256sum --check --strict --quiet "${archive_basename}.sha256"
) || die 'published archive checksum does not verify'

/usr/bin/mv --no-target-directory -- "$publication_directory" "$output_directory_input"
output_directory="$(/usr/bin/realpath -e -- "$output_directory_input")"
archive_output="${output_directory}/${archive_basename}"
checksum_output="${archive_output}.sha256"
[[ "$output_directory" == "$output_directory_input" \
  && "$(/usr/bin/stat -c '%u:%g:%a' -- "$output_directory")" == \
    "${EUID}:$(/usr/bin/id -g):700" \
  && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$archive_output")" == \
    "${EUID}:$(/usr/bin/id -g):440:1" \
  && "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$checksum_output")" == \
    "${EUID}:$(/usr/bin/id -g):440:1" ]] \
  || die 'atomic publication did not preserve the frozen output authority'

printf 'PRODUCTION_CONTROL_ARCHIVE_BUILD=PASS\n'
printf 'PRODUCTION_CONTROL_ARCHIVE_PATH=%s\n' "$archive_output"
printf 'PRODUCTION_CONTROL_ARCHIVE_SHA256=%s\n' "$archive_digest"
printf 'PRODUCTION_CONTROL_ARCHIVE_CHECKSUM_PATH=%s\n' "$checksum_output"
printf 'PRODUCTION_CONTROL_ARCHIVE_PAYLOAD_COUNT=%s\n' "$payload_count"
printf 'PRODUCTION_CONTROL_ARCHIVE_INNER_MANIFEST_SHA256=%s\n' "$inner_manifest_digest"
printf 'PRODUCTION_CONTROL_ARCHIVE_NODE_SHA256=%s\n' "$node_snapshot_sha256"
printf 'PRODUCTION_CONTROL_ARCHIVE_NODE_SOURCE_IDENTITY=%s\n' "$node_source_identity"
