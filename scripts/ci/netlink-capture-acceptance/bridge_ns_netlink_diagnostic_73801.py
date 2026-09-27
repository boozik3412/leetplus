"""Pure schemas and fact functions for the Branch-2 netns diagnostic (D)."""
from __future__ import annotations
import datetime as dt, hashlib, json, re

CHILD_CONTRACT="LEETPLUS_BRIDGE_NS_NETLINK_CHILD_FACTS_V1"
LAUNCH_RESULT_CONTRACT="LEETPLUS_BRIDGE_NS_NETLINK_LAUNCH_RESULT_V1"
TERMINAL_CONTRACT="LEETPLUS_BRIDGE_NS_NETLINK_DIAGNOSTIC_TERMINAL_V1"
TERMINAL_DECISION="DIAGNOSTIC_CAPTURED_NOT_ISOLATION_PASS"
UUID=re.compile(r"[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\Z")
HASH=re.compile(r"[a-f0-9]{64}\Z"); MAX_FACT_BYTES=256*1024
OLD_OPERATION="9afc7218-4757-4f44-87e1-6096706bad44"
UTC=re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{6})?Z\Z")
ROOT_PREFIX="/run/leetplus-browser-netlink-diagnostic-"

def canonical(v): return (json.dumps(v,ensure_ascii=False,indent=2)+"\n").encode()
def digest(raw): return hashlib.sha256(raw).hexdigest()
def exact_keys(v,keys,label):
    if not isinstance(v,dict) or set(v)!=set(keys): raise ValueError(f"{label} keys differ")
def strict_utc(value):
    if not isinstance(value,str) or not UTC.fullmatch(value):raise ValueError("exact canonical UTC Z timestamp required")
    try: parsed=dt.datetime.fromisoformat(value[:-1]+"+00:00")
    except ValueError as error:raise ValueError("exact canonical UTC Z timestamp required") from error
    if parsed.utcoffset()!=dt.timedelta(0) or parsed.isoformat().replace("+00:00","Z")!=value:raise ValueError("exact canonical UTC Z timestamp required")
    return parsed
def bounded_text(name,raw,maximum=MAX_FACT_BYTES):
    if not isinstance(raw,bytes) or len(raw)>maximum or b"\0" in raw: raise ValueError(f"{name} fact bytes exceed bounds")
    return raw.decode()
def mountinfo_sys_entry(raw):
    found=[]
    for line in bounded_text("mountinfo",raw).splitlines():
        f=line.split()
        if len(f)>=10 and f[4]=="/sys" and "-" in f:
            s=f.index("-"); found.append({"raw":line,"mountId":int(f[0]),"parentId":int(f[1]),"majorMinor":f[2],"root":f[3],"mountPoint":f[4],"options":f[5],"filesystemType":f[s+1],"mountSource":f[s+2]})
    if len(found)!=1: raise ValueError("exactly one /sys mountinfo entry required")
    return found[0]
def collect_facts(*,net_namespace,mount_namespace,interfaces,proc_net_dev,proc_net_route,proc_net_ipv6_route,sys_class_net,mountinfo):
    for label,x in (("net",net_namespace),("mount",mount_namespace)):
        exact_keys(x,{"device","inode"},f"{label} namespace")
        if not all(isinstance(x[k],int) and x[k]>0 for k in x): raise ValueError(f"{label} namespace identity is invalid")
    if not isinstance(interfaces,list) or len(interfaces)>64 or any(not isinstance(x,(list,tuple)) or len(x)!=2 or not isinstance(x[0],int) or x[0]<=0 or not isinstance(x[1],str) or not x[1] for x in interfaces): raise ValueError("if_nameindex facts are invalid")
    if not isinstance(sys_class_net,list) or len(sys_class_net)>64 or any(not isinstance(x,str) or not x or "/" in x for x in sys_class_net): raise ValueError("/sys/class/net facts are invalid")
    return {"schemaVersion":1,"contract":CHILD_CONTRACT,"decision":"FACTS_CAPTURED_NO_ASSERTION","netNamespace":dict(net_namespace),"mountNamespace":dict(mount_namespace),"interfaces":[{"index":i,"name":n} for i,n in interfaces],"procNetDev":bounded_text("procNetDev",proc_net_dev),"procNetRoute":bounded_text("procNetRoute",proc_net_route),"procNetIpv6Route":bounded_text("procNetIpv6Route",proc_net_ipv6_route),"sysClassNet":list(sys_class_net),"sysMountInfo":mountinfo_sys_entry(mountinfo),"isolationPassClaimed":False}

