#!/usr/bin/bash -p

[[ $- == *p* ]] || {
  printf 'leetplus Langame daily worker: privileged Bash mode is required\n' >&2
  exit 1
}

set -euo pipefail
IFS=$'\n\t'
umask 0077

PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C.UTF-8'
LC_ALL='C.UTF-8'
TZ='UTC'
export PATH LANG LC_ALL TZ

die() {
  printf 'leetplus Langame daily worker: %s\n' "$*" >&2
  exit 1
}

expected_release_sha=''
while (($#)); do
  case "$1" in
    --expected-release-sha)
      [[ $# -eq 2 && -z "$expected_release_sha" && "$2" =~ ^[0-9a-f]{40}$ ]] \
        || die 'expected release SHA must be supplied exactly once'
      expected_release_sha="$2"
      shift 2
      ;;
    *) die "unknown argument: $1" ;;
  esac
done
[[ -n "$expected_release_sha" ]] || die 'an exact authorized release SHA is required'

# This runner is executable by the DynamicUser, so it independently proves it
# remains the main process of the dedicated systemd unit after the wrapper's
# exec.  A direct API-runtime invocation cannot reuse a permit.
[[ "${INVOCATION_ID:-}" =~ ^[0-9a-f]{32}$ ]] || die 'systemd InvocationID is absent or invalid'
systemctl_bounded() { /usr/bin/timeout --kill-after=2s 10s /usr/bin/systemctl "$@"; }
unit_main_pid="$(systemctl_bounded show --property=MainPID --value leetplus-langame-daily-worker.service)"
unit_invocation="$(systemctl_bounded show --property=InvocationID --value leetplus-langame-daily-worker.service)"
[[ "$unit_main_pid" == "$$" && "$unit_invocation" == "$INVOCATION_ID" ]] \
  || die 'active worker runner is not the fresh main process of its exact systemd invocation'

active_upstream='/etc/nginx/leetplus/active-upstreams.conf'
[[ -L "$active_upstream" ]] || die 'active nginx upstream must be a symlink'
active_target="$(/usr/bin/readlink -e -- "$active_upstream")"

case "$active_target" in
  /etc/nginx/leetplus/upstreams/blue.conf) slot='blue' ;;
  /etc/nginx/leetplus/upstreams/green.conf) slot='green' ;;
  *) die 'active nginx upstream does not resolve to an admitted slot' ;;
esac

slot_link="/srv/leetplus/slots/${slot}"
[[ -L "$slot_link" ]] || die "${slot} slot must be a symlink"
release_root="$(/usr/bin/readlink -e -- "$slot_link")"
[[ "$release_root" =~ ^/srv/leetplus/releases/([0-9a-f]{40})$ ]] \
  || die 'active slot does not resolve to an immutable release path'
release_sha="${BASH_REMATCH[1]}"
[[ "$expected_release_sha" == "$release_sha" ]] \
  || die 'active slot changed after worker authorization; refusing a different release'

slot_environment="/etc/leetplus/slots/${slot}.env"
[[ -f "$slot_environment" && ! -L "$slot_environment" ]] \
  || die 'slot environment is absent or linked'
configured_sha="$( {
  /usr/bin/sed -n 's/^RELEASE_SHA=//p' "$slot_environment" \
    | /usr/bin/tr -d '"\r'
} | /usr/bin/tail -n 1)"
[[ "$configured_sha" == "$release_sha" ]] \
  || die 'active slot environment is not bound to the release path'

worker_entrypoint="${release_root}/apps/api/dist/integrations/langame-daily-worker.cli.js"
[[ -f "$worker_entrypoint" && ! -L "$worker_entrypoint" ]] \
  || die 'worker entrypoint is absent or linked'
[[ "$(/usr/bin/stat -c '%U:%G:%h' -- "$worker_entrypoint")" \
    == 'root:leetplus-runtime:1' ]] \
  || die 'worker entrypoint owner, group or link count is not admitted'
worker_permissions="$(/usr/bin/stat -c '%A' -- "$worker_entrypoint")"
[[ "${worker_permissions:5:1}" != w && "${worker_permissions:8:1}" != w ]] \
  || die 'worker entrypoint is group/other writable'

cd -- "$release_root"
exec /usr/bin/node "$worker_entrypoint"
