"""Read-only predecessor-side observation, packaged outside target controllers.

The enrolled bundle and root paths must be fixed by a separately admitted
installer. This module never imports or executes staged target code. The only
controller import is the already accepted, byte-attested serving predecessor.
"""
import types
import base64
import json
import os
import re
import stat
from pathlib import Path

from inventory import admitted_control, digest
from enrollment import validate_enrollment_chain
from native_boundary import canonical, require, secure_read, secure_directory, verify_bundle_inventory


def captured_predecessor(old, name):
    raw = old.get('capturedExecutor')
    require(isinstance(raw, bytes) and digest(raw) == old['files'].get('control_handoff.py'),
            'Exact captured predecessor executor required')
    module = types.ModuleType(name)
    module.__file__ = str(old['root'] / 'control_handoff.py')
    authority = old.get('capturedAuthority')
    contract = old.get('capturedContract')
    require(isinstance(authority, bytes) and isinstance(contract, bytes) and
            digest(authority) == old['files'].get('control-handoff-authority.mjs') and
            digest(contract) == old['files'].get('contract.mjs'),
            'Captured predecessor Node authority closure required')
    marker = b"'./contract.mjs'"
    require(authority.count(marker) == 1, 'Closed predecessor authority dependency differs')
    contract_url = 'data:text/javascript;base64,' + base64.b64encode(contract).decode('ascii')
    authority = authority.replace(marker, ("'" + contract_url + "'").encode())
    authority_url = 'data:text/javascript;base64,' + base64.b64encode(authority).decode('ascii')
    exec(compile(raw, module.__file__, 'exec'), module.__dict__)
    original_run = module.run
    original_url = (old['root'] / 'control-handoff-authority.mjs').as_uri()

    def captured_run(args, data=None, timeout=25):
        if args[:3] == ['/usr/bin/node', '--input-type=module', '-e']:
            require(len(args) == 4 and isinstance(args[3], str) and
                    args[3].count("'" + original_url + "'") == 1,
                    'Unknown predecessor Node code import')
            script = args[3].replace("'" + original_url + "'", "'" + authority_url + "'")
            require(len(script.encode()) <= 120000, 'Captured predecessor Node script exceeds argv bound')
            args = [*args[:3], script]
        return original_run(args, data, timeout)

    module.run = captured_run
    return module

A_RELEASE = 'b0cbf3a4f302b299762fa055f3bffe0376a91182'
A_MANIFEST = 'f9bd049e7cc4c03f206c99c2bad92ae54b34deb28b4b6980abb1bc44432dfb75'
A_EXECUTOR = '48aa00c4f6d3148ee210901cd572c6b5a3b3600ad4d20e3551e326ee18fcda18'
BRIDGE_RELEASE = 'bebeb41354da0dd04b218495cbbf5d75ba9f0a85'
BRIDGE_MANIFEST = '39a4941dfccc7b6695d4d5b0923ccaf933490bccb6a10e40168e043577738d48'
BRIDGE_EXECUTOR = '2923d34c5632eff74b5fafd4982073dba6bb4cd25ed5248592ddfe6eac071d88'
BRIDGE_FILE_MAP = 'ff7912faefcf7ccceb8586bde94872b0a9b7db3232150660a97779bf4feaf579'
BRIDGE_ADMISSION = '55203c0dca36e1485d043ea74c50b64c7f4565a7a43269d854ff06a745310fdc'
BRIDGE_ARCHIVE = '71bbc3d93cd80f1fd440708001ab352cf96da6e40c18def956cb28ec43b96f73'
HASH = re.compile(r'[a-f0-9]{64}\Z')
RELEASE = re.compile(r'[a-f0-9]{40}\Z')
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\Z')
EFFECTS = {
    'applicationRestartAllowed': False,
    'dataMutationAllowed': False,
    'timerMutationAllowed': False,
    'workerGrantMutationAllowed': False,
    'providerEffectAllowed': False,
    'effect': 'CONTROLLER_POINTER_ONLY',
}
SERVING_CORE = ('control.sh', 'control.mjs', 'orchestrator.mjs', 'contract.mjs',
                'control_handoff.py', 'control-handoff-authority.mjs')
PROTECTED_FILES = ('/etc/leetplus-compose/providers.json',
                   '/var/lib/leetplus-compose/worker-grants/bonus-ledger-worker.json',
                   '/var/lib/leetplus-compose/worker-grants/langame-daily-worker.json')


