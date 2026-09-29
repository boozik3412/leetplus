"""Pure closed-contract checks for the signed initial transport V2."""
import base64
import copy
import gzip
import importlib.util
import io
import json
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('standalone_intro_transport', HERE/'standalone-intro-transport.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)


def plan_fixture():
    operation = '11111111-1111-4111-8111-111111111111'
    intro_operation = '22222222-2222-4222-8222-222222222222'
    request = transport.INBOX+'/bootstrap-intro-'+intro_operation
    links = {name: ('a'*64 if name.endswith('Sha256') else 1)
             for name in transport.LINKS}
    links['sourceRelease'] = '1'*40
    execution = {
        'code': {'transportEntrySha256':'0'*64,
                 'transportProgramSha256': 'a'*64, 'nodeExecutableSha256': 'b'*64,
                 'pythonLoaderSha256':transport.LOADER_SHA256,
                 'nodeRealpath': '/usr/bin/node', 'pythonExecutableSha256': 'c'*64,
                 'pythonRealpath': '/usr/bin/python3.12'},
        'invocation': {'interpreter': '/usr/bin/python3', 'flags': ['-I','-B','-c'],
                       'mode': 'memory-captured-python-c', 'action': 'stage'},
        'host': {'hostIdentitySha256': links['hostIdentitySha256'],
                 'bootId': '33333333-3333-4333-8333-333333333333'},
        'trustRoot': {'path':transport.ROOT_PEM,'rawSha256':'d'*64},
        'predecessor': {**transport.B0,
            'corePointer':'/usr/local/lib/leetplus-compose/'+transport.B0['releaseSha']+'/control.sh',
            'activeRecordSha256':'e'*64,'handoffPointerSha256':'f'*64,'pendingAbsent':True},
        'nativeControlLockIdentity': {'path':transport.CONTROL_LOCK,'device':1,'inode':2,
                                      'uid':0,'gid':0,'mode':0o600,'ctimeNs':'123456'},
        'parentPreimages': {name: {'state':'EXACT','device':1,'inode':i+3,
                                   'uid':0,'gid':0,'mode':0o700}
                            for i,name in enumerate((transport.STATE,transport.INBOX,
                                                      transport.AUDITS,'/srv/leetplus'))},
        'leafPreimages': {name:'ABSENT' for name in sorted({request,
            transport.INBOX+'/.transport-'+operation+'.pending',
            transport.AUDITS+'/'+operation,
            transport.STATE+'/'+operation+'.standalone-transport.intent.json'})},
        'privateDirectories': {name: {'mode':0o700,'uid':0,'gid':0}
             for name in sorted({request,transport.INBOX+'/.transport-'+operation+'.pending',
                                 transport.AUDITS+'/'+operation})},
        'destinations': {name: {'sha256':'a'*64,'bytes':1,'uid':0,'gid':0,'mode':0o400}
                         for name in transport.PAYLOAD_LEAVES},
        'generatedDestinations': {},
        'limits': copy.deepcopy(transport.LIMITS),
        'effects': copy.deepcopy(transport.EFFECTS),
    }
    generated={
        transport.STATE+'/'+operation+'.standalone-transport.intent.json':'FLAT_INTENT',
        transport.AUDITS+'/'+operation+'/plan.json':'AUDIT_PLAN',
        transport.AUDITS+'/'+operation+'/approval.json':'AUDIT_APPROVAL',
        transport.AUDITS+'/'+operation+'/intent.json':'AUDIT_INTENT',
        transport.AUDITS+'/'+operation+'/receipt.json':'AUDIT_RECEIPT',
        request+'/transport-receipt.json':'REQUEST_RECEIPT',
    }
    execution['generatedDestinations']={name:{'kind':kind,'mode':0o400,'uid':0,'gid':0}
                                        for name,kind in sorted(generated.items())}
    return {'contract':transport.PLAN,'operationId':operation,
        'action':'STAGE_SIGNED_INITIAL_INTRO_SOURCE_ONLY',**links,
        'snapshotPath':request+'/intro-program.py','snapshotSize':1,'snapshotMode':0o400,
        'entrySnapshotPath':request+'/intro-entry.mjs','entrySnapshotSize':1,
        'entrySnapshotMode':0o400,'effects':copy.deepcopy(transport.EFFECTS),'execution':execution}


def archive(files):
    memory=io.BytesIO()
    with tarfile.open(fileobj=memory,mode='w',format=tarfile.USTAR_FORMAT) as tar:
        for name in sorted(files):
            info=tarfile.TarInfo(name);info.size=len(files[name]);info.mode=0o400
            info.uid=info.gid=info.mtime=0;info.uname=info.gname=''
            tar.addfile(info,io.BytesIO(files[name]))
    return gzip.compress(memory.getvalue(),mtime=0)


class TransportPlan(unittest.TestCase):
    def test_closed_signed_v2_plan(self):
        plan=plan_fixture()
        self.assertTrue(transport.validate_plan(plan).endswith('/bootstrap-intro-'+
            '22222222-2222-4222-8222-222222222222'))

    def test_legacy_v1_or_missing_execution_rejected(self):
        for change in (lambda p:p.__setitem__('contract','LEETPLUS_STANDALONE_INTRO_TRANSPORT_V1_PLAN'),
                       lambda p:p.pop('execution'),
                       lambda p:p['execution'].__setitem__('optionalBypass',True)):
            plan=plan_fixture();change(plan)
            with self.assertRaises(ValueError):transport.validate_plan(plan)

    def test_wrong_code_root_native_lock_and_predecessor_rejected(self):
        changes=(lambda p:p['execution']['code'].__setitem__('transportProgramSha256','z'*64),
                 lambda p:p['execution']['trustRoot'].__setitem__('path','/tmp/root.pem'),
                 lambda p:p['execution']['nativeControlLockIdentity'].__setitem__('ctimeNs','0'),
                 lambda p:p['execution']['predecessor'].__setitem__('pendingAbsent',False),
                 lambda p:p['execution']['predecessor'].__setitem__('manifestSha256','b'*64))
        for change in changes:
            plan=plan_fixture();change(plan)
            with self.assertRaises(ValueError):transport.validate_plan(plan)

    def test_extra_effect_destination_and_wrong_limit_rejected(self):
        changes=(lambda p:p['effects'].__setitem__('daemonReload',True),
                 lambda p:p['execution']['effects'].__setitem__('providerEffect',True),
                 lambda p:p['execution']['destinations'].__setitem__('foreign.unit',{}),
                 lambda p:p['execution']['limits'].__setitem__('totalSeconds',999))
        for change in changes:
            plan=plan_fixture();change(plan)
            with self.assertRaises(ValueError):transport.validate_plan(plan)

    def test_unknown_preimage_or_request_path_rejected(self):
        plan=plan_fixture();plan['execution']['leafPreimages']['/etc/systemd/system/foreign.service']='ABSENT'
        with self.assertRaises(ValueError):transport.validate_plan(plan)
        plan=plan_fixture();plan['snapshotPath']='/tmp/intro-program.py'
        with self.assertRaises(ValueError):transport.validate_plan(plan)


class ArchiveBoundary(unittest.TestCase):
    def test_closed_19_source_map(self):
        values={name:('source '+name+'\n').encode() for name in transport.SOURCE_FILES}
        sums={name:transport.sha(values[name]) for name in sorted(values)}
        values['SHA256SUMS']=''.join(f'{digest}  ./{name}\n' for name,digest in sums.items()).encode()
        observed=transport.parse_source_archive(archive(values),transport.sha(values['SHA256SUMS']))
        self.assertEqual(observed,sums)
        values['deploy/transition-bootstrap/bundle_installer.py']=b'foreign privileged helper\n'
        with self.assertRaises(ValueError):transport.parse_source_archive(
            archive(values),transport.sha(values['SHA256SUMS']))

    def test_compose_code_identity_is_archive_bound(self):
        entries={'deploy/leetplus-compose/standalone-initial-intro-entry.mjs':b'entry source',
                 'deploy/leetplus-compose/standalone-initial-intro.py':b'python source'}
        raw=archive(entries)
        self.assertEqual(transport.parse_compose_control(raw,transport.sha(raw)),entries)
        with self.assertRaises(ValueError):transport.parse_compose_control(raw,'f'*64)

    def test_duplicate_or_noncanonical_json_rejected(self):
        for raw in (b'{"a": 1, "a": 2}\n',b'{"a":1}\n',b'\xef\xbb\xbf{}\n'):
            with self.assertRaises((ValueError,UnicodeError)):transport.exact(raw)


class PublicApproval(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.node=shutil.which('node')
        if not cls.node:raise unittest.SkipTest('Node crypto unavailable')
        cls.plan=plan_fixture()
        cls.approval={'contract':transport.APPROVAL,'operationId':cls.plan['operationId'],
            'hostIdentitySha256':cls.plan['hostIdentitySha256'],
            'planSha256':transport.sha(transport.canonical(cls.plan)),'action':cls.plan['action'],
            'issuedAt':'2026-01-01T00:00:00.000Z','expiresAt':'2026-01-01T00:10:00.000Z'}
        script="""import crypto from 'node:crypto';import fs from 'node:fs';
const a=JSON.parse(fs.readFileSync(0,'utf8'));const k=crypto.generateKeyPairSync('ed25519');
process.stdout.write(JSON.stringify({publicPem:k.publicKey.export({format:'pem',type:'spki'}),
signature:crypto.sign(null,Buffer.from(JSON.stringify(a,null,2)+'\\n'),k.privateKey).toString('base64')}));"""
        out=subprocess.run([cls.node,'--input-type=module','-e',script],
                           input=transport.canonical(cls.approval),capture_output=True,check=True)
        value=json.loads(out.stdout)
        cls.pem=value['publicPem'].encode()
        cls.envelope={'approval':cls.approval,'signature':value['signature']}

    def test_signature_valid_only_within_window(self):
        transport.verify_approval(self.plan,self.envelope,self.pem,node=self.node,
            at='2026-01-01T00:05:00.000Z')
        with self.assertRaises(ValueError):transport.verify_approval(
            self.plan,self.envelope,self.pem,node=self.node,at='2026-01-01T00:11:00.000Z')

    def test_wrong_signed_code_or_root_domain_rejected(self):
        plan=copy.deepcopy(self.plan);plan['execution']['code']['transportProgramSha256']='1'*64
        with self.assertRaises(ValueError):transport.verify_approval(
            plan,self.envelope,self.pem,node=self.node,at='2026-01-01T00:05:00.000Z')
        envelope=copy.deepcopy(self.envelope);envelope['approval']['contract']=transport.INTENT
        with self.assertRaises(ValueError):transport.verify_approval(
            self.plan,envelope,self.pem,node=self.node,at='2026-01-01T00:05:00.000Z')


if __name__=='__main__':unittest.main()
