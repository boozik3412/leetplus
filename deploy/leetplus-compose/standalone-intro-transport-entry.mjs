import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

// Independently reviewed operator code. The dispatcher authenticates these
// exact Node bytes before executing them; this is the first trust anchor.
// The transported Python program is never executed before public signature,
// complete signed code hashes and fixed invocation checks pass.
const PLAN = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_V2_PLAN';
const APPROVAL = 'LEETPLUS_STANDALONE_INTRO_TRANSPORT_V2_APPROVAL';
const ROOT = '/etc/leetplus-compose/approval-root.pem';
const MAX_PACKET = 48 * 1024 * 1024;
const MAX_CODE = 65536; // base64 remains below Linux MAX_ARG_STRLEN.
const SHA = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const CLEAN = { PATH:'/usr/sbin:/usr/bin:/sbin:/bin',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',TZ:'UTC' };
const canonical = (value) => `${JSON.stringify(value,null,2)}\n`;
const digest = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
function require(test,message) { if(!test) throw new Error(`standalone-transport-entry: ${message}`); }
function exact(raw) {
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  require(Buffer.compare(raw,Buffer.from(canonical(value)))===0,'Noncanonical operator packet');
  return value;
}
function read(pathname,maximum) {
  require(path.posix.isAbsolute(pathname)&&path.posix.normalize(pathname)===pathname,
    'Noncanonical trusted operator path');
  let current='/';
  for(const part of pathname.slice(1).split('/').slice(0,-1)) {
    current=path.posix.join(current,part);const st=fs.lstatSync(current,{bigint:true});
    require(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===0n&&(st.mode&0o022n)===0n,
      'Untrusted operator ancestor');
  }
  const before=fs.lstatSync(pathname,{bigint:true});
  require(before.isFile()&&!before.isSymbolicLink()&&before.uid===0n&&before.gid===0n&&
    before.nlink===1n&&before.size>0n&&before.size<=BigInt(maximum)&&
    (before.mode&0o022n)===0n,'Untrusted bounded operator source');
  const fd=fs.openSync(pathname,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try {
    const opened=fs.fstatSync(fd,{bigint:true});
    require(opened.dev===before.dev&&opened.ino===before.ino&&opened.size===before.size&&
      opened.ctimeNs===before.ctimeNs,'Operator source changed before capture');
    const raw=Buffer.alloc(Number(opened.size));let offset=0;
    while(offset<raw.length) {
      const count=fs.readSync(fd,raw,offset,raw.length-offset,offset);
      require(count>0,'Short operator capture');offset+=count;
    }
    const extra=Buffer.alloc(1);require(fs.readSync(fd,extra,0,1,raw.length)===0,'Operator source grew');
    const after=fs.fstatSync(fd,{bigint:true});
    require(after.dev===opened.dev&&after.ino===opened.ino&&after.size===opened.size&&
      after.ctimeNs===opened.ctimeNs,'Operator source changed during capture');
    return raw;
  } finally {fs.closeSync(fd);}
}
require(process.platform==='linux'&&process.getuid()===0&&process.versions.node.split('.')[0]==='22',
  'Fixed Linux root Node22 transport gate required');
require(process.argv.length===5&&process.argv[2]==='--operation-id'&&UUID.test(process.argv[3])&&
  SHA.test(process.argv[4]),'Expected exact transport operation and protected Node source SHA');
require(process.argv[3]!=='9afc7218-4757-4f44-87e1-6096706bad44','Historical operation cannot stage new source');
for(const name of Object.keys(process.env)) {
  require(!/^(?:NODE_|LD_|DYLD_|PYTHON)/u.test(name)&&
    !['BASH_ENV','ENV','OPENSSL_CONF','OPENSSL_MODULES','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY'].includes(name),
  'Unsafe inherited transport gate environment');
}
const operation=process.argv[3], protectedEntrySha=process.argv[4];
const started=Date.now();
let child=null, timedOut=false;
const killGroup=()=>{if(child) {try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}}};
const deadline=setTimeout(()=>{timedOut=true;killGroup();process.stdin.destroy();},180000);
let size=0;const chunks=[];
for await(const chunk of process.stdin) {
  size+=chunk.length;require(size<=MAX_PACKET+131072,'Operator packet exceeds bound');chunks.push(chunk);
}
require(!timedOut,'Transport packet read exceeded total deadline');
const outer=exact(Buffer.concat(chunks));
require(outer&&Object.keys(outer).sort().join(',')==='packet,transportPythonSourceBase64',
  'Closed captured transport wrapper required');
const packet=outer.packet,plan=packet?.plan,envelope=packet?.approvalEnvelope;
require(plan?.contract===PLAN&&plan.operationId===operation&&
  plan.action==='STAGE_SIGNED_INITIAL_INTRO_SOURCE_ONLY','Wrong signed transport plan');
const execution=plan.execution,code=execution?.code;
require(code&&Object.keys(code).sort().join(',')===
  ['transportEntrySha256','transportProgramSha256','nodeExecutableSha256','nodeRealpath',
   'pythonExecutableSha256','pythonRealpath'].sort().join(',')&&
  code.transportEntrySha256===protectedEntrySha&&SHA.test(code.transportProgramSha256),
  'Signed transport execution code closure differs');
require(JSON.stringify(execution.invocation)===JSON.stringify({interpreter:'/usr/bin/python3',
  flags:['-I','-B','-c'],mode:'memory-captured-python-c',action:'stage'}),
  'Transport invocation differs');
require(execution.trustRoot?.path===ROOT&&SHA.test(execution.trustRoot.rawSha256),
  'Fixed inherited deployment root required');
require(execution.limits?.transportProgramBytes===MAX_CODE &&
  execution.limits?.packetBytes===MAX_PACKET &&
  execution.limits?.totalSeconds===180,
  'Signed first-execution byte/time budget differs');
require(envelope&&Object.keys(envelope).sort().join(',')==='approval,signature'&&
  /^[A-Za-z0-9+/]{86}==$/u.test(envelope.signature),'Closed approval envelope required');
const approval=envelope.approval;
require(approval&&Object.keys(approval).sort().join(',')===
  ['contract','operationId','hostIdentitySha256','planSha256','action','issuedAt','expiresAt'].sort().join(',')&&
  approval.contract===APPROVAL&&approval.operationId===operation&&
  approval.hostIdentitySha256===plan.hostIdentitySha256&&
  approval.planSha256===digest(Buffer.from(canonical(plan)))&&approval.action===plan.action,
  'Transport public approval does not bind exact plan');
const issued=Date.parse(approval.issuedAt),expires=Date.parse(approval.expiresAt);
require(Number.isFinite(issued)&&Number.isFinite(expires)&&
  new Date(issued).toISOString()===approval.issuedAt&&new Date(expires).toISOString()===approval.expiresAt&&
  issued<=Date.now()&&Date.now()<expires&&expires-issued<=30*60*1000,
  'Transport approval expired or unbounded');
const pem=read(ROOT,4096);
require(!pem.includes(Buffer.from('PRIVATE'))&&digest(pem)===execution.trustRoot.rawSha256,
  'Inherited deployment public root bytes differ');
const key=crypto.createPublicKey(pem);
require(key.asymmetricKeyType==='ed25519'&&crypto.verify(null,Buffer.from(canonical(approval)),key,
  Buffer.from(envelope.signature,'base64')),'Transport public signature rejected');
require(digest(read('/etc/machine-id',65536).toString('utf8').trim())===plan.hostIdentitySha256,
  'Transport host identity differs');
for(const [fixed,expectedPath,expectedSha] of [
  ['/usr/bin/node',code.nodeRealpath,code.nodeExecutableSha256],
  ['/usr/bin/python3',code.pythonRealpath,code.pythonExecutableSha256],
]) {
  const real=fs.realpathSync.native(fixed);
  require(real===expectedPath&&SHA.test(expectedSha)&&digest(read(real,128*1024*1024))===expectedSha,
    'Signed fixed interpreter source differs');
}
const encoded=outer.transportPythonSourceBase64;
require(typeof encoded==='string'&&encoded.length<=Math.ceil(MAX_CODE/3)*4,
  'Captured Python transport source exceeds bound');
const source=Buffer.from(encoded,'base64');
require(source.length>0&&source.length<=MAX_CODE&&source.toString('base64')===encoded&&
  digest(source)===code.transportProgramSha256,'Captured Python transport source differs from signed plan');
const packetRaw=Buffer.from(canonical(packet));require(packetRaw.length<=MAX_PACKET,'Transport packet too large');
// Fixed stdlib loader compiles the SAME captured approved source, never a path.
const loader="import base64,sys; source=base64.b64decode(sys.argv.pop(1),validate=True); sys.argv[0]='captured-standalone-transport'; exec(compile(source,'captured-standalone-transport','exec'),{'__name__':'__main__'})";
const remaining=180000-(Date.now()-started);require(remaining>0,'Transport gate deadline expired');
child=spawn('/usr/bin/python3',['-I','-B','-c',loader,encoded,'--mode','stage',
  '--operation-id',operation,'--captured-program-sha256',code.transportProgramSha256],
{env:CLEAN,stdio:['pipe','pipe','pipe'],detached:true});
let out=0,err=0;
const onSignal=()=>{killGroup();};
process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);
child.stdout.on('data',chunk=>{out+=chunk.length;if(out>1024*1024)killGroup();else process.stdout.write(chunk);});
child.stderr.on('data',chunk=>{err+=chunk.length;if(err>1024*1024)killGroup();else process.stderr.write(chunk);});
child.stdin.on('error',()=>{killGroup();});
child.stdin.end(packetRaw);
const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(status,signal)=>resolve({status,signal}));});
clearTimeout(deadline);process.removeListener('SIGINT',onSignal);process.removeListener('SIGTERM',onSignal);
require(!timedOut&&!result.signal&&out<=1024*1024&&err<=1024*1024&&Number.isInteger(result.status),
  'Transport execution outcome unknown; preserve receipts and reconcile without replay');
process.exitCode=result.status;