def expected_from_inventory(*, mode, identity, old, target, host_sha, protected,
                            approval_root_sha, bundle_sha, permit_root_sha,
                            serving_pointer, critical_names=()):
    """Pure object builder; the validators still pin every reviewed identity."""
    require(UUID.fullmatch(identity) and HASH.fullmatch(host_sha) and
            HASH.fullmatch(bundle_sha) and HASH.fullmatch(permit_root_sha) and
            HASH.fullmatch(approval_root_sha), 'Invalid independently observed identity')
    require(set(protected) == {'activeSha256', 'applicationSha256', 'dataSha256', 'nginxSha256',
            'workerGrantsSha256', 'timersSha256', 'providerPolicySha256', 'containersSha256',
            'networkRefreshUnitSha256', 'firewallSha256'} and
            all(isinstance(value, str) and HASH.fullmatch(value) for value in protected.values()),
            'Incomplete protected host state')
    require(serving_pointer == f"/usr/local/lib/leetplus-compose/{old['releaseSha']}/control.sh",
            'Serving pointer differs from predecessor')
    if mode == 'A_TO_BRIDGE':
        require(old['releaseSha'] == A_RELEASE and old['manifestSha256'] == A_MANIFEST and
                old['files'].get('control_handoff.py') == A_EXECUTOR and
                target['releaseSha'] == BRIDGE_RELEASE and target['manifestSha256'] == BRIDGE_MANIFEST and
                target['admissionSha256'] == BRIDGE_ADMISSION and
                target['controlArchiveSha256'] == BRIDGE_ARCHIVE and
                target['filesSha256'] == BRIDGE_FILE_MAP,
                'A-to-bridge fixed byte identities differ')
        expected = {
            'operationId': identity, 'action': 'PREPARE_A_BRIDGE_BOOTSTRAP',
            'hostIdentitySha256': host_sha, 'activeSha256': protected['activeSha256'],
            'predecessor': {'releaseSha': A_RELEASE, 'manifestSha256': A_MANIFEST,
                            'verifierSha256': A_EXECUTOR,
                            'servingCore': {name: old['files'][name] for name in SERVING_CORE}},
            'target': {'releaseSha': target['releaseSha'], 'manifestSha256': target['manifestSha256'],
                       'admissionSha256': target['admissionSha256'],
                       'controlArchiveSha256': target['controlArchiveSha256'],
                       'filesSha256': target['filesSha256'], 'files': target['files']},
            'bootstrap': {'verifierSourceSha256': bundle_sha,
                          'publicRootSha256': permit_root_sha},
        }
    else:
        require(mode == 'BRIDGE_TO_EXTERNAL' and old['releaseSha'] == BRIDGE_RELEASE and
                old['manifestSha256'] == BRIDGE_MANIFEST and
                old['filesSha256'] == BRIDGE_FILE_MAP and old['fileCount'] == 101 and
                old['files'].get('control_handoff.py') == BRIDGE_EXECUTOR and
                target['releaseSha'] != BRIDGE_RELEASE and RELEASE.fullmatch(target['releaseSha']) and
                isinstance(critical_names, (list, tuple)) and len(critical_names) == len(set(critical_names)) and
                set(critical_names) <= set(target['files']),
                'Bridge or target inventory differs')
        critical = {name: target['files'][name] for name in critical_names}
        expected = {
            'operationId': identity, 'action': 'PREPARE_BRIDGE_EXTERNAL_SUCCESSOR',
            'predecessor': {'releaseSha': BRIDGE_RELEASE, 'manifestSha256': BRIDGE_MANIFEST,
                            'verifierSha256': BRIDGE_EXECUTOR, 'filesSha256': BRIDGE_FILE_MAP,
                            'fileCount': 101},
            'target': {'releaseSha': target['releaseSha'], 'manifestSha256': target['manifestSha256'],
                       'admissionSha256': target['admissionSha256'],
                       'controlArchiveSha256': target['controlArchiveSha256'],
                       'filesSha256': target['filesSha256'], 'fileCount': target['fileCount'],
                       'criticalFilesSha256': digest(canonical(critical)),
                       'files': target['files'], 'criticalFiles': critical},
            'host': {'hostIdentitySha256': host_sha, 'activeSha256': protected['activeSha256'],
                     'approvalRootSha256': approval_root_sha,
                     'servingCoreTarget': serving_pointer},
            'verifier': {'sourceSha256': bundle_sha, 'publicRootSha256': permit_root_sha},
            'effects': EFFECTS.copy(),
        }
    return {'expected': expected, 'protectedState': protected, 'pointer': serving_pointer}


