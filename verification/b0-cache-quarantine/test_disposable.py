"""Exact frozen algorithm fixtures on a private logical filesystem, never host paths."""
import ast
import base64
import contextlib
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import types
import unittest

HERE=Path(__file__).resolve().parent
PINS={'executor.py':'03f05a24efb9205c9ffc3d6afd929ed33b2bacd8d43d588ea6f7c03ee69cc020',
      'gate.mjs':'6a18fb8465bd5b55eb66f65b1f51fc04ae18061fbfddaee6b8e56e5b1bce5de2',
      'reconcile.py':'c22d2b59e67b543b7206f725dffa4ba4a130aa403b2573344410803eb23ab70a'}
sha=lambda raw:hashlib.sha256(raw).hexdigest()
canonical=lambda v:(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n').encode()
OP='ac871cea-d06f-402c-b5c1-60f9c112784e'
B0='b0cbf3a4f302b299762fa055f3bffe0376a91182'
BRIDGE='bebeb41354da0dd04b218495cbbf5d75ba9f0a85'
ORIGIN='/usr/local/lib/leetplus-compose/'+B0+'/__pycache__'
DEST='/srv/leetplus-operations/b0-cache-quarantine-'+OP

def frozen(name):
    raw=(HERE/'frozen'/name).read_bytes()
    if sha(raw)!=PINS[name]:raise RuntimeError('Frozen source changed: '+name)
    return raw

def original_plan():
    tree=ast.parse(frozen('executor.py'))
    encoded=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign)
                 and isinstance(n.targets[0],ast.Name) and n.targets[0].id=='PLAN_B64')
    return json.loads(base64.b64decode(encoded))

class LogicalPath:
    """All Path syscalls map into one temp root; string identities stay logical."""
    def __init__(self,root,value):self.root=root;self.logical=PurePosixPath(str(value))
    def __str__(self):return str(self.logical)
    def __fspath__(self):return str(self.root/str(self.logical).lstrip('/'))
    def __truediv__(self,other):return LogicalPath(self.root,self.logical/other)
    @property
    def parent(self):return LogicalPath(self.root,self.logical.parent)
    @property
    def parents(self):return [LogicalPath(self.root,x) for x in self.logical.parents]
    @property
    def name(self):return self.logical.name
    def lstat(self):return os.lstat(os.fspath(self))
    def read_bytes(self):return Path(os.fspath(self)).read_bytes()
    def read_text(self):return Path(os.fspath(self)).read_text()
    def iterdir(self):return (self/x.name for x in Path(os.fspath(self)).iterdir())
    def resolve(self,strict=False):
        actual=Path(os.fspath(self)).resolve(strict=strict)
        return LogicalPath(self.root,'/'+str(actual.relative_to(self.root)))

