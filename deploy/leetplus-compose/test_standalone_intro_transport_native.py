"""Disposable Linux-root first source placement and recovery fixture."""
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
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('pure_transport_fixture',HERE/'test_standalone_intro_transport.py')
pure=importlib.util.module_from_spec(spec);spec.loader.exec_module(pure)
t=pure.transport


@unittest.skipUnless(os.name=='posix' and hasattr(os,'getuid') and os.getuid()==0,
                     'Disposable Linux root fixture required')
class NativeTransport(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='leetplus-first-transport-')
        self.base=Path(self.temp.name);self.base.chmod(0o700)
        self.node=shutil.which('node');self.assertIsNotNone(self.node)
        self.plan=pure.plan_fixture()
        self.operation=self.plan['operationId']
        self.fixture=t.Transport(self.base,node=self.node,
            captured_program_sha256=t.sha((HERE/'standalone-intro-transport.py').read_bytes()))
        for directory in (t.STATE,'/srv/leetplus','/etc/leetplus-compose','/usr/local/sbin',
                          '/usr/local/lib/leetplus-compose/'+t.B0['releaseSha'],
                          '/proc/self','/proc/sys/kernel/random','/usr/bin',
                          t.STATE+'/control-handoffs'):
            self.directory(directory,0o700)
        immutable='b0cbf3a4f302b299762fa055f3bffe0376a91182'
        repo=HERE.parents[1]
        inventory=subprocess.run(['git','--no-replace-objects','-C',str(repo),'ls-tree','-r','--name-only',
            immutable,'--','deploy/leetplus-compose'],capture_output=True,check=True,timeout=30).stdout.decode().splitlines()
        self.assertEqual(len(inventory),99)
        filemap={}
        for source in inventory:
            raw=subprocess.run(['git','--no-replace-objects','-C',str(repo),'show',immutable+':'+source],
                capture_output=True,check=True,timeout=30).stdout
            leaf=source.removeprefix('deploy/leetplus-compose/')
            filemap[leaf]=t.sha(raw)
            self.write('/usr/local/lib/leetplus-compose/'+immutable+'/'+leaf,raw)
        b0manifest={'contract':'LEETPLUS_COMPOSE_BLUE_GREEN_V1_INSTALL','releaseSha':immutable,
            'admissionSha256':'8302b0e73e38aecf419f78c469018d7fd1a6f8ce89dde89291b4cca61adaa070',
            'files':filemap}
        self.assertEqual(t.sha(t.canonical(b0manifest)),t.B0['manifestSha256'])
        self.write('/usr/local/lib/leetplus-compose/'+immutable+'/install-manifest.json',
                   t.canonical(b0manifest))
        self.write('/etc/machine-id',b'fixture-machine\n')
        self.write('/proc/sys/kernel/random/boot_id',self.plan['execution']['host']['bootId'].encode()+b'\n')
        self.write('/proc/self/mountinfo',b'1 1 0:0 / / rw - ext4 /dev/fixture rw\n')
        self.write(t.STATE+'/active.json',b'{"generation":10}\n')
        self.write(t.STATE+'/control-handoffs/active.json',b'{"operation":"historical"}\n')
        self.fixture.p('/usr/local/sbin/leetplus-compose').symlink_to(
            self.plan['execution']['predecessor']['corePointer'])
        self.write(t.CONTROL_LOCK,b'',0o600)
        self.write('/usr/bin/node',b'fixture node executable')
        self.write('/usr/bin/python3',b'fixture python executable')
        self.plan['hostIdentitySha256']=t.sha(b'fixture-machine')
        self.plan['execution']['host']['hostIdentitySha256']=self.plan['hostIdentitySha256']
        old=self.plan['execution']['predecessor']
        old['activeRecordSha256']=t.sha(self.fixture.read(t.STATE+'/active.json'))
        old['handoffPointerSha256']=t.sha(self.fixture.read(t.STATE+'/control-handoffs/active.json'))
        st=self.fixture.p(t.CONTROL_LOCK).stat()
        self.plan['execution']['nativeControlLockIdentity'].update({
            'device':st.st_dev,'inode':st.st_ino,'ctimeNs':str(st.st_ctime_ns)})
        code=self.plan['execution']['code']
        code.update({'transportProgramSha256':self.fixture.captured_program_sha256,
                     'nodeExecutableSha256':t.sha(self.fixture.read('/usr/bin/node')),
                     'pythonExecutableSha256':t.sha(self.fixture.read('/usr/bin/python3')),
                     'nodeRealpath':'/usr/bin/node','pythonRealpath':'/usr/bin/python3'})
        for name in self.plan['execution']['parentPreimages']:
            if self.fixture.absent(name):
                self.plan['execution']['parentPreimages'][name]={
                    'state':'ABSENT','device':None,'inode':None,'uid':0,'gid':0,'mode':0o700}
            else:
                info=self.fixture.p(name).stat()
                self.plan['execution']['parentPreimages'][name]={
                    'state':'EXACT','device':info.st_dev,'inode':info.st_ino,
                    'uid':info.st_uid,'gid':info.st_gid,'mode':stat.S_IMODE(info.st_mode)}
        # Ephemeral signing key never leaves the child process; fixture stores
        # only the public PEM and two bounded signatures.
        signer="""import crypto from 'node:crypto';import readline from 'node:readline';
const k=crypto.generateKeyPairSync('ed25519');const rl=readline.createInterface({input:process.stdin});
process.stdout.write(JSON.stringify({publicPem:k.publicKey.export({format:'pem',type:'spki'})})+'\\n');
rl.on('line',line=>{const v=JSON.parse(line);process.stdout.write(JSON.stringify({signature:
crypto.sign(null,Buffer.from(JSON.stringify(v,null,2)+'\\n'),k.privateKey).toString('base64')})+'\\n');});"""
        self.signer=subprocess.Popen([self.node,'--input-type=module','-e',signer],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        self.pem=json.loads(self.signer.stdout.readline())['publicPem'].encode()
        self.write(t.ROOT_PEM,self.pem)
        self.plan['execution']['trustRoot']['rawSha256']=t.sha(self.pem)
        self.source_files={name:('fixture '+name+'\n').encode() for name in t.SOURCE_FILES}
        source_map={name:t.sha(self.source_files[name]) for name in sorted(self.source_files)}
        self.source_files['SHA256SUMS']=''.join(f'{value}  ./{name}\n' for name,value in source_map.items()).encode()
        source_archive=pure.archive(self.source_files)
        self.plan['sourceArchiveSha256']=t.sha(source_archive)
        self.plan['sourceRootManifestSha256']=t.sha(self.source_files['SHA256SUMS'])
        source_receipt={'contract':'LEETPLUS_STANDALONE_INITIAL_SOURCE_V1',
            'decision':'SOURCE_BYTES_ONLY_NOT_AUTHORIZATION','repository':'boozik3412/leetplus',
            'sourceRelease':self.plan['sourceRelease'],'sourceTreeSha':'2'*40,
            'workflow':'transition-bootstrap-validation.yml','event':'push','ref':'refs/heads/main',
            'runId':str(self.plan['sourceProducerRunId']),
            'runAttempt':self.plan['sourceProducerRunAttempt'],
            'sourceArchiveSha256':self.plan['sourceArchiveSha256'],
            'generationRootManifestSha256':self.plan['sourceRootManifestSha256'],
            'generationSourceMapSha256':t.sha(t.canonical(source_map)),
            'fileCount':19,'sourceFiles':source_map}
        self.plan['sourceReceiptSha256']=t.sha(t.canonical(source_receipt))
        entry=(HERE/'standalone-initial-intro-entry.mjs').read_bytes()
        program=(HERE/'standalone-initial-intro.py').read_bytes()
        self.plan['introEntrySha256']=t.sha(entry);self.plan['introProgramSha256']=t.sha(program)
        compose_archive=pure.archive({
            'deploy/leetplus-compose/standalone-initial-intro-entry.mjs':entry,
            'deploy/leetplus-compose/standalone-initial-intro.py':program})
        self.plan['composeControlArchiveSha256']=t.sha(compose_archive)
        final={'schemaVersion':2,'admission':'PASS','releaseSha':self.plan['sourceRelease'],
            'repository':'boozik3412/leetplus','effectiveLane':'L2_SCHEMA_SECURITY',
            'workflowSha':self.plan['sourceRelease'],
            'workflowRef':'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main',
            'runId':'19','runAttempt':'1','productionControlArtifactId':'21',
            'productionControlArchiveSha256':'3'*64,'productionControlTransportDigest':'4'*64,
            'impactReceiptSha256':'5'*64}
        compose={'contract':'LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION','decision':'PASS',
            'releaseSha':self.plan['sourceRelease'],'repository':'boozik3412/leetplus',
            'event':'push','ref':'refs/heads/main','runId':'19','runAttempt':'1',
            'parentAdmissionSha256':t.sha(t.canonical(final)),'parentRunAttempt':'1',
            'controlArchiveSha256':self.plan['composeControlArchiveSha256'],
            'effectiveLane':'L2_SCHEMA_SECURITY','impactReceiptSha256':'5'*64}
        self.plan['composeAdmissionSha256']=t.sha(t.canonical(compose))
        raw_files={'source.tar.gz':source_archive,'source-receipt.json':t.canonical(source_receipt),
                   'final-admission.json':t.canonical(final),'docker-admission.json':t.canonical(compose),
                   'intro-entry.mjs':entry,'intro-program.py':program}
        self.plan['snapshotSize']=len(program);self.plan['entrySnapshotSize']=len(entry)
        self.plan['execution']['destinations']={name:{'sha256':t.sha(raw),'bytes':len(raw),
            'uid':0,'gid':0,'mode':0o400} for name,raw in raw_files.items()}
        self.plan['execution']['code']['transportEntrySha256']='6'*64
        self.raw_files=raw_files
        self.compose_archive=compose_archive
        self.plan['sourceTransportSha256']='7'*64
        self.plan['composeTransportSha256']='8'*64
        metadata=lambda aid,sha_value,run,attempt,prefix:{'id':aid,'digest':'sha256:'+sha_value,
            'expired':False,'name':f'{prefix}{self.plan["sourceRelease"]}-{run}-{attempt}',
            'workflow_run':{'id':run,'head_sha':self.plan['sourceRelease'],'head_branch':'main'}}
        self.source_meta=metadata(self.plan['sourceArtifactId'],self.plan['sourceTransportSha256'],
            self.plan['sourceProducerRunId'],self.plan['sourceProducerRunAttempt'],
            'leetplus-standalone-intro-source-')
        self.compose_meta=metadata(self.plan['composeArtifactId'],self.plan['composeTransportSha256'],19,1,
            'leetplus-compose-admitted-')
        self.issued=(t.instant(t.utc())-t.datetime.timedelta(seconds=5)).isoformat(timespec='milliseconds').replace('+00:00','Z')
        self.expires=(t.instant(t.utc())+t.datetime.timedelta(minutes=10)).isoformat(timespec='milliseconds').replace('+00:00','Z')
        approval={'contract':t.APPROVAL,'operationId':self.operation,
            'hostIdentitySha256':self.plan['hostIdentitySha256'],
            'planSha256':t.sha(t.canonical(self.plan)),'action':self.plan['action'],
            'issuedAt':self.issued,'expiresAt':self.expires}
        self.signer.stdin.write(json.dumps(approval)+'\n');self.signer.stdin.flush()
        signature=json.loads(self.signer.stdout.readline())['signature']
        self.packet={'plan':self.plan,'approvalEnvelope':{'approval':approval,'signature':signature},
            'files':{name:base64.b64encode(raw).decode() for name,raw in raw_files.items()},
            'composeControlArchiveBase64':base64.b64encode(compose_archive).decode(),
            'sourceArtifactMetadata':self.source_meta,'composeArtifactMetadata':self.compose_meta}

    def tearDown(self):
        if getattr(self,'signer',None):
            self.signer.stdin.close();self.signer.wait(timeout=5)
            self.signer.stdout.close();self.signer.stderr.close()
        self.temp.cleanup()

    def directory(self,logical,mode):
        p=self.fixture.p(logical);p.mkdir(parents=True,exist_ok=True);p.chmod(mode)
    def write(self,logical,raw,mode=0o400):
        p=self.fixture.p(logical);p.parent.mkdir(parents=True,exist_ok=True)
        p.write_bytes(raw);p.chmod(mode)

    def finalize_packet(self,recovery='44444444-4444-4444-8444-444444444444'):
        original=self.operation
        audit=t.AUDITS+'/'+original
        request=str(Path(self.plan['snapshotPath']).parent)
        receipt=self.fixture.read(request+'/transport-receipt.json',131072)
        info=lambda name:{'device':self.fixture.p(name).stat().st_dev,
            'inode':self.fixture.p(name).stat().st_ino,'uid':0,'gid':0,'mode':0o700}
        code=copy.deepcopy(self.plan['execution']['code'])
        code['finalizeEntrySha256']=t.sha((HERE/'standalone-intro-transport-finalize-entry.mjs').read_bytes())
        code.pop('transportEntrySha256')
        destinations={t.STATE+'/'+original+'.standalone-transport-finalize.intent.json':
            {'kind':'FLAT_FINALIZE_INTENT','preimage':'ABSENT','uid':0,'gid':0,'mode':0o400},
            audit+'/receipt.json':{'kind':'ORIGINAL_AUDIT_RECEIPT','preimage':'ABSENT',
                'sha256':t.sha(receipt),'bytes':len(receipt),'uid':0,'gid':0,'mode':0o400}}
        plan={'contract':t.FINALIZE_PLAN,'operationId':recovery,'action':t.FINALIZE_ACTION,
            'hostIdentitySha256':self.plan['hostIdentitySha256'],
            'bootId':self.plan['execution']['host']['bootId'],'originalOperationId':original,
            'originalPlanSha256':t.sha(self.fixture.read(audit+'/plan.json',131072)),
            'originalApprovalSha256':t.sha(self.fixture.read(audit+'/approval.json',131072)),
            'originalIntentSha256':t.sha(self.fixture.read(audit+'/intent.json',131072)),
            'requestReceiptSha256':t.sha(receipt),'effects':copy.deepcopy(t.FINALIZE_EFFECTS),
            'execution':{'code':code,'invocation':{'interpreter':'/usr/bin/python3',
                'flags':['-I','-B','-c'],'mode':'memory-captured-python-c','action':'finalize-reconcile'},
                'host':{'hostIdentitySha256':self.plan['hostIdentitySha256'],
                        'bootId':self.plan['execution']['host']['bootId']},
                'nativeControlLockIdentity':copy.deepcopy(self.plan['execution']['nativeControlLockIdentity']),
                'trustRoot':{'path':t.ROOT_PEM,'rawSha256':t.sha(self.pem)},
                'auditDirectoryIdentity':info(audit),'requestDirectoryIdentity':info(request),
                'destinations':destinations,'limits':copy.deepcopy(t.FINALIZE_LIMITS),
                'effects':copy.deepcopy(t.FINALIZE_EFFECTS)}}
        approval={'contract':t.FINALIZE_APPROVAL,'operationId':recovery,
            'hostIdentitySha256':plan['hostIdentitySha256'],'planSha256':t.sha(t.canonical(plan)),
            'action':plan['action'],'issuedAt':self.issued,'expiresAt':self.expires}
        self.signer.stdin.write(json.dumps(approval)+'\n');self.signer.stdin.flush()
        envelope={'approval':approval,'signature':json.loads(self.signer.stdout.readline())['signature']}
        return {'finalizePlan':plan,'finalizeApprovalEnvelope':envelope}

    def test_signed_source_snapshot_publishes_only_seven_private_leaves(self):
        pre=set(self.base.rglob('*'))
        result=self.fixture.stage(copy.deepcopy(self.packet),self.operation)
        self.assertEqual(result['decision'],'SOURCE_SNAPSHOT_STAGED_NOT_EXECUTED')
        request=self.fixture.p(str(Path(self.plan['snapshotPath']).parent))
        self.assertEqual({p.name for p in request.iterdir()},set(t.LEAVES))
        self.assertFalse((request/'plan.json').exists());self.assertFalse((request/'approval.json').exists())
        self.assertEqual(self.fixture.read(t.STATE+'/active.json'),b'{"generation":10}\n')
        self.assertEqual(self.fixture.reconcile(self.operation)['decision'],
                         'EXACT_TERMINAL_TRANSPORT_REQUIRES_INDEPENDENT_VERIFICATION')
        self.assertNotEqual(pre,set(self.base.rglob('*')))

    def test_wrong_signature_or_program_hash_has_no_intent(self):
        for modify in (lambda p:p['approvalEnvelope'].__setitem__('signature',base64.b64encode(b'\0'*64).decode()),
                       lambda p:p['plan']['execution']['code'].__setitem__('transportProgramSha256','f'*64)):
            packet=copy.deepcopy(self.packet);modify(packet)
            with self.assertRaises(ValueError):self.fixture.stage(packet,self.operation)
            self.assertTrue(self.fixture.absent(t.STATE+'/'+self.operation+'.standalone-transport.intent.json'))

    def test_pending_or_foreign_destination_rejected_before_intent(self):
        self.fixture.p(t.STATE+'/control-handoff.pending.json').symlink_to('/missing/pending')
        with self.assertRaises(ValueError):self.fixture.stage(self.packet,self.operation)
        self.fixture.p(t.STATE+'/control-handoff.pending.json').unlink()
        request=str(Path(self.plan['snapshotPath']).parent)
        self.write(request+'/foreign',b'foreign')
        with self.assertRaises(ValueError):self.fixture.stage(self.packet,self.operation)
        self.assertTrue(self.fixture.absent(t.STATE+'/'+self.operation+'.standalone-transport.intent.json'))

    def test_partial_after_intent_requires_reconciliation_no_replay(self):
        class FailAfterIntent(t.Transport):
            def directory(self,value,mode):raise OSError('fixture crash after flat intent')
        partial=FailAfterIntent(self.base,node=self.node,
            captured_program_sha256=self.fixture.captured_program_sha256)
        with self.assertRaises(OSError):partial.stage(self.packet,self.operation)
        self.assertFalse(self.fixture.absent(t.STATE+'/'+self.operation+'.standalone-transport.intent.json'))
        with self.assertRaises(ValueError):self.fixture.stage(self.packet,self.operation)
        self.assertEqual(self.fixture.reconcile(self.operation)['decision'],'RECOVERY_REQUIRED_PARTIAL')

    def test_approval_expires_after_lock_before_first_intent(self):
        valid=t.utc();calls=iter((valid,valid,self.expires))
        with patch.object(t,'utc',side_effect=lambda:next(calls)):
            with self.assertRaises(ValueError):self.fixture.stage(self.packet,self.operation)
        self.assertTrue(self.fixture.absent(t.STATE+'/'+self.operation+'.standalone-transport.intent.json'))

    def test_exact_request_missing_audit_receipt_uses_separate_finalize(self):
        self.fixture.stage(self.packet,self.operation)
        audit=t.AUDITS+'/'+self.operation+'/receipt.json'
        original=self.fixture.read(audit,131072)
        self.fixture.p(audit).unlink()  # Simulate a crash between the two receipt writes.
        self.assertEqual(self.fixture.reconcile(self.operation)['decision'],
            'COMPLETE_REQUEST_MISSING_AUDIT_RECEIPT_REQUIRES_SEPARATE_FINALIZE')
        packet=self.finalize_packet()
        before=set(self.base.rglob('*'))
        result=self.fixture.finalize_reconcile(packet,packet['finalizePlan']['operationId'])
        self.assertEqual(result['decision'],'EXACT_AUDIT_RECEIPT_FINALIZED_NOT_FORWARD_EXECUTED')
        self.assertEqual(self.fixture.read(audit,131072),original)
        self.assertEqual(self.fixture.reconcile(self.operation)['decision'],
            'EXACT_TERMINAL_TRANSPORT_REQUIRES_INDEPENDENT_VERIFICATION')
        self.assertEqual(self.fixture.reconcile_finalize(self.operation)['decision'],
            'EXACT_FINALIZATION_TERMINAL_REQUIRES_INDEPENDENT_VERIFICATION')
        created=set(self.base.rglob('*'))-before
        self.assertEqual(created,{self.fixture.p(audit),
            self.fixture.p(t.STATE+'/'+self.operation+'.standalone-transport-finalize.intent.json')})

    def test_lost_finalize_response_never_replays_or_adopts_other_uuid(self):
        self.fixture.stage(self.packet,self.operation)
        audit=t.AUDITS+'/'+self.operation+'/receipt.json'
        self.fixture.p(audit).unlink()
        packet=self.finalize_packet()
        class LostAfterIntent(t.Transport):
            def write(self,value,raw,mode=0o400):
                if value==audit:raise OSError('fixture lost response after finalize intent')
                return super().write(value,raw,mode)
        target=LostAfterIntent(self.base,node=self.node,
            captured_program_sha256=self.fixture.captured_program_sha256)
        with self.assertRaises(OSError):target.finalize_reconcile(packet,packet['finalizePlan']['operationId'])
        self.assertEqual(self.fixture.reconcile_finalize(self.operation)['decision'],
            'RECOVERY_REQUIRED_FINALIZE_INTENT_WITHOUT_AUDIT_RECEIPT')
        with self.assertRaises(ValueError):
            self.fixture.finalize_reconcile(self.finalize_packet('55555555-5555-4555-8555-555555555555'),
                                            '55555555-5555-4555-8555-555555555555')
        self.assertTrue(self.fixture.absent(audit))

    def test_torn_request_receipt_blocks_finalize_without_intent(self):
        self.fixture.stage(self.packet,self.operation)
        audit=t.AUDITS+'/'+self.operation+'/receipt.json'
        self.fixture.p(audit).unlink()
        packet=self.finalize_packet()
        request=str(Path(self.plan['snapshotPath']).parent)
        receipt=request+'/transport-receipt.json'
        self.fixture.p(receipt).chmod(0o600)
        self.fixture.p(receipt).write_bytes(b'{}\n')
        self.fixture.p(receipt).chmod(0o400)
        self.assertEqual(self.fixture.reconcile(self.operation)['decision'],
            'RECOVERY_REQUIRED_CONTRADICTORY')
        with self.assertRaises(ValueError):
            self.fixture.finalize_reconcile(packet,packet['finalizePlan']['operationId'])
        self.assertTrue(self.fixture.absent(t.STATE+'/'+self.operation+'.standalone-transport-finalize.intent.json'))

    def test_replaced_native_lock_or_parent_blocks_before_intent(self):
        original=self.fixture.p(t.CONTROL_LOCK)
        retained=original.with_name(original.name+'.retained-original')
        original.rename(retained);self.write(t.CONTROL_LOCK,b'',0o600)
        self.assertNotEqual(retained.stat().st_ino,original.stat().st_ino)
        with self.assertRaises(ValueError):self.fixture.stage(self.packet,self.operation)
        self.assertTrue(self.fixture.absent(t.STATE+'/'+self.operation+'.standalone-transport.intent.json'))
        original.unlink();retained.rename(original)
        parent=self.fixture.p('/srv/leetplus')
        parent.chmod(0o777)
        with self.assertRaises(ValueError):self.fixture.stage(self.packet,self.operation)
        self.assertTrue(self.fixture.absent(t.STATE+'/'+self.operation+'.standalone-transport.intent.json'))


if __name__=='__main__':unittest.main()
