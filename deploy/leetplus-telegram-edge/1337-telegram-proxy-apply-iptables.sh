#!/usr/bin/env bash
set -euo pipefail

ipset_name=telegram_proxy
redsocks_port=12345

iptables -t nat -N TG_PROXY 2>/dev/null || true
iptables -t nat -F TG_PROXY

iptables -t nat -A TG_PROXY -d 0.0.0.0/8 -j RETURN
iptables -t nat -A TG_PROXY -d 10.0.0.0/8 -j RETURN
iptables -t nat -A TG_PROXY -d 127.0.0.0/8 -j RETURN
iptables -t nat -A TG_PROXY -d 169.254.0.0/16 -j RETURN
iptables -t nat -A TG_PROXY -d 172.16.0.0/12 -j RETURN
iptables -t nat -A TG_PROXY -d 192.168.0.0/16 -j RETURN
# RFC 2544 benchmarking space is the router-owned fake-IP pool. Never send it
# to redsocks/Tor because a raw fake address cannot preserve the hostname.
iptables -t nat -A TG_PROXY -d 198.18.0.0/15 -j RETURN
iptables -t nat -A TG_PROXY -p tcp -m set --match-set "${ipset_name}" dst -m multiport --dports 80,443 -j REDIRECT --to-ports "${redsocks_port}"
iptables -t nat -A TG_PROXY -j RETURN

iptables -t nat -C OUTPUT -p tcp -m multiport --dports 80,443 -j TG_PROXY 2>/dev/null || \
  iptables -t nat -A OUTPUT -p tcp -m multiport --dports 80,443 -j TG_PROXY

iptables -t nat -C PREROUTING -i docker0 -p tcp -m multiport --dports 80,443 -j TG_PROXY 2>/dev/null || \
  iptables -t nat -A PREROUTING -i docker0 -p tcp -m multiport --dports 80,443 -j TG_PROXY

while read -r bridge_id; do
  ifname="br-${bridge_id}"
  if ip link show "${ifname}" >/dev/null 2>&1; then
    iptables -t nat -C PREROUTING -i "${ifname}" -p tcp -m multiport --dports 80,443 -j TG_PROXY 2>/dev/null || \
      iptables -t nat -A PREROUTING -i "${ifname}" -p tcp -m multiport --dports 80,443 -j TG_PROXY
  fi
done < <(docker network ls --filter driver=bridge --format '{{.ID}}')
