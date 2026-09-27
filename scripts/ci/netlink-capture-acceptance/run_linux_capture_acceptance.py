"""Disposable root Linux mechanics acceptance for capture source C333a935."""
import argparse,base64,datetime as dt,fcntl,hashlib,json,os,re,secrets,shutil,signal,socket,stat,subprocess,sys,tempfile,time,types
from pathlib import Path
CAPTURE_SHA="c333a935e5924b79b86afb7617ac7597db66e2fae23d0872f45e97659bd23939";D_SHA="73801b0d24b5896eaf327a64be5f79c6d04f3fb16fca3310d40ccd9942dcc919";P_SHA="b158a288a3b8df29212c6d0f86888d8b2874004d38a50b3f359a472cd933381a";STAGE_SHA="828cc35c78df40d061c6f2330ed9143d9a6e09b9fc900f2c161029e7177c8e0a";PROD="de72d444d9266e6c4f1ac7e76f0d4e4e0866ca1da4aa0a7f2808835fa3bd3423"
ROOT=Path(__file__).resolve().parent;SOURCE=ROOT/"netlink_diagnostic_capture_remote_v1.py";D_COPY=ROOT/"bridge_ns_netlink_diagnostic_73801.py";P_COPY=ROOT/"bridge_ns_netlink_preflight_b158.py";STAGE_COPY=ROOT/"netlink_diagnostic_stage_remote_v1.py";TMP=Path("/tmp");RESULT="result.json"
CASES=("full","cap","nonzero","timeout","flock","audit","alarm","orchestration","release-uncertain")
def sha(b):return hashlib.sha256(b).hexdigest()
def canon(v):return (json.dumps(v,sort_keys=True)+"\n").encode()
def exact_bytes(path,limit=2*1024*1024):
 before=path.lstat();fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  opened=os.fstat(fd);chunks=[];total=0
  while True:
   part=os.read(fd,min(65536,limit+1-total))
   if not part:break
   chunks.append(part);total+=len(part)
   if total>limit:raise RuntimeError("bundle member exceeds bound")
  after=os.fstat(fd)
 finally:os.close(fd)
 current=path.lstat()
 ids=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mtime_ns)
 if path.is_symlink() or not stat.S_ISREG(before.st_mode) or ids(before)!=ids(opened) or ids(opened)!=ids(after) or ids(after)!=ids(current):raise RuntimeError("bundle member changed")
 return b"".join(chunks)
def guard():
 if sys.platform!="linux" or os.geteuid()!=0:raise RuntimeError("root disposable Linux required")
 machine=sha(Path("/etc/machine-id").read_bytes().strip())
 if socket.gethostname()=="1337s" or machine==PROD:raise RuntimeError("production host forbidden")
 i=TMP.lstat();fd=os.open(TMP,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);opened=os.fstat(fd);current=TMP.lstat();os.close(fd)
 if TMP.is_symlink() or not stat.S_ISDIR(i.st_mode) or i.st_uid or i.st_mode&0o7777!=0o1777:raise RuntimeError("literal /tmp trust differs")
 if (i.st_dev,i.st_ino)!=(opened.st_dev,opened.st_ino) or (opened.st_dev,opened.st_ino)!=(current.st_dev,current.st_ino):raise RuntimeError("literal /tmp identity changed")
 return {"hostname":socket.gethostname(),"machineIdSha256":machine,"tmpDevice":i.st_dev,"tmpInode":i.st_ino}
def verify_bundle():
 expected={SOURCE:CAPTURE_SHA,D_COPY:D_SHA,P_COPY:P_SHA,STAGE_COPY:STAGE_SHA};found={}
 for path,want in expected.items():
  info=path.lstat()
  if path.is_symlink() or not stat.S_ISREG(info.st_mode):raise RuntimeError("bundle member type differs")
  raw=exact_bytes(path);got=sha(raw)
  if got!=want:raise RuntimeError("bundle member hash differs")
  found[path.name]=got
 return found
def load():
 raw=exact_bytes(SOURCE)
 if sha(raw)!=CAPTURE_SHA:raise RuntimeError("capture pin differs")
 m=types.ModuleType("capture_exact");m.__file__=str(SOURCE);exec(compile(raw,str(SOURCE),"exec"),m.__dict__);return m,raw
