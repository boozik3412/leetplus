"""Disposable root/Linux V1 lineage, pending boot and reverse CAS fixtures."""
import base64
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from canonical_lineage import build_v1_plan, freeze_v1_receipt, active_pointer
import authority
from canonical_lineage_native import CanonicalLineageNative
from inventory import digest
from native_boundary import NativeBoundary, canonical, secure_read

OLD_SHA = 'a' * 40
NEW_SHA = 'b' * 40
OLD_POINTER = f'/usr/local/lib/leetplus-compose/{OLD_SHA}/control.sh'
NEW_POINTER = f'/usr/local/lib/leetplus-compose/{NEW_SHA}/control.sh'
NOW = datetime(2026, 9, 27, 12, 0, 0, tzinfo=timezone.utc)
TEST_NODE = os.environ.get('BOOTSTRAP_TEST_NODE', '/usr/bin/node')
authority.NODE_BINARY = TEST_NODE


def iso(value):
    return value.isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def generate_key():
    script = "import crypto from 'node:crypto'; const v=crypto.generateKeyPairSync('ed25519'); process.stdout.write(JSON.stringify({privateKey:v.privateKey.export({format:'pem',type:'pkcs8'}),publicKey:v.publicKey.export({format:'pem',type:'spki'})}));"
    return json.loads(subprocess.check_output([TEST_NODE, '-e', script]))


def sign(value, key):
    script = "import crypto from 'node:crypto';import fs from 'node:fs';const v=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(crypto.sign(null,Buffer.from(v.message,'base64'),v.key).toString('base64'));"
    raw = json.dumps({'message': base64.b64encode(canonical(value)).decode(),
                      'key': key['privateKey']}).encode()
    return subprocess.check_output([TEST_NODE, '-e', script], input=raw).decode()


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'getuid') and os.getuid() == 0,
                     'Canonical native lineage requires Linux root')
class CanonicalLineageTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='leetplus-canonical-bootstrap-', dir='/run'))
        self.root.chmod(0o700)
        self.state = self.root / 'state'
        self.handoffs = self.state / 'control-handoffs'
        self.handoffs.mkdir(parents=True, mode=0o700)
        self.prior = canonical({'operationId': '11111111-1111-4111-8111-111111111111',
                                'receiptSha256': 'c' * 64})
        (self.handoffs / 'active.json').write_bytes(self.prior)
        self.core = self.root / 'core'
        self.core.symlink_to(OLD_POINTER)
        locks = []
        for name in ('install.lock', 'control.lock', 'transition.lock'):
            path = self.root / name
            path.touch(mode=0o600)
            locks.append(path)
        self.boundary = NativeBoundary(install_lock=locks[0], control_lock=locks[1],
            transition_lock=locks[2], state_root=self.state, core_pointer=self.core,
            assert_quiescence=lambda: None)
        self.key = generate_key()
        self.bootstrap = {'contract': 'LEETPLUS_PREDECESSOR_TRANSITION_BOOTSTRAP_V1_PLAN',
            'mode': 'A_TO_BRIDGE', 'operationId': '12345678-1234-4123-8123-123456789abc',
            'permitEnvelopeSha256': 'd' * 64,
            'expected': {'predecessor': {'releaseSha': OLD_SHA, 'manifestSha256': 'e' * 64},
                         'target': {'releaseSha': NEW_SHA, 'manifestSha256': 'f' * 64, 'filesSha256': 'a' * 64,
                                    'admissionSha256': 'b' * 64,
                                    'files': {'leetplus-compose-network-refresh.service': '6' * 64}},
                         'hostIdentitySha256': '8' * 64,
                         'activeSha256': '1' * 64},
            'protectedStateSha256': '2' * 64, 'oldPointer': OLD_POINTER,
            'newPointer': NEW_POINTER,
            'evidence': {'backupReceiptSha256': '3' * 64,
                'restoredCopyReceiptSha256': '4' * 64, 'hostBaselineSha256': '5' * 64}}
        unit_hash = '6' * 64
        old = {'releaseSha': OLD_SHA, 'manifestSha256': 'e' * 64,
               'files': {'leetplus-compose-network-refresh.service': unit_hash}}
        target = {'releaseSha': NEW_SHA, 'manifestSha256': 'f' * 64,
                  'admissionSha256': 'b' * 64, 'filesSha256': 'a' * 64,
                  'files': {'leetplus-compose-network-refresh.service': unit_hash}}
        snapshot = {'activeSha256': '1' * 64,
                    'files': {'/etc/leetplus-compose/providers.json': '7' * 64}}
        timers = {'leetplus-compose-bonus.timer': {'ActiveState': 'active'},
                  'leetplus-compose-daily.timer': {'ActiveState': 'active'}}
        self.plan = build_v1_plan(bootstrap_plan=self.bootstrap, old=old, target=target,
            snapshot=snapshot, timers=timers, host_sha='8' * 64,
            network_unit_sha=unit_hash, network_unit_mode=0o644,
            previous_pointer_raw=self.prior, evidence_sha='9' * 64)
        approval = {'contract': 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_APPROVAL',
            'operationId': self.plan['operationId'], 'action': 'CONTROL_HANDOFF',
            'hostIdentitySha256': self.plan['hostIdentitySha256'],
            'planSha256': digest(canonical(self.plan)),
            'issuedAt': iso(NOW - timedelta(seconds=30)), 'expiresAt': iso(NOW + timedelta(minutes=20))}
        self.envelope = {'approval': approval, 'signature': sign(approval, self.key)}
        self.lineage = CanonicalLineageNative(boundary=self.boundary, state_root=self.state,
            bootstrap_plan=self.bootstrap, v1_plan=self.plan, v1_approval=self.envelope,
            deployment_root=self.key['publicKey'])
        self.intent = {'operationId': self.plan['operationId'],
                       'planSha256': digest(canonical(self.bootstrap)), 'authorizedAt': iso(NOW)}

    def tearDown(self):
        shutil.rmtree(self.root)

    def test_pending_then_exact_v1_receipt_and_active_pointer(self):
        with self.boundary.with_locks('WRITE'):
            frozen = self.lineage.prepare_forward(self.intent, now=NOW)
            self.assertEqual(frozen, freeze_v1_receipt(self.plan, self.envelope, iso(NOW)))
            self.assertEqual(json.loads(secure_read(self.state / 'control-handoff.pending.json')),
                             {'operationId': self.plan['operationId']})
            self.boundary.compare_and_swap_pointer(OLD_POINTER, NEW_POINTER)
            self.lineage.finalize_forward(self.intent)
            self.assertEqual(json.loads(secure_read(self.handoffs / 'active.json')),
                             active_pointer(self.plan, frozen))
            self.assertFalse((self.state / 'control-handoff.pending.json').exists())
            self.assertEqual(self.lineage._read('receipt.json'), frozen)
            self.assertEqual(self.lineage.finalize_forward(self.intent), frozen)

    def test_crash_after_core_cas_recovers_after_approval_expiry_without_new_effect(self):
        with self.boundary.with_locks('WRITE'):
            self.lineage.prepare_forward(self.intent, now=NOW)
            self.boundary.compare_and_swap_pointer(OLD_POINTER, NEW_POINTER)
        with self.boundary.with_locks('WRITE'):
            self.lineage.finalize_forward(self.intent)
            self.assertEqual(self.boundary.read_pointer(), NEW_POINTER)
            self.assertEqual(self.lineage._read('receipt.json')['acceptedAt'], iso(NOW))

    def test_zero_effect_clears_only_own_pending_marker(self):
        with self.boundary.with_locks('WRITE'):
            self.lineage.prepare_forward(self.intent, now=NOW)
            self.lineage.close_no_effect('FORWARD', self.intent)
            self.assertFalse((self.state / 'control-handoff.pending.json').exists())
            self.assertEqual(self.boundary.read_pointer(), OLD_POINTER)
            self.assertEqual(secure_read(self.handoffs / 'active.json'), self.prior)

    def test_reverse_restores_exact_previous_handoff_pointer(self):
        with self.boundary.with_locks('WRITE'):
            self.lineage.prepare_forward(self.intent, now=NOW)
            self.boundary.compare_and_swap_pointer(OLD_POINTER, NEW_POINTER)
            self.lineage.finalize_forward(self.intent)
            forward = {'decision': 'PASS'}
            rollback_intent = {'operationId': self.plan['operationId'],
                'forwardReceiptSha256': digest(canonical(forward)), 'authorizedAt': iso(NOW)}
            approval = {'contract': 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_ROLLBACK_APPROVAL',
                'action': 'CONTROL_ROLLBACK', 'operationId': self.plan['operationId'],
                'hostIdentitySha256': self.plan['hostIdentitySha256'],
                'planSha256': digest(canonical(self.plan)),
                'receiptSha256': digest(canonical(self.lineage._read('receipt.json'))),
                'issuedAt': iso(NOW - timedelta(seconds=30)), 'expiresAt': iso(NOW + timedelta(minutes=20))}
            envelope = {'approval': approval, 'signature': sign(approval, self.key)}
            self.lineage.prepare_rollback(rollback_intent, forward, envelope, now=NOW)
            self.boundary.compare_and_swap_pointer(NEW_POINTER, OLD_POINTER)
            terminal = self.lineage.finalize_rollback(rollback_intent)
            self.assertEqual(terminal['decision'], 'ROLLED_BACK')
            self.assertEqual(secure_read(self.handoffs / 'active.json'), self.prior)
            self.assertFalse((self.state / 'control-handoff.pending.json').exists())

    def test_disjoint_native_and_standalone_windows_reject_before_pending_or_cas(self):
        changed = dict(self.envelope['approval'])
        changed['issuedAt'] = iso(NOW + timedelta(seconds=5))
        envelope = {'approval': changed, 'signature': sign(changed, self.key)}
        lineage = CanonicalLineageNative(boundary=self.boundary, state_root=self.state,
            bootstrap_plan=self.bootstrap, v1_plan=self.plan, v1_approval=envelope,
            deployment_root=self.key['publicKey'])
        with self.boundary.with_locks('WRITE'):
            with self.assertRaisesRegex(ValueError, 'expired or unbounded'):
                lineage.prepare_forward(self.intent, now=NOW + timedelta(seconds=10))
            self.assertFalse((self.state / 'control-handoff.pending.json').exists())
            self.assertFalse(lineage.directory.exists())
            self.assertEqual(self.boundary.read_pointer(), OLD_POINTER)

    def test_foreign_native_host_and_wrong_unit_reject_constructor_before_cas(self):
        for field, changed_value in (('hostIdentitySha256', '0' * 64),
                                     ('newUnitSha256', '0' * 64),
                                     ('oldUnitMode', 0o600)):
            changed = dict(self.plan)
            changed[field] = changed_value
            with self.assertRaisesRegex(ValueError, 'Unsupported canonical'):
                CanonicalLineageNative(boundary=self.boundary, state_root=self.state,
                    bootstrap_plan=self.bootstrap, v1_plan=changed, v1_approval=self.envelope,
                    deployment_root=self.key['publicKey'])
        self.assertFalse((self.state / 'control-handoff.pending.json').exists())
        self.assertEqual(os.readlink(self.core), OLD_POINTER)

    def test_no_effect_before_canonical_pending_can_be_terminalized(self):
        with self.boundary.with_locks('WRITE'):
            self.lineage.close_no_effect('FORWARD', self.intent)
            self.assertTrue((self.lineage.directory / 'apply-no-effect.json').is_file())
            self.assertFalse((self.state / 'control-handoff.pending.json').exists())
            self.assertEqual(self.boundary.read_pointer(), OLD_POINTER)
            self.assertEqual(secure_read(self.handoffs / 'active.json'), self.prior)

    def test_no_effect_after_partial_plan_and_intent_clears_exact_unfinished_operation(self):
        with self.boundary.with_locks('WRITE'):
            self.lineage._ensure_dir()
            self.lineage._write('plan.json', self.plan)
            self.lineage._write('approval.json', self.envelope)
            binding = {'operationId': self.plan['operationId'],
                'planSha256': digest(canonical(self.plan)),
                'approvalSha256': digest(canonical(self.envelope)),
                'authorizedAt': self.intent['authorizedAt']}
            self.lineage._write('apply.intent.json', binding)
            self.lineage.close_no_effect('FORWARD', self.intent)
            self.assertFalse((self.state / 'control-handoff.pending.json').exists())
            self.assertEqual(self.boundary.read_pointer(), OLD_POINTER)
            self.assertEqual(self.lineage._read('apply.intent.json'), binding)

    def test_no_prior_handoff_pointer_can_forward_and_reverse_exactly(self):
        (self.handoffs / 'active.json').unlink()
        plan = dict(self.plan)
        plan['previousPointer'] = None
        approval = dict(self.envelope['approval'])
        approval['planSha256'] = digest(canonical(plan))
        envelope = {'approval': approval, 'signature': sign(approval, self.key)}
        lineage = CanonicalLineageNative(boundary=self.boundary, state_root=self.state,
            bootstrap_plan=self.bootstrap, v1_plan=plan, v1_approval=envelope,
            deployment_root=self.key['publicKey'])
        with self.boundary.with_locks('WRITE'):
            lineage.prepare_forward(self.intent, now=NOW)
            self.boundary.compare_and_swap_pointer(OLD_POINTER, NEW_POINTER)
            lineage.finalize_forward(self.intent)
            self.assertTrue((self.handoffs / 'active.json').is_file())
            forward = {'decision': 'PASS'}
            rollback_intent = {'operationId': plan['operationId'],
                'forwardReceiptSha256': digest(canonical(forward)), 'authorizedAt': iso(NOW)}
            native_approval = {'contract': 'LEETPLUS_COMPOSE_CONTROL_HANDOFF_V1_ROLLBACK_APPROVAL',
                'action': 'CONTROL_ROLLBACK', 'operationId': plan['operationId'],
                'hostIdentitySha256': plan['hostIdentitySha256'],
                'planSha256': digest(canonical(plan)),
                'receiptSha256': digest(canonical(lineage._read('receipt.json'))),
                'issuedAt': iso(NOW - timedelta(seconds=30)),
                'expiresAt': iso(NOW + timedelta(minutes=20))}
            native_envelope = {'approval': native_approval,
                               'signature': sign(native_approval, self.key)}
            lineage.prepare_rollback(rollback_intent, forward, native_envelope, now=NOW)
            self.boundary.compare_and_swap_pointer(NEW_POINTER, OLD_POINTER)
            lineage.finalize_rollback(rollback_intent)
            self.assertFalse((self.handoffs / 'active.json').exists())


if __name__ == '__main__':
    unittest.main()
