import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {canonical,demand,renderCompose,verifyContainer} from './contract.mjs';

demand(process.env.GITHUB_ACTIONS==='true','Disposable GitHub runner only');
const output=path.resolve(process.argv[2]);
const release=JSON.parse(fs.readFileSync(path.join(output,'release.json')));
const run=(binary,args,options={})=>execFileSync(binary,args,{encoding:'utf8',timeout:120000,...options}).trim();
const docker=args=>run('docker',args);
const sudo=args=>run('sudo',args);
const names=['api-blue','api-green','web-blue','web-green','bonus-ledger-worker','langame-daily-worker'];
for(const rehearsal of [false,true]){
  const root=rehearsal?'/srv/leetplus-migration/rehearsal':'/srv/leetplus';
  demand(!fs.existsSync(root),'Fresh synthetic preparation root required');
  const spec=renderCompose({blue:release,green:release,rehearsal});
  sudo(['install','-d','-m','0755','-o',String(process.getuid()),'-g',String(process.getgid()),root]);
  for(const name of names)for(const mount of spec.services[name].volumes??[]){
    if(mount.source.endsWith('.json')||mount.source.endsWith('.pem')){
      fs.mkdirSync(path.dirname(mount.source),{recursive:true});
      if(!fs.existsSync(mount.source))fs.writeFileSync(mount.source,'{}\n');
    }else fs.mkdirSync(mount.source,{recursive:true});
  }
  const config=path.join(output,`creation-fixture-${rehearsal}.json`);
  fs.writeFileSync(config,canonical(spec));
  const compose=args=>docker(['compose','--project-name',spec.name,'--file',config,...args]);
  try{
    compose(['up','--no-start','--no-deps',...names]);
    for(const name of names){
      const service=spec.services[name];
      const observed=JSON.parse(docker(['inspect',service.container_name]))[0];
      const imageEnvironment=JSON.parse(docker(['image','inspect',service.image]))[0].Config.Env;
      verifyContainer(observed,service,name,{beforeStart:true,imageEnvironment});
    }
    for(const name of ['postgres','redis'])demand(!docker(['ps','--all','--filter',`name=^/${spec.name}-${name}$`,'--format','{{.ID}}']),'No dependent data service may start/create');
  }finally{compose(['down','--remove-orphans']);}
}

sudo(['python3','deploy/leetplus-compose/network-fence.py','install-rehearsal']);
const created=[],networks=[];
let hostServer;
const listen=port=>`require('http').createServer((q,s)=>s.end('ok')).listen(${port},'0.0.0.0')`;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const probe=async(name,url)=>(await promisify(execFile)('docker',['exec',name,'node','-e',`fetch(${JSON.stringify(url)},{signal:AbortSignal.timeout(2000)}).then(async r=>{if(await r.text()!=='ok')process.exit(2);console.log('PASS')}).catch(()=>{console.log('DENIED')})`],{encoding:'utf8',timeout:15000})).stdout.trim();
function start(name,network,ip,port,published,user){
  const args=['run','--detach','--name',name,'--network',network,'--ip',ip,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user',user];
  if(published)args.push('--publish',`127.0.0.1:${published}:${port}`);
  args.push('--entrypoint','node',release.images.api,'-e',listen(port));
  docker(args);created.push(name);
}
try{
  for(const [name,subnet,internal] of [['leetplus-probe-ingress','172.31.50.0/24',false],['leetplus-probe-data','172.31.52.0/24',true]]){
    docker(['network','create','--subnet',subnet,...(internal?['--internal']:[]),name]);networks.push(name);
  }
  hostServer=http.createServer((q,s)=>s.end('ok'));
  await new Promise((resolve,reject)=>{hostServer.once('error',reject);hostServer.listen(19422,'0.0.0.0',resolve);});
  start('leetplus-probe-api','leetplus-probe-ingress','172.31.50.2',4000,24100,'12010:12010');
  docker(['network','connect','--ip','172.31.52.10','leetplus-probe-data','leetplus-probe-api']);
  start('leetplus-probe-web','leetplus-probe-ingress','172.31.50.3',3000,23100,'12020:12020');
  start('leetplus-probe-db','leetplus-probe-data','172.31.52.2',5432,null,'12030:12030');
  for(const port of [23100,24100]){
    let healthy=false;
    for(let i=0;i<40;i++){
      try{if(await (await fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(1000)})).text()==='ok'){healthy=true;break;}}catch{}
      await pause(250);
    }
    demand(healthy,'Published loopback HTTP must really answer');
  }
  demand(await (await fetch('http://127.0.0.1:19422')).text()==='ok','Synthetic host service must be reachable before its negative probe');
  demand(await probe('leetplus-probe-web','http://172.31.50.2:4000')==='PASS','Web must reach its own API');
  demand(await probe('leetplus-probe-api','http://172.31.52.2:5432')==='PASS','API must reach its data service');
  demand(await probe('leetplus-probe-web','http://172.31.52.2:5432')==='DENIED','Web must not reach data');
  demand(await probe('leetplus-probe-web','http://172.31.50.1:19422')==='DENIED','Web must not reach a host proxy');
  demand(await probe('leetplus-probe-web','http://198.51.100.1:443')==='DENIED','Rehearsal must not reach external destinations');
  for(const chain of ['LP_LEETPLUS_REH_V2','LP_LEETPLUS_REH_HOST_V2']){
    const drops=sudo(['/usr/sbin/iptables','-w','5','-nvx','-L',chain]).split('\n').filter(line=>/\bDROP\b/.test(line));
    demand(drops.length===1&&Number(drops[0].trim().split(/\s+/)[0])>0,'Negative probe must hit the actual project DROP rule');
  }
  fs.writeFileSync(path.join(output,'network-validation.json'),canonical({decision:'PASS',stoppedCreation:true,loopbackHttp:true,webToApi:true,apiToData:true,webDataDenied:true,hostProxyDenied:true,externalDenied:true}),{flag:'wx'});
}finally{
  if(hostServer)await new Promise(resolve=>hostServer.close(resolve));
  for(const name of created.reverse())docker(['rm','--force',name]);
  for(const name of networks.reverse())docker(['network','rm',name]);
}
