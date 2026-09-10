#!/usr/bin/bash -p
#
# One-shot, receipt-bound CURRENT191 capacity retirement authority.
#
# Production targets are deliberately compiled into this file. The authority
# accepts no path, glob, directory or retention-policy input and unlinks only
# the three reviewed logical dump files below. It preserves and revalidates the
# exact pre-CURRENT191 recovery pair before and after the effect.

[[ $- == *p* ]] || {
  printf 'current191 dump retirement: privileged Bash mode is required\n' >&2
  exit 1
}

fixture_confirmation_input="${LEETPLUS_SUPERSEDED_DUMP_PRUNE_FIXTURE_CONFIRM:-}"
fixture_abort_input="${LEETPLUS_SUPERSEDED_DUMP_PRUNE_FIXTURE_ABORT_AFTER_FIRST_UNLINK:-}"
fixture_ci_input="${CI:-}"
fixture_github_input="${GITHUB_ACTIONS:-}"
while IFS= read -r inherited_name; do
  unset "$inherited_name" 2>/dev/null || true
done < <(compgen -e)
unset inherited_name
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
LANG='C.UTF-8'
LC_ALL='C.UTF-8'
TZ='UTC'
export PATH LANG LC_ALL TZ

set -Eeuo pipefail
IFS=$'\n\t'
umask 0077
cd /

readonly OPERATION_ID='current191-capacity-retirement-20260910'
readonly RELEASE_SHA_PATTERN='^[0-9a-f]{40}$'
readonly SHA256_PATTERN='^[0-9a-f]{64}$'
readonly FIXTURE_ROOT_PATTERN='^/tmp/leetplus-superseded-dump-prune-test\.[A-Za-z0-9_-]+$'
readonly CONFIRMATION='I_ACCEPT_RETIRE_THREE_SUPERSEDED_DUMPS_FOR_CURRENT191'
readonly FIXTURE_CONFIRMATION='run-bounded-root-current191-retirement-fixture'
readonly SOURCE_DATABASE_STATE='190|20260908090000_initial_owner_invite_link_mode|0|0'
readonly PRODUCTION_CONTROL_VERIFIER='/usr/local/libexec/leetplus/verify-installed-production-control-generation.mjs'
readonly PRODUCTION_ORCHESTRATOR='/usr/local/libexec/leetplus/resumable-release-orchestrator.mjs'

die() {
  printf 'current191 dump retirement: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  leetplus-prune-three-superseded-dumps plan \
    --control-release-sha <40-lowercase-hex>

  leetplus-prune-three-superseded-dumps apply \
    --control-release-sha <40-lowercase-hex> \
    --plan-sha256 <64-lowercase-hex> \
    --confirm I_ACCEPT_RETIRE_THREE_SUPERSEDED_DUMPS_FOR_CURRENT191

  leetplus-prune-three-superseded-dumps check \
    --control-release-sha <40-lowercase-hex>

Production execution is root/Linux-only and has exactly three compiled file
targets. plan writes only a protected nonauthorizing plan. apply is the sole
effect boundary and requires its exact digest plus explicit confirmation.
check is read-only. A published intent permits idempotent recovery after a
lost response; an immutable receipt makes completed replay effect-free.
USAGE
}

for required_command in awk basename chmod cmp dirname env find findmnt flock getent grep id install ln mktemp readlink sha256sum stat sync uname unlink wc; do
  command -v "$required_command" >/dev/null 2>&1 \
    || die "required command is unavailable: ${required_command}"
done
[[ "$(uname -s)" == 'Linux' ]] || die 'Linux is required'
[[ ${EUID:-99999} -eq 0 && "$(/usr/bin/id -g)" == 0 ]] || die 'root authority is required'

