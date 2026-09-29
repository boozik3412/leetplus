"""Disposable Linux-root flock/CAS/crash and Python-to-JS receipt fixtures.

All operational paths are remapped into a new private temporary tree. No
production path, provider, systemd, Docker or key is touched. Ephemeral Ed25519
fixture signing remains in the local Node process; only public PEM/signature
leave that process. Requires the dedicated CI root gate, honestly skips Windows.
"""
import copy
import gzip
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tarfile
import tempfile
import time
import unittest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
spec = importlib.util.spec_from_file_location('intro_test_contract', HERE/'test_standalone_initial_intro.py')
contract = importlib.util.module_from_spec(spec); spec.loader.exec_module(contract)
intro = contract.intro


class FixtureIntro(intro.InitialIntro):
    """Exercise real effect code against an explicitly synthetic live preimage."""
    def _preimage(self, plan):
        f = self.files
        core = f.p(intro.CORE)
        intro.require(core.is_symlink() and os.readlink(core) == plan['oldCorePointer'] and
                      intro.sha(f.read(intro.ACTIVE, 65536)) == plan['oldActiveRecordSha256'] and
                      intro.sha(f.read(intro.HANDOFF, 65536)) == plan['oldHandoffPointerSha256'] and
                      f.absent(intro.PENDING), 'Synthetic current predecessor drift')
        return intro.sha(intro.canonical({'oldCorePointer': plan['oldCorePointer'],
            'predecessorManifestSha256': plan['predecessorManifestSha256'],
            'oldActiveRecordSha256': plan['oldActiveRecordSha256'],
            'oldHandoffPointerSha256': plan['oldHandoffPointerSha256'],
            'pendingHandoffAbsent': True}))


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'getuid') and os.getuid() == 0,
                     'Disposable Linux root fixture required; Windows is not a native pass')
