#!/usr/bin/env bash
#
# Prepare a blue/green Web cache for exactly one release while its unit is
# stopped. An old cache is moved to a root-only quarantine, never reused across
# release SHAs and never deleted by this script.

set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly RELEASE_SHA_PATTERN='^[0-9a-f]{40}$'
readonly SLOT_PATTERN='^(blue|green)$'

die() {
  printf 'prepare-web-slot-cache: %s\n' "$*" >&2
  exit 1
}

slot=''
release_sha=''
cache_parent='/var/cache'
marker_root='/var/lib/leetplus/web-cache-releases'
service_user=''
unprivileged_test_mode=false
while (($# > 0)); do
  case "$1" in
    --slot) slot="${2:-}"; shift 2 ;;
    --release-sha) release_sha="${2:-}"; shift 2 ;;
    --cache-root) cache_parent="${2:-}"; shift 2 ;;
    --marker-root) marker_root="${2:-}"; shift 2 ;;
    --service-user) service_user="${2:-}"; shift 2 ;;
    --unprivileged-test-mode) unprivileged_test_mode=true; shift ;;
    --help|-h)
      printf 'Usage: prepare-web-slot-cache.sh --slot blue|green --release-sha <40-lowercase-hex>\n'
      exit 0
      ;;
    *) die "unknown argument: $1" ;;
  esac
done

if [[ "$unprivileged_test_mode" == true ]]; then
  ((EUID != 0)) || die 'unprivileged test mode is forbidden for root'
else
  ((EUID == 0)) || die 'cache preparation must run as root'
  [[ "$cache_parent" == '/var/cache' ]] || die 'production cache root cannot be overridden'
  [[ "$marker_root" == '/var/lib/leetplus/web-cache-releases' ]] || die 'production marker root cannot be overridden'
  PATH='/usr/sbin:/usr/bin:/sbin:/bin'
  export PATH
fi
[[ "$slot" =~ $SLOT_PATTERN ]] || die 'slot must be blue or green'
[[ "$release_sha" =~ $RELEASE_SHA_PATTERN ]] || die 'release SHA must be 40 lowercase hexadecimal characters'
if [[ -z "$service_user" ]]; then
  service_user="leetplus-web-${slot}"
fi
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$service_user" == "leetplus-web-${slot}" ]] \
    || die 'production cache owner must be the exact slot Web identity'
fi
for command_name in awk chmod chown date find getent install mv realpath stat sync systemctl timeout tr; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: $command_name"
done
if [[ "$unprivileged_test_mode" == false ]]; then
  service_gid="$(getent passwd "$service_user" | awk -F: '{ print $4 }')"
  [[ -n "$service_gid" ]] || die 'production slot Web identity does not exist'
  service_group="$(getent group "$service_gid" | awk -F: '{ print $1 }')"
  [[ "$service_group" == 'leetplus-runtime' ]] \
    || die 'production slot Web identity primary group must be leetplus-runtime'
fi

unit="leetplus-web@${slot}.service"
active_state="$(timeout 10 systemctl show --property=ActiveState --value "$unit")" \
  || die 'cannot prove Web slot unit state'
[[ "$active_state" == 'inactive' || "$active_state" == 'failed' ]] \
  || die "Web slot must be stopped before cache preparation (state=${active_state})"

cache_directory="${cache_parent}/leetplus-web-${slot}"
quarantine_root="${cache_parent}/leetplus-web-retired"
if [[ -e "$marker_root" || -L "$marker_root" ]]; then
  [[ -d "$marker_root" && ! -L "$marker_root" ]] || die 'cache marker root is not a real directory'
fi
if [[ "$unprivileged_test_mode" == true ]]; then
  install -d -m 0700 -- "$marker_root"
else
  install -d -o root -g leetplus-runtime -m 0750 -- "$marker_root"
fi
marker_root="$(realpath -e -- "$marker_root")"
authoritative_marker="${marker_root}/${slot}.sha"
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$(stat -c '%U' -- "$marker_root")" == 'root' \
    && -z "$(find -P "$marker_root" -maxdepth 0 -perm /022 -print -quit)" ]] \
    || die 'cache marker root must be root-owned and non-writable by group/other'
fi
[[ -d "$cache_parent" && ! -L "$cache_parent" ]] || die 'cache root is absent or unsafe'
cache_parent="$(realpath -e -- "$cache_parent")"
if [[ "$unprivileged_test_mode" == false ]]; then
  [[ "$cache_parent" == '/var/cache' ]] || die 'cache parent is not canonical /var/cache'
fi
cache_directory="${cache_parent}/leetplus-web-${slot}"
quarantine_root="${cache_parent}/leetplus-web-retired"

if [[ "$unprivileged_test_mode" == true ]]; then
  install -d -m 0700 -- "$quarantine_root"
else
  install -d -o root -g root -m 0700 -- "$quarantine_root"
fi
if [[ -e "$cache_directory" || -L "$cache_directory" ]]; then
  [[ -d "$cache_directory" && ! -L "$cache_directory" ]] || die 'slot cache path is not a real directory'
  marker_is_trusted=false
  if [[ -f "$authoritative_marker" && ! -L "$authoritative_marker" ]]; then
    if [[ "$unprivileged_test_mode" == true ]]; then
      marker_is_trusted=true
    elif [[ "$(stat -c '%U' -- "$authoritative_marker")" == 'root' \
      && "$(stat -c '%a' -- "$authoritative_marker")" == '440' \
      && "$(stat -c '%h' -- "$authoritative_marker")" == '1' \
      && "$(stat -c '%U' -- "$cache_directory")" == "$service_user" \
      && "$(stat -c '%G' -- "$cache_directory")" == 'leetplus-runtime' \
      && "$(stat -c '%a' -- "$cache_directory")" == '750' ]]; then
      marker_is_trusted=true
    fi
  fi
  if [[ "$marker_is_trusted" == true \
    && "$(tr -d '\r\n' < "$authoritative_marker")" == "$release_sha" ]]; then
    printf 'WEB_CACHE_ALREADY_PREPARED_SLOT=%s\n' "$slot"
    printf 'WEB_CACHE_ALREADY_PREPARED_SHA=%s\n' "$release_sha"
    exit 0
  fi
  quarantine_path="${quarantine_root}/$(date -u +%Y%m%dT%H%M%S%NZ)-${slot}"
  [[ ! -e "$quarantine_path" && ! -L "$quarantine_path" ]] || die 'cache quarantine collision'
  mv -T -- "$cache_directory" "$quarantine_path"
  sync -d "$cache_parent"
fi

if [[ "$unprivileged_test_mode" == true ]]; then
  install -d -m 0750 -- "$cache_directory"
else
  install -d -o "$service_user" -g leetplus-runtime -m 0750 -- "$cache_directory"
fi
marker_temporary="${marker_root}/.${slot}.sha.new.$$"
printf '%s\n' "$release_sha" > "$marker_temporary"
if [[ "$unprivileged_test_mode" == false ]]; then
  chown root:leetplus-runtime -- "$marker_temporary"
fi
chmod 0440 -- "$marker_temporary"
mv -T -- "$marker_temporary" "$authoritative_marker"
sync -f "$authoritative_marker"
sync -d "$marker_root"

printf 'WEB_CACHE_PREPARED_SLOT=%s\n' "$slot"
printf 'WEB_CACHE_PREPARED_SHA=%s\n' "$release_sha"
printf 'WEB_CACHE_OLD_DATA_DELETED=false\n'