def authorize(case,path,ppid,nonce):
 g=guard();verify_bundle();path=Path(path).resolve(strict=True);parent=path.parent
 if parent.parent!=TMP or not parent.name.startswith("leetplus-capture-acceptance-batch-") or not path.name.startswith("case-") or ppid!=os.getppid() or not re.fullmatch(r"[a-f0-9]{32}",nonce):raise RuntimeError("case authorization differs")
 for p in (parent,path):
  i=p.lstat()
  if p.is_symlink() or not stat.S_ISDIR(i.st_mode) or i.st_uid or i.st_mode&0o777!=0o700:raise RuntimeError("case root differs")
 marker=path/".auth.json";fd=os.open(marker,os.O_RDONLY|os.O_NOFOLLOW)
 try:i=os.fstat(fd);raw=os.read(fd,4097)
 finally:os.close(fd)
 expected={"case":case,"parentPid":ppid,"nonce":nonce,"tmpDevice":g["tmpDevice"],"tmpInode":g["tmpInode"],"batchInode":parent.stat().st_ino,"caseInode":path.stat().st_ino}
 if len(raw)>4096 or raw!=canon(expected) or i.st_uid or i.st_nlink!=1 or i.st_mode&0o777!=0o400:raise RuntimeError("one-use marker differs")
 os.rename(marker,path/".auth.consumed.json");sync=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);os.fsync(sync);os.close(sync);return path,g
def command(text):return [sys.executable,"-I","-B","-c",text]
def orchestration_case(m,path,g,uncertain=False):
 d_raw=exact_bytes(D_COPY)
 if sha(d_raw)!=D_SHA:raise RuntimeError("pure D bytes differ")
 d=types.ModuleType("capture_fixture_exact_D");d.__file__=str(D_COPY);exec(compile(d_raw,str(D_COPY),"exec"),d.__dict__)
 facts=d.collect_facts(net_namespace={"device":1,"inode":2},mount_namespace={"device":1,"inode":3},interfaces=[(1,"lo")],proc_net_dev=b"lo: 0 0\n",proc_net_route=b"Iface Destination\n",proc_net_ipv6_route=b"",sys_class_net=["lo"],mountinfo=b"24 1 0:5 / /sys rw - sysfs sysfs rw\n")
 child_raw=d.canonical(facts)
 cmd=command("import sys;sys.stdout.buffer.write(bytes.fromhex('"+child_raw.hex()+"'))")
 d.CHILD_COMMAND=cmd;d.ROOT_PREFIX=str(path/"op-")
 m.CHILD_COMMAND_SHA=sha(m.canonical(cmd));m.OP_ROOT=path/("op-"+m.UUID)
 m.PATHS={"codeRoot":str(path/"fixture-code"),"operationRoot":str(m.OP_ROOT),"intent":str(m.OP_ROOT/"intent.json"),"terminal":str(m.OP_ROOT/"terminal.json")}
 lock=path/"lock";lock.write_bytes(b"");os.chmod(lock,0o400);m.LOCK=lock
 p=types.SimpleNamespace(validate_fresh_for_launcher=lambda *_:None)
 source_meta={"root":{"device":1,"inode":1,"fixtureInjected":True},"D":{"sha256":D_SHA,"inode":2,"fixtureInjected":True},"P":{"sha256":P_SHA,"inode":3,"fixtureInjected":True}}
 m.validate_staged=lambda _binding:(d,p,source_meta)
 m.before_lock=lambda _p,b:(guard(),m.validate_baseline_fresh(b,dt.datetime.now(dt.timezone.utc)),{"disposableFixture":True})[-1]
 m.collect_p=lambda _p:({"decision":"OBSERVED_NOT_AUTHORIZATION","capturedAt":m.utc_now(),"fixtureInjected":True},time.monotonic())
 def live(fd=None,before=None):
  if not m.absent(m.OP_ROOT):raise RuntimeError("fixture operation root no longer absent before write")
  state={"disposableFixture":True}
  if before is not None and before!=state:raise RuntimeError("fixture live continuity differs")
  if fd is not None and os.fstat(fd).st_ino!=m.LOCK.stat().st_ino:raise RuntimeError("fixture lock inode differs")
  return state
 m.quick_live=live
 original_sync=m.sync_dir
 def sync(pth):
  pth=Path(pth)
  if pth==Path("/run"):pth=path
  if pth!=path and path not in pth.parents:raise RuntimeError("fixture fsync escaped private root")
  return original_sync(pth)
 m.sync_dir=sync
 orig_flock=fcntl.flock;events=[]
 def flock(fd,operation):
  if operation==fcntl.LOCK_UN:
   events.append("unlock-attempt")
   if uncertain:raise OSError("injected unlock uncertainty")
  return orig_flock(fd,operation)
 m.fcntl=types.SimpleNamespace(LOCK_UN=fcntl.LOCK_UN,LOCK_SH=fcntl.LOCK_SH,LOCK_NB=fcntl.LOCK_NB,flock=flock)
 now=dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00","Z")
 binding={"schemaVersion":1,"operationId":m.UUID,"stageSourceSha256":m.STAGE_SHA,"stageReceiptSha256":"a"*64,"captureSourceSha256":"b"*64,"planSha256":"c"*64,"goReceiptSha256":"d"*64,"codeRootInode":1,"dInode":2,"pInode":3,"fullBaselineReceiptSha256":"e"*64,"fullBaselineCapturedAt":now}
 result=m.capture_once(base64.b64encode(m.canonical(binding)).decode())
 actual={"resultDecision":result["decision"],"lock":result["lock"],"childTrace":result["childTrace"],"events":events,"operationEntries":sorted(x.name for x in m.OP_ROOT.iterdir()) if m.OP_ROOT.exists() else []}
 if result.get("terminalPublished"):
  terminal=(m.OP_ROOT/"terminal.json").read_bytes();actual["terminalSha256"]=sha(terminal);actual["terminalDecision"]=json.loads(terminal)["decision"];actual["terminalMatchesPhase"]=sha(terminal)==result["terminalSha256"]
 else:actual["terminalSha256"]=None;actual["terminalDecision"]=None;actual["terminalMatchesPhase"]=False
 actual["unlockBeforeTerminal"]=(result["lock"] is not None and result["lock"]["released"] and result["lock"]["releasedAt"]<result["lock"]["terminalPublishedAt"]) if result.get("terminalPublished") else False
 actual["publicationTruth"]=(result.get("publicationCompletedAt","")>result["lock"]["terminalPublishedAt"] and result["lock"]["publicationTimestampMeaning"]=="EXCLUSIVE_CREATE_BEFORE_FSYNC_COMPLETION") if result.get("terminalPublished") else False
 actual["dummyCommandPatched"]=True
 return actual
