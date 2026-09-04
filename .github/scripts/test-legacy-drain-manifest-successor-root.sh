#!/usr/bin/bash -p
# Execute the immutable legacy-drain manifest successor through its installed
# root authority path.  The fixture uses exact production paths exclusively,
# but only inside a freshly-created networkless container root.

[[ $- == *p* ]] || { printf 'manifest successor root fixture requires Bash -p\n' >&2; exit 1; }
fixture_ack="${LEETPLUS_DISPOSABLE_ROOT_FIXTURE:-}"
while IFS= read -r inherited; do unset "$inherited" 2>/dev/null || true; done < <(compgen -e)
unset inherited
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C.UTF-8'; LC_ALL='C.UTF-8'; TZ='UTC'
export PATH LANG LC_ALL TZ
set -euo pipefail
IFS=$'\n\t'
umask 0077

readonly ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly ARTIFACT_ROOT="${ROOT}/docs/deployment/production-artifact"
readonly AUTHORITY_SOURCE="${ARTIFACT_ROOT}/rebind-legacy-drain-manifest-successor.sh"
readonly AUTHORITY_PATH='/usr/local/sbin/leetplus-rebind-legacy-drain-manifest-successor'
readonly DRAIN_SOURCE="${ARTIFACT_ROOT}/verify-legacy-runtime-drain.sh"
readonly DRAIN_PATH='/srv/leetplus/control-bundles/scheduler-free-nminus1-v1/verify-legacy-runtime-drain.sh'
readonly HISTORICAL_DRAIN_PATH='/usr/local/libexec/leetplus/verify-legacy-runtime-drain.sh'
readonly CONTROL_PATH='/usr/local/libexec/leetplus/verify-installed-production-control-generation.mjs'
readonly CONTROL_SHA='475d7e0c3583c36b6ec2138a06f4cc4a1bc46eb7'
readonly SUCCESSOR_MANIFEST_SHA256='d6e7b4fe8e0aeb9a77caae62d2fb4ed9322e6383148934c5e26ff3f9126120dd'
readonly CONFIRMATION='I_ACCEPT_EXACT_LEGACY_DRAIN_MANIFEST_SUCCESSOR_APPLY'
readonly STATE_ROOT='/var/lib/leetplus/legacy-drain'
readonly FENCE_MARKER="${STATE_ROOT}/legacy-start-fence"
readonly SUCCESSOR_RECEIPT="${STATE_ROOT}/manifest-successor.receipt"
readonly SUCCESSOR_EVIDENCE="${STATE_ROOT}/manifest-successor-drain-verification.v1"
readonly CONTROL_EVIDENCE="${STATE_ROOT}/manifest-successor-control-verification.v1"

die() { printf 'manifest successor root fixture: %s\n' "$*" >&2; exit 1; }
trap 'status=$?; printf "manifest successor root fixture: unhandled failure at line %s (exit %s): %s\\n" "$LINENO" "$status" "$BASH_COMMAND" >&2; exit "$status"' ERR

(( EUID == 0 )) || die 'must run as root inside a disposable Linux root'
[[ "$fixture_ack" == 'CONFIRMED_DESTROYABLE_CI_ROOT' ]] || die 'disposable-root acknowledgement is absent'
unset fixture_ack
[[ -e /.dockerenv || -e /run/.containerenv ]] || die 'refusing exact production-path mutation outside a disposable container root'
[[ "$(uname -s)" == Linux ]] || die 'Linux is required'
for command_name in awk bash cat chmod chown cp find findmnt flock grep install mktemp mv node realpath rm sha256sum sort stat sync timeout tr; do
  command -v "$command_name" >/dev/null 2>&1 || die "missing fixture command: ${command_name}"
done
[[ -f "$AUTHORITY_SOURCE" && -f "$DRAIN_SOURCE" ]] || die 'reviewed successor authority sources are absent'
for forbidden in /etc/leetplus /etc/systemd/system/leetplus-langame-daily-worker.service \
  /usr/local/sbin/leetplus-rebind-legacy-drain-manifest-successor "$STATE_ROOT" \
  /run/leetplus-production-control /var/lib/leetplus/deploy-receipts; do
  [[ ! -e "$forbidden" && ! -L "$forbidden" ]] || die "disposable root is not clean: ${forbidden}"
done