mode=''
control_release_sha=''
plan_sha256=''
confirmation=''
fixture_mode=false
fixture_root=''
while (($# > 0)); do
  case "$1" in
    plan|apply|check)
      [[ -z "$mode" ]] || die 'exactly one mode is required'
      mode="$1"
      shift
      ;;
    --control-release-sha)
      [[ $# -ge 2 && -z "$control_release_sha" ]] || die '--control-release-sha requires one value'
      control_release_sha="$2"
      shift 2
      ;;
    --plan-sha256)
      [[ $# -ge 2 && -z "$plan_sha256" ]] || die '--plan-sha256 requires one value'
      plan_sha256="$2"
      shift 2
      ;;
    --confirm)
      [[ $# -ge 2 && -z "$confirmation" ]] || die '--confirm requires one value'
      confirmation="$2"
      shift 2
      ;;
    --fixture-root)
      [[ $# -ge 2 && -z "$fixture_root" ]] || die '--fixture-root requires one value'
      fixture_root="$2"
      fixture_mode=true
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ -n "$mode" ]] || die 'one mode is required'
[[ "$control_release_sha" =~ $RELEASE_SHA_PATTERN ]] \
  || die '--control-release-sha must be 40 lowercase hexadecimal characters'
if [[ "$mode" == apply ]]; then
  [[ "$plan_sha256" =~ $SHA256_PATTERN ]] \
    || die 'apply requires a 64 lowercase hexadecimal plan digest'
  [[ "$confirmation" == "$CONFIRMATION" ]] \
    || die 'apply requires the exact explicit confirmation'
else
  [[ -z "$plan_sha256$confirmation" ]] \
    || die 'plan/check do not accept apply-only arguments'
fi

if [[ "$fixture_mode" == true ]]; then
  [[ "$fixture_confirmation_input" == "$FIXTURE_CONFIRMATION" \
    && "$fixture_ci_input" == true && "$fixture_github_input" == true ]] \
    || die 'fixture execution requires the exact CI acknowledgement'
  [[ "$fixture_root" =~ $FIXTURE_ROOT_PATTERN \
    && -d "$fixture_root" && ! -L "$fixture_root" \
    && "$(readlink -e -- "$fixture_root")" == "$fixture_root" \
    && "$(stat -c '%u:%g:%a' -- "$fixture_root")" == '0:0:700' ]] \
    || die 'fixture root must be an exact root-owned 0700 /tmp fixture directory'
  [[ -z "$fixture_abort_input" || "$fixture_abort_input" == 1 ]] \
    || die 'fixture abort selector is invalid'
else
  [[ -z "$fixture_root$fixture_confirmation_input$fixture_abort_input$fixture_ci_input$fixture_github_input" ]] \
    || die 'fixture-only environment is forbidden in production mode'
fi

prefix=''
if [[ "$fixture_mode" == true ]]; then
  prefix="$fixture_root"
fi

readonly install_lock="${prefix}/run/leetplus-production-control/install.lock"
readonly deploy_receipt_root="${prefix}/var/lib/leetplus/deploy-receipts"
readonly rollout_state_root="${deploy_receipt_root}/release-orchestrator"
readonly retirement_root="${deploy_receipt_root}/superseded-dump-retirement"
readonly state_root="${retirement_root}/${OPERATION_ID}"
readonly plan_path="${state_root}/plan.v1"
readonly intent_path="${state_root}/apply.intent.v1"
readonly receipt_path="${state_root}/apply.receipt.v1"

declare -a target_paths target_hashes target_sizes target_owners target_groups target_modes
declare -a target_parent_owners target_parent_groups target_parent_modes
declare -a preserved_paths preserved_hashes preserved_sizes preserved_owners preserved_groups preserved_modes
declare -a preserved_parent_owners preserved_parent_groups preserved_parent_modes

if [[ "$fixture_mode" == true ]]; then
  target_paths=(
    "${prefix}/var/lib/postgresql/current191-d5d9b60c-9b2434aa/leetplus.dump"
    "${prefix}/srv/leetplus/release-preparation/54babfaf-b97181ea/database.dump"
    "${prefix}/srv/leetplus/recovery-backups/leetplus-before-langame-recovery-20260827T1600Z.dump"
  )
  target_hashes=(
    '001e7753b208966bb804dd26c6970a17515f94dec9452791669c77f628efd23a'
    '5487d462b4b2aa99033eba97b67fceee8781fd2652f7c59bd139eba68ba1ec7e'
    '7ace918529a054af27627054fb33c130d6541cd67af554b1cce3559055c536d7'
  )
  target_sizes=(15 16 13)
  target_owners=(root root root)
  target_groups=(root root root)
  target_modes=(600 400 664)
  target_parent_owners=(root root root)
  target_parent_groups=(root root root)
  target_parent_modes=(700 700 700)
  preserved_paths=(
    "${prefix}/var/lib/postgresql/pre-current191-fa21bbe-20260909T102434Z/leetplus.dump"
    "${prefix}/var/lib/postgresql/pre-current191-fa21bbe-20260909T102434Z/globals.sql"
  )
  preserved_hashes=(
    '6011e179018f6e16d63920502b32db5cfb6c7118c3aa7cb0c8d529bb75ca758f'
    '41f83320699487861d140706e1082702e7b60cd7980f4b780e42996195ac83e6'
  )
  preserved_sizes=(17 14)
  preserved_owners=(root root)
  preserved_groups=(root root)
  preserved_modes=(600 600)
  preserved_parent_owners=(root root)
  preserved_parent_groups=(root root)
  preserved_parent_modes=(700 700)
else
  target_paths=(
    '/var/lib/postgresql/current191-d5d9b60c-9b2434aa/leetplus.dump'
    '/srv/leetplus/release-preparation/54babfaf-b97181ea/database.dump'
    '/srv/leetplus/recovery-backups/leetplus-before-langame-recovery-20260827T1600Z.dump'
  )
  target_hashes=(
    '16c5e018fbaeb5d20ff3adc8e91a5f5a6f70bf103613c75fcfda84ca7533049c'
    '8e24055ee34422f601549505d2949b81e9d8c5aba8cfe1d375bf5b7b3bd94b2a'
    '89c6cf19609472bcc5fc4def6f06e0a412e78ce1f06b777c5401bb915b3d419a'
  )
  target_sizes=(2043617030 1992730226 1798121874)
  target_owners=(postgres root postgres)
  target_groups=(postgres root postgres)
  target_modes=(600 400 664)
  target_parent_owners=(postgres root postgres)
  target_parent_groups=(postgres root postgres)
  target_parent_modes=(700 700 700)
  preserved_paths=(
    '/var/lib/postgresql/pre-current191-fa21bbe-20260909T102434Z/leetplus.dump'
    '/var/lib/postgresql/pre-current191-fa21bbe-20260909T102434Z/globals.sql'
  )
  preserved_hashes=(
    '48bc33f87058aca0436b9a9b6f9fc48ede3b6d6d2db8602c55d3251329e9c98a'
    '11f6a8262429ef2dbcceda70dd5f124293700526b0d21b27663f2cfc1181db4b'
  )
  preserved_sizes=(2044343888 2383)
  preserved_owners=(postgres postgres)
  preserved_groups=(postgres postgres)
  preserved_modes=(600 600)
  preserved_parent_owners=(postgres postgres)
  preserved_parent_groups=(postgres postgres)
  preserved_parent_modes=(700 700)
fi
readonly -a target_paths target_hashes target_sizes target_owners target_groups target_modes
readonly -a target_parent_owners target_parent_groups target_parent_modes
readonly -a preserved_paths preserved_hashes preserved_sizes preserved_owners preserved_groups preserved_modes
readonly -a preserved_parent_owners preserved_parent_groups preserved_parent_modes

sha256_file() {
  sha256sum -- "$1" | awk '{ print $1 }'
}

assert_real_directory() {
  local path="$1" owner="$2" group="$3" expected_mode="$4" label="$5"
  [[ -d "$path" && ! -L "$path" && "$(readlink -e -- "$path")" == "$path" ]] \
    || die "${label} must be a canonical real directory"
  [[ "$(stat -c '%U:%G:%a' -- "$path")" == "${owner}:${group}:${expected_mode}" ]] \
    || die "${label} ownership or mode is invalid"
}

assert_safe_record() {
  local path="$1" label="$2"
  [[ -f "$path" && ! -L "$path" && "$(readlink -e -- "$path")" == "$path" \
    && "$(stat -c '%U:%G:%a:%h' -- "$path")" == 'root:root:400:1' ]] \
    || die "${label} is absent or unsafe"
}

assert_no_open_descriptor() {
  local path="$1" match
  match="$(find -P /proc/[0-9]*/fd -mindepth 1 -maxdepth 1 -type l \
    \( -lname "$path" -o -lname "${path} (deleted)" \) -print -quit 2>/dev/null || true)"
  [[ -z "$match" ]] || die "reviewed target is open by a live process: ${path}"
}

snapshot_line() {
  local path="$1" expected_hash="$2" expected_size="$3" expected_owner="$4"
  local expected_group="$5" expected_mode="$6" parent_owner="$7" parent_group="$8"
  local parent_mode="$9" require_closed="${10}" label="${11}"
  local parent metadata metadata_after digest
  parent="$(dirname -- "$path")"
  assert_real_directory "$parent" "$parent_owner" "$parent_group" "$parent_mode" "${label} parent"
  [[ -f "$path" && ! -L "$path" && "$(readlink -e -- "$path")" == "$path" ]] \
    || die "${label} must be an exact regular file"
  [[ "$(stat -c '%U:%G:%a:%h:%s' -- "$path")" == \
    "${expected_owner}:${expected_group}:${expected_mode}:1:${expected_size}" ]] \
    || die "${label} ownership, mode, link count or size drifted"
  if findmnt --mountpoint "$path" >/dev/null 2>&1; then
    die "${label} must not be a mount point"
  fi
  if [[ "$require_closed" == true ]]; then
    assert_no_open_descriptor "$path"
  fi
  metadata="$(stat -c '%d|%i|%s|%a|%u|%g|%h|%Y|%Z|%b|%B' -- "$path")"
  digest="$(sha256_file "$path")"
  [[ "$digest" == "$expected_hash" ]] || die "${label} SHA-256 drifted"
  metadata_after="$(stat -c '%d|%i|%s|%a|%u|%g|%h|%Y|%Z|%b|%B' -- "$path")"
  [[ "$metadata_after" == "$metadata" ]] || die "${label} changed while it was hashed"
  if [[ "$require_closed" == true ]]; then
    assert_no_open_descriptor "$path"
  fi
  printf '%s|%s' "$metadata" "$digest"
}

declare -a target_snapshots preserved_snapshots

collect_all_snapshots() {
  local index
  target_snapshots=()
  preserved_snapshots=()
  for index in "${!preserved_paths[@]}"; do
    preserved_snapshots+=("$(snapshot_line \
      "${preserved_paths[$index]}" "${preserved_hashes[$index]}" "${preserved_sizes[$index]}" \
      "${preserved_owners[$index]}" "${preserved_groups[$index]}" "${preserved_modes[$index]}" \
      "${preserved_parent_owners[$index]}" "${preserved_parent_groups[$index]}" \
      "${preserved_parent_modes[$index]}" false "preserved recovery file $((index + 1))")")
  done
  if [[ "$fixture_mode" == false ]]; then
    /usr/bin/pg_restore --list "${preserved_paths[0]}" >/dev/null \
      || die 'preserved pre-CURRENT191 dump is not readable by pg_restore'
  fi
  for index in "${!target_paths[@]}"; do
    target_snapshots+=("$(snapshot_line \
      "${target_paths[$index]}" "${target_hashes[$index]}" "${target_sizes[$index]}" \
      "${target_owners[$index]}" "${target_groups[$index]}" "${target_modes[$index]}" \
      "${target_parent_owners[$index]}" "${target_parent_groups[$index]}" \
      "${target_parent_modes[$index]}" true "retirement target $((index + 1))")")
  done
}

emit_snapshot_fields() {
  local prefix_name="$1" number="$2" path="$3" owner="$4" group="$5" snapshot="$6"
  local device inode size_value mode_value uid gid links mtime ctime blocks block_size digest
  IFS='|' read -r device inode size_value mode_value uid gid links mtime ctime blocks block_size digest <<< "$snapshot"
  printf '%s_%s_PATH=%s\n' "$prefix_name" "$number" "$path"
  printf '%s_%s_SHA256=%s\n' "$prefix_name" "$number" "$digest"
  printf '%s_%s_SIZE=%s\n' "$prefix_name" "$number" "$size_value"
  printf '%s_%s_OWNER=%s\n' "$prefix_name" "$number" "$owner"
  printf '%s_%s_GROUP=%s\n' "$prefix_name" "$number" "$group"
  printf '%s_%s_MODE=%s\n' "$prefix_name" "$number" "$mode_value"
  printf '%s_%s_DEVICE=%s\n' "$prefix_name" "$number" "$device"
  printf '%s_%s_INODE=%s\n' "$prefix_name" "$number" "$inode"
  printf '%s_%s_UID=%s\n' "$prefix_name" "$number" "$uid"
  printf '%s_%s_GID=%s\n' "$prefix_name" "$number" "$gid"
  printf '%s_%s_LINK_COUNT=%s\n' "$prefix_name" "$number" "$links"
  printf '%s_%s_MTIME=%s\n' "$prefix_name" "$number" "$mtime"
  printf '%s_%s_CTIME=%s\n' "$prefix_name" "$number" "$ctime"
  printf '%s_%s_BLOCKS=%s\n' "$prefix_name" "$number" "$blocks"
  printf '%s_%s_BLOCK_SIZE=%s\n' "$prefix_name" "$number" "$block_size"
}

emit_plan() {
  local index total_bytes=0
  for index in "${!target_sizes[@]}"; do
    total_bytes=$((total_bytes + target_sizes[index]))
  done
  printf 'RECORD_VERSION=1\n'
  printf 'RECORD_KIND=LEETPLUS_CURRENT191_CAPACITY_RETIREMENT_PLAN_V1\n'
  printf 'OPERATION_ID=%s\n' "$OPERATION_ID"
  printf 'CONTROL_RELEASE_SHA=%s\n' "$control_release_sha"
  printf 'SOURCE_DATABASE_STATE=%s\n' "$SOURCE_DATABASE_STATE"
  printf 'TARGET_COUNT=3\n'
  printf 'PRESERVED_COUNT=2\n'
  printf 'TOTAL_TARGET_BYTES=%s\n' "$total_bytes"
  printf 'DECISION=PREPARED_NOT_EFFECT_AUTHORIZATION\n'
  for index in "${!preserved_paths[@]}"; do
    emit_snapshot_fields PRESERVED "$((index + 1))" "${preserved_paths[$index]}" \
      "${preserved_owners[$index]}" "${preserved_groups[$index]}" "${preserved_snapshots[$index]}"
  done
  for index in "${!target_paths[@]}"; do
    emit_snapshot_fields TARGET "$((index + 1))" "${target_paths[$index]}" \
      "${target_owners[$index]}" "${target_groups[$index]}" "${target_snapshots[$index]}"
  done
}

record_value() {
  local record="$1" key="$2" count value
  count="$(awk -F= -v key="$key" '$1 == key { count += 1 } END { print count + 0 }' "$record")"
  [[ "$count" == 1 ]] || return 1
  value="$(awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print }' "$record")"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || return 1
  printf '%s' "$value"
}

expected_plan_keys() {
  local prefix_name number key
  printf '%s\n' RECORD_VERSION RECORD_KIND OPERATION_ID CONTROL_RELEASE_SHA SOURCE_DATABASE_STATE \
    TARGET_COUNT PRESERVED_COUNT TOTAL_TARGET_BYTES DECISION
  for prefix_name in PRESERVED TARGET; do
    if [[ "$prefix_name" == PRESERVED ]]; then
      for number in 1 2; do
        for key in PATH SHA256 SIZE OWNER GROUP MODE DEVICE INODE UID GID LINK_COUNT MTIME CTIME BLOCKS BLOCK_SIZE; do
          printf '%s_%s_%s\n' "$prefix_name" "$number" "$key"
        done
      done
    else
      for number in 1 2 3; do
        for key in PATH SHA256 SIZE OWNER GROUP MODE DEVICE INODE UID GID LINK_COUNT MTIME CTIME BLOCKS BLOCK_SIZE; do
          printf '%s_%s_%s\n' "$prefix_name" "$number" "$key"
        done
      done
    fi
  done
}

assert_plan_record() {
  local record="$1" observed_keys expected_keys index number prefix_name expected_uid expected_gid key value total_bytes=0
  assert_safe_record "$record" 'retirement plan'
  [[ -z "$(awk -F= '!/^[A-Z0-9_]+=[^\r\n]*$/ || seen[$1]++ { print; exit }' "$record")" ]] \
    || die 'retirement plan schema is malformed'
  observed_keys="$(awk -F= '{ print $1 }' "$record")"
  expected_keys="$(expected_plan_keys)"
  [[ "$observed_keys" == "$expected_keys" ]] \
    || die 'retirement plan key order or set drifted'
  [[ "$(record_value "$record" RECORD_VERSION)" == 1 \
    && "$(record_value "$record" RECORD_KIND)" == 'LEETPLUS_CURRENT191_CAPACITY_RETIREMENT_PLAN_V1' \
    && "$(record_value "$record" OPERATION_ID)" == "$OPERATION_ID" \
    && "$(record_value "$record" CONTROL_RELEASE_SHA)" == "$control_release_sha" \
    && "$(record_value "$record" SOURCE_DATABASE_STATE)" == "$SOURCE_DATABASE_STATE" \
    && "$(record_value "$record" TARGET_COUNT)" == 3 \
    && "$(record_value "$record" PRESERVED_COUNT)" == 2 \
    && "$(record_value "$record" DECISION)" == 'PREPARED_NOT_EFFECT_AUTHORIZATION' ]] \
    || die 'retirement plan fixed fields drifted'
  for index in "${!target_sizes[@]}"; do total_bytes=$((total_bytes + target_sizes[index])); done
  [[ "$(record_value "$record" TOTAL_TARGET_BYTES)" == "$total_bytes" ]] \
    || die 'retirement plan byte total drifted'

  for prefix_name in PRESERVED TARGET; do
    if [[ "$prefix_name" == PRESERVED ]]; then
      for index in "${!preserved_paths[@]}"; do
        number=$((index + 1))
        [[ "$(record_value "$record" "${prefix_name}_${number}_PATH")" == "${preserved_paths[$index]}" \
          && "$(record_value "$record" "${prefix_name}_${number}_SHA256")" == "${preserved_hashes[$index]}" \
          && "$(record_value "$record" "${prefix_name}_${number}_SIZE")" == "${preserved_sizes[$index]}" \
          && "$(record_value "$record" "${prefix_name}_${number}_OWNER")" == "${preserved_owners[$index]}" \
          && "$(record_value "$record" "${prefix_name}_${number}_GROUP")" == "${preserved_groups[$index]}" \
          && "$(record_value "$record" "${prefix_name}_${number}_MODE")" == "${preserved_modes[$index]}" ]] \
          || die "retirement plan preserved file ${number} drifted"
        expected_uid="$(id -u "${preserved_owners[$index]}")"
        expected_gid="$(getent group "${preserved_groups[$index]}" | awk -F: '{ print $3 }')"
        [[ "$(record_value "$record" "${prefix_name}_${number}_UID")" == "$expected_uid" \
          && "$(record_value "$record" "${prefix_name}_${number}_GID")" == "$expected_gid" ]] \
          || die "retirement plan preserved identity ${number} drifted"
      done
    else
      for index in "${!target_paths[@]}"; do
        number=$((index + 1))
        [[ "$(record_value "$record" "${prefix_name}_${number}_PATH")" == "${target_paths[$index]}" \
          && "$(record_value "$record" "${prefix_name}_${number}_SHA256")" == "${target_hashes[$index]}" \
          && "$(record_value "$record" "${prefix_name}_${number}_SIZE")" == "${target_sizes[$index]}" \
          && "$(record_value "$record" "${prefix_name}_${number}_OWNER")" == "${target_owners[$index]}" \
          && "$(record_value "$record" "${prefix_name}_${number}_GROUP")" == "${target_groups[$index]}" \
          && "$(record_value "$record" "${prefix_name}_${number}_MODE")" == "${target_modes[$index]}" ]] \
          || die "retirement plan target ${number} drifted"
        expected_uid="$(id -u "${target_owners[$index]}")"
        expected_gid="$(getent group "${target_groups[$index]}" | awk -F: '{ print $3 }')"
        [[ "$(record_value "$record" "${prefix_name}_${number}_UID")" == "$expected_uid" \
          && "$(record_value "$record" "${prefix_name}_${number}_GID")" == "$expected_gid" ]] \
          || die "retirement plan target identity ${number} drifted"
      done
    fi
  done
  for key in $(expected_plan_keys | grep -E '_(DEVICE|INODE|UID|GID|LINK_COUNT|MTIME|CTIME|BLOCKS|BLOCK_SIZE|SIZE)$'); do
    value="$(record_value "$record" "$key")"
    [[ "$value" =~ ^[0-9]+$ ]] || die "retirement plan numeric field is invalid: ${key}"
  done
}

snapshot_from_plan() {
  local record="$1" prefix_name="$2" number="$3"
  printf '%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s' \
    "$(record_value "$record" "${prefix_name}_${number}_DEVICE")" \
    "$(record_value "$record" "${prefix_name}_${number}_INODE")" \
    "$(record_value "$record" "${prefix_name}_${number}_SIZE")" \
    "$(record_value "$record" "${prefix_name}_${number}_MODE")" \
    "$(record_value "$record" "${prefix_name}_${number}_UID")" \
    "$(record_value "$record" "${prefix_name}_${number}_GID")" \
    "$(record_value "$record" "${prefix_name}_${number}_LINK_COUNT")" \
    "$(record_value "$record" "${prefix_name}_${number}_MTIME")" \
    "$(record_value "$record" "${prefix_name}_${number}_CTIME")" \
    "$(record_value "$record" "${prefix_name}_${number}_BLOCKS")" \
    "$(record_value "$record" "${prefix_name}_${number}_BLOCK_SIZE")" \
    "$(record_value "$record" "${prefix_name}_${number}_SHA256")"
}

assert_file_matches_plan() {
  local record="$1" prefix_name="$2" index="$3" path expected current
  if [[ "$prefix_name" == PRESERVED ]]; then
    path="${preserved_paths[$index]}"
    current="$(snapshot_line "$path" "${preserved_hashes[$index]}" "${preserved_sizes[$index]}" \
      "${preserved_owners[$index]}" "${preserved_groups[$index]}" "${preserved_modes[$index]}" \
      "${preserved_parent_owners[$index]}" "${preserved_parent_groups[$index]}" \
      "${preserved_parent_modes[$index]}" false "preserved recovery file $((index + 1))")"
  else
    path="${target_paths[$index]}"
    current="$(snapshot_line "$path" "${target_hashes[$index]}" "${target_sizes[$index]}" \
      "${target_owners[$index]}" "${target_groups[$index]}" "${target_modes[$index]}" \
      "${target_parent_owners[$index]}" "${target_parent_groups[$index]}" \
      "${target_parent_modes[$index]}" true "retirement target $((index + 1))")"
  fi
  expected="$(snapshot_from_plan "$record" "$prefix_name" "$((index + 1))")"
  [[ "$current" == "$expected" ]] || die "${prefix_name} file $((index + 1)) changed after plan"
}

assert_targets_absent() {
  local path
  for path in "${target_paths[@]}"; do
    [[ ! -e "$path" && ! -L "$path" ]] || die "retirement target remains present: ${path}"
  done
}

assert_preserved_against_plan() {
  local index
  for index in "${!preserved_paths[@]}"; do
    assert_file_matches_plan "$plan_path" PRESERVED "$index"
  done
  if [[ "$fixture_mode" == false ]]; then
    /usr/bin/pg_restore --list "${preserved_paths[0]}" >/dev/null \
      || die 'preserved pre-CURRENT191 dump is not readable by pg_restore'
  fi
}

assert_state_roots() {
  assert_real_directory "$deploy_receipt_root" root root 700 'deployment receipt root'
  if [[ ! -e "$retirement_root" && ! -L "$retirement_root" ]]; then
    install -d -o root -g root -m 0700 -- "$retirement_root"
    sync -d "$deploy_receipt_root"
  fi
  assert_real_directory "$retirement_root" root root 700 'retirement receipt root'
  if [[ ! -e "$state_root" && ! -L "$state_root" ]]; then
    install -d -o root -g root -m 0700 -- "$state_root"
    sync -d "$retirement_root"
  fi
  assert_real_directory "$state_root" root root 700 'retirement operation root'
}

assert_existing_state_roots() {
  assert_real_directory "$deploy_receipt_root" root root 700 'deployment receipt root'
  assert_real_directory "$retirement_root" root root 700 'retirement receipt root'
  assert_real_directory "$state_root" root root 700 'retirement operation root'
}

normalize_existing_publication() {
  local final_path="$1" identity candidate candidate_identity matching='' matching_count=0
  [[ -f "$final_path" && ! -L "$final_path" && "$(readlink -e -- "$final_path")" == "$final_path" ]] \
    || die 'published record target is unsafe'
  case "$(stat -c '%U:%G:%a:%h' -- "$final_path")" in
    root:root:400:1) return 0 ;;
    root:root:400:2) ;;
    *) die 'published record identity is unsafe' ;;
  esac
  identity="$(stat -c '%d:%i' -- "$final_path")"
  while IFS= read -r -d '' candidate; do
    candidate_identity="$(stat -c '%d:%i' -- "$candidate")"
    if [[ "$candidate_identity" == "$identity" ]]; then
      matching="$candidate"
      matching_count=$((matching_count + 1))
    fi
  done < <(find -P "$state_root" -mindepth 1 -maxdepth 1 -type f \
    -name ".$(basename -- "$final_path").new.*" -print0)
  ((matching_count == 1)) || die 'cannot normalize interrupted record publication'
  unlink -- "$matching"
  sync -d "$state_root"
  assert_safe_record "$final_path" 'normalized published record'
}

