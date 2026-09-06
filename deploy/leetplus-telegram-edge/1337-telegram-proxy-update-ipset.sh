#!/usr/bin/env bash
set -euo pipefail

ipset_name=telegram_proxy
domains=(
  api.telegram.org
  telegram.org
  core.telegram.org
  desktop.telegram.org
  updates.tdesktop.com
  t.me
  tx.me
  telegra.ph
)

is_router_fake_ip() {
  case "$1" in
    198.18.*|198.19.*) return 0 ;;
    *) return 1 ;;
  esac
}

ipset create "${ipset_name}" hash:ip family inet timeout 86400 -exist

# Router fake-IP addresses must remain owned by the router. Passing them to
# local redsocks/Tor loses the hostname and creates a permanent SOCKS failure.
while read -r member; do
  if is_router_fake_ip "${member}"; then
    ipset del "${ipset_name}" "${member}" 2>/dev/null || true
    echo "removed_router_fake_ip ${member}"
  fi
done < <(
  ipset save "${ipset_name}" |
    awk -v name="${ipset_name}" '$1 == "add" && $2 == name { print $3 }'
)

for domain in "${domains[@]}"; do
  while read -r ip; do
    [[ -n "${ip}" ]] || continue

    if is_router_fake_ip "${ip}"; then
      echo "skip_router_fake_ip ${domain} ${ip}"
      continue
    fi

    ipset add "${ipset_name}" "${ip}" timeout 86400 -exist
    echo "${domain} ${ip}"
  done < <(dig +short A "${domain}" | awk '/^[0-9.]+$/ { print }')
done
