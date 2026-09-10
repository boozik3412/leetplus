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
exec /usr/bin/env -i PATH="$PATH" LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC \
  /usr/bin/flock --exclusive --nonblock /var/lib/leetplus-compose/control.lock \
  /usr/bin/env LEETPLUS_COMPOSE_LOCKED=1 /usr/bin/node "$control_root/control.mjs" "$@"
