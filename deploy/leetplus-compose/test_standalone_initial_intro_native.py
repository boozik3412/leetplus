"""Disposable Linux-root flock/CAS/crash and Python-to-JS receipt fixtures.

All operational paths are remapped into a new private temporary tree. No
production path, provider, systemd, Docker or key is touched. Ephemeral Ed25519
fixture signing remains in the local Node process; only public PEM/signature
leave that process. Requires the dedicated CI root gate, honestly skips Windows.
"""
import base64
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
from unittest.mock import patch

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
        transport_operation = self.plan['introTransportOperationId']
        staging = '/srv/leetplus/production-control-inbox/.transport-'+transport_operation+'.pending'
        flat = intro.STATE+'/'+transport_operation+'.standalone-transport.intent.json'
        parent_names = (intro.STATE,'/srv/leetplus','/srv/leetplus/production-control-inbox',intro.TRANSPORTS)
        raw_sources = {name:self.files.read(self.request+'/'+name, intro.MAX_ARCHIVE if name=='source.tar.gz' else intro.MAX_LEAF)
                       for name in ('source.tar.gz','source-receipt.json','final-admission.json',
                                    'docker-admission.json','intro-entry.mjs','intro-program.py')}
        generated = {flat:'FLAT_INTENT',self.transport_audit+'/plan.json':'AUDIT_PLAN',
            self.transport_audit+'/approval.json':'AUDIT_APPROVAL',
            self.transport_audit+'/intent.json':'AUDIT_INTENT',
            self.transport_audit+'/receipt.json':'AUDIT_RECEIPT',
            self.request+'/transport-receipt.json':'REQUEST_RECEIPT'}
        transport_plan['execution'] = {
            'code': {'transportEntrySha256': 'a'*64, 'transportProgramSha256': 'b'*64,
                'pythonLoaderSha256':'a44a7637f5d4a89f7ab7084fc1a300c35727fe20b78e44ad4491fbba91191bff',
                'nodeExecutableSha256':'c'*64,'nodeRealpath':'/usr/bin/node',
                'pythonExecutableSha256':'d'*64,'pythonRealpath':'/usr/bin/python3'},
            'invocation': {'interpreter':'/usr/bin/python3','flags':['-I','-B','-c'],
                           'mode':'memory-captured-python-c','action':'stage'},
            'host': {'hostIdentitySha256':self.plan['hostIdentitySha256'],'bootId':self.plan['bootId']},
            'predecessor': {'releaseSha':intro.B0_RELEASE,'manifestSha256':intro.B0_MANIFEST,
                'executorSha256':intro.B0_EXECUTOR,'installerSha256':intro.B0_INSTALLER,
                'corePointer':self.plan['oldCorePointer'],
                'activeRecordSha256':self.plan['oldActiveRecordSha256'],
                'handoffPointerSha256':self.plan['oldHandoffPointerSha256'],'pendingAbsent':True},
            'nativeControlLockIdentity':copy.deepcopy(self.plan['nativeControlLockIdentity']),
            'trustRoot': {'path':intro.ROOT_PEM,'rawSha256':'e'*64},
            'parentPreimages': {name:{'state':'EXACT',**self.identity(name)} for name in parent_names},
            'leafPreimages': {name:'ABSENT' for name in sorted((self.request,staging,self.transport_audit,flat))},
            'privateDirectories': {name:{'mode':0o700,'uid':0,'gid':0}
                for name in sorted((self.request,staging,self.transport_audit))},
            'destinations': {name:{'sha256':intro.sha(raw),'bytes':len(raw),'mode':0o400,'uid':0,'gid':0}
                for name,raw in raw_sources.items()},
            'generatedDestinations': {name:{'kind':kind,'mode':0o400,'uid':0,'gid':0}
                for name,kind in sorted(generated.items())},
            'limits': {'archiveBytes':intro.MAX_ARCHIVE,'leafBytes':intro.MAX_LEAF,
                'authorizationBytes':131072,'packetBytes':48*1024*1024,
                'transportProgramBytes':65536,'lockWaitSeconds':120,'totalSeconds':180},
            'effects':copy.deepcopy(intro.TRANSPORT_EFFECTS),
        }
        self.transport_plan = transport_plan
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
        transport_plan['execution']['trustRoot']['rawSha256']=intro.sha(self.public)
        transport_approval = self.approval(transport_plan, intro.TRANSPORT_APPROVAL)
        env_transport = self.sign(transport_approval)
        transport_intent = {'contract': intro.TRANSPORT_INTENT, 'operationId': transport_plan['operationId'],
            'planSha256': intro.sha(intro.canonical(transport_plan)),
            'approvalSha256': intro.sha(intro.canonical(env_transport)), 'authorizedAt': intro.utc_now()}
        self.write(flat,intro.canonical(transport_intent))
        postimage={name:{'sha256':intro.sha(raw),'bytes':len(raw),'mode':0o400,'uid':0,'gid':0}
                   for name,raw in sorted(raw_sources.items())}
        parent_postimage={name:self.identity(name) for name in sorted(parent_names)}
        predecessor_postimage={'corePointer':self.plan['oldCorePointer'],
            'manifestSha256':self.plan['predecessorManifestSha256'],
            'activeRecordSha256':self.plan['oldActiveRecordSha256'],
            'handoffPointerSha256':self.plan['oldHandoffPointerSha256'],'pendingAbsent':True}
        transport_receipt = {'contract': intro.TRANSPORT, 'decision': 'PASS',
            'operationId': transport_plan['operationId'], 'planSha256': intro.sha(intro.canonical(transport_plan)),
            'approvalSha256': intro.sha(intro.canonical(env_transport)), 'intentSha256': intro.sha(intro.canonical(transport_intent)),
            **{name:self.plan[name] for name in intro.TRANSPORT_LINK_FIELDS},
            'snapshotPath': self.request+'/intro-program.py', 'snapshotDevice': snapshot.st_dev,
            'snapshotInode': snapshot.st_ino, 'snapshotSize': len(program), 'snapshotMode': 0o400,
            'snapshotUid': 0, 'snapshotGid': 0, 'entrySnapshotPath': self.request+'/intro-entry.mjs',
            'entrySnapshotDevice': entry_snapshot.st_dev, 'entrySnapshotInode': entry_snapshot.st_ino,
            'entrySnapshotSize': len(entry), 'entrySnapshotMode': 0o400,
            'entrySnapshotUid': 0, 'entrySnapshotGid': 0,
            'executionSha256':intro.sha(intro.canonical(transport_plan['execution'])),
            'flatIntentSha256':intro.sha(intro.canonical(transport_intent)),
            'fullPostimageSha256':intro.sha(intro.canonical(postimage)),
            'parentPostimageSha256':intro.sha(intro.canonical(parent_postimage)),
            'predecessorPostimageSha256':intro.sha(intro.canonical(predecessor_postimage)),
            'acceptedAt': intro.utc_now()}
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
const fixtureRoot={json.dumps(str(self.base))};const remap=p=>typeof p==='string'&&p.startsWith('/')&&!p.startsWith(fixtureRoot+'/')&&p!==fixtureRoot?fixtureRoot+p:p;
for(const name of ['lstatSync','readdirSync','openSync','readFileSync']){{const orig=fsFixture[name];fsFixture[name]=function(p,...a){{return orig.call(this,remap(p),...a);}};}}
process.argv=['/usr/bin/node',{json.dumps(intro.VERIFIER)},'--source-release',{json.dumps(self.plan['sourceRelease'])}];
""".encode()
        return subprocess.run([self.node,'--input-type=module','-'],input=prelude+raw,
                              capture_output=True,env=intro.CLEAN,timeout=20,check=False)

    def finalized_transport_intent(self):
        original=self.transport_plan;old=original['operationId']
        raw_plan=self.files.read(self.transport_audit+'/plan.json',131072)
        raw_approval=self.files.read(self.transport_audit+'/approval.json',131072)
        raw_intent=self.files.read(self.transport_audit+'/intent.json',131072)
        raw_receipt=self.files.read(self.request+'/transport-receipt.json',131072)
        flat=intro.STATE+'/'+old+'.standalone-transport-finalize.intent.json'
        code=copy.deepcopy(original['execution']['code'])
        code['finalizeEntrySha256']=intro.sha((HERE/'standalone-intro-transport-finalize-entry.mjs').read_bytes())
        code.pop('transportEntrySha256')
        plan={'contract':'LEETPLUS_STANDALONE_INTRO_TRANSPORT_FINALIZE_V1_PLAN',
            'operationId':'44444444-4444-4444-8444-444444444444',
            'action':'FINALIZE_EXACT_INITIAL_TRANSPORT_AUDIT_RECEIPT_ONLY',
            'hostIdentitySha256':original['hostIdentitySha256'],'bootId':self.plan['bootId'],
            'originalOperationId':old,'originalPlanSha256':intro.sha(raw_plan),
            'originalApprovalSha256':intro.sha(raw_approval),'originalIntentSha256':intro.sha(raw_intent),
            'requestReceiptSha256':intro.sha(raw_receipt),
            'effects':{'auditReceiptFinalizeOnly':True,'sourceSnapshotMutation':False,
                'targetExecution':False,'controllerPointerMutation':False,'applicationRestart':False,
                'systemdUnitMutation':False,'daemonReload':False,'dataMutation':False,
                'timerMutation':False,'workerGrantMutation':False,'providerEffect':False,'privateKeyTransport':False}}
        plan['execution']={'code':code,'invocation':{'interpreter':'/usr/bin/python3','flags':['-I','-B','-c'],
            'mode':'memory-captured-python-c','action':'finalize-reconcile'},
            'host':{'hostIdentitySha256':plan['hostIdentitySha256'],'bootId':plan['bootId']},
            'nativeControlLockIdentity':copy.deepcopy(original['execution']['nativeControlLockIdentity']),
            'trustRoot':{'path':intro.ROOT_PEM,'rawSha256':intro.sha(self.public)},
            'auditDirectoryIdentity':self.identity(self.transport_audit),
            'requestDirectoryIdentity':self.identity(self.request),
            'destinations':{flat:{'kind':'FLAT_FINALIZE_INTENT','preimage':'ABSENT','uid':0,'gid':0,'mode':0o400},
                self.transport_audit+'/receipt.json':{'kind':'ORIGINAL_AUDIT_RECEIPT','preimage':'ABSENT',
                    'sha256':intro.sha(raw_receipt),'bytes':len(raw_receipt),'uid':0,'gid':0,'mode':0o400}},
            'limits':{'archiveBytes':intro.MAX_ARCHIVE,'leafBytes':intro.MAX_LEAF,
                'authorizationBytes':131072,'packetBytes':131072,'transportProgramBytes':65536,
                'lockWaitSeconds':120,'totalSeconds':180},'effects':copy.deepcopy(plan['effects'])}
        envelope=self.sign(self.approval(plan,'LEETPLUS_STANDALONE_INTRO_TRANSPORT_FINALIZE_V1_APPROVAL'))
        intent={'contract':'LEETPLUS_STANDALONE_INTRO_TRANSPORT_FINALIZE_V1_INTENT',
            'operationId':plan['operationId'],'originalOperationId':old,
            'planSha256':intro.sha(intro.canonical(plan)),'approvalSha256':intro.sha(intro.canonical(envelope)),
            'requestReceiptSha256':intro.sha(raw_receipt),'authorizedAt':intro.utc_now(),
            'plan':plan,'approvalEnvelope':envelope}
        return flat,intent

    def intro_finalize_packet(self):
        state=self.engine.pending_terminal(self.operation)
        marker=self.files.p(intro.AUDITS+'/'+self.operation+'/receipt.pending.json').lstat()
        audit=intro.AUDITS+'/'+self.operation
        flat=intro.STATE+'/'+self.operation+'.standalone-intro-finalize.intent.json'
        plan={'contract':intro.FINALIZE_PLAN,'operationId':'55555555-5555-4555-8555-555555555555',
            'originalOperationId':self.operation,'action':intro.FINALIZE_ACTION,
            'hostIdentitySha256':self.plan['hostIdentitySha256'],'bootId':self.plan['bootId'],
            'originalPlanSha256':intro.sha(state['originalPlanRaw']),
            'originalApprovalSha256':intro.sha(state['originalApprovalRaw']),
            'originalIntentSha256':intro.sha(state['intentRaw']),
            'markerSha256':intro.sha(state['markerRaw']),'postimageSha256':state['postimageSha256'],
            'effects':copy.deepcopy(intro.FINALIZE_EFFECTS)}
        plan['execution']={'code':{'introFinalizeEntrySha256':intro.sha((HERE/'standalone-initial-intro-finalize-entry.mjs').read_bytes()),
            'introProgramSha256':intro.sha((HERE/'standalone-initial-intro.py').read_bytes()),
            'pythonLoaderSha256':intro.sha(intro.FINALIZE_LOADER.encode()),
            'nodeExecutableSha256':'a'*64,'nodeRealpath':'/usr/bin/node',
            'pythonExecutableSha256':'b'*64,'pythonRealpath':'/usr/bin/python3'},
            'invocation':{'interpreter':'/usr/bin/python3','flags':['-I','-B','-c'],
                'mode':'captured-code-and-packet-stdin','action':'finalize'},
            'host':{'hostIdentitySha256':plan['hostIdentitySha256'],'bootId':plan['bootId']},
            'nativeControlLockIdentity':copy.deepcopy(self.plan['nativeControlLockIdentity']),
            'trustRoot':{'path':intro.ROOT_PEM,'rawSha256':intro.sha(self.public)},
            'auditDirectoryIdentity':self.identity(audit),
            'markerIdentity':{'device':marker.st_dev,'inode':marker.st_ino,'bytes':marker.st_size,
                'uid':marker.st_uid,'gid':marker.st_gid,'mode':stat.S_IMODE(marker.st_mode),'ctimeNs':str(marker.st_ctime_ns)},
            'destinations':{flat:{'kind':'FLAT_FINALIZE_INTENT','preimage':'ABSENT','uid':0,'gid':0,'mode':0o400},
                audit+'/receipt.json':{'kind':'EXACT_MARKER_RECEIPT','preimage':'ABSENT',
                    'sha256':plan['markerSha256'],'bytes':marker.st_size,'uid':0,'gid':0,'mode':0o400}},
            'limits':{'programBytes':131072,'packetBytes':131072,'lockWaitSeconds':120,'totalSeconds':180},
            'effects':copy.deepcopy(intro.FINALIZE_EFFECTS)}
        self.write('/usr/bin/node',b'fixture node tool bytes')
        self.write('/usr/bin/python3',b'fixture python tool bytes')
        plan['execution']['code']['nodeExecutableSha256']=intro.sha(b'fixture node tool bytes')
        plan['execution']['code']['pythonExecutableSha256']=intro.sha(b'fixture python tool bytes')
        envelope=self.sign(self.approval(plan,intro.FINALIZE_APPROVAL))
        return {'finalizePlan':plan,'finalizeApprovalEnvelope':envelope}

    def complete_intro_without_receipt(self):
        terminal=intro.AUDITS+'/'+self.operation+'/receipt.json'
        class LoseReceipt(intro.NativeFiles):
            def publish(self,value,raw,mode):
                if value==terminal:raise OSError('fixture lost terminal INTRO response')
                return super().publish(value,raw,mode)
        with self.assertRaises(OSError):self.engine_for(LoseReceipt(self.base)).apply(self.operation)
        self.assertTrue(self.files.absent(terminal))

    def real_b0_for_gate(self):
        release=intro.B0_RELEASE
        inventory=subprocess.run(['git','--no-replace-objects','-C',str(REPO),'ls-tree','-r','--name-only',
            release,'--','deploy/leetplus-compose'],capture_output=True,check=True).stdout.decode().splitlines()
        self.assertEqual(len(inventory),99)
        files={}
        for name in inventory:
            raw=subprocess.run(['git','--no-replace-objects','-C',str(REPO),'show',release+':'+name],
                capture_output=True,check=True).stdout
            leaf=name.removeprefix('deploy/leetplus-compose/')
            files[leaf]=intro.sha(raw);self.write('/usr/local/lib/leetplus-compose/'+release+'/'+leaf,raw)
        manifest={'contract':'LEETPLUS_COMPOSE_BLUE_GREEN_V1_INSTALL','releaseSha':release,
            'admissionSha256':'8302b0e73e38aecf419f78c469018d7fd1a6f8ce89dde89291b4cca61adaa070','files':files}
        self.assertEqual(intro.sha(intro.canonical(manifest)),intro.B0_MANIFEST)
        self.write('/usr/local/lib/leetplus-compose/'+release+'/install-manifest.json',intro.canonical(manifest))

    def intro_gate_loss_case(self,loss,expected):
        self.real_b0_for_gate();self.complete_intro_without_receipt()
        packet=self.intro_finalize_packet()
        encoded=base64.b64encode(gzip.compress((HERE/'standalone-initial-intro.py').read_bytes(),mtime=0)).decode()
        receipt=intro.AUDITS+'/'+self.operation+'/receipt.json'
        wrapper=f"""import base64,gzip
