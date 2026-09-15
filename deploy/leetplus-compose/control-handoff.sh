#!/usr/bin/bash -p
set -euo pipefail
[[ $EUID == 0 ]]
control_root=$(dirname -- "$(readlink -f -- "$0")")
[[ "$control_root" =~ ^/usr/local/lib/leetplus-compose/[a-f0-9]{40}$ ]]
exec /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC \
  /usr/bin/python3 -I -S -E "$control_root/control_handoff.py" "$@"
