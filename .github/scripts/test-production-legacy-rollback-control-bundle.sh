#!/usr/bin/env bash
# Privileged only on an ephemeral GitHub runner. Proves that production control
# bytes can only be read from the exact root-controlled, complete digest bundle.

set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly DEPLOY_ROOT="${REPOSITORY_ROOT}/docs/deployment/production-artifact"
readonly SOURCE_MANIFEST="${DEPLOY_ROOT}/CONTROL_BUNDLE_SHA256SUMS"
readonly AUTHORITY_SOURCE="${REPOSITORY_ROOT}/docs/deployment/production-control-authority/leetplus-install-scheduler-free-nminus1-v1"
readonly AUTHORITY_PATH='/usr/local/sbin/leetplus-install-scheduler-free-nminus1-v1'
readonly CONTROL_PARENT='/srv/leetplus/control-bundles'
readonly CONTROL_ROOT="${CONTROL_PARENT}/scheduler-free-nminus1-v1"
readonly TRUST_ROOT='/etc/leetplus'
readonly TRUST_FILE="${TRUST_ROOT}/rollback-control-manifest.sha256"
readonly INJECTION_ROOT='/run/leetplus-control-bundle-injection'
readonly DESTINATION_FIXTURE='/usr/local/libexec/leetplus'
readonly GUARD_MARKER='/run/leetplus-control-bundle-fixture.marker'
cleanup_armed=false
destination_parent_created=false

die() {
  printf 'legacy rollback control-bundle fixture: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  [[ "$cleanup_armed" == true ]] || return 0
  set +e
  if [[ -f "$GUARD_MARKER" ]]; then
    if [[ -d "$CONTROL_ROOT" && ! -L "$CONTROL_ROOT" ]]; then
      chmod -R u+rwX "$CONTROL_ROOT"
      find -P "$CONTROL_ROOT" -depth -mindepth 1 -delete
      rmdir "$CONTROL_ROOT"
    fi
    rmdir "$CONTROL_PARENT" 2>/dev/null
    rmdir /srv/leetplus 2>/dev/null
    if [[ -d "$TRUST_ROOT" && ! -L "$TRUST_ROOT" ]]; then
      rm -f -- "$TRUST_FILE"
      rmdir "$TRUST_ROOT" 2>/dev/null
    fi
    if [[ -d "$INJECTION_ROOT" && ! -L "$INJECTION_ROOT" ]]; then
      find -P "$INJECTION_ROOT" -depth -mindepth 1 -delete
      rmdir "$INJECTION_ROOT"
    fi
    rm -f -- "$AUTHORITY_PATH"
    if [[ -L "$DESTINATION_FIXTURE" ]]; then
      rm -f -- "$DESTINATION_FIXTURE"
    elif [[ -f "${DESTINATION_FIXTURE}/.ci-legacy-control-destination" ]]; then
      find -P "$DESTINATION_FIXTURE" -depth -mindepth 1 -delete
      rmdir "$DESTINATION_FIXTURE"
    fi
    if [[ "$destination_parent_created" == true ]]; then
      rmdir -- "$(dirname -- "$DESTINATION_FIXTURE")" 2>/dev/null
    fi
    rm -f -- "$GUARD_MARKER"
  fi
}
trap cleanup EXIT

((EUID == 0)) || die 'fixture must run through sudo'
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true ]] \
  || die 'fixture is restricted to an ephemeral GitHub Actions runner'
for command_name in awk chmod chown dirname find grep install ln mount realpath rm rmdir sha256sum unshare; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command is unavailable: ${command_name}"
done
[[ -f "$SOURCE_MANIFEST" && ! -L "$SOURCE_MANIFEST" ]] || die 'repository control manifest is absent'
[[ -f "$AUTHORITY_SOURCE" && ! -L "$AUTHORITY_SOURCE" ]] || die 'repository control authority is absent'
readonly EXPECTED_MANIFEST_PATHS="$(printf '%s\n' \
  './activate-legacy-rollback-contour.sh' \
  './apply-legacy-database-login-fence.sh' \
  './apply-legacy-rollback-egress.sh' \
  './blue-green-cutover.sh' \
  './install-legacy-rollback-contour.sh' \
  './legacy-rollback-auth-edge.mjs' \
  './legacy-rollback-child-loopback.cjs' \
  './nginx/blue.conf.example' \
  './nginx/green.conf.example' \
  './nginx/legacy-safe.conf.example' \
  './preflight-legacy-rollback.sh' \
  './systemd/leetplus-api-rollback@.service' \
  './systemd/leetplus-blue-green-recovery-watchdog.service' \
  './systemd/leetplus-blue-green-recovery.service' \
  './systemd/leetplus-blue-green-recovery.timer' \
  './systemd/leetplus-rollback-egress.service' \
  './systemd/leetplus-web-rollback@.service' \
  './systemd/legacy-database-login-fence-authority.sql.example' \
  './systemd/legacy-drain-database-target.conf.example' \
  './systemd/legacy-drain-units.conf.example' \
  './systemd/legacy-rollback-7de04ff4.env.example' \
  './systemd/legacy-rollback-safe.env.example' \
  './systemd/nginx.service.d/leetplus-blue-green-recovery.conf' \
  './verify-legacy-rollback-authenticated-reads.mjs' \
  './verify-legacy-rollback-readiness.sh' \
  './verify-legacy-runtime-drain.sh')"