def protected_from_accepted_snapshot(snapshot, timer_state, network_unit_sha):
    require(isinstance(snapshot, dict) and isinstance(snapshot.get('files'), dict) and
            all(name in snapshot['files'] for name in PROTECTED_FILES) and
            isinstance(snapshot.get('containers'), dict) and len(snapshot['containers']) == 6 and
            isinstance(snapshot.get('firewall'), dict) and
            set(snapshot['firewall']) == {'LP_LEETPLUS_EGRESS_V2', 'LP_LEETPLUS_HOST_V2',
                                         'DOCKER-USER', 'INPUT'} and
            HASH.fullmatch(snapshot.get('activeSha256', '')) and HASH.fullmatch(network_unit_sha),
            'Accepted predecessor snapshot is incomplete')
    active = snapshot['active']
    require(isinstance(active, dict) and all(key in active for key in ('blue', 'green', 'dataRelease')),
            'Accepted active release is incomplete')
    return {
        'activeSha256': snapshot['activeSha256'],
        'applicationSha256': digest(canonical({'active': active, 'files': snapshot['files']})),
        'dataSha256': digest(canonical({'dataRelease': active['dataRelease'],
                                        'postgres': snapshot['containers']['leetplus-postgres'],
                                        'redis': snapshot['containers']['leetplus-redis']})),
        'nginxSha256': digest(canonical(snapshot['nginxTarget'])),
        'workerGrantsSha256': digest(canonical({name: snapshot['files'][name]
            for name in PROTECTED_FILES if '/worker-grants/' in name})),
        'timersSha256': digest(canonical(timer_state)),
        'providerPolicySha256': snapshot['files']['/etc/leetplus-compose/providers.json'],
        'containersSha256': digest(canonical(snapshot['containers'])),
        'networkRefreshUnitSha256': network_unit_sha,
        'firewallSha256': digest(canonical(snapshot['firewall'])),
    }


