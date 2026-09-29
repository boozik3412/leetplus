"""Verify independent installer authority; enrollment cannot self-admit."""
import json
import re

from authority import instant, verify_bounded_envelope, node_public_check
from inventory import digest
from native_boundary import canonical, require, secure_read

INSTALL_PLAN = 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_PLAN'
INSTALL_APPROVAL = 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_APPROVAL'
INSTALL_RECEIPT = 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_RECEIPT'
ENROLLMENT = 'LEETPLUS_PREDECESSOR_BOOTSTRAP_ENROLLMENT_V2'
HASH = re.compile(r'[a-f0-9]{64}\Z')
RELEASE = re.compile(r'[a-f0-9]{40}\Z')
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\Z')
ROOTS = {'permit', 'execution', 'rollback', 'noEffect'}
INSTALLER_AUTHORITY_FIELDS = {'helperSourceSha256', 'verifierSourceSha256',
                             'introPlanSha256', 'introReceiptSha256',
                             'generationRootManifestSha256', 'generationReceiptSha256'}
PLAN_FIELDS = {'contract', 'operationId', 'action', 'hostIdentitySha256', 'predecessorReleaseSha',
    'predecessorManifestSha256', 'oldCorePointer', 'sourceRelease', 'sourceAdmissionSha256',
    'installerSourceSha256', 'installerAuthority', 'bundleFiles', 'bundleSha256', 'bundleArchiveSha256',
    'publicRoots', 'effects'}
INSTALL_EFFECTS = {'bootstrapBundleOnly': True, 'publicRootsOnly': True,
    'requestPlacement': True,
    'controllerPointerMutation': False, 'applicationRestart': False,
    'dataMutation': False, 'workerGrantMutation': False, 'timerMutation': False,
    'providerEffect': False}
REQUIRED_BUNDLE_FILES = {
    'deploy/transition-bootstrap/protocol.mjs',
    'deploy/transition-bootstrap/native_boundary.py',
    'deploy/transition-bootstrap/inventory.py',
    'deploy/transition-bootstrap/authority.py',
    'deploy/transition-bootstrap/enrollment.py',
    'deploy/transition-bootstrap/host_observer.py',
    'deploy/transition-bootstrap/canonical_lineage.py',
    'deploy/transition-bootstrap/canonical_lineage_native.py',
    'deploy/transition-bootstrap/rpc_host.py',
    'deploy/transition-bootstrap/cli.mjs',
    'deploy/transition-bootstrap/hard_deadline.py',
    'deploy/leetplus-compose/a-bridge-bootstrap-authority.mjs',
    'deploy/leetplus-compose/bridge-external-successor-authority.mjs',
    'deploy/leetplus-compose/control-handoff-authority.mjs',
}


def validate_install_plan(plan):
    require(isinstance(plan, dict) and set(plan) == PLAN_FIELDS and
        plan['contract'] == INSTALL_PLAN and plan['action'] == 'INSTALL_INDEPENDENT_PUBLIC_ONLY_ADAPTER' and
        UUID.fullmatch(plan['operationId']) and RELEASE.fullmatch(plan['predecessorReleaseSha']) and
        RELEASE.fullmatch(plan['sourceRelease']) and
        plan['oldCorePointer'] == f"/usr/local/lib/leetplus-compose/{plan['predecessorReleaseSha']}/control.sh" and
        all(HASH.fullmatch(plan[field]) for field in ('hostIdentitySha256', 'predecessorManifestSha256',
            'sourceAdmissionSha256', 'installerSourceSha256', 'bundleSha256',
            'bundleArchiveSha256')) and
        isinstance(plan['installerAuthority'], dict) and
        set(plan['installerAuthority']) == INSTALLER_AUTHORITY_FIELDS and
        all(isinstance(v, str) and HASH.fullmatch(v) for v in plan['installerAuthority'].values()) and
        isinstance(plan['bundleFiles'], dict) and REQUIRED_BUNDLE_FILES <= set(plan['bundleFiles']) and
        len(plan['bundleFiles']) <= 128 and
        all(isinstance(name, str) and not name.startswith('/') and '\\' not in name and
            all(re.fullmatch(r'[A-Za-z0-9_.@-]+', part) and part not in ('.', '..') for part in name.split('/')) and
            HASH.fullmatch(value) for name, value in plan['bundleFiles'].items()) and
        digest(canonical(plan['bundleFiles'])) == plan['bundleSha256'] and
        isinstance(plan['publicRoots'], dict) and set(plan['publicRoots']) == ROOTS and
        all(HASH.fullmatch(value) for value in plan['publicRoots'].values()) and
        plan['effects'] == INSTALL_EFFECTS,
        'Invalid independent installer scope or source identities')
    return plan