actual_manifest_paths="$(awk '{ print $2 }' "$SOURCE_MANIFEST" | LC_ALL=C sort)" \
  || die 'repository control manifest path inventory failed'
[[ "$(awk 'END { print NR }' "$SOURCE_MANIFEST")" == 26 \
  && "$actual_manifest_paths" == "$EXPECTED_MANIFEST_PATHS" ]] \
  || die 'repository control manifest is not the exact reviewed 26-member inventory'
unset actual_manifest_paths
[[ ! -e "$CONTROL_PARENT" && ! -L "$CONTROL_PARENT" ]] || die 'fixture control path already exists'
[[ ! -e "$TRUST_ROOT" && ! -L "$TRUST_ROOT" ]] || die 'fixture trust path already exists'
[[ ! -e "$INJECTION_ROOT" && ! -L "$INJECTION_ROOT" ]] || die 'fixture injection path already exists'
[[ ! -e "$GUARD_MARKER" && ! -L "$GUARD_MARKER" ]] || die 'fixture guard marker already exists'
[[ ! -e "$AUTHORITY_PATH" && ! -L "$AUTHORITY_PATH" ]] || die 'fixture authority path already exists'
[[ ! -e "$DESTINATION_FIXTURE" && ! -L "$DESTINATION_FIXTURE" ]] || die 'fixture install destination already exists'

cleanup_armed=true
printf 'scheduler-free-nminus1-v1\n' > "$GUARD_MARKER"
chmod 0600 "$GUARD_MARKER"
install -d -o root -g root -m 0755 /srv/leetplus "$CONTROL_PARENT" "$TRUST_ROOT"
install -d -o root -g root -m 0755 "$CONTROL_ROOT" "$INJECTION_ROOT" "$INJECTION_ROOT/nginx"

while IFS=' ' read -r expected_hash relative_path extra; do
  [[ "$expected_hash" =~ ^[0-9a-f]{64}$ && "$relative_path" =~ ^\./[A-Za-z0-9_.@+/-]+$ && -z "${extra:-}" ]] \
    || die 'repository control manifest is malformed'
  source_path="${DEPLOY_ROOT}/${relative_path#./}"
  destination_path="${CONTROL_ROOT}/${relative_path#./}"
  [[ -f "$source_path" && ! -L "$source_path" ]] || die "manifest source is absent: ${relative_path}"
  [[ "$(sha256sum "$source_path" | awk '{ print $1 }')" == "$expected_hash" ]] \
    || die "repository source does not match manifest: ${relative_path}"
  install -d -o root -g root -m 0755 "$(dirname -- "$destination_path")"
  install -o root -g root -m 0444 "$source_path" "$destination_path"
done < "$SOURCE_MANIFEST"
install -o root -g root -m 0400 "$SOURCE_MANIFEST" "$CONTROL_ROOT/CONTROL_BUNDLE_SHA256SUMS"
find -P "$CONTROL_ROOT" -type d -exec chmod 0555 {} +
printf '%s\n' "$(sha256sum "$CONTROL_ROOT/CONTROL_BUNDLE_SHA256SUMS" | awk '{ print $1 }')" > "$TRUST_FILE"
chown root:root "$TRUST_FILE"
chmod 0400 "$TRUST_FILE"
install -o root -g root -m 0500 "$AUTHORITY_SOURCE" "$AUTHORITY_PATH"

run_verifier() {
  /usr/bin/bash -p "$CONTROL_ROOT/install-legacy-rollback-contour.sh" --verify-source-only
}

run_verifier > /tmp/leetplus-control-bundle-valid.out
grep -F -x 'LEGACY_ROLLBACK_CONTROL_BUNDLE_ACCEPTED=true' /tmp/leetplus-control-bundle-valid.out >/dev/null
"$AUTHORITY_PATH" --verify-only > /tmp/leetplus-control-authority-valid.out
grep -F -x 'LEGACY_ROLLBACK_CONTROL_AUTHORITY_ACCEPTED=true' \
  /tmp/leetplus-control-authority-valid.out >/dev/null
