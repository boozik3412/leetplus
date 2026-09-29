"""Focused pure source/admission/crypto checks; native effects require Linux root."""
import base64
import copy
import gzip
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('standalone_initial_intro', HERE/'standalone-initial-intro.py')
intro = importlib.util.module_from_spec(spec)
spec.loader.exec_module(intro)


def plan_fixture():
    plan = {name: ('a'*64 if name.endswith('Sha256') else None)
            for name in sorted(intro.PLAN_FIELDS)}
    plan.update({
        'contract': intro.PLAN, 'operationId': '11111111-1111-4111-8111-111111111111',
        'action': 'INTRODUCE_INERT_STANDALONE_TRUST', 'bootId': '22222222-2222-4222-8222-222222222222',
        'introTransportOperationId': '33333333-3333-4333-8333-333333333333',
        'sourceRelease': '1'*40, 'sourceTreeSha': '2'*40,
        'predecessorReleaseSha': intro.B0_RELEASE,
        'predecessorManifestSha256': intro.B0_MANIFEST,
        'predecessorExecutorSha256': intro.B0_EXECUTOR,
        'predecessorInstallerSha256': intro.B0_INSTALLER,
        'oldCorePointer': '/usr/local/lib/leetplus-compose/'+intro.B0_RELEASE+'/control.sh',
        'pendingHandoffAbsent': True, 'fullRunId': 11, 'fullRunAttempt': 1,
        'sourceArtifactId': 12, 'sourceProducerRunId': 13, 'sourceProducerRunAttempt': 1,
        'productionControlArtifactId': 14, 'composeArtifactId': 15,
        'generationDestination': intro.GENERATIONS+'/'+'1'*40,
        'effects': copy.deepcopy(intro.EFFECTS),
        'directoryPreimages': {name: {'state': 'ABSENT', 'device': None, 'inode': None,
                                      'uid': 0, 'gid': 0, 'mode': mode}
                              for name, mode in intro.PARENT_MODES.items()},
        'anchorDirectories': {name: {'device': 1, 'inode': i+2, 'uid': 0, 'gid': 0, 'mode': 0o755}
                              for i, name in enumerate(intro.ANCHOR_DIRS)},
        'nativeControlLockIdentity': {'path': intro.CONTROL_LOCK, 'device': 1, 'inode': 2,
                                      'uid': 0, 'gid': 0, 'mode': 0o600, 'ctimeNs': '1'},
        'dormantDestinations': {name: {'sha256': intro.sha(b'') if name == intro.INSTALL_LOCK else 'b'*64,
                                      'mode': intro.MODES[name], 'uid': 0, 'gid': 0}
                                for name in intro.DEST_SOURCES},
    })
    absent = set(intro.DEST_SOURCES) | {plan['generationDestination'],
        intro.AUDITS+'/'+plan['operationId'],
        intro.STATE+'/'+plan['operationId']+'.standalone-intro.intent.json',
        intro.GENERATIONS+'/.intro-'+plan['operationId']+'.pending'}
    plan['destinationPreimages'] = {name: 'ABSENT' for name in sorted(absent)}
    return plan


