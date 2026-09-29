"""Offline Windows signing of one exact predecessor bootstrap authority.

Input shape, linked evidence, public root and exact confirmation are validated
before Windows DPAPI private-key access. This code cannot authenticate the
origin of the confirmation: the dispatcher must retain its direct user GO.
No key generation, network, server or provider operation occurs here.
"""
import argparse
import base64
import ctypes
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat

from enrollment import validate_install_plan

HASH = re.compile(r'[a-f0-9]{64}\Z')
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\Z')
CONTRACTS = {
    'permit-a': ('LEETPLUS_A_BRIDGE_BOOTSTRAP_PERMIT_V1', 'permit', 30),
    'permit-bridge': ('LEETPLUS_BRIDGE_EXTERNAL_SUCCESSOR_PERMIT_V1', 'permit', 30),
    'execution': ('LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_EXECUTION', 'command', 30),
    'rollback': ('LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_ROLLBACK', 'command', 30),
    'no-effect': ('LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_NO_EFFECT', 'command', 30),
    'install': ('LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_APPROVAL', 'approval', 30),
    'runtime-provision': ('LEETPLUS_PREDECESSOR_BOOTSTRAP_RUNTIME_PROVISION_V1_APPROVAL', 'approval', 30),
    'v1-forward': ('LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_APPROVAL', 'approval', 240),
    'v1-rollback': ('LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_ROLLBACK_APPROVAL', 'approval', 240),
}
ROOT_DOMAIN = {
    'permit-a': 'permit', 'permit-bridge': 'permit',
    'execution': 'execution', 'rollback': 'rollback',
    'no-effect': 'noEffect', 'install': 'deployment',
    'runtime-provision': 'deployment',
    'v1-forward': 'deployment', 'v1-rollback': 'deployment',
}