install -d -o root -g root -m 0755 /etc /etc/leetplus /etc/systemd /etc/systemd/system /usr/local /usr/local/sbin /usr/local/libexec /usr/local/libexec/leetplus /var /var/lib /var/lib/leetplus /srv /srv/leetplus
install -d -o root -g root -m 0500 /srv/leetplus/control-bundles /srv/leetplus/control-bundles/scheduler-free-nminus1-v1
install -d -o root -g root -m 0700 "$STATE_ROOT" /run/leetplus-production-control /var/lib/leetplus/deploy-receipts
for lock_parent in /run/leetplus-production-control /var/lib/leetplus/deploy-receipts; do
  [[ -d "$lock_parent" && ! -L "$lock_parent" ]] || die "fixture lock parent is not an exact directory: ${lock_parent}"
  [[ "$(stat -c '%U:%G:%a' -- "$lock_parent")" == 'root:root:700' ]] || die "fixture lock parent ownership or mode is unsafe: ${lock_parent}"
done
unset lock_parent
# GNU install accepts multiple source operands only when the final operand is a
# directory.  Create each exact lock path separately so neither lock is ever
# reinterpreted as a source file during disposable-root setup.
install -o root -g root -m 0600 /dev/null /run/leetplus-production-control/install.lock
install -o root -g root -m 0600 /dev/null /var/lib/leetplus/deploy-receipts/cutover.lock
for lock_path in /run/leetplus-production-control/install.lock /var/lib/leetplus/deploy-receipts/cutover.lock; do
  [[ -f "$lock_path" && ! -L "$lock_path" ]] || die "fixture lock is not an exact regular file: ${lock_path}"
  [[ "$(stat -c '%U:%G:%a' -- "$lock_path")" == 'root:root:600' ]] || die "fixture lock ownership or mode is unsafe: ${lock_path}"
done
unset lock_path
install -o root -g root -m 0500 "$AUTHORITY_SOURCE" "$AUTHORITY_PATH"
install -o root -g root -m 0400 "$DRAIN_SOURCE" "$DRAIN_PATH"
# The predecessor activation deliberately retains its historical verifier in
# /usr/local.  Make that byte fail loudly so this fixture proves the successor
# controller never executes it after the control-bundle update.
cat > "$HISTORICAL_DRAIN_PATH" <<'HISTORICAL'
#!/usr/bin/bash
printf 'historical frozen drain verifier must not be used by successor authority\n' >&2
exit 97
HISTORICAL
chown root:root "$HISTORICAL_DRAIN_PATH"; chmod 0755 "$HISTORICAL_DRAIN_PATH"
install -o root -g root -m 0600 "$ARTIFACT_ROOT/systemd/legacy-drain-units.conf.example" /etc/leetplus/legacy-drain-units.conf
[[ "$(sha256sum /etc/leetplus/legacy-drain-units.conf | awk '{ print $1 }')" == "$SUCCESSOR_MANIFEST_SHA256" \
  && "$(wc -l < /etc/leetplus/legacy-drain-units.conf | tr -d '[:space:]')" == 31 ]] \
  || die 'checked-in successor manifest identity is not exact'
install -o root -g root -m 0644 "$ARTIFACT_ROOT/systemd/leetplus-langame-daily-worker.service" /etc/systemd/system/leetplus-langame-daily-worker.service
install -o root -g root -m 0644 "$ARTIFACT_ROOT/systemd/leetplus-langame-daily-worker.timer" /etc/systemd/system/leetplus-langame-daily-worker.timer

# The successor authority invokes the installed production-control verifier
# through node.  This small root-owned deterministic witness represents its
# already-admitted, separately-tested result; the fixture asserts its evidence
# is linked into both plan and final successor receipt.
cat > "$CONTROL_PATH" <<'NODE'
#!/usr/bin/env node
const expected = '475d7e0c3583c36b6ec2138a06f4cc4a1bc46eb7';
if (process.argv.slice(2).join(' ') !== `--release-sha ${expected} --require-root-authority`) process.exit(64);
process.stdout.write(`PRODUCTION_CONTROL_INSTALLED_GENERATION=PASS\nPRODUCTION_CONTROL_RELEASE_SHA=${expected}\n`);
NODE
chown root:root "$CONTROL_PATH"; chmod 0555 "$CONTROL_PATH"

