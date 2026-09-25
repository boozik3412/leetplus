import importlib.util
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location('plan_backup_exports', Path(__file__).with_name('plan_backup_exports.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def entry(day, sha):
    name = f'backup-202609{day:02d}T010000Z.lpbackup'
    return {'name': name, 'bytes': day * 100, 'manifestSha256': sha * 64,
            'capturedAt': f'2026-09-{day:02d}T01:00:00+00:00', 'manifestExists': True}


class BackupRetentionPreview(unittest.TestCase):
    def setUp(self):
        self.server = [entry(23, 'a'), entry(24, 'b'), entry(25, 'c')]
        self.offhost = [{'name': row['name'], 'bytes': row['bytes'], 'receiptSha256': row['manifestSha256'],
                         'receiptVerified': True} for row in self.server]
        self.latest = {'contract': 'LEETPLUS_BACKUP_EXPORT_V1', 'filename': self.server[-1]['name'],
                       'bytes': self.server[-1]['bytes'], 'sha256': self.server[-1]['manifestSha256']}

    def test_two_generations_require_matching_offhost_proofs(self):
        result = module.plan(self.server, self.offhost, self.latest, 2)
        self.assertEqual(result['decision'], 'CANDIDATE_PREVIEW_ONLY')
        self.assertEqual([item['name'] for item in result['keep']], [self.server[2]['name'], self.server[1]['name']])
        self.assertEqual([item['name'] for item in result['candidateExports']], [self.server[0]['name']])
        self.assertEqual(result['candidateBytes'], self.server[0]['bytes'])

    def test_missing_or_unverified_offhost_copy_blocks_candidates(self):
        self.offhost[-1]['receiptVerified'] = False
        result = module.plan(self.server, self.offhost, self.latest, 2)
        self.assertEqual(result['decision'], 'HOLD')
        self.assertEqual(result['candidateExports'], [])
        self.assertIn('OFFHOST_PROOF_MISSING:' + self.server[-1]['name'], result['reasons'])

    def test_protected_historical_backup_blocks_retirement(self):
        result = module.plan(self.server, self.offhost, self.latest, 2, [self.server[0]['name']])
        self.assertEqual(result['decision'], 'HOLD')
        self.assertEqual(result['candidateExports'], [])
        self.assertIn('PROTECTED_EXTRA:' + self.server[0]['name'], result['reasons'])

    def test_latest_pointer_drift_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'latest pointer'):
            module.plan(self.server, self.offhost, {**self.latest, 'sha256': 'd' * 64}, 2)

    def test_filename_timestamp_drift_is_rejected(self):
        self.server[0]['capturedAt'] = '2026-09-22T01:00:00+00:00'
        with self.assertRaisesRegex(ValueError, 'timestamp differs'):
            module.plan(self.server, self.offhost, self.latest, 2)

    def test_one_generation_is_explicit_and_still_needs_offhost_proof(self):
        result = module.plan(self.server, self.offhost, self.latest, 1)
        self.assertEqual([item['name'] for item in result['candidateExports']],
                         [self.server[1]['name'], self.server[0]['name']])
        self.offhost[-1]['receiptVerified'] = False
        self.assertEqual(module.plan(self.server, self.offhost, self.latest, 1)['decision'], 'HOLD')


if __name__ == '__main__':
    unittest.main()
