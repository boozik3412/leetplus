#!/usr/bin/bash -p
set -euo pipefail
[[ $# == 0 ]]
exec /usr/local/sbin/leetplus-compose backup