cleanup_unpublished_temporaries() {
  local candidate
  while IFS= read -r -d '' candidate; do
    [[ -f "$candidate" && ! -L "$candidate" \
      && "$(stat -c '%U:%G:%a:%h' -- "$candidate")" == 'root:root:400:1' ]] \
      || die 'unpublished record temporary is unsafe'
    unlink -- "$candidate"
  done < <(find -P "$state_root" -mindepth 1 -maxdepth 1 -type f -name '.*.new.*' -print0)
  sync -d "$state_root"
}

publish_record() {
  local final_path="$1" generator="$2" temporary
  if [[ -e "$final_path" || -L "$final_path" ]]; then
    normalize_existing_publication "$final_path"
  fi
  cleanup_unpublished_temporaries
  temporary="$(mktemp "${state_root}/.$(basename -- "$final_path").new.XXXXXX")"
  "$generator" > "$temporary"
  chmod 0400 -- "$temporary"
  sync -f "$temporary"
  if [[ -e "$final_path" || -L "$final_path" ]]; then
    assert_safe_record "$final_path" 'existing published record'
    cmp -s -- "$temporary" "$final_path" \
      || { unlink -- "$temporary"; die 'existing published record differs from requested record'; }
    unlink -- "$temporary"
    return 0
  fi
  ln -T -- "$temporary" "$final_path" || { unlink -- "$temporary"; die 'cannot publish record exclusively'; }
  sync -d "$state_root"
  unlink -- "$temporary"
  sync -d "$state_root"
  assert_safe_record "$final_path" 'new published record'
}

