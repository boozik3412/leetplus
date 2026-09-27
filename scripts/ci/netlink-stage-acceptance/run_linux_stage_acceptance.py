"""Disposable Linux acceptance for exact stage source 828cc35c.

Never run on the LeetPlus host. All writes are restricted to one mkdtemp root
and one caller-selected exclusive result file outside that root.
"""
from __future__ import annotations
import argparse, contextlib, datetime as dt, fcntl, hashlib, importlib.util, io
import json, os, re, secrets, shutil, signal, socket, stat, subprocess, sys, tempfile, time
import types
from pathlib import Path

SOURCE_SHA="828cc35c78df40d061c6f2330ed9143d9a6e09b9fc900f2c161029e7177c8e0a"
CONTROL_TEST_SHA="d2d6b0c387074010ab0e855bd2990779337043a6739a7b14390cdab2f87d8336"
OBSERVER_TEST_SHA="29c1df6eab9db78e04892096b7b80515ea5abfd820d7204fb83321e23e73b941"
PRODUCTION_MACHINE_SHA="de72d444d9266e6c4f1ac7e76f0d4e4e0866ca1da4aa0a7f2808835fa3bd3423"
CASES=("success","prewrite-delay","partial-after-D","lock-contention","symlink-reject","o-excl-collision","modified-content","inode-mismatch")
ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/"netlink_diagnostic_stage_remote_v1.py"
TMP_BASE=Path("/tmp")
RESULT_LEAF="linux-stage-acceptance-result.json"

def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(v):return (json.dumps(v,ensure_ascii=False,indent=2)+"\n").encode()
def host_guard():
 if sys.platform!="linux":raise RuntimeError("Linux acceptance requires Linux")
 machine=sha(Path("/etc/machine-id").read_bytes().strip())
 if socket.gethostname()=="1337s" or machine==PRODUCTION_MACHINE_SHA:raise RuntimeError("production host is forbidden")
 if os.geteuid()!=0:raise RuntimeError("disposable Linux acceptance requires root for exact UID metadata checks")
 return {"platform":sys.platform,"hostname":socket.gethostname(),"machineIdSha256":machine,"python":sys.version,"euid":0}
def trusted_tmp_base():
 path=TMP_BASE;before=path.lstat()
 if path.is_symlink() or not stat.S_ISDIR(before.st_mode) or before.st_uid!=0 or before.st_mode&0o7777!=0o1777:raise RuntimeError("literal /tmp trust differs")
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  opened=os.fstat(fd);current=path.lstat();ident=lambda x:(x.st_dev,x.st_ino,x.st_uid,x.st_mode&0o7777)
  if ident(before)!=ident(opened) or ident(opened)!=ident(current):raise RuntimeError("literal /tmp identity changed")
  return {"path":"/tmp","device":before.st_dev,"inode":before.st_ino,"uid":0,"mode":"01777"}
 finally:os.close(fd)
def load_source():
 raw=SOURCE.read_bytes()
 if sha(raw)!=SOURCE_SHA:raise RuntimeError("pinned stage copy differs")
 module=types.ModuleType("stage_828cc_exact_bytes");module.__file__=str(SOURCE)
 exec(compile(raw,str(SOURCE),"exec"),module.__dict__)
 return module,raw
def safe_exact(path,expected,mode=0o400,inode=None,maximum=1024*1024):
 info=path.lstat()
 if not stat.S_ISREG(info.st_mode) or path.is_symlink() or info.st_uid!=os.geteuid() or info.st_nlink!=1 or info.st_mode&0o777!=mode or info.st_size>maximum:raise RuntimeError("fixture protected file differs")
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  opened=os.fstat(fd);raw=bytearray()
  while True:
   block=os.read(fd,65536)
   if not block:break
   if len(raw)+len(block)>maximum:raise RuntimeError("fixture file exceeds bound")
   raw.extend(block)
  after=os.fstat(fd)
  ident=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mtime_ns)
  if ident(info)!=ident(opened) or ident(opened)!=ident(after) or sha(raw)!=expected or (inode is not None and info.st_ino!=inode):raise RuntimeError("fixture file identity differs")
  return {"inode":info.st_ino,"device":info.st_dev,"sha256":expected,"mode":oct(mode),"nlink":1}
 finally:os.close(fd)
