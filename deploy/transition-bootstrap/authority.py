"""Public-only signature checks using the host's existing Node crypto runtime."""
import base64
import datetime
import json
import re
import subprocess

from native_boundary import canonical, require

CLEAN = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC'}
VERIFY_SCRIPT = """import crypto from 'node:crypto';import fs from 'node:fs';
const v=JSON.parse(fs.readFileSync(0,'utf8'));const k=crypto.createPublicKey(v.publicKey);
if(k.asymmetricKeyType!=='ed25519'||!crypto.verify(null,Buffer.from(v.message,'base64'),k,Buffer.from(v.signature,'base64')))process.exit(1);
process.stdout.write('PASS');"""
PUBLIC_SCRIPT = """import crypto from 'node:crypto';import fs from 'node:fs';
const v=JSON.parse(fs.readFileSync(0,'utf8'));const k=crypto.createPublicKey(v.publicKey);
if(k.asymmetricKeyType!=='ed25519'||v.publicKey.includes('PRIVATE'))process.exit(1);
process.stdout.write('PASS:'+crypto.createHash('sha256').update(k.export({format:'der',type:'spki'})).digest('hex'));"""
SIGNATURE = re.compile(r'[A-Za-z0-9+/]{86}==\Z')


def node_public_check(public_key, payload=None, signature=None, *, executable='/usr/bin/node'):
    require(isinstance(public_key, str) and len(public_key) <= 4096 and 'PRIVATE' not in public_key and
            public_key.startswith('-----BEGIN PUBLIC KEY-----\n') and
            public_key.endswith('-----END PUBLIC KEY-----\n'), 'Public-only Ed25519 PEM required')
    value = {'publicKey': public_key}
    if payload is not None:
        require(isinstance(signature, str) and SIGNATURE.fullmatch(signature), 'Invalid signature encoding')
        value.update({'message': base64.b64encode(canonical(payload)).decode(), 'signature': signature})
    result = subprocess.run([executable, '--input-type=module', '-e',
                            VERIFY_SCRIPT if payload is not None else PUBLIC_SCRIPT],
        input=canonical(value), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=CLEAN, timeout=15, check=False)
    if payload is None:
        valid = re.fullmatch(rb'PASS:[a-f0-9]{64}', result.stdout) is not None
    else:
        valid = result.stdout == b'PASS'
    require(result.returncode == 0 and valid and not result.stderr,
            'Public signature verification failed')
    return result.stdout.decode().removeprefix('PASS:') if payload is None else True


def instant(value):
    require(isinstance(value, str) and value.endswith('Z'), 'Canonical UTC instant required')
    parsed = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed.isoformat(timespec='milliseconds').replace('+00:00', 'Z') == value,
            'Canonical millisecond UTC instant required')
    return parsed


def verify_bounded_envelope(envelope, root, contract, *, at=None, maximum_minutes=30):
    require(isinstance(envelope, dict) and set(envelope) == {'approval', 'signature'},
            'Invalid approval envelope')
    approval = envelope['approval']
    require(isinstance(approval, dict) and approval.get('contract') == contract,
            'Invalid approval contract')
    start, end = instant(approval['issuedAt']), instant(approval['expiresAt'])
    now = at or datetime.datetime.now(datetime.timezone.utc)
    earliest = now if at is not None else now + datetime.timedelta(seconds=30)
    require(start <= earliest and end > now and
            end > start and end - start <= datetime.timedelta(minutes=maximum_minutes),
            'Approval expired or unbounded')
    node_public_check(root, approval, envelope['signature'])
    return approval
