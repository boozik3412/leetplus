import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

// The dispatcher must authenticate this captured source BEFORE its first
// instruction. This separate authority can finalize one exact old audit
// receipt; it cannot stage a source snapshot or replay the first operation.
const PLAN='LEETPLUS_STANDALONE_INTRO_TRANSPORT_FINALIZE_V1_PLAN';
const APPROVAL='LEETPLUS_STANDALONE_INTRO_TRANSPORT_FINALIZE_V1_APPROVAL';
const ACTION='FINALIZE_EXACT_INITIAL_TRANSPORT_AUDIT_RECEIPT_ONLY';
const ROOT='/etc/leetplus-compose/approval-root.pem';
const CLEAN={PATH:'/usr/sbin:/usr/bin:/sbin:/bin',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',TZ:'UTC'};
const SHA=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const canonical=value=>`${JSON.stringify(value,null,2)}\n`;
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function require(ok,message){if(!ok)throw new Error(`standalone-finalize-entry: ${message}`);}
function exact(raw){
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  require(Buffer.compare(raw,Buffer.from(canonical(value)))===0,'Noncanonical finalize packet');
  return value;
}
function read(name,maximum){
  require(path.posix.isAbsolute(name)&&path.posix.normalize(name)===name,'Noncanonical trusted path');
  let current='/';
  for(const piece of name.slice(1).split('/').slice(0,-1)){
    current=path.posix.join(current,piece);
    const info=fs.lstatSync(current,{bigint:true});
    require(info.isDirectory()&&!info.isSymbolicLink()&&info.uid===0n&&
      (info.mode&0o022n)===0n,'Untrusted finalize ancestor');
  }
  const before=fs.lstatSync(name,{bigint:true});
  require(before.isFile()&&!before.isSymbolicLink()&&before.uid===0n&&before.gid===0n&&
    before.nlink===1n&&before.size>0n&&before.size<=BigInt(maximum)&&
    (before.mode&0o022n)===0n,'Untrusted finalize input');
  const fd=fs.openSync(name,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try{
    const opened=fs.fstatSync(fd,{bigint:true});
    require(opened.dev===before.dev&&opened.ino===before.ino&&opened.size===before.size&&
      opened.ctimeNs===before.ctimeNs,'Finalize input changed before capture');
    const raw=Buffer.alloc(Number(opened.size));let offset=0;
    while(offset<raw.length){const count=fs.readSync(fd,raw,offset,raw.length-offset,offset);
      require(count>0,'Short finalize input');offset+=count;}
    const extra=Buffer.alloc(1);
    require(fs.readSync(fd,extra,0,1,raw.length)===0,'Finalize input grew');
    const after=fs.fstatSync(fd,{bigint:true});
    require(after.dev===opened.dev&&after.ino===opened.ino&&after.size===opened.size&&
      after.ctimeNs===opened.ctimeNs,'Finalize input changed during capture');
    return raw;
  }finally{fs.closeSync(fd);}
}
require(process.platform==='linux'&&process.getuid()===0&&process.versions.node.split('.')[0]==='22',
  'Fixed Linux root Node22 finalize gate required');
const args=process.argv.slice(1);
require(args.length===3&&args[0]==='--operation-id'&&UUID.test(args[1])&&SHA.test(args[2]),
  'Expected exact node -e -- --operation-id UUID SHA invocation');
require(args[1]!=='9afc7218-4757-4f44-87e1-6096706bad44','Historical operation cannot finalize');
for(const name of Object.keys(process.env)){
  require(!/^(?:NODE_|LD_|DYLD_|PYTHON)/u.test(name)&&
    !['BASH_ENV','ENV','OPENSSL_CONF','OPENSSL_MODULES','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY'].includes(name),
  'Unsafe inherited finalize environment');
}
const started=Date.now();let child=null,timedOut=false;
const killGroup=()=>{if(child){try{process.kill(-child.pid,'SIGKILL');}
  catch(error){if(error.code!=='ESRCH')throw error;}}};
const deadline=setTimeout(()=>{timedOut=true;killGroup();process.stdin.destroy();},180000);
let size=0;const chunks=[];
for await(const chunk of process.stdin){size+=chunk.length;
  require(size<=262144,'Finalize operator wrapper exceeds bound');chunks.push(chunk);}
require(!timedOut,'Finalize input read exceeded total deadline');
const outer=exact(Buffer.concat(chunks));
require(outer&&Object.keys(outer).sort().join(',')==='packet,transportPythonSourceBase64',
  'Closed captured finalization wrapper required');
const packet=outer.packet;
require(packet&&Object.keys(packet).sort().join(',')==='finalizeApprovalEnvelope,finalizePlan',
  'Closed signed finalization packet required');
const plan=packet.finalizePlan,envelope=packet.finalizeApprovalEnvelope,execution=plan?.execution;
const code=execution?.code,operation=args[1],protectedEntrySha=args[2];
require(plan?.contract===PLAN&&plan?.action===ACTION&&plan.operationId===operation&&
  UUID.test(plan.originalOperationId)&&plan.originalOperationId!==operation,
  'Wrong separate finalization plan');
require(code&&Object.keys(code).sort().join(',')===
  ['finalizeEntrySha256','transportProgramSha256','pythonLoaderSha256','nodeExecutableSha256',
   'nodeRealpath','pythonExecutableSha256','pythonRealpath'].sort().join(',')&&
  code.finalizeEntrySha256===protectedEntrySha&&SHA.test(code.transportProgramSha256),
  'Signed finalize code closure differs');
require(JSON.stringify(execution.invocation)===JSON.stringify({interpreter:'/usr/bin/python3',
  flags:['-I','-B','-c'],mode:'memory-captured-python-c',action:'finalize-reconcile'}),
  'Fixed finalization invocation differs');
require(execution.trustRoot?.path===ROOT&&SHA.test(execution.trustRoot.rawSha256)&&
  execution.limits?.packetBytes===131072&&execution.limits?.transportProgramBytes===65536&&
  execution.limits?.totalSeconds===180,'Signed finalization root/limits differ');
require(envelope&&Object.keys(envelope).sort().join(',')==='approval,signature'&&
  /^[A-Za-z0-9+/]{86}==$/u.test(envelope.signature),'Closed finalization approval required');
const approval=envelope.approval;
require(approval&&Object.keys(approval).sort().join(',')===
  ['contract','operationId','hostIdentitySha256','planSha256','action','issuedAt','expiresAt'].sort().join(',')&&
  approval.contract===APPROVAL&&approval.operationId===operation&&
  approval.hostIdentitySha256===plan.hostIdentitySha256&&
  approval.planSha256===digest(Buffer.from(canonical(plan)))&&approval.action===ACTION,
  'Separate approval does not bind exact finalize plan');
const issued=Date.parse(approval.issuedAt),expires=Date.parse(approval.expiresAt);
require(Number.isFinite(issued)&&Number.isFinite(expires)&&
  new Date(issued).toISOString()===approval.issuedAt&&new Date(expires).toISOString()===approval.expiresAt&&
  issued<=Date.now()&&Date.now()<expires&&expires-issued>0&&expires-issued<=1800000,
  'Finalization approval expired or unbounded');
const pem=read(ROOT,4096);
require(!pem.includes(Buffer.from('PRIVATE'))&&digest(pem)===execution.trustRoot.rawSha256,
  'Inherited deployment public root differs');
const key=crypto.createPublicKey(pem);
require(key.asymmetricKeyType==='ed25519'&&crypto.verify(null,Buffer.from(canonical(approval)),key,
  Buffer.from(envelope.signature,'base64')),'Finalization public signature rejected');
require(digest(read('/etc/machine-id',65536).toString('utf8').trim())===plan.hostIdentitySha256&&
  read('/proc/sys/kernel/random/boot_id',128).toString('utf8').trim()===plan.bootId,
  'Finalization host/boot differs');
for(const [fixed,realpath,sha] of [
  ['/usr/bin/node',code.nodeRealpath,code.nodeExecutableSha256],
  ['/usr/bin/python3',code.pythonRealpath,code.pythonExecutableSha256],
]){
  require(fs.realpathSync.native(fixed)===realpath&&SHA.test(sha)&&
    digest(read(realpath,128*1024*1024))===sha,'Signed fixed finalize tool bytes differ');
}
const encoded=outer.transportPythonSourceBase64;
require(typeof encoded==='string'&&encoded.length<=Math.ceil(65536/3)*4,
  'Captured finalize Python source exceeds bound');
const source=Buffer.from(encoded,'base64');
require(source.length>0&&source.length<=65536&&source.toString('base64')===encoded&&
  digest(source)===code.transportProgramSha256,'Captured finalize Python source differs');
const packetRaw=Buffer.from(canonical(packet));
require(packetRaw.length<=131072,'Signed finalization packet exceeds bound');
const loader="import base64,ctypes,os,signal,sys; expected_parent=int(sys.argv.pop(1)); libc=ctypes.CDLL(None,use_errno=True); assert libc.prctl(1,signal.SIGKILL,0,0,0)==0 and os.getppid()==expected_parent; source=base64.b64decode(sys.argv.pop(1),validate=True); sys.argv[0]='captured-standalone-transport'; exec(compile(source,'captured-standalone-transport','exec'),{'__name__':'__main__'})";
require(code.pythonLoaderSha256===digest(Buffer.from(loader)),
  'Fixed same-buffer parent-death Python loader differs');
require(!timedOut&&180000-(Date.now()-started)>0,'Finalization gate deadline expired');
child=spawn('/usr/bin/python3',['-I','-B','-c',loader,String(process.pid),encoded,
  '--mode','finalize-reconcile','--operation-id',operation,
  '--captured-program-sha256',code.transportProgramSha256],
{env:CLEAN,stdio:['pipe','pipe','pipe'],detached:true});
let out=0,err=0,stdinFailed=false;
const onSignal=()=>{killGroup();};
process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);
child.stdout.on('data',chunk=>{out+=chunk.length;if(out>1048576)killGroup();
  else process.stdout.write(chunk);});
child.stderr.on('data',chunk=>{err+=chunk.length;if(err>1048576)killGroup();
  else process.stderr.write(chunk);});
child.stdin.on('error',()=>{stdinFailed=true;killGroup();});
child.stdin.end(packetRaw);
const result=await new Promise((resolve,reject)=>{child.once('error',reject);
  child.once('close',(status,signal)=>resolve({status,signal}));});
clearTimeout(deadline);process.removeListener('SIGINT',onSignal);process.removeListener('SIGTERM',onSignal);
require(!timedOut&&!stdinFailed&&!result.signal&&out<=1048576&&err<=1048576&&
  Number.isInteger(result.status),'Finalization outcome unknown; read-only reconcile, no replay');
process.exitCode=result.status;
