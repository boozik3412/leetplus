import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
import tarfile

spec = importlib.util.spec_from_file_location('derive_rehearsal', Path(__file__).with_name('derive-rehearsal-inputs.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class DerivationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='leetplus-derive-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.output = self.root / 'derived'
        self.capsule = self.root / 'capsule.tar'
        self.op = '11111111-1111-4111-8111-111111111111'
        self.plan = {'operationId': self.op, 'hostIdentitySha256': 'c' * 64, 'controlSha256': 'd' * 64}
        self.active = {'operationId': self.op, 'activeSlot': 'blue', 'generation': 9, 'blue': {'releaseSha': 'a' * 40}, 'planSha256': hashlib.sha256(mod.canonical(self.plan)).hexdigest()}
        final = {'operationId': self.op, 'planSha256': self.active['planSha256']}
        profiles = {'api-blue.json': {'DATABASE_URL': 'postgresql://fixture', 'APP_ENCRYPTION_KEY': 'fixture'}, 'bonus-ledger-worker.json': {}, 'langame-daily-worker.json': {}}
        self.members = {'manifest.json': mod.canonical({'contract': 'LEETPLUS_DAILY_BACKUP_V1', 'dataSource': {'inRecovery': False}, 'files': {k: {'sha256': hashlib.sha256(v).hexdigest(), 'bytes': len(v)} for k, v in {'leetplus.dump': b'dump', 'globals.sql': b'globals'}.items()}}), 'leetplus.dump': b'dump', 'globals.sql': b'globals', mod.STATE + 'active.json': mod.canonical(self.active), mod.STATE + 'operations/' + self.op + '/plan.json': mod.canonical(self.plan), mod.STATE + 'operations/' + self.op + '/final.json': mod.canonical(final)}
        self.members.update({mod.SECRETS + name: mod.canonical(value) for name, value in profiles.items()})
        self.verification = {'decision': 'AUTHENTICATED_APPLICATION_BACKUP_PASS', 'privateAclVerified': True, 'privateDirectory': str(self.root), 'backupSha256': 'b' * 64, 'sourceAppSha': 'a' * 40, 'generation': 9, 'sourceApplicationFinalSha256': hashlib.sha256(mod.canonical(final)).hexdigest(), 'profileHashes': {name: hashlib.sha256(mod.canonical(value)).hexdigest() for name, value in profiles.items()}, 'workerEnvelopeHashes': {}}
        self.request = {'nativeRequest': {'preparationGuard': {'activeSha256': hashlib.sha256(mod.canonical(self.active)).hexdigest(), 'generation': 9, 'activeSlot': 'blue', 'hostIdentitySha256': 'c' * 64, 'controllerManifestSha256': 'd' * 64}}}
        for worker in ['bonus-ledger-worker', 'langame-daily-worker']:
            raw = mod.canonical({'worker': worker, 'generation': 9})
            self.members[mod.STATE + 'worker-grants/' + worker + '.json'] = raw
            self.verification['workerEnvelopeHashes'][worker] = hashlib.sha256(raw).hexdigest()
        self.request['nativeRequest']['workerContinuation'] = {'grantBindings': [{'worker': w, 'grantSha256': h} for w, h in self.verification['workerEnvelopeHashes'].items()], 'profileBindings': [{'worker': w, 'profileSha256': self.verification['profileHashes'][w + '.json']} for w in self.verification['workerEnvelopeHashes']]}
        self.pack()

    def pack(self, duplicate=None, unsafe=None):
        with tarfile.open(self.capsule, 'w') as tar:
            for name, data in list(self.members.items()) + ([(duplicate, self.members[duplicate])] if duplicate else []):
                item = tarfile.TarInfo(name)
                item.size = len(data)
                tar.addfile(item, io.BytesIO(data))
            if unsafe:
                item = tarfile.TarInfo(unsafe)
                item.type = tarfile.SYMTYPE
                item.linkname = '/etc/passwd'
                tar.addfile(item)
        self.verification['plaintextSha256'] = mod.sha(self.capsule)
        (self.root / 'verification.json').write_bytes(mod.canonical(self.verification))
        (self.root / 'input.json').write_bytes(mod.canonical(self.request))

    def derive(self):
        return mod.derive(self.root / 'verification.json', self.capsule, self.root / 'input.json', self.output)

    def test_source_release_is_derived_and_restart_preserves_receipt(self):
        first = self.derive()
        self.assertEqual(json.loads((self.output / 'restore-manifest.json').read_bytes())['sourceReleaseSha'], 'a' * 40)
        self.assertEqual(first['dumpPath'], mod.SERVER_INPUT + '/leetplus.dump')
        self.assertEqual(first, self.derive())
        normalized = json.loads((self.output / 'backup-verification.json').read_bytes())
        self.assertEqual(normalized['sourceHostIdentitySha256'], 'c' * 64)
        self.assertEqual(normalized['sourceActiveSha256'], self.request['nativeRequest']['preparationGuard']['activeSha256'])

    def test_capsule_change_fails_before_derivation(self):
        with self.capsule.open('ab') as out:
            out.write(b'changed')
        with self.assertRaisesRegex(ValueError, 'capsule digest'):
            self.derive()

    def test_generation_drift_and_source_plan_tamper(self):
        self.request['nativeRequest']['preparationGuard']['generation'] = 10
        self.pack()
        with self.assertRaisesRegex(ValueError, 'baseline drift'):
            self.derive()

    def test_duplicate_and_symlink_members_rejected(self):
        self.pack(duplicate='manifest.json')
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            self.derive()
        # New operation directory: failed intent is immutable and preserved.
        self.output = self.root / 'derived-second'
        self.pack(unsafe='unexpected-link')
        with self.assertRaisesRegex(ValueError, 'Non-regular'):
            self.derive()

    def test_replay_rejects_changed_derived_bytes(self):
        self.derive()
        (self.output / 'leetplus.dump').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'input changed'):
            self.derive()

    def test_private_acl_proof_required(self):
        self.verification['privateAclVerified'] = False
        self.pack()
        with self.assertRaisesRegex(ValueError, 'ACL proof'):
            self.derive()

    def test_profile_tamper_is_rejected_against_authenticated_hashes(self):
        self.members[mod.SECRETS + 'api-blue.json'] = b'{"DATABASE_URL":"changed"}'
        self.pack()
        with self.assertRaisesRegex(ValueError, 'profile drift'):
            self.derive()

    def test_source_plan_tamper_is_rejected(self):
        self.members[mod.STATE + 'operations/' + self.op + '/plan.json'] = b'{}'
        self.pack()
        with self.assertRaisesRegex(ValueError, 'plan/host drift'):
            self.derive()

    def test_next_release_can_derive_from_an_authenticated_canonical_rollback(self):
        self.plan.update(generation=7, previous={'activeSlot': 'blue'}, blue={'releaseSha': 'a' * 40}, green={'releaseSha': 'e' * 40}, dataRelease={'releaseSha': 'f' * 40}, dataAdmissionSha256='f' * 64)
        plan_hash = hashlib.sha256(mod.canonical(self.plan)).hexdigest()
        self.active = {k: self.plan[k] for k in ['operationId', 'blue', 'green', 'dataRelease', 'dataAdmissionSha256']}
        self.active.update(generation=9, activeSlot='blue', planSha256=plan_hash, outcome='ROLLED_BACK')
        prefix = mod.STATE + 'operations/' + self.op + '/'
        self.members.pop(prefix + 'final.json')
        self.members[prefix + 'plan.json'] = mod.canonical(self.plan)
        self.members[mod.STATE + 'active.json'] = mod.canonical(self.active)
        previous = None
        for index, phase in enumerate(['HYDRATE', 'BIND', 'SMOKE', 'CUTOVER'], 1):
            intent = {'phase': phase, 'planSha256': plan_hash, 'previousReceiptSha256': previous}
            evidence = {'phase': phase, 'planSha256': plan_hash}
            receipt = {'phase': phase, 'planSha256': plan_hash, 'previousReceiptSha256': previous, 'intentSha256': hashlib.sha256(mod.canonical(intent)).hexdigest(), 'evidenceSha256': hashlib.sha256(mod.canonical(evidence)).hexdigest()}
            for kind, value in [('intent', intent), ('evidence', evidence), ('receipt', receipt)]:
                self.members[prefix + f'{index}-{phase}.{kind}.json'] = mod.canonical(value)
            previous = hashlib.sha256(mod.canonical(receipt)).hexdigest()
        self.members[prefix + '5-POSTCHECK.intent.json'] = mod.canonical({'phase': 'POSTCHECK', 'planSha256': plan_hash, 'previousReceiptSha256': previous})
        terminal = mod.canonical({'contract': 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ROLLED_BACK', 'planSha256': plan_hash, 'reason': 'POSTCHECK_FAILED', 'active': self.active})
        self.members[prefix + 'rolled-back.json'] = terminal
        self.verification.pop('sourceApplicationFinalSha256')
        self.verification['sourceApplicationTerminalSha256'] = hashlib.sha256(terminal).hexdigest()
        self.request['nativeRequest']['preparationGuard']['activeSha256'] = hashlib.sha256(mod.canonical(self.active)).hexdigest()
        self.pack()
        self.assertEqual(self.derive()['decision'], 'PASS')


if __name__ == '__main__':
    unittest.main()
