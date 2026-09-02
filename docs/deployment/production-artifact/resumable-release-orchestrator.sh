#!/usr/bin/bash -p
#
# Root bootstrap for the exact production-control rollout orchestrator.

[[ "$-" == *p* ]] || {
  printf 'resumable-release-orchestrator: privileged Bash mode is required\n' >&2
  exit 1
}

test_mode=false
for bootstrap_argument in "$@"; do
  if [[ "$bootstrap_argument" == '--unprivileged-test-mode' && EUID -ne 0 ]]; then
    test_mode=true
    break
  fi
done
unset bootstrap_argument

declare -a test_environment=()
if [[ "$test_mode" == true ]]; then
  while IFS= read -r environment_name; do
    if [[ "$environment_name" == TEST_* || "$environment_name" == LEETPLUS_ORCHESTRATOR_FIXTURE_* ]]; then
      test_environment+=("${environment_name}=${!environment_name}")
    fi
  done < <(compgen -e)
fi

while IFS= read -r environment_name; do
  unset "$environment_name" 2>/dev/null || true
done < <(compgen -e)
unset environment_name

PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C.UTF-8'
LC_ALL='C.UTF-8'
TZ='UTC'
export PATH LANG LC_ALL TZ

if [[ "$test_mode" == true ]]; then
  for assignment in "${test_environment[@]}"; do
    export "$assignment"
  done
  repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
  engine="${repository_root}/docs/deployment/production-artifact/resumable-release-orchestrator.mjs"
  exec /usr/bin/env node "$engine" "$@"
fi

set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly INSTALLED_BOOTSTRAP='/usr/local/sbin/leetplus-resumable-release-orchestrator'
readonly INSTALLED_ENGINE='/usr/local/libexec/leetplus/resumable-release-orchestrator.mjs'
readonly EXPECTED_ENGINE_SHA256='587ce1aaf0227efcd9cab51b14f6752d0fd4b6134c26b22de58f7c9b25b99e4e'
readonly PRODUCTION_CONTROL_RUN_ROOT='/run/leetplus-production-control'
readonly PRODUCTION_CONTROL_INSTALL_LOCK="${PRODUCTION_CONTROL_RUN_ROOT}/install.lock"
readonly STATE_PARENT='/var/lib/leetplus/deploy-receipts'
readonly STATE_ROOT="${STATE_PARENT}/release-orchestrator"
readonly LOCK_PATH="${STATE_ROOT}/orchestrator.lock"

die() {
  printf 'resumable-release-orchestrator: %s\n' "$*" >&2
  exit 1
}

((EUID == 0)) || die 'production execution requires root'
[[ "${BASH_SOURCE[0]}" == "$INSTALLED_BOOTSTRAP" \
  && "$(realpath -e -- "${BASH_SOURCE[0]}")" == "$INSTALLED_BOOTSTRAP" \
  && -f "$INSTALLED_BOOTSTRAP" && ! -L "$INSTALLED_BOOTSTRAP" \
  && "$(stat -c '%U:%G:%a:%h' -- "$INSTALLED_BOOTSTRAP")" == 'root:root:500:1' ]] \
  || die 'bootstrap must execute only as the exact installed root authority'
[[ -d "$PRODUCTION_CONTROL_RUN_ROOT" && ! -L "$PRODUCTION_CONTROL_RUN_ROOT" \
  && "$(realpath -e -- "$PRODUCTION_CONTROL_RUN_ROOT")" == "$PRODUCTION_CONTROL_RUN_ROOT" \
  && "$(stat -c '%U:%G:%a' -- "$PRODUCTION_CONTROL_RUN_ROOT")" == 'root:root:700' ]] \
  || die 'production-control runtime root must be exact root:root mode 0700'
[[ -f "$PRODUCTION_CONTROL_INSTALL_LOCK" && ! -L "$PRODUCTION_CONTROL_INSTALL_LOCK" \
  && "$(realpath -e -- "$PRODUCTION_CONTROL_INSTALL_LOCK")" == "$PRODUCTION_CONTROL_INSTALL_LOCK" \
  && "$(stat -c '%U:%G:%a:%h' -- "$PRODUCTION_CONTROL_INSTALL_LOCK")" == 'root:root:600:1' ]] \
  || die 'production-control install lock identity is unsafe'