cat > /etc/leetplus/pg_service.conf <<'PG'
[leetplus-drain-audit]
host=127.0.0.1
port=5432
dbname=leetplus
user=leetplus_drain_audit
PG
cat > /etc/leetplus/legacy-drain-database-target.conf <<'TARGET'
DATABASE_NAME=leetplus
DATABASE_SERVER_ADDRESS=127.0.0.1
DATABASE_SERVER_PORT=5432
DATABASE_SYSTEM_IDENTIFIER=1234567890123456
AUDIT_SESSION_USER=leetplus_drain_audit
FENCE_SESSION_USER=leetplus_role_fencer
FENCE_AUTHORITY_ROLE=leetplus_fence_authority
FENCE_FUNCTION_SCHEMA=leetplus_ops
FENCE_FUNCTION_NAME=apply_nminus1_legacy_login_fence
TARGET
install -o root -g root -m 0600 /dev/null "$STATE_ROOT/legacy-processes.snapshot"
printf 'fixture durable legacy start fence\n' > "$FENCE_MARKER"
chown root:root "$FENCE_MARKER"; chmod 0600 "$FENCE_MARKER"

# All predecessor evidence is immutable and bound into the historic receipt.
for name in activation.intent routed-publicly.marker legacy-connections-drained.marker \
  legacy-nginx-workers.snapshot legacy-database-login-fence.marker drain-verification.new; do
  printf 'fixture predecessor %s\n' "$name" > "$STATE_ROOT/$name"
  chown root:root "$STATE_ROOT/$name"; chmod 0600 "$STATE_ROOT/$name"
done
# A drain snapshot with no recorded legacy PID is valid; unlike the other
# evidence it is parsed by the live verifier and must remain empty.
: > "$STATE_ROOT/legacy-processes.snapshot"
chown root:root "$STATE_ROOT/legacy-processes.snapshot"; chmod 0600 "$STATE_ROOT/legacy-processes.snapshot"
cat > "$STATE_ROOT/activation.receipt" <<RECEIPT
RECORD_VERSION=2
LEGACY_ROLLBACK_SHA=7de04ff4ccc814494810730be3fa6bf661097b07
DRAIN_ACCEPTED_AT=2026-09-04T00:00:00.000Z
ACTIVATION_INTENT_SHA256=$(sha256sum "$STATE_ROOT/activation.intent" | awk '{print $1}')
UNIT_MANIFEST_SHA256=89930527907a1bf993c9b4db9165c8f8ba305d81be985264ecd3b5fa4ff86b13
PUBLIC_ROUTE_MARKER_SHA256=$(sha256sum "$STATE_ROOT/routed-publicly.marker" | awk '{print $1}')
CONNECTION_DRAIN_MARKER_SHA256=$(sha256sum "$STATE_ROOT/legacy-connections-drained.marker" | awk '{print $1}')
NGINX_WORKER_SNAPSHOT_SHA256=$(sha256sum "$STATE_ROOT/legacy-nginx-workers.snapshot" | awk '{print $1}')
START_FENCE_MARKER_SHA256=$(sha256sum "$FENCE_MARKER" | awk '{print $1}')
DATABASE_LOGIN_FENCE_MARKER_SHA256=$(sha256sum "$STATE_ROOT/legacy-database-login-fence.marker" | awk '{print $1}')
DRAIN_VERIFIER_OUTPUT_SHA256=$(sha256sum "$STATE_ROOT/drain-verification.new" | awk '{print $1}')
LEGACY_RUNTIME_DRAIN_ACCEPTED=true
LEGACY_RUNTIME_DRAIN_CLEAN_SAMPLES=3
LEGACY_RUNTIME_DRAIN_PROCESS_SNAPSHOT_SHA256=$(sha256sum "$STATE_ROOT/legacy-processes.snapshot" | awk '{print $1}')
LEGACY_RUNTIME_DRAIN_DATABASE_ROLE=leetplus
RECEIPT
chown root:root "$STATE_ROOT/activation.receipt"; chmod 0600 "$STATE_ROOT/activation.receipt"

# Existing historical DRAIN entries are already fenced.  The two new Langame
# entries deliberately are not, so the live generic drain verifier must reject
# pre-successor state before the authority is allowed to repair it.
while IFS=' ' read -r classification unit; do
  [[ "$classification" == REQUIRED_DRAIN || "$classification" == OPTIONAL_DRAIN ]] || continue
  [[ "$unit" == leetplus-langame-daily-worker.timer || "$unit" == leetplus-langame-daily-worker.service ]] && continue
  install -d -o root -g root -m 0755 "/etc/systemd/system/${unit}.d"
  printf '[Unit]\nConditionPathExists=!%s\n' "$FENCE_MARKER" > "/etc/systemd/system/${unit}.d/90-leetplus-nminus1-start-fence.conf"
  chown root:root "/etc/systemd/system/${unit}.d/90-leetplus-nminus1-start-fence.conf"; chmod 0644 "/etc/systemd/system/${unit}.d/90-leetplus-nminus1-start-fence.conf"