def safe_private(path,inode=None):
 info=path.lstat()
 if not stat.S_ISDIR(info.st_mode) or path.is_symlink() or info.st_uid!=os.geteuid() or info.st_mode&0o777!=0o700 or (inode is not None and info.st_ino!=inode):raise RuntimeError("fixture private dir differs")
 return info
def safe_lock(path):
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:fcntl.flock(fd,fcntl.LOCK_SH|fcntl.LOCK_NB);return fd,path.stat().st_ino
 except Exception:os.close(fd);raise
def parse_stage_output(text):
 lines=[line for line in text.splitlines() if line.strip()]
 if len(lines)!=1:raise RuntimeError("stage output cardinality differs")
 return json.loads(lines[0])
def validate_case_root(case,path,parent_pid,nonce):
 host_guard();tmp_identity=trusted_tmp_base()
 path=Path(path).resolve(strict=True);parent=path.parent;tmp=TMP_BASE
 if parent.parent!=tmp or not parent.name.startswith("leetplus-stage-acceptance-batch-") or not path.name.startswith("case-") or parent_pid!=os.getppid() or not isinstance(nonce,str) or not re.fullmatch(r"[a-f0-9]{32}",nonce):raise RuntimeError("child root authorization scope differs")
 for item in (parent,path):
  info=item.lstat()
  if item.is_symlink() or not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o777!=0o700:raise RuntimeError("child root ownership/mode differs")
 marker=path/".case-authorization.json";fd=os.open(marker,os.O_RDONLY|os.O_NOFOLLOW)
 try:info=os.fstat(fd);raw=os.read(fd,4097)
 finally:os.close(fd)
 value=json.loads(raw)
 if len(raw)>4096 or raw!=canonical(value) or not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_nlink!=1 or info.st_mode&0o777!=0o400 or value!={"case":case,"parentPid":parent_pid,"nonce":nonce,"tmpDevice":tmp_identity["device"],"tmpInode":tmp_identity["inode"],"batchDevice":parent.stat().st_dev,"batchInode":parent.stat().st_ino,"caseDevice":path.stat().st_dev,"caseInode":path.stat().st_ino}:raise RuntimeError("child one-use marker differs")
 consumed=path/".case-authorization.consumed.json"
 if consumed.exists() or consumed.is_symlink():raise RuntimeError("child one-use marker already consumed")
 os.rename(marker,consumed)
 sync=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(sync)
 finally:os.close(sync)
 return path
def execute_stage(module,case,temp):
 code_root=temp/"code";lock=temp/"control.lock";lock.write_bytes(b"");os.chmod(lock,0o600)
 module.CODE_ROOT=code_root;module.OP_ROOT=temp/"op";module.LOCK=lock
 module.load_p_module=lambda _raw:object();calls={"baseline":0};original_write=module.write_leaf
 def baseline(_):
  calls["baseline"]+=1
  if case=="prewrite-delay" and calls["baseline"]==2:time.sleep(6)
  return {"bootId":"fixture"}
 def write(path,raw,wrote,label):
  result=original_write(path,raw,wrote,label)
  if case=="partial-after-D" and label=="D-created":time.sleep(6)
  return result
 module.check_baseline=baseline;module.acquire_lock=lambda:safe_lock(lock)
 real_sync=module.sync_dir
 def sync(path):
  path=Path(path)
  if path==Path("/run"):path=temp
  if path!=temp and temp not in path.parents:raise RuntimeError("sync_dir escaped owned temp scope")
  return real_sync(path)
 module.write_leaf=write;module.sync_dir=sync
 held=None
 if case=="lock-contention":held=os.open(lock,os.O_RDONLY);fcntl.flock(held,fcntl.LOCK_EX|fcntl.LOCK_NB)
 output=io.StringIO()
 with contextlib.redirect_stdout(output):
  try:module.stage("a"*64,"b"*64)
  except SystemExit as error:exit_code=error.code
  except BlockingIOError:exit_code=77
 if held is not None:fcntl.flock(held,fcntl.LOCK_UN);os.close(held)
 result={"exitCode":exit_code,"stage":None if exit_code==77 else parse_stage_output(output.getvalue()),"codeRootExists":code_root.exists(),"entries":sorted(p.name for p in code_root.iterdir()) if code_root.exists() else []}
 probe=os.open(lock,os.O_RDONLY);fcntl.flock(probe,fcntl.LOCK_EX|fcntl.LOCK_NB);fcntl.flock(probe,fcntl.LOCK_UN);os.close(probe);result["lockReleased"]=True
 return result
