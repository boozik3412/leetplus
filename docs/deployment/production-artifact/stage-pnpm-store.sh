#!/usr/bin/bash -p
# Stage one checksummed, prewarmed pnpm CAS as an immutable read-only production
# input. This script has no network, package execution, runtime or switch step.

[[ "$-" == *p* ]] || {
  printf 'stage-pnpm-store: execute the installed script directly with its privileged Bash shebang\n' >&2
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
umask 0077

die() { printf 'stage-pnpm-store: %s\n' "$*" >&2; exit 1; }

archive=''
archive_sha256=''
lockfile=''
node_major=''
pnpm_version=''
while (($# > 0)); do
  case "$1" in
    --archive) archive="${2:-}"; shift 2 ;;
    --archive-sha256) archive_sha256="${2:-}"; shift 2 ;;
    --lockfile) lockfile="${2:-}"; shift 2 ;;
    --node-major) node_major="${2:-}"; shift 2 ;;
    --pnpm-version) pnpm_version="${2:-}"; shift 2 ;;
    --help|-h) printf 'Usage: stage-pnpm-store.sh --archive <tar.gz> --archive-sha256 <file> --lockfile <pnpm-lock.yaml> --node-major <n> --pnpm-version <x.y.z>\n'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

((EUID == 0)) || die 'pnpm store staging must run as root'
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
export PATH
[[ "$node_major" =~ ^[0-9]+$ ]] || die 'Node major is invalid'
[[ "$pnpm_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die 'pnpm version is invalid'
for command_name in awk basename chmod chown dirname find grep gzip mktemp mv realpath rm sha256sum stat sync tar; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done
[[ -x /usr/bin/node && ! -L /usr/bin/node \
  && "$(stat -c '%u:%g' -- /usr/bin/node)" == '0:0' \
  && "$(/usr/bin/node -p 'process.versions.node.split(".")[0]')" == "$node_major" ]] \
  || die 'exact root-owned /usr/bin/node does not match the requested store ABI'
store_verifier='/usr/local/libexec/leetplus/verify-pnpm-store-integrity.mjs'
[[ -f "$store_verifier" && ! -L "$store_verifier" \
  && "$(realpath -e -- "$store_verifier")" == "$store_verifier" \
  && "$(stat -c '%u:%g' -- "$store_verifier")" == '0:0' \
  && -z "$(find -P "$store_verifier" -maxdepth 0 -perm /022 -print -quit)" ]] \
  || die 'installed pnpm store verifier is absent or unsafe'
verifier_ancestor="$(dirname -- "$store_verifier")"
while :; do
  [[ -d "$verifier_ancestor" && ! -L "$verifier_ancestor" \
    && "$(stat -c '%u:%g' -- "$verifier_ancestor")" == '0:0' \
    && -z "$(find -P "$verifier_ancestor" -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die "pnpm store verifier ancestor is not root-controlled: ${verifier_ancestor}"
  [[ "$verifier_ancestor" == '/' ]] && break
  verifier_ancestor="$(dirname -- "$verifier_ancestor")"
done

archive="$(realpath -e -- "$archive")"
archive_sha256="$(realpath -e -- "$archive_sha256")"
lockfile="$(realpath -e -- "$lockfile")"
[[ -f "$archive" && ! -L "$archive" ]] || die 'store archive is absent or unsafe'
[[ -f "$archive_sha256" && ! -L "$archive_sha256" ]] || die 'store checksum is absent or unsafe'
[[ -f "$lockfile" && ! -L "$lockfile" ]] || die 'release lockfile is absent or unsafe'
archive_name="$(basename -- "$archive")"
expected_digest="$(sha256sum "$archive" | awk '{ print $1 }')"
[[ "$(awk 'NF { count += 1 } END { print count + 0 }' "$archive_sha256")" == '1' ]] || die 'store checksum must have one line'
awk -v digest="$expected_digest" -v name="$archive_name" \
  '$1 == digest && ($2 == name || $2 == "*" name) { ok += 1 } END { exit(ok == 1 ? 0 : 1) }' \
  "$archive_sha256" || die 'store archive checksum mismatch'
gzip --test -- "$archive" || die 'store archive gzip verification failed'

store_root='/srv/leetplus/pnpm-store'
[[ ! -e "$store_root" && ! -L "$store_root" ]] || die 'production pnpm store already exists; replacement requires separate quarantine'
[[ -d /srv/leetplus && ! -L /srv/leetplus ]] || die '/srv/leetplus is absent or unsafe'
[[ "$(realpath -e -- /srv/leetplus)" == '/srv/leetplus' ]] \
  || die '/srv/leetplus path traverses a symlink'
[[ "$(stat -c '%u:%g' -- /srv/leetplus)" == '0:0' \
  && -z "$(find -P /srv/leetplus -maxdepth 0 -perm /022 -print -quit)" ]] \
  || die '/srv/leetplus must be root:root and non-writable by group/other'
listing="$(mktemp /srv/leetplus/.pnpm-store.listing.XXXXXX)"
type_listing="$(mktemp /srv/leetplus/.pnpm-store.types.XXXXXX)"
staging="$(mktemp -d /srv/leetplus/.pnpm-store.staging.XXXXXX)"
cleanup() { rm -f -- "$listing" "$type_listing"; }
trap cleanup EXIT
LC_ALL=C tar --quoting-style=escape -tzf "$archive" > "$listing" || die 'cannot list store archive'
grep -Eq '(^/|(^|/)\.\.(/|$))' "$listing" && die 'store archive contains an unsafe path'
LC_ALL=C tar --quoting-style=escape -tvzf "$archive" > "$type_listing" \
  || die 'cannot inspect store archive member types'
awk 'substr($0, 1, 1) != "-" && substr($0, 1, 1) != "d" { exit 1 }' "$type_listing" \
  || die 'store archive contains a non-regular, non-directory member'
tar -xzf "$archive" --no-same-owner --no-same-permissions -C "$staging" \
  || die "store extraction failed; retained ${staging}"
[[ -n "$(find -P "$staging" -mindepth 1 -print -quit)" ]] || die 'prewarmed store is empty'
[[ -z "$(find -P "$staging" -xdev ! -type d ! -type f -print -quit)" ]] \
  || die 'extracted store contains a non-regular, non-directory entry'
[[ -z "$(find -P "$staging" -xdev -type f -links +1 -print -quit)" ]] || die 'extracted store contains a hardlink'

lockfile_sha="$(sha256sum "$lockfile" | awk '{ print $1 }')"
find -P "$staging" -xdev -type d -exec chmod 0550 -- {} +
find -P "$staging" -xdev -type f -exec chmod 0440 -- {} +
chown -hR root:leetplus-build -- "$staging"
/usr/bin/node "$store_verifier" prepare \
  --store-root "$staging" \
  --lockfile-sha256 "$lockfile_sha" \
  --node-major "$node_major" \
  --pnpm-version "$pnpm_version" \
  --bundle-sha256 "$expected_digest" \
  || die 'cannot create the complete digest-bound pnpm store receipt'
find -P "$staging" -xdev -type d -exec chmod 0550 -- {} +
find -P "$staging" -xdev -type f -exec chmod 0440 -- {} +
chown -hR root:leetplus-build -- "$staging"
/usr/bin/node "$store_verifier" verify \
  --store-root "$staging" \
  --lockfile-sha256 "$lockfile_sha" \
  --node-major "$node_major" \
  --pnpm-version "$pnpm_version" \
  --bundle-sha256 "$expected_digest" \
  || die 'staged pnpm store failed complete integrity verification'
mv -T -- "$staging" "$store_root"
sync -d /srv/leetplus
/usr/bin/node "$store_verifier" verify \
  --store-root "$store_root" \
  --lockfile-sha256 "$lockfile_sha" \
  --node-major "$node_major" \
  --pnpm-version "$pnpm_version" \
  --bundle-sha256 "$expected_digest" \
  || die 'published pnpm store failed complete integrity verification'

printf 'PNPM_STORE_STAGED_LOCKFILE_SHA256=%s\n' "$lockfile_sha"
printf 'PNPM_STORE_STAGED_BUNDLE_SHA256=%s\n' "$expected_digest"
printf 'PNPM_STORE_PACKAGE_CODE_EXECUTED=false\n'
