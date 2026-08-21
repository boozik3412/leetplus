#!/usr/bin/bash -p
# Exact UID-scoped OUTPUT policy for the N-1 HTTP pair.

[[ $- == *p* ]] || { printf 'apply-legacy-rollback-egress: privileged Bash mode is required\n' >&2; exit 1; }
LEETPLUS_BOOTSTRAP_TEST_PATH=''
LEETPLUS_BOOTSTRAP_IS_TEST=false
declare -a LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT=()
for LEETPLUS_BOOTSTRAP_ARGUMENT in "$@"; do
  if [[ "$LEETPLUS_BOOTSTRAP_ARGUMENT" == '--unprivileged-test-mode' && EUID -ne 0 ]]; then
    LEETPLUS_BOOTSTRAP_IS_TEST=true
    LEETPLUS_BOOTSTRAP_TEST_PATH="${PATH:-}"
    break
  fi
done
unset LEETPLUS_BOOTSTRAP_ARGUMENT
if [[ "$LEETPLUS_BOOTSTRAP_IS_TEST" == true ]]; then
  while IFS= read -r LEETPLUS_INHERITED_ENVIRONMENT_NAME; do
    [[ "$LEETPLUS_INHERITED_ENVIRONMENT_NAME" == TEST_* || "$LEETPLUS_INHERITED_ENVIRONMENT_NAME" == LEETPLUS_TEST_* ]] \
      && LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT+=("${LEETPLUS_INHERITED_ENVIRONMENT_NAME}=${!LEETPLUS_INHERITED_ENVIRONMENT_NAME}")
  done < <(compgen -e)
fi
while IFS= read -r LEETPLUS_INHERITED_ENVIRONMENT_NAME; do
  unset "$LEETPLUS_INHERITED_ENVIRONMENT_NAME" 2>/dev/null || true
done < <(compgen -e)
unset LEETPLUS_INHERITED_ENVIRONMENT_NAME
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C.UTF-8'
LC_ALL='C.UTF-8'
TZ='UTC'
export PATH LANG LC_ALL TZ
if [[ "$LEETPLUS_BOOTSTRAP_IS_TEST" == true ]]; then
  for LEETPLUS_BOOTSTRAP_TEST_ASSIGNMENT in "${LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT[@]}"; do export "$LEETPLUS_BOOTSTRAP_TEST_ASSIGNMENT"; done
fi
unset LEETPLUS_BOOTSTRAP_IS_TEST LEETPLUS_BOOTSTRAP_TEST_ENVIRONMENT LEETPLUS_BOOTSTRAP_TEST_ASSIGNMENT

set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly TABLE='leetplus_nminus1'

die() {
  printf 'apply-legacy-rollback-egress: %s\n' "$*" >&2
  exit 1
}

mode='apply'
test_mode=false
api_uid=''
web_uid=''
while (($# > 0)); do
  case "$1" in
    --verify) mode='verify'; shift ;;
    --unprivileged-test-mode) test_mode=true; shift ;;
    --api-uid) api_uid="${2:-}"; shift 2 ;;
    --web-uid) web_uid="${2:-}"; shift 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done

if [[ "$test_mode" == true ]]; then
  ((EUID != 0)) || die 'unprivileged test mode is forbidden for root'
  PATH="$LEETPLUS_BOOTSTRAP_TEST_PATH"
  export PATH
else
  ((EUID == 0)) || die 'production egress policy requires root'
  [[ -z "$api_uid" && -z "$web_uid" ]] || die 'production UIDs cannot be overridden'
fi
unset LEETPLUS_BOOTSTRAP_TEST_PATH
for command_name in awk cat nft sed timeout; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: ${command_name}"
done

if [[ "$test_mode" == false ]]; then
  command -v getent >/dev/null 2>&1 || die 'required command is unavailable: getent'
  api_uid="$(getent passwd leetplus-api-nminus1 | awk -F: 'NF == 7 { print $3 }')"
  web_uid="$(getent passwd leetplus-web-nminus1 | awk -F: 'NF == 7 { print $3 }')"
fi
[[ "$api_uid" =~ ^[1-9][0-9]*$ && "$web_uid" =~ ^[1-9][0-9]*$ && "$api_uid" != "$web_uid" ]] \
  || die 'isolated rollback UIDs are absent, root, invalid or equal'

if [[ "$mode" == 'apply' ]]; then
  table_prefix=''
  if timeout --foreground --kill-after=3s 15s nft list table inet "$TABLE" >/dev/null 2>&1; then
    table_prefix="delete table inet ${TABLE}"
  fi
  # One nft batch is one netlink transaction: delete and replacement commit
  # together, so a crash cannot expose a deleted-but-not-replaced fence.
  timeout --foreground --kill-after=3s 15s nft -f - <<NFT
${table_prefix}
table inet ${TABLE} {
  chain output {
    type filter hook output priority filter; policy accept;
    meta skuid ${api_uid} ct state established,related accept
    meta skuid ${api_uid} ip daddr 127.0.0.1 tcp dport 5432 ct state new accept
    meta skuid ${api_uid} ip daddr 127.0.0.1 tcp dport 4301 ct state new accept
    ip daddr 127.0.0.1 tcp dport 4301 reject
    meta skuid ${api_uid} reject
    meta skuid ${web_uid} ct state established,related accept
    meta skuid ${web_uid} ip daddr 127.0.0.1 tcp dport 4300 ct state new accept
    meta skuid ${web_uid} reject
  }
}
NFT
fi

rules="$(timeout --foreground --kill-after=3s 15s nft -nn list table inet "$TABLE")" \
  || die 'N-1 egress table is absent'
normalized_rules="$(sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/[[:space:]]+/ /g; /^[[:space:]]*$/d' <<< "$rules")"
# The fully numeric nft listing canonicalizes the named filter priority,
# conntrack states and the implicit IPv4 reject type.
expected_rules="$(cat <<RULES
table inet ${TABLE} {
chain output {
type filter hook output priority 0; policy accept;
meta skuid ${api_uid} ct state 0x2,0x4 accept
meta skuid ${api_uid} ip daddr 127.0.0.1 tcp dport 5432 ct state 0x8 accept
meta skuid ${api_uid} ip daddr 127.0.0.1 tcp dport 4301 ct state 0x8 accept
ip daddr 127.0.0.1 tcp dport 4301 reject with icmp 3
meta skuid ${api_uid} reject
meta skuid ${web_uid} ct state 0x2,0x4 accept
meta skuid ${web_uid} ip daddr 127.0.0.1 tcp dport 4300 ct state 0x8 accept
meta skuid ${web_uid} reject
}
}
RULES
)"
[[ "$normalized_rules" == "$expected_rules" ]] \
  || die 'N-1 egress table is not the exact ordered table/chain/ruleset'

printf 'LEGACY_ROLLBACK_EGRESS_ACCEPTED=true\n'
printf 'LEGACY_ROLLBACK_EGRESS_API_UID=%s\n' "$api_uid"
printf 'LEGACY_ROLLBACK_EGRESS_WEB_UID=%s\n' "$web_uid"