if "$AUTHORITY_PATH" > /tmp/leetplus-control-authority-install-path.out 2>&1; then
  die 'authority unexpectedly installed without an exact N-1 runtime artifact'
fi
grep -F 'exact offline-built rollback release is absent or symlinked' \
  /tmp/leetplus-control-authority-install-path.out >/dev/null \
  || die 'authority did not cross the trusted handoff into the installer'

printf '%064d\n' 0 > "$TRUST_FILE"
if "$AUTHORITY_PATH" --verify-only > /tmp/leetplus-control-authority-wrong-trust.out 2>&1; then
  die 'control authority accepted a trust digest different from its reviewed pin'
fi
grep -F 'control manifest is not the authority-pinned reviewed digest' \
  /tmp/leetplus-control-authority-wrong-trust.out >/dev/null \
  || die 'authority trust-digest negative failed for another invariant'
printf '%s\n' "$(sha256sum "$CONTROL_ROOT/CONTROL_BUNDLE_SHA256SUMS" | awk '{ print $1 }')" > "$TRUST_FILE"
chmod 0400 "$TRUST_FILE"

destination_parent="$(dirname -- "$DESTINATION_FIXTURE")"
if [[ ! -e "$destination_parent" && ! -L "$destination_parent" ]]; then
  install -d -o root -g root -m 0755 -- "$destination_parent"
  destination_parent_created=true
fi
[[ -d "$destination_parent" && ! -L "$destination_parent" \
  && "$(realpath -e -- "$destination_parent")" == "$destination_parent" \
  && "$(stat -c '%U:%G:%a' -- "$destination_parent")" == 'root:root:755' ]] \
  || die 'fixture install destination parent is not exact root-controlled'
ln -s -- "$INJECTION_ROOT" "$DESTINATION_FIXTURE"
if /usr/bin/bash -p "$CONTROL_ROOT/install-legacy-rollback-contour.sh" --verify-destinations-only \
  > /tmp/leetplus-control-destination-symlink.out 2>&1; then
  die 'installer accepted a symlinked root destination'
fi
grep -F 'install destination ancestor is not canonical root-controlled' \
  /tmp/leetplus-control-destination-symlink.out >/dev/null \
  || die 'destination symlink negative failed for another invariant'
rm -f -- "$DESTINATION_FIXTURE"
install -d -o root -g root -m 0755 "$DESTINATION_FIXTURE"
printf 'fixture\n' > "${DESTINATION_FIXTURE}/.ci-legacy-control-destination"
chmod 0600 "${DESTINATION_FIXTURE}/.ci-legacy-control-destination"
if unshare --mount --propagation private /usr/bin/bash -p -eu -c '
  mount --bind -- "$1" "$2"
  exec /usr/bin/bash -p "$3" --verify-destinations-only
' leetplus-control-destination-mount "$INJECTION_ROOT" "$DESTINATION_FIXTURE" \
  "$CONTROL_ROOT/install-legacy-rollback-contour.sh" \
  > /tmp/leetplus-control-destination-mount.out 2>&1; then
  die 'installer accepted an exact/nested destination mount'
fi
grep -F 'install destination contains an exact/nested mount' \
  /tmp/leetplus-control-destination-mount.out >/dev/null \
  || die 'destination mount negative failed for another invariant'

if unshare --mount --propagation private /usr/bin/bash -p -eu -c '
  mount --bind -- "$1" /usr/local/libexec
  exec /usr/bin/bash -p "$2" --verify-destinations-only
' leetplus-control-destination-ancestor-mount "$INJECTION_ROOT" \
  "$CONTROL_ROOT/install-legacy-rollback-contour.sh" \
  > /tmp/leetplus-control-destination-ancestor-mount.out 2>&1; then
  die 'installer accepted a separately mounted destination ancestor'
fi
grep -F 'install destination ancestor is a separate mount' \
  /tmp/leetplus-control-destination-ancestor-mount.out >/dev/null \
  || die 'destination ancestor-mount negative failed for another invariant'

chmod 0775 "$CONTROL_PARENT"
if run_verifier > /tmp/leetplus-control-bundle-writable-ancestor.out 2>&1; then
  die 'control verifier accepted a writable ancestor'
fi
grep -F 'control-bundle ancestor is not root-owned immutable' \
  /tmp/leetplus-control-bundle-writable-ancestor.out >/dev/null \
  || die 'writable-ancestor negative failed for another invariant'