done < /etc/leetplus/legacy-drain-units.conf

# Model the exact safe precursor for the two additive manifest entries: systemd
# may already have a canonical drop-in directory, but neither the durable fence
# nor any worker authorization authority exists yet.  The generic verifier must
# therefore stop specifically at the missing fence file, after directory trust.
for unit in leetplus-langame-daily-worker.timer leetplus-langame-daily-worker.service; do
  fence_directory="/etc/systemd/system/${unit}.d"
  fence_path="${fence_directory}/90-leetplus-nminus1-start-fence.conf"
  authorization_path="${fence_directory}/91-leetplus-langame-worker-authorization.conf"
  install -d -o root -g root -m 0755 -- "$fence_directory"
  [[ -d "$fence_directory" && ! -L "$fence_directory" ]] || die "additive fence directory is not exact: ${unit}"
  [[ "$(stat -c '%U:%G:%a' -- "$fence_directory")" == 'root:root:755' ]] || die "additive fence directory authority is unsafe: ${unit}"
  [[ ! -e "$fence_path" && ! -L "$fence_path" ]] || die "additive fence unexpectedly exists before successor apply: ${unit}"
  [[ ! -e "$authorization_path" && ! -L "$authorization_path" ]] || die "worker authorization unexpectedly exists before successor apply: ${unit}"
done
unset unit fence_directory fence_path authorization_path

# The fixture facade gives production-shaped, loaded systemd state while the
# authority still creates and reloads real drop-in bytes under exact paths.
cat > /usr/bin/systemctl <<'SYSTEMCTL'
#!/usr/bin/bash
set -euo pipefail
manifest=/etc/leetplus/legacy-drain-units.conf
unit="${*: -1}"
dropin="/etc/systemd/system/${unit}.d/90-leetplus-nminus1-start-fence.conf"
case "${1:-}" in
  daemon-reload) touch /run/fixture-successor-daemon-reload; exit 0 ;;
  list-unit-files|list-units)
    awk '$1 !~ /^#/ && NF == 2 { print $2 " disabled" }' "$manifest"; exit 0 ;;
  is-active) exit 3 ;;
  show)
    property=''; value_only=false
    for arg in "$@"; do
      [[ "$arg" == --property=* ]] && property="${arg#--property=}"
      [[ "$arg" == --value ]] && value_only=true
    done
    case "$property" in
      LoadState) value=loaded ;;
      ActiveState) value=inactive ;;
      UnitFileState) [[ "$unit" == leetplus-langame-daily-worker.service ]] && value=static || value=disabled ;;
      # Real systemd 255 omits service-only PID properties for .timer units.
      # The authority must normalize this exact timer representation while
      # keeping the service representation explicit and fail-closed.
      MainPID|ControlPID|ExecMainPID)
        [[ "$unit" == *.timer || -e /run/fixture-successor-blank-service-pids ]] && value='' || value=0 ;;
      ControlGroup) value='' ;;
      FragmentPath) value="/etc/systemd/system/${unit}" ;;
      DropInPaths) [[ -f "$dropin" ]] && value="$dropin" || value='' ;;
      *) value='' ;;
    esac
    [[ "$value_only" == true ]] && printf '%s\n' "$value" || printf '%s=%s\n' "$property" "$value"
    exit 0 ;;
  *) exit 64 ;;
esac
SYSTEMCTL
chmod 0755 /usr/bin/systemctl
cat > /usr/bin/psql <<'PSQL'
#!/usr/bin/bash
# Exact 22-field clean audit row: both runtime and audit roles retain their
# single direct membership while all legacy sessions and unsafe grants are 0.
printf '0|0|0|0|1|1|1|2|0|0|1|1|1|1|0|0|1|leetplus|127.0.0.1|5432|1234567890123456|leetplus_drain_audit\n'
PSQL
chmod 0755 /usr/bin/psql

