"""Captured stdlib-only source transport and separately authorized finalization.

The dispatcher authenticates bytes/invocation before execution. No transported
code is executed. INTRO authorization is supplied in memory after transport.
"""
import argparse
import base64
import contextlib
import ctypes
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tarfile
import time

PLAN = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_V2_PLAN'
APPROVAL = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_V2_APPROVAL'
INTENT = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_V2_INTENT'
RECEIPT = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_V2_RECEIPT'
FINALIZE_PLAN = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_FINALIZE_V1_PLAN'
FINALIZE_APPROVAL = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_FINALIZE_V1_APPROVAL'
FINALIZE_INTENT = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_FINALIZE_V1_INTENT'
FINALIZE_ACTION = 'FINALIZE_EXACT_INITIAL_TRANSPORT_AUDIT_RECEIPT_ONLY'
STATE = '/var/lib/leetplus-compose'
AUDITS = STATE+'/standalone-intro-transports'
INBOX = '/srv/leetplus/production-control-inbox'
CONTROL_LOCK = STATE+'/control.lock'
ROOT_PEM = '/etc/leetplus-compose/approval-root.pem'
CLEAN = {'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C.UTF-8','LC_ALL':'C.UTF-8','TZ':'UTC'}
HASH = re.compile(r'[a-f0-9]{64}\Z')
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\Z')
RELEASE = re.compile(r'[a-f0-9]{40}\Z')
MAX_PACKET = 48*1024*1024
MAX_LEAF = 2*1024*1024
MAX_ARCHIVE = 16*1024*1024
MAX_PROGRAM = 65536
LOADER_SHA256 = 'a44a7637f5d4a89f7ab7084fc1a300c35727fe20b78e44ad4491fbba91191bff'
LINKS = ('hostIdentitySha256','sourceRelease','sourceArtifactId','sourceProducerRunId',
         'sourceProducerRunAttempt','sourceTransportSha256','sourceReceiptSha256',
         'sourceArchiveSha256','sourceRootManifestSha256','composeArtifactId',
         'composeTransportSha256','composeControlArchiveSha256','composeAdmissionSha256',
         'introEntrySha256','introProgramSha256')
PLAN_FIELDS = {'contract','operationId','action',*LINKS,'snapshotPath','snapshotSize',
               'snapshotMode','entrySnapshotPath','entrySnapshotSize','entrySnapshotMode',
               'effects','execution'}
EFFECTS = {'sourceSnapshotOnly':True,'targetExecution':False,'controllerPointerMutation':False,
           'applicationRestart':False,'systemdUnitMutation':False,'daemonReload':False,
           'dataMutation':False,'timerMutation':False,'workerGrantMutation':False,
           'providerEffect':False,'privateKeyTransport':False}
LEAVES = ('source.tar.gz','source-receipt.json','final-admission.json','docker-admission.json',
          'intro-entry.mjs','intro-program.py','transport-receipt.json')
PAYLOAD_LEAVES = LEAVES[:-1]
EXECUTION_FIELDS = {'code','invocation','host','predecessor','nativeControlLockIdentity',
                    'trustRoot','parentPreimages','leafPreimages','privateDirectories',
                    'destinations','generatedDestinations','limits','effects'}
LIMITS = {'archiveBytes':MAX_ARCHIVE,'leafBytes':MAX_LEAF,'authorizationBytes':131072,
          'packetBytes':MAX_PACKET,'transportProgramBytes':MAX_PROGRAM,
          'lockWaitSeconds':120,'totalSeconds':180}
FINALIZE_FIELDS = {'contract','operationId','action','hostIdentitySha256','bootId',
    'originalOperationId','originalPlanSha256','originalApprovalSha256',
    'originalIntentSha256','requestReceiptSha256','execution','effects'}
FINALIZE_EXECUTION_FIELDS = {'code','invocation','host','nativeControlLockIdentity',
    'trustRoot','auditDirectoryIdentity','requestDirectoryIdentity','destinations','limits','effects'}
FINALIZE_LIMITS = {'archiveBytes':MAX_ARCHIVE,'leafBytes':MAX_LEAF,'authorizationBytes':131072,
    'packetBytes':131072,'transportProgramBytes':MAX_PROGRAM,'lockWaitSeconds':120,'totalSeconds':180}
FINALIZE_EFFECTS = {'auditReceiptFinalizeOnly':True,'sourceSnapshotMutation':False,
    'targetExecution':False,'controllerPointerMutation':False,'applicationRestart':False,
    'systemdUnitMutation':False,'daemonReload':False,'dataMutation':False,
    'timerMutation':False,'workerGrantMutation':False,'providerEffect':False,'privateKeyTransport':False}
B0 = {'releaseSha':'b0cbf3a4f302b299762fa055f3bffe0376a91182',
      'manifestSha256':'f9bd049e7cc4c03f206c99c2bad92ae54b34deb28b4b6980abb1bc44432dfb75',
      'executorSha256':'48aa00c4f6d3148ee210901cd572c6b5a3b3600ad4d20e3551e326ee18fcda18',
      'installerSha256':'c41144f91a1cfdba3dc184a0afda5c6917fa512a9873b143b8c271edb433b9b4'}