def run_case(case,path,ppid,nonce):
 path,g=authorize(case,path,ppid,nonce);m,raw=load();patches=[]
 if case in ("full","cap","nonzero","timeout"):
  sentinel=None
  if case=="full":
   sentinel=os.open(path/"sentinel",os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);os.set_inheritable(sentinel,True);text=f"import os\ntry: os.fstat({sentinel}); raise SystemExit(9)\nexcept OSError: print('close_fds_ok')"
  else:text={"cap":"import os;os.write(1,b'x'*300000)","nonzero":"import sys;sys.stderr.write('bad');sys.exit(3)","timeout":"import time;time.sleep(20)"}[case]
  cmd=command(text);m.CHILD_COMMAND_SHA=sha(m.canonical(cmd));patches=["CHILD_COMMAND_SHA(dummy fixture command)"]
  try:trace=m.run_bounded_child(cmd)
  finally:
   if sentinel is not None:os.close(sentinel)
  value={"trace":trace,"clean":m.clean_trace(trace),"closeFdsSentinelRejected":case!="full" or trace["exitCode"]==0}
 elif case=="flock":
  lock=path/"lock";lock.write_bytes(b"");os.chmod(lock,0o400);m.LOCK=lock;patches=["LOCK"]
  a=os.open(lock,os.O_RDONLY);fcntl.flock(a,fcntl.LOCK_EX|fcntl.LOCK_NB)
  try:
   try:m.acquire_lock();raise AssertionError("source acquire_lock accepted contention")
   except BlockingIOError:pass
  finally:fcntl.flock(a,fcntl.LOCK_UN);os.close(a)
  b,meta=m.acquire_lock();fcntl.flock(b,fcntl.LOCK_UN);os.close(b);value={"contentionRejected":True,"released":True,"sourceLockMetadata":meta}
 elif case=="audit":
  audit=path/"audit";audit.mkdir(mode=0o700);m.OP_ROOT=audit;rootfd,meta=m.open_private_root();intent=m.canonical({"kind":"intent"});iraw,im=m.write_exclusive(rootfd,"intent.json",intent)
  try:m.write_exclusive(rootfd,"intent.json",b"foreign");raise AssertionError("O_EXCL collision accepted")
  except FileExistsError:collision=True
  traw,tm=m.write_exclusive(rootfd,"terminal.json",lambda:m.canonical({"kind":"terminal","truthTimestamp":m.utc_now()}));os.close(rootfd)
  value={"intent":{"rawSha256":sha(iraw),"rawBytes":len(iraw),"metadata":im},"terminal":{"rawSha256":sha(traw),"rawBytes":len(traw),"metadata":tm,"truthTimestamp":json.loads(traw)["truthTimestamp"]},"collisionRejected":collision,"rootMetadata":meta,"entries":sorted(x.name for x in audit.iterdir())};patches=["OP_ROOT"]
 elif case in ("orchestration","release-uncertain"):
  value=orchestration_case(m,path,g,case=="release-uncertain")
  patches=["D.CHILD_COMMAND(dummy fixture command)","D.ROOT_PREFIX(disposable audit)","CHILD_COMMAND_SHA","OP_ROOT","PATHS","LOCK(disposable)","validate_staged(injected exact-copy metadata)","before_lock(disposable guard)","collect_p(injected read-only P)","quick_live(disposable)","sync_dir(/run redirected to owned case)","fcntl.flock(injected unlock uncertainty only for release-uncertain)"]
 else:
  fired=[];old=signal.getsignal(signal.SIGALRM);signal.signal(signal.SIGALRM,lambda *_:(fired.append(True),(_ for _ in ()).throw(TimeoutError()))[1]);signal.setitimer(signal.ITIMER_REAL,.02)
  try:
   try:time.sleep(1)
   except TimeoutError:pass
  finally:signal.setitimer(signal.ITIMER_REAL,0);signal.signal(signal.SIGALRM,old)
  value={"sigalrm":fired==[True]}
 return {"case":case,"value":value,"captureSha256":sha(raw),"patchedSurfaces":patches,"guard":g}