assert_install_lock() {
  local lock_identity
  [[ -f "$install_lock" && ! -L "$install_lock" \
    && "$(readlink -e -- "$install_lock")" == "$install_lock" \
    && "$(stat -c '%U:%G:%a:%h' -- "$install_lock")" == 'root:root:600:1' ]] \
    || die 'production-control install lock is absent or unsafe'
  lock_identity="$(stat -c '%d:%i' -- "$install_lock")"
  exec 8<> "$install_lock"
  [[ "$(stat -Lc '%d:%i' -- /proc/self/fd/8)" == "$lock_identity" ]] \
    || die 'opened production-control lock differs from validated path'
  if [[ "$mode" == apply ]]; then
    flock -xn 8 || die 'another production-control install or rollout effect is active'
  else
    flock -sn 8 || die 'a production-control install or rollout effect is active'
  fi
  [[ "$(stat -c '%d:%i:%U:%G:%a:%h' -- "$install_lock")" == \
    "${lock_identity}:root:root:600:1" ]] || die 'production-control install lock changed while held'
}

assert_control_generation() {
  local output
  if [[ "$fixture_mode" == true ]]; then
    local fixture_control="${fixture_root}/control.release"
    [[ -f "$fixture_control" && ! -L "$fixture_control" \
      && "$(readlink -e -- "$fixture_control")" == "$fixture_control" \
      && "$(stat -c '%U:%G:%a:%h' -- "$fixture_control")" == 'root:root:400:1' \
      && "$(wc -l < "$fixture_control" | awk '{ print $1 }')" == 1 \
      && "$(awk 'NR == 1 { print }' "$fixture_control")" == "$control_release_sha" ]] \
      || die 'fixture control generation is invalid'
    return 0
  fi
  [[ -x /usr/bin/node && ! -L /usr/bin/node && "$(readlink -e -- /usr/bin/node)" == /usr/bin/node ]] \
    || die 'exact production Node authority is unavailable'
  [[ -f "$PRODUCTION_CONTROL_VERIFIER" && ! -L "$PRODUCTION_CONTROL_VERIFIER" ]] \
    || die 'installed production-control verifier is unavailable'
  output="$(/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC \
    /usr/bin/node "$PRODUCTION_CONTROL_VERIFIER" \
    --release-sha "$control_release_sha" --require-root-authority)" \
    || die 'installed production-control generation was rejected'
  grep -F -x 'PRODUCTION_CONTROL_INSTALLED_GENERATION=PASS' <<< "$output" >/dev/null \
    && grep -F -x "PRODUCTION_CONTROL_RELEASE_SHA=${control_release_sha}" <<< "$output" >/dev/null \
    || die 'installed production-control identity drifted'
}

