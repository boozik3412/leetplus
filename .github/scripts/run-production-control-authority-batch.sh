#!/usr/bin/env bash
# Run independent production-control CI gates to completion and report every
# failure from the pass. This runner is fixture-only and has no production
# effect authority.

set -uo pipefail
IFS=$'\n\t'
umask 0077

readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly BATCH_PARENT="${RUNNER_TEMP:?RUNNER_TEMP is required}"
readonly BATCH_ROOT="$(mktemp -d "${BATCH_PARENT}/leetplus-production-control-gates.XXXXXX")"
declare -a gate_names=()
declare -a gate_codes=()

cd "$REPOSITORY_ROOT" || exit 1

run_gate() {
  local name="$1"
  shift
  local log_path="${BATCH_ROOT}/${name}.log"
  local exit_path="${BATCH_ROOT}/${name}.exit"
  local code
  printf 'PRODUCTION_CONTROL_BATCH_GATE=%s START\n' "$name"
  "$@" >"$log_path" 2>&1
  code=$?
  printf '%s\n' "$code" >"$exit_path"
  chmod 0600 "$log_path" "$exit_path"
  gate_names+=("$name")
  gate_codes+=("$code")
  printf 'PRODUCTION_CONTROL_BATCH_GATE=%s EXIT=%s\n' "$name" "$code"
}

gate_authority_node() {
  local authority_node
  authority_node="$(realpath -e -- "$(command -v node)")" || return 1
  case "$authority_node" in
    "$RUNNER_TOOL_CACHE"/node/22.*/x64/bin/node) ;;
    *) printf 'unexpected production-control authority Node path: %s\n' "$authority_node" >&2; return 1 ;;
  esac
  printf '%s\n' "$authority_node"
}

gate_install_fixture() {
  local authority_node
  authority_node="$(realpath -e -- "$(command -v node)")" || return 1
  case "$authority_node" in
    "$RUNNER_TOOL_CACHE"/node/22.*/x64/bin/node) ;;
    *) printf 'unexpected production-control authority Node path: %s\n' "$authority_node" >&2; return 1 ;;
  esac
  sudo -n /usr/bin/env -i \
    CI=true \
    GITHUB_ACTIONS=true \
    LEETPLUS_FIXTURE_NODE="$authority_node" \
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TZ=UTC \
    /usr/bin/bash --noprofile --norc -p \
    .github/scripts/test-production-control-install-authority.sh
}

gate_retirement_fixture() {
  # The fixture owns every process that can intentionally hold its temporary
  # targets. Isolate that tree from unrelated runner/container FD churn while
  # keeping the real /proc descriptor guard and inherited-open-FD negative case.
  sudo -n /usr/bin/env -i \
    CI=true \
    GITHUB_ACTIONS=true \
    CURRENT191_RETIREMENT_TEST_CONFIRM=run-current191-retirement-root-fixture \
    PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TZ=UTC \
    /usr/bin/unshare --mount --pid --fork --mount-proc /usr/bin/bash -p \
    .github/scripts/test-production-superseded-dump-prune-root.sh
}

run_gate installer-syntax bash -n \
  docs/deployment/production-control-authority/leetplus-install-production-control-v1
run_gate installed-verifier-syntax node --check \
  docs/deployment/production-control-authority/verify-installed-production-control-generation.mjs
run_gate install-fixture-syntax bash -n \
  .github/scripts/test-production-control-install-authority.sh
run_gate retirement-authority-syntax bash -n \
  docs/deployment/production-artifact/prune-three-superseded-dumps.sh
run_gate retirement-fixture-syntax bash -n \
  .github/scripts/test-production-superseded-dump-prune-root.sh
run_gate authority-node gate_authority_node
run_gate install-fixture gate_install_fixture
run_gate retirement-fixture gate_retirement_fixture

batch_code=0
for index in "${!gate_names[@]}"; do
  name="${gate_names[$index]}"
  code="${gate_codes[$index]}"
  printf '\n===== %s (exit %s) =====\n' "$name" "$code"
  cat "${BATCH_ROOT}/${name}.log"
  if [[ "$code" != 0 ]]; then
    batch_code=1
  fi
done

printf '\nPRODUCTION_CONTROL_BATCH_LOG_ROOT=%s\n' "$BATCH_ROOT"
printf 'PRODUCTION_CONTROL_BATCH_GATE_COUNT=%s\n' "${#gate_names[@]}"
printf 'PRODUCTION_CONTROL_BATCH_EXIT=%s\n' "$batch_code"
exit "$batch_code"