CHILD_SOURCE=r'''import json,os,socket
from pathlib import Path
def r(p,m=262144):
 d=os.open(p,os.O_RDONLY|os.O_NOFOLLOW);o=bytearray()
 try:
  while True:
   b=os.read(d,65536)
   if not b:break
   if len(o)+len(b)>m:raise ValueError("bounded fact exceeds limit")
   o.extend(b)
  return bytes(o)
 finally:os.close(d)
def sm(raw):
 a=[]
 for l in raw.decode().splitlines():
  f=l.split()
  if len(f)>=10 and f[4]=="/sys" and "-" in f:
   s=f.index("-");a.append({"raw":l,"mountId":int(f[0]),"parentId":int(f[1]),"majorMinor":f[2],"root":f[3],"mountPoint":f[4],"options":f[5],"filesystemType":f[s+1],"mountSource":f[s+2]})
 if len(a)!=1:raise ValueError("exactly one /sys mountinfo entry required")
 return a[0]
n=Path("/proc/self/ns/net").stat();m=Path("/proc/self/ns/mnt").stat();names=sorted(x.name for x in Path("/sys/class/net").iterdir())
if len(names)>64:raise ValueError("too many interfaces")
v={"schemaVersion":1,"contract":"LEETPLUS_BRIDGE_NS_NETLINK_CHILD_FACTS_V1","decision":"FACTS_CAPTURED_NO_ASSERTION","netNamespace":{"device":n.st_dev,"inode":n.st_ino},"mountNamespace":{"device":m.st_dev,"inode":m.st_ino},"interfaces":[{"index":i,"name":x} for i,x in socket.if_nameindex()],"procNetDev":r("/proc/net/dev").decode(),"procNetRoute":r("/proc/net/route").decode(),"procNetIpv6Route":r("/proc/net/ipv6_route").decode(),"sysClassNet":names,"sysMountInfo":sm(r("/proc/self/mountinfo")),"isolationPassClaimed":False}
print(json.dumps(v,ensure_ascii=False,indent=2)+"\n",end="")'''
CHILD_COMMAND=["/usr/bin/unshare","--net","--kill-child=KILL","--fork","/usr/bin/python3","-I","-B","-c",CHILD_SOURCE]

def parse_child(raw):
    if not isinstance(raw,bytes) or not raw or len(raw)>MAX_FACT_BYTES or b"\r" in raw: raise ValueError("child facts bytes are invalid")
    v=json.loads(raw)
    if raw!=canonical(v): raise ValueError("child facts are not canonical")
    rebuilt=collect_facts(net_namespace=v.get("netNamespace"),mount_namespace=v.get("mountNamespace"),interfaces=[(x.get("index"),x.get("name")) for x in v.get("interfaces",[])],proc_net_dev=v.get("procNetDev","").encode(),proc_net_route=v.get("procNetRoute","").encode(),proc_net_ipv6_route=v.get("procNetIpv6Route","").encode(),sys_class_net=v.get("sysClassNet"),mountinfo=(v.get("sysMountInfo",{}).get("raw","")+"\n").encode())
    if v!=rebuilt or v.get("isolationPassClaimed") is not False: raise ValueError("child facts are not diagnostic-only evidence")
    return v