assert_rollouts_terminal() {
  local output entry terminal_count=0
  if [[ "$fixture_mode" == true ]]; then
    assert_real_directory "$rollout_state_root" root root 700 'fixture rollout state root'
    while IFS= read -r -d '' entry; do
      if [[ "$(basename -- "$entry")" == orchestrator.lock ]]; then
        [[ -f "$entry" && ! -L "$entry" ]] || die 'fixture orchestrator lock is unsafe'
        continue
      fi
      [[ -d "$entry" && ! -L "$entry" \
        && "$(basename -- "$entry")" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] \
        || die 'fixture rollout inventory is malformed'
      if [[ -f "$entry/final.json" && ! -e "$entry/superseded.json" ]]; then
        terminal_count=$((terminal_count + 1))
      elif [[ -f "$entry/superseded.json" && ! -e "$entry/final.json" ]]; then
        terminal_count=$((terminal_count + 1))
      else
        die 'fixture contains a nonterminal rollout operation'
      fi
    done < <(find -P "$rollout_state_root" -mindepth 1 -maxdepth 1 -print0)
    ((terminal_count > 0)) || die 'fixture must contain at least one terminal rollout operation'
    return 0
  fi
  output="$(/usr/bin/env -i \
    PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC \
    LEETPLUS_RESUMABLE_RELEASE_BOOTSTRAP=LEETPLUS_RESUMABLE_RELEASE_BOOTSTRAP_V1 \
    LEETPLUS_RESUMABLE_RELEASE_INSTALL_LOCK_FD=8 \
    /usr/bin/node "$PRODUCTION_ORCHESTRATOR" metrics)" \
    || die 'rollout terminal inventory validation failed'
  printf '%s\n' "$output" | \
    /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC \
    /usr/bin/node -e \
    "let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{const value=JSON.parse(input);if(value?.schemaVersion!==1||value?.decision!=='METRICS_READ_ONLY'||value?.unresolved?.operationCount!==0)process.exit(1);});" \
    || die 'rollout terminal inventory contains unresolved operations'
}

assert_database_source_state() {
  local observed
  if [[ "$fixture_mode" == true ]]; then
    local fixture_db="${fixture_root}/database.state"
    [[ -f "$fixture_db" && ! -L "$fixture_db" \
      && "$(readlink -e -- "$fixture_db")" == "$fixture_db" \
      && "$(stat -c '%U:%G:%a:%h' -- "$fixture_db")" == 'root:root:400:1' ]] \
      || die 'fixture database state evidence is unsafe'
    observed="$(awk 'NR == 1 { print }' "$fixture_db")"
    [[ "$(wc -l < "$fixture_db" | awk '{ print $1 }')" == 1 ]] \
      || die 'fixture database state evidence is malformed'
  else
    for command_name in pg_restore psql runuser; do
      command -v "$command_name" >/dev/null 2>&1 || die "production database command is unavailable: ${command_name}"
    done
    observed="$(/usr/sbin/runuser -u postgres -- /usr/bin/psql -X -A -t -v ON_ERROR_STOP=1 \
      -d leetplus -c \
      "SELECT (COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL))::text || '|' || COALESCE(MAX(migration_name) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL), '') || '|' || (COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL))::text || '|' || (COUNT(*) FILTER (WHERE migration_name = '20260908180000_external_langame_simple_onboarding' AND finished_at IS NOT NULL AND rolled_back_at IS NULL))::text FROM \"_prisma_migrations\";")" \
      || die 'production database migration inventory failed'
  fi
  [[ "$observed" == "$SOURCE_DATABASE_STATE" ]] \
    || die "database is not at the exact pre-CURRENT191 source state: ${observed}"
}