control_lock_identity="$(stat -c '%d:%i' -- "$PRODUCTION_CONTROL_INSTALL_LOCK")"
exec 8<> "$PRODUCTION_CONTROL_INSTALL_LOCK"
[[ "$(stat -Lc '%d:%i' -- /proc/self/fd/8)" == "$control_lock_identity" ]] \
  || die 'opened production-control install lock differs from the validated path'
flock -n 8 || die 'another production-control install or rollout operation is active'
[[ "$(stat -c '%d:%i:%U:%G:%a:%h' -- "$PRODUCTION_CONTROL_INSTALL_LOCK")" == \
    "${control_lock_identity}:root:root:600:1" ]] \
  || die 'production-control install lock changed while held'
[[ -f "$INSTALLED_ENGINE" && ! -L "$INSTALLED_ENGINE" \
  && "$(realpath -e -- "$INSTALLED_ENGINE")" == "$INSTALLED_ENGINE" \
  && "$(stat -c '%U:%G:%a:%h' -- "$INSTALLED_ENGINE")" == 'root:root:555:1' \
  && "$(sha256sum -- "$INSTALLED_ENGINE" | awk '{ print $1 }')" == "$EXPECTED_ENGINE_SHA256" ]] \
  || die 'installed engine byte or identity differs from the bootstrap pin'
[[ -x /usr/bin/node && ! -L /usr/bin/node \
  && "$(realpath -e -- /usr/bin/node)" == '/usr/bin/node' \
  && "$(stat -c '%U:%G' -- /usr/bin/node)" == 'root:root' \
  && -z "$(find -P /usr/bin/node -maxdepth 0 -perm /022 -print -quit)" \
  && "$(/usr/bin/node -p 'process.versions.node.split(".")[0]')" == '22' ]] \
  || die 'production execution requires exact root-controlled Node major 22'
[[ -d "$STATE_PARENT" && ! -L "$STATE_PARENT" \
  && "$(realpath -e -- "$STATE_PARENT")" == "$STATE_PARENT" \
  && "$(stat -c '%U:%G:%a' -- "$STATE_PARENT")" == 'root:root:700' ]] \
  || die 'deployment receipt parent must be exact root:root mode 0700'
if [[ ! -e "$STATE_ROOT" && ! -L "$STATE_ROOT" ]]; then
  install -d -o root -g root -m 0700 -- "$STATE_ROOT"
fi
[[ -d "$STATE_ROOT" && ! -L "$STATE_ROOT" \
  && "$(realpath -e -- "$STATE_ROOT")" == "$STATE_ROOT" \
  && "$(stat -c '%U:%G:%a' -- "$STATE_ROOT")" == 'root:root:700' ]] \
  || die 'orchestrator state root must be exact root:root mode 0700'
if [[ ! -e "$LOCK_PATH" && ! -L "$LOCK_PATH" ]]; then
  (set -o noclobber; : > "$LOCK_PATH") \
    || die 'cannot create orchestrator lock exclusively'
  chmod 0600 -- "$LOCK_PATH"
  sync -f "$LOCK_PATH"
  sync -d "$STATE_ROOT"
fi
[[ -f "$LOCK_PATH" && ! -L "$LOCK_PATH" \
  && "$(realpath -e -- "$LOCK_PATH")" == "$LOCK_PATH" \
  && "$(stat -c '%U:%G:%a:%h' -- "$LOCK_PATH")" == 'root:root:600:1' ]] \
  || die 'orchestrator lock identity is unsafe'
lock_identity="$(stat -c '%d:%i' -- "$LOCK_PATH")"
exec 9<> "$LOCK_PATH"
[[ "$(stat -Lc '%d:%i' -- /proc/self/fd/9)" == "$lock_identity" ]] \
  || die 'opened orchestrator lock differs from the validated path'
flock -n 9 || die 'another release orchestration operation is active'
[[ "$(stat -c '%d:%i:%U:%G:%a:%h' -- "$LOCK_PATH")" == \
    "${lock_identity}:root:root:600:1" ]] \
  || die 'orchestrator lock changed while held'

LEETPLUS_RESUMABLE_RELEASE_BOOTSTRAP='LEETPLUS_RESUMABLE_RELEASE_BOOTSTRAP_V1'
LEETPLUS_RESUMABLE_RELEASE_INSTALL_LOCK_FD='8'
export LEETPLUS_RESUMABLE_RELEASE_BOOTSTRAP LEETPLUS_RESUMABLE_RELEASE_INSTALL_LOCK_FD
exec /usr/bin/node "$INSTALLED_ENGINE" "$@"
