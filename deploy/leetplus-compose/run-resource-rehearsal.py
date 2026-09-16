"""One admitted, bounded clone-only resource window; no production cutover."""
import json
import os
from pathlib import Path

from control_handoff import installed, run, secure, require

ROOT = Path('/srv/leetplus-migration/rehearsal')
CONTROL = Path(__file__).resolve().parent
UNIT = 'leetplus-rehearsal-resource-acceptance'


def main():
    require(os.getuid() == 0, 'Linux root required')
    target = installed(CONTROL.name, executor=True)
    require(target['root'] == CONTROL and target['release'].get('apiResourceProfile') == 'API_6G_V1', 'Exact admitted 6 GiB controller required')
    prepared = json.loads(secure(ROOT / 'preparation.json'))
    restored = json.loads(secure(ROOT / 'evidence/restore.json'))
    require(prepared.get('rehearsal') is True and prepared['releaseSha'] == CONTROL.name and
            restored.get('decision') == 'DATABASE_RESTORE_PASS' and restored['releaseSha'] == CONTROL.name,
            'Exact isolated preparation and restore required')
    require(not (ROOT / 'evidence/resource-window-active.json').exists() and
            not (ROOT / 'evidence/runtime-acceptance.json').exists(),
            'Existing resource window must be inspected/reconciled, never blindly replayed')
    script = "import fs from 'node:fs';import {renderCompose,canonical} from '" + (CONTROL / 'contract.mjs').as_uri() + "';const r=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(canonical(renderCompose({blue:r,green:r,rehearsal:true})));"
    expected = run(['/usr/bin/node', '--input-type=module', '-e', script], json.dumps(target['release']).encode()) + b'\n'
    require(secure(ROOT / 'compose.json') == expected, 'Rehearsal Compose differs from the admitted resource profile')
    attest = """import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {verifyContainer} from '""" + (CONTROL / 'contract.mjs').as_uri() + """';
const spec=JSON.parse(fs.readFileSync(0,'utf8'));
const docker=args=>JSON.parse(execFileSync('/usr/bin/docker',['--host','unix:///var/run/docker.sock','--config','/etc/leetplus-compose/docker-cli',...args],{encoding:'utf8',timeout:3000,maxBuffer:2*1024*1024}));
for(const role of ['api-blue','api-green','web-blue','web-green','postgres','redis']) {
 const service=spec.services[role],actual=docker(['inspect',service.container_name])[0];
 verifyContainer(actual,service,role,{imageEnvironment:docker(['image','inspect',service.image])[0].Config.Env,configurationOnly:true});
}
console.log('ATTESTED');"""
    require(run(['/usr/bin/node', '--input-type=module', '-e', attest], expected, timeout=45) == b'ATTESTED',
            'Observed clone mounts/network/environment/resources differ from the admitted spec')
    # systemd owns the timeout/ExecStopPost even if this caller or the Python
    # acceptance process dies. The cleanup helper accepts only its fixed private
    # pins file and cannot address a production container or a replacement ID.
    result = run([
        '/usr/bin/systemd-run', '--unit=' + UNIT, '--wait', '--collect',
        '--property=RuntimeMaxSec=900s', '--property=TimeoutStopSec=120s',
        '--property=KillMode=control-group', '--property=UMask=0077',
        '--property=ExecStopPost=/usr/bin/python3 ' + str(CONTROL / 'rehearsal_memory_guard.py') + ' cleanup-fixed',
        '/usr/bin/flock', '--shared', '--wait', '20', '/var/lib/leetplus-compose/control.lock',
        '/usr/bin/python3', str(CONTROL / 'accept-rehearsal.py'),
    ], timeout=1050)
    print(result.decode())


if __name__ == '__main__':
    main()