emit_intent() {
  printf 'RECORD_VERSION=1\n'
  printf 'RECORD_KIND=LEETPLUS_CURRENT191_CAPACITY_RETIREMENT_INTENT_V1\n'
  printf 'OPERATION_ID=%s\n' "$OPERATION_ID"
  printf 'CONTROL_RELEASE_SHA=%s\n' "$control_release_sha"
  printf 'PLAN_PATH=%s\n' "$plan_path"
  printf 'PLAN_SHA256=%s\n' "$plan_sha256"
  printf 'TARGET_COUNT=3\n'
  printf 'DECISION=THREE_EXACT_UNLINKS_AUTHORIZED\n'
}

assert_intent() {
  assert_safe_record "$intent_path" 'retirement intent'
  cmp -s -- "$intent_path" <(emit_intent) \
    || die 'retirement intent content drifted'
}

emit_receipt() {
  local index number
  printf 'RECORD_VERSION=1\n'
  printf 'RECORD_KIND=LEETPLUS_CURRENT191_CAPACITY_RETIREMENT_RECEIPT_V1\n'
  printf 'OPERATION_ID=%s\n' "$OPERATION_ID"
  printf 'CONTROL_RELEASE_SHA=%s\n' "$control_release_sha"
  printf 'PLAN_PATH=%s\n' "$plan_path"
  printf 'PLAN_SHA256=%s\n' "$plan_sha256"
  printf 'TARGET_COUNT=3\n'
  printf 'TOTAL_TARGET_BYTES=%s\n' "$(record_value "$plan_path" TOTAL_TARGET_BYTES)"
  for index in "${!target_paths[@]}"; do
    number=$((index + 1))
    printf 'TARGET_%s_PATH=%s\n' "$number" "$(record_value "$plan_path" "TARGET_${number}_PATH")"
    printf 'TARGET_%s_SHA256=%s\n' "$number" "$(record_value "$plan_path" "TARGET_${number}_SHA256")"
    printf 'TARGET_%s_DEVICE=%s\n' "$number" "$(record_value "$plan_path" "TARGET_${number}_DEVICE")"
    printf 'TARGET_%s_INODE=%s\n' "$number" "$(record_value "$plan_path" "TARGET_${number}_INODE")"
    printf 'TARGET_%s_STATUS=UNLINKED\n' "$number"
  done
  printf 'PRESERVED_DUMP_PATH=%s\n' "$(record_value "$plan_path" PRESERVED_1_PATH)"
  printf 'PRESERVED_DUMP_SHA256=%s\n' "$(record_value "$plan_path" PRESERVED_1_SHA256)"
  printf 'PRESERVED_GLOBALS_PATH=%s\n' "$(record_value "$plan_path" PRESERVED_2_PATH)"
  printf 'PRESERVED_GLOBALS_SHA256=%s\n' "$(record_value "$plan_path" PRESERVED_2_SHA256)"
  printf 'DECISION=THREE_SUPERSEDED_DUMPS_RETIRED\n'
}

