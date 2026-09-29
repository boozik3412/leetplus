"""Deterministic closed Git source transport, never deployment admission."""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile

SOURCES = (
    'deploy/leetplus-compose/a-bridge-bootstrap-authority.mjs',
    'deploy/leetplus-compose/bridge-external-successor-authority.mjs',
    'deploy/leetplus-compose/control-handoff-authority.mjs',
    'deploy/transition-bootstrap/authority.py',
    'deploy/transition-bootstrap/bundle_installer.py',
    'deploy/transition-bootstrap/canonical_lineage.py',
    'deploy/transition-bootstrap/canonical_lineage_native.py',
    'deploy/transition-bootstrap/cli.mjs',
    'deploy/transition-bootstrap/enrollment.py',
    'deploy/transition-bootstrap/hard_deadline.py',
    'deploy/transition-bootstrap/host_observer.py',
    'deploy/transition-bootstrap/inventory.py',
    'deploy/transition-bootstrap/native_boundary.py',
    'deploy/transition-bootstrap/protocol.mjs',
    'deploy/transition-bootstrap/rpc_host.py',
    'docs/deployment/production-artifact/bootstrap-install-layout.json',
    'docs/deployment/production-artifact/install_predecessor_bootstrap.py',
    'docs/deployment/production-artifact/trusted_predecessor_bootstrap_launcher.py',
    'docs/deployment/production-control-authority/verify-installed-standalone-intro.mjs',
)
MAX_LEAF = 2 * 1024 * 1024
MAX_ARCHIVE = 16 * 1024 * 1024


def require(ok, message):
    if not ok:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def build(members):
    require(isinstance(members, dict) and set(members) == set(SOURCES) and
            all(isinstance(raw, bytes) and 0 < len(raw) <= MAX_LEAF for raw in members.values()),
            'Closed bounded 19-leaf source map required')
    files = {name: sha(members[name]) for name in sorted(members)}
    manifest = ''.join(f'{files[name]}  ./{name}\n' for name in files).encode()
    tar_bytes = io.BytesIO()
    with tarfile.open(fileobj=tar_bytes, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        values = {**members, 'SHA256SUMS': manifest}
        for name in sorted(values):
            info = tarfile.TarInfo(name)
            info.size = len(values[name])
            info.mode = 0o400
            info.uid = info.gid = 0
            info.uname = info.gname = ''
            info.mtime = 0
            archive.addfile(info, io.BytesIO(values[name]))
    packed = io.BytesIO()
    with gzip.GzipFile(filename='', mode='wb', fileobj=packed, mtime=0, compresslevel=9) as stream:
        stream.write(tar_bytes.getvalue())
    raw = packed.getvalue()
    require(len(raw) <= MAX_ARCHIVE, 'Source archive exceeds bound')
    # Reproduce every retained transport byte before publication.
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
        observed = {}
        for info in archive:
            require(info.isfile() and info.name not in observed and info.mode == 0o400 and
                    info.uid == info.gid == info.mtime == 0 and not info.pax_headers,
                    'Unexpected source transport metadata')
            reader = archive.extractfile(info)
            require(reader is not None, 'Source archive missing member bytes')
            observed[info.name] = reader.read(MAX_LEAF + 1)
        require(observed == {**members, 'SHA256SUMS': manifest}, 'Source archive roundtrip differs')
    return raw, manifest, files


def git(args, *, maximum=MAX_LEAF):
    result = subprocess.run(['git', '--no-replace-objects', *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=15, check=False)
    require(result.returncode == 0 and len(result.stdout) <= maximum, 'Exact Git source read failed')
    return result.stdout


def git_sources(source_release):
    require(re.fullmatch(r'[a-f0-9]{40}', source_release), 'Exact commit SHA required')
    require(git(['rev-parse', 'HEAD'], maximum=100).decode().strip() == source_release,
            'Checkout HEAD differs from source release')
    members = {}
    for source in SOURCES:
        record = git(['ls-tree', source_release, '--', source], maximum=4096).decode()
        require(re.fullmatch(r'100(?:644|755) blob [a-f0-9]{40}\t' + re.escape(source) + r'\n', record),
                'Required source is not an exact regular Git blob')
        size = int(git(['cat-file', '-s', source_release + ':' + source], maximum=100).decode().strip())
        require(0 < size <= MAX_LEAF, 'Source Git leaf bound differs')
        raw = git(['cat-file', 'blob', source_release + ':' + source])
        require(len(raw) == size, 'Git leaf length changed')
        members[source] = raw
    return members


def write_new(path, raw):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    require(path.read_bytes() == raw, 'Published source bytes changed')


def publish(output, source_release, run_id, run_attempt, event, ref):
    require(re.fullmatch(r'[1-9][0-9]{0,19}', run_id) and re.fullmatch(r'[1-9][0-9]{0,4}', run_attempt),
            'Exact producing run and attempt required')
    require(event in ('push', 'pull_request', 'workflow_dispatch') and
            isinstance(ref, str) and len(ref) <= 200 and re.fullmatch(r'refs/[A-Za-z0-9_./-]+', ref),
            'Producing source event/ref differs')
    members = git_sources(source_release)
    source_tree = git(['rev-parse', source_release + '^{tree}'], maximum=100).decode().strip()
    require(re.fullmatch(r'[a-f0-9]{40}', source_tree), 'Exact source tree SHA required')
    raw, manifest, files = build(members)
    reproduced, manifest_again, files_again = build(members)
    require(raw == reproduced and manifest == manifest_again and files == files_again,
            'Deterministic source reproduction failed')
    receipt = {'contract': 'LEETPLUS_STANDALONE_INITIAL_SOURCE_V1',
               'decision': 'SOURCE_BYTES_ONLY_NOT_AUTHORIZATION', 'repository': 'boozik3412/leetplus',
               'sourceRelease': source_release, 'sourceTreeSha': source_tree,
               'workflow': 'transition-bootstrap-validation.yml',
               'event': event, 'ref': ref, 'runId': run_id, 'runAttempt': int(run_attempt),
               'sourceArchiveSha256': sha(raw), 'generationRootManifestSha256': sha(manifest),
               'generationSourceMapSha256': sha(canonical(files)),
               'fileCount': len(files), 'sourceFiles': files}
    receipt_raw = canonical(receipt)
    output = Path(output)
    require(output.is_absolute() and output.parent.resolve(strict=True) == output.parent and
            not output.exists() and not output.is_symlink(), 'New canonical absolute output required')
    output.mkdir(mode=0o700)
    write_new(output / 'source.tar.gz', raw)
    write_new(output / 'source-receipt.json', receipt_raw)
    sums = f'{sha(raw)}  source.tar.gz\n{sha(receipt_raw)}  source-receipt.json\n'.encode()
    write_new(output / 'SHA256SUMS', sums)
    print(json.dumps({'decision': receipt['decision'], 'sourceRelease': source_release,
                      'sourceArchiveSha256': sha(raw), 'sourceReceiptSha256': sha(receipt_raw),
                      'generationRootManifestSha256': sha(manifest), 'fileCount': len(files)}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-release', required=True)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--run-attempt', required=True)
    parser.add_argument('--event', required=True)
    parser.add_argument('--ref', required=True)
    args = parser.parse_args()
    publish(args.output_dir, args.source_release, args.run_id, args.run_attempt, args.event, args.ref)


if __name__ == '__main__':
    main()
