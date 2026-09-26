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

BACKUP_HOST = '188.234.220.76'
INCOMING_NAME = '.incoming'


def unsafe_link(path):
    return path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction())


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
            'leetplus-backup@' + BACKUP_HOST + ':' + remote, str(local)]
    result = subprocess.run(args, capture_output=True, timeout=1800, creationflags=0x08000000)
    if result.returncode:
        message = result.stderr.decode('utf-8', errors='replace').lower()
        if 'kex_exchange_identification' in message:
            category = 'KEY_EXCHANGE_CLOSED'
        elif 'connection closed' in message or 'connection reset' in message:
            category = 'CONNECTION_CLOSED'
        elif 'permission denied' in message:
            category = 'ACCESS_DENIED'
        else:
            category = 'UNKNOWN_TRANSPORT_FAILURE'
        # Do not log the child stderr: it may contain paths, usernames or
        # transport implementation details outside the operator allowlist.
        raise RuntimeError(f'SFTP backup pull failed: {category} (exit={result.returncode})')


def cleanup_incoming(root, incoming):
    """Remove only this run's temporary files after the SCP child has exited."""
    staging = root / INCOMING_NAME
    if incoming.parent != staging or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', incoming.name):
        raise ValueError('Unexpected backup staging path')
    if unsafe_link(staging) or not staging.is_dir() or unsafe_link(incoming) or not incoming.is_dir():
        raise ValueError('Unsafe backup staging directory')
    children = list(incoming.iterdir())
    for child in children:
        if unsafe_link(child) or not child.is_file() or (child.name != 'latest.json' and not re.fullmatch(r'backup-\d{8}T\d{6}Z\.lpbackup', child.name)):
            raise ValueError('Unexpected backup staging file')
    for child in children:
        child.unlink()
    incoming.rmdir()


def run(config_path):
    if os.name != 'nt':
        raise ValueError('Windows scheduled pull only')
    config = json.loads(config_path.read_text())
    root = Path(config['destination']).resolve()
    if root != Path(r'C:\LeetPlusBackups'):
        raise ValueError('Unexpected backup destination')
    staging = root / INCOMING_NAME
    if unsafe_link(staging) or (staging.exists() and not staging.is_dir()):
        raise ValueError('Unsafe backup staging root')
    staging.mkdir(exist_ok=True)
    if unsafe_link(staging) or not staging.is_dir():
        raise ValueError('Unsafe backup staging root')
    incoming = staging / str(uuid.uuid4())
    incoming.mkdir(exist_ok=False)
    try:
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
        # Backup retirement is a separate owner-approved operation. A
        # successful transport run never deletes prior exports.
        print(json.dumps(status))
    finally:
        cleanup_incoming(root, incoming)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, required=True)
    run(parser.parse_args().config)
