#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

readonly ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly MANIFEST="${ROOT}/docs/deployment/production-artifact/systemd/legacy-drain-units.conf.example"
readonly CONTROLLER="${ROOT}/docs/deployment/production-artifact/rebind-legacy-drain-manifest-successor.sh"
readonly EXPECTED_SHA256='d6e7b4fe8e0aeb9a77caae62d2fb4ed9322e6383148934c5e26ff3f9126120dd'

die() { printf 'legacy drain manifest parser fixture: %s\n' "$*" >&2; exit 1; }

for command_name in awk grep sha256sum tr wc; do
  command -v "$command_name" >/dev/null 2>&1 || die "missing command: ${command_name}"
done
[[ -f "$MANIFEST" && ! -L "$MANIFEST" && -f "$CONTROLLER" && ! -L "$CONTROLLER" ]] \
  || die 'exact parser inputs are absent or linked'
[[ "$(sha256sum "$MANIFEST" | awk '{ print $1 }')" == "$EXPECTED_SHA256" ]] \
  || die 'successor manifest digest drifted'
[[ "$(wc -l < "$MANIFEST" | tr -d '[:space:]')" == 31 ]] \
  || die 'successor manifest physical line count drifted'
[[ "$(awk 'NF != 0 && $1 !~ /^#/ { count++ } END { print count + 0 }' "$MANIFEST")" == 27 ]] \
  || die 'successor manifest classified entry count drifted'

readonly DOUBLE_ESCAPED_DOT='\\.(service|timer)'
expected_controller_schema_line=''
IFS= read -r expected_controller_schema_line <<'LINE'
  [[ -z "$(awk 'NF == 0 || $1 ~ /^#/ { next } NF != 2 || ($1 != "REQUIRED_DRAIN" && $1 != "OPTIONAL_DRAIN" && $1 != "SAFE") || $2 !~ /^leetplus-[A-Za-z0-9@_.-]+\.(service|timer)$/ || seen[$2]++ { print; exit }' "$UNIT_MANIFEST")" ]] \
LINE
readonly expected_controller_schema_line
[[ "$(grep -F -x -c -- "$expected_controller_schema_line" "$CONTROLLER")" == 1 ]] \
  || die 'controller complete manifest grammar is not uniquely pinned'
if grep -F -- "$DOUBLE_ESCAPED_DOT" "$CONTROLLER" >/dev/null; then
  die 'controller unit regex contains a double-escaped AWK dot'
fi

schema_error() {
  awk 'NF == 0 || $1 ~ /^#/ { next } NF != 2 || ($1 != "REQUIRED_DRAIN" && $1 != "OPTIONAL_DRAIN" && $1 != "SAFE") || $2 !~ /^leetplus-[A-Za-z0-9@_.-]+\.(service|timer)$/ || seen[$2]++ { print; exit }'
}

[[ -z "$(schema_error < "$MANIFEST")" ]] || die 'exact commented successor manifest is rejected'
[[ -z "$(printf '# comment\n\nSAFE leetplus-x.service\nOPTIONAL_DRAIN leetplus-y.timer\n' | schema_error)" ]] \
  || die 'valid service/timer or comment/blank sample is rejected'
[[ -n "$(printf 'SAFE leetplus-xservice\n' | schema_error)" ]] \
  || die 'unit name without a literal extension dot is accepted'

for mutation in unknown-class third-field duplicate-unit; do
  rejected="$(awk -v mutation="$mutation" '
    {
      if ($0 == "SAFE leetplus-bonus-ledger-worker.timer") {
        if (mutation == "unknown-class") sub(/^SAFE /, "UNKNOWN ")
        else if (mutation == "third-field") $0 = $0 " unexpected"
        else if (mutation == "duplicate-unit") $0 = "SAFE leetplus-bonus-ledger-worker.service"
      }
      print
    }
  ' "$MANIFEST" | schema_error)"
  [[ -n "$rejected" ]] || die "malformed classified entry is accepted: ${mutation}"
done

printf 'legacy drain manifest parser fixture: PASS\n'