class NativeIntroduction(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='leetplus-initial-intro-')
        self.base = Path(self.temp.name); self.base.chmod(0o700)
        self.files = intro.NativeFiles(self.base)
        self.node = shutil.which('node')
        self.assertIsNotNone(self.node)
        self.plan = contract.plan_fixture()
        self.operation = self.plan['operationId']
        self.request = intro.REQUESTS+self.operation
        for directory in intro.ANCHOR_DIRS:
            self.mkdir(directory, 0o755 if directory.startswith('/usr/local') else 0o700)
        self.mkdir(self.request, 0o700)
        self.mkdir(intro.STATE+'/control-handoffs', 0o700)
        self.write('/etc/machine-id', b'fixture-host-identity\n')
        self.write('/proc/sys/kernel/random/boot_id', self.plan['bootId'].encode()+b'\n')
        self.write('/proc/self/mountinfo', b'1 1 0:0 / / rw - ext4 /dev/fixture rw\n')
        self.write(intro.ACTIVE, b'{"fixtureActive": true}\n')
        self.write(intro.HANDOFF, b'{"fixtureHandoff": true}\n')
        self.files.p(intro.CORE).symlink_to(self.plan['oldCorePointer'])
        self.write(intro.CONTROL_LOCK, b'', 0o600)
        self.plan['hostIdentitySha256'] = intro.sha(b'fixture-host-identity')
        self.plan['oldActiveRecordSha256'] = intro.sha(self.files.read(intro.ACTIVE))
        self.plan['oldHandoffPointerSha256'] = intro.sha(self.files.read(intro.HANDOFF))
        lock = self.files.p(intro.CONTROL_LOCK).stat()
        self.plan['nativeControlLockIdentity'].update({'device': lock.st_dev, 'inode': lock.st_ino,
                                                      'ctimeNs': str(lock.st_ctime_ns)})
        self.plan['anchorDirectories'] = {name: self.identity(name) for name in intro.ANCHOR_DIRS}
        for name, mode in intro.PARENT_MODES.items():
            if self.files.absent(name):
                self.plan['directoryPreimages'][name] = {'state': 'ABSENT', 'device': None, 'inode': None,
                                                         'uid': 0, 'gid': 0, 'mode': mode}
            else:
                self.plan['directoryPreimages'][name] = {'state': 'EXACT', **self.identity(name)}
        self.members = {name: ('fixture inert source '+name+'\n').encode() for name in intro.SOURCE_FILES}
        self.members['docs/deployment/production-control-authority/verify-installed-standalone-intro.mjs'] = (
            REPO/'docs/deployment/production-control-authority/verify-installed-standalone-intro.mjs').read_bytes()
        self.source_files = {name: intro.sha(self.members[name]) for name in sorted(self.members)}
        self.manifest = ''.join(f'{digest}  ./{name}\n' for name,digest in self.source_files.items()).encode()
        self.members['SHA256SUMS'] = self.manifest
        archive = io.BytesIO()
        with tarfile.open(fileobj=archive, mode='w', format=tarfile.USTAR_FORMAT) as tar:
            for name in sorted(self.members):
                info = tarfile.TarInfo(name); info.mode = 0o400; info.size = len(self.members[name])
                info.uid = info.gid = info.mtime = 0; info.uname = info.gname = ''
                tar.addfile(info, io.BytesIO(self.members[name]))
        self.archive = gzip.compress(archive.getvalue(), mtime=0)
        self.plan['sourceArchiveSha256'] = intro.sha(self.archive)
        self.plan['sourceRootManifestSha256'] = self.plan['generationRootManifestSha256'] = intro.sha(self.manifest)
        self.plan['generationSourceMapSha256'] = intro.sha(intro.canonical(self.source_files))
        source = {'contract': intro.SOURCE_RECEIPT, 'decision': 'SOURCE_BYTES_ONLY_NOT_AUTHORIZATION',
            'repository': intro.REPO, 'sourceRelease': self.plan['sourceRelease'],
            'sourceTreeSha': self.plan['sourceTreeSha'], 'workflow': 'transition-bootstrap-validation.yml',
            'event': 'push', 'ref': 'refs/heads/main', 'runId': str(self.plan['sourceProducerRunId']),
            'runAttempt': self.plan['sourceProducerRunAttempt'], 'sourceArchiveSha256': self.plan['sourceArchiveSha256'],
            'generationRootManifestSha256': self.plan['generationRootManifestSha256'],
            'generationSourceMapSha256': self.plan['generationSourceMapSha256'],
            'fileCount': 19, 'sourceFiles': self.source_files}
        self.write(self.request+'/source.tar.gz', self.archive)
        self.write(self.request+'/source-receipt.json', intro.canonical(source))
        self.plan['sourceReceiptSha256'] = intro.sha(intro.canonical(source))
        final = {'schemaVersion': 2, 'admission': 'PASS', 'releaseSha': self.plan['sourceRelease'],
            'repository': intro.REPO, 'runId': str(self.plan['fullRunId']),
            'runAttempt': str(self.plan['fullRunAttempt']), 'workflowSha': self.plan['sourceRelease'],
            'workflowRef': intro.REPO+'/.github/workflows/ci.yml@refs/heads/main',
            'effectiveLane': 'L2_SCHEMA_SECURITY', 'impactReceiptSha256': self.plan['impactReceiptSha256'],
            'productionControlArtifactId': str(self.plan['productionControlArtifactId']),
            'productionControlArchiveSha256': self.plan['productionControlArchiveSha256'],
            'productionControlTransportDigest': self.plan['productionControlTransportSha256']}
        self.write(self.request+'/final-admission.json', intro.canonical(final))
        self.plan['finalAdmissionSha256'] = intro.sha(intro.canonical(final))
        compose = {'contract': 'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION', 'decision': 'PASS',
            'releaseSha': self.plan['sourceRelease'], 'repository': intro.REPO, 'event': 'push',
            'ref': 'refs/heads/main', 'runId': str(self.plan['fullRunId']),
            'runAttempt': str(self.plan['fullRunAttempt']), 'parentAdmissionSha256': self.plan['finalAdmissionSha256'],
            'parentRunAttempt': str(self.plan['fullRunAttempt']), 'effectiveLane': 'L2_SCHEMA_SECURITY',
            'impactReceiptSha256': self.plan['impactReceiptSha256'],
            'controlArchiveSha256': self.plan['composeControlArchiveSha256']}
        self.write(self.request+'/docker-admission.json', intro.canonical(compose))
        self.plan['composeAdmissionSha256'] = intro.sha(intro.canonical(compose))
        program = (HERE/'standalone-initial-intro.py').read_bytes()
        entry = (HERE/'standalone-initial-intro-entry.mjs').read_bytes()
        self.write(self.request+'/intro-entry.mjs', entry)
        self.plan['introEntrySha256'] = intro.sha(entry)
        self.write(self.request+'/intro-program.py', program)
        self.plan['introProgramSha256'] = intro.sha(program)
        for destination, name in intro.DEST_SOURCES.items():
            self.plan['dormantDestinations'][destination]['sha256'] = intro.sha(self.members[name]) if name else intro.sha(b'')
        now = intro.instant(intro.utc_now())
        self.issued = (now-intro.datetime.timedelta(seconds=5)).isoformat(timespec='milliseconds').replace('+00:00','Z')
        self.expires = (now+intro.datetime.timedelta(minutes=10)).isoformat(timespec='milliseconds').replace('+00:00','Z')
        self.transport_audit = intro.TRANSPORTS+'/'+self.plan['introTransportOperationId']
        self.mkdir(self.transport_audit, 0o700)
        snapshot = self.files.p(self.request+'/intro-program.py').stat()
        entry_snapshot = self.files.p(self.request+'/intro-entry.mjs').stat()
        transport_plan = {'contract': intro.TRANSPORT_PLAN, 'operationId': self.plan['introTransportOperationId'],
            'action': 'STAGE_SIGNED_INITIAL_INTRO_SOURCE_ONLY',
            **{name:self.plan[name] for name in intro.TRANSPORT_LINK_FIELDS},
            'snapshotPath': self.request+'/intro-program.py', 'snapshotSize': len(program),
            'snapshotMode': 0o400, 'entrySnapshotPath': self.request+'/intro-entry.mjs',
            'entrySnapshotSize': len(entry), 'entrySnapshotMode': 0o400,
            'effects': intro.TRANSPORT_EFFECTS}
        self.transport_plan = transport_plan
        transport_approval = self.approval(transport_plan, intro.TRANSPORT_APPROVAL)
        intro_approval = self.approval(self.plan, intro.APPROVAL)
        # Sign both approvals with one ephemeral deployment root, without
        # persisting a private key or allowing it into source/log artifacts.
        script = """import crypto from 'node:crypto';import fs from 'node:fs';
const a=JSON.parse(fs.readFileSync(0,'utf8'));const k=crypto.generateKeyPairSync('ed25519');
process.stdout.write(JSON.stringify({publicPem:k.publicKey.export({format:'pem',type:'spki'}),
signatures:a.map(v=>crypto.sign(null,Buffer.from(JSON.stringify(v,null,2)+'\\n'),k.privateKey).toString('base64'))}));"""
        # Intro plan depends on the transport receipt, so use a signer process
        # retaining its ephemeral key only for this bounded local fixture.
        self.signer = subprocess.Popen([self.node, '--input-type=module', '-e', """
import crypto from 'node:crypto';import readline from 'node:readline';
const k=crypto.generateKeyPairSync('ed25519');const rl=readline.createInterface({input:process.stdin});
process.stdout.write(JSON.stringify({publicPem:k.publicKey.export({format:'pem',type:'spki'})})+'\\n');
rl.on('line',line=>{const v=JSON.parse(line);process.stdout.write(JSON.stringify({signature:crypto.sign(null,Buffer.from(JSON.stringify(v,null,2)+'\\n'),k.privateKey).toString('base64')})+'\\n');});
"""], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.public = json.loads(self.signer.stdout.readline())['publicPem'].encode()
        self.write(intro.ROOT_PEM, self.public)
        env_transport = self.sign(transport_approval)
        transport_intent = {'contract': intro.TRANSPORT_INTENT, 'operationId': transport_plan['operationId'],
            'planSha256': intro.sha(intro.canonical(transport_plan)),
            'approvalSha256': intro.sha(intro.canonical(env_transport)), 'authorizedAt': intro.utc_now()}
        transport_receipt = {'contract': intro.TRANSPORT, 'decision': 'PASS',
            'operationId': transport_plan['operationId'], 'planSha256': intro.sha(intro.canonical(transport_plan)),
            'approvalSha256': intro.sha(intro.canonical(env_transport)), 'intentSha256': intro.sha(intro.canonical(transport_intent)),
            **{name:self.plan[name] for name in intro.TRANSPORT_LINK_FIELDS},
            'snapshotPath': self.request+'/intro-program.py', 'snapshotDevice': snapshot.st_dev,
            'snapshotInode': snapshot.st_ino, 'snapshotSize': len(program), 'snapshotMode': 0o400,
            'snapshotUid': 0, 'snapshotGid': 0, 'entrySnapshotPath': self.request+'/intro-entry.mjs',
            'entrySnapshotDevice': entry_snapshot.st_dev, 'entrySnapshotInode': entry_snapshot.st_ino,
            'entrySnapshotSize': len(entry), 'entrySnapshotMode': 0o400,
            'entrySnapshotUid': 0, 'entrySnapshotGid': 0, 'acceptedAt': intro.utc_now()}
        for name, value in (('plan.json',transport_plan),('approval.json',env_transport),
                            ('intent.json',transport_intent),('receipt.json',transport_receipt)):
            self.write(self.transport_audit+'/'+name, intro.canonical(value))
        self.write(self.request+'/transport-receipt.json', intro.canonical(transport_receipt))
        self.plan['introTransportReceiptSha256'] = intro.sha(intro.canonical(transport_receipt))
        self.envelope = self.sign(self.approval(self.plan, intro.APPROVAL))
        self.assertTrue(self.files.absent(self.request+'/plan.json'))
        self.assertTrue(self.files.absent(self.request+'/approval.json'))
        self.engine = self.engine_for(self.files)

    def tearDown(self):
        if getattr(self, 'signer', None):
            self.signer.stdin.close(); self.signer.wait(timeout=5)
            self.signer.stdout.close(); self.signer.stderr.close()
        self.temp.cleanup()

    def engine_for(self, files):
        return FixtureIntro(files=files, node=self.node,
            expected_plan_sha256=intro.sha(intro.canonical(self.plan)),
            expected_approval_sha256=intro.sha(intro.canonical(self.envelope)),
            captured_plan=intro.canonical(self.plan),
            captured_approval=intro.canonical(self.envelope))

    def identity(self, logical):
        info = self.files.p(logical).stat()
        return {'device':info.st_dev,'inode':info.st_ino,'uid':info.st_uid,'gid':info.st_gid,
                'mode':stat.S_IMODE(info.st_mode)}

    def mkdir(self, logical, mode):
        p=self.files.p(logical);p.mkdir(parents=True,exist_ok=True);p.chmod(mode)
        for parent in p.parents:
            if parent == self.base or self.base in parent.parents: parent.chmod(0o700)

    def write(self, logical, raw, mode=0o400):
        p=self.files.p(logical);p.parent.mkdir(parents=True,exist_ok=True)
        p.write_bytes(raw);p.chmod(mode)

    def approval(self, plan, kind):
        return {'contract':kind,'operationId':plan['operationId'],'hostIdentitySha256':plan['hostIdentitySha256'],
                'planSha256':intro.sha(intro.canonical(plan)),'action':plan['action'],
                'issuedAt':self.issued,'expiresAt':self.expires}

    def sign(self, approval):
        self.signer.stdin.write(json.dumps(approval)+'\n');self.signer.stdin.flush()
        return {'approval':approval, 'signature':json.loads(self.signer.stdout.readline())['signature']}

    def verify_snapshot(self):
        raw=(REPO/'docs/deployment/production-control-authority/verify-installed-standalone-intro.mjs').read_bytes()
        # Test-only trusted FS mapping. The exact captured verifier remains
        # unchanged; only node:fs reads are redirected to the private fixture.
        prelude=f"""import fsFixture from 'node:fs';
const fixtureRoot={json.dumps(str(self.base))};const remap=p=>typeof p==='string'&&p.startsWith('/')?fixtureRoot+p:p;
for(const name of ['lstatSync','readdirSync','openSync','readFileSync']){{const orig=fsFixture[name];fsFixture[name]=function(p,...a){{return orig.call(this,remap(p),...a);}};}}
process.argv=['/usr/bin/node',{json.dumps(intro.VERIFIER)},'--source-release',{json.dumps(self.plan['sourceRelease'])}];
""".encode()
        return subprocess.run([self.node,'--input-type=module','-'],input=prelude+raw,
                              capture_output=True,env=intro.CLEAN,timeout=20,check=False)

    def test_prepare_is_read_only_then_inert_apply_verifies_historically(self):
        before=set(p.relative_to(self.base) for p in self.base.rglob('*'))
        self.assertTrue(self.files.absent(self.request+'/plan.json'))
        self.assertTrue(self.files.absent(self.request+'/approval.json'))
        self.assertEqual(self.engine.prepare(self.operation)['decision'],'PREPARED_NOT_AUTHORIZATION')
        self.assertEqual(before,set(p.relative_to(self.base) for p in self.base.rglob('*')))
        self.assertTrue(self.files.absent(self.request+'/plan.json'))
        self.assertTrue(self.files.absent(self.request+'/approval.json'))
        core=os.readlink(self.files.p(intro.CORE));active=self.files.read(intro.ACTIVE);handoff=self.files.read(intro.HANDOFF)
        result=self.engine.apply(self.operation)
        self.assertEqual(result['decision'],'INTRODUCED_INERT_ONLY_NOT_ACTIVE')
        self.assertEqual(os.readlink(self.files.p(intro.CORE)),core)
        self.assertEqual(self.files.read(intro.ACTIVE),active);self.assertEqual(self.files.read(intro.HANDOFF),handoff)
        verified=self.verify_snapshot()
        self.assertEqual(verified.returncode,0,verified.stderr.decode())
        value=json.loads(verified.stdout);self.assertEqual(value['decision'],'PASS')
        self.assertEqual(len(value),8);self.assertEqual(verified.stdout,intro.canonical(value))
        self.assertEqual(value['introReceiptSha256'],result['introReceiptSha256'])
        # A later legitimate pointer is not an expired INTRO forward effect.
        self.files.p(intro.CORE).unlink();self.files.p(intro.CORE).symlink_to('/approved/later/bridge/control.sh')
        self.assertEqual(self.verify_snapshot().returncode,0)

    def test_missing_or_swapped_in_memory_authorization_never_reaches_effect(self):
        with self.assertRaises(ValueError):
            FixtureIntro(files=self.files,node=self.node,
                expected_plan_sha256=intro.sha(intro.canonical(self.plan)),
                expected_approval_sha256=intro.sha(intro.canonical(self.envelope)))
        changed=copy.deepcopy(self.plan);changed['sourceRelease']='f'*40
        with self.assertRaises(ValueError):
            FixtureIntro(files=self.files,node=self.node,
                expected_plan_sha256=intro.sha(intro.canonical(self.plan)),
                expected_approval_sha256=intro.sha(intro.canonical(self.envelope)),
                captured_plan=intro.canonical(changed),captured_approval=intro.canonical(self.envelope))
        self.assertTrue(self.files.absent(intro.STATE+'/'+self.operation+'.standalone-intro.intent.json'))

    def test_pending_dangling_symlink_and_existing_public_destination_block(self):
        self.files.p(intro.PENDING).symlink_to('/missing/entry')
        with self.assertRaises(ValueError):self.engine.prepare(self.operation)
        self.assertTrue(self.files.absent(intro.STATE+'/'+self.operation+'.standalone-intro.intent.json'))
        self.files.p(intro.PENDING).unlink()
        self.write(intro.WRAPPER,b'foreign wrapper',0o500)
        with self.assertRaises(ValueError):self.engine.apply(self.operation)

    def test_real_shared_lock_blocks_exclusive_and_replaced_inode_is_rejected(self):
        import fcntl
        fd=os.open(self.files.p(intro.CONTROL_LOCK),os.O_RDONLY)
        try:
            fcntl.flock(fd,fcntl.LOCK_SH)
            probe="import fcntl,sys;f=open(sys.argv[1],'rb');\ntry: fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\nexcept BlockingIOError: sys.exit(23)"
            result=subprocess.run([os.sys.executable,'-c',probe,str(self.files.p(intro.CONTROL_LOCK))],capture_output=True)
            self.assertEqual(result.returncode,23)
        finally:os.close(fd)
        old_lock = self.files.p(intro.CONTROL_LOCK)
        retained = old_lock.with_name(old_lock.name + '.retained-original')
        old_lock.rename(retained)
        self.write(intro.CONTROL_LOCK,b'',0o600)
        self.assertNotEqual(retained.stat().st_ino, old_lock.stat().st_ino)
        with self.assertRaises(ValueError):
            with self.engine.control_lock(self.plan):self.fail('Replaced lock reached effect')

    def test_failed_after_flat_intent_has_no_replay_or_receipt(self):
        class FailAfterIntent(intro.NativeFiles):
            def create_approved_directories(self,plan):raise OSError('fixture crash after durable intent')
        engine=self.engine_for(FailAfterIntent(self.base))
        with self.assertRaises(OSError):engine.apply(self.operation)
        self.assertFalse(self.files.absent(intro.STATE+'/'+self.operation+'.standalone-intro.intent.json'))
        with self.assertRaises(ValueError):self.engine.apply(self.operation)
        self.assertEqual(self.engine.reconcile(self.operation)['decision'],'RECOVERY_REQUIRED')

    def test_rename_noreplace_and_changed_helper_or_flat_intent_rejected(self):
        self.engine.apply(self.operation)
        target=self.plan['generationDestination']
        self.mkdir(intro.GENERATIONS+'/extra-stage',0o700)
        with self.assertRaises(OSError):self.files.rename_new(intro.GENERATIONS+'/extra-stage',target)
        helper=target+'/payload/deploy/transition-bootstrap/bundle_installer.py'
        self.files.p(helper).chmod(0o600);self.files.p(helper).write_bytes(b'changed helper');self.files.p(helper).chmod(0o400)
        self.assertNotEqual(self.verify_snapshot().returncode,0)
        self.files.p(helper).chmod(0o600);self.files.p(helper).write_bytes(self.members['deploy/transition-bootstrap/bundle_installer.py']);self.files.p(helper).chmod(0o400)
        flat=intro.STATE+'/'+self.operation+'.standalone-intro.intent.json'
        self.files.p(flat).chmod(0o600);self.files.p(flat).write_bytes(b'{}\n');self.files.p(flat).chmod(0o400)
        self.assertNotEqual(self.verify_snapshot().returncode,0)


if __name__=='__main__':unittest.main()