def validate_linked_root(kind, linked, public_raw, public_der_sha256):
    """Prove actual public key belongs to a deployment-signed enrolled domain."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    domain = ROOT_DOMAIN[kind]
    evidence = linked.get('enrollmentEvidence')
    if domain == 'deployment' and kind == 'install':
        # Root enrollment does not exist yet. The direct GO is still bound to
        # this exact DER and the reviewed installer plan/source.
        if not isinstance(linked.get('deploymentRootPem'), str) or \
                linked['deploymentRootPem'].encode('ascii') != public_raw:
            raise ValueError('Deployment root differs from independently supplied source')
        return
    if not isinstance(evidence, dict) or set(evidence) != {
            'plan', 'approvalEnvelope', 'intent', 'receipt', 'record',
            'deploymentRootPem', 'publicRoots'}:
        raise ValueError('Signed root enrollment evidence required')
    plan = validate_install_plan(evidence['plan'])
    deployment_raw = evidence['deploymentRootPem'].encode('ascii')
    deployment = serialization.load_pem_public_key(deployment_raw)
    if not isinstance(deployment, Ed25519PublicKey):
        raise ValueError('Ed25519 deployment root required')
    roots = evidence['publicRoots']
    if not isinstance(roots, dict) or set(roots) != {'permit', 'execution', 'rollback', 'noEffect'}:
        raise ValueError('Closed enrolled public root set required')
    der_identities = set()
    deployment_der = deployment.public_bytes(serialization.Encoding.DER,
                                              serialization.PublicFormat.SubjectPublicKeyInfo)
    for name, value in roots.items():
        if not isinstance(value, str):
            raise ValueError('Enrolled root must be public PEM')
        raw = value.encode('ascii')
        key = serialization.load_pem_public_key(raw)
        if not isinstance(key, Ed25519PublicKey) or digest(raw) != plan['publicRoots'][name]:
            raise ValueError('Enrolled public root differs from signed installer plan')
        der = key.public_bytes(serialization.Encoding.DER,
                               serialization.PublicFormat.SubjectPublicKeyInfo)
        if der == deployment_der or der in der_identities:
            raise ValueError('Enrolled signing domains collapse to one key')
        der_identities.add(der)
    expected_raw = deployment_raw if domain == 'deployment' else roots[domain].encode('ascii')
    if public_raw != expected_raw:
        raise ValueError('Signing public root differs from exact enrolled domain')
    selected = deployment if domain == 'deployment' else serialization.load_pem_public_key(expected_raw)
    selected_der = selected.public_bytes(serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo)
    if digest(selected_der) != public_der_sha256:
        raise ValueError('Enrolled public DER identity differs')
    envelope = evidence['approvalEnvelope']
    if not isinstance(envelope, dict) or set(envelope) != {'approval', 'signature'}:
        raise ValueError('Signed installer approval envelope missing')
    approval = envelope['approval']
    if not isinstance(approval, dict) or set(approval) != {'contract', 'operationId',
            'hostIdentitySha256', 'planSha256', 'action', 'issuedAt', 'expiresAt'} or \
            approval['contract'] != 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_APPROVAL' or \
            approval['operationId'] != plan['operationId'] or \
            approval['action'] != plan['action'] or \
            approval['hostIdentitySha256'] != plan['hostIdentitySha256'] or \
            approval['planSha256'] != digest(canonical(plan)):
        raise ValueError('Installer approval does not bind exact enrollment plan')
    try:
        deployment.verify(base64.b64decode(envelope['signature'], validate=True),
                          canonical(approval))
    except Exception as error:
        raise ValueError('Enrollment has no valid deployment-root signature') from error
    issued, expires = _instant(approval['issuedAt']), _instant(approval['expiresAt'])
    if expires <= issued or expires - issued > timedelta(minutes=30):
        raise ValueError('Installer approval window is unbounded')
    intent, receipt, record = (evidence[name] for name in ('intent', 'receipt', 'record'))
    if not isinstance(intent, dict) or set(intent) != {'contract', 'operationId',
            'planSha256', 'approvalSha256', 'authorizedAt'} or \
            intent['contract'] != plan['contract'] + '_INTENT' or \
            intent['operationId'] != plan['operationId'] or \
            intent['planSha256'] != digest(canonical(plan)) or \
            intent['approvalSha256'] != digest(canonical(envelope)) or \
            not issued <= _instant(intent['authorizedAt']) < expires:
        raise ValueError('Installer intent was not independently authorized')
    if not isinstance(receipt, dict) or set(receipt) != {'contract', 'decision',
            'operationId', 'planSha256', 'approvalSha256', 'intentSha256',
            'bundleSha256', 'publicRoots', 'hostIdentitySha256', 'acceptedAt'} or \
            receipt['contract'] != 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_RECEIPT' or \
            receipt['decision'] != 'PASS' or receipt['operationId'] != plan['operationId'] or \
            receipt['planSha256'] != digest(canonical(plan)) or \
            receipt['approvalSha256'] != digest(canonical(envelope)) or \
            receipt['intentSha256'] != digest(canonical(intent)) or \
            receipt['bundleSha256'] != plan['bundleSha256'] or \
            receipt['publicRoots'] != plan['publicRoots'] or \
            receipt['hostIdentitySha256'] != plan['hostIdentitySha256'] or \
            _instant(receipt['acceptedAt']) != _instant(intent['authorizedAt']):
        raise ValueError('Installer receipt differs from signed timely intent')
    expected_record = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_ENROLLMENT_V2',
        'decision': 'ACCEPTED', 'hostIdentitySha256': plan['hostIdentitySha256'],
        'bundleFiles': plan['bundleFiles'], 'bundleSha256': plan['bundleSha256'],
        'publicRoots': plan['publicRoots'],
        'installerReceiptSha256': digest(canonical(receipt))}
    if record != expected_record:
        raise ValueError('Enrollment record differs from accepted installer receipt')


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def checked_file(path, maximum=1024 * 1024):
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts or path.resolve(strict=True) != path:
        raise ValueError('Canonical absolute signing input required')
    info = path.stat(follow_symlinks=False)
    if path.is_symlink() or getattr(info, 'st_file_attributes', 0) & 0x400 or \
            not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > maximum:
        raise ValueError('Signing input is not one regular non-reparse file')
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0))
    try:
        before = os.fstat(fd)
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read(maximum + 1)
        after = os.fstat(fd)
        latest = path.stat(follow_symlinks=False)
        identity = lambda value: (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns)
        if len(raw) > maximum or len(raw) != before.st_size or \
                identity(before) != identity(after) or identity(after) != identity(latest):
            raise ValueError('Signing input changed while reading')
        return raw
    finally:
        os.close(fd)


def checked_json(path):
    raw = checked_file(path)
    value = json.loads(raw)
    if raw != canonical(value):
        raise ValueError('Signing input must be canonical LF JSON')
    return value, raw


def _instant(value):
    if not isinstance(value, str) or not value.endswith('Z'):
        raise ValueError('Canonical UTC instant required')
    date = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if date.isoformat(timespec='milliseconds').replace('+00:00', 'Z') != value:
        raise ValueError('Canonical millisecond UTC instant required')
    return date


def validate_statement(kind, statement, linked, expected_root_der, confirm, now=None):
    if kind not in CONTRACTS or not isinstance(statement, dict):
        raise ValueError('Unknown exact bootstrap signing domain')
    contract, _field, maximum = CONTRACTS[kind]
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None or current.utcoffset() != timedelta(0):
        raise ValueError('Signer clock must be aware UTC')
    identity = statement.get('placementId') if kind == 'runtime-provision' else statement.get('operationId')
    if statement.get('contract') != contract or not isinstance(identity, str) or not UUID.fullmatch(identity):
        raise ValueError('Signing contract or operation differs')
    issued, expires = _instant(statement.get('issuedAt')), _instant(statement.get('expiresAt'))
    if issued > current + timedelta(seconds=30) or expires <= current or \
            expires <= issued or expires - issued > timedelta(minutes=maximum):
        raise ValueError('Signing window is expired or unbounded')
    if not isinstance(linked, dict) or not HASH.fullmatch(expected_root_der or ''):
        raise ValueError('Exact linked source and public root required')
    values = linked
    if kind.startswith('permit-'):
        expected = values.get('expected')
        if not isinstance(expected, dict) or set(statement) != set(expected) | {'contract', 'issuedAt', 'expiresAt'} or \
                {name: value for name, value in statement.items() if name not in ('contract', 'issuedAt', 'expiresAt')} != expected:
            raise ValueError('Permit differs from independently observed host/source')
        if kind == 'permit-a' and statement.get('action') != 'PREPARE_A_BRIDGE_BOOTSTRAP':
            raise ValueError('A-to-bridge permit action differs')
        if kind == 'permit-bridge' and statement.get('action') != 'PREPARE_BRIDGE_EXTERNAL_SUCCESSOR':
            raise ValueError('Bridge-successor permit action differs')
        root_raw = linked['enrollmentEvidence']['publicRoots']['permit'].encode('ascii')
        bound_root = (statement.get('bootstrap', {}).get('publicRootSha256') if kind == 'permit-a'
                      else statement.get('verifier', {}).get('publicRootSha256'))
        if bound_root != digest(root_raw):
            raise ValueError('Permit does not bind enrolled public root bytes')
    elif kind in ('execution', 'rollback', 'no-effect'):
        plan = values.get('plan')
        if not isinstance(plan, dict) or statement.get('planSha256') != digest(canonical(plan)) or \
                statement['operationId'] != plan.get('operationId'):
            raise ValueError('Bootstrap command is not bound to exact plan')
        if kind == 'execution':
            if set(statement) != {'contract', 'operationId', 'planSha256', 'permitEnvelopeSha256',
                                  'effect', 'issuedAt', 'expiresAt'} or \
                    not isinstance(values.get('permitEnvelope'), dict) or \
                    statement['permitEnvelopeSha256'] != digest(canonical(values['permitEnvelope'])) or \
                    statement['effect'] != 'CONTROLLER_POINTER_ONLY':
                raise ValueError('Execution scope or permit differs')
        elif kind == 'rollback':
            receipt = values.get('forwardReceipt')
            if not isinstance(receipt, dict) or set(receipt) != {'contract', 'operationId',
                    'planSha256', 'permitEnvelopeSha256', 'executionEnvelopeSha256',
                    'oldPointer', 'newPointer', 'authorizedAt', 'intentSha256',
                    'acceptedAt', 'decision'} or \
                    receipt['contract'] != 'LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_PLAN_RECEIPT' or \
                    receipt['planSha256'] != digest(canonical(plan)) or \
                    receipt['oldPointer'] != plan.get('oldPointer') or \
                    receipt['newPointer'] != plan.get('newPointer') or \
                    not HASH.fullmatch(receipt['intentSha256']):
                raise ValueError('Rollback requires exact accepted forward receipt')
            if set(statement) != {'contract', 'operationId', 'planSha256', 'forwardReceiptSha256',
                                  'effect', 'issuedAt', 'expiresAt'} or \
                    not isinstance(values.get('forwardReceipt'), dict) or \
                    values['forwardReceipt'].get('decision') != 'PASS' or \
                    values['forwardReceipt'].get('operationId') != plan['operationId'] or \
                    statement['forwardReceiptSha256'] != digest(canonical(values['forwardReceipt'])) or \
                    statement['effect'] != 'CONTROLLER_POINTER_ROLLBACK_ONLY':
                raise ValueError('Rollback does not bind accepted forward receipt')
        else:
            intent = values.get('intent')
            phase = statement.get('phase')
            expected_contract = ('LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_PLAN_INTENT'
                if phase == 'FORWARD' else
                'LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_PLAN_ROLLBACK_INTENT')
            if not isinstance(intent, dict) or intent.get('contract') != expected_contract or \
                    intent.get('planSha256') != digest(canonical(plan)) or \
                    intent.get('oldPointer') != (plan.get('oldPointer') if phase == 'FORWARD' else plan.get('newPointer')) or \
                    intent.get('newPointer') != (plan.get('newPointer') if phase == 'FORWARD' else plan.get('oldPointer')):
                raise ValueError('Zero-effect requires exact pending intent')
            if phase == 'ROLLBACK':
                receipt = values.get('forwardReceipt')
                if not isinstance(receipt, dict) or receipt.get('contract') != \
                        'LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_PLAN_RECEIPT' or \
                        receipt.get('decision') != 'PASS' or \
                        receipt.get('planSha256') != digest(canonical(plan)) or \
                        intent.get('forwardReceiptSha256') != digest(canonical(receipt)):
                    raise ValueError('Zero-effect rollback lacks exact accepted forward receipt')
            if set(statement) != {'contract', 'operationId', 'planSha256', 'phase', 'intentSha256',
                                  'forwardReceiptSha256', 'effect', 'issuedAt', 'expiresAt'} or \
                    not isinstance(intent, dict) or \
                    intent.get('operationId') != plan['operationId'] or \
                    statement['phase'] not in ('FORWARD', 'ROLLBACK') or \
                    statement['intentSha256'] != digest(canonical(intent)) or \
                    statement['forwardReceiptSha256'] != (None if statement['phase'] == 'FORWARD' else
                                                           digest(canonical(values['forwardReceipt']))) or \
                    statement['effect'] != 'TERMINAL_RECORD_ONLY':
                raise ValueError('Zero-effect command differs from exact pending intent')
    elif kind == 'runtime-provision':
        plan = values.get('plan')
        request = values.get('request')
        evidence = values.get('enrollmentEvidence')
        required = {'contract', 'placementId', 'operationId', 'attemptId', 'command',
                    'hostIdentitySha256', 'bundleSha256', 'installerReceiptSha256',
                    'requestSha256', 'preimages', 'nativeLocks', 'effects'}
        effects = {'runtimeDirectoriesOnly': True, 'requestPlacementOnly': True,
            'controllerPointerMutation': False, 'applicationRestart': False,
            'systemdUnitMutation': False, 'dataMutation': False,
            'grantMutation': False, 'timerMutation': False, 'providerEffect': False}
        if not isinstance(plan, dict) or set(plan) != required or \
                plan.get('contract') != 'LEETPLUS_PREDECESSOR_BOOTSTRAP_RUNTIME_PROVISION_V1_PLAN' or \
                plan.get('effects') != effects or not isinstance(request, dict) or \
                set(request) != {'contract', 'command', 'operationId', 'attemptId', 'mode',
                                 'targetRelease', 'criticalNames', 'evidence', 'inputs'} or \
                request.get('contract') != 'LEETPLUS_PREDECESSOR_BOOTSTRAP_RPC_V1' or \
                plan['command'] not in ('observe', 'plan-v1', 'prepare', 'apply', 'reconcile',
                    'rollback', 'reconcile-rollback', 'terminalize-no-effect') or \
                any(request.get(field) != plan[field] for field in ('operationId', 'attemptId', 'command')) or \
                any(not isinstance(plan[field], str) or not UUID.fullmatch(plan[field]) for field in
                    ('placementId', 'operationId', 'attemptId')) or \
                any(not isinstance(plan[field], str) or not HASH.fullmatch(plan[field]) for field in
                    ('hostIdentitySha256', 'bundleSha256', 'installerReceiptSha256', 'requestSha256')) or \
                plan['requestSha256'] != digest(canonical(request)) or not isinstance(evidence, dict) or \
                plan['bundleSha256'] != evidence['record']['bundleSha256'] or \
                plan['installerReceiptSha256'] != digest(canonical(evidence['receipt'])) or \
                plan['hostIdentitySha256'] != evidence['plan']['hostIdentitySha256']:
            raise ValueError('Runtime provision scope or exact enrollment/request differs')
        state = '/var/lib/leetplus-transition-bootstrap'
        compose = '/var/lib/leetplus-compose'
        request_dir = state + '/requests/' + plan['placementId']
        expected = {state, state + '/requests', state + '/operations', state + '/attempts',
                    state + '/transition.lock', request_dir, request_dir + '/request.json',
                    compose + '/' + plan['placementId'] + '.transition-provision.intent.json',
                    compose + '/' + plan['placementId'] + '.transition-provision.receipt.json'}
        locks = {compose + '/standalone-install.lock', compose + '/control.lock'}
        if not isinstance(plan['preimages'], dict) or set(plan['preimages']) != expected or \
                not isinstance(plan['nativeLocks'], dict) or set(plan['nativeLocks']) != locks or \
                any(not isinstance(v, dict) or v.get('state') not in ('ABSENT', 'EXACT') or
                    set(v) != ({'state'} if v['state'] == 'ABSENT' else
                               {'state', 'device', 'inode', 'uid', 'gid', 'mode', 'ctimeNs'})
                    for v in [*plan['preimages'].values(), *plan['nativeLocks'].values()]) or \
                any(plan['preimages'][name] != {'state': 'ABSENT'} for name in
                    (request_dir, request_dir + '/request.json',
                     compose + '/' + plan['placementId'] + '.transition-provision.intent.json',
                     compose + '/' + plan['placementId'] + '.transition-provision.receipt.json')) or \
                any(v['state'] != 'EXACT' or v.get('mode') != 0o600 for v in plan['nativeLocks'].values()):
            raise ValueError('Runtime provision fixed path/lock map differs')
        if set(statement) != {'contract', 'placementId', 'hostIdentitySha256',
                              'planSha256', 'issuedAt', 'expiresAt'} or \
                statement['placementId'] != plan['placementId'] or \
                statement['hostIdentitySha256'] != plan['hostIdentitySha256'] or \
                statement['planSha256'] != digest(canonical(plan)):
            raise ValueError('Runtime provision approval differs from exact plan')
    else:
        plan = values.get('plan')
        if not isinstance(plan, dict) or statement.get('planSha256') != digest(canonical(plan)) or \
                statement['operationId'] != plan.get('operationId'):
            raise ValueError('Root approval differs from exact plan')
        if kind == 'install':
            from enrollment import validate_install_plan
            validate_install_plan(plan)
            if set(statement) != {'contract', 'operationId', 'hostIdentitySha256', 'planSha256',
                                  'action', 'issuedAt', 'expiresAt'} or \
                    statement['action'] != 'INSTALL_INDEPENDENT_PUBLIC_ONLY_ADAPTER' or \
                    statement['hostIdentitySha256'] != plan.get('hostIdentitySha256'):
                raise ValueError('Installer approval effect scope differs')
        elif kind == 'v1-forward':
            from canonical_lineage import validate_v1_plan
            validate_v1_plan(plan, values['bootstrapPlan'])
            if set(statement) != {'contract', 'operationId', 'action', 'hostIdentitySha256',
                                  'planSha256', 'issuedAt', 'expiresAt'} or \
                    statement['action'] != 'CONTROL_HANDOFF' or \
                    statement['hostIdentitySha256'] != plan.get('hostIdentitySha256') or \
                    plan.get('standaloneTransition', {}).get('planSha256') != digest(canonical(values['bootstrapPlan'])):
                raise ValueError('Native V1 approval lacks standalone cross-link')
        else:
            from canonical_lineage import validate_v1_plan
            validate_v1_plan(plan, values['bootstrapPlan'])
            if set(statement) != {'contract', 'operationId', 'action', 'hostIdentitySha256',
                                  'planSha256', 'receiptSha256', 'issuedAt', 'expiresAt'} or \
                    statement['action'] != 'CONTROL_ROLLBACK' or \
                    statement['hostIdentitySha256'] != plan.get('hostIdentitySha256') or \
                    values['forwardReceipt'].get('contract') != 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_RECEIPT' or \
                    values['forwardReceipt'].get('decision') != 'PASS' or \
                    values['forwardReceipt'].get('operationId') != plan['operationId'] or \
                    statement['receiptSha256'] != digest(canonical(values['forwardReceipt'])):
                raise ValueError('Native V1 rollback lacks accepted receipt')
    statement_sha = digest(canonical(statement))
    if confirm != f'GO BOOTSTRAP-SIGN {kind} {identity} {statement_sha} {expected_root_der}':
        raise ValueError('Exact dispatcher confirmation phrase required')
    return statement_sha


def _dpapi_unprotect(value):
    if os.name != 'nt':
        raise ValueError('Private-key custody requires Windows DPAPI')

    class Blob(ctypes.Structure):
        _fields_ = [('size', ctypes.c_ulong), ('data', ctypes.POINTER(ctypes.c_ubyte))]

    raw = (ctypes.c_ubyte * len(value)).from_buffer_copy(value)
    source, target = Blob(len(value), raw), Blob()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(source), None, None, None, None, 1,
                                                    ctypes.byref(target)):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(target.data, target.size)
    finally:
        ctypes.windll.kernel32.LocalFree(target.data)


def _write_exclusive(path, raw):
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts or path.resolve(strict=False) != path or \
            path.exists() or path.is_symlink() or path.parent.is_symlink():
        raise ValueError('Exclusive canonical signer output required')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_BINARY', 0), 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())


def _output_path_checked(path):
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts or path.resolve(strict=False) != path or \
            path.exists() or path.is_symlink() or path.parent.is_symlink() or \
            not path.parent.is_dir() or path.parent.resolve(strict=True) != path.parent:
        raise ValueError('Exclusive canonical signer output required')
    return path


def sign_exact(*, kind, statement_path, linked_path, public_path, expected_public_der_sha256,
               private_path, output_path, confirm, now=None, private_loader=None):
    statement, raw = checked_json(statement_path)
    linked, _ = checked_json(linked_path)
    public_raw = checked_file(public_path, 4096)
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
    public = serialization.load_pem_public_key(public_raw)
    if not isinstance(public, Ed25519PublicKey):
        raise ValueError('Ed25519 public-only signing root required')
    public_der = public.public_bytes(serialization.Encoding.DER,
                                     serialization.PublicFormat.SubjectPublicKeyInfo)
    if digest(public_der) != expected_public_der_sha256:
        raise ValueError('Explicit public DER provenance differs')
    validate_linked_root(kind, linked, public_raw, digest(public_der))
    statement_sha = validate_statement(kind, statement, linked, expected_public_der_sha256,
                                       confirm, now=now)
    output_path = _output_path_checked(output_path)
    loader = private_loader or (lambda path: serialization.load_pem_private_key(
        _dpapi_unprotect(checked_file(path, 65536)), password=None))
    private = loader(private_path)
    if not isinstance(private, Ed25519PrivateKey) or \
            private.public_key().public_bytes(serialization.Encoding.DER,
                serialization.PublicFormat.SubjectPublicKeyInfo) != public_der:
        raise ValueError('Private key does not match exact enrolled public root')
    envelope_name = CONTRACTS[kind][1]
    output = canonical({envelope_name: statement,
                        'signature': base64.b64encode(private.sign(raw)).decode()})
    _write_exclusive(output_path, output)
    return {'kind': kind, 'operationId': statement.get('operationId', statement.get('placementId')),
            'statementSha256': statement_sha, 'envelopeSha256': digest(output),
            'publicDerSha256': digest(public_der), 'directDispatcherGoReceiptRequired': True}


def main(argv=None):
    parser = argparse.ArgumentParser(description='Offline exact predecessor transition signer')
    parser.add_argument('--kind', choices=sorted(CONTRACTS), required=True)
    parser.add_argument('--statement', type=Path, required=True)
    parser.add_argument('--linked', type=Path, required=True)
    parser.add_argument('--public', type=Path, required=True)
    parser.add_argument('--expected-public-der-sha256', required=True)
    parser.add_argument('--private', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--confirm', required=True)
    args = parser.parse_args(argv)
    print(json.dumps(sign_exact(kind=args.kind, statement_path=args.statement,
        linked_path=args.linked, public_path=args.public,
        expected_public_der_sha256=args.expected_public_der_sha256,
        private_path=args.private, output_path=args.output, confirm=args.confirm)))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
