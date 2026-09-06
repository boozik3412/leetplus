#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
config_path=/etc/privoxy/leetplus-telegram-http-proxy.conf
service_path=/etc/systemd/system/1337-telegram-http-proxy.service
listener_ip=172.25.0.1
listener_port=18118
network_name=leetplus_telegram_edge_default
network_subnet=172.25.0.0/16
privoxy_version=4.1.0-1

if ! docker network inspect "${network_name}" >/dev/null 2>&1; then
  docker network create \
    --driver bridge \
    --subnet "${network_subnet}" \
    --gateway "${listener_ip}" \
    "${network_name}" >/dev/null
fi

actual_subnet="$(
  docker network inspect "${network_name}" \
    --format '{{(index .IPAM.Config 0).Subnet}}'
)"
actual_gateway="$(
  docker network inspect "${network_name}" \
    --format '{{(index .IPAM.Config 0).Gateway}}'
)"

if [[ "${actual_subnet}" != "${network_subnet}" || "${actual_gateway}" != "${listener_ip}" ]]; then
  echo "Unexpected ${network_name} IPAM: ${actual_subnet} gateway ${actual_gateway}." >&2
  exit 2
fi

if ! ip -4 addr show | grep -Fq "${listener_ip}/"; then
  echo "Required Docker bridge address ${listener_ip} is absent." >&2
  exit 2
fi

if ! command -v privoxy >/dev/null 2>&1; then
  policy_created=false
  if [[ ! -e /usr/sbin/policy-rc.d ]]; then
    printf '#!/bin/sh\nexit 101\n' >/usr/sbin/policy-rc.d
    chmod 0755 /usr/sbin/policy-rc.d
    policy_created=true
  fi

  cleanup_policy() {
    if [[ "${policy_created}" == true ]]; then
      rm -f /usr/sbin/policy-rc.d
    fi
  }
  trap cleanup_policy EXIT

  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    "privoxy=${privoxy_version}"
  cleanup_policy
  trap - EXIT
fi

systemctl disable --now privoxy.service 2>/dev/null || true
systemctl mask privoxy.service >/dev/null

installed_privoxy_version="$(dpkg-query -W -f='${Version}' privoxy)"
if [[ "${installed_privoxy_version}" != "${privoxy_version}" ]]; then
  echo "Unexpected Privoxy version ${installed_privoxy_version}." >&2
  exit 2
fi
install -m 0644 \
  "${script_dir}/1337-telegram-http-proxy.conf" \
  "${config_path}"
install -m 0644 \
  "${script_dir}/1337-telegram-http-proxy.service" \
  "${service_path}"

runuser -u privoxy -- privoxy --config-test "${config_path}"
systemctl daemon-reload
systemctl enable --now 1337-telegram-http-proxy.service

systemctl is-active --quiet tor@default.service
systemctl is-active --quiet 1337-telegram-http-proxy.service
for _ in {1..20}; do
  if ss -ltn | grep -Eq "${listener_ip}:${listener_port}[[:space:]]"; then
    echo "Telegram HTTP proxy bridge is active on ${listener_ip}:${listener_port}."
    exit 0
  fi
  sleep 0.25
done

echo "Telegram HTTP proxy listener did not become ready." >&2
exit 3