assert_receipt() {
  assert_safe_record "$receipt_path" 'retirement receipt'
  cmp -s -- "$receipt_path" <(emit_receipt) \
    || die 'retirement receipt content drifted'
}

print_plan_result() {
  printf 'CURRENT191_CAPACITY_RETIREMENT_PLAN=PASS\n'
  printf 'CURRENT191_CAPACITY_RETIREMENT_PLAN_PATH=%s\n' "$plan_path"
  printf 'CURRENT191_CAPACITY_RETIREMENT_PLAN_SHA256=%s\n' "$(sha256_file "$plan_path")"
  printf 'CURRENT191_CAPACITY_RETIREMENT_TARGET_BYTES=%s\n' "$(record_value "$plan_path" TOTAL_TARGET_BYTES)"
}

print_receipt_result() {
  printf 'CURRENT191_CAPACITY_RETIREMENT=PASS\n'
  printf 'CURRENT191_CAPACITY_RETIREMENT_RECEIPT_PATH=%s\n' "$receipt_path"
  printf 'CURRENT191_CAPACITY_RETIREMENT_RECEIPT_SHA256=%s\n' "$(sha256_file "$receipt_path")"
  printf 'CURRENT191_CAPACITY_RETIREMENT_RECLAIMED_BYTES=%s\n' "$(record_value "$receipt_path" TOTAL_TARGET_BYTES)"
}