# Keep the verifier's earlier directory-authority guard covered independently
# from the intended missing-file precursor below.
probe_directory='/etc/systemd/system/leetplus-langame-daily-worker.timer.d'
probe_saved='/run/fixture-successor-missing-timer-dir'
[[ ! -e "$probe_saved" && ! -L "$probe_saved" ]] || die 'directory negative scratch path already exists'
mv -- "$probe_directory" "$probe_saved"
if timeout 5s "$DRAIN_PATH" > /run/fixture-successor-directory-negative.out 2>&1; then
  die 'generic drain verifier accepted an absent start-fence directory'
fi
grep -F 'legacy unit start-fence directory is noncanonical: leetplus-langame-daily-worker.timer' /run/fixture-successor-directory-negative.out >/dev/null \
  || { cat /run/fixture-successor-directory-negative.out >&2; die 'directory negative stopped at an unexpected guard'; }
mv -- "$probe_saved" "$probe_directory"
[[ -d "$probe_directory" && ! -L "$probe_directory" && "$(stat -c '%U:%G:%a' -- "$probe_directory")" == 'root:root:755' ]] \
  || die 'directory negative did not restore exact timer fence authority'
unset probe_directory probe_saved

# A bounded direct verifier call demonstrates that the historical receipt is
# intentionally insufficient for the expanded manifest.  It must fail due to
# the two absent exact start fences, never due to an unrelated setup defect.
if timeout 5s "$DRAIN_PATH" > /run/fixture-successor-pre.out 2>&1; then
  die 'generic drain verifier accepted the unfenced successor manifest'
fi
grep -F 'legacy unit lacks its durable start-fence drop-in: leetplus-langame-daily-worker.timer' /run/fixture-successor-pre.out >/dev/null \
  || { cat /run/fixture-successor-pre.out >&2; die 'pre-successor negative stopped at an unexpected guard'; }

plan_output="$($AUTHORITY_PATH plan --control-release-sha "$CONTROL_SHA")"
printf '%s\n' "$plan_output" | grep -F -x 'LEGACY_DRAIN_MANIFEST_SUCCESSOR_PLAN=READY' >/dev/null || die 'plan did not report ready'
plan_sha="$(printf '%s\n' "$plan_output" | awk -F= '$1 == "PLAN_SHA256" {print $2}')"
[[ "$plan_sha" =~ ^[0-9a-f]{64}$ ]] || die 'plan digest is invalid'
[[ "$(printf '%s\n' "$plan_output" | grep -c '^ACTION=ENSURE_START_FENCE|')" == 2 ]] || die 'plan action set is not exact'

# Timer PID fields may be absent on systemd 255, but the same ambiguity must
# never be accepted for the oneshot service itself.
touch /run/fixture-successor-blank-service-pids
if $AUTHORITY_PATH apply --control-release-sha "$CONTROL_SHA" --plan-sha256 "$plan_sha" --action-count 2 --confirmation "$CONFIRMATION" > /run/fixture-successor-blank-service.out 2>&1; then
  die 'apply accepted absent PID properties for the Langame service'
fi
grep -F 'newly admitted drain service is not exact loaded/inactive/static/PID-zero: leetplus-langame-daily-worker.service' /run/fixture-successor-blank-service.out >/dev/null \
  || { cat /run/fixture-successor-blank-service.out >&2; die 'blank service PID negative stopped at an unexpected guard'; }
rm -f -- /run/fixture-successor-blank-service-pids

$AUTHORITY_PATH apply --control-release-sha "$CONTROL_SHA" --plan-sha256 "$plan_sha" --action-count 2 --confirmation "$CONFIRMATION" > /run/fixture-successor-apply.out
grep -F -x 'LEGACY_DRAIN_MANIFEST_SUCCESSOR_APPLY=PASS' /run/fixture-successor-apply.out >/dev/null || die 'apply did not publish success'
[[ -f /run/fixture-successor-daemon-reload ]] || die 'apply did not reload the fixture systemd manager'
for unit in leetplus-langame-daily-worker.timer leetplus-langame-daily-worker.service; do
  fence_directory="/etc/systemd/system/${unit}.d"
  fence="/etc/systemd/system/${unit}.d/90-leetplus-nminus1-start-fence.conf"
  [[ -d "$fence_directory" && ! -L "$fence_directory" && "$(stat -c '%U:%G:%a' -- "$fence_directory")" == 'root:root:755' ]] \
    || die "created fence directory is not exact: ${unit}"
  [[ -f "$fence" && ! -L "$fence" && "$(stat -c '%U:%G:%a:%h' -- "$fence")" == 'root:root:644:1' ]] \
    || die "created fence authority is not exact: ${unit}"
  [[ "$(cat "$fence")" == $'[Unit]\nConditionPathExists=!/var/lib/leetplus/legacy-drain/legacy-start-fence' ]] || die "created fence is not exact: ${unit}"