def validate_launch_result(v):
    exact_keys(v,{"schemaVersion","contract","operationId","planSha256","diagnosticSourceSha256","launcherSourceSha256","launcherPreflightSha256","hostNetNamespace","completedAt","childExitCode","childStdoutSha256","childStdoutBytes","childStderrSha256","childStderrBytes","childCommandSha256","processGroupResidue","leetplusApplicationWrites","interfaceEnumerationMethod","localAfNetlinkLinkEnumerationPermitted","localAfNetlinkQueryObserved","forbiddenConnectionFamiliesAttempted","externalNetworkConnectionsAttempted","networkMutationRequested","effectsPerformed","auditWrites"},"launch result")
    if v["schemaVersion"]!=1 or v["contract"]!=LAUNCH_RESULT_CONTRACT or not UUID.fullmatch(v["operationId"]) or v["operationId"]==OLD_OPERATION or any(not HASH.fullmatch(v[k]) for k in ("planSha256","diagnosticSourceSha256","launcherSourceSha256","launcherPreflightSha256","childStdoutSha256","childStderrSha256","childCommandSha256")) or not isinstance(v["childStdoutBytes"],int) or v["childStdoutBytes"]<=0 or v["childExitCode"]!=0 or v["childStderrBytes"]!=0 or v["childStderrSha256"]!=digest(b"") or v["childCommandSha256"]!=digest(canonical(CHILD_COMMAND)) or v["processGroupResidue"] is not False or v["leetplusApplicationWrites"] is not False or v["interfaceEnumerationMethod"]!="socket.if_nameindex" or v["localAfNetlinkLinkEnumerationPermitted"] is not True or v["localAfNetlinkQueryObserved"] is not False or v["forbiddenConnectionFamiliesAttempted"]!=[] or v["externalNetworkConnectionsAttempted"] is not False or v["networkMutationRequested"] is not False: raise ValueError("launch result is not exact clean diagnostic completion")
    strict_utc(v["completedAt"])
    exact_keys(v["hostNetNamespace"],{"device","inode"},"host netns")
    if any(not isinstance(v["hostNetNamespace"][k],int) or v["hostNetNamespace"][k]<=0 for k in ("device","inode")):raise ValueError("host netns identity is invalid")
    root=ROOT_PREFIX+v["operationId"]
    expected_effects=["CREATE_ROOT_PRIVATE_OPERATION","WRITE_IMMUTABLE_INTENT","SPAWN_BOUNDED_NETNS_CHILD","WRITE_IMMUTABLE_TERMINAL"]
    expected_writes={"root":{"path":root,"ownerUid":0,"mode":"0700"},"intent":{"path":root+"/intent.json","ownerUid":0,"mode":"0400"},"terminal":{"path":root+"/terminal.json","ownerUid":0,"mode":"0400"}}
    if v["effectsPerformed"]!=expected_effects or v["auditWrites"]!=expected_writes:raise ValueError("launcher effects/audit writes differ from exact new operation scope")
    return v
def build_terminal(launch_result,child_raw):
    l=validate_launch_result(launch_result);c=parse_child(child_raw)
    if l["childStdoutSha256"]!=digest(child_raw) or l["childStdoutBytes"]!=len(child_raw):raise ValueError("launch result does not bind exact child stdout")
    return {"schemaVersion":1,"contract":TERMINAL_CONTRACT,"decision":TERMINAL_DECISION,"operationId":l["operationId"],"planSha256":l["planSha256"],"completedAt":l["completedAt"],"diagnosticSourceSha256":l["diagnosticSourceSha256"],"launcherSourceSha256":l["launcherSourceSha256"],"launcherPreflightSha256":l["launcherPreflightSha256"],"launchResultSha256":digest(canonical(l)),"childCommandSha256":digest(canonical(CHILD_COMMAND)),"hostNetNamespace":l["hostNetNamespace"],"childFacts":c,"childFactsSha256":digest(child_raw),"isolationPassClaimed":False,"leetplusApplicationWrites":False,"interfaceEnumerationMethod":"socket.if_nameindex","localAfNetlinkLinkEnumerationPermitted":True,"localAfNetlinkQueryObserved":False,"forbiddenConnectionFamiliesAttempted":[],"externalNetworkConnectionsAttempted":False,"networkMutationRequested":False,"effectsPerformed":l["effectsPerformed"],"auditWrites":l["auditWrites"]}
def validate_terminal(v,launch_result,child_raw):
    if v!=build_terminal(launch_result,child_raw):raise ValueError("diagnostic terminal differs from exact pure derivation")
    return v
def main():raise SystemExit("HOLD: pure diagnostic module; use reviewed P and separately authorized L")
if __name__=="__main__":main()