scope={{'__name__':'captured_intro_fixture'}}
exec(compile(gzip.decompress(base64.b64decode({encoded!r})),'captured-intro-engine','exec'),scope)
Files=scope['NativeFiles']
class MappedFiles(Files):
 def __init__(self):super().__init__({str(self.base)!r})
 def publish(self,value,raw,mode):
  if value=={receipt!r} and {loss!r}=='before-receipt':raise OSError('fixture after intent')
  result=super().publish(value,raw,mode)
  if value=={receipt!r} and {loss!r}=='after-receipt':raise OSError('fixture after receipt')
  return result
Engine=scope['InitialIntro']
class MappedEngine(Engine):
 def __init__(self,**kwargs):super().__init__(node={self.node!r},**kwargs)
scope['NativeFiles']=MappedFiles
scope['InitialIntro']=MappedEngine
scope['main']()
""".encode()
        plan=packet['finalizePlan'];plan['execution']['code']['introProgramSha256']=intro.sha(wrapper)
        packet['finalizeApprovalEnvelope']=self.sign(self.approval(plan,intro.FINALIZE_APPROVAL))
        gate=(HERE/'standalone-initial-intro-finalize-entry.mjs').read_bytes()
        def run(read_only):
            argument='--reconcile-finalize' if read_only else '--operation-id'
            operation=self.operation if read_only else plan['operationId']
            prelude=f"""import fsFixture from 'node:fs';
