// Independently captured and digest checked before the first Node instruction.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const PIN = {"baselineSummarySha256":"7daa039c9da06a04882b900cb47b9f8ec7eacc540e6141377c73af44c4e169dc","bootId":"4bbc3488-6a9b-49b1-becf-db0d784464f0","effectOwnerThreadId":"01a0d256-4519-7911-8ac4-b5c5f020d5ff","executorSha256":"03f05a24efb9205c9ffc3d6afd929ed33b2bacd8d43d588ea6f7c03ee69cc020","hostIdentitySha256":"de72d444d9266e6c4f1ac7e76f0d4e4e0866ca1da4aa0a7f2808835fa3bd3423","nodeRealpath":"/usr/bin/node","nodeSha256":"d0efb6fcb9d023ba4e2b160ec2384dc28fe4f17732141ef47f676828fa960505","operationId":"ac871cea-d06f-402c-b5c1-60f9c112784e","planExpiresAt":"2026-09-29T12:05:00Z","planSha256":"2c384c72e86bda386f830e07667ddabdd905037717eab420e71a7575b90cabd5","publicRootBase64":"LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUNvd0JRWURLMlZ3QXlFQVlsOHhoK1oxb2hEVnA5ajlIdzE3blh5NDB2WHpIemc4T0xUVTUrMWxTOU09Ci0tLS0tRU5EIFBVQkxJQyBLRVktLS0tLQo=","publicRootSha256":"a49227c157fdb02193a6c97bbd5666969432b221b393bee7e7b09bd4c8255f5e","pythonRealpath":"/usr/bin/python3.14","pythonSha256":"52e0a13e60a981d8c4b6478be2ba5176f69da07948a056bf49cf6f077e30cb41"};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const must = (ok, why) => { if (!ok) throw new Error(why); };
must(fs.realpathSync('/proc/self/exe') === PIN.nodeRealpath, 'Running Node path drift');
const nodeFd = fs.openSync('/proc/self/exe', fs.constants.O_RDONLY);
try { must(hash(fs.readFileSync(nodeFd)) === PIN.nodeSha256, 'Running Node bytes drift'); }
finally { fs.closeSync(nodeFd); }
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,stable(value[key])])) : value;
const canonical = value => Buffer.from(JSON.stringify(stable(value)) + '\n');
const openedAt = Date.now();
const timer = setTimeout(() => { throw new Error('Protected gate total deadline'); }, 180000);
const inputTimer = setTimeout(() => { throw new Error('Protected gate stdin deadline'); }, 15000);
const chunks = [];
let bytes = 0;
for await (const chunk of process.stdin) {
  bytes += chunk.length;
  must(bytes <= 524288, 'Bounded authorization packet');
  chunks.push(chunk);
}
clearTimeout(inputTimer);
const outer = JSON.parse(Buffer.concat(chunks).toString('utf8'));
must(Object.keys(outer).sort().join(',') === 'approval,capturedPythonBase64,signatureBase64', 'Closed gate packet');
const approval = outer.approval;
must(Object.keys(approval).sort().join(',') === ['contract','operationId','planSha256','executorSha256','baselineSummarySha256','hostIdentitySha256','bootId','effectOwnerThreadId','directUserGoReceiptSha256','authorizedAt','expiresAt'].sort().join(','), 'Closed approval');
must(approval.contract === 'LEETPLUS_B0_CACHE_QUARANTINE_APPROVAL_V1' && approval.operationId === PIN.operationId && approval.planSha256 === PIN.planSha256 && approval.executorSha256 === PIN.executorSha256 && approval.baselineSummarySha256 === PIN.baselineSummarySha256 && approval.hostIdentitySha256 === PIN.hostIdentitySha256 && approval.bootId === PIN.bootId && approval.effectOwnerThreadId === PIN.effectOwnerThreadId, 'Exact signed operation identity');
must(/^[0-9a-f]{64}$/.test(approval.directUserGoReceiptSha256), 'Direct user GO receipt identity');
must(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(approval.authorizedAt) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(approval.expiresAt), 'Canonical approval UTC');
const authorized = Date.parse(approval.authorizedAt), expiry = Date.parse(approval.expiresAt);
must(Number.isFinite(authorized) && Number.isFinite(expiry) && expiry > authorized && expiry - authorized <= 1800000 && Date.now() >= authorized && Date.now() < expiry && expiry <= Date.parse(PIN.planExpiresAt), 'Approval validity <= 30 minutes');
const rootBytes = Buffer.from(PIN.publicRootBase64, 'base64');
must(hash(rootBytes) === PIN.publicRootSha256 && !rootBytes.includes(Buffer.from('PRIVATE')), 'Pinned public root');
const installedRoot = fs.readFileSync('/etc/leetplus-compose/approval-root.pem');
must(hash(installedRoot) === PIN.publicRootSha256, 'Installed public root matches provenance');
const root = crypto.createPublicKey(rootBytes);
must(root.asymmetricKeyType === 'ed25519' && crypto.verify(null, canonical(approval), root, Buffer.from(outer.signatureBase64, 'base64')), 'Root approval signature');
const python = Buffer.from(outer.capturedPythonBase64, 'base64');
must(python.length <= 262144 && hash(python) === PIN.executorSha256, 'Captured Python digest');
const realPython = fs.realpathSync('/usr/bin/python3');
must(realPython === PIN.pythonRealpath && hash(fs.readFileSync(realPython)) === PIN.pythonSha256, 'Pinned Python interpreter');
must(Date.now() < expiry && Date.now() - openedAt < 180000, 'Time fence immediately before compile');
const signedRecord = canonical({approval,signatureBase64:outer.signatureBase64}).toString('base64');
const child = spawn('/usr/bin/python3', ['-I','-B','-','--effect',PIN.planSha256,approval.directUserGoReceiptSha256,signedRecord,String(process.pid)], {
  detached: true, stdio: ['pipe','pipe','pipe'], env: {PATH:'/usr/sbin:/usr/bin:/sbin:/bin',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',TZ:'UTC'}
});
let count = 0;
let failed = false;
const kill = () => { failed = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
const deadline = setTimeout(kill, Math.max(1, Math.min(180000 - (Date.now()-openedAt), expiry-Date.now())));
process.on('SIGTERM', kill);
process.on('SIGINT', kill);
for (const [stream,destination] of [[child.stdout,process.stdout],[child.stderr,process.stderr]]) {
  stream.on('data', chunk => { count += chunk.length; if (count > 262144) kill(); else destination.write(chunk); });
}
child.stdin.on('error', kill);
child.stdin.end(python);
const exit = await new Promise((resolve,reject) => { child.once('error', reject); child.once('close', (code,signal) => resolve({code,signal})); });
clearTimeout(deadline); clearTimeout(timer);
must(!failed && exit.code === 0 && !exit.signal, 'Quarantine child failed; reconcile, never replay');