def isolated_case(case,name):
 guard=host_guard();module,raw=load_source()
 temp=Path(name).resolve(strict=True);info=temp.lstat()
 if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o777!=0o700:raise RuntimeError("parent-owned case root differs")
 root_inode=info.st_ino
 try:
  if case in ("success","prewrite-delay","partial-after-D","lock-contention"):result=execute_stage(module,case,temp)
  elif case=="symlink-reject":
   target=temp/"target";target.write_bytes(b"x");link=temp/"link";link.symlink_to(target)
   try:os.open(link,os.O_RDONLY|os.O_NOFOLLOW);raise AssertionError("O_NOFOLLOW symlink accepted")
   except OSError as error:result={"rejected":True,"errno":error.errno}
  elif case=="o-excl-collision":
   leaf=temp/"collision";leaf.write_bytes(b"old");wrote=[]
   try:module.write_leaf(leaf,b"new",wrote,"collision");raise AssertionError("O_EXCL collision accepted")
   except FileExistsError:result={"rejected":True,"originalSha256":sha(leaf.read_bytes()),"markers":wrote}
  elif case=="modified-content":
   leaf=temp/"modified";leaf.write_bytes(b"actual");os.chmod(leaf,0o400)
   try:module.exact_file(leaf,sha(b"expected"));raise AssertionError("modified content accepted")
   except RuntimeError:result={"rejected":True,"actualSha256":sha(leaf.read_bytes())}
  else:
   leaf=temp/"inode";leaf.write_bytes(b"actual");os.chmod(leaf,0o400)
   try:module.exact_file(leaf,sha(b"actual"),inode=leaf.stat().st_ino+1);raise AssertionError("wrong inode accepted")
   except RuntimeError:result={"rejected":True,"actualInode":leaf.stat().st_ino}
  stage_case=case in ("success","prewrite-delay","partial-after-D","lock-contention")
  tested={"symlink-reject":"os.open(O_NOFOLLOW)","o-excl-collision":"stage.write_leaf","modified-content":"stage.exact_file","inode-mismatch":"stage.exact_file"}.get(case,"stage.stage")
  patches=["CODE_ROOT","OP_ROOT","LOCK","load_p_module","check_baseline","acquire_lock","sync_dir_run_redirect_to_temp"] if stage_case else []
  result.update(case=case,tempRoot=str(temp),tempRootInode=root_inode,sourceSha256=sha(raw),guard=guard,testedFunction=tested,patchedSurfaces=patches)
  return result
 finally:pass
def child_main(case,case_root,parent_pid,nonce):print(json.dumps(isolated_case(case,validate_case_root(case,case_root,parent_pid,nonce)),sort_keys=True))
def inventory_owned(path,maximum=32):
 root=path.resolve(strict=True);items=[]
 for candidate in root.rglob("*"):
  if len(items)>=maximum:raise RuntimeError("owned residue inventory exceeds bound")
  info=candidate.lstat();entry={"path":str(candidate.relative_to(root)),"mode":oct(info.st_mode&0o777),"inode":info.st_ino,"kind":"symlink" if candidate.is_symlink() else "directory" if candidate.is_dir() else "file"}
  if entry["kind"]=="file" and info.st_size<=1024*1024:entry["sha256"]=sha(candidate.read_bytes())
  items.append(entry)
 return items