def inventory(p):
 out=[]
 for x in p.rglob("*"):
  if len(out)>=64:raise RuntimeError("owned residue inventory exceeds bound")
  out.append({"path":str(x.relative_to(p)),"inode":x.lstat().st_ino,"mode":oct(x.lstat().st_mode&0o777)})
 return out
def child(args):print(json.dumps(run_case(args.child,args.case_root,args.parent_pid,args.nonce),sort_keys=True))
def cleanup_case(root,batch):
 root=root.resolve(strict=True);batch=batch.resolve(strict=True)
 if root.parent!=batch or batch.parent!=TMP or not root.name.startswith("case-") or not batch.name.startswith("leetplus-capture-acceptance-batch-"):raise RuntimeError("refusing foreign cleanup")
 shutil.rmtree(root)
 if root.exists() or root.is_symlink():raise RuntimeError("owned cleanup incomplete")
def parent_case(case,root,batch,nonce,timeout):
 proc=None;out="";err="";residue=[]
 try:
  proc=subprocess.Popen([sys.executable,"-I","-B",str(Path(__file__).resolve()),"--child",case,"--case-root",str(root),"--parent-pid",str(os.getpid()),"--nonce",nonce],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
  try:out,err=proc.communicate(timeout=timeout)
  except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);out,err=proc.communicate(timeout=5);raise
  residue=inventory(root)
  if proc.returncode or err or len(out)>2*1024*1024:raise RuntimeError(f"case failed {case}")
  value=json.loads(out);value.update(rawStdout=out,rawStdoutSha256=sha(out.encode()),residueBeforeCleanup=residue);return value
 finally:
  if proc is not None and proc.poll() is None:os.killpg(proc.pid,signal.SIGKILL);proc.wait(timeout=5)
  if root.exists() or root.is_symlink():cleanup_case(root,batch)
def output_fd(output):
 if not output.is_absolute() or output.name!=RESULT:raise RuntimeError("fixed absolute result required")
 p=output.parent
 if p.parent!=TMP or not re.fullmatch(r"leetplus-capture-acceptance-results-[a-f0-9]{32}",p.name):raise RuntimeError("result parent differs")
 i=p.lstat()
 if p.is_symlink() or i.st_uid or i.st_mode&0o777!=0o700:raise RuntimeError("result parent not root-private")
 d=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);opened=os.fstat(d);current=p.lstat()
 if (i.st_dev,i.st_ino)!=(opened.st_dev,opened.st_ino) or (opened.st_dev,opened.st_ino)!=(current.st_dev,current.st_ino):os.close(d);raise RuntimeError("result parent identity changed")
 try:os.stat(RESULT,dir_fd=d,follow_symlinks=False);os.close(d);raise RuntimeError("result leaf already exists")
 except FileNotFoundError:return d
