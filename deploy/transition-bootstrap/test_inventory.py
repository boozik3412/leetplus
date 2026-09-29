"""Disposable Linux root fixture for exact admission and target byte reads."""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest

from inventory import admitted_control, digest
from host_observer import captured_predecessor
from native_boundary import canonical, verify_bundle_inventory

SHA = 'a' * 40


def complete_capture_fixture(old):
    for leaf, field in (('control-handoff-runtime.mjs', 'capturedRuntime'),
                        ('orchestrator.mjs', 'capturedOrchestrator'),
                        ('worker-continuation.mjs', 'capturedWorkerContinuation'),
                        ('worker-authority.mjs', 'capturedWorkerAuthority')):
        raw = b'export const VALUE="captured";\n'
        old[field] = raw
        old['files'][leaf] = digest(raw)
    return old


class CapturedPredecessorTests(unittest.TestCase):
    def test_frozen_a_and_bridge_snapshot_import_graph_is_closed(self):
        names = {'control_handoff.py': 'capturedExecutor',
                 'control-handoff-authority.mjs': 'capturedAuthority',
                 'contract.mjs': 'capturedContract',
                 'control-handoff-runtime.mjs': 'capturedRuntime',
                 'orchestrator.mjs': 'capturedOrchestrator',
                 'worker-continuation.mjs': 'capturedWorkerContinuation',
                 'worker-authority.mjs': 'capturedWorkerAuthority'}
        for release in ('b0cbf3a4f302b299762fa055f3bffe0376a91182',
                        'bebeb41354da0dd04b218495cbbf5d75ba9f0a85'):
            with self.subTest(release=release):
                old = {'root': Path('/usr/local/lib/leetplus-compose') / release,
                       'files': {}}
                for leaf, field in names.items():
                    raw = subprocess.run(['git', '--no-replace-objects', 'show',
                        release + ':deploy/leetplus-compose/' + leaf],
                        capture_output=True, check=True, timeout=10).stdout
                    old[field] = raw
                    old['files'][leaf] = digest(raw)
                module = captured_predecessor(old, 'frozen_predecessor_fixture')
                self.assertTrue(callable(module.snapshot))
                self.assertTrue(callable(module.verify_current_controller_authority))
                if os.name == 'posix' and Path('/usr/bin/node').is_file():
                    runtime_url = (old['root'] / 'control-handoff-runtime.mjs').as_uri()
                    script = ("import fs from 'node:fs';import {validateAcceptedApplicationSnapshot} from '" +
                              runtime_url + "';JSON.parse(fs.readFileSync(0,'utf8'));" +
                              "console.log(typeof validateAcceptedApplicationSnapshot);")
                    self.assertEqual(module.run(['/usr/bin/node', '--input-type=module', '-e', script],
                                                b'{}\n'), b'function')

    def test_verified_executor_buffer_survives_path_replacement(self):
        root = Path(tempfile.mkdtemp(prefix='leetplus-captured-predecessor-'))
        try:
            executor = root / 'control_handoff.py'
            trusted = b'VALUE = "trusted"\ndef run(args, data=None, timeout=25):\n    return args\n'
            executor.write_bytes(trusted)
            authority = b"import {VALUE} from './contract.mjs';export {VALUE};\n"
            contract = b'export const VALUE="trusted";\n'
            old = {'root': root, 'files': {'control_handoff.py': digest(trusted),
                   'control-handoff-authority.mjs': digest(authority), 'contract.mjs': digest(contract)},
                   'capturedExecutor': trusted, 'capturedAuthority': authority, 'capturedContract': contract}
            executor.write_bytes(b'raise RuntimeError("foreign source executed")\n')
            module = captured_predecessor(complete_capture_fixture(old), 'trusted_predecessor_fixture')
            self.assertEqual(module.VALUE, 'trusted')
        finally:
            shutil.rmtree(root)

    @unittest.skipUnless(shutil.which('node'), 'Captured authority fixture requires Node')
    def test_nonfast_forward_rollback_recovery_use_captured_authority_closure(self):
        with tempfile.TemporaryDirectory(prefix='leetplus-captured-authority-') as directory:
            root = Path(directory).resolve()
            node = shutil.which('node')
            authority_url = (root / 'control-handoff-authority.mjs').as_uri()
            trusted = ("import subprocess\n"
                "def run(args, data=None, timeout=25):\n"
                f"    result=subprocess.run([{node!r},*args[1:]],input=data,capture_output=True,timeout=timeout)\n"
                "    if result.returncode: raise ValueError(result.stderr.decode())\n"
                "    return result.stdout.strip()\n"
                "def invoke(name):\n"
                f"    script=\"import fs from 'node:fs';import {{\"+name+\"}} from '{authority_url}';JSON.parse(fs.readFileSync(0,'utf8'));\"+name+\"();console.log('PASS');\"\n"
                "    return run(['/usr/bin/node','--input-type=module','-e',script],b'{}')\n"
                "def validate_authority(): return invoke('validateControlHandoffAuthority')\n"
                "def validate_rollback(): return invoke('validateControlRollbackApproval')\n"
                "def validate_recovery(): return invoke('validateControlHandoffRecoveryAuthority')\n"
                "def verify_current_controller_authority(current):\n"
                "    if current['activePlanControlSha256'] != 'fast': return validate_authority()\n").encode()
            authority = ("import {VALUE} from './contract.mjs';\n"
                "const check=()=>{if(VALUE!=='captured')throw Error('foreign dependency');};\n"
                "export const validateControlHandoffAuthority=check;\n"
                "export const validateControlRollbackApproval=check;\n"
                "export const validateControlHandoffRecoveryAuthority=check;\n").encode()
            contract = b"export const VALUE='captured';\n"
            files = {'control_handoff.py': trusted, 'control-handoff-authority.mjs': authority,
                     'contract.mjs': contract}
            old = {'root': root, 'files': {name: digest(raw) for name, raw in files.items()},
                   'capturedExecutor': trusted, 'capturedAuthority': authority,
                   'capturedContract': contract}
            for name in files:
                (root / name).write_bytes(b'raise Error("foreign source pathname")\n')
            module = captured_predecessor(complete_capture_fixture(old), 'captured_authority_fixture')
            self.assertEqual(module.verify_current_controller_authority(
                {'activePlanControlSha256': 'nonfast'}), b'PASS')
            self.assertEqual(module.validate_rollback(), b'PASS')
            self.assertEqual(module.validate_recovery(), b'PASS')


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'getuid') and os.getuid() == 0,
                     'Exact native inventory requires Linux root')
class InstalledInventoryTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='leetplus-bootstrap-inventory-', dir='/run'))
        self.root.chmod(0o700)
        self.controls = self.root / 'controls'
        self.inbox = self.root / 'inbox'
        for directory in (self.controls, self.inbox, self.controls / SHA, self.inbox / SHA):
            directory.mkdir(mode=0o700)
        self.leaves = {'control.sh': b'#!/bin/sh\n', 'control_handoff.py': b'print("source only")\n',
                       'control-handoff-authority.mjs': b"import {VALUE} from './contract.mjs';\n",
                       'contract.mjs': b'export const VALUE="fixture";\n',
                       **{leaf: b'export const VALUE="fixture";\n' for leaf in
                          ('control-handoff-runtime.mjs', 'orchestrator.mjs',
                           'worker-continuation.mjs', 'worker-authority.mjs')}}
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:gz') as archive:
            for name, data in self.leaves.items():
                item = tarfile.TarInfo('deploy/leetplus-compose/' + name)
                item.size = len(data)
                item.mode = 0o400
                archive.addfile(item, io.BytesIO(data))
        self.archive = stream.getvalue()
        self.release = {'releaseSha': SHA}
        self.admission = {'contract': 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION',
            'decision': 'PASS', 'releaseSha': SHA, 'repository': 'boozik3412/leetplus',
            'event': 'push', 'ref': 'refs/heads/main',
            'controlArchiveSha256': digest(self.archive),
            'releaseManifestSha256': digest(canonical(self.release))}
        self.files = {name: digest(data) for name, data in self.leaves.items()}
        self.manifest = {'contract': 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_INSTALL',
                         'releaseSha': SHA, 'admissionSha256': digest(canonical(self.admission)),
                         'files': self.files}
        for name, data in self.leaves.items():
            (self.controls / SHA / name).write_bytes(data)
        (self.controls / SHA / 'install-manifest.json').write_bytes(canonical(self.manifest))
        (self.inbox / SHA / 'docker-admission.json').write_bytes(canonical(self.admission))
        (self.inbox / SHA / 'release.json').write_bytes(canonical(self.release))
        (self.inbox / SHA / 'control.tar.gz').write_bytes(self.archive)

    def tearDown(self):
        shutil.rmtree(self.root)

    def observed(self):
        return admitted_control(controls_root=self.controls, inbox_root=self.inbox, release_sha=SHA)

    def test_reproduces_full_installed_archive_and_exact_main_provenance(self):
        value = self.observed()
        self.assertEqual(value['files'], self.files)
        self.assertEqual(value['capturedExecutor'], self.leaves['control_handoff.py'])
        self.assertEqual(value['controlArchiveSha256'], digest(self.archive))
        self.assertEqual(value['admissionSha256'], digest(canonical(self.admission)))

    def test_rejects_mutated_added_symlink_and_hardlinked_privileged_leaf(self):
        leaf = self.controls / SHA / 'control.sh'
        original = leaf.read_bytes()
        leaf.write_bytes(b'changed\n')
        with self.assertRaisesRegex(ValueError, 'bundle byte|Privileged native leaf'):
            self.observed()
        leaf.write_bytes(original)
        extra = self.controls / SHA / 'root-helper.py'
        extra.write_bytes(b'pass\n')
        with self.assertRaisesRegex(ValueError, 'inventory differs'):
            self.observed()
        extra.unlink()
        leaf.unlink()
        leaf.symlink_to(self.inbox / SHA / 'release.json')
        with self.assertRaises(OSError):
            self.observed()
        leaf.unlink()
        os.link(self.inbox / SHA / 'release.json', leaf)
        with self.assertRaisesRegex(ValueError, 'Untrusted native file'):
            self.observed()

    def test_rejects_wrong_event_ref_archive_and_manifest(self):
        admission = self.inbox / SHA / 'docker-admission.json'
        admission.write_bytes(canonical({**self.admission, 'event': 'workflow_dispatch'}))
        with self.assertRaisesRegex(ValueError, 'exact-main admitted'):
            self.observed()
        admission.write_bytes(canonical(self.admission))
        archive = self.inbox / SHA / 'control.tar.gz'
        archive.write_bytes(self.archive + b'foreign')
        with self.assertRaisesRegex(ValueError, 'archive'):
            self.observed()
        archive.write_bytes(self.archive)
        manifest = self.controls / SHA / 'install-manifest.json'
        manifest.write_bytes(canonical({**self.manifest, 'releaseSha': 'b' * 40}))
        with self.assertRaisesRegex(ValueError, 'manifest'):
            self.observed()

    def test_closed_bundle_inventory_rejects_extra_and_symlink(self):
        root = self.root / 'bundle'
        (root / 'deploy' / 'transition-bootstrap').mkdir(parents=True)
        (root / 'deploy' / 'transition-bootstrap' / 'protocol.mjs').write_bytes(b'protocol\n')
        files = {'deploy/transition-bootstrap/protocol.mjs': digest(b'protocol\n')}
        self.assertTrue(verify_bundle_inventory(root, files))
        foreign = root / 'deploy' / 'transition-bootstrap' / 'secret.pem'
        foreign.write_bytes(b'foreign\n')
        with self.assertRaisesRegex(ValueError, 'unexpected leaf'):
            verify_bundle_inventory(root, files)
        foreign.unlink()
        protocol = root / 'deploy' / 'transition-bootstrap' / 'protocol.mjs'
        protocol.unlink()
        protocol.symlink_to(self.inbox / SHA / 'release.json')
        with self.assertRaises(OSError):
            verify_bundle_inventory(root, files)


if __name__ == '__main__':
    unittest.main()
