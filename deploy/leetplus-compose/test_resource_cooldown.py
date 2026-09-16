import copy
import importlib.util
import unittest
from pathlib import Path


SOURCE = Path(__file__).with_name('resource_cooldown.py')
SPEC = importlib.util.spec_from_file_location('resource_cooldown', SOURCE)
cooldown = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cooldown)


GIB = 1024 ** 3


def sample(second, blue, green, avail):
    return {
        'at': second,
        'avail': avail,
        'memory': {'api-blue': blue, 'api-green': green},
    }


def trace(blue_values=None, green_values=None, available_values=None):
    blue_values = blue_values or [4 * GIB] * 7
    green_values = green_values or [3 * GIB] * 7
    available_values = available_values or [24 * GIB] * 7
    samples = [sample(0, 3 * GIB, 2 * GIB, 25 * GIB)]
    for index, (blue, green, available) in enumerate(zip(blue_values, green_values, available_values)):
        samples.append(sample(index * 10 + 1, blue, green, available))
    samples.append(sample(75, blue_values[-1], green_values[-1], available_values[-1]))
    return {
        'decision': 'PASS',
        'samples': samples,
        'marks': [
            {'label': 'cooldown-60s', 'at': 1, 'sample': 1},
            {'label': 'post-cooldown', 'at': 61, 'sample': 7},
            {'label': 'post-read-complete', 'at': 75, 'sample': 8},
        ],
    }


class ResourceCooldownTests(unittest.TestCase):
    def test_decline_passes_and_reports_truthful_metrics(self):
        result = cooldown.evaluate_cooldown(trace([5 * GIB, 5 * GIB, 4 * GIB, 4 * GIB, 3 * GIB, 3 * GIB, 3 * GIB]))
        self.assertEqual(result['decision'], 'PASS')
        self.assertEqual(result['perApi']['api-blue']['trajectory'], 'DECLINING')
        self.assertEqual(result['scope']['doesNotProveAbsenceOfLeak'], True)
        self.assertFalse(result['scope']['requiresColdRss'])

    def test_stable_passes_without_requiring_cold_rss(self):
        result = cooldown.evaluate_cooldown(trace())
        self.assertEqual(result['decision'], 'PASS')
        self.assertEqual(result['perApi']['api-blue']['trajectory'], 'STABLE')
        self.assertEqual(result['perApi']['api-blue']['retainedVsBaseline']['baselineMedianBytes'], 3 * GIB)

    def test_retained_memory_is_reported_without_a_false_leak_claim(self):
        result = cooldown.evaluate_cooldown(trace([6 * GIB] * 7))
        retained = result['perApi']['api-blue']['retainedVsBaseline']
        self.assertEqual(result['decision'], 'PASS')
        self.assertEqual(retained['deltaBytes'], 3 * GIB)
        self.assertEqual(result['scope']['doesNotProveAbsenceOfLeak'], True)

    def test_sustained_growth_with_host_available_drop_holds(self):
        blue = [3 * GIB, 3 * GIB, 4 * GIB, 4 * GIB, 5 * GIB, 5 * GIB, 5 * GIB]
        available = [24 * GIB, 24 * GIB, 23 * GIB, 23 * GIB, 22 * GIB, 22 * GIB, 22 * GIB]
        result = cooldown.evaluate_cooldown(trace(blue, available_values=available))
        self.assertEqual(result['decision'], 'HOLD')
        self.assertIn('SUSTAINED_API_GROWTH_WITH_HOST_AVAILABLE_DROP', result['reasons'])

    def test_missing_mark_duration_or_samples_hold(self):
        missing = trace()
        missing['marks'] = missing['marks'][1:]
        self.assertEqual(cooldown.evaluate_cooldown(missing)['decision'], 'HOLD')
        short = trace()
        short['marks'][1]['at'] = 55
        self.assertIn('COOLDOWN_DURATION_BELOW_60_SECONDS', cooldown.evaluate_cooldown(short)['reasons'])
        few = trace()
        few['marks'][1] = {'label': 'post-cooldown', 'at': 21, 'sample': 3}
        few['marks'][2] = {'label': 'post-read-complete', 'at': 31, 'sample': 4}
        self.assertEqual(cooldown.evaluate_cooldown(few)['decision'], 'HOLD')
        guarded = copy.deepcopy(trace())
        guarded['decision'] = 'HOLD'
        self.assertEqual(cooldown.evaluate_cooldown(guarded)['reasons'], ['GUARD_DECISION_NOT_PASS'])

    def test_equal_elapsed_timestamps_are_allowed_when_marker_indices_are_ordered(self):
        evidence = trace()
        evidence['samples'][2]['at'] = evidence['samples'][1]['at']
        self.assertEqual(cooldown.evaluate_cooldown(evidence)['decision'], 'PASS')


if __name__ == '__main__':
    unittest.main()
