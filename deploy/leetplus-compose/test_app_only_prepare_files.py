import copy
import hashlib
import importlib.util
import io
import json
import tarfile
import tempfile
import types
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name('prepare-files.py')
SPEC = importlib.util.spec_from_file_location('prepare_files', MODULE_PATH)
prepare_files = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prepare_files)


def digest(value):
    raw = value if isinstance(value, bytes) else prepare_files.canonical(value)
    return hashlib.sha256(raw).hexdigest()


def image(character):
    return f'sha256:{character * 64}'


class AppOnlyFixture:
    release_sha = 'a' * 40
    data_sha = 'd' * 40

    def __init__(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.state = self.root / 'state'
        self.production = self.root / 'srv/leetplus'
        self.operation = self.state / 'preparations/operation'
        self.app_root = self.state / f'app-downloads/{self.release_sha}'
        self.bundle_root = self.app_root / 'bundle'
        self.data_inbox = self.production / f'inbox/{self.data_sha}'
        for directory in [self.operation, self.bundle_root, self.data_inbox]:
            directory.mkdir(parents=True, mode=0o700)

        self.data_release = {
            'contract': prepare_files.MODE,
            'releaseSha': self.data_sha,
            'builtAt': '2026-09-10T00:00:00Z',
            'migrationCount': 191,
            'migration': prepare_files.CURRENT_MIGRATION,
            'apiResourceProfile': 'API_6G_V1',
            'images': {'api': image('1'), 'web': image('2'), 'postgres': image('e'), 'redis': image('f')},
        }
        self.bundle = {
            'schemaVersion': 2,
            'contract': prepare_files.APP_BUNDLE,
            'releaseLane': prepare_files.APP_LANE,
            'releaseSha': self.release_sha,
            'builtAt': '2026-09-24T00:00:00Z',
            'apiResourceProfile': 'API_6G_V1',
            'sourceImpact': {'baseSha': 'b' * 40, 'headSha': self.release_sha,
                             'classifierId': 'LEETPLUS_RELEASE_IMPACT_V1',
                             'rulesSha256': '1' * 64, 'impactReceiptSha256': '2' * 64},
            'appImages': {'api': image('3'), 'web': image('4')},
            'schemaRequirement': {'migrationCount': 191, 'migration': prepare_files.CURRENT_MIGRATION,
                                  'prismaSchemaSha256': '5' * 64, 'migrationsInventorySha256': '6' * 64},
            'compatibilityRequirements': {'policySha256': '7' * 64, 'composeRuntimeContractSha256': '8' * 64,
                                          'controllerCapability': 'APP_ONLY_V2_BASELINE_CERTIFICATION',
                                          'dataContract': prepare_files.MODE},
            'runtimeEvidence': {'transportValidationSha256': '9' * 64, 'apiRuntimeValidationSha256': 'a' * 64,
                                'archiveRoundtripSha256': 'b' * 64, 'networkValidationSha256': 'c' * 64,
                                'runtimeValidationSha256': 'd' * 64},
        }
        self.app_archive = self.bundle_root / 'app-images.tar.gz'
        self.app_archive.write_bytes(b'app archive')
        self.admission = {
            'schemaVersion': 2, 'contract': prepare_files.APP_ADMISSION, 'decision': 'PASS',
            'releaseLane': prepare_files.APP_LANE, 'releaseSha': self.release_sha,
            'repository': 'boozik3412/leetplus', 'ref': 'refs/heads/main', 'event': 'push',
            'runId': '12', 'runAttempt': '1',
            'workflowRef': 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main',
            'workflowSha': self.release_sha, 'parentCandidateReceiptSha256': 'e' * 64,
            'parentImpactReceiptSha256': self.bundle['sourceImpact']['impactReceiptSha256'],
            'requiredGateReceiptSha256': 'f' * 64,
            'gateReceiptSha256': {'authorityRootTrust': '1' * 64, 'application': '2' * 64,
                                  'postgresqlAssortment': '3' * 64, 'migrationSmoke': '4' * 64,
                                  'appImageRuntime': '5' * 64},
            'appArtifact': {'name': f'leetplus-compose-app-{self.release_sha}-12-1', 'id': '123',
                            'transportDigest': '6' * 64},
            'bundleManifestSha256': digest(self.bundle), 'appArchiveSha256': digest(b'app archive'),
            **self.bundle['runtimeEvidence'], 'appImages': self.bundle['appImages'],
            'schemaRequirementSha256': digest(self.bundle['schemaRequirement']),
            'compatibilityRequirementsSha256': digest(self.bundle['compatibilityRequirements']),
        }
        self.data_admission = {'contract': prepare_files.MODE + '_ADMISSION', 'decision': 'PASS',
                               'repository': 'boozik3412/leetplus', 'ref': 'refs/heads/main', 'event': 'push',
                               'releaseSha': self.data_sha, 'images': self.data_release['images'],
                               'releaseManifestSha256': digest(self.data_release)}
        self.data_admission_path = self.data_inbox / 'docker-admission.json'
        self.write_json(self.data_admission_path, self.data_admission)
        self.data_admission_path.chmod(0o440)
        self.baseline = {'contract': 'LEETPLUS_PREPARATION_ACTIVE_DATA_V2', 'activeStateSha256': '7' * 64,
                         'dataRelease': self.data_release,
                         'dataAdmissionSha256': digest(self.data_admission)}
        self.baseline_path = self.operation / 'active-data-baseline.json'
        self.write_json(self.baseline_path, self.baseline)
        self.release = copy.deepcopy(self.data_release)
        self.release.update({'releaseSha': self.release_sha, 'builtAt': self.bundle['builtAt'],
                             'migrationCount': 191, 'migration': prepare_files.CURRENT_MIGRATION,
                             'apiResourceProfile': 'API_6G_V1',
                             'images': {'api': self.bundle['appImages']['api'], 'web': self.bundle['appImages']['web'],
                                        'postgres': self.data_release['images']['postgres'],
                                        'redis': self.data_release['images']['redis']}})
        self.release_path = self.operation / 'derived-v1-release.json'
        self.bundle_path = self.bundle_root / 'app-bundle.json'
        self.admission_path = self.app_root / 'app-admission.json'
        self.receipt_path = self.app_root / 'download-receipt.json'
        self.write_json(self.release_path, self.release)
        self.write_json(self.bundle_path, self.bundle)
        self.write_json(self.admission_path, self.admission)
        records = {leaf: {'sha256': str(index + 1)[-1] * 64, 'bytes': index + 1}
                   for index, leaf in enumerate(sorted(prepare_files.APP_DOWNLOAD_FILES))}
        records['app-bundle.json'] = {'sha256': digest(self.bundle), 'bytes': len(prepare_files.canonical(self.bundle))}
        records['app-images.tar.gz'] = {'sha256': digest(b'app archive'), 'bytes': len(b'app archive')}
        for leaf, field in prepare_files.APP_DOWNLOAD_ADMISSION_FIELDS.items():
            records[leaf]['sha256'] = self.admission[field]
        self.receipt = {'contract': prepare_files.APP_DOWNLOAD, 'decision': 'PASS', 'inputSha256': '1' * 64,
                        'appAdmissionSha256': digest(self.admission), 'releaseSha': self.release_sha,
                        'runId': '12', 'runAttempt': '1', 'artifactId': '123', 'completedAt': '2026-09-24T00:01:00Z',
                        'intentSha256': '2' * 64, 'remoteSha256': '3' * 64, 'files': records}
        self.write_json(self.receipt_path, self.receipt)
        self.source = self.operation / 'rehearsal-source-capsule.tar'
        self.write_capsule()

    @staticmethod
    def write_json(path, value):
        path.write_bytes(prepare_files.canonical(value))

    def write_capsule(self, missing=None, symlink=None):
        names = ['runtime.env', 'slots/green.env', 'canary-safe.env', 'guest-user-call-live.env',
                 'bonus-ledger-worker.env', 'langame-daily-worker.env']
        with tarfile.open(self.source, 'w') as archive:
            for name in names:
                member_name = f'system/etc/leetplus/{name}'
                if member_name == missing:
                    continue
                data = b'DATABASE_URL=postgresql://leetplus_runtime:secret@postgres:5432/leetplus\n'
                info = tarfile.TarInfo(member_name)
                if member_name == symlink:
                    info.type = tarfile.SYMTYPE
                    info.linkname = 'runtime.env'
                    info.size = 0
                    archive.addfile(info)
                else:
                    info.size = len(data)
                    archive.addfile(info, io.BytesIO(data))

    def validate(self, **overrides):
        arguments = {'manifest_path': self.release_path, 'source': self.source,
                     'app_bundle_path': self.bundle_path, 'app_admission_path': self.admission_path,
                     'app_download_receipt_path': self.receipt_path, 'data_baseline_path': self.baseline_path,
                     'data_admission_path': self.data_admission_path, 'state_root': self.state,
                     'production_root': self.production, 'require_root': False}
        arguments.update(overrides)
        return prepare_files.validate_app_only_authority(**arguments)

    def close(self):
        self.temporary.cleanup()


class AppOnlyPreparationAuthority(unittest.TestCase):
    def setUp(self):
        self.fixture = AppOnlyFixture()

    def tearDown(self):
        self.fixture.close()

    def test_accepts_exact_derived_app_and_data_composition(self):
        release, evidence = self.fixture.validate()
        self.assertEqual(release['images']['api'], self.fixture.bundle['appImages']['api'])
        self.assertEqual(release['images']['postgres'], self.fixture.data_release['images']['postgres'])
        self.assertEqual(evidence['dataAdmissionSha256'], digest(self.fixture.data_admission))

    def test_historical_v1_admission_mode_0440_is_accepted_but_writable_or_v2_mode_is_not(self):
        v1 = types.SimpleNamespace(st_uid=0, st_mode=0o100440)
        writable = types.SimpleNamespace(st_uid=0, st_mode=0o100460)
        self.assertTrue(prepare_files.trusted_owner_mode(v1, immutable=False))
        self.assertFalse(prepare_files.trusted_owner_mode(v1, immutable=True))
        self.assertFalse(prepare_files.trusted_owner_mode(writable, immutable=False))

    def test_missing_tampered_or_mismatched_baseline_fails_closed(self):
        cases = [
            {key: value for key, value in self.fixture.baseline.items() if key != 'activeStateSha256'},
            {**self.fixture.baseline, 'activeStateSha256': 'not-a-hash'},
            {**self.fixture.baseline, 'dataAdmissionSha256': '0' * 64},
        ]
        for baseline in cases:
            with self.subTest(baseline=baseline):
                self.fixture.write_json(self.fixture.baseline_path, baseline)
                with self.assertRaises(ValueError):
                    self.fixture.validate()
        self.fixture.baseline_path.unlink()
        with self.assertRaises((ValueError, FileNotFoundError)):
            self.fixture.validate()

    def test_wrong_data_image_or_app_admission_mismatch_is_rejected(self):
        wrong = copy.deepcopy(self.fixture.release)
        wrong['images']['postgres'] = image('0')
        self.fixture.write_json(self.fixture.release_path, wrong)
        with self.assertRaisesRegex(ValueError, 'exact admitted app/data composition'):
            self.fixture.validate()
        self.fixture.write_json(self.fixture.release_path, self.fixture.release)
        admission = copy.deepcopy(self.fixture.admission)
        admission['appImages']['api'] = image('0')
        self.fixture.write_json(self.fixture.admission_path, admission)
        with self.assertRaises(ValueError):
            self.fixture.validate()

    def test_arbitrary_operator_paths_are_not_accepted(self):
        alternate = self.fixture.operation / 'app-bundle.json'
        alternate.write_bytes(self.fixture.bundle_path.read_bytes())
        with self.assertRaisesRegex(ValueError, 'exact installed download paths'):
            self.fixture.validate(app_bundle_path=alternate)

    def test_malformed_source_capsule_is_rejected_before_preparation(self):
        required = 'system/etc/leetplus/runtime.env'
        self.fixture.write_capsule(missing=required)
        with self.assertRaisesRegex(ValueError, 'lacks a required'):
            self.fixture.validate()
        self.fixture.write_capsule(symlink=required)
        with self.assertRaisesRegex(ValueError, 'Invalid source environment member'):
            self.fixture.validate()


class LegacyPreparationAuthority(unittest.TestCase):
    def test_v1_manifest_still_uses_only_adjacent_v1_admission(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            release = {'releaseSha': 'a' * 40, 'migrationCount': 191}
            release_path = root / 'release.json'
            release_path.write_text(json.dumps(release))
            admission = {'decision': 'PASS', 'releaseSha': release['releaseSha'],
                         'releaseManifestSha256': hashlib.sha256(release_path.read_bytes()).hexdigest()}
            (root / 'docker-admission.json').write_text(json.dumps(admission))
            self.assertEqual(prepare_files.validate_v1_authority(release_path), release)
            admission['decision'] = 'FAIL'
            (root / 'docker-admission.json').write_text(json.dumps(admission))
            with self.assertRaisesRegex(ValueError, 'Admitted CURRENT191'):
                prepare_files.validate_v1_authority(release_path)


if __name__ == '__main__':
    unittest.main()