SOURCE_FILES = (
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
VERIFY = """import crypto from 'node:crypto';import fs from 'node:fs';
const v=JSON.parse(fs.readFileSync(0,'utf8'));const k=crypto.createPublicKey(v.publicKey);
if(k.asymmetricKeyType!=='ed25519'||v.publicKey.includes('PRIVATE')||!crypto.verify(null,
Buffer.from(v.message,'base64'),k,Buffer.from(v.signature,'base64')))process.exit(1);
process.stdout.write('PASS');"""


def require(test,message):
    if not test:raise ValueError(message)


def canonical(value):return (json.dumps(value,indent=2,ensure_ascii=False,allow_nan=False)+'\n').encode()
def sha(raw):return hashlib.sha256(raw).hexdigest()
def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def instant(value):
    require(isinstance(value,str) and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z',value),'Canonical UTC required')
    result=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
    require(result.isoformat(timespec='milliseconds').replace('+00:00','Z')==value,'Invalid UTC')
    return result
def pairs(values):
    result={}
    for key,value in values:
        require(key not in result,'Duplicate JSON key');result[key]=value
    return result
def exact(raw,maximum=131072):
    require(isinstance(raw,bytes) and 0<len(raw)<=maximum,'JSON bound differs')
    value=json.loads(raw.decode('utf8'),object_pairs_hook=pairs,
                     parse_constant=lambda v:require(False,'Nonfinite JSON'))
    require(raw==canonical(value),'Noncanonical transport JSON');return value


def child_parent_death(expected_parent):
    """Called only in the single-threaded crypto child before exec."""
    require(ctypes.CDLL(None,use_errno=True).prctl(1,signal.SIGKILL,0,0,0)==0 and
            os.getppid()==expected_parent,'Crypto child parent-death fence failed')


def safe_relative(name):
    require(isinstance(name,str) and 0<len(name)<=4096 and name==os.path.normpath(name).replace('\\','/') and
            re.fullmatch(r'[A-Za-z0-9_.@+/-]+',name) and
            all(piece not in ('','.','..') for piece in name.split('/')),
            'Unsafe transport archive path')
    return name


def parse_source_archive(raw,expected_manifest):
    require(0<len(raw)<=MAX_ARCHIVE,'Bounded standalone source archive required')
    members={};total=0
    with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as tar:
        for info in tar:
            name=safe_relative(info.name)
            require(info.isfile() and not info.islnk() and not info.issym() and
                    info.mode==0o400 and info.uid==info.gid==info.mtime==0 and
                    not info.pax_headers and info.uname==info.gname=='' and
                    name not in members and 0<info.size<=MAX_LEAF,
                    'Standalone source archive member differs')
            stream=tar.extractfile(info);require(stream is not None,'Unreadable source archive member')
            value=stream.read(MAX_LEAF+1);require(len(value)==info.size,'Short source member')
            members[name]=value;total+=len(value)
            require(len(members)<=20 and total<=64*1024*1024,'Standalone source archive expands beyond bound')
    require(set(members)==set(SOURCE_FILES)|{'SHA256SUMS'} and
            sha(members['SHA256SUMS'])==expected_manifest,
            'Standalone source archive closure/manifest differs')
    text=members['SHA256SUMS'].decode('utf8')
    require(text.endswith('\n') and not text.endswith('\n\n'),'Noncanonical source manifest ending')
    rows={};prior=None
    for line in text[:-1].split('\n'):
        match=re.fullmatch(r'([a-f0-9]{64})  \./(.+)',line)
        require(match is not None,'Source manifest row differs')
        name=safe_relative(match.group(2))
        require(name not in rows and (prior is None or prior.encode()<name.encode()),
                'Source manifest order/duplicate differs')
        rows[name]=match.group(1);prior=name
    require(set(rows)==set(SOURCE_FILES) and all(sha(members[name])==digest for name,digest in rows.items()),
            'Standalone source full file map differs')
    return rows


def parse_compose_control(raw,expected_archive):
    require(0<len(raw)<=MAX_ARCHIVE and sha(raw)==expected_archive,
            'Exact Compose control archive differs')
    found={};total=0
    with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as tar:
        for info in tar:
            name=info.name.removeprefix('./')
            if info.isdir():
                require(name.rstrip('/') in ('deploy','deploy/leetplus-compose') or
                        name.startswith('deploy/leetplus-compose/'),
                        'Unexpected Compose archive directory')
                continue
            safe_relative(name)
            require(info.isfile() and not info.islnk() and not info.issym() and
                    name.startswith('deploy/leetplus-compose/') and name not in found and
                    0<=info.size<=MAX_LEAF,'Foreign/nonregular Compose source leaf')
            stream=tar.extractfile(info);require(stream is not None,'Unreadable Compose leaf')
            value=stream.read(MAX_LEAF+1);require(len(value)==info.size,'Short Compose leaf')
            found[name]=value;total+=len(value)
            require(len(found)<=256 and total<=64*1024*1024,'Compose archive expands beyond bound')
    require(len(found)>=2,'Missing protected introduction code')
    return found


def validate_code(code,entry_field):
    require(isinstance(code,dict) and set(code)=={entry_field,'transportProgramSha256','pythonLoaderSha256',
            'nodeExecutableSha256','nodeRealpath','pythonExecutableSha256','pythonRealpath'} and
            all(isinstance(code[name],str) and HASH.fullmatch(code[name]) for name in
                (entry_field,'transportProgramSha256','pythonLoaderSha256',
                 'nodeExecutableSha256','pythonExecutableSha256')) and
            code['pythonLoaderSha256']==LOADER_SHA256 and
            code['pythonRealpath'].startswith('/usr/bin/python3') and
            code['nodeRealpath'].startswith('/usr/bin/node'),'Closed captured code/tool map differs')


def validate_plan(plan):
    require(isinstance(plan,dict) and set(plan)==PLAN_FIELDS and plan['contract']==PLAN and
            plan['action']=='STAGE_SIGNED_INITIAL_INTRO_SOURCE_ONLY' and
            UUID.fullmatch(plan['operationId']) and RELEASE.fullmatch(plan['sourceRelease']) and
            plan['operationId']!='9afc7218-4757-4f44-87e1-6096706bad44','Invalid V2 transport identity')
    for name in LINKS:
        if name.endswith('Sha256'):require(isinstance(plan[name],str) and HASH.fullmatch(plan[name]),'Transport digest differs')
    for name in ('sourceArtifactId','sourceProducerRunId','sourceProducerRunAttempt','composeArtifactId'):
        require(type(plan[name]) is int and 0<plan[name]<=9007199254740991,'Transport producer identity differs')
    match=re.fullmatch(re.escape(INBOX)+r'/bootstrap-intro-('+UUID.pattern[:-2]+r')/intro-program.py',plan['snapshotPath'])
    require(match is not None,'Fixed intro request snapshot required')
    intro_operation=match.group(1)
    request=INBOX+'/bootstrap-intro-'+intro_operation
    require(intro_operation!=plan['operationId'] and
            plan['entrySnapshotPath']==request+'/intro-entry.mjs' and
            plan['snapshotMode']==plan['entrySnapshotMode']==0o400 and
            type(plan['snapshotSize']) is int and 0<plan['snapshotSize']<=MAX_LEAF and
            type(plan['entrySnapshotSize']) is int and 0<plan['entrySnapshotSize']<=MAX_LEAF and
            plan['effects']==EFFECTS and all(type(v) is bool for v in plan['effects'].values()),
            'Transport snapshot/effect scope differs')
    execution=plan['execution']
    require(isinstance(execution,dict) and set(execution)==EXECUTION_FIELDS,'Closed execution object required')
    validate_code(execution['code'],'transportEntrySha256')
    require(execution['invocation']=={'interpreter':'/usr/bin/python3','flags':['-I','-B','-c'],
                                     'mode':'memory-captured-python-c','action':'stage'},
            'Fixed transport invocation differs')
    require(execution['host']=={'hostIdentitySha256':plan['hostIdentitySha256'],
                               'bootId':execution['host'].get('bootId')} and
            UUID.fullmatch(execution['host']['bootId']),'Transport host/boot differs')
    require(execution['trustRoot']=={'path':ROOT_PEM,
                                     'rawSha256':execution['trustRoot'].get('rawSha256')} and
            isinstance(execution['trustRoot']['rawSha256'],str) and
            HASH.fullmatch(execution['trustRoot']['rawSha256']),
            'Deployment public root origin differs')
    old=execution['predecessor']
    require(isinstance(old,dict) and set(old)==set(B0)|{'corePointer','activeRecordSha256','handoffPointerSha256','pendingAbsent'} and
            all(old[name]==value for name,value in B0.items()) and
            old['corePointer']=='/usr/local/lib/leetplus-compose/'+B0['releaseSha']+'/control.sh' and
            HASH.fullmatch(old['activeRecordSha256']) and HASH.fullmatch(old['handoffPointerSha256']) and
            old['pendingAbsent'] is True,'Accepted predecessor preimage differs')
    lock=execution['nativeControlLockIdentity']
    require(isinstance(lock,dict) and set(lock)=={'path','device','inode','uid','gid','mode','ctimeNs'} and
            lock['path']==CONTROL_LOCK and lock['uid']==lock['gid']==0 and lock['mode']==0o600 and
            type(lock['device']) is int and type(lock['inode']) is int and lock['inode']>0 and
            isinstance(lock['ctimeNs'],str) and re.fullmatch(r'[1-9][0-9]{0,19}',lock['ctimeNs']),
            'Transport native lock identity differs')
    require(execution['limits']==LIMITS and execution['effects']==EFFECTS and
            set(execution['destinations'])==set(PAYLOAD_LEAVES), 'Transport limits/destination set differs')
    for name,value in execution['destinations'].items():
        require(isinstance(value,dict) and set(value)=={'sha256','bytes','uid','gid','mode'} and
                HASH.fullmatch(value['sha256']) and type(value['bytes']) is int and
                0<value['bytes']<=(MAX_ARCHIVE if name=='source.tar.gz' else MAX_LEAF) and
                value['uid']==value['gid']==0 and value['mode']==0o400,'Transport destination identity differs')
    absent={request,INBOX+'/.transport-'+plan['operationId']+'.pending',AUDITS+'/'+plan['operationId'],
            STATE+'/'+plan['operationId']+'.standalone-transport.intent.json'}
    require(execution['leafPreimages']=={name:'ABSENT' for name in sorted(absent)},'Transport leaf preimages differ')
    private={request,INBOX+'/.transport-'+plan['operationId']+'.pending',AUDITS+'/'+plan['operationId']}
    require(execution['privateDirectories']==
            {name:{'mode':0o700,'uid':0,'gid':0} for name in sorted(private)},
            'Transport private directory destinations differ')
    generated={
        STATE+'/'+plan['operationId']+'.standalone-transport.intent.json':'FLAT_INTENT',
        AUDITS+'/'+plan['operationId']+'/plan.json':'AUDIT_PLAN',
        AUDITS+'/'+plan['operationId']+'/approval.json':'AUDIT_APPROVAL',
        AUDITS+'/'+plan['operationId']+'/intent.json':'AUDIT_INTENT',
        AUDITS+'/'+plan['operationId']+'/receipt.json':'AUDIT_RECEIPT',
        request+'/transport-receipt.json':'REQUEST_RECEIPT',
    }
    require(execution['generatedDestinations']==
            {name:{'kind':kind,'mode':0o400,'uid':0,'gid':0} for name,kind in sorted(generated.items())},
            'Transport generated destination map differs')
    parents=execution['parentPreimages']
    require(isinstance(parents,dict) and set(parents)=={STATE,INBOX,AUDITS,'/srv/leetplus'},
            'Closed transport parent preimages required')
    for name,value in parents.items():
        require(isinstance(value,dict) and set(value)=={'state','device','inode','uid','gid','mode'} and
                value['uid']==0 and type(value['gid']) is int and type(value['mode']) is int and
                not value['mode']&0o022 and value['state'] in ('ABSENT','EXACT') and
                (value['state']=='EXACT' or name in (INBOX,AUDITS)), 'Transport parent identity differs')
        if value['state']=='ABSENT':require(value['device'] is None and value['inode'] is None and
                                          value['gid']==0 and value['mode']==0o700,'Absent parent scope differs')
        else:require(type(value['device']) is int and type(value['inode']) is int and value['inode']>0,
                     'Exact parent identity differs')
    return request


def validate_terminal_receipt(receipt,plan):
    keys={'contract','decision','operationId','planSha256','approvalSha256','intentSha256',
          *LINKS,'snapshotPath','snapshotDevice','snapshotInode','snapshotSize','snapshotMode',
          'snapshotUid','snapshotGid','entrySnapshotPath','entrySnapshotDevice','entrySnapshotInode',
          'entrySnapshotSize','entrySnapshotMode','entrySnapshotUid','entrySnapshotGid',
          'executionSha256','fullPostimageSha256','flatIntentSha256','parentPostimageSha256',
          'predecessorPostimageSha256','acceptedAt'}
    require(isinstance(receipt,dict) and set(receipt)==keys and receipt['contract']==RECEIPT and
            receipt['decision']=='PASS' and receipt['operationId']==plan['operationId'] and
            all(receipt[name]==plan[name] for name in LINKS),
            'Terminal V2 transport receipt key/identity differs')
    for name in keys:
        if name.endswith('Sha256'):require(isinstance(receipt[name],str) and HASH.fullmatch(receipt[name]),
                                         'Terminal transport digest differs')
    require(receipt['snapshotPath']==plan['snapshotPath'] and receipt['entrySnapshotPath']==plan['entrySnapshotPath'] and
            receipt['snapshotSize']==plan['snapshotSize'] and receipt['entrySnapshotSize']==plan['entrySnapshotSize'] and
            receipt['snapshotMode']==receipt['entrySnapshotMode']==0o400 and
            receipt['snapshotUid']==receipt['snapshotGid']==receipt['entrySnapshotUid']==receipt['entrySnapshotGid']==0 and
            all(type(receipt[name]) is int and receipt[name]>0 for name in
                ('snapshotDevice','snapshotInode','entrySnapshotDevice','entrySnapshotInode')),
            'Terminal transport snapshot identities differ')
    instant(receipt['acceptedAt'])
    return receipt


def validate_finalize_plan(plan):
    require(isinstance(plan,dict) and set(plan)==FINALIZE_FIELDS and
            plan['contract']==FINALIZE_PLAN and plan['action']==FINALIZE_ACTION and
            UUID.fullmatch(plan['operationId']) and UUID.fullmatch(plan['originalOperationId']) and
            plan['operationId']!=plan['originalOperationId'] and
            '9afc7218-4757-4f44-87e1-6096706bad44' not in
                (plan['operationId'],plan['originalOperationId']) and UUID.fullmatch(plan['bootId']),
            'Invalid separately scoped transport finalization identity')
    for name in ('hostIdentitySha256','originalPlanSha256','originalApprovalSha256',
                 'originalIntentSha256','requestReceiptSha256'):
        require(isinstance(plan[name],str) and HASH.fullmatch(plan[name]),'Finalization lineage digest differs')
    execution=plan['execution']
    require(isinstance(execution,dict) and set(execution)==FINALIZE_EXECUTION_FIELDS and
            plan['effects']==execution['effects']==FINALIZE_EFFECTS and
            execution['limits']==FINALIZE_LIMITS and
            execution['host']=={'hostIdentitySha256':plan['hostIdentitySha256'],'bootId':plan['bootId']} and
            execution['invocation']=={'interpreter':'/usr/bin/python3','flags':['-I','-B','-c'],
                'mode':'memory-captured-python-c','action':'finalize-reconcile'},
            'Closed finalization execution/effect scope differs')
    validate_code(execution['code'],'finalizeEntrySha256')
    trust=execution['trustRoot']
    require(isinstance(trust,dict) and set(trust)=={'path','rawSha256'} and
            trust['path']==ROOT_PEM and HASH.fullmatch(trust['rawSha256']),
            'Finalization inherited deployment root differs')
    lock=execution['nativeControlLockIdentity']
    require(isinstance(lock,dict) and set(lock)=={'path','device','inode','uid','gid','mode','ctimeNs'} and
            lock['path']==CONTROL_LOCK and lock['uid']==lock['gid']==0 and lock['mode']==0o600 and
            type(lock['device']) is int and type(lock['inode']) is int and lock['inode']>0 and
            isinstance(lock['ctimeNs'],str) and re.fullmatch(r'[1-9][0-9]{0,19}',lock['ctimeNs']),
            'Finalization native lock identity differs')
    for name in ('auditDirectoryIdentity','requestDirectoryIdentity'):
        value=execution[name]
        require(isinstance(value,dict) and set(value)=={'device','inode','uid','gid','mode'} and
                all(type(v) is int for v in value.values()) and value['device']>0 and value['inode']>0 and
                value['uid']==value['gid']==0 and value['mode']==0o700,
                'Finalization exact private directory identity differs')
    destinations=execution['destinations']
    # Key by the original operation, so another recovery UUID cannot bypass
    # an uncertain first finalize intent.
    flat=STATE+'/'+plan['originalOperationId']+'.standalone-transport-finalize.intent.json'
    audit=AUDITS+'/'+plan['originalOperationId']+'/receipt.json'
    require(isinstance(destinations,dict) and set(destinations)=={flat,audit} and
            destinations[flat]=={'kind':'FLAT_FINALIZE_INTENT','preimage':'ABSENT',
                                 'uid':0,'gid':0,'mode':0o400},
            'Finalization permits only a new flat intent and the original audit receipt')
    destination=destinations[audit]
    require(isinstance(destination,dict) and
            set(destination)=={'kind','preimage','sha256','bytes','uid','gid','mode'} and
            destination['kind']=='ORIGINAL_AUDIT_RECEIPT' and destination['preimage']=='ABSENT' and
            destination['sha256']==plan['requestReceiptSha256'] and
            type(destination['bytes']) is int and 0<destination['bytes']<=131072 and
            destination['uid']==destination['gid']==0 and destination['mode']==0o400,
            'Only the exact missing original audit receipt bytes may be finalized')
    return plan


def require_approval_time(approval,at):
    now=instant(at);start,end=instant(approval['issuedAt']),instant(approval['expiresAt'])
    require(start<=now<end and 0<(end-start).total_seconds()<=1800,
            'Transport approval expired or unbounded')


def verify_approval(plan,envelope,pem,node='/usr/bin/node',at=None,finalize=False):
    (validate_finalize_plan if finalize else validate_plan)(plan)
    require(isinstance(envelope,dict) and set(envelope)=={'approval','signature'},'Transport approval envelope differs')
    value=envelope['approval']
    require(isinstance(value,dict) and set(value)=={'contract','operationId','hostIdentitySha256','planSha256',
            'action','issuedAt','expiresAt'} and value['contract']==(FINALIZE_APPROVAL if finalize else APPROVAL) and
            value['operationId']==plan['operationId'] and value['hostIdentitySha256']==plan['hostIdentitySha256'] and
            value['planSha256']==sha(canonical(plan)) and value['action']==plan['action'],'Transport approval binding differs')
    require_approval_time(value,at or utc())
    require(isinstance(pem,bytes) and len(pem)<=4096 and b'PRIVATE' not in pem and
            re.fullmatch(r'[A-Za-z0-9+/]{86}==',envelope['signature']),'Transport public root/signature differs')
    payload={'publicKey':pem.decode('ascii'),'message':base64.b64encode(canonical(value)).decode(),
             'signature':envelope['signature']}
    parent_pid=os.getpid()
    result=subprocess.run([node,'--input-type=module','-e',VERIFY],input=canonical(payload),
                          stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=CLEAN,timeout=15,check=False,
                          preexec_fn=(lambda:child_parent_death(parent_pid)) if os.name=='posix' else None)
    require(result.returncode==0 and result.stdout==b'PASS' and not result.stderr,'Transport signature rejected')
    return value


class Transport:
    def __init__(self,fixture_prefix=None,node='/usr/bin/node',captured_program_sha256=None):
        require(os.name=='posix' and os.getuid()==0,'Linux root transport required')
        self.prefix=Path(fixture_prefix) if fixture_prefix is not None else None
        self.node=node
        self.captured_program_sha256=captured_program_sha256
    def p(self,value):
        require(value.startswith('/') and str(Path(value))==value and '..' not in Path(value).parts,'Fixed absolute path required')
        return self.prefix/value.lstrip('/') if self.prefix is not None else Path(value)
    def ancestors(self,value):
        for parent in reversed(self.p(value).parents):
            if self.prefix is not None and parent!=self.prefix and self.prefix not in parent.parents:continue
            st=parent.lstat();require(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,'Untrusted transport ancestor')
    def read(self,value,maximum=MAX_LEAF):
        self.ancestors(value);p=self.p(value);before=p.lstat()
        require(stat.S_ISREG(before.st_mode) and before.st_uid==before.st_gid==0 and before.st_nlink==1 and
                not before.st_mode&0o022 and 0<=before.st_size<=maximum,'Untrusted transport leaf')
        fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        try:
            opened=os.fstat(fd);identity=lambda s:(s.st_dev,s.st_ino,s.st_size,s.st_ctime_ns)
            require(identity(before)==identity(opened),'Transport leaf changed before capture')
            with os.fdopen(fd,'rb',closefd=False) as stream:raw=stream.read(maximum+1)
            require(len(raw)==opened.st_size and identity(opened)==identity(os.fstat(fd)) and
                    identity(opened)==identity(p.lstat()),'Transport leaf changed during capture')
            return raw
        finally:os.close(fd)
    def absent(self,value):
        try:self.p(value).lstat()
        except FileNotFoundError:return True
        return False
    def sync(self,value):
        fd=os.open(self.p(value),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:os.fsync(fd)
        finally:os.close(fd)
    def directory(self,value,mode):
        self.ancestors(value);require(self.absent(value),'Existing transport directory cannot be adopted')
        os.mkdir(self.p(value),mode);os.chown(self.p(value),0,0);os.chmod(self.p(value),mode)
        self.sync(value);self.sync(str(Path(value).parent))
    def write(self,value,raw,mode=0o400):
        self.ancestors(value);require(self.absent(value),'Transport cannot replace existing entry')
        fd=os.open(self.p(value),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
        try:
            os.fchown(fd,0,0);os.fchmod(fd,mode);offset=0
            while offset<len(raw):
                count=os.write(fd,raw[offset:]);require(count>0,'Short transport write');offset+=count
            os.fsync(fd)
        finally:os.close(fd)
        self.sync(str(Path(value).parent));require(self.read(value,max(MAX_LEAF,len(raw)))==raw,'Transport write/readback differs')
    def rename(self,old,new):
        self.ancestors(old);self.ancestors(new)
        call=ctypes.CDLL(None,use_errno=True).renameat2
        call.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint];call.restype=ctypes.c_int
        if call(-100,os.fsencode(self.p(old)),-100,os.fsencode(self.p(new)),1)!=0:
            error=ctypes.get_errno();raise OSError(error,os.strerror(error),new)
        self.sync(str(Path(new).parent))
    @contextlib.contextmanager
    def lock(self,expected):
        import fcntl
        self.ancestors(CONTROL_LOCK);fd=os.open(self.p(CONTROL_LOCK),os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        try:
            st=os.fstat(fd)
            require(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and
                    (st.st_dev,st.st_ino,st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode),str(st.st_ctime_ns))==
                    (expected['device'],expected['inode'],0,0,0o600,expected['ctimeNs']),'Transport native lock preimage drift')
            end=time.monotonic()+120
            while True:
                try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);break
                except BlockingIOError:require(time.monotonic()<end,'Transport native lock timed out');time.sleep(0.01)
            latest=self.p(CONTROL_LOCK).lstat()
            require((latest.st_dev,latest.st_ino,latest.st_ctime_ns)==(st.st_dev,st.st_ino,st.st_ctime_ns),'Native lock origin changed')
            yield
        finally:os.close(fd)
    def reject_mounts(self,plan):
        raw=self.p('/proc/self/mountinfo').read_bytes()
        require(0<len(raw)<=2*1024*1024 and raw.endswith(b'\n'),
                'Incomplete bounded mount inventory')
        targets=set(plan['execution']['parentPreimages'])|set(plan['execution']['leafPreimages'])
        targets|=set(plan['execution']['privateDirectories'])
        for line in raw.decode('utf8').splitlines():
            fields=line.split(' ')
            require(len(fields)>=7 and '-' in fields,'Malformed mount inventory')
            mount=fields[4]
            for old,new in ((r'\040',' '),(r'\011','\t'),(r'\012','\n'),(r'\134','\\')):
                mount=mount.replace(old,new)
            require(not any(mount==root or mount.startswith(root+'/') for root in targets),
                    'Nested or exact transport destination mount')
    def predecessor_postimage(self,plan):
        execution=plan['execution'];old=execution['predecessor']
        require(sha(self.read('/etc/machine-id',65536).strip())==execution['host']['hostIdentitySha256'] and
                self.p('/proc/sys/kernel/random/boot_id').read_text().strip()==execution['host']['bootId'],'Transport host/boot drift')
        link=self.p('/usr/local/sbin/leetplus-compose')
        require(link.is_symlink() and link.lstat().st_uid==0 and os.readlink(link)==old['corePointer'],'Transport serving pointer drift')
        root='/usr/local/lib/leetplus-compose/'+B0['releaseSha']
        manifest_raw=self.read(root+'/install-manifest.json',65536)
        manifest=exact(manifest_raw,65536)
        require(sha(manifest_raw)==B0['manifestSha256'] and
                manifest.get('releaseSha')==B0['releaseSha'] and
                isinstance(manifest.get('files'),dict) and
                {p.name for p in self.p(root).iterdir()}==set(manifest['files'])|{'install-manifest.json'} and
                all(re.fullmatch(r'[A-Za-z0-9_.@-]+',name) and HASH.fullmatch(expected) and
                    sha(self.read(root+'/'+name))==expected for name,expected in manifest['files'].items()) and
                sha(self.read(root+'/control_handoff.py'))==B0['executorSha256'] and
                sha(self.read(root+'/install-control.py'))==B0['installerSha256'] and
                sha(self.read(STATE+'/active.json',65536))==old['activeRecordSha256'] and
                sha(self.read(STATE+'/control-handoffs/active.json',65536))==old['handoffPointerSha256'] and
                self.absent(STATE+'/control-handoff.pending.json'),'Transport accepted predecessor state drift')
        return sha(canonical({'corePointer':old['corePointer'],
            'manifestSha256':old['manifestSha256'],
            'activeRecordSha256':old['activeRecordSha256'],
            'handoffPointerSha256':old['handoffPointerSha256'],
            'pendingAbsent':True}))
    def preimage(self,plan):
        predecessor_sha=self.predecessor_postimage(plan)
        execution=plan['execution']
        self.reject_mounts(plan)
        for name,expected in execution['parentPreimages'].items():
            if expected['state']=='ABSENT':require(self.absent(name),'Unexpected transport parent')
            else:
                st=self.p(name).lstat();require(stat.S_ISDIR(st.st_mode) and
                    (st.st_dev,st.st_ino,st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))==
                    (expected['device'],expected['inode'],expected['uid'],expected['gid'],expected['mode']),
                    'Transport parent identity drift')
        require(all(self.absent(name) for name in execution['leafPreimages']),'Existing transport state requires reconciliation')
        return predecessor_sha
    def parent_postimage(self,plan):
        result={}
        for name in sorted(plan['execution']['parentPreimages'],key=lambda value:value.encode()):
            st=self.p(name).lstat()
            require(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,
                    'Transport parent postimage differs')
            original=plan['execution']['parentPreimages'][name]
            if original['state']=='EXACT':
                require((st.st_dev,st.st_ino)==(original['device'],original['inode']),
                        'Previously installed parent changed identity')
            result[name]={'device':st.st_dev,'inode':st.st_ino,'uid':st.st_uid,
                          'gid':st.st_gid,'mode':stat.S_IMODE(st.st_mode)}
        return result
    def check_tools(self,code):
        for logical,expected_realpath,expected_sha in (
            ('/usr/bin/node',code['nodeRealpath'],code['nodeExecutableSha256']),
            ('/usr/bin/python3',code['pythonRealpath'],code['pythonExecutableSha256'])):
            real=os.path.realpath(self.p(logical))
            if self.prefix is not None:
                require(real.startswith(str(self.prefix)+'/'),'Fixture executable escaped private root')
                actual='/'+str(Path(real).relative_to(self.prefix)).replace('\\','/')
            else:actual=real
            require(actual==expected_realpath and sha(self.read(actual,128*1024*1024))==expected_sha,
                    'Signed fixed interpreter bytes differ')

    def stage(self,packet,expected_operation):
        require(isinstance(packet,dict) and set(packet)=={'plan','approvalEnvelope','files',
                'composeControlArchiveBase64','sourceArtifactMetadata','composeArtifactMetadata'},
                'Closed transport packet required')
        plan,envelope=packet['plan'],packet['approvalEnvelope'];request=validate_plan(plan)
        require(plan['operationId']==expected_operation,
                'Protected operator command differs from signed transport operation')
        require(self.captured_program_sha256==plan['execution']['code']['transportProgramSha256'],
                'Protected captured transport program differs from signed execution')
        require(isinstance(packet['files'],dict) and set(packet['files'])==set(PAYLOAD_LEAVES),'Transport packet leaf closure differs')
        captured={}
        for name,value in packet['files'].items():
            require(isinstance(value,str) and len(value)<=((MAX_ARCHIVE if name=='source.tar.gz' else MAX_LEAF)+2)//3*4,
                    'Transport encoded input bound differs')
            raw=base64.b64decode(value,validate=True);expected=plan['execution']['destinations'][name]
            require(base64.b64encode(raw).decode()==value and len(raw)==expected['bytes'] and
                    sha(raw)==expected['sha256'],'Captured transport leaf differs from signed map')
            captured[name]=raw
        require(sha(captured['intro-entry.mjs'])==plan['introEntrySha256'] and
                sha(captured['intro-program.py'])==plan['introProgramSha256'] and
                sha(captured['source.tar.gz'])==plan['sourceArchiveSha256'] and
                sha(captured['source-receipt.json'])==plan['sourceReceiptSha256'] and
                sha(captured['docker-admission.json'])==plan['composeAdmissionSha256'],'Transport byte lineage differs')
        source_map=parse_source_archive(captured['source.tar.gz'],plan['sourceRootManifestSha256'])
        control_encoded=packet['composeControlArchiveBase64']
        require(isinstance(control_encoded,str) and len(control_encoded)<=((MAX_ARCHIVE+2)//3)*4,
                'Compose control archive input exceeds bound')
        control_raw=base64.b64decode(control_encoded,validate=True)
        require(base64.b64encode(control_raw).decode()==control_encoded,
                'Noncanonical Compose archive transfer encoding')
        control=parse_compose_control(control_raw,plan['composeControlArchiveSha256'])
        require(control.get('deploy/leetplus-compose/standalone-initial-intro-entry.mjs')==
                captured['intro-entry.mjs'] and
                control.get('deploy/leetplus-compose/standalone-initial-intro.py')==
                captured['intro-program.py'],
                'Protected introduction code is not exact admitted Compose source')
        source=exact(captured['source-receipt.json'])
        require(source.get('contract')=='LEETPLUS_STANDALONE_INITIAL_SOURCE_V1' and
                source.get('decision')=='SOURCE_BYTES_ONLY_NOT_AUTHORIZATION' and
                source.get('repository')=='boozik3412/leetplus' and source.get('sourceRelease')==plan['sourceRelease'] and
                source.get('workflow')=='transition-bootstrap-validation.yml' and
                isinstance(source.get('sourceTreeSha'),str) and RELEASE.fullmatch(source['sourceTreeSha']) and
                source.get('event')=='push' and source.get('ref')=='refs/heads/main' and
                source.get('runId')==str(plan['sourceProducerRunId']) and source.get('runAttempt')==plan['sourceProducerRunAttempt'] and
                source.get('sourceArchiveSha256')==plan['sourceArchiveSha256'] and
                source.get('generationRootManifestSha256')==plan['sourceRootManifestSha256'] and
                source.get('sourceFiles')==source_map and source.get('fileCount')==19 and
                source.get('generationSourceMapSha256')==sha(canonical(source_map)),
                'Transport source producer lineage differs')
        final=exact(captured['final-admission.json']);compose=exact(captured['docker-admission.json'])
        require(final.get('schemaVersion')==2 and final.get('admission')=='PASS' and final.get('releaseSha')==plan['sourceRelease'] and
                final.get('repository')=='boozik3412/leetplus' and final.get('effectiveLane')=='L2_SCHEMA_SECURITY' and
                final.get('workflowSha')==plan['sourceRelease'] and
                final.get('workflowRef')=='boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main' and
                compose.get('contract')=='LEETPLUS_COMPOSE_BLUE_GREEN_V1_ADMISSION' and compose.get('decision')=='PASS' and
                compose.get('releaseSha')==plan['sourceRelease'] and compose.get('repository')=='boozik3412/leetplus' and
                compose.get('event')=='push' and compose.get('ref')=='refs/heads/main' and
                compose.get('parentAdmissionSha256')==sha(captured['final-admission.json']) and
                compose.get('effectiveLane')=='L2_SCHEMA_SECURITY' and
                compose.get('impactReceiptSha256')==final.get('impactReceiptSha256') and
                compose.get('controlArchiveSha256')==plan['composeControlArchiveSha256'],'Transport exact-main admission lineage differs')
        require(final.get('productionControlArtifactId') is not None and
                final.get('productionControlArchiveSha256') is not None and
                final.get('productionControlTransportDigest') is not None and
                compose.get('runId')==final.get('runId') and
                compose.get('parentRunAttempt')==final.get('runAttempt') and
                compose.get('runAttempt')==final.get('runAttempt') and
                final.get('workflowSha')==plan['sourceRelease'] and
                final.get('workflowRef')=='boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main',
                'Transport final/Compose producing authority differs')
        for label,meta,artifact_id,transport_digest,run,attempt,prefix in (
            ('source',packet['sourceArtifactMetadata'],plan['sourceArtifactId'],
             plan['sourceTransportSha256'],plan['sourceProducerRunId'],plan['sourceProducerRunAttempt'],
             'leetplus-standalone-intro-source-'),
            ('compose',packet['composeArtifactMetadata'],plan['composeArtifactId'],
             plan['composeTransportSha256'],int(final['runId']),int(final['runAttempt']),
             'leetplus-compose-admitted-')):
            require(isinstance(meta,dict) and meta.get('id')==artifact_id and
                    meta.get('digest')=='sha256:'+transport_digest and meta.get('expired') is False and
                    meta.get('name')==f'{prefix}{plan["sourceRelease"]}-{run}-{attempt}' and
                    meta.get('workflow_run',{}).get('id')==run and
                    meta.get('workflow_run',{}).get('head_sha')==plan['sourceRelease'] and
                    meta.get('workflow_run',{}).get('head_branch')=='main',
                    f'Foreign {label} producer artifact metadata')
        self.check_tools(plan['execution']['code'])
        pem=self.read(ROOT_PEM,4096);verify_approval(plan,envelope,pem,node=self.node)
        require(sha(pem)==plan['execution']['trustRoot']['rawSha256'],
                'Signed existing deployment-root raw bytes differ')
        with self.lock(plan['execution']['nativeControlLockIdentity']):
            predecessor_sha=self.preimage(plan)
            verified=verify_approval(plan,envelope,pem,node=self.node)
            # Exact time fence follows the last crypto child and lock wait.
            now=utc();require_approval_time(verified,now)
            intent={'contract':INTENT,'operationId':plan['operationId'],'planSha256':sha(canonical(plan)),
                             'approvalSha256':sha(canonical(envelope)),'authorizedAt':now}
            require_approval_time(verified,utc())
            self.write(STATE+'/'+plan['operationId']+'.standalone-transport.intent.json',canonical(intent))
            for name,expected in sorted(plan['execution']['parentPreimages'].items(),key=lambda item:(item[0].count('/'),item[0])):
                if expected['state']=='ABSENT':
                    require_approval_time(verified,utc());self.directory(name,expected['mode'])
            audit=AUDITS+'/'+plan['operationId']
            require_approval_time(verified,utc());self.directory(audit,0o700)
            for name,value in (('plan.json',plan),('approval.json',envelope),('intent.json',intent)):
                require_approval_time(verified,utc())
                self.write(audit+'/'+name,canonical(value))
            staging=INBOX+'/.transport-'+plan['operationId']+'.pending'
            require_approval_time(verified,utc());self.directory(staging,0o700)
            for name,raw in sorted(captured.items()):
                verified=verify_approval(plan,envelope,pem,node=self.node)
                require_approval_time(verified,utc());self.write(staging+'/'+name,raw)
            program=self.p(staging+'/intro-program.py').stat();entry=self.p(staging+'/intro-entry.mjs').stat()
            require(self.predecessor_postimage(plan)==predecessor_sha,
                    'Predecessor changed before source publication')
            verified=verify_approval(plan,envelope,pem,node=self.node)
            require_approval_time(verified,utc())
            self.rename(staging,request)
            require({p.name for p in self.p(request).iterdir()}==set(PAYLOAD_LEAVES),
                    'Published source snapshot closure differs')
            for name,raw in captured.items():
                require(self.read(request+'/'+name,MAX_ARCHIVE if name=='source.tar.gz' else MAX_LEAF)==raw,
                        'Published source snapshot drift')
            require(self.predecessor_postimage(plan)==predecessor_sha,
                    'Predecessor changed during source publication')
            accepted=utc();verified=verify_approval(plan,envelope,pem,node=self.node,at=accepted)
            postimage={name:{'sha256':sha(raw),'bytes':len(raw),'mode':0o400,'uid':0,'gid':0}
                       for name,raw in sorted(captured.items())}
            parent_postimage=self.parent_postimage(plan)
            receipt={'contract':RECEIPT,'decision':'PASS','operationId':plan['operationId'],
                'planSha256':sha(canonical(plan)),'approvalSha256':sha(canonical(envelope)),
                'intentSha256':sha(canonical(intent)),**{name:plan[name] for name in LINKS},
                'snapshotPath':plan['snapshotPath'],'snapshotDevice':program.st_dev,'snapshotInode':program.st_ino,
                'snapshotSize':program.st_size,'snapshotMode':0o400,'snapshotUid':0,'snapshotGid':0,
                'entrySnapshotPath':plan['entrySnapshotPath'],'entrySnapshotDevice':entry.st_dev,'entrySnapshotInode':entry.st_ino,
                'entrySnapshotSize':entry.st_size,'entrySnapshotMode':0o400,'entrySnapshotUid':0,'entrySnapshotGid':0,
                'executionSha256':sha(canonical(plan['execution'])),'fullPostimageSha256':sha(canonical(postimage)),
                'flatIntentSha256':sha(canonical(intent)),
                'parentPostimageSha256':sha(canonical(parent_postimage)),
                'predecessorPostimageSha256':predecessor_sha,
                'acceptedAt':accepted}
            validate_terminal_receipt(receipt,plan)
            require_approval_time(verified,utc())
            self.write(request+'/transport-receipt.json',canonical(receipt))
            require({p.name for p in self.p(request).iterdir()}==set(LEAVES),
                    'Terminal transport snapshot closure differs')
            verified=verify_approval(plan,envelope,pem,node=self.node)
            require_approval_time(verified,utc())
            self.write(audit+'/receipt.json',canonical(receipt))
            return {'decision':'SOURCE_SNAPSHOT_STAGED_NOT_EXECUTED','operationId':plan['operationId'],
                    'transportReceiptSha256':sha(canonical(receipt)),'requestPath':request}
    def historical_terminal(self,operation,*,require_audit,require_current_predecessor=False):
        """Read every original timely byte and entire immutable postimage; no writes."""
        require(UUID.fullmatch(operation),'Exact transport UUID required')
        audit=AUDITS+'/'+operation
        raw_plan=self.read(audit+'/plan.json',131072)
        raw_approval=self.read(audit+'/approval.json',131072)
        raw_intent=self.read(audit+'/intent.json',131072)
        plan=exact(raw_plan);envelope=exact(raw_approval);intent=exact(raw_intent)
        request=validate_plan(plan)
        self.private_tree(audit,{'plan.json','approval.json','intent.json'}|
                          ({'receipt.json'} if require_audit else set()))
        self.private_tree(request,set(LEAVES))
        raw=self.read(request+'/transport-receipt.json',131072);receipt=exact(raw)
        validate_terminal_receipt(receipt,plan)
        require(plan['operationId']==operation and receipt.get('decision')=='PASS' and
                receipt.get('planSha256')==sha(raw_plan) and
                receipt.get('approvalSha256')==sha(raw_approval) and
                receipt.get('intentSha256')==sha(raw_intent) and
                receipt.get('flatIntentSha256')==sha(raw_intent) and
                self.read(STATE+'/'+operation+'.standalone-transport.intent.json',131072)==raw_intent and
                intent=={'contract':INTENT,'operationId':operation,
                    'planSha256':sha(raw_plan),'approvalSha256':sha(raw_approval),
                    'authorizedAt':intent.get('authorizedAt')},
                'Terminal transport historical lineage differs')
        pem=self.read(ROOT_PEM,4096)
        require(sha(pem)==plan['execution']['trustRoot']['rawSha256'],
                'Historical transport deployment root differs')
        verify_approval(plan,envelope,pem,node=self.node,at=intent['authorizedAt'])
        verify_approval(plan,envelope,pem,node=self.node,at=receipt['acceptedAt'])
        require(instant(intent['authorizedAt'])<=instant(receipt['acceptedAt']),
                'Transport acceptance predates intent')
        require(str(Path(receipt['snapshotPath']).parent)==request,
                'Terminal transport request destination differs')
        require({p.name for p in self.p(request).iterdir()}==set(LEAVES) and
                self.read(request+'/transport-receipt.json',131072)==raw,'Terminal snapshot/receipt differs')
        require(self.absent(INBOX+'/.transport-'+operation+'.pending'),
                'Terminal transport has contradictory staging residue')
        postimage={}
        for name,expected in sorted(plan['execution']['destinations'].items()):
            data=self.read(request+'/'+name,MAX_ARCHIVE if name=='source.tar.gz' else MAX_LEAF)
            info=self.p(request+'/'+name).lstat()
            require(sha(data)==expected['sha256'] and len(data)==expected['bytes'] and
                    stat.S_IMODE(info.st_mode)==0o400,
                    'Terminal transport source bytes or mode differ')
            postimage[name]={'sha256':sha(data),'bytes':len(data),'mode':0o400,'uid':0,'gid':0}
        expected_predecessor=sha(canonical({'corePointer':plan['execution']['predecessor']['corePointer'],
            'manifestSha256':plan['execution']['predecessor']['manifestSha256'],
            'activeRecordSha256':plan['execution']['predecessor']['activeRecordSha256'],
            'handoffPointerSha256':plan['execution']['predecessor']['handoffPointerSha256'],
            'pendingAbsent':True}))
        require(receipt.get('fullPostimageSha256')==sha(canonical(postimage)) and
                receipt.get('executionSha256')==sha(canonical(plan['execution'])) and
                receipt.get('parentPostimageSha256')==sha(canonical(self.parent_postimage(plan))) and
                receipt.get('predecessorPostimageSha256')==expected_predecessor,
                'Terminal transport full postimage differs')
        parse_source_archive(self.read(request+'/source.tar.gz',MAX_ARCHIVE),plan['sourceRootManifestSha256'])
        if require_current_predecessor:
            require(self.predecessor_postimage(plan)==expected_predecessor,
                    'Current predecessor differs before separate finalization')
        for prefix,name in (('snapshot','intro-program.py'),('entrySnapshot','intro-entry.mjs')):
            info=self.p(request+'/'+name).lstat()
            require((info.st_dev,info.st_ino,info.st_size,info.st_uid,info.st_gid,stat.S_IMODE(info.st_mode))==
                    (receipt[prefix+'Device'],receipt[prefix+'Inode'],receipt[prefix+'Size'],0,0,0o400),
                    'Terminal transport protected snapshot inode differs')
        audit_receipt=audit+'/receipt.json'
        if require_audit:
            require(self.read(audit_receipt,131072)==raw,'Terminal transport audit/request receipt contradiction')
        else:require(self.absent(audit_receipt),'Audit receipt already present; no finalize effect')
        return {'plan':plan,'envelope':envelope,'intent':intent,'receipt':receipt,
            'receiptRaw':raw,'requestPath':request,'auditPath':audit,
            'planRaw':raw_plan,'approvalRaw':raw_approval,'intentRaw':raw_intent}

    def reconcile(self,operation):
        require(UUID.fullmatch(operation),'Exact transport UUID required')
        audit_receipt=AUDITS+'/'+operation+'/receipt.json'
        try:request_receipt=self._request_receipt_path(operation)
        except (OSError,ValueError,KeyError,TypeError) as error:
            return {'decision':'RECOVERY_REQUIRED_PARTIAL','operationId':operation,
                    'reason':str(error)[:200]}
        if self.absent(request_receipt):
            return {'decision':('RECOVERY_REQUIRED_CONTRADICTORY' if not self.absent(audit_receipt)
                    else 'RECOVERY_REQUIRED_PARTIAL'),'operationId':operation,
                    'reason':'No complete request terminal receipt; original operation cannot replay'}
        try:
            terminal=self.historical_terminal(operation,require_audit=not self.absent(audit_receipt))
        except (OSError,ValueError,KeyError,TypeError) as error:
            return {'decision':'RECOVERY_REQUIRED_CONTRADICTORY','operationId':operation,
                    'reason':str(error)[:200]}
        if self.absent(audit_receipt):
            return {'decision':'COMPLETE_REQUEST_MISSING_AUDIT_RECEIPT_REQUIRES_SEPARATE_FINALIZE',
                    'operationId':operation,'transportReceiptSha256':sha(terminal['receiptRaw'])}
        return {'decision':'EXACT_TERMINAL_TRANSPORT_REQUIRES_INDEPENDENT_VERIFICATION',
                'operationId':operation,'transportReceiptSha256':sha(terminal['receiptRaw'])}

    def _request_receipt_path(self,operation):
        raw_plan=self.read(AUDITS+'/'+operation+'/plan.json',131072)
        plan=exact(raw_plan)
        require(plan.get('operationId')==operation,'Historical transport plan operation differs')
        return validate_plan(plan).rstrip('/')+'/transport-receipt.json'

    def private_tree(self,name,names):
        self.ancestors(name);st=self.p(name).lstat()
        require(stat.S_ISDIR(st.st_mode) and (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))==(0,0,0o700)
                and {p.name for p in self.p(name).iterdir()}==names,'Private terminal directory closure differs')
        for leaf in names:
            info=self.p(name+'/'+leaf).lstat()
            require(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and
                    (info.st_uid,info.st_gid,stat.S_IMODE(info.st_mode))==(0,0,0o400),
                    'Private terminal leaf metadata differs')

    def _private_identity(self,name,expected):
        self.ancestors(name)
        st=self.p(name).lstat()
        require(stat.S_ISDIR(st.st_mode) and
                (st.st_dev,st.st_ino,st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))==
                tuple(expected[key] for key in ('device','inode','uid','gid','mode')),
                'Finalization private directory identity drift')

    def finalize_reconcile(self,packet,expected_operation):
        require(isinstance(packet,dict) and set(packet)=={'finalizePlan','finalizeApprovalEnvelope'},
                'Closed separately authorized finalization packet required')
        plan,envelope=packet['finalizePlan'],packet['finalizeApprovalEnvelope']
        validate_finalize_plan(plan)
        require(plan['operationId']==expected_operation and
                self.captured_program_sha256==plan['execution']['code']['transportProgramSha256'],
                'Protected finalization command/source differs')
        execution=plan['execution'];self.check_tools(execution['code'])
        pem=self.read(ROOT_PEM,4096)
        require(sha(pem)==execution['trustRoot']['rawSha256'],
                'Finalization inherited public root raw bytes differ')
        verify_approval(plan,envelope,pem,node=self.node,finalize=True)
        with self.lock(execution['nativeControlLockIdentity']):
            require(sha(self.read('/etc/machine-id',65536).strip())==plan['hostIdentitySha256'] and
                    self.p('/proc/sys/kernel/random/boot_id').read_text().strip()==plan['bootId'],
                    'Finalization host/boot drift')
            terminal=self.historical_terminal(plan['originalOperationId'],require_audit=False,
                                              require_current_predecessor=True)
            self._match_finalize_lineage(plan,terminal)
            flat=STATE+'/'+plan['originalOperationId']+'.standalone-transport-finalize.intent.json'
            require(self.absent(flat),'Existing finalization intent requires read-only reconciliation')
            self._private_identity(terminal['auditPath'],execution['auditDirectoryIdentity'])
            self._private_identity(terminal['requestPath'],execution['requestDirectoryIdentity'])
            verified=verify_approval(plan,envelope,pem,node=self.node,finalize=True)
            authorized=utc();require_approval_time(verified,authorized)
            intent={'contract':FINALIZE_INTENT,'operationId':expected_operation,
                'originalOperationId':plan['originalOperationId'],
                'planSha256':sha(canonical(plan)),'approvalSha256':sha(canonical(envelope)),
                'requestReceiptSha256':plan['requestReceiptSha256'],'authorizedAt':authorized,
                'plan':plan,'approvalEnvelope':envelope}
            require_approval_time(verified,utc())
            self.write(flat,canonical(intent))
            # Recheck original evidence; an interrupted intent cannot replay.
            terminal=self.historical_terminal(plan['originalOperationId'],require_audit=False,
                                              require_current_predecessor=True)
            self._match_finalize_lineage(plan,terminal)
            verified=verify_approval(plan,envelope,pem,node=self.node,finalize=True)
            self._private_identity(terminal['auditPath'],execution['auditDirectoryIdentity'])
            self._private_identity(terminal['requestPath'],execution['requestDirectoryIdentity'])
            require_approval_time(verified,utc())
            self.write(terminal['auditPath']+'/receipt.json',terminal['receiptRaw'])
            self.historical_terminal(plan['originalOperationId'],require_audit=True,
                                     require_current_predecessor=True)
            accepted=utc()
            return {'decision':'EXACT_AUDIT_RECEIPT_FINALIZED_NOT_FORWARD_EXECUTED',
                'operationId':expected_operation,'originalOperationId':plan['originalOperationId'],
                'finalizePlanSha256':sha(canonical(plan)),
                'finalizeApprovalSha256':sha(canonical(envelope)),
                'finalizeIntentSha256':sha(canonical(intent)),
                'requestReceiptSha256':sha(terminal['receiptRaw']),
                'auditReceiptSha256':sha(self.read(terminal['auditPath']+'/receipt.json',131072)),
                'acceptedAt':accepted}

    def _match_finalize_lineage(self,plan,terminal):
        require(plan['originalPlanSha256']==sha(terminal['planRaw']) and
                plan['originalApprovalSha256']==sha(terminal['approvalRaw']) and
                plan['originalIntentSha256']==sha(terminal['intentRaw']) and
                plan['requestReceiptSha256']==sha(terminal['receiptRaw']) and
                plan['execution']['destinations'][terminal['auditPath']+'/receipt.json']['bytes']==
                len(terminal['receiptRaw']) and
                plan['execution']['nativeControlLockIdentity']==
                terminal['plan']['execution']['nativeControlLockIdentity'],
                'Original timely signed transport/full terminal lineage differs')

    def reconcile_finalize(self,operation):
        """Read-only classifier keyed by original UUID after lost output."""
        require(UUID.fullmatch(operation),'Exact original transport UUID required')
        flat=STATE+'/'+operation+'.standalone-transport-finalize.intent.json'
        if self.absent(flat):
            return {'decision':'NO_FINALIZATION_INTENT','operationId':operation}
        try:
            intent_raw=self.read(flat,131072);intent=exact(intent_raw)
            require(isinstance(intent,dict) and set(intent)=={'contract','operationId',
                'originalOperationId','planSha256','approvalSha256','requestReceiptSha256',
                'authorizedAt','plan','approvalEnvelope'} and
                intent['contract']==FINALIZE_INTENT and intent['originalOperationId']==operation,
                'Historical finalization intent differs')
            plan=validate_finalize_plan(intent['plan']);envelope=intent['approvalEnvelope']
            require(plan['operationId']==intent['operationId'] and
                intent['originalOperationId']==plan['originalOperationId'] and
                intent['planSha256']==sha(canonical(plan)) and
                intent['approvalSha256']==sha(canonical(envelope)) and
                intent['requestReceiptSha256']==plan['requestReceiptSha256'],
                'Historical finalization plan/approval binding differs')
            require(self.captured_program_sha256==plan['execution']['code']['transportProgramSha256'],
                    'Read-only finalization captured source differs')
            pem=self.read(ROOT_PEM,4096)
            require(sha(pem)==plan['execution']['trustRoot']['rawSha256'],
                    'Historical finalization public root differs')
            verify_approval(plan,envelope,pem,node=self.node,at=intent['authorizedAt'],finalize=True)
            terminal=self.historical_terminal(plan['originalOperationId'],
                require_audit=not self.absent(AUDITS+'/'+plan['originalOperationId']+'/receipt.json'))
            self._match_finalize_lineage(plan,terminal)
            present=not self.absent(terminal['auditPath']+'/receipt.json')
            return {'decision':('EXACT_FINALIZATION_TERMINAL_REQUIRES_INDEPENDENT_VERIFICATION'
                     if present else 'RECOVERY_REQUIRED_FINALIZE_INTENT_WITHOUT_AUDIT_RECEIPT'),
                    'operationId':plan['operationId'],'originalOperationId':operation,
                    'requestReceiptSha256':sha(terminal['receiptRaw']),
                    'finalizeIntentSha256':sha(intent_raw)}
        except (OSError,ValueError,KeyError,TypeError) as error:
            return {'decision':'RECOVERY_REQUIRED_CONTRADICTORY_FINALIZATION',
                    'operationId':operation,'reason':str(error)[:200]}