def optional_unshare_check():
 proc=None
 try:
  proc=subprocess.Popen(["/usr/bin/unshare","--net","--kill-child=KILL","--fork","/usr/bin/true"],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
  try:out,err=proc.communicate(timeout=5)
  except subprocess.TimeoutExpired:
   os.killpg(proc.pid,signal.SIGKILL);out,err=proc.communicate(timeout=5);return {"decision":"SKIP_NOT_ACCEPTED","errorCategory":"TimeoutExpired","killWaitCompleted":proc.poll() is not None}
  return {"decision":"PASS_CAPABILITY_ONLY_NOT_ISOLATION_ACCEPTANCE" if proc.returncode==0 else "SKIP_NOT_ACCEPTED","exitCode":proc.returncode,"stdoutBytes":len(out),"stderrSha256":sha(err),"stderrBytes":len(err)}
 except OSError as error:return {"decision":"SKIP_NOT_ACCEPTED","errorCategory":type(error).__name__}
 finally:
  if proc is not None and proc.poll() is None:os.killpg(proc.pid,signal.SIGKILL);proc.wait(timeout=5)
def parent(output):
 guard();bundle=verify_bundle();started=dt.datetime.now(dt.timezone.utc);deadline=time.monotonic()+60;batch=Path(tempfile.mkdtemp(prefix="leetplus-capture-acceptance-batch-",dir=TMP));os.chmod(batch,0o700);results=[]
 try:
  for case in CASES:
   root=Path(tempfile.mkdtemp(prefix="case-",dir=batch));os.chmod(root,0o700)
   try:
    nonce=secrets.token_hex(16);marker={"case":case,"parentPid":os.getpid(),"nonce":nonce,"tmpDevice":TMP.stat().st_dev,"tmpInode":TMP.stat().st_ino,"batchInode":batch.stat().st_ino,"caseInode":root.stat().st_ino};fd=os.open(root/".auth.json",os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
    with os.fdopen(fd,"wb") as f:f.write(canon(marker));f.flush();os.fsync(f.fileno())
    sync=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);os.fsync(sync);os.close(sync)
    remaining=deadline-time.monotonic()
    if remaining<=5:raise RuntimeError("overall case deadline exhausted")
    v=parent_case(case,root,batch,nonce,min(25,remaining-5));v["cleanupAbsence"]=not root.exists();results.append(v)
   finally:
    if root.exists() or root.is_symlink():cleanup_case(root,batch)
 finally:
  if batch.exists():
   if any(batch.iterdir()):raise RuntimeError("owned batch residue")
   batch.rmdir()
 def stream_exact(t,name):
  raw=base64.b64decode(t[name+"Base64"],validate=True)
  return len(raw)==t[name+"Bytes"] and sha(raw)==t[name+"Sha256"] and t[name+"ObservedBytes"]>=len(raw)
 def clean_group(t):return t["waitCompleted"] and t["residueScanComplete"] and t["processGroupResidue"] is False and t["cleanupErrorCategory"] is None
 def cap_ok(v):
  t=v["value"]["trace"]
  return v["value"]["clean"] is False and t["errorCategory"]=="OverflowError" and t["stdoutBytes"]==262144 and t["stdoutObservedBytes"]>262144 and t["stdoutCapped"] and not t["stdoutComplete"] and t["killAttempted"] and clean_group(t) and stream_exact(t,"stdout")
 def nonzero_ok(v):
  t=v["value"]["trace"]
  return v["value"]["clean"] is False and t["exitCode"]==3 and t["stdoutComplete"] and t["stderrComplete"] and t["stderrBytes"]==3 and base64.b64decode(t["stderrBase64"],validate=True)==b"bad" and clean_group(t) and stream_exact(t,"stdout") and stream_exact(t,"stderr")
 def timeout_ok(v):
  t=v["value"]["trace"]
  return v["value"]["clean"] is False and t["timedOut"] and t["identityConfirmed"] and t["killAttempted"] and t["signal"]==signal.SIGKILL and t["exitCode"]==-signal.SIGKILL and clean_group(t) and stream_exact(t,"stdout") and stream_exact(t,"stderr")
 def meta_ok(item,raw_sha):
  meta=item["metadata"]
  return meta["uid"]==0 and meta["mode"]=="0o400" and meta["nlink"]==1 and meta["sha256"]==raw_sha and item["rawSha256"]==raw_sha and item["rawBytes"]>0
 def audit_ok(v):
  value=v["value"];i=value["intent"];t=value["terminal"]
  try:dt.datetime.fromisoformat(t["truthTimestamp"].replace("Z","+00:00"))
  except ValueError:return False
  return value["collisionRejected"] and value["entries"]==["intent.json","terminal.json"] and value["rootMetadata"]["mode"]=="0o700" and meta_ok(i,i["rawSha256"]) and meta_ok(t,t["rawSha256"])
 def orchestration_ok(v):
  x=v["value"];lock=x["lock"];t=x["childTrace"]
  return x["resultDecision"]=="DIAGNOSTIC_CAPTURED_NOT_ISOLATION_PASS" and x["terminalDecision"]==x["resultDecision"] and x["terminalMatchesPhase"] and x["unlockBeforeTerminal"] and x["publicationTruth"] and x["operationEntries"]==["intent.json","terminal.json"] and lock["released"] and lock["lockHeldDuringChild"] and not lock["lockHeldDuringTerminalPublication"] and lock["heldElapsedSeconds"]<=22 and t["stdoutComplete"] and t["stderrComplete"] and clean_group(t) and stream_exact(t,"stdout") and stream_exact(t,"stderr")
 def uncertain_ok(v):
  x=v["value"]
  return x["resultDecision"]=="RECOVERY_REQUIRED" and x["lock"]["releaseErrorCategory"]=="OSError" and not x["lock"]["released"] and x["operationEntries"]==["intent.json"] and x["terminalSha256"] is None and x["terminalDecision"] is None
 expected={"full":lambda v:v["value"]["clean"] and v["value"]["closeFdsSentinelRejected"] and clean_group(v["value"]["trace"]) and stream_exact(v["value"]["trace"],"stdout"),"cap":cap_ok,"nonzero":nonzero_ok,"timeout":timeout_ok,"flock":lambda v:v["value"]["contentionRejected"] and v["value"]["released"] and v["value"]["sourceLockMetadata"]["inode"]>0,"audit":audit_ok,"alarm":lambda v:v["value"]["sigalrm"],"orchestration":orchestration_ok,"release-uncertain":uncertain_ok}
 if not all(v["cleanupAbsence"] and expected[v["case"]](v) for v in results):raise RuntimeError("capture mechanics acceptance failed")
 receipt={"contract":"LEETPLUS_NETLINK_CAPTURE_LINUX_ACCEPTANCE_V1","decision":"DISPOSABLE_MECHANICS_PASS_NOT_NETNS_ACCEPTANCE","captureSourceSha256":CAPTURE_SHA,"fixtureSha256":sha(exact_bytes(Path(__file__))),"bundleCopiesSha256":bundle,"bundleCopiesVerifiedOnly":[D_COPY.name,P_COPY.name,STAGE_COPY.name],"runtimeSurfacesExercised":["C333 run_bounded_child","C333 acquire_lock","C333 open_private_root/write_exclusive","C333 capture_once with injected fixed baseline/P/D-root but real Linux lock/child/audit","Linux SIGALRM/setitimer"],"captureOnceDisposableInjectedOrchestrationPassed":True,"captureOnceProductionOrchestrationAccepted":False,"productionBaselineAndToolsAccepted":False,"realDUnshareNetlinkAccepted":False,"startedAt":started.isoformat(),"completedAt":dt.datetime.now(dt.timezone.utc).isoformat(),"cases":results,"productionEffects":False,"unshareCapability":optional_unshare_check(),"unshareCapabilityIsMechanicsGate":False}
 d=output_fd(output)
 try:
  fd=os.open(RESULT,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400,dir_fd=d)
  with os.fdopen(fd,"wb") as f:f.write(canon(receipt));f.flush();os.fsync(f.fileno())
  os.fsync(d)
 finally:os.close(d)
 print(json.dumps({"decision":receipt["decision"],"receiptSha256":sha(canon(receipt))}))
def main():
 p=argparse.ArgumentParser();p.add_argument("--child",choices=CASES);p.add_argument("--case-root",type=Path);p.add_argument("--parent-pid",type=int);p.add_argument("--nonce");p.add_argument("--output",type=Path);a=p.parse_args()
 if a.child and a.case_root and a.parent_pid and a.nonce:child(a)
 elif a.output:parent(a.output)
 else:raise SystemExit("fixed output or internal child arguments required")
if __name__=="__main__":main()
