"""Create a completed encrypted backup export; never changes application data."""
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
from pathlib import Path

from backup_crypto import encrypt

ROOT = Path('/srv/leetplus')
EXPORT = ROOT / 'backups/export'


def file_hash(path):
    value = hashlib.sha256()
    with open(path, 'rb') as stream:
        while block := stream.read(1024 * 1024):
            value.update(block)
    return value.hexdigest()


def dump(path, args):
    with open(path, 'xb') as out, open(str(path) + '.stderr', 'xb') as err:
        result = subprocess.run(['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', 'exec', 'leetplus-postgres'] + args,
                                stdout=out, stderr=err, timeout=1800)
        out.flush()
        os.fsync(out.fileno())
    if result.returncode:
        raise RuntimeError('Database backup failed; private logs retained')


def validate_backup_source(value):
    if value.get('inRecovery') is True and (value.get('receiver') != 'streaming' or value.get('replayPaused') is not False or type(value.get('lastMessageAgeSeconds')) not in [int, float] or not 0 <= value['lastMessageAgeSeconds'] <= 90):
        raise ValueError('Stale or paused standby is not a fresh backup source')
    if type(value.get('inRecovery')) is not bool:
        raise ValueError('Unknown backup recovery state')
    return value


def run():
    if os.getuid() != 0 or not (ROOT / 'preparation.json').is_file():
        raise ValueError('Prepared target required')
    os.umask(0o077)
    if shutil.disk_usage(ROOT).free < 30 * 1024 ** 3:
        raise ValueError('Backup free-space reserve is below 30GiB')
    started = datetime.datetime.now(datetime.timezone.utc)
    name = 'backup-' + started.strftime('%Y%m%dT%H%M%SZ')
    work = ROOT / 'backups/work' / name
    work.mkdir(mode=0o700, parents=True, exist_ok=False)
    EXPORT.mkdir(mode=0o755, parents=True, exist_ok=True)
    pg = '/usr/lib/postgresql/16/bin/'
    query = "SELECT json_build_object('inRecovery',pg_is_in_recovery(),'replayPaused',CASE WHEN pg_is_in_recovery() THEN pg_is_wal_replay_paused() ELSE false END,'receiver',(SELECT status FROM pg_stat_wal_receiver),'lastMessageAgeSeconds',(SELECT extract(epoch FROM clock_timestamp()-last_msg_receipt_time) FROM pg_stat_wal_receiver),'receiveLsn',pg_last_wal_receive_lsn(),'replayLsn',pg_last_wal_replay_lsn(),'systemIdentifier',system_identifier::text) FROM pg_control_system();"
    source = validate_backup_source(json.loads(subprocess.check_output(['/usr/bin/docker','--host','unix:///var/run/docker.sock','exec','leetplus-postgres',pg+'psql','-XAt','-v','ON_ERROR_STOP=1','--host=/tmp','--username=postgres','--dbname=leetplus','-c',query], timeout=30)))
    source['systemIdentifierSha256'] = hashlib.sha256(source.pop('systemIdentifier').encode()).hexdigest()
    dump(work / 'leetplus.dump', [pg + 'pg_dump', '--host=/tmp', '--username=postgres', '--format=custom', '--compress=1', '--dbname=leetplus'])
    dump(work / 'globals.sql', [pg + 'pg_dumpall', '--host=/tmp', '--username=postgres', '--globals-only'])
    manifest = {'contract': 'LEETPLUS_DAILY_BACKUP_V1', 'capturedAt': started.isoformat(), 'dataSource': source,
                'files': {leaf: {'sha256': file_hash(work / leaf), 'bytes': (work / leaf).stat().st_size} for leaf in ['leetplus.dump', 'globals.sql']}}
    (work / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    with tarfile.open(work / 'capsule.tar', 'x') as archive:
        for leaf in ['leetplus.dump', 'globals.sql', 'manifest.json']:
            archive.add(work / leaf, arcname=leaf, recursive=False)
        for source in [ROOT / 'secrets', ROOT / 'data/langame-sync', Path('/etc/leetplus-compose'), Path('/var/lib/leetplus-compose')]:
            archive.add(source, arcname='system/' + str(source).lstrip('/'))
        state = Path('/var/lib/leetplus-compose/active.json')
        if state.exists():
            active = json.loads(state.read_text())
            release_shas = {active[slot]['releaseSha'] for slot in ['blue', 'green']}
            release_shas.add(active['dataRelease']['releaseSha'])
        else:
            release_shas = {json.loads((ROOT / 'preparation.json').read_text())['releaseSha']}
        for sha in release_shas:
            if len(sha) != 40 or any(c not in '0123456789abcdef' for c in sha):
                raise ValueError('Invalid backup release identity')
            inbox = ROOT / 'inbox' / sha
            for leaf in ['release.json', 'docker-admission.json', 'control.tar.gz', 'images.tar.gz']:
                archive.add(inbox / leaf, arcname=f'releases/{sha}/{leaf}', recursive=False)
    destination = EXPORT / (name + '.lpbackup')
    receipt = encrypt(work / 'capsule.tar', destination, '/etc/leetplus-compose/backup-recipient.pem')
    os.chown(destination, 0, 12070)
    os.chmod(destination, 0o440)
    receipt.update({'contract': 'LEETPLUS_BACKUP_EXPORT_V1', 'filename': destination.name, 'capturedAt': started.isoformat(),
                    'sha256': file_hash(destination), 'bytes': destination.stat().st_size})
    receipt_path = EXPORT / (name + '.json')
    with open(receipt_path, 'x') as out:
        json.dump(receipt, out, indent=2)
        out.flush()
        os.fsync(out.fileno())
    os.chown(receipt_path, 0, 12070)
    os.chmod(receipt_path, 0o440)
    latest = EXPORT / ('latest-' + name + '.tmp')
    latest.write_text(json.dumps(receipt, indent=2))
    os.chown(latest, 0, 12070)
    os.chmod(latest, 0o440)
    fd = os.open(latest, os.O_RDONLY)
    os.fsync(fd)
    os.close(fd)
    os.replace(latest, EXPORT / 'latest.json')
    fd = os.open(EXPORT, os.O_RDONLY)
    os.fsync(fd)
    os.close(fd)
    # Only exact temporary files created in this operation are removed.
    for leaf in ['leetplus.dump', 'globals.sql', 'capsule.tar']:
        (work / leaf).unlink()
    print(json.dumps({'decision': 'ENCRYPTED_EXPORT_READY', 'filename': destination.name, 'sha256': receipt['sha256'], 'bytes': receipt['bytes']}))


if __name__ == '__main__':
    run()