assert_install_lock
if [[ "$mode" == plan ]]; then
  assert_state_roots
else
  assert_existing_state_roots
fi
assert_control_generation
assert_rollouts_terminal
assert_database_source_state

case "$mode" in
  plan)
    [[ ! -e "$intent_path" && ! -L "$intent_path" && ! -e "$receipt_path" && ! -L "$receipt_path" ]] \
      || die 'retirement effect journal already exists; use apply replay or check'
    collect_all_snapshots
    publish_record "$plan_path" emit_plan
    assert_plan_record "$plan_path"
    print_plan_result
    ;;
  apply)
    assert_plan_record "$plan_path"
    [[ "$(sha256_file "$plan_path")" == "$plan_sha256" ]] \
      || die 'supplied plan digest does not match the protected plan'
    if [[ -e "$receipt_path" || -L "$receipt_path" ]]; then
      assert_receipt
      assert_targets_absent
      assert_preserved_against_plan
      print_receipt_result
      exit 0
    fi
    if [[ ! -e "$intent_path" && ! -L "$intent_path" ]]; then
      collect_all_snapshots
      cmp -s -- "$plan_path" <(emit_plan) \
        || die 'retirement target inventory changed after plan'
      publish_record "$intent_path" emit_intent
    fi
    assert_intent
    assert_preserved_against_plan
    for index in "${!target_paths[@]}"; do
      target_path="${target_paths[$index]}"
      if [[ -e "$target_path" || -L "$target_path" ]]; then
        assert_file_matches_plan "$plan_path" TARGET "$index"
        unlink -- "$target_path"
        sync -d "$(dirname -- "$target_path")"
        [[ ! -e "$target_path" && ! -L "$target_path" ]] \
          || die "retirement target unlink did not persist: ${target_path}"
        if [[ "$fixture_mode" == true && "$fixture_abort_input" == 1 && "$index" == 0 ]]; then
          die 'fixture interruption after first durable target unlink'
        fi
      fi
    done
    assert_targets_absent
    assert_preserved_against_plan
    assert_control_generation
    assert_rollouts_terminal
    assert_database_source_state
    publish_record "$receipt_path" emit_receipt
    assert_receipt
    print_receipt_result
    ;;
  check)
    assert_plan_record "$plan_path"
    plan_sha256="$(sha256_file "$plan_path")"
    assert_intent
    assert_receipt
    assert_targets_absent
    assert_preserved_against_plan
    print_receipt_result
    ;;
esac