def main():
    require(os.name=='posix' and os.getuid()==0 and set(os.environ)<=set(CLEAN),'Fixed isolated Linux root invocation required')
    parser=argparse.ArgumentParser();parser.add_argument('--mode',
        choices=('stage','reconcile','finalize-reconcile','reconcile-finalize'),required=True)
    parser.add_argument('--operation-id',required=True)
    parser.add_argument('--captured-program-sha256');args=parser.parse_args()
    require(UUID.fullmatch(args.operation_id),'Exact protected transport operation UUID required')
    def expired(signum,frame):raise TimeoutError('Transport deadline exceeded; reconcile only')
    signal.signal(signal.SIGALRM,expired);signal.alarm(180)
    try:
        if args.mode in ('stage','finalize-reconcile','reconcile-finalize'):
            require(isinstance(args.captured_program_sha256,str) and HASH.fullmatch(args.captured_program_sha256),
                    'Protected captured transport source digest required')
        else:
            require(args.captured_program_sha256 is None,
                    'Read-only transport reconciliation takes no new source authorization')
        target=Transport(captured_program_sha256=args.captured_program_sha256)
        if args.mode=='stage':
            raw=sys.stdin.buffer.read(MAX_PACKET+1);require(len(raw)<=MAX_PACKET,'Transport packet too large')
            value=target.stage(exact(raw,MAX_PACKET),args.operation_id)
        elif args.mode=='finalize-reconcile':
            raw=sys.stdin.buffer.read(131073);require(len(raw)<=131072,'Finalization packet too large')
            value=target.finalize_reconcile(exact(raw,131072),args.operation_id)
        elif args.mode=='reconcile-finalize':value=target.reconcile_finalize(args.operation_id)
        else:value=target.reconcile(args.operation_id)
        sys.stdout.buffer.write(canonical(value))
    finally:signal.alarm(0)


if __name__=='__main__':main()