const fixtureRoot={json.dumps(str(self.base))};const remap=p=>typeof p==='string'&&p.startsWith('/')&&!p.startsWith(fixtureRoot+'/')&&p!==fixtureRoot?fixtureRoot+p:p;
for(const name of ['lstatSync','openSync','readFileSync','readdirSync']){{const orig=fsFixture[name];fsFixture[name]=function(p,...a){{return orig.call(this,remap(p),...a);}};}}
const originalRealpath=fsFixture.realpathSync.native;fsFixture.realpathSync.native=function(p,...a){{return originalRealpath.call(this,remap(p),...a).slice(fixtureRoot.length);}};
process.argv=['/usr/bin/node',{json.dumps(argument)},{json.dumps(operation)},{json.dumps(intro.sha(gate))}];
""".encode()
            outer={'packet':packet,'introPythonSourceBase64':base64.b64encode(wrapper).decode()}
            return subprocess.run([self.node,'--input-type=module','-e',(prelude+gate).decode()],
                input=intro.canonical(outer),capture_output=True,env=intro.CLEAN,timeout=30,check=False)
        effect=run(False)
        self.assertNotEqual(effect.returncode,0)
        self.assertFalse(self.files.absent(intro.STATE+'/'+self.operation+'.standalone-intro-finalize.intent.json'),
                         effect.stderr.decode())
        before={str(p.relative_to(self.base)):intro.sha(p.read_bytes()) for p in self.base.rglob('*')
                if p.is_file() and not p.is_symlink()}
        readonly=run(True);self.assertEqual(readonly.returncode,0,readonly.stderr.decode())
        self.assertEqual(json.loads(readonly.stdout)['decision'],expected)
        after={str(p.relative_to(self.base)):intro.sha(p.read_bytes()) for p in self.base.rglob('*')
               if p.is_file() and not p.is_symlink()}
        self.assertEqual(before,after)

    def test_actual_intro_gate_loss_after_intent_is_read_only_hold(self):
        self.intro_gate_loss_case('before-receipt','INTRO_FINALIZE_INTENT_ONLY_HOLD')

    def test_actual_intro_gate_loss_after_receipt_is_read_only_terminal(self):
        self.intro_gate_loss_case('after-receipt','EXACT_INTRO_FINALIZE_TERMINAL')

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
            def create_approved_directories(self,plan,before_write=None):
                raise OSError('fixture crash after durable intent')
        engine=self.engine_for(FailAfterIntent(self.base))
        with self.assertRaises(OSError):engine.apply(self.operation)
        self.assertFalse(self.files.absent(intro.STATE+'/'+self.operation+'.standalone-intro.intent.json'))
        with self.assertRaises(ValueError):self.engine.apply(self.operation)
        self.assertEqual(self.engine.reconcile(self.operation)['decision'],'INTRO_INTENT_OR_PARTIAL_HOLD')

    def test_loss_before_last_dormant_leaf_has_marker_but_cannot_finalize(self):
        class LoseLastLeaf(intro.NativeFiles):
            def publish(self,value,raw,mode):
                if value==intro.INSTALL_LOCK:raise OSError('fixture last leaf lost')
                return super().publish(value,raw,mode)
        with self.assertRaises(OSError):self.engine_for(LoseLastLeaf(self.base)).apply(self.operation)
        self.assertFalse(self.files.absent(intro.AUDITS+'/'+self.operation+'/receipt.pending.json'))
        self.assertEqual(self.engine.reconcile(self.operation)['decision'],'INTRO_PARTIAL_OR_CONTRADICTORY_HOLD')
        with self.assertRaises((ValueError,OSError)):self.intro_finalize_packet()

    def test_complete_intro_missing_terminal_uses_new_finalize_and_verifies(self):
        self.complete_intro_without_receipt()
        self.assertEqual(self.engine.reconcile(self.operation)['decision'],
            'EXACT_INTRO_POSTIMAGE_REQUIRES_SEPARATE_FINALIZE')
        packet=self.intro_finalize_packet()
        before={str(p.relative_to(self.base)):intro.sha(p.read_bytes())
                for p in self.base.rglob('*') if p.is_file() and not p.is_symlink()}
        result=self.engine.finalize(packet,packet['finalizePlan']['operationId'])
        self.assertEqual(result['decision'],'INTRO_AUDIT_RECEIPT_FINALIZED_ONLY')
        verified=self.verify_snapshot();self.assertEqual(verified.returncode,0,verified.stderr.decode())
        self.assertEqual(self.engine.reconcile_finalize(self.operation)['decision'],'EXACT_INTRO_FINALIZE_TERMINAL')
        self.assertEqual(len(set(str(p.relative_to(self.base)) for p in self.base.rglob('*')
                                 if p.is_file() and not p.is_symlink())-set(before)),2)
        for name,digest in before.items():self.assertEqual(intro.sha((self.base/name).read_bytes()),digest)

    def test_torn_marker_or_foreign_receipt_has_no_finalize_write(self):
        self.complete_intro_without_receipt();packet=self.intro_finalize_packet()
        marker=intro.AUDITS+'/'+self.operation+'/receipt.pending.json'
        old=self.files.read(marker)
        self.files.p(marker).chmod(0o600);self.write(marker,b'{}\n')
        with self.assertRaises(ValueError):self.engine.finalize(packet,packet['finalizePlan']['operationId'])
        self.assertTrue(self.files.absent(intro.STATE+'/'+self.operation+'.standalone-intro-finalize.intent.json'))
        self.files.p(marker).chmod(0o600);self.write(marker,old)
        self.write(intro.AUDITS+'/'+self.operation+'/receipt.json',b'{}\n')
        with self.assertRaises(ValueError):self.engine.finalize(packet,packet['finalizePlan']['operationId'])
        self.assertTrue(self.files.absent(intro.STATE+'/'+self.operation+'.standalone-intro-finalize.intent.json'))

    def test_approval_expires_after_lock_before_first_intent(self):
        valid=intro.utc_now();calls=iter((valid,valid,self.expires))
        with patch.object(intro,'utc_now',side_effect=lambda:next(calls)):
            with self.assertRaises(ValueError):self.engine.apply(self.operation)
        self.assertTrue(self.files.absent(intro.STATE+'/'+self.operation+'.standalone-intro.intent.json'))

    def test_expiry_during_crypto_blocks_first_payload_leaf(self):
        original=intro.validate_approval;valid=intro.utc_now();state={'calls':0,'expired':False}
        def delayed(*args,**kwargs):
            result=original(*args,**kwargs)
            state['calls']+=1
            if state['calls']==3:state['expired']=True
            return result
        with patch.object(intro,'validate_approval',side_effect=delayed),patch.object(intro,'utc_now',
                side_effect=lambda:self.expires if state['expired'] else valid):
            with self.assertRaises(ValueError):self.engine.apply(self.operation)
        payload=self.files.p(intro.GENERATIONS+'/.intro-'+self.operation+'.pending/payload')
        self.assertFalse(any(p.is_file() for p in payload.rglob('*')))

    def test_present_malformed_finalize_authority_rejected_by_both_consumers(self):
        flat=intro.STATE+'/'+self.plan['introTransportOperationId']+'.standalone-transport-finalize.intent.json'
        self.write(flat,b'{}\n')
        with self.assertRaises(ValueError):self.engine.prepare(self.operation)
        self.files.p(flat).unlink()
        self.engine.apply(self.operation)
        self.write(flat,b'{}\n')
        self.assertNotEqual(self.verify_snapshot().returncode,0)

    def test_valid_finalize_lineage_then_wrong_signature_rejected_by_both_consumers(self):
        flat,intent=self.finalized_transport_intent()
        self.write(flat,intro.canonical(intent))
        self.assertEqual(self.engine.prepare(self.operation)['decision'],'PREPARED_NOT_AUTHORIZATION')
        self.engine.apply(self.operation)
        verified=self.verify_snapshot()
        self.assertEqual(verified.returncode,0,verified.stderr.decode())
        intent['approvalEnvelope']['signature']='A'*86+'=='
        intent['approvalSha256']=intro.sha(intro.canonical(intent['approvalEnvelope']))
        self.files.p(flat).chmod(0o600);self.write(flat,intro.canonical(intent))
        with self.assertRaises(ValueError):self.engine._inputs(self.operation)
        self.assertNotEqual(self.verify_snapshot().returncode,0)

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
