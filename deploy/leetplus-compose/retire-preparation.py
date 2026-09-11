"""Archive an unserved preparation before restaging; retain the unpromoted DB.

No source-host, DNS, public nginx, promotion or live worker operation exists here.
Old generated files and evidence are preserved, not edited to claim a new SHA.
"""
import argparse
import fcntl
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

ROOT=Path('/srv/leetplus')
STATE=Path('/var/lib/leetplus-compose')
MIGRATION=Path('/srv/leetplus-migration')

def digest(value):return hashlib.sha256(value).hexdigest()

def run(args):
    return subprocess.check_output(args,text=True,timeout=180).strip()

def read(p):
    s=p.lstat()
    if p.is_symlink() or not p.is_file() or s.st_uid!=0 or s.st_nlink!=1 or s.st_mode&0o022 or s.st_size>1024*1024:
        raise ValueError('Untrusted preparation metadata')
    return p.read_bytes()

def main(old_sha,inbox,expected):
    if os.getuid()!=0 or not re.fullmatch('[a-f0-9]{40}',old_sha) or inbox.parent!=ROOT/'inbox' or not re.fullmatch('[a-f0-9]{40}',inbox.name) or inbox.name==old_sha:
        raise ValueError('Exact different old/new preparation SHA required')
    if not (STATE/'preparation-only').is_file():raise ValueError('Preparation marker required')
    lock=os.open(STATE/'control.lock',os.O_RDWR|os.O_NOFOLLOW)
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    if (STATE/'active.json').exists() or any((STATE/'operations').iterdir()):raise ValueError('Serving or pending deployment cannot be retired')
    if (STATE/'worker-grants').exists() and any((STATE/'worker-grants').iterdir()):raise ValueError('Live worker authority forbids retirement')
    admission_raw=read(inbox/'docker-admission.json')
    admission=json.loads(admission_raw)
    if digest(admission_raw)!=expected or admission.get('decision')!='PASS' or admission.get('releaseSha')!=inbox.name or admission.get('event')!='push' or admission.get('ref')!='refs/heads/main':
        raise ValueError('New exact-main admission required')
    if digest(read(inbox/'release.json'))!=admission['releaseManifestSha256']:
        raise ValueError('New release manifest mismatch')
    previous_raw=read(ROOT/'preparation.json')
    previous=json.loads(previous_raw)
    if previous['releaseSha']!=old_sha or previous['rehearsal']:
        raise ValueError('Previous preparation mismatch')
    old_release=json.loads(read(ROOT/'inbox'/old_sha/'release.json'))
    old_manifest=json.loads(read(Path('/usr/local/lib/leetplus-compose')/old_sha/'install-manifest.json'))
    for leaf,value in old_manifest['files'].items():
        if not re.fullmatch('[A-Za-z0-9_.@-]+',leaf) or leaf in ['.','..'] or digest(read(Path('/usr/local/lib/leetplus-compose')/old_sha/leaf))!=value:
            raise ValueError('Previous installed control changed')
    for leaf,value in previous['secretFiles'].items():
        if digest(read(ROOT/'secrets'/leaf))!=value:raise ValueError('Prepared secret bytes changed')
    query="SELECT pg_is_in_recovery(),pg_is_wal_replay_paused(),system_identifier::text FROM pg_control_system();"
    facts=run(['/usr/bin/docker','exec','leetplus-postgres','/usr/lib/postgresql/16/bin/psql','-XAt','-h','/tmp','-U','postgres','-d','leetplus','-c',query]).split('|')
    if len(facts)!=3 or facts[:2]!=['t','f'] or not (ROOT/'data/postgres/standby.signal').is_file():
        raise ValueError('Only an unpromoted, unpaused standby may be retained')
    standby=json.loads(read(MIGRATION/'evidence'/('standby-'+old_sha)/'result.json'))
    if digest(facts[2].encode())!=standby['sourceIdentitySha256']:
        raise ValueError('Standby source identity changed')
    ids=run(['/usr/bin/docker','ps','--all','--filter','label=ru.leetplus.contract=LEETPLUS_COMPOSE_BLUE_GREEN_V1','--format','{{.ID}}']).splitlines()
    containers=json.loads(run(['/usr/bin/docker','inspect',*ids]))
    allowed={'leetplus-postgres','leetplus-redis',*['leetplus-rehearsal-'+x for x in ['postgres','redis','api-blue','api-green','web-blue','web-green']]}
    for item in containers:
        name=item['Name'].lstrip('/')
        role=item['Config']['Labels']['ru.leetplus.role']
        image_role='api' if role.startswith('api-') else 'web' if role.startswith('web-') else role
        if name not in allowed or item['Image']!=old_release['images'][image_role] or item['Config']['Labels']['ru.leetplus.release']!=old_sha:
            raise ValueError('Unknown preparation container')
    paths=[ROOT/'secrets',ROOT/'preparation.json',ROOT/'compose.json',ROOT/'data/langame-sync',MIGRATION/'rehearsal']
    for p in paths:
        if p.is_symlink() or p.resolve()!=p or not p.exists():raise ValueError('Unexpected archive path')
    archive=MIGRATION/('retired-preparation-'+old_sha)
    archive.mkdir(mode=0o700,exist_ok=False)
    plan={'oldSha':old_sha,'newSha':inbox.name,'newAdmissionSha256':expected,'previousPreparationSha256':digest(previous_raw),
          'sourceIdentitySha256':standby['sourceIdentitySha256'],'containerIds':ids,'paths':[str(p) for p in paths]}
    (archive/'intent.json').write_text(json.dumps(plan,indent=2))
    # Only this non-serving project's containers; bind-mounted DB files remain.
    run(['/usr/bin/docker','stop','--time','60',*ids])
    stopped=json.loads(run(['/usr/bin/docker','inspect',*ids]))
    if any(i['State']['Running'] or i['State']['Pid']!=0 for i in stopped):raise ValueError('Preparation containers did not stop')
    run(['/usr/bin/docker','rm',*ids])
    # Docker cannot change the internal flag of an existing bridge. Remove only
    # this now-empty rehearsal project's exact networks before fresh rendering.
    for name,subnet in [('blue','172.31.50.0/24'),('green','172.31.51.0/24'),('data','172.31.52.0/24')]:
        network='leetplus-rehearsal-'+name
        observed=json.loads(run(['/usr/bin/docker','network','inspect',network]))[0]
        if observed.get('Containers') or observed.get('Labels',{}).get('com.docker.compose.project')!='leetplus-rehearsal' or observed['IPAM']['Config'][0]['Subnet']!=subnet:
            raise ValueError('Rehearsal network is not empty or changed identity')
        run(['/usr/bin/docker','network','rm',network])
    for p in paths:
        destination=archive/('langame-sync' if p==ROOT/'data/langame-sync' else p.name)
        p.rename(destination)
    if not (ROOT/'data/postgres/standby.signal').is_file():raise ValueError('Retained standby marker disappeared')
    result={**plan,'decision':'UNSERVED_PREPARATION_ARCHIVED','postgresDataRetained':True,'sourceChanged':False,'promoted':False}
    (archive/'result.json').write_text(json.dumps(result,indent=2))
    print(json.dumps({k:result[k] for k in ['decision','oldSha','newSha','postgresDataRetained','sourceChanged','promoted']}))

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--old-sha',required=True)
    p.add_argument('--new-inbox',type=Path,required=True)
    p.add_argument('--admission-sha256',required=True)
    a=p.parse_args()
    main(a.old_sha,a.new_inbox,a.admission_sha256)
