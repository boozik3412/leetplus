#!/usr/bin/bash -p
#
# Convert one hydrated SHA directory into a root-owned, service-readable and
# service-non-writable release. This does not switch a slot or touch runtime.

[[ "$-" == *p* ]] || {
  printf 'seal-release-artifact: execute the installed script directly with its privileged Bash shebang\n' >&2
  exit 1
}
while IFS= read -r inherited_environment_name; do
  unset "$inherited_environment_name" 2>/dev/null || true
done < <(compgen -e)
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C.UTF-8'
LC_ALL='C.UTF-8'
TZ='UTC'
export PATH LANG LC_ALL TZ

set -euo pipefail
IFS=$'\n\t'

readonly RELEASE_SHA_PATTERN='^[0-9a-f]{40}$'

die() {
  printf 'seal-release-artifact: %s\n' "$*" >&2
  exit 1
}

path_is_not_group_or_other_writable() {
  local candidate_mode
  candidate_mode="$(stat -c '%a' -- "$1")" || return 1
  (( (8#$candidate_mode & 8#22) == 0 ))
}

find_has_match() {
  local probe_path find_status
  probe_path="$(mktemp "${TMPDIR:-/tmp}/leetplus-seal-find.XXXXXX")" \
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

usage() {
  cat <<'USAGE'
Usage:
  seal-release-artifact.sh \
    --release-sha <40-lowercase-hex> \
    --release-root <existing-absolute-directory> \
    --service-user <unprivileged-user> \
    [--dry-run]

Production mode must run as root. It changes only
<release-root>/<release-sha>: owner root:<service-primary-group>, directories
0550, executable regular files 0550 and other regular files 0440. Symlink
targets must stay inside the release. --dry-run validates without mutation.
USAGE
}

release_sha=''
release_root=''
service_user=''
dry_run=false

while (($# > 0)); do
  case "$1" in
    --release-sha)
      (($# >= 2)) || die '--release-sha requires a value'
      release_sha="$2"
      shift 2
      ;;
    --release-root)
      (($# >= 2)) || die '--release-root requires a value'
      release_root="$2"
      shift 2
      ;;
    --service-user)
      (($# >= 2)) || die '--service-user requires a value'
      service_user="$2"
      shift 2
      ;;
    --dry-run)
      dry_run=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

[[ "$release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'release SHA must be 40 lowercase hexadecimal characters'
[[ -n "$release_root" && -n "$service_user" ]] || {
  usage >&2
  exit 1
}

production_authority=false
if [[ "$dry_run" == false ]]; then
  ((EUID == 0)) || die 'production sealing must run as root'
  [[ "$release_root" == '/srv/leetplus/releases' \
    || "$release_root" == '/srv/leetplus/release-promotions' ]] \
    || die 'production release root must be an exact reviewed release/promotions root'
  [[ "$service_user" =~ ^leetplus-api-(blue|green)$ ]] \
    || die 'production service user must be the exact candidate slot API identity'
  production_authority=true
  PATH='/usr/sbin:/usr/bin:/sbin:/bin'
  export PATH
elif ((EUID == 0)); then
  if [[ "$release_root" == '/srv/leetplus/releases' \
    || "$release_root" == '/srv/leetplus/release-promotions' ]]; then
    [[ "$service_user" =~ ^leetplus-api-(blue|green)$ ]] \
      || die 'production dry-run service user must be the exact candidate slot API identity'
    production_authority=true
  fi
  PATH='/usr/sbin:/usr/bin:/sbin:/bin'
  export PATH
fi

for command_name in awk find getent mkdir mktemp node realpath rm sha256sum stat; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done

[[ -d "$release_root" && ! -L "$release_root" && "$release_root" != '/' ]] || die 'release root must be a real non-root directory'
release_root="$(realpath -e -- "$release_root")"
release_directory="${release_root}/${release_sha}"
[[ -d "$release_directory" && ! -L "$release_directory" ]] || die 'exact release directory is absent or is a symlink'
[[ "$(realpath -e -- "$release_directory")" == "$release_directory" ]] \
  || die 'exact release directory traverses a symlink'
[[ "$(stat -c '%d' -- "$release_directory")" == "$(stat -c '%d' -- "$release_root")" ]] \
  || die 'exact release directory is on an unexpected filesystem'

assert_no_release_mounts() {
  [[ -r /proc/self/mountinfo ]] || die 'mount inventory is unavailable'
  awk -v release="$release_directory" '
    $5 == release || index($5, release "/") == 1 { found = 1 }
    END { exit found ? 1 : 0 }
  ' /proc/self/mountinfo || die 'release contains an exact or nested mountpoint'
}

assert_production_release_root_authority() {
  local trusted_directory
  for trusted_directory in / /srv /srv/leetplus; do
    [[ -d "$trusted_directory" && ! -L "$trusted_directory" \
      && "$(realpath -e -- "$trusted_directory")" == "$trusted_directory" \
      && "$(stat -c '%u:%g' -- "$trusted_directory")" == '0:0' ]] \
      && path_is_not_group_or_other_writable "$trusted_directory" \
      || die "production release-root ancestor is not root-controlled: ${trusted_directory}"
  done
  case "$release_root" in
    /srv/leetplus/release-promotions)
      [[ "$(stat -c '%U:%G:%a' -- "$release_root")" == \
        'root:leetplus-runtime:710' ]] \
        || die 'production promotion root must be exact root:leetplus-runtime mode 0710'
      ;;
    /srv/leetplus/releases)
      [[ "$(stat -c '%u:%g' -- "$release_root")" == '0:0' ]] \
        && path_is_not_group_or_other_writable "$release_root" \
        || die 'production final release root must be root:root and non-writable by group/other'
      ;;
    *)
      die 'production release-root authority path is unexpected'
      ;;
  esac
}

assert_no_release_mounts
if [[ "$production_authority" == true ]]; then
  assert_production_release_root_authority
fi

service_record="$(getent passwd "$service_user")" || die 'service user does not exist'
service_uid="$(printf '%s\n' "$service_record" | awk -F: '{ print $3 }')"
service_gid="$(printf '%s\n' "$service_record" | awk -F: '{ print $4 }')"
[[ "$service_uid" =~ ^[1-9][0-9]*$ ]] || die 'service user must be unprivileged'
service_group="$(getent group "$service_gid" | awk -F: '{ print $1 }')"
[[ -n "$service_group" ]] || die 'cannot resolve service primary group'
if [[ "$production_authority" == true ]]; then
  [[ "$service_group" == 'leetplus-runtime' ]] \
    || die 'production candidate API primary group must be leetplus-runtime'
fi

(
  cd -- "$release_directory"
  sha256sum --strict --check --quiet SHA256SUMS
) || die 'internal SHA256SUMS verification failed before sealing'

node - "$release_directory/release-provenance.json" "$release_sha" <<'NODE'
const fs = require('node:fs');
const [filePath, expectedSha] = process.argv.slice(2);
const provenance = JSON.parse(fs.readFileSync(filePath, 'utf8'));
if (provenance.releaseSha !== expectedSha) throw new Error('release provenance SHA mismatch');
NODE

[[ -f "$release_directory/HYDRATED_SHA256SUMS" && ! -L "$release_directory/HYDRATED_SHA256SUMS" ]] \
  || die 'post-hydration runtime manifest is absent or unsafe'
(
  cd -- "$release_directory"
  sha256sum --strict --check --quiet HYDRATED_SHA256SUMS
) || die 'post-hydration runtime manifest verification failed before sealing'

runtime_cache_mount="${release_directory}/apps/web/.next/cache"
if [[ -e "$runtime_cache_mount" || -L "$runtime_cache_mount" ]]; then
  [[ -d "$runtime_cache_mount" && ! -L "$runtime_cache_mount" ]] || die 'Web runtime cache mountpoint must be a real directory'
  if find_has_match -P "$runtime_cache_mount" -mindepth 1; then
    die 'artifact Web runtime cache mountpoint must be empty before sealing'
  fi
fi

if find_has_match -P "$release_directory" -xdev ! -type d ! -type f ! -type l; then
  die 'release contains a special filesystem entry'
fi

link_inventory="$(mktemp "${TMPDIR:-/tmp}/leetplus-seal-links.XXXXXX")" \
  || die 'cannot allocate the release symlink inventory'
trap '[[ -z "$link_inventory" ]] || rm -f -- "$link_inventory"' EXIT
find_status=0
find -P "$release_directory" -xdev -type l -print0 > "$link_inventory" \
  || find_status=$?
((find_status == 0)) || die 'release symlink inventory producer failed'
while IFS= read -r -d '' link_path; do
  link_target="$(realpath -e -- "$link_path")" || die 'release contains a dangling symlink'
  case "$link_target" in
    "$release_directory"|"$release_directory"/*) ;;
    *) die 'release contains a symlink escaping the release directory' ;;
  esac
done < "$link_inventory"
rm -f -- "$link_inventory"
link_inventory=''

node - "$release_directory" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const [root] = process.argv.slice(2);
const manifestPath = path.join(root, 'HYDRATED_SYMLINKS.json');
const compareUtf8 = (left, right) =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

function fail(message) {
  throw new Error(message);
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
  ) fail(`hydrated symlink path is not canonical: ${relativePath}`);
}

function collect(directory, relativeDirectory = '', links = []) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareUtf8(left.name, right.name));
  for (const entry of entries) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    assertCanonicalPath(relativePath);
    const absolutePath = path.join(root, ...relativePath.split('/'));
    const stat = fs.lstatSync(absolutePath);
    if (stat.isDirectory()) {
      collect(absolutePath, relativePath, links);
      continue;
    }
    if (!stat.isSymbolicLink()) continue;
    const target = fs.readlinkSync(absolutePath, 'utf8');
    if (
      target.length === 0 ||
      target !== target.normalize('NFC') ||
      path.posix.isAbsolute(target) ||
      path.posix.normalize(target) !== target ||
      /[\\\u0000-\u001f\u007f]/u.test(target)
    ) fail(`hydrated symlink target is not canonical: ${relativePath}`);
    const resolved = fs.realpathSync.native(absolutePath);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      fail(`hydrated symlink escapes the release: ${relativePath}`);
    }
    links.push({ path: relativePath, target });
  }
  return links;
}

const manifestStat = fs.lstatSync(manifestPath);
if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > 8 * 1024 * 1024) {
  fail('hydrated symlink manifest is absent or unsafe');
}
const text = fs.readFileSync(manifestPath, 'utf8');
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  fail('hydrated symlink manifest is not valid JSON');
}
const links = collect(root)
  .sort((left, right) => compareUtf8(left.path, right.path) || compareUtf8(left.target, right.target));
const canonical = `${JSON.stringify({ links, version: 1 })}\n`;
if (
  text !== canonical ||
  parsed?.version !== 1 ||
  !Array.isArray(parsed?.links)
) fail('hydrated symlink manifest differs from the exact release topology');
NODE

if find_has_match -P "$release_directory" -xdev -type f -links +1; then
  die 'release contains a multiply-linked file; hydrate with pnpm package-import-method=copy before sealing'
fi

assert_exact_sealed_metadata() {
  if find_has_match -P "$release_directory" -xdev \
    \( -type d -o -type f -o -type l \) \
    \( ! -user root -o ! -group "$service_group" \); then
    die 'sealed release entry owner/group differs from exact root:runtime authority'
  fi
  if find_has_match -P "$release_directory" -xdev -type d ! -perm 0550; then
    die 'sealed release directory mode differs from exact 0550 authority'
  fi
  if find_has_match -P "$release_directory" -xdev \
    -type f ! -perm 0440 ! -perm 0550; then
    die 'sealed release regular-file mode differs from exact 0440/0550 authority'
  fi
}

if [[ "$dry_run" == true ]]; then
  if [[ "$production_authority" == true ]]; then
    assert_exact_sealed_metadata
  fi
  printf 'RELEASE_SEAL_DRY_RUN_SHA=%s\n' "$release_sha"
  printf 'RELEASE_SEAL_DRY_RUN_SERVICE_USER=%s\n' "$service_user"
  printf 'RELEASE_SEAL_DRY_RUN_SERVICE_GROUP=%s\n' "$service_group"
  exit 0
fi

for command_name in chmod chown runuser; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done

assert_no_release_mounts
mkdir -p -- "$runtime_cache_mount"

# Re-attest immediately before the ownership effect. Even if a nested mount
# appeared after the initial manifest checks, fail before any recursive walk.
assert_no_release_mounts

find -P "$release_directory" -xdev -type d -exec chmod 0550 -- {} +
find -P "$release_directory" -xdev -type f -perm /111 -exec chmod 0550 -- {} +
find -P "$release_directory" -xdev -type f ! -perm /111 -exec chmod 0440 -- {} +
find -P "$release_directory" -xdev \
  \( -type d -o -type f -o -type l \) \
  -exec chown -h "root:${service_group}" -- {} +
assert_no_release_mounts
assert_exact_sealed_metadata

if find_has_match -P "$release_directory" -xdev \
  \( -type d -o -type f -o -type l \) ! -user root; then
  die 'sealed release contains a non-root-owned entry'
fi
if find_has_match -P "$release_directory" -xdev \
  \( -type d -o -type f \) -perm /022; then
  die 'sealed release remains group/other-writable'
fi

runuser -u "$service_user" -- test -r "$release_directory/apps/api/dist/main.js" || die 'service user cannot read API runtime'
runuser -u "$service_user" -- test -r "$release_directory/apps/web/.next/BUILD_ID" || die 'service user cannot read Web identity'
runuser -u "$service_user" -- test -x "$release_directory/apps/api/dist" || die 'service user cannot search API runtime directory'
runuser -u "$service_user" -- test -x "$release_directory/apps/web/.next" || die 'service user cannot search Web runtime directory'

(
  cd -- "$release_directory"
  sha256sum --strict --check --quiet SHA256SUMS
) || die 'internal SHA256SUMS verification failed after sealing'
(
  cd -- "$release_directory"
  sha256sum --strict --check --quiet HYDRATED_SHA256SUMS
) || die 'post-hydration runtime manifest verification failed after sealing'

printf 'SEALED_RELEASE_SHA=%s\n' "$release_sha"
printf 'SEALED_RELEASE_OWNER=root\n'
printf 'SEALED_RELEASE_SERVICE_GROUP=%s\n' "$service_group"
printf 'SEALED_RELEASE_SERVICE_USER_PROBE=PASS\n'