@unittest.skipUnless(os.name=='posix' and os.geteuid()==0,'Dedicated disposable Linux root gate required')
class KernelCases(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for name in PINS:frozen(name)
        cls.node=shutil.which('node')
        if not cls.node:raise RuntimeError('Node required')
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='leetplus-quarantine-test-')
        self.root=Path(self.temp.name);self.root.chmod(0o700)
        self.plan=original_plan();self.plan['operationId']=OP
        for name in ('/usr/local/sbin','/usr/bin','/etc/leetplus-compose','/proc/sys/kernel/random',
                     '/var/lib/leetplus-compose/control-handoffs','/srv/leetplus-operations'):
            self.mkdir(name)
        self.write('/etc/machine-id',b'fixture-machine\n')
        self.write('/proc/sys/kernel/random/boot_id',self.plan['bootId'].encode()+b'\n')
        self.write('/proc/locks',b'')
        self.write('/var/lib/leetplus-compose/control.lock',b'',0o600)
        self.write('/var/lib/leetplus-compose/active.json',b'{"fixture":true}\n')
        self.write('/var/lib/leetplus-compose/control-handoffs/active.json',b'{"fixture":true}\n')
        self.plan['hostIdentitySha256']=sha(b'fixture-machine')
        self.plan['activeRecordSha256']=sha(b'{"fixture":true}\n')
        self.plan['handoffPointerSha256']=sha(b'{"fixture":true}\n')
        self.p('/usr/local/sbin/leetplus-compose').symlink_to('/usr/local/lib/leetplus-compose/'+B0+'/control.sh')
        self.p('/usr/local/sbin/leetplus-compose-backup').symlink_to(self.plan['backupObservation']['command']['target'])
        for release,count,key in ((B0,99,'acceptedInstall'),(BRIDGE,101,'stagedBridgeInstall')):
            folder='/usr/local/lib/leetplus-compose/'+release;self.mkdir(folder)
            values={('control.sh' if n==0 else f'f{n:03}.py'):('immutable-'+str(n)).encode() for n in range(count)}
            rows={name:sha(raw) for name,raw in values.items()}
            for name,raw in values.items():self.write(folder+'/'+name,raw)
            manifest={'contract':'LEETPLUS_COMPOSE_BLUE_GREEN_V1_INSTALL','releaseSha':release,
                      'admissionSha256':'a'*64,'files':rows}
            raw=canonical(manifest);self.write(folder+'/install-manifest.json',raw)
            self.plan[key]={'directoryIdentity':{},'fileCount':count,
                'fullFileMapSha256':sha(canonical(rows)),'manifestSha256':sha(raw)}
        self.mkdir(ORIGIN);self.write(ORIGIN+'/backup_crypto.cpython-314.pyc',b'fixture cache bytes',0o600)
        self.write('/usr/bin/python3.14',b'fixture Python bytes',0o755)
        self.p('/usr/bin/python3').symlink_to('python3.14')
        # Real Node bytes let the frozen reconciler execute its held /proc fd.
        shutil.copyfile(self.node,self.p('/usr/bin/node'));self.p('/usr/bin/node').chmod(0o755)
        self.plan['nodeInterpreter']['sha256']=sha(self.p('/usr/bin/node').read_bytes())
        self.plan['interpreter']['sha256']=sha(b'fixture Python bytes')
        self.key=subprocess.Popen([self.node,'--input-type=module','-e',
            "import crypto from 'node:crypto';import readline from 'node:readline';const k=crypto.generateKeyPairSync('ed25519');process.stdout.write(JSON.stringify({publicKey:k.publicKey.export({type:'spki',format:'pem'})})+'\\n');const r=readline.createInterface({input:process.stdin});r.on('line',v=>process.stdout.write(JSON.stringify({signature:crypto.sign(null,Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(v)).sort()),null,0)+'\\n'),k.privateKey).toString('base64')})+'\\n'));"],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        self.public=json.loads(self.key.stdout.readline())['publicKey'].encode()
        self.write('/etc/leetplus-compose/approval-root.pem',self.public)
        self.plan['publicRootSha256']=sha(self.public)
        self.now=dt.datetime.now(dt.timezone.utc)
        self.plan['notBeforeAt']=(self.now-dt.timedelta(seconds=2)).isoformat().replace('+00:00','Z')
        self.plan['expiresAt']=(self.now+dt.timedelta(minutes=10)).isoformat().replace('+00:00','Z')
        self.ns=self.namespace('executor.py')
        for key,path in (('sourceParent','/usr/local/lib/leetplus-compose/'+B0),
                         ('destinationParent','/srv/leetplus-operations'),('cacheDirectory',ORIGIN),
                         ('nativeControlLock','/var/lib/leetplus-compose/control.lock')):
            self.plan[key]=self.ns['meta'](self.logical(path))
        self.plan['cacheLeaf']={**self.ns['meta'](self.logical(ORIGIN+'/backup_crypto.cpython-314.pyc')),
            'sha256':sha(b'fixture cache bytes')}
        self.plan['servingPointer']={**self.ns['meta'](self.logical('/usr/local/sbin/leetplus-compose')),
            'target':os.readlink(self.p('/usr/local/sbin/leetplus-compose'))}
        self.refresh()
    def tearDown(self):
        signal.alarm(0)
        self.key.stdin.close();self.key.wait(timeout=5)
        self.key.stdout.close();self.key.stderr.close();self.temp.cleanup()
    def p(self,name):return self.root/name.lstrip('/')
    def logical(self,name):return LogicalPath(self.root,name)
    def mkdir(self,name):self.p(name).mkdir(parents=True,exist_ok=True);self.p(name).chmod(0o700)
    def write(self,name,raw,mode=0o400):self.p(name).parent.mkdir(parents=True,exist_ok=True);self.p(name).write_bytes(raw);self.p(name).chmod(mode)
    def map_os(self,name):
        if isinstance(name,str) and name.startswith('/') and not name.startswith('/proc/self/fd/'):
            return self.p(name)
        return name
    def namespace(self,name):
        ns={'__name__':'frozen_disposable_fixture'};exec(compile(frozen(name),name,'exec'),ns)
        proxy=types.SimpleNamespace(**{k:getattr(os,k) for k in dir(os)})
        proxy.open=lambda p,*a,**kw:os.open(self.map_os(p),*a,**kw)
        proxy.readlink=lambda p,*a,**kw:os.readlink(self.map_os(p),*a,**kw)
        proxy.stat=lambda p,*a,**kw:os.stat(self.map_os(p),*a,**kw)
        ns['os']=proxy;ns['pathlib']=types.SimpleNamespace(Path=self.logical)
        ns['timer_idle']=lambda plan:('fixture-only-service','fixture-only-timer')
        return ns
    def refresh(self):
        self.plan_raw=canonical(self.plan);self.plan_sha=sha(self.plan_raw)
        self.ns['PLAN_B64']=base64.b64encode(self.plan_raw).decode()
        self.approval={'contract':'LEETPLUS_B0_CACHE_QUARANTINE_APPROVAL_V1','operationId':OP,
            'planSha256':self.plan_sha,'executorSha256':PINS['executor.py'],
            'baselineSummarySha256':self.plan['baselineSummarySha256'],
            'hostIdentitySha256':self.plan['hostIdentitySha256'],'bootId':self.plan['bootId'],
            'effectOwnerThreadId':self.plan['effectOwnerThreadId'],'directUserGoReceiptSha256':'b'*64,
            'authorizedAt':self.now.isoformat(timespec='milliseconds').replace('+00:00','Z'),
            'expiresAt':self.plan['expiresAt']}
        self.key.stdin.write(json.dumps(self.approval)+'\n');self.key.stdin.flush()
        signature=json.loads(self.key.stdout.readline())['signature']
        self.signed={'approval':self.approval,'signatureBase64':signature}
    def sign(self,approval):
        self.key.stdin.write(json.dumps(approval)+'\n');self.key.stdin.flush()
        return {'approval':approval,'signatureBase64':json.loads(self.key.stdout.readline())['signature']}
    def node_gate(self,code=b"print('DISPOSABLE_GATE_PASS')\n",approval=None,pin_change=None):
        original=frozen('gate.mjs').decode()
        match=re.search(r'^const PIN = (\{.*\});$',original,re.M)
        self.assertIsNotNone(match)
        pin=json.loads(match.group(1))
        pin.update(operationId=OP,planSha256=self.plan_sha,executorSha256=sha(code),
                   baselineSummarySha256=self.plan['baselineSummarySha256'],
                   hostIdentitySha256=self.plan['hostIdentitySha256'],bootId=self.plan['bootId'],
                   publicRootBase64=base64.b64encode(self.public).decode(),
                   publicRootSha256=sha(self.public),
                   pythonRealpath=str(Path('/usr/bin/python3').resolve()),
                   pythonSha256=sha(Path('/usr/bin/python3').resolve().read_bytes()),
                   planExpiresAt=self.plan['expiresAt'])
        if pin_change:pin_change(pin)
        gate=original.replace(match.group(0),'const PIN = '+json.dumps(pin,separators=(',',':'))+';')
        gate=gate.replace("'/etc/leetplus-compose/approval-root.pem'",
                          json.dumps(str(self.p('/etc/leetplus-compose/approval-root.pem'))))
        assert gate!=original
        signed=approval or self.sign({**self.approval,'executorSha256':sha(code)})
        packet={'approval':signed['approval'],'signatureBase64':signed['signatureBase64'],
                'capturedPythonBase64':base64.b64encode(code).decode()}
        return subprocess.run([self.node,'--input-type=module','-e',gate],input=canonical(packet),
            capture_output=True,timeout=20,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C.UTF-8',
                                                  'LC_ALL':'C.UTF-8','TZ':'UTC'})
    def test_protected_gate_ephemeral_signature_allows_only_captured_buffer(self):
        result=self.node_gate()
        self.assertEqual(result.returncode,0,result.stderr.decode())
        self.assertIn(b'DISPOSABLE_GATE_PASS',result.stdout)
    def test_gate_rejects_wrong_go_signature_expiry_and_interpreter(self):
        safe=b"print('SAFE')\n"
        signed=self.sign({**self.approval,'executorSha256':sha(safe)})
        altered=json.loads(json.dumps(signed));altered['approval']['directUserGoReceiptSha256']='0'*64
        self.assertNotEqual(self.node_gate(safe,approval=altered).returncode,0)
        old=(self.now-dt.timedelta(seconds=1)).isoformat(timespec='milliseconds').replace('+00:00','Z')
        expired=self.sign({**self.approval,'executorSha256':sha(safe),'expiresAt':old})
        self.assertNotEqual(self.node_gate(safe,approval=expired).returncode,0)
        self.assertNotEqual(self.node_gate(safe,pin_change=lambda p:p.__setitem__('pythonSha256','0'*64)).returncode,0)
        self.assertFalse(self.p(DEST+'.intent.json').exists())
    def effect(self):
        signed=base64.b64encode(canonical(self.signed)).decode()
        self.ns['sys']=types.SimpleNamespace(flags=sys.flags,dont_write_bytecode=sys.dont_write_bytecode,
            argv=['fixture','--effect',self.plan_sha,'b'*64,signed,str(os.getppid())])
        out=io.StringIO()
        try:
            with contextlib.redirect_stdout(out):self.ns['main']()
        finally:signal.alarm(0)
        return json.loads(out.getvalue())
    def reconcile(self):
        ns=self.namespace('reconcile.py');ns['PLAN_B64']=base64.b64encode(self.plan_raw).decode()
        ns['sys']=types.SimpleNamespace(flags=sys.flags,dont_write_bytecode=sys.dont_write_bytecode,
            argv=['fixture','--reconcile',self.plan_sha])
        out=io.StringIO()
        with contextlib.redirect_stdout(out):ns['main']()
        return json.loads(out.getvalue())
    def test_exact_frozen_sources_and_atomic_directory_inode_preservation(self):
        inode=self.p(ORIGIN).stat().st_ino;leaf=self.p(ORIGIN+'/backup_crypto.cpython-314.pyc').stat().st_ino
        self.assertEqual(self.effect()['decision'],'EXACT_CACHE_QUARANTINED_NO_DELETION')
        self.assertFalse(self.p(ORIGIN).exists());self.assertEqual(self.p(DEST).stat().st_ino,inode)
        self.assertEqual(self.p(DEST+'/backup_crypto.cpython-314.pyc').stat().st_ino,leaf)
        self.assertEqual(self.reconcile()['decision'],'TERMINAL_EXACT_QUARANTINED')
    def test_foreign_destination_no_replace_no_intent(self):
        self.mkdir(DEST)
        with self.assertRaises(RuntimeError):self.effect()
        self.assertTrue(self.p(ORIGIN).exists());self.assertFalse(self.p(DEST+'.intent.json').exists())
    def test_wrong_cache_bytes_no_effect(self):
        self.write(ORIGIN+'/backup_crypto.cpython-314.pyc',b'altered',0o600)
        with self.assertRaises(RuntimeError):self.effect()
        self.assertFalse(self.p(DEST+'.intent.json').exists())
    def test_hardlink_and_symlink_cache_rejected(self):
        path=self.p(ORIGIN+'/backup_crypto.cpython-314.pyc')
        os.link(path,self.p('/extra-hardlink'))
        with self.assertRaises(RuntimeError):self.effect()
        self.p('/extra-hardlink').unlink();path.unlink();path.symlink_to('/untrusted')
        with self.assertRaises(RuntimeError):self.effect()
        self.assertFalse(self.p(DEST+'.intent.json').exists())
    def test_wrong_interpreter_hash_no_intent(self):
        self.plan['interpreter']['sha256']='0'*64;self.refresh()
        with self.assertRaises(RuntimeError):self.effect()
        self.assertFalse(self.p(DEST+'.intent.json').exists())
    def test_expired_plan_and_preexisting_intent_no_move(self):
        self.plan['expiresAt']=(self.now-dt.timedelta(seconds=1)).isoformat().replace('+00:00','Z');self.refresh()
        with self.assertRaises(RuntimeError):self.effect()
        self.plan['expiresAt']=(self.now+dt.timedelta(minutes=10)).isoformat().replace('+00:00','Z');self.refresh()
        self.write(DEST+'.intent.json',b'foreign intent')
        with self.assertRaises(RuntimeError):self.effect()
        self.assertTrue(self.p(ORIGIN).exists())
    def lost(self,phase):
        original=self.ns['write_exclusive']
        def stop(parent,name,raw):
            if phase=='before-receipt' and name.endswith('.receipt.json'):raise OSError('fixture lost after move')
            original(parent,name,raw)
            if phase=='after-intent' and name.endswith('.intent.json'):raise OSError('fixture lost after intent')
            if phase=='after-receipt' and name.endswith('.receipt.json'):raise OSError('fixture lost after receipt')
        self.ns['write_exclusive']=stop
        with self.assertRaises(OSError):self.effect()
        self.ns['write_exclusive']=original
    def test_lost_after_intent_classifies_without_replay(self):
        self.lost('after-intent');self.assertEqual(self.reconcile()['decision'],'INTENT_ONLY_NO_MOVE_NO_REPLAY')
        with self.assertRaises(RuntimeError):self.effect()
    def test_lost_after_rename_classifies_without_receipt_repair(self):
        self.lost('before-receipt');self.assertEqual(self.reconcile()['decision'],'MOVED_NO_TERMINAL_NO_REPLAY')
        self.assertFalse(self.p(DEST+'.receipt.json').exists())
    def test_lost_after_terminal_has_signed_read_only_proof(self):
        self.lost('after-receipt');self.assertEqual(self.reconcile()['decision'],'TERMINAL_EXACT_QUARANTINED')

if __name__=='__main__':unittest.main(verbosity=2)