def remove_owned(path,batch):
 path=path.resolve(strict=True);batch=batch.resolve(strict=True)
 if path.parent!=batch or not path.name.startswith("case-") or batch not in path.parents:raise RuntimeError("refusing cleanup outside parent-owned batch")
 shutil.rmtree(path)
 if path.exists() or path.is_symlink():raise RuntimeError("parent-owned cleanup incomplete")
def trusted_output_parent(output,batch):
 trusted_tmp_base()
 output=Path(output)
 if not output.is_absolute() or output.name!=RESULT_LEAF or output.exists() or output.is_symlink():raise RuntimeError("exact new result leaf required")
 parent=output.parent
 if parent.parent!=TMP_BASE or not re.fullmatch(r"leetplus-stage-acceptance-results-[a-f0-9]{32}",parent.name) or ROOT==parent or ROOT in parent.parents or batch==parent or batch in parent.parents:raise RuntimeError("result directory is outside approved private /tmp scope")
 for denied in (Path("/run"),Path("/etc"),Path("/var/lib/leetplus"),Path("/srv/leetplus"),Path("/root")):
  if parent==denied or denied in parent.parents:raise RuntimeError("system/LeetPlus result directory forbidden")
 before=parent.lstat()
 if parent.is_symlink() or not stat.S_ISDIR(before.st_mode) or before.st_uid!=0 or before.st_mode&0o777!=0o700:raise RuntimeError("result directory must be pre-existing root-private 0700")
 fd=os.open(parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);opened=os.fstat(fd);current=os.stat(parent,follow_symlinks=False);ident=lambda x:(x.st_dev,x.st_ino,x.st_uid,x.st_mode&0o777)
 if ident(before)!=ident(opened) or ident(opened)!=ident(current):os.close(fd);raise RuntimeError("result directory identity changed")
 return fd
def run_parent_case(case,case_root,batch,timeout,nonce):
 process=None;stdout="";stderr="";residue=[]
 try:
  process=subprocess.Popen([sys.executable,"-I","-B",str(Path(__file__).resolve()),"--child",case,"--case-root",str(case_root),"--parent-pid",str(os.getpid()),"--nonce",nonce],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
  try:stdout,stderr=process.communicate(timeout=timeout)
  except subprocess.TimeoutExpired:
   os.killpg(process.pid,signal.SIGKILL);stdout,stderr=process.communicate(timeout=5)
   raise TimeoutError(f"case timed out: {case}")
  residue=inventory_owned(case_root)
  if process.returncode or stderr or len(stdout)>1024*1024:raise RuntimeError(f"case failed: {case}: {stderr[:200]}")
  value=json.loads(stdout);value["rawStdout"]=stdout;value["rawStdoutSha256"]=sha(stdout.encode());value["rawStdoutBytes"]=len(stdout.encode());value["parentOwnedResidueBeforeCleanup"]=residue
  return value
 finally:
  if process is not None and process.poll() is None:
   os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=5)
  if case_root.exists() or case_root.is_symlink():
   if not residue:
    try:residue=inventory_owned(case_root)
    except Exception:residue=[{"inventory":"FAILED"}]
   remove_owned(case_root,batch)
