"""No-effect verification of the independently admitted installer boundary."""
import base64
import datetime as dt
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import types
import unittest
from unittest.mock import patch

ENTRY_PATH = Path(__file__).resolve().parents[2] / 'docs/deployment/production-artifact/install_predecessor_bootstrap.py'
spec = importlib.util.spec_from_file_location('bootstrap_install_entry_test', ENTRY_PATH)
entry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(entry)


class InstallEntryTests(unittest.TestCase):
    def fixture(self):
        paths = set(entry.BUNDLE_PATHS) | {entry.HELPER_PATH, entry.SOURCE_PATH, entry.LAYOUT_PATH, entry.VERIFIER_SOURCE_PATH, entry.LAUNCHER_SOURCE_PATH}
        raw = {p: ('fixture ' + p + '\n').encode() for p in paths}
        raw[entry.LAYOUT_PATH] = entry.canonical(entry.LAYOUT)
        manifest = {p: entry.digest(b) for p, b in raw.items()}
        root = Path('/fixture-generation')
        def read(path):
            if path == entry.ENTRY:
                return raw[entry.SOURCE_PATH]
            return raw[path.relative_to(root).as_posix()]
        return root, raw, manifest, read

    def test_full_source_map_passes_before_any_import(self):
        root, raw, manifest, read = self.fixture()
        self.assertEqual(entry.verify_source_map(root, manifest, read=read), raw)
        self.assertEqual(set(raw), set(entry.BUNDLE_PATHS) | {entry.HELPER_PATH, entry.SOURCE_PATH, entry.LAYOUT_PATH, entry.VERIFIER_SOURCE_PATH, entry.LAUNCHER_SOURCE_PATH})

    def test_missing_helper_mutated_module_or_entry_fail_closed(self):
        root, raw, manifest, read = self.fixture()
        del manifest[entry.HELPER_PATH]
        with self.assertRaisesRegex(ValueError, 'omits'):
            entry.verify_source_map(root, manifest, read=read)
        manifest[entry.HELPER_PATH] = entry.digest(raw[entry.HELPER_PATH])
        raw['deploy/transition-bootstrap/authority.py'] = b'raise SystemExit("untrusted executed")\n'
        with self.assertRaisesRegex(ValueError, 'source leaf differs'):
            entry.verify_source_map(root, manifest, read=read)
        root, raw, manifest, read = self.fixture()
        def foreign_entry(path):
            return b'foreign wrapper\n' if path == entry.ENTRY else read(path)
        with self.assertRaisesRegex(ValueError, 'entrypoint'):
            entry.verify_source_map(root, manifest, read=foreign_entry)

    def test_layout_cannot_choose_a_foreign_root(self):
        root, raw, manifest, read = self.fixture()
        changed = {**entry.LAYOUT, 'operationStateRoot': '/root/foreign'}
        raw[entry.LAYOUT_PATH] = entry.canonical(changed)
        manifest[entry.LAYOUT_PATH] = entry.digest(raw[entry.LAYOUT_PATH])
        with self.assertRaisesRegex(ValueError, 'layout differs'):
            entry.verify_source_map(root, manifest, read=read)

    def test_manifest_rejects_duplicates_unsorted_and_parent_paths(self):
        good = b'a' * 64 + b'  ./a\n' + b'b' * 64 + b'  ./b\n'
        self.assertEqual(set(entry.parse_manifest(good)), {'a', 'b'})
        for raw in (good + b'a' * 64 + b'  ./a\n', good.splitlines(keepends=True)[1] + good.splitlines(keepends=True)[0],
                    b'a' * 64 + b'  ./../foreign\n'):
            with self.assertRaises(ValueError):
                entry.parse_manifest(raw)

    def test_import_collision_never_executes_checked_sources(self):
        with patch.dict(sys.modules, {'native_boundary': types.ModuleType('foreign')}):
            with self.assertRaisesRegex(ValueError, 'collision'):
                entry.load_installer(Path('/fixture-generation'), {})

    def test_invalid_bundle_map_stops_before_import_or_installer_effect(self):
        root, raw, manifest, read = self.fixture()
        checked = entry.verify_source_map(root, manifest, read=read)
        plan = {'sourceRelease': 'a' * 40, 'operationId': '12345678-1234-4123-8123-123456789abc',
                'bundleFiles': {},
                'installerSourceSha256': entry.digest(checked[entry.SOURCE_PATH])}
        with patch.object(entry.os, 'name', 'posix'), \
             patch.object(entry.os, 'geteuid', return_value=0, create=True), \
             patch.object(entry.sys, 'flags', types.SimpleNamespace(isolated=True)), \
             patch.object(entry.sys, 'dont_write_bytecode', True), \
             patch.object(entry, 'verify_generation', return_value=(root, checked)), \
             patch.object(entry, 'verify_signed_plan', return_value={}), \
             patch.object(entry, 'verify_staged_request'), \
             patch.object(entry, 'read_request', return_value=(plan, {}, b'', {})), \
             patch.object(entry, 'load_installer') as imported:
            with self.assertRaisesRegex(ValueError, 'closed source bundle'):
                entry.run('apply', 'a' * 40, '12345678-1234-4123-8123-123456789abc')
            imported.assert_not_called()

    def test_v2_authority_tamper_is_rejected_by_plan_signature_binding(self):
        at = dt.datetime(2026, 9, 29, tzinfo=dt.timezone.utc)
        authority = {key: 'a' * 64 for key in entry.AUTHORITY_FIELDS}
        plan = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_PLAN',
                'action': 'INSTALL_INDEPENDENT_PUBLIC_ONLY_ADAPTER', 'effects': entry.INSTALL_EFFECTS,
                'operationId': '12345678-1234-4123-8123-123456789abc', 'hostIdentitySha256': 'b' * 64,
                'installerAuthority': authority}
        approval = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_APPROVAL',
                    'operationId': plan['operationId'], 'hostIdentitySha256': plan['hostIdentitySha256'],
                    'planSha256': entry.digest(entry.canonical(plan)), 'action': plan['action'],
                    'issuedAt': '2026-09-29T00:00:00.000Z', 'expiresAt': '2026-09-29T00:20:00.000Z'}
        envelope = {'approval': approval, 'signature': 'A' * 86 + '=='}
        entry.validate_approval_fields(plan, envelope, at)
        authority['helperSourceSha256'] = 'c' * 64
        with self.assertRaisesRegex(ValueError, 'bind exact V2'):
            entry.validate_approval_fields(plan, envelope, at)
        old = {**plan, 'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V1_PLAN'}
        with self.assertRaisesRegex(ValueError, 'V2 plan'):
            entry.validate_approval_fields(old, envelope, at)

    def test_changed_installed_verifier_never_executes(self):
        authority = {key: 'a' * 64 for key in entry.AUTHORITY_FIELDS}
        fake = types.SimpleNamespace(lstat=lambda: types.SimpleNamespace(st_mode=0o555))
        with patch.object(entry, 'ENTRY', ENTRY_PATH.resolve()), \
             patch.object(entry, 'VERIFIER', fake), \
             patch.object(entry, 'secure_read', return_value=b'foreign verifier bytes'), \
             patch.object(entry.subprocess, 'run') as execute:
            with self.assertRaisesRegex(ValueError, 'verifier digest differs'):
                entry.verify_generation('a' * 40, authority)
            execute.assert_not_called()

    def test_verifier_executes_captured_signed_bytes_not_reopened_path(self):
        source = 'a' * 40
        operation = '12345678-1234-4123-8123-123456789abc'
        root = entry.GENERATION / source
        payload = root / 'payload'
        _, raw, _, _ = self.fixture()
        verified_code = b"import fs from 'node:fs';\n// exact signed minimal verifier snapshot\n"
        foreign_code = b"throw new Error('replacement must never execute');\n"
        raw[entry.VERIFIER_SOURCE_PATH] = verified_code
        manifest = {key: entry.digest(value) for key, value in raw.items()}
        manifest_raw = ''.join(f'{manifest[key]}  ./{key}\n' for key in sorted(manifest)).encode()
        authority = {'helperSourceSha256': entry.digest(raw[entry.HELPER_PATH]),
                     'verifierSourceSha256': entry.digest(verified_code), 'introPlanSha256': 'c' * 64,
                     'generationRootManifestSha256': entry.digest(manifest_raw)}
        generation_receipt = {'contract': 'LEETPLUS_STANDALONE_INERT_GENERATION_V1_RECEIPT',
                              'sourceRelease': source, 'introPlanSha256': authority['introPlanSha256'],
                              'operationId': operation}
        generation_raw = entry.canonical(generation_receipt)
        authority['generationReceiptSha256'] = entry.digest(generation_raw)
        intro_receipt = {'contract': 'LEETPLUS_STANDALONE_INITIAL_INTRO_V1_RECEIPT',
                         'operationId': operation, 'planSha256': authority['introPlanSha256'],
                         'generationReceiptSha256': authority['generationReceiptSha256']}
        intro_raw = entry.canonical(intro_receipt)
        authority['introReceiptSha256'] = entry.digest(intro_raw)
        expected = {'contract': 'LEETPLUS_STANDALONE_INITIAL_INTRO_VERIFICATION_V1',
                    'decision': 'PASS', 'sourceRelease': source,
                    'introPlanSha256': authority['introPlanSha256'],
                    'introReceiptSha256': authority['introReceiptSha256'],
                    'generationRootManifestSha256': authority['generationRootManifestSha256'],
                    'generationReceiptSha256': authority['generationReceiptSha256'],
                    'verifierSourceSha256': authority['verifierSourceSha256']}
        installed_code = [verified_code]
        invoked = []
        original_verify_map = entry.verify_source_map
        original_self_path = original_verify_map.__defaults__[0]
        def read(path, *_):
            if path == entry.VERIFIER:
                return installed_code[0]
            if str(path) == '/usr/bin/node':
                return b'host Node platform binary'
            if path == root / 'receipt.json':
                return generation_raw
            if path == entry.INTRO_AUDIT / operation / 'receipt.json':
                return intro_raw
            if path == payload / 'SHA256SUMS':
                return manifest_raw
            if path == original_self_path:
                return raw[entry.SOURCE_PATH]
            return raw[path.relative_to(payload).as_posix()]
        def execute(argv, **kwargs):
            installed_code[0] = foreign_code  # race after the signed fd snapshot
            invoked.append((argv, kwargs['input']))
            return types.SimpleNamespace(returncode=0, stderr=b'', stdout=entry.canonical(expected))
        actual_entry = ENTRY_PATH.resolve()
        fake_verifier = types.SimpleNamespace(lstat=lambda: types.SimpleNamespace(st_mode=0o555))
        with patch.object(entry, 'ENTRY', actual_entry), \
             patch.object(entry, 'VERIFIER', fake_verifier), \
             patch.object(entry, 'secure_read', side_effect=read), \
             patch.object(entry, 'verify_source_map', side_effect=lambda r, m: original_verify_map(r, m, read=read)), \
             patch.object(entry.subprocess, 'run', side_effect=execute):
            result_root, checked = entry.verify_generation(source, authority)
        self.assertEqual(result_root, payload)
        self.assertEqual(checked[entry.HELPER_PATH], raw[entry.HELPER_PATH])
        self.assertEqual(len(invoked), 1)
        argv, program = invoked[0]
        self.assertEqual(argv, ['/usr/bin/node', '--input-type=module', '-', '--source-release', source])
        self.assertTrue(program.endswith(verified_code))
        self.assertNotIn(foreign_code, program)

    def test_unsigned_cli_release_cannot_select_verifier_generation(self):
        with patch.object(entry.os, 'name', 'posix'), \
             patch.object(entry.os, 'geteuid', return_value=0, create=True), \
             patch.object(entry.sys, 'flags', types.SimpleNamespace(isolated=True)), \
             patch.object(entry.sys, 'dont_write_bytecode', True), \
             patch.object(entry, 'read_request', return_value=({'sourceRelease': 'a' * 40}, {}, b'', {})), \
             patch.object(entry, 'verify_signed_plan') as signed, \
             patch.object(entry, 'verify_generation') as generation:
            with self.assertRaisesRegex(ValueError, 'source release differs'):
                entry.run('prepare', 'b' * 40, '12345678-1234-4123-8123-123456789abc')
            signed.assert_not_called()
            generation.assert_not_called()

    def test_installer_closure_matches_enrollment_contract(self):
        repo = ENTRY_PATH.parents[3]
        import ast
        tree = ast.parse((repo / 'deploy/transition-bootstrap/enrollment.py').read_bytes())
        assigned = next(node for node in tree.body if isinstance(node, ast.Assign) and
                        any(isinstance(target, ast.Name) and target.id == 'REQUIRED_BUNDLE_FILES'
                            for target in node.targets))
        self.assertEqual(set(entry.BUNDLE_PATHS), ast.literal_eval(assigned.value))
        self.assertEqual(len(entry.BUNDLE_PATHS), 14)
        self.assertEqual(set(entry.IMPORT_ORDER), {'native_boundary', 'inventory', 'authority',
                         'enrollment', 'host_observer', 'bundle_installer'})
        self.assertEqual(entry.LAYOUT['operationStateRoot'], '/var/lib/leetplus-compose')
        self.assertEqual(entry.LAYOUT['pendingStateRoot'], '/var/lib/leetplus-compose')
        self.assertEqual((repo / entry.LAYOUT_PATH).read_bytes(), entry.canonical(entry.LAYOUT))

    def test_inline_deployment_signature_verifies_before_any_candidate_import(self):
        node = shutil.which('node')
        if node is None:
            self.skipTest('Focused source test requires Node runtime')
        real_run = subprocess.run
        generated = real_run([node, '-e', "const c=require('node:crypto');const k=c.generateKeyPairSync('ed25519');process.stdout.write(JSON.stringify({public:k.publicKey.export({format:'pem',type:'spki'}),private:k.privateKey.export({format:'pem',type:'pkcs8'})}));"],
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        keys = json.loads(generated.stdout)
        now = dt.datetime.now(dt.timezone.utc)
        stamp = lambda time: time.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        authority = {key: 'a' * 64 for key in entry.AUTHORITY_FIELDS}
        host_raw = b'fixture-host\n'
        wrapper_raw = ENTRY_PATH.read_bytes()
        plan = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_PLAN',
                'action': 'INSTALL_INDEPENDENT_PUBLIC_ONLY_ADAPTER', 'effects': entry.INSTALL_EFFECTS,
                'operationId': '12345678-1234-4123-8123-123456789abc',
                'hostIdentitySha256': entry.digest(host_raw.strip()),
                'installerSourceSha256': entry.digest(wrapper_raw),
                'installerAuthority': authority}
        approval = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_APPROVAL',
                    'operationId': plan['operationId'], 'hostIdentitySha256': plan['hostIdentitySha256'],
                    'planSha256': entry.digest(entry.canonical(plan)), 'action': plan['action'],
                    'issuedAt': stamp(now - dt.timedelta(seconds=10)),
                    'expiresAt': stamp(now + dt.timedelta(minutes=20))}
        signing = real_run([node, '-e', "const c=require('node:crypto');let x=JSON.parse(require('node:fs').readFileSync(0,'utf8'));let k=c.createPrivateKey(x.private);process.stdout.write(c.sign(null,Buffer.from(x.message,'base64'),k).toString('base64'));"],
                           input=json.dumps({'private': keys['private'], 'message': base64.b64encode(entry.canonical(approval)).decode()}).encode(),
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        envelope = {'approval': approval, 'signature': signing.stdout.decode()}
        def read(path, *_):
            if path == entry.APPROVAL_ROOT:
                return keys['public'].encode()
            if str(path) == '/usr/bin/node':
                return b'fixture host Node executable'
            if str(path) == '/etc/machine-id':
                return host_raw
            if path == entry.ENTRY:
                return wrapper_raw
            raise AssertionError('Unreviewed read in inline signature test')
        def run_node(argv, **kwargs):
            self.assertEqual(argv[0], '/usr/bin/node')
            return real_run([node, *argv[1:]], **kwargs)
        with patch.object(entry, 'secure_read', side_effect=read), \
             patch.object(entry.subprocess, 'run', side_effect=run_node):
            self.assertEqual(entry.verify_signed_plan(plan, envelope), authority)
            corrupted = {'approval': approval, 'signature': 'A' * 86 + '=='}
            with self.assertRaisesRegex(ValueError, 'signature rejected'):
                entry.verify_signed_plan(plan, corrupted)

    def test_receipt_recovery_uses_original_intent_time_and_never_apply(self):
        root, raw, manifest, read = self.fixture()
        checked = entry.verify_source_map(root, manifest, read=read)
        source = 'a' * 40
        operation = '12345678-1234-4123-8123-123456789abc'
        plan = {'sourceRelease': source, 'operationId': operation,
                'bundleFiles': {path: entry.digest(checked[path]) for path in entry.BUNDLE_PATHS},
                'installerSourceSha256': entry.digest(checked[entry.SOURCE_PATH])}
        approval = {'approval': {'fixture': 'original signed plan'}, 'signature': 'fixture'}
        intent = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_PLAN_INTENT',
                  'operationId': operation, 'planSha256': entry.digest(entry.canonical(plan)),
                  'approvalSha256': entry.digest(entry.canonical(approval)),
                  'authorizedAt': '2026-01-01T00:05:00.000Z'}
        records = {operation + '.standalone-install.intent.json': intent}
        def record(path, *_):
            value = records[path.name]
            return value, entry.canonical(value)
        helper = types.SimpleNamespace(reconcile=lambda *_: {'decision': 'RECONCILED_INSTALLED_PUBLIC_ONLY'})
        helper.apply = lambda *_: self.fail('Receipt recovery must never install again')
        helper.prepare = lambda *_: self.fail('Receipt recovery must not execute preparation')
        module = types.SimpleNamespace(StandaloneBundleInstaller=lambda **_: helper)
        from pathlib import PurePosixPath
        with patch.object(entry.os, 'name', 'posix'), \
             patch.object(entry.os, 'geteuid', return_value=0, create=True), \
             patch.object(entry.sys, 'flags', types.SimpleNamespace(isolated=True)), \
             patch.object(entry.sys, 'dont_write_bytecode', True), \
             patch.object(entry, 'Path', PurePosixPath), \
             patch.object(entry, 'read_request', return_value=(plan, approval, b'archive', {})), \
             patch.object(entry, 'exact_json', side_effect=record), \
             patch.object(entry, 'historical_intent_or_classification', return_value=(intent, None)), \
             patch.object(entry, 'verify_signed_plan', return_value={}) as signature, \
             patch.object(entry, 'verify_staged_request'), \
             patch.object(entry, 'verify_generation', return_value=(root, checked)), \
             patch.object(entry, 'load_installer', return_value=module):
            result = entry.run('reconcile', source, operation)
        self.assertEqual(result['decision'], 'RECONCILED_INSTALLED_PUBLIC_ONLY')
        self.assertEqual(signature.call_args.args[2], dt.datetime(2026, 1, 1, 0, 5, tzinfo=dt.timezone.utc))

    def test_torn_intent_is_classified_without_verifier_import_or_replay(self):
        source = 'a' * 40
        operation = '12345678-1234-4123-8123-123456789abc'
        plan = {'sourceRelease': source, 'operationId': operation}
        classification = {'decision': 'UNKNOWN_TORN_INSTALL_INTENT_REQUIRES_SIGNED_RECOVERY'}
        from pathlib import PurePosixPath
        with patch.object(entry.os, 'name', 'posix'), \
             patch.object(entry.os, 'geteuid', return_value=0, create=True), \
             patch.object(entry.sys, 'flags', types.SimpleNamespace(isolated=True)), \
             patch.object(entry.sys, 'dont_write_bytecode', True), \
             patch.object(entry, 'Path', PurePosixPath), \
             patch.object(entry, 'read_request', return_value=(plan, {}, b'archive', {})), \
             patch.object(entry, 'historical_intent_or_classification', return_value=(None, classification)), \
             patch.object(entry, 'verify_signed_plan') as signature, \
             patch.object(entry, 'verify_generation') as generation, \
             patch.object(entry, 'load_installer') as imported:
            self.assertEqual(entry.run('reconcile', source, operation), classification)
        signature.assert_not_called()
        generation.assert_not_called()
        imported.assert_not_called()

    def test_captured_request_requires_canonical_closed_bytes(self):
        payload = {'plan': {'sourceRelease': 'a' * 40}, 'approvalEnvelope': {},
                   'bundleTarGzBase64': base64.b64encode(b'archive').decode(),
                   'publicRoots': {name: '-----BEGIN PUBLIC KEY-----\nfixture\n-----END PUBLIC KEY-----\n'
                                   for name in ('permit', 'execution', 'rollback', 'noEffect')}}
        with patch.object(entry.sys, 'stdin', types.SimpleNamespace(buffer=io.BytesIO(entry.canonical(payload)))):
            plan, approval, archive, roots = entry.read_captured_request()
        self.assertEqual(plan, payload['plan'])
        self.assertEqual(approval, {})
        self.assertEqual(archive, b'archive')
        self.assertEqual(set(roots), set(payload['publicRoots']))
        for bad in (json.dumps(payload).encode(), entry.canonical({**payload, 'foreign': True}),
                    entry.canonical({**payload, 'bundleTarGzBase64': '!!!!'})):
            with patch.object(entry.sys, 'stdin', types.SimpleNamespace(buffer=io.BytesIO(bad))):
                with self.assertRaises((ValueError, base64.binascii.Error)):
                    entry.read_captured_request()

    def test_staged_request_receipt_binds_all_seven_captured_leaves(self):
        operation = '12345678-1234-4123-8123-123456789abc'
        plan = {'operationId': operation}
        approval = {'approval': {'operationId': operation}}
        roots = {name: ('public ' + name).encode() for name in
                 ('permit', 'execution', 'rollback', 'noEffect')}
        archive = b'archive'
        files = {'plan.json': entry.canonical(plan), 'approval.json': entry.canonical(approval),
                 'bundle.tar.gz': archive, **{name + '-root.pem': raw for name, raw in roots.items()}}
        file_map = {name: entry.digest(raw) for name, raw in sorted(files.items())}
        intent = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_REQUEST_INTENT',
                  'operationId': operation, 'planSha256': entry.digest(entry.canonical(plan)),
                  'approvalSha256': entry.digest(entry.canonical(approval)),
                  'authorizedAt': '2026-01-01T00:00:00.000Z', 'requestFiles': file_map}
        receipt = {'contract': 'LEETPLUS_PREDECESSOR_BOOTSTRAP_INSTALL_V2_REQUEST_RECEIPT',
                   'decision': 'STAGED_ONLY_NOT_INSTALLED', 'operationId': operation,
                   'planSha256': intent['planSha256'], 'approvalSha256': intent['approvalSha256'],
                   'intentSha256': entry.digest(entry.canonical(intent)), 'requestFiles': file_map}
        records = {'intent': intent, 'receipt': receipt}

        def exact(path, *_):
            key = 'intent' if path.name.endswith('.intent.json') else 'receipt'
            return records[key], entry.canonical(records[key])

        with patch.object(entry, 'exact_json', side_effect=exact), \
             patch.object(entry, 'validate_approval_fields') as historic:
            entry.verify_staged_request(operation, plan, approval, archive, roots)
            self.assertEqual(historic.call_args.args[2],
                             dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc))
            with self.assertRaisesRegex(ValueError, 'placement'):
                entry.verify_staged_request(operation, plan, approval, archive + b'foreign', roots)
            records['receipt'] = {**receipt, 'intentSha256': '0' * 64}
            with self.assertRaisesRegex(ValueError, 'placement receipt'):
                entry.verify_staged_request(operation, plan, approval, archive, roots)


if __name__ == '__main__':
    unittest.main()