done
unset unit fence_directory fence
$AUTHORITY_PATH check --control-release-sha "$CONTROL_SHA" > /run/fixture-successor-check.out
grep -F -x 'LEGACY_DRAIN_MANIFEST_SUCCESSOR_CHECK=PASS' /run/fixture-successor-check.out >/dev/null || die 'check did not accept live drain and receipt chain'

# Idempotent retry preserves the immutable receipt rather than reconstructing
# a different plan.  This is the normal lost-response caller recovery path.
receipt_before="$(sha256sum "$SUCCESSOR_RECEIPT" | awk '{print $1}')"
$AUTHORITY_PATH apply --control-release-sha "$CONTROL_SHA" --plan-sha256 "$plan_sha" --action-count 2 --confirmation "$CONFIRMATION" > /run/fixture-successor-idempotent.out
grep -F -x 'LEGACY_DRAIN_MANIFEST_SUCCESSOR_ALREADY_ACCEPTED=true' /run/fixture-successor-idempotent.out >/dev/null || die 'idempotent apply was not recognized'
[[ "$(sha256sum "$SUCCESSOR_RECEIPT" | awk '{print $1}')" == "$receipt_before" ]] || die 'idempotent apply rewrote immutable receipt'

# Model a crash after durable fences/evidence but before receipt publication.
# The recovery path must re-attest the exact retained evidence and publish one
# receipt without reopening unit, route, or database authority.
rm -f -- "$SUCCESSOR_RECEIPT"
$AUTHORITY_PATH apply --control-release-sha "$CONTROL_SHA" --plan-sha256 "$plan_sha" --action-count 2 --confirmation "$CONFIRMATION" > /run/fixture-successor-recovery.out
grep -F -x 'LEGACY_DRAIN_MANIFEST_SUCCESSOR_APPLY=PASS' /run/fixture-successor-recovery.out >/dev/null || die 'crash recovery did not republish successor receipt'
$AUTHORITY_PATH check --control-release-sha "$CONTROL_SHA" > /run/fixture-successor-recovery-check.out

# A loaded drop-in with a changed condition is a live systemd drift and must
# fail closed before a caller can treat the manifest successor as accepted.
fence='/etc/systemd/system/leetplus-langame-daily-worker.service.d/90-leetplus-nminus1-start-fence.conf'
printf '[Unit]\nConditionPathExists=/unsafe\n' > "$fence"
if $AUTHORITY_PATH check --control-release-sha "$CONTROL_SHA" > /run/fixture-successor-tamper.out 2>&1; then
  die 'check accepted a tampered successor fence'
fi
grep -F 'start fence content is not exact: leetplus-langame-daily-worker.service' /run/fixture-successor-tamper.out >/dev/null \
  || { cat /run/fixture-successor-tamper.out >&2; die 'tamper negative stopped at an unexpected guard'; }
printf '[Unit]\nConditionPathExists=!%s\n' "$FENCE_MARKER" > "$fence"
chown root:root "$fence"; chmod 0644 "$fence"
$AUTHORITY_PATH check --control-release-sha "$CONTROL_SHA" > /run/fixture-successor-final-check.out
grep -F -x 'LEGACY_DRAIN_MANIFEST_SUCCESSOR_CHECK=PASS' /run/fixture-successor-final-check.out >/dev/null || die 'check did not recover from repaired drift'

[[ -f "$CONTROL_EVIDENCE" && -f "$SUCCESSOR_EVIDENCE" && -f "$SUCCESSOR_RECEIPT" ]] || die 'successor evidence chain is incomplete'
grep -F -x "SUCCESSOR_VERIFIER_OUTPUT_SHA256=$(sha256sum "$SUCCESSOR_EVIDENCE" | awk '{print $1}')" "$SUCCESSOR_RECEIPT" >/dev/null || die 'successor verifier evidence is not receipt-bound'
grep -F -x "CONTROL_VERIFIER_OUTPUT_SHA256=$(sha256sum "$CONTROL_EVIDENCE" | awk '{print $1}')" "$SUCCESSOR_RECEIPT" >/dev/null || die 'control verifier evidence is not receipt-bound'
printf 'legacy drain manifest successor root fixture: PASS\n'