def validate_install_approval(plan, envelope, deployment_root, *, accepted_at=None):
    validate_install_plan(plan)
    approval = verify_bounded_envelope(envelope, deployment_root, INSTALL_APPROVAL,
        at=instant(accepted_at) if accepted_at else None)
    require(set(approval) == {'contract', 'operationId', 'hostIdentitySha256', 'planSha256',
                             'action', 'issuedAt', 'expiresAt'} and
            approval['operationId'] == plan['operationId'] and
            approval['hostIdentitySha256'] == plan['hostIdentitySha256'] and
            approval['planSha256'] == digest(canonical(plan)) and
            approval['action'] == plan['action'], 'Installer approval does not bind the exact plan')
    return approval


def validate_installer_receipt(plan, envelope, receipt, deployment_root):
    require(isinstance(receipt, dict) and set(receipt) == {'contract', 'decision', 'operationId',
        'planSha256', 'approvalSha256', 'intentSha256', 'bundleSha256', 'publicRoots',
        'hostIdentitySha256', 'acceptedAt'} and receipt['contract'] == INSTALL_RECEIPT and
        receipt['decision'] == 'PASS' and receipt['operationId'] == plan['operationId'] and
        receipt['planSha256'] == digest(canonical(plan)) and
        receipt['approvalSha256'] == digest(canonical(envelope)) and HASH.fullmatch(receipt['intentSha256']) and
        receipt['bundleSha256'] == plan['bundleSha256'] and receipt['publicRoots'] == plan['publicRoots'] and
        receipt['hostIdentitySha256'] == plan['hostIdentitySha256'],
        'Enrollment lacks exact independently authorized installer receipt')
    validate_install_approval(plan, envelope, deployment_root, accepted_at=receipt['acceptedAt'])
    return receipt


def validate_enrollment_chain(enrollment_root, enrollment, deployment_root):
    values = {}
    for leaf in ('installer-plan.json', 'installer-approval.json', 'installer-receipt.json', 'installer-intent.json'):
        raw = secure_read(enrollment_root / leaf, 65536)
        values[leaf] = json.loads(raw)
        require(raw == canonical(values[leaf]), 'Enrollment lineage JSON is not canonical')
    plan, envelope, receipt, intent = (values[leaf] for leaf in
        ('installer-plan.json', 'installer-approval.json', 'installer-receipt.json', 'installer-intent.json'))
    validate_installer_receipt(plan, envelope, receipt, deployment_root)
    require(set(intent) == {'contract', 'operationId', 'planSha256', 'approvalSha256', 'authorizedAt'} and
        intent['contract'] == INSTALL_PLAN + '_INTENT' and intent['operationId'] == plan['operationId'] and
        intent['planSha256'] == digest(canonical(plan)) and
        intent['approvalSha256'] == digest(canonical(envelope)) and
        digest(canonical(intent)) == receipt['intentSha256'] and
        instant(intent['authorizedAt']) <= instant(receipt['acceptedAt']),
        'Installer intent lineage differs')
    validate_install_approval(plan, envelope, deployment_root, accepted_at=intent['authorizedAt'])
    require(enrollment['installerReceiptSha256'] == digest(canonical(receipt)) and
        enrollment['hostIdentitySha256'] == plan['hostIdentitySha256'] and
        enrollment['bundleFiles'] == plan['bundleFiles'] and
        enrollment['bundleSha256'] == plan['bundleSha256'] and
        enrollment['publicRoots'] == plan['publicRoots'],
        'Enrollment self-admission or signed installer identity mismatch')
    deployment_der = node_public_check(deployment_root)
    identities = set()
    for name, expected_raw_sha in plan['publicRoots'].items():
        raw = secure_read(enrollment_root / (name + '-root.pem'), 4096)
        require(digest(raw) == expected_raw_sha, 'Historical enrolled root bytes differ')
        identity = node_public_check(raw.decode('ascii'))
        require(identity != deployment_der and identity not in identities,
                'Enrolled key domains collapse to the same Ed25519 key')
        identities.add(identity)
    return plan
