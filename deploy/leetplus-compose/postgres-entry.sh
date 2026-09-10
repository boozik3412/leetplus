#!/bin/sh
set -eu
test "$(id -u)" = 12030
test -f /var/lib/postgresql/16/main/PG_VERSION
test "$(cat /var/lib/postgresql/16/main/PG_VERSION)" = 16
test -f /etc/leetplus-postgres/postgresql.conf
test -f /etc/leetplus-postgres/pg_hba.conf
exec /usr/lib/postgresql/16/bin/postgres \
  -D /var/lib/postgresql/16/main \
  -c config_file=/etc/leetplus-postgres/postgresql.conf \
  -c hba_file=/etc/leetplus-postgres/pg_hba.conf \
  -c listen_addresses=0.0.0.0 \
  -c unix_socket_directories=/tmp
