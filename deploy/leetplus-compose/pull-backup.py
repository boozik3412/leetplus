"""Windows scheduled pull over pinned read-only SFTP; no decryption during pull."""
import argparse
import datetime
import hashlib
import json
import os
import re
import subprocess
import uuid
from pathlib import Path


def file_hash(path):
    result = hashlib.sha256()
    with open(path, 'rb') as stream:
        while block := stream.read(1024 * 1024):
            result.update(block)
    return result.hexdigest()


def fetch(remote, local, config):
    if not re.fullmatch(r'/(latest\.json|backup-\d{8}T\d{6}Z\.lpbackup)', remote):
        raise ValueError('Unexpected remote backup path')
    args = [r'C:\Windows\System32\OpenSSH\scp.exe', '-q', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
            '-o', 'HostKeyAlias=188.234.220.76', '-o', 'ConnectTimeout=10', '-o', 'ConnectionAttempts=1',
            '-o', 'UserKnownHostsFile=' + config['knownHosts'], '-i', config['key'],
            'leetplus-backup@192.168.1.137:' + remote, str(local)]
    result = subprocess.run(args, capture_output=True, timeout=1800, creationflags=0x08000000)
    if result.returncode:
        raise RuntimeError('SFTP backup pull failed')


def retain(root):
    candidates = []
    for path in root.glob('backup-*.receipt.json'):
        value = json.loads(path.read_text())
        name = value.get('filename', '')
        if re.fullmatch(r'backup-\d{8}T\d{6}Z\.lpbackup', name) and value.get('verified') is True:
            candidates.append((datetime.datetime.fromisoformat(value['capturedAt']), root / name, path))
    candidates.sort(reverse=True)
    keep, daily, weekly, monthly = set(), set(), set(), set()
    for index, (date, path, _) in enumerate(candidates):
        day, week, month = date.date(), date.isocalendar()[:2], (date.year, date.month)
        if index < 2 or (day not in daily and len(daily) < 7) or (week not in weekly and len(weekly) < 4) or (month not in monthly and len(monthly) < 3):
            keep.add(path)
        daily.add(day)
        weekly.add(week)
        monthly.add(month)
    for _, path, receipt in candidates:
        if path not in keep and path.is_file() and not path.is_symlink() and path.parent == root:
            path.unlink()
            receipt.unlink()


def run(config_path):
    if os.name != 'nt':
        raise ValueError('Windows scheduled pull only')
    config = json.loads(config_path.read_text())
    root = Path(config['destination']).resolve()
    if root != Path(r'C:\LeetPlusBackups'):
        raise ValueError('Unexpected backup destination')
    incoming = root / '.incoming' / str(uuid.uuid4())
    incoming.mkdir(parents=True)
    fetch('/latest.json', incoming / 'latest.json', config)
    manifest = json.loads((incoming / 'latest.json').read_text())
    if manifest.get('contract') != 'LEETPLUS_BACKUP_EXPORT_V1' or not re.fullmatch(r'[a-f0-9]{64}', manifest.get('sha256', '')):
        raise ValueError('Invalid export manifest')
    name = manifest['filename']
    if not re.fullmatch(r'backup-\d{8}T\d{6}Z\.lpbackup', name):
        raise ValueError('Unsafe export filename')
    destination = root / name
    if not destination.exists():
        temporary = incoming / name
        fetch('/' + name, temporary, config)
        if temporary.stat().st_size != manifest['bytes'] or file_hash(temporary) != manifest['sha256']:
            raise ValueError('Downloaded backup failed checksum/size verification')
        os.rename(temporary, destination)
    elif file_hash(destination) != manifest['sha256']:
        raise ValueError('Existing backup has different bytes')
    manifest['verified'] = True
    manifest['verifiedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    receipt = root / (name.removesuffix('.lpbackup') + '.receipt.json')
    receipt.write_text(json.dumps(manifest, indent=2))
    captured = datetime.datetime.fromisoformat(manifest['capturedAt'])
    age = (datetime.datetime.now(datetime.timezone.utc) - captured).total_seconds()
    status = {'decision': 'PASS' if age <= 26 * 3600 else 'BACKUP_STALE', 'lastBackup': name, 'ageSeconds': int(age), 'checkedAt': manifest['verifiedAt']}
    (root / 'backup-status.json').write_text(json.dumps(status, indent=2))
    if status['decision'] != 'PASS':
        raise RuntimeError('Off-host backup is older than the daily freshness allowance')
    retain(root)
    print(json.dumps(status))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, required=True)
    run(parser.parse_args().config)
