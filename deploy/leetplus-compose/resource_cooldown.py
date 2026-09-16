"""Bounded post-load cooldown interpretation; this never samples a live host."""
import statistics


GIB = 1024 ** 3
MIN_AVAILABLE_BYTES = 12 * GIB
GROWTH_FLOOR_BYTES = 256 * 1024 ** 2
HOST_DROP_FLOOR_BYTES = 256 * 1024 ** 2
API_NAMES = ('api-blue', 'api-green')
START_MARK = 'cooldown-60s'
END_MARK = 'post-cooldown'


def _median(values):
    return int(statistics.median(values))


def _result(decision, reasons, per_api=None, host=None, scope=None):
    return {
        'contract': 'LEETPLUS_RESOURCE_COOLDOWN_V1',
        'decision': decision,
        'reasons': reasons,
        'perApi': per_api or {},
        'host': host or {},
        'scope': scope or {
            'window': 'bounded post-load cooldown observation',
            'minimumDurationSeconds': 60,
            'minimumSamples': 5,
            'minimumAvailableBytes': MIN_AVAILABLE_BYTES,
            'proves': 'only the observed bounded cooldown trace',
            'doesNotProveAbsenceOfLeak': True,
            'requiresColdRss': False,
        },
    }


def evaluate_cooldown(guard_result):
    """Evaluate a guarded 60-second quiet window without claiming leak proof.

    Samples must have elapsed numeric ``at``, ``avail``, and integer ``memory``
    values for both API containers. Guard marks, not sample labels, delimit the
    range: ``cooldown-60s`` starts it, ``post-cooldown`` ends it, and
    ``post-read-complete`` proves a later sampled post-read.
    """
    if not isinstance(guard_result, dict) or guard_result.get('decision') != 'PASS':
        return _result('HOLD', ['GUARD_DECISION_NOT_PASS'])
    samples = guard_result.get('samples')
    if not isinstance(samples, list):
        return _result('HOLD', ['COOLDOWN_SAMPLES_MISSING'])

    normalized = []
    for index, sample in enumerate(samples):
        if not isinstance(sample, dict):
            return _result('HOLD', ['COOLDOWN_SAMPLE_INVALID'])
        memory = sample.get('memory')
        at = sample.get('at')
        if not isinstance(at, (int, float)) or isinstance(at, bool) or at < 0 or not isinstance(sample.get('avail'), int) or sample['avail'] < 0 or not isinstance(memory, dict):
            return _result('HOLD', ['COOLDOWN_SAMPLE_INVALID'])
        if any(not isinstance(memory.get(name), int) or memory[name] < 0 for name in API_NAMES):
            return _result('HOLD', ['COOLDOWN_SAMPLE_INVALID'])
        normalized.append({'index': index, 'at': at, 'avail': sample['avail'], 'memory': memory})
    if any(normalized[index]['at'] > normalized[index + 1]['at'] for index in range(len(normalized) - 1)):
        return _result('HOLD', ['COOLDOWN_SAMPLE_ORDER_INVALID'])

    marks = guard_result.get('marks')
    if not isinstance(marks, list):
        return _result('HOLD', ['COOLDOWN_MARKS_MISSING'])
    indexed_marks = {}
    for mark in marks:
        if not isinstance(mark, dict) or not isinstance(mark.get('label'), str) or not isinstance(mark.get('sample'), int) or mark['sample'] < 0 or mark['sample'] >= len(normalized) or not isinstance(mark.get('at'), (int, float)) or isinstance(mark['at'], bool) or mark['at'] < 0:
            return _result('HOLD', ['COOLDOWN_MARK_INVALID'])
        indexed_marks.setdefault(mark['label'], []).append(mark)
    starts = indexed_marks.get(START_MARK, [])
    ends = indexed_marks.get(END_MARK, [])
    post_complete = indexed_marks.get('post-read-complete', [])
    if len(starts) != 1 or len(ends) != 1 or len(post_complete) != 1:
        return _result('HOLD', ['COOLDOWN_MARKERS_MISSING_OR_AMBIGUOUS'])
    start, end, post = starts[0], ends[0], post_complete[0]
    if not (start['sample'] < end['sample'] < post['sample']):
        return _result('HOLD', ['COOLDOWN_MARKER_ORDER_INVALID'])

    monitored = normalized[start['sample']:end['sample'] + 1]
    post_reads = normalized[end['sample'] + 1:post['sample'] + 1]
    reasons = []
    duration_seconds = end['at'] - start['at']
    if duration_seconds < 60:
        reasons.append('COOLDOWN_DURATION_BELOW_60_SECONDS')
    if len(monitored) < 5:
        reasons.append('COOLDOWN_SAMPLE_COUNT_BELOW_5')
    if not post_reads:
        reasons.append('POST_COOLDOWN_READS_MISSING')
    if reasons:
        return _result('HOLD', reasons, scope={
            **_result('HOLD', []).get('scope'),
            'durationSeconds': duration_seconds,
            'sampleCount': len(monitored),
            'postCooldownReadCount': len(post_reads),
        })

    first = monitored[:5]
    last = monitored[-5:]
    host_first = _median([sample['avail'] for sample in first])
    host_last = _median([sample['avail'] for sample in last])
    host_drop = host_first - host_last
    if min(sample['avail'] for sample in monitored) < MIN_AVAILABLE_BYTES:
        reasons.append('AVAILABLE_MEMORY_BELOW_12_GIB')

    # Guard timestamps may be equal after millisecond rounding; index order is
    # the authoritative chronology for retained-vs-baseline comparison.
    baseline = normalized[:start['sample']]
    per_api = {}
    growth_detected = False
    for name in API_NAMES:
        first_median = _median([sample['memory'][name] for sample in first])
        last_median = _median([sample['memory'][name] for sample in last])
        current = post_reads[-1]['memory'][name]
        peak = max(sample['memory'][name] for sample in normalized)
        sustained_delta = last_median - first_median
        current_delta = current - first_median
        growth_threshold = max(GROWTH_FLOOR_BYTES, int(first_median * 0.20))
        growing = sustained_delta > growth_threshold
        if growing and host_drop > HOST_DROP_FLOOR_BYTES:
            growth_detected = True
        baseline_values = [sample['memory'][name] for sample in baseline[-5:]]
        baseline_median = _median(baseline_values) if baseline_values else None
        post_current = post_reads[-1]['memory'][name]
        retained = None if baseline_median is None else {
            'baselineMedianBytes': baseline_median,
            'postCooldownCurrentBytes': post_current,
            'deltaBytes': post_current - baseline_median,
            'ratio': post_current / baseline_median if baseline_median else None,
        }
        per_api[name] = {
            'firstUpTo5MedianBytes': first_median,
            'last5MedianBytes': last_median,
            'currentBytes': current,
            'currentDeltaBytes': current_delta,
            'sustainedDeltaBytes': sustained_delta,
            'growthThresholdBytes': growth_threshold,
            'peakWithinWholeTraceBytes': peak,
            'retainedVsBaseline': retained,
            'trajectory': 'SUSTAINED_GROWTH' if growing else ('DECLINING' if sustained_delta < 0 else 'STABLE'),
        }
    if growth_detected:
        reasons.append('SUSTAINED_API_GROWTH_WITH_HOST_AVAILABLE_DROP')

    host = {
        'firstUpTo5AvailableMedianBytes': host_first,
        'last5AvailableMedianBytes': host_last,
        'availableMedianDropBytes': host_drop,
        'minimumAvailableBytes': min(sample['avail'] for sample in monitored),
        'requiredMinimumAvailableBytes': MIN_AVAILABLE_BYTES,
    }
    scope = {
        **_result('PASS', []).get('scope'),
        'durationSeconds': duration_seconds,
        'sampleCount': len(monitored),
        'postCooldownReadCount': len(post_reads),
    }
    return _result('HOLD' if reasons else 'PASS', reasons, per_api, host, scope)