class EnrolledObserver:
    """Native reads only; caller must hold install/control/transition locks."""

    def __init__(self, *, bundle_root, enrollment_root,
                 controls_root='/usr/local/lib/leetplus-compose',
                 inbox_root='/srv/leetplus/inbox'):
        require(os.name == 'posix' and os.getuid() == 0, 'Native root observer required')
        self.bundle_root = secure_directory(bundle_root)
        self.enrollment_root = secure_directory(enrollment_root)
        self.controls_root = secure_directory(controls_root)
        self.inbox_root = secure_directory(inbox_root)

    def _enrollment(self):
        receipt_raw = secure_read(self.enrollment_root / 'enrollment.json', 65536)
        receipt = json.loads(receipt_raw)
        require(receipt_raw == canonical(receipt) and
                set(receipt) == {'contract', 'decision', 'hostIdentitySha256', 'bundleFiles',
                                 'bundleSha256', 'publicRoots', 'installerReceiptSha256'} and
                receipt['contract'] == 'LEETPLUS_PREDECESSOR_BOOTSTRAP_ENROLLMENT_V2' and
                receipt['decision'] == 'ACCEPTED' and
                all(HASH.fullmatch(value) for value in (receipt['bundleSha256'],
                    receipt['installerReceiptSha256'], receipt['hostIdentitySha256'])) and
                digest(canonical(receipt['bundleFiles'])) == receipt['bundleSha256'] and
                set(receipt['publicRoots']) == {'permit', 'execution', 'rollback', 'noEffect'} and
                all(HASH.fullmatch(value) for value in receipt['publicRoots'].values()),
                'Missing independently admitted bundle enrollment')
        verify_bundle_inventory(self.bundle_root, receipt['bundleFiles'])
        validate_enrollment_chain(self.enrollment_root, receipt,
            secure_read('/etc/leetplus-compose/approval-root.pem', 4096).decode('ascii'))
        roots = {}
        for name, expected in receipt['publicRoots'].items():
            raw = secure_read(self.enrollment_root / (name + '-root.pem'), 4096)
            require(digest(raw) == expected, 'Enrolled public root changed')
            roots[name] = raw.decode('ascii')
        require({item.name for item in self.enrollment_root.iterdir()} ==
                {'enrollment.json', 'installer-plan.json', 'installer-approval.json',
                 'installer-receipt.json', 'installer-intent.json', *(name + '-root.pem' for name in roots)},
                'Unexpected enrollment leaf')
        return receipt, roots

    def observe(self, mode, operation_id, target_release, critical_names=()):
        require(UUID.fullmatch(operation_id) and RELEASE.fullmatch(target_release),
                'Exact transition operation/target required')
        enrollment, roots = self._enrollment()
        old_sha = A_RELEASE if mode == 'A_TO_BRIDGE' else BRIDGE_RELEASE
        require(mode in ('A_TO_BRIDGE', 'BRIDGE_TO_EXTERNAL') and
                (mode != 'A_TO_BRIDGE' or target_release == BRIDGE_RELEASE),
                'Unsupported predecessor transition')
        old = admitted_control(controls_root=self.controls_root, inbox_root=self.inbox_root,
                               release_sha=old_sha)
        target = admitted_control(controls_root=self.controls_root, inbox_root=self.inbox_root,
                                  release_sha=target_release)
        # Import only the accepted and fully attested predecessor. The staged
        # target remains data until after the standalone permit check.
        require(old['manifestSha256'] == (A_MANIFEST if mode == 'A_TO_BRIDGE' else BRIDGE_MANIFEST) and
                old['files']['control_handoff.py'] ==
                (A_EXECUTOR if mode == 'A_TO_BRIDGE' else BRIDGE_EXECUTOR),
                'Unexpected predecessor executor source')
        module = captured_predecessor(old, 'accepted_predecessor_handoff')
        current = module.snapshot(old['root'])
        module.verify_current_controller_authority(current, module.installed(old_sha, executor=True), old['root'])
        require(not module.PENDING.exists(), 'Pending controller transition forbids bootstrap')
        pointer = module.main_target()
        timers = {unit: module.systemd(unit) for unit in module.TIMERS}
        require(all(value['ActiveState'] in ('active', 'inactive') and
                    value['UnitFileState'] in ('enabled', 'disabled') for value in timers.values()),
                'Ambiguous original timer state')
        protected = protected_from_accepted_snapshot(current, timers,
            digest(secure_read(module.UNIT, 2 * 1024 * 1024)))
        machine_sha = digest(secure_read('/etc/machine-id', 65536).strip())
        require(machine_sha == enrollment['hostIdentitySha256'], 'Enrollment belongs to a foreign host')
        approval_sha = digest(secure_read('/etc/leetplus-compose/approval-root.pem', 4096))
        return expected_from_inventory(mode=mode, identity=operation_id, old=old, target=target,
            host_sha=machine_sha, protected=protected, approval_root_sha=approval_sha,
            bundle_sha=enrollment['bundleSha256'], permit_root_sha=digest(roots['permit'].encode()),
            serving_pointer=pointer, critical_names=critical_names), roots

    def protected_state(self, mode):
        """Postimage observation still executes only pinned predecessor bytes."""
        self._enrollment()
        old_sha = A_RELEASE if mode == 'A_TO_BRIDGE' else BRIDGE_RELEASE
        require(mode in ('A_TO_BRIDGE', 'BRIDGE_TO_EXTERNAL'), 'Unknown observer mode')
        old = admitted_control(controls_root=self.controls_root, inbox_root=self.inbox_root,
                               release_sha=old_sha)
        require(old['manifestSha256'] == (A_MANIFEST if mode == 'A_TO_BRIDGE' else BRIDGE_MANIFEST) and
                old['files']['control_handoff.py'] == (A_EXECUTOR if mode == 'A_TO_BRIDGE' else BRIDGE_EXECUTOR),
                'Predecessor bytes changed before postimage observation')
        module = captured_predecessor(old, 'accepted_postimage_handoff')
        current = module.snapshot(old['root'])
        timers = {unit: module.systemd(unit) for unit in module.TIMERS}
        return protected_from_accepted_snapshot(current, timers,
            digest(secure_read(module.UNIT, 2 * 1024 * 1024)))

    def native_context(self, mode, target_release):
        """Read the complete legacy snapshot used for canonical V1 plan bytes."""
        self._enrollment()
        require(mode in ('A_TO_BRIDGE', 'BRIDGE_TO_EXTERNAL'), 'Unknown observer mode')
        old_sha = A_RELEASE if mode == 'A_TO_BRIDGE' else BRIDGE_RELEASE
        old = admitted_control(controls_root=self.controls_root, inbox_root=self.inbox_root, release_sha=old_sha)
        target = admitted_control(controls_root=self.controls_root, inbox_root=self.inbox_root, release_sha=target_release)
        require(old['manifestSha256'] == (A_MANIFEST if mode == 'A_TO_BRIDGE' else BRIDGE_MANIFEST),
                'Predecessor manifest changed before native context')
        module = captured_predecessor(old, 'accepted_native_context')
        snapshot = module.snapshot(old['root'])
        previous = secure_read(module.POINTER, 8192) if module.POINTER.exists() or module.POINTER.is_symlink() else None
        internal = {'root', 'capturedExecutor', 'capturedAuthority', 'capturedContract'}
        return {'old': {key: value for key, value in old.items() if key not in internal},
                'target': {key: value for key, value in target.items() if key not in internal},
                'snapshot': snapshot, 'timers': {unit: module.systemd(unit) for unit in module.TIMERS},
                'hostSha': digest(secure_read('/etc/machine-id', 65536).strip()),
                'networkUnitSha': digest(secure_read(module.UNIT, 2 * 1024 * 1024)),
                'networkUnitMode': stat.S_IMODE(module.UNIT.stat().st_mode),
                'previousPointerRaw': previous}
