"""Independent, read-only installed-controller inventory for the bootstrap.

The archive is inspected as bytes; no staged target module is imported or run.
This module must be packaged separately from every target controller.
"""
import hashlib
import io
import json
import re
import tarfile
from pathlib import Path

from native_boundary import canonical, require, secure_read, secure_directory, verify_flat_inventory

SHA = re.compile(r'[a-f0-9]{40}\Z')
HASH = re.compile(r'[a-f0-9]{64}\Z')
LEAF = re.compile(r'[A-Za-z0-9_.@-]+\Z')
PREFIX = 'deploy/leetplus-compose/'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def read_canonical(path, limit=65536):
    raw = secure_read(path, limit)
    value = json.loads(raw)
    require(raw == canonical(value), 'Noncanonical admitted controller JSON')
    return value, raw


def read_json_bound(path, limit=65536):
    raw = secure_read(path, limit)
    return json.loads(raw), raw


def archive_map(raw):
    values = {}
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
        for member in archive:
            if member.isdir() and member.name.rstrip('/') in ('deploy', 'deploy/leetplus-compose'):
                continue
            require(member.isfile() and member.name.startswith(PREFIX) and member.size <= 2 * 1024 * 1024,
                    'Untrusted controller archive member')
            name = member.name[len(PREFIX):]
            require(bool(LEAF.fullmatch(name)) and name not in ('.', '..', 'install-manifest.json') and
                    name not in values, 'Duplicate or non-flat controller archive leaf')
            extracted = archive.extractfile(member)
            require(extracted is not None, 'Missing archive member bytes')
            raw_leaf = extracted.read(2 * 1024 * 1024 + 1)
            require(len(raw_leaf) == member.size, 'Archive member size differs')
            values[name] = digest(raw_leaf)
    require(values and len(values) <= 512, 'Empty or oversized controller archive')
    return values


def admitted_control(*, controls_root, inbox_root, release_sha):
    """Reproduce manifest, archive, admission and every installed leaf."""
    require(bool(SHA.fullmatch(release_sha)), 'Exact control release required')
    control = secure_directory(Path(controls_root) / release_sha)
    inbox = secure_directory(Path(inbox_root) / release_sha)
    manifest, manifest_raw = read_canonical(control / 'install-manifest.json')
    require(set(manifest) == {'contract', 'releaseSha', 'admissionSha256', 'files'} and
            manifest['contract'] == 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_INSTALL' and
            manifest['releaseSha'] == release_sha and HASH.fullmatch(manifest['admissionSha256']) and
            isinstance(manifest['files'], dict) and 0 < len(manifest['files']) <= 512 and
            all(LEAF.fullmatch(name) and name not in ('.', '..', 'install-manifest.json') and
                HASH.fullmatch(value) for name, value in manifest['files'].items()),
            'Invalid admitted installed manifest')
    expected_disk = dict(manifest['files'])
    expected_disk['install-manifest.json'] = digest(manifest_raw)
    verify_flat_inventory(control, expected_disk)
    admission, admission_raw = read_json_bound(inbox / 'docker-admission.json')
    require(digest(admission_raw) == manifest['admissionSha256'] and
            admission.get('contract') == 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION' and
            admission.get('decision') == 'PASS' and admission.get('releaseSha') == release_sha and
            admission.get('repository') == 'boozik3412/leetplus' and
            admission.get('event') == 'push' and admission.get('ref') == 'refs/heads/main' and
            HASH.fullmatch(admission.get('controlArchiveSha256', '')) and
            HASH.fullmatch(admission.get('releaseManifestSha256', '')),
            'Installed controller is not exact-main admitted')
    release, release_raw = read_json_bound(inbox / 'release.json')
    require(release.get('releaseSha') == release_sha and
            digest(release_raw) == admission['releaseManifestSha256'],
            'Release manifest differs from admitted controller')
    archive = secure_read(inbox / 'control.tar.gz', 16 * 1024 * 1024)
    require(digest(archive) == admission['controlArchiveSha256'] and
            archive_map(archive) == manifest['files'],
            'Installed privileged file map differs from admitted archive')
    return {
        'releaseSha': release_sha,
        'manifestSha256': digest(manifest_raw),
        'admissionSha256': digest(admission_raw),
        'controlArchiveSha256': digest(archive),
        'filesSha256': digest(canonical(manifest['files'])),
        'fileCount': len(manifest['files']),
        'files': manifest['files'],
        'root': control,
    }
