#!/usr/bin/bash -p
set -euo pipefail
[[ $EUID == 0 ]]
unset BASH_ENV ENV NODE_OPTIONS NODE_PATH LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 0077
control_root=$(dirname -- "$(readlink -f -- "$0")")
[[ "$control_root" =~ ^/usr/local/lib/leetplus-compose/[a-f0-9]{40}$ ]]
[[ -d /var/lib/leetplus-compose && ! -L /var/lib/leetplus-compose ]]
[[ $(stat -c '%u:%g:%a' /var/lib/leetplus-compose) == '0:0:700' ]]
lock_mode=--exclusive
extra_lock=()
case "${1:-}" in
  status|boot) lock_mode=--shared ;;
  backup)
    lock_mode=--shared
    extra_lock=(/usr/bin/flock --exclusive --nonblock /var/lib/leetplus-compose/backup.lock)
    ;;
  worker-run)
    [[ $# == 3 && "$2" == --name ]]
    [[ "$3" == bonus-ledger-worker || "$3" == langame-daily-worker ]]
    lock_mode=--shared
    extra_lock=(/usr/bin/flock --exclusive --nonblock "/var/lib/leetplus-compose/$3.lock")
    ;;
esac
exec /usr/bin/env -i PATH="$PATH" LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC \
  "${extra_lock[@]}" /usr/bin/flock "$lock_mode" --nonblock /var/lib/leetplus-compose/control.lock \
  /usr/bin/env LEETPLUS_COMPOSE_LOCKED=1 /usr/bin/node "$control_root/control.mjs" "$@"
