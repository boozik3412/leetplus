#!/usr/bin/bash -p
set -euo pipefail
[[ $# == 1 ]]
exec /usr/local/sbin/leetplus-compose network --operation "$1"