def parent_main(output):
 host_guard();tmp_identity=trusted_tmp_base();started=dt.datetime.now(dt.timezone.utc);deadline=time.monotonic()+60;results=[]
 batch=Path(tempfile.mkdtemp(prefix="leetplus-stage-acceptance-batch-",dir=TMP_BASE));os.chmod(batch,0o700)
 try:
  for case in CASES:
   remaining=deadline-time.monotonic()
   if remaining<=0:raise TimeoutError("overall disposable acceptance deadline exceeded")
   case_root=Path(tempfile.mkdtemp(prefix="case-",dir=batch));os.chmod(case_root,0o700)
   nonce=secrets.token_hex(16);marker={"case":case,"parentPid":os.getpid(),"nonce":nonce,"tmpDevice":tmp_identity["device"],"tmpInode":tmp_identity["inode"],"batchDevice":batch.stat().st_dev,"batchInode":batch.stat().st_ino,"caseDevice":case_root.stat().st_dev,"caseInode":case_root.stat().st_ino}
   marker_path=case_root/".case-authorization.json";fd=os.open(marker_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
   with os.fdopen(fd,"wb") as stream:stream.write(canonical(marker));stream.flush();os.fsync(stream.fileno())
   value=run_parent_case(case,case_root,batch,min(20,remaining),nonce)
   value["cleanupOwnedScopeAbsent"]=not case_root.exists();results.append(value)
 finally:
  if batch.exists():
   if any(batch.iterdir()):raise RuntimeError("batch contains foreign residue after case cleanup")
   batch.rmdir()
 expectations={"success":lambda v:v["exitCode"]==0 and v["stage"]["decision"]=="EXACT_TWO_PROTECTED_SOURCES_STAGED","prewrite-delay":lambda v:v["exitCode"]==2 and not v["codeRootExists"],"partial-after-D":lambda v:v["exitCode"]==2 and v["entries"]==["bridge_ns_netlink_diagnostic.py"],"lock-contention":lambda v:v["exitCode"]==2 and not v["codeRootExists"] and v["stage"]["decision"]=="HOLD_BEFORE_STAGE","symlink-reject":lambda v:v["rejected"],"o-excl-collision":lambda v:v["rejected"] and v["markers"]==[] and v["originalSha256"]==sha(b"old"),"modified-content":lambda v:v["rejected"] and v["actualSha256"]==sha(b"actual"),"inode-mismatch":lambda v:v["rejected"] and v["actualInode"]>0}
 if not all(v["cleanupOwnedScopeAbsent"] and v["lockReleased"] if "lockReleased" in v else v["cleanupOwnedScopeAbsent"] for v in results) or not all(expectations[v["case"]](v) for v in results):raise RuntimeError("acceptance assertion failed")
 receipt={"contract":"LEETPLUS_NETLINK_STAGE_LINUX_ACCEPTANCE_V1","decision":"PASS","startedAt":started.isoformat(),"completedAt":dt.datetime.now(dt.timezone.utc).isoformat(),"fixtureSha256":sha(Path(__file__).read_bytes()),"stageSourceSha256":SOURCE_SHA,"controlTestReferenceSha256":CONTROL_TEST_SHA,"observerTestReferenceSha256":OBSERVER_TEST_SHA,"cases":results,"productionEffects":False,"linuxExecution":"EXECUTED_DISPOSABLE_ROOT_NON_PRODUCTION","acceptanceScope":{"nativeEffectSyscallsExercised":["SIGALRM","setitimer","O_EXCL","O_NOFOLLOW","fsync","flock"],"exactRootUidMetadataHelpersExercised":True,"productionFixedPathBaselineValidation":"NOT_ACCEPTED_BASELINE_SAFELY_INJECTED","hostRunDirectoryFsync":False,"nativeLockUsed":False}}
 parent=trusted_output_parent(output,batch)
 try:
  fd=os.open(RESULT_LEAF,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400,dir_fd=parent)
  with os.fdopen(fd,"wb") as stream:stream.write(canonical(receipt));stream.flush();os.fsync(stream.fileno())
  os.fsync(parent)
 finally:os.close(parent)
 print(json.dumps({"decision":"PASS","receiptSha256":sha(canonical(receipt))}))
def main():
 parser=argparse.ArgumentParser();parser.add_argument("--child",choices=CASES);parser.add_argument("--case-root",type=Path);parser.add_argument("--parent-pid",type=int);parser.add_argument("--nonce");parser.add_argument("--output",type=Path);args=parser.parse_args()
 if args.child and args.case_root and args.case_root.is_absolute() and args.parent_pid and args.nonce:child_main(args.child,args.case_root,args.parent_pid,args.nonce)
 elif args.output and args.output.is_absolute():parent_main(args.output)
 else:raise SystemExit("absolute --output or internal --child required")
if __name__=="__main__":main()
