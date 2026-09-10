"""A new read-only PG dump + encrypted migration capsule; never changes the DB.

Run once from a private operation directory with backup_crypto.py and only the
public recipient key. Existing files cause a stop instead of replacement.
"""
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
from datetime import datetime, timezone
from pathlib import Path

from backup_crypto import encrypt

os.umask(0o077)
root = Path(__file__).resolve().parent
if os.getuid() != 0 or not str(root).startswith('/var/lib/leetplus/backups/docker-migration-'):
    raise SystemExit('Exact root-owned migration backup directory required')
if root.is_symlink() or root.stat().st_uid != 0 or root.stat().st_mode & 0o077:
    raise SystemExit('Private backup directory required')


def hash_file(p):
    result = hashlib.sha256()
    with open(p, 'rb') as stream:
        while chunk := stream.read(1024 * 1024):
            result.update(chunk)
    return result.hexdigest()


def pg_dump(name, arguments):
    with open(root / name, 'xb') as out, open(root / (name + '.stderr'), 'xb') as err:
        subprocess.run(['/usr/bin/nice', '-n', '10', '/usr/sbin/runuser', '-u', 'postgres', '--'] + arguments,
                       cwd='/', stdout=out, stderr=err, check=True, timeout=1800)
        out.flush()
        os.fsync(out.fileno())


baseline = subprocess.check_output(['/usr/sbin/runuser', '-u', 'postgres', '--', '/usr/bin/psql', '-XAt', '-d', 'leetplus', '-c',
    'SELECT count(*),max(migration_name),count(*) FILTER(WHERE finished_at IS NULL AND rolled_back_at IS NULL) FROM "_prisma_migrations" WHERE rolled_back_at IS NULL'], cwd='/', text=True).strip()
if baseline != '191|20260908180000_external_langame_simple_onboarding|0':
    raise SystemExit('Source schema changed; backup must be replanned')
sha = os.readlink('/srv/leetplus/slots/green').split('/')[-1]
if len(sha) != 40:
    raise SystemExit('Source release identity is unavailable')
pg_dump('leetplus.dump', ['/usr/lib/postgresql/16/bin/pg_dump', '--format=custom', '--compress=1', '--dbname=leetplus'])
pg_dump('globals.sql', ['/usr/lib/postgresql/16/bin/pg_dumpall', '--globals-only'])
needed = (root / 'leetplus.dump').stat().st_size * 2 + 2_500_000_000
if shutil.disk_usage(root).free < needed:
    raise SystemExit('Not enough room for authenticated capsule plus 2.5GB reserve; dump retained')
manifest = {'contract': 'LEETPLUS_MIGRATION_BACKUP_V1', 'capturedAt': datetime.now(timezone.utc).isoformat(),
            'sourceReleaseSha': sha, 'schema': baseline, 'files': {name: {'sha256': hash_file(root / name), 'bytes': (root / name).stat().st_size} for name in ['leetplus.dump', 'globals.sql']}}
with open(root / 'manifest.json', 'x') as out:
    json.dump(manifest, out, indent=2)
paths = ['/etc/leetplus', '/var/lib/leetplus/langame-sync', '/var/lib/leetplus/deploy-receipts',
         '/var/lib/leetplus/langame-worker-authorizations', '/etc/nginx/leetplus',
         '/etc/nginx/sites-available/leetplus.ru', '/etc/nginx/sites-available/api.leetplus.ru']
with tarfile.open(root / 'capsule.tar', mode='x') as archive:
    for name in ['leetplus.dump', 'globals.sql', 'manifest.json']:
        archive.add(root / name, arcname=name, recursive=False)
    for name in paths:
        archive.add(name, arcname='system/' + name.lstrip('/'), recursive=True)
receipt = encrypt(root / 'capsule.tar', root / 'capsule.lpbackup', root / 'backup-public.pem')
receipt.update({'contract': 'LEETPLUS_ENCRYPTED_BACKUP_V1', 'capturedAt': manifest['capturedAt'],
                'sourceReleaseSha': sha, 'ciphertextSha256': hash_file(root / 'capsule.lpbackup'),
                'manifestSha256': hash_file(root / 'manifest.json'), 'offHostVerified': False})
with open(root / 'backup-receipt.json', 'x') as out:
    json.dump(receipt, out, indent=2)
    out.flush()
    os.fsync(out.fileno())
print(json.dumps({key: value for key, value in receipt.items() if key != 'plaintextSha256'}))
