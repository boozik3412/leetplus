#!/usr/bin/bash -p

[[ $- == *p* ]] || {
  printf 'leetplus bonus-ledger worker: privileged Bash mode is required\n' >&2
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
  printf 'leetplus bonus-ledger worker: %s\n' "$*" >&2
  exit 1
}

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

slot_environment="/etc/leetplus/slots/${slot}.env"
[[ -f "$slot_environment" && ! -L "$slot_environment" ]] \
  || die 'slot environment is absent or linked'
configured_sha="$({
  /usr/bin/sed -n 's/^RELEASE_SHA=//p' "$slot_environment" \
    | /usr/bin/tr -d '"\r'
} | /usr/bin/tail -n 1)"
[[ "$configured_sha" == "$release_sha" ]] \
  || die 'active slot environment is not bound to the release path'

worker_entrypoint="${release_root}/apps/api/dist/guest-gamification/guest-bonus-ledger-worker.cli.js"
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
