#!/usr/bin/env bash
# Install or update lp on the production host. Enables nothing by itself;
# the one-time switch of timers/boot from the legacy controller is `lp adopt --yes`.
set -euo pipefail
[[ $EUID == 0 ]] || { echo "run as root" >&2; exit 1; }
src=$(cd "$(dirname "$0")" && pwd)
dest=/opt/leetplus-deploy
install -d -m 0700 "$dest" /var/lib/leetplus-deploy
install -m 0700 "$src/lp.mjs" "$dest/lp.mjs"
ln -sfn "$dest/lp.mjs" /usr/local/sbin/lp
for unit in "$src"/systemd/*; do install -m 0644 "$unit" /etc/systemd/system/; done
systemctl daemon-reload
echo "lp installed: $(sha256sum "$dest/lp.mjs" | cut -c1-12)"
