"""Build the V1 handoff lineage recognized by both frozen predecessor hosts.

This is pure source. The execution adapter must publish these records in the
accepted native order, under all locks, before and after its pointer CAS.
"""
import base64
import re

from authority import verify_bounded_envelope
from inventory import digest
from native_boundary import canonical, require

V1_PLAN = 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_PLAN'
V1_APPROVAL = 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_APPROVAL'
V1_RECEIPT = 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_RECEIPT'
STANDALONE_LINK = 'LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_LINK'
HASH = re.compile(r'[a-f0-9]{64}\Z')
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\Z')
FIELDS = {'contract', 'operationId', 'action', 'hostIdentitySha256',
    'oldReleaseSha', 'newReleaseSha', 'oldControlSha256', 'newControlSha256',
    'oldMainTarget', 'newMainTarget', 'snapshot', 'timers',
    'oldUnitSha256', 'oldUnitMode', 'newUnitSha256', 'previousPointer',
    'evidenceSha256', 'refreshScope', 'applicationRestartAllowed',
    'timersMayBeStopped', 'rollbackAllowed', 'maxLockWaitSeconds',
    'standaloneTransition'}


def build_v1_plan(*, bootstrap_plan, old, target, snapshot, timers, host_sha,
                  network_unit_sha, network_unit_mode, previous_pointer_raw,
                  evidence_sha):
    require(bootstrap_plan['operationId'] and UUID.fullmatch(bootstrap_plan['operationId']) and
            bootstrap_plan['oldPointer'] == f"/usr/local/lib/leetplus-compose/{old['releaseSha']}/control.sh" and
            bootstrap_plan['newPointer'] == f"/usr/local/lib/leetplus-compose/{target['releaseSha']}/control.sh" and
            bootstrap_plan['protectedStateSha256'] and HASH.fullmatch(bootstrap_plan['protectedStateSha256']) and
            HASH.fullmatch(host_sha) and HASH.fullmatch(network_unit_sha) and
            HASH.fullmatch(evidence_sha) and isinstance(network_unit_mode, int) and
            network_unit_mode == 0o644 and
            old['files'].get('leetplus-compose-network-refresh.service') == network_unit_sha ==
            target['files'].get('leetplus-compose-network-refresh.service') and
            isinstance(snapshot, dict) and HASH.fullmatch(snapshot.get('activeSha256', '')) and
            bootstrap_plan['expected']['target']['filesSha256'] == target['filesSha256'] and
            bootstrap_plan['expected']['predecessor']['manifestSha256'] == old['manifestSha256'] and
            bootstrap_plan['expected']['target']['manifestSha256'] == target['manifestSha256'] and
            bootstrap_plan['expected']['target']['admissionSha256'] == target['admissionSha256'] and
            isinstance(timers, dict) and set(timers) ==
            {'leetplus-compose-bonus.timer', 'leetplus-compose-daily.timer'} and
            (previous_pointer_raw is None or isinstance(previous_pointer_raw, bytes)),
            'Canonical handoff cannot bind the standalone predecessor plan')
    plan = {
        'contract': V1_PLAN, 'operationId': bootstrap_plan['operationId'], 'action': 'CONTROL_HANDOFF',
        'hostIdentitySha256': host_sha, 'oldReleaseSha': old['releaseSha'],
        'newReleaseSha': target['releaseSha'], 'oldControlSha256': old['manifestSha256'],
        'newControlSha256': target['manifestSha256'],
        'oldMainTarget': bootstrap_plan['oldPointer'], 'newMainTarget': bootstrap_plan['newPointer'],
        'snapshot': snapshot, 'timers': timers,
        'oldUnitSha256': network_unit_sha, 'oldUnitMode': network_unit_mode,
        'newUnitSha256': network_unit_sha,
        'previousPointer': base64.b64encode(previous_pointer_raw).decode() if previous_pointer_raw else None,
        'evidenceSha256': evidence_sha,
        'refreshScope': {'operation': 'refresh', 'setNames': ['lp_leetplus_https', 'lp_leetplus_smtp'],
            'ttlSeconds': 3600, 'publicAddressesOnly': True,
            'policySha256': snapshot['files']['/etc/leetplus-compose/providers.json']},
        'applicationRestartAllowed': False, 'timersMayBeStopped': False,
        'rollbackAllowed': True, 'maxLockWaitSeconds': 120,
        'standaloneTransition': {'contract': STANDALONE_LINK,
            'planSha256': digest(canonical(bootstrap_plan))},
    }
    validate_v1_plan(plan, bootstrap_plan)
    return plan