def archive_fixture(change=None):
    values = {name: ('approved fixture source '+name+'\n').encode() for name in intro.SOURCE_FILES}
    files = {name: intro.sha(values[name]) for name in sorted(values)}
    values['SHA256SUMS'] = ''.join(f'{digest}  ./{name}\n' for name, digest in files.items()).encode()
    if change:
        change(values)
    memory = io.BytesIO()
    with tarfile.open(fileobj=memory, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        for name in sorted(values):
            info = tarfile.TarInfo(name)
            info.size = len(values[name]); info.mode = 0o400
            info.uid = info.gid = info.mtime = 0
            info.uname = info.gname = ''
            archive.addfile(info, io.BytesIO(values[name]))
    return gzip.compress(memory.getvalue(), mtime=0)


class PlanBoundary(unittest.TestCase):
    def test_closed_inert_plan_is_accepted(self):
        self.assertEqual(intro.validate_plan(plan_fixture())['effects'], intro.EFFECTS)

    def test_every_broad_effect_is_rejected(self):
        for name, value in intro.EFFECTS.items():
            if value:
                continue
            with self.subTest(effect=name):
                plan = plan_fixture(); plan['effects'][name] = True
                with self.assertRaises(ValueError): intro.validate_plan(plan)

    def test_numeric_false_is_not_an_effect_boolean(self):
        plan = plan_fixture(); plan['effects']['providerEffect'] = 0
        with self.assertRaises(ValueError): intro.validate_plan(plan)

    def test_unknown_systemd_destination_is_rejected(self):
        plan = plan_fixture()
        plan['dormantDestinations']['/etc/systemd/system/unsafe.service'] = {
            'sha256': 'b'*64, 'mode': 0o444, 'uid': 0, 'gid': 0}
        with self.assertRaises(ValueError): intro.validate_plan(plan)

    def test_alternate_native_lock_or_pointer_is_rejected(self):
        for field, value in (('oldCorePointer', '/usr/local/sbin/other'),
                             ('predecessorExecutorSha256', 'b'*64)):
            plan = plan_fixture(); plan[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): intro.validate_plan(plan)
        plan = plan_fixture(); plan['nativeControlLockIdentity']['path'] = '/tmp/lock'
        with self.assertRaises(ValueError): intro.validate_plan(plan)

    def test_existing_preimage_and_historical_uuid_are_rejected(self):
        plan = plan_fixture(); plan['destinationPreimages'][intro.WRAPPER] = 'EXACT'
        with self.assertRaises(ValueError): intro.validate_plan(plan)
        plan = plan_fixture(); plan['operationId'] = '9afc7218-4757-4f44-87e1-6096706bad44'
        with self.assertRaises(ValueError): intro.validate_plan(plan)

    def test_manifest_change_cannot_hide_source_closure_drift(self):
        plan = plan_fixture(); plan['sourceRootManifestSha256'] = 'c'*64
        with self.assertRaises(ValueError): intro.validate_plan(plan)


class SourceClosure(unittest.TestCase):
    def test_closed_source_transport_roundtrip(self):
        values, files = intro.source_archive(archive_fixture())
        self.assertEqual(len(values), 20); self.assertEqual(set(files), set(intro.SOURCE_FILES))

    def test_changed_helper_without_new_manifest_rejected(self):
        archive = archive_fixture(lambda values: values.__setitem__(
            'deploy/transition-bootstrap/bundle_installer.py', b'foreign privileged helper\n'))
        with self.assertRaises(ValueError): intro.source_archive(archive)

    def test_extra_or_missing_source_rejected(self):
        for change in (lambda values: values.__setitem__('foreign.py', b'x'),
                       lambda values: values.pop(intro.SOURCE_FILES[0])):
            with self.assertRaises(ValueError): intro.source_archive(archive_fixture(change))

    def test_duplicate_json_and_noncanonical_receipt_rejected(self):
        for raw in (b'{"a": 1, "a": 2}\n', b'{"a":1}\n', b'\xef\xbb\xbf{}\n'):
            with self.assertRaises((ValueError, UnicodeError)): intro.exact_json(raw)

    def test_manifest_does_not_accept_parent_escape_or_self_entry(self):
        for text in ('a'*64+'  ./../helper.py\n', 'a'*64+'  ./SHA256SUMS\n'):
            with self.assertRaises(ValueError): intro.parse_manifest(text.encode())


class SignatureBoundary(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.node = shutil.which('node')
        if not cls.node: raise unittest.SkipTest('Node crypto unavailable')
        cls.plan = plan_fixture()
        cls.approval = {'contract': intro.APPROVAL, 'operationId': cls.plan['operationId'],
            'hostIdentitySha256': cls.plan['hostIdentitySha256'],
            'planSha256': intro.sha(intro.canonical(cls.plan)), 'action': cls.plan['action'],
            'issuedAt': '2026-01-01T00:00:00.000Z', 'expiresAt': '2026-01-01T00:10:00.000Z'}
        script = """import crypto from 'node:crypto';import fs from 'node:fs';
const a=JSON.parse(fs.readFileSync(0,'utf8'));const k=crypto.generateKeyPairSync('ed25519');
process.stdout.write(JSON.stringify({publicPem:k.publicKey.export({format:'pem',type:'spki'}),
signature:crypto.sign(null,Buffer.from(JSON.stringify(a,null,2)+'\\n'),k.privateKey).toString('base64')}));"""
        result = subprocess.run([cls.node, '--input-type=module', '-e', script],
                                input=intro.canonical(cls.approval), capture_output=True, check=True)
        value = json.loads(result.stdout)
        cls.public = value['publicPem'].encode()
        cls.envelope = {'approval': cls.approval, 'signature': value['signature']}

    def test_real_public_signature_valid_only_at_approved_instant(self):
        intro.validate_approval(self.plan, self.envelope, self.public,
                                at='2026-01-01T00:05:00.000Z', node=self.node)
        with self.assertRaises(ValueError):
            intro.validate_approval(self.plan, self.envelope, self.public,
                                    at='2026-01-01T00:11:00.000Z', node=self.node)

    def test_signed_wrong_plan_or_domain_is_rejected_before_effect(self):
        plan = copy.deepcopy(self.plan); plan['hostIdentitySha256'] = 'c'*64
        with self.assertRaises(ValueError):
            intro.validate_approval(plan, self.envelope, self.public,
                                    at='2026-01-01T00:05:00.000Z', node=self.node)
        envelope = copy.deepcopy(self.envelope)
        envelope['approval']['contract'] = 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_APPROVAL'
        with self.assertRaises(ValueError):
            intro.validate_approval(self.plan, envelope, self.public,
                                    at='2026-01-01T00:05:00.000Z', node=self.node)

    def test_corrupt_signature_rejected(self):
        envelope = copy.deepcopy(self.envelope); envelope['signature'] = base64.b64encode(b'\0'*64).decode()
        with self.assertRaises(ValueError):
            intro.validate_approval(self.plan, envelope, self.public,
                                    at='2026-01-01T00:05:00.000Z', node=self.node)


if __name__ == '__main__':
    unittest.main()
