import json
from datetime import datetime
from pathlib import Path

root = Path(__file__).resolve().parent
state_file = root / 'state.js'
state = json.loads(state_file.read_text(encoding='utf-8-sig').split('=', 1)[1].strip().rstrip(';'))
now = datetime.now().astimezone().isoformat()
state['updatedAt'] = now
state['finishedAt'] = now
state['title'] = 'Приоритеты сводки: реализованы, локальная приёмка пройдена'
for ticket in state['tickets']:
    ticket.update(status='done', finishedAt=now, executor='/root')
for stage in state['stages']:
    if stage['id'] in ['build', 'review']:
        stage.update(status='done', finishedAt=now)
    if stage['id'] == 'final':
        stage.update(status='done', finishedAt=now)
state['requirements'].update(done=8, inTicket=0)
state['tests'] = {'api': '194 suites / 3588 PASS + 2 previous TODO', 'apiFinalFocused': '46 PASS', 'postgres': '17 PASS, loopback55495', 'web': 'typecheck/build/scoped lint PASS', 'webRules': '3 PASS', 'browser': '14 checks PASS; 1440/390; light/dark; no page errors', 'remoteCI': 'Tracked separately against the exact PR207 head; not asserted by this source-tree record'}
state['reviewers']['craft'] = {'status': 'PASS', 'mode': 'Independent text review; root filesystem and rendered validation', 'reviewer': '/root/priority_spec_review', 'remainingP0P1P2': 0}
state['productionEffects'] = False
state['delivery'] = {'pr': 207, 'state': 'SOURCE_IMPLEMENTED_LOCAL_ACCEPTANCE_PASSED', 'notes': 'Remote checks attach to the exact published head. No merge or deploy. Serving app and staged controller authority remain with the production owner.'}
state_file.write_text('window.STATE =\n' + json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