def validate_v1_plan(plan, bootstrap_plan):
    expected = bootstrap_plan['expected']
    expected_host = expected['hostIdentitySha256'] if bootstrap_plan['mode'] == 'A_TO_BRIDGE' else expected['host']['hostIdentitySha256']
    expected_unit = expected['target']['files'].get('leetplus-compose-network-refresh.service')
    require(isinstance(plan, dict) and set(plan) == FIELDS and
            plan['contract'] == V1_PLAN and plan['action'] == 'CONTROL_HANDOFF' and
            plan['operationId'] == bootstrap_plan['operationId'] and
            plan['oldMainTarget'] == bootstrap_plan['oldPointer'] and
            plan['newMainTarget'] == bootstrap_plan['newPointer'] and
            plan['hostIdentitySha256'] == expected_host and
            plan['oldReleaseSha'] == expected['predecessor']['releaseSha'] and
            plan['newReleaseSha'] == expected['target']['releaseSha'] and
            HASH.fullmatch(expected_unit or '') and
            plan['oldControlSha256'] == bootstrap_plan['expected']['predecessor']['manifestSha256'] and
            plan['newControlSha256'] == bootstrap_plan['expected']['target']['manifestSha256'] and
            plan['snapshot']['activeSha256'] ==
                (bootstrap_plan['expected']['activeSha256'] if bootstrap_plan['mode'] == 'A_TO_BRIDGE'
                 else bootstrap_plan['expected']['host']['activeSha256']) and
            plan['oldUnitSha256'] == plan['newUnitSha256'] == expected_unit and
            plan['oldUnitMode'] == 0o644 and
            plan['applicationRestartAllowed'] is False and plan['timersMayBeStopped'] is False and
            plan['rollbackAllowed'] is True and plan['maxLockWaitSeconds'] == 120 and
            plan['standaloneTransition'] == {'contract': STANDALONE_LINK,
                'planSha256': digest(canonical(bootstrap_plan))},
            'Unsupported canonical V1 handoff lineage')
    return plan


def validate_v1_approval(plan, bootstrap_plan, envelope, deployment_root, *, at=None):
    validate_v1_plan(plan, bootstrap_plan)
    approval = verify_bounded_envelope(envelope, deployment_root, V1_APPROVAL, at=at,
                                       maximum_minutes=240)
    require(set(approval) == {'contract', 'operationId', 'action', 'hostIdentitySha256',
                              'planSha256', 'issuedAt', 'expiresAt'} and
            approval['operationId'] == plan['operationId'] and approval['action'] == plan['action'] and
            approval['hostIdentitySha256'] == plan['hostIdentitySha256'] and
            approval['planSha256'] == digest(canonical(plan)),
            'Deployment-root approval is not linked to standalone plan')
    return approval


def freeze_v1_receipt(plan, approval_envelope, accepted_at):
    return {'contract': V1_RECEIPT, 'decision': 'PASS', 'operationId': plan['operationId'],
            'planSha256': digest(canonical(plan)),
            'approvalSha256': digest(canonical(approval_envelope)), 'acceptedAt': accepted_at}


def active_pointer(plan, receipt):
    require(receipt['contract'] == V1_RECEIPT and receipt['operationId'] == plan['operationId'] and
            receipt['planSha256'] == digest(canonical(plan)), 'Unaccepted V1 receipt')
    return {'operationId': plan['operationId'], 'receiptSha256': digest(canonical(receipt))}
