"""Read-only two-copy backup export inventory; never deletes backup data."""
import argparse
import datetime as dt
import hashlib
import json
import re
from pathlib import Path


NAME = re.compile(r'backup-(\d{8}T\d{6}Z)\.lpbackup\Z')
SHA = re.compile(r'[0-9a-f]{64}\Z')


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def captured_at(value):
    timestamp = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if timestamp.tzinfo is None:
        raise ValueError('Backup timestamp has no timezone')
    return timestamp.astimezone(dt.timezone.utc)


def server_entries(rows):
    result = {}
    for row in rows:
        name = row.get('name')
        match = NAME.fullmatch(name or '')
        if not match or name in result or row.get('manifestExists') is not True:
            raise ValueError('Invalid or duplicate server backup')
        when = captured_at(row['capturedAt'])
        if when.strftime('%Y%m%dT%H%M%SZ') != match.group(1):
            raise ValueError('Backup timestamp differs from filename')
        if type(row.get('bytes')) is not int or row['bytes'] <= 0 or not SHA.fullmatch(row.get('manifestSha256') or ''):
            raise ValueError('Invalid server backup manifest')
        result[name] = {'name': name, 'bytes': row['bytes'], 'sha256': row['manifestSha256'], 'capturedAt': when.isoformat()}
    if not result:
        raise ValueError('Empty server backup inventory')
    return sorted(result.values(), key=lambda item: (item['capturedAt'], item['name']), reverse=True)


def offhost_entries(rows):
    result = {}
    for row in rows:
        name = row.get('name')
        if not NAME.fullmatch(name or '') or name in result:
            raise ValueError('Invalid or duplicate off-host backup')
        result[name] = row
    return result


def plan(server_rows, offhost_rows, latest, keep_generations, protected_names=()):
    if keep_generations not in (1, 2):
        raise ValueError('Only one or two retained generations are supported')
    server = server_entries(server_rows)
    offhost = offhost_entries(offhost_rows)
    newest = server[0]
    if (latest.get('contract') != 'LEETPLUS_BACKUP_EXPORT_V1' or latest.get('filename') != newest['name'] or
            latest.get('bytes') != newest['bytes'] or latest.get('sha256') != newest['sha256']):
        raise ValueError('Server latest pointer differs from newest export')
    protected = set(protected_names)
    names = {item['name'] for item in server}
    if not protected <= names:
        raise ValueError('Protected backup name absent from server inventory')
    keep = server[:keep_generations]
    keep_names = {item['name'] for item in keep}
    reasons = []
    for item in keep:
        copy = offhost.get(item['name'])
        if not copy or copy.get('receiptVerified') is not True or copy.get('bytes') != item['bytes'] or copy.get('receiptSha256') != item['sha256']:
            reasons.append('OFFHOST_PROOF_MISSING:' + item['name'])
    for name in sorted(protected - keep_names):
        reasons.append('PROTECTED_EXTRA:' + name)
    candidates = [] if reasons else [item for item in server if item['name'] not in keep_names]
    result = {
        'contract': 'LEETPLUS_BACKUP_RETENTION_READONLY_PLAN_V1',
        'decision': 'HOLD' if reasons else 'CANDIDATE_PREVIEW_ONLY',
        'keepGenerations': keep_generations,
        'keep': keep,
        'protectedNames': sorted(protected),
        'reasons': reasons,
        'candidateExports': candidates,
        'candidateBytes': sum(item['bytes'] for item in candidates),
        'serverExportCount': len(server),
    }
    result['inventoryPlanSha256'] = hashlib.sha256(canonical(result)).hexdigest()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--server-inventory', type=Path, required=True)
    parser.add_argument('--offhost-inventory', type=Path, required=True)
    parser.add_argument('--latest-manifest', type=Path, required=True)
    parser.add_argument('--keep-generations', type=int, choices=(1, 2), required=True)
    parser.add_argument('--protected-names', type=Path)
    args = parser.parse_args()
    protected = json.loads(args.protected_names.read_text())['names'] if args.protected_names else ()
    result = plan(json.loads(args.server_inventory.read_text()), json.loads(args.offhost_inventory.read_text()),
                  json.loads(args.latest_manifest.read_text()), args.keep_generations, protected)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result['decision'] == 'HOLD':
        raise SystemExit(2)


if __name__ == '__main__':
    main()
