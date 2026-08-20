#!/usr/bin/env bash
#
# Convert one hydrated SHA directory into a root-owned, service-readable and
# service-non-writable release. This does not switch a slot or touch runtime.

set -euo pipefail
IFS=$'\n\t'

if ((EUID == 0)); then
  PATH='/usr/sbin:/usr/bin:/sbin:/bin'
  export PATH
fi

readonly RELEASE_SHA_PATTERN='^[0-9a-f]{40}$'

die() {
  printf 'seal-release-artifact: %s\n' "$*" >&2
  exit 1
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

if [[ "$dry_run" == false ]]; then
  ((EUID == 0)) || die 'production sealing must run as root'
  [[ "$release_root" == '/srv/leetplus/releases' \
    || "$release_root" == '/srv/leetplus/release-promotions' ]] \
    || die 'production release root must be an exact reviewed release/promotions root'
  [[ "$service_user" =~ ^leetplus-api-(blue|green)$ ]] \
    || die 'production service user must be the exact candidate slot API identity'
  PATH='/usr/sbin:/usr/bin:/sbin:/bin'
  export PATH
elif ((EUID == 0)); then
  PATH='/usr/sbin:/usr/bin:/sbin:/bin'
  export PATH
fi

for command_name in awk find getent mkdir node realpath sha256sum stat; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done

[[ -d "$release_root" && ! -L "$release_root" && "$release_root" != '/' ]] || die 'release root must be a real non-root directory'
release_root="$(realpath -e -- "$release_root")"
release_directory="${release_root}/${release_sha}"
[[ -d "$release_directory" && ! -L "$release_directory" ]] || die 'exact release directory is absent or is a symlink'

service_record="$(getent passwd "$service_user")" || die 'service user does not exist'
service_uid="$(printf '%s\n' "$service_record" | awk -F: '{ print $3 }')"
service_gid="$(printf '%s\n' "$service_record" | awk -F: '{ print $4 }')"
[[ "$service_uid" =~ ^[1-9][0-9]*$ ]] || die 'service user must be unprivileged'
service_group="$(getent group "$service_gid" | awk -F: '{ print $1 }')"
[[ -n "$service_group" ]] || die 'cannot resolve service primary group'
if [[ "$dry_run" == false ]]; then
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
  [[ -z "$(find -P "$runtime_cache_mount" -mindepth 1 -print -quit)" ]] || die 'artifact Web runtime cache mountpoint must be empty before sealing'
fi

special_entry="$(find -P "$release_directory" -xdev ! -type d ! -type f ! -type l -print -quit)"
[[ -z "$special_entry" ]] || die 'release contains a special filesystem entry'

while IFS= read -r -d '' link_path; do
  link_target="$(realpath -e -- "$link_path")" || die 'release contains a dangling symlink'
  case "$link_target" in
    "$release_directory"|"$release_directory"/*) ;;
    *) die 'release contains a symlink escaping the release directory' ;;
  esac
done < <(find -P "$release_directory" -xdev -type l -print0)

shared_inode="$(find -P "$release_directory" -xdev -type f -links +1 -print -quit)"
[[ -z "$shared_inode" ]] \
  || die 'release contains a multiply-linked file; hydrate with pnpm package-import-method=copy before sealing'

if [[ "$dry_run" == true ]]; then
  printf 'RELEASE_SEAL_DRY_RUN_SHA=%s\n' "$release_sha"
  printf 'RELEASE_SEAL_DRY_RUN_SERVICE_USER=%s\n' "$service_user"
  printf 'RELEASE_SEAL_DRY_RUN_SERVICE_GROUP=%s\n' "$service_group"
  exit 0
fi

for command_name in chmod chown runuser; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done

mkdir -p -- "$runtime_cache_mount"

find -P "$release_directory" -xdev -type d -exec chmod 0550 -- {} +
find -P "$release_directory" -xdev -type f -perm /111 -exec chmod 0550 -- {} +
find -P "$release_directory" -xdev -type f ! -perm /111 -exec chmod 0440 -- {} +
chown -hR "root:${service_group}" -- "$release_directory"

unexpected_owner="$(find -P "$release_directory" -xdev \
  \( -type d -o -type f -o -type l \) ! -user root -print -quit)"
[[ -z "$unexpected_owner" ]] || die 'sealed release contains a non-root-owned entry'
writable_entry="$(find -P "$release_directory" -xdev \
  \( -type d -o -type f \) -perm /022 -print -quit)"
[[ -z "$writable_entry" ]] || die 'sealed release remains group/other-writable'

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
