"""Install only a digest-pinned admitted Compose controller on the target host.

Does not start containers, configure nginx, change PostgreSQL or enable workers.
The operator must independently verify the GitHub run/admission before supplying
the expected admission digest. All extraction is flat, regular-file-only and
exclusive; repository tar paths never become arbitrary root destinations.
"""
import argparse
import hashlib
import io
import json
import os
import re
import tarfile
from pathlib import Path


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def secure_file(p, limit):
    info = p.lstat()
    if p.is_symlink() or not p.is_file() or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o022 or info.st_size > limit:
        raise ValueError('Untrusted input file')
    for parent in p.parents:
        meta = parent.lstat()
        if parent.is_symlink() or meta.st_uid != 0 or meta.st_mode & 0o022:
            raise ValueError('Untrusted input ancestor')
    return p.read_bytes()


def mkdir(p, mode=0o700):
    if not p.exists():
        p.mkdir(mode=mode)
    info = p.lstat()
    if p.is_symlink() or not p.is_dir() or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('Untrusted installation directory')


def publish(p, content, mode):
    if p.exists():
        if secure_file(p, 16 * 1024 * 1024) != content:
            raise ValueError('Existing installed bytes differ')
        return
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())


def install(inbox, expected):
    if os.getuid() != 0 or not re.fullmatch(r'/srv/leetplus/inbox/[a-f0-9]{40}', str(inbox)):
        raise ValueError('Exact root inbox required')
    raw = secure_file(inbox / 'docker-admission.json', 65536)
    if digest(raw) != expected:
        raise ValueError('Admission digest mismatch')
    admission = json.loads(raw)
    sha = inbox.name
    if (admission.get('contract') != 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION' or admission.get('decision') != 'PASS' or
            admission.get('releaseSha') != sha or admission.get('repository') != 'boozik3412/leetplus' or
            admission.get('event') != 'push' or admission.get('ref') != 'refs/heads/main'):
        raise ValueError('Not an admitted exact-main image handoff')
    archive = secure_file(inbox / 'control.tar.gz', 16 * 1024 * 1024)
    if digest(archive) != admission['controlArchiveSha256']:
        raise ValueError('Control archive digest mismatch')
    payload = {}
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tar:
        for item in tar:
            if item.isdir() and item.name.rstrip('/') in ['deploy', 'deploy/leetplus-compose']:
                continue
            prefix = 'deploy/leetplus-compose/'
            if not item.isfile() or not item.name.startswith(prefix):
                raise ValueError('Control archive contains non-regular or unexpected entry')
            name = item.name[len(prefix):]
            if not re.fullmatch(r'[a-zA-Z0-9_.@-]+', name) or name in ['.', '..', 'install-manifest.json'] or name in payload or item.size > 2 * 1024 * 1024:
                raise ValueError('Invalid control leaf')
            payload[name] = tar.extractfile(item).read()
    for name in ['control.sh', 'control.mjs', 'orchestrator.mjs', 'contract.mjs', 'network-fence.py']:
        if name not in payload:
            raise ValueError('Required control implementation missing')
    parent = Path('/usr/local/lib/leetplus-compose')
    mkdir(parent)
    target = parent / sha
    mkdir(target)
    if not {p.name for p in target.iterdir()} <= set(payload) | {'install-manifest.json'}:
        raise ValueError('Unexpected existing control files')
    for name, content in payload.items():
        publish(target / name, content, 0o500 if name.endswith(('.sh', '.py')) else 0o400)
    manifest = {'contract': 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_INSTALL', 'releaseSha': sha,
                'admissionSha256': expected, 'files': {name: digest(payload[name]) for name in sorted(payload)}}
    publish(target / 'install-manifest.json', canonical(manifest), 0o400)
    for name in ['/etc/leetplus-compose', '/var/lib/leetplus-compose', '/var/lib/leetplus-compose/operations', '/etc/leetplus-compose/docker-cli']:
        mkdir(Path(name))
    publish(Path('/etc/leetplus-compose/docker-cli/config.json'), b'{}\n', 0o400)
    for name, entrypoint in [('leetplus-compose', 'control.sh'), ('leetplus-compose-network', 'network.sh'), ('leetplus-compose-backup', 'backup.sh')]:
        link = Path('/usr/local/sbin') / name
        if link.exists() or link.is_symlink():
            if not link.is_symlink() or link.resolve() != target / entrypoint:
                raise ValueError('Existing command belongs to a different control generation; explicit handoff required')
        else:
            link.symlink_to(target / entrypoint)
    for name, content in payload.items():
        if name.startswith('leetplus-compose-') and name.endswith(('.service', '.timer')):
            publish(Path('/etc/systemd/system') / name, content, 0o644)
    print(json.dumps({'decision': 'CONTROL_INSTALLED_NOT_ACTIVATED', 'controlRoot': str(target), 'controlSha256': digest(canonical(manifest)), 'releaseSha': sha}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--inbox', type=Path, required=True)
    parser.add_argument('--admission-sha256', required=True)
    args = parser.parse_args()
    install(args.inbox, args.admission_sha256)