chmod 0755 "$CONTROL_PARENT"

drift_target="$CONTROL_ROOT/nginx/blue.conf.example"
chmod 0664 "$drift_target"
if run_verifier > /tmp/leetplus-control-bundle-writable-entry.out 2>&1; then
  die 'control verifier accepted a group-writable source file'
fi
grep -F 'control bundle contains a non-root-owned or writable entry' \
  /tmp/leetplus-control-bundle-writable-entry.out >/dev/null \
  || die 'writable-entry negative failed for another invariant'
chmod 0444 "$drift_target"

chmod 0644 "$drift_target"
printf '# drift\n' >> "$drift_target"
chmod 0444 "$drift_target"
if run_verifier > /tmp/leetplus-control-bundle-drift.out 2>&1; then
  die 'control verifier accepted source digest drift'
fi
grep -F 'control bundle source drifted from its reviewed manifest' \
  /tmp/leetplus-control-bundle-drift.out >/dev/null \
  || die 'source-drift negative failed for another invariant'
install -o root -g root -m 0444 "$DEPLOY_ROOT/nginx/blue.conf.example" "$drift_target"

printf 'nested manifest-name collision\n' > "$CONTROL_ROOT/nginx/CONTROL_BUNDLE_SHA256SUMS"
chmod 0444 "$CONTROL_ROOT/nginx/CONTROL_BUNDLE_SHA256SUMS"
if run_verifier > /tmp/leetplus-control-bundle-nested-manifest-name.out 2>&1; then
  die 'control verifier excluded a nested manifest-basename collision'
fi
grep -F 'control bundle manifest does not cover the exact file set' \
  /tmp/leetplus-control-bundle-nested-manifest-name.out >/dev/null \
  || die 'nested manifest-name negative failed for another invariant'
rm -f -- "$CONTROL_ROOT/nginx/CONTROL_BUNDLE_SHA256SUMS"

rm -f -- "$drift_target"
ln -s -- "$CONTROL_ROOT/nginx/green.conf.example" "$drift_target"
if run_verifier > /tmp/leetplus-control-bundle-symlink.out 2>&1; then
  die 'control verifier accepted a symlinked source file'
fi
grep -F 'control bundle contains a symlink or special entry' \
  /tmp/leetplus-control-bundle-symlink.out >/dev/null \
  || die 'source-symlink negative failed for another invariant'
rm -f -- "$drift_target"
install -o root -g root -m 0444 "$DEPLOY_ROOT/nginx/blue.conf.example" "$drift_target"

if unshare --mount --propagation private /usr/bin/bash -p -eu -c '
  mount --bind -- "$1" "$2"
  exec /usr/bin/bash -p "$3" --verify-source-only
' leetplus-control-nested "$INJECTION_ROOT/nginx" "$CONTROL_ROOT/nginx" \
  "$CONTROL_ROOT/install-legacy-rollback-contour.sh" \
  > /tmp/leetplus-control-bundle-nested-mount.out 2>&1; then
  die 'control verifier accepted an exact/nested source mount'
fi
grep -F 'control bundle contains an exact/nested mount' \
  /tmp/leetplus-control-bundle-nested-mount.out >/dev/null \
  || die 'nested-mount negative failed for another invariant'

if /usr/bin/bash -p "$CONTROL_ROOT/install-legacy-rollback-contour.sh" \
  > /tmp/leetplus-control-bundle-install-refused.out 2>&1; then
  die 'standalone control-bundle installer performed a production install'
fi
grep -F 'provision this accepted bundle only through the trusted artifact deployment authority' \
  /tmp/leetplus-control-bundle-install-refused.out >/dev/null \
  || die 'production install refusal failed for another invariant'

rm -f /tmp/leetplus-control-bundle-valid.out \
  /tmp/leetplus-control-authority-valid.out \
  /tmp/leetplus-control-authority-install-path.out \
  /tmp/leetplus-control-authority-wrong-trust.out \
  /tmp/leetplus-control-destination-symlink.out \
  /tmp/leetplus-control-destination-mount.out \
  /tmp/leetplus-control-destination-ancestor-mount.out \
  /tmp/leetplus-control-bundle-writable-ancestor.out \
  /tmp/leetplus-control-bundle-writable-entry.out \
  /tmp/leetplus-control-bundle-drift.out \
  /tmp/leetplus-control-bundle-symlink.out \
  /tmp/leetplus-control-bundle-nested-manifest-name.out \
  /tmp/leetplus-control-bundle-nested-mount.out \
  /tmp/leetplus-control-bundle-install-refused.out
printf 'production legacy rollback control-bundle fixture: PASS\n'
