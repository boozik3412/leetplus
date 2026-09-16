"""Bounded memory observation for the isolated API_6G_V1 rehearsal only."""
import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import threading
import time
from pathlib import Path


ROOT = Path('/srv/leetplus-migration/rehearsal')
PROJECT = 'leetplus-rehearsal'
CONTRACT = 'LEETPLUS_COMPOSE_BLUE_GREEN_V1'
GIB = 1024 ** 3
INITIAL_MARGIN = 16 * GIB
RUNTIME_FLOOR = 12 * GIB
DEADLINE_SECONDS = 15 * 60
SAMPLE_INTERVAL_SECONDS = 1
MAX_SAMPLES = DEADLINE_SECONDS + 8
APP_ROLES = ('api-blue', 'api-green', 'web-blue', 'web-green')
DATA_ROLES = ('postgres', 'redis')
ROLES = APP_ROLES + DATA_ROLES
EXPECTED_RESOURCES = {
    'api-blue': ('6g', '8g'), 'api-green': ('6g', '8g'),
    'web-blue': ('1g', None), 'web-green': ('1g', None),
    'postgres': ('8g', None), 'redis': ('256m', None),
}


class RehearsalMemoryGuardFailure(RuntimeError):
    pass


def canonical(value):
    return (json.dumps(value, indent=2, sort_keys=True) + '\n').encode()


def bytes_limit(value):
    match = re.fullmatch(r'(\d+)([kmg])', value or '')
    if not match:
        raise ValueError('Unsupported Compose memory limit')
    return int(match.group(1)) * {'k': 1024, 'm': 1024 ** 2, 'g': GIB}[match.group(2)]


class RehearsalMemoryGuard:
    """Observe one disposable rehearsal window; never address production names."""

    def __init__(self, compose, evidence_path, *, runner=None, read=None, clock=None, start_watchdog=True):
        self.compose = Path(compose)
        self.evidence_path = Path(evidence_path)
        self.runner = runner or self._system_runner
        self.read = read or (lambda path: Path(path).read_text())
        self.clock = clock or time.monotonic
        self.start_watchdog = start_watchdog
        self._lock = threading.RLock()
        self._stop_event = threading.Event()
        self._thread = None
        self._failure = None
        self._entered = False
        self._closed = False
        self._evidence_written = False
        self._pinned = {}
        self._baseline = None
        self._samples = []
        self._marks = []
        self._cleanup = []
        self._prestart_baseline = None
        self._first_running = {}
        self._active_receipt_sha256 = None
        self._entered_at = None
        self._compose_bytes = None

    def _system_runner(self, args, timeout):
        result = subprocess.run(args, capture_output=True, timeout=timeout,
                                env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC'})
        if result.returncode:
            raise RuntimeError('Bounded Docker command failed')
        return result.stdout.decode()

    def _run(self, args, timeout=5):
        result = self.runner(tuple(args), timeout)
        return result.decode() if isinstance(result, bytes) else result

    def _within_rehearsal(self, path, parent):
        try:
            path.relative_to(parent)
            return True
        except ValueError:
            return False

    def _assert_paths(self):
        expected_compose = ROOT / 'compose.json'
        if self.compose != expected_compose or not self._within_rehearsal(self.evidence_path, ROOT / 'evidence'):
            raise ValueError('Only the fixed isolated rehearsal paths are allowed')

    def _load_compose(self):
        self._compose_bytes = self.read(self.compose)
        document = json.loads(self._compose_bytes)
        if document.get('name') != PROJECT or not isinstance(document.get('services'), dict):
            raise ValueError('Exact rehearsal Compose project required')
        for role, (memory, swap) in EXPECTED_RESOURCES.items():
            service = document['services'].get(role)
            if not isinstance(service, dict) or service.get('container_name') != f'{PROJECT}-{role}' or service.get('mem_limit') != memory or service.get('memswap_limit') != swap or not isinstance(service.get('image'), str):
                raise ValueError('Unexpected rehearsal resource profile')
        return document

    def _inspect(self, target):
        value = json.loads(self._run(('/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', 'inspect', target), 5))
        if not isinstance(value, list) or len(value) != 1 or not isinstance(value[0], dict):
            raise ValueError('Container inspection is ambiguous')
        return value[0]

    def _inspect_many(self):
        targets = tuple(f'{PROJECT}-{role}' for role in ROLES)
        value = json.loads(self._run(('/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', 'inspect', *targets), 3))
        if not isinstance(value, list) or len(value) != len(ROLES):
            raise ValueError('Container inspection is ambiguous')
        items = {item.get('Name', '').removeprefix('/'): item for item in value if isinstance(item, dict)}
        if set(items) != set(targets):
            raise ValueError('Exact rehearsal clone set is not present')
        return items

    def _attest(self, role, service, item=None):
        item = item or self._inspect(f'{PROJECT}-{role}')
        labels = item.get('Config', {}).get('Labels', {})
        host = item.get('HostConfig', {})
        state = item.get('State', {})
        expected_memory, expected_swap = EXPECTED_RESOURCES[role]
        if item.get('Name') != f'/{PROJECT}-{role}' or item.get('Image') != service['image'] or labels.get('com.docker.compose.project') != PROJECT or labels.get('ru.leetplus.contract') != CONTRACT or labels.get('ru.leetplus.role') != role or host.get('Memory') != bytes_limit(expected_memory) or host.get('NanoCpus') != int(float(service.get('cpus', '0')) * 1_000_000_000):
            raise ValueError('Clone container identity or resource spec drift')
        if expected_swap is not None and host.get('MemorySwap') != bytes_limit(expected_swap):
            raise ValueError('Clone memory+swap bound drift')
        if not isinstance(item.get('Id'), str) or not item['Id']:
            raise ValueError('Clone container lacks immutable ID')
        return item, state

    def _attest_pinned(self, role, item=None):
        item, state = self._attest(role, self._document['services'][role], item)
        if item['Id'] != self._pinned[role]['id']:
            raise ValueError('Pinned clone identity changed; HOLD without stopping replacement')
        return item, state

    def _memory_available(self):
        for line in self.read(Path('/proc/meminfo')).splitlines():
            match = re.fullmatch(r'MemAvailable:\s+(\d+)\s+kB', line)
            if match:
                return int(match.group(1)) * 1024
        raise ValueError('MemAvailable is unavailable')

    def _cgroup_memory(self, pid):
        if not isinstance(pid, int) or pid <= 0:
            return 0, 0, 0, {'oom': 0, 'oom_kill': 0}
        path = None
        for line in self.read(Path(f'/proc/{pid}/cgroup')).splitlines():
            if line.startswith('0::'):
                path = line[3:]
                break
        if not path or not path.startswith('/') or '..' in path.split('/'):
            raise ValueError('Container is not in a trusted cgroup-v2 path')
        root = Path('/sys/fs/cgroup') / path.lstrip('/')
        events = {}
        for line in self.read(root / 'memory.events').splitlines():
            key, value = line.split(maxsplit=1)
            if key in ('oom', 'oom_kill') and value.isdigit():
                events[key] = int(value)
        if set(events) != {'oom', 'oom_kill'} or any(value < 0 for value in events.values()):
            raise ValueError('Required cgroup memory events are unavailable')
        return int(self.read(root / 'memory.current').strip()), int(self.read(root / 'memory.peak').strip()), int(self.read(root / 'memory.swap.current').strip()), events

    def _collect(self):
        identity, memory, peak, swap, events, states = {}, {}, {}, {}, {}, {}
        items = self._inspect_many()
        for role in ROLES:
            item, state = self._attest_pinned(role, items[f'{PROJECT}-{role}'])
            pid = state.get('Pid', 0)
            current, maximum, current_swap, counters = self._cgroup_memory(pid)
            identity[role] = {'id': item['Id'], 'pid': pid, 'restartCount': item.get('RestartCount', 0), 'oomKilled': bool(state.get('OOMKilled')), 'image': item['Image'], 'startedAt': state.get('StartedAt', '')}
            memory[role], peak[role], swap[role], events[role], states[role] = current, maximum, current_swap, counters, bool(state.get('Running'))
        return {'at': round(self.clock() - self._entered_at, 3), 'avail': self._memory_available(), 'memory': memory, 'peak': peak, 'swap': swap, 'events': events, 'identity': identity, 'running': states}

    def _append(self, sample):
        if len(self._samples) >= MAX_SAMPLES:
            raise ValueError('Memory evidence sample bound exceeded')
        self._samples.append(sample)

    def _abort(self, message):
        with self._lock:
            if self._failure is None:
                self._failure = message
                self._stop_apps()

    def _sample_once(self):
        try:
            with self._lock:
                if self._closed:
                    return
                if self.clock() - self._entered_at >= DEADLINE_SECONDS:
                    raise ValueError('Rehearsal memory window deadline exceeded')
                sample = self._collect()
                self._append(sample)
                if sample['avail'] < RUNTIME_FLOOR:
                    raise ValueError('Rehearsal MemAvailable floor breached')
                for role in ROLES:
                    prestart = self._prestart_baseline['identity'][role]
                    current = sample['identity'][role]
                    if current['restartCount'] != prestart['restartCount'] or current['oomKilled'] or sample['events'][role] != self._prestart_baseline['events'][role]:
                        raise ValueError('Rehearsal clone restarted or OOMed before full activation')
                    if role in DATA_ROLES and (current['pid'] != prestart['pid'] or current['startedAt'] != prestart['startedAt']):
                        raise ValueError('Rehearsal data clone PID or start identity changed')
                    if role in APP_ROLES and sample['running'][role]:
                        first = self._first_running.setdefault(role, current)
                        if first != current:
                            raise ValueError('Rehearsal application clone PID changed before full activation')
                if self._baseline is None and all(sample['running'][role] for role in APP_ROLES):
                    self._baseline = sample
                elif self._baseline is not None:
                    for role in ROLES:
                        before, current = self._baseline['identity'][role], sample['identity'][role]
                        if before != current or current['oomKilled'] or sample['events'][role] != self._baseline['events'][role]:
                            raise ValueError('Rehearsal clone restart, PID, OOM, or identity drift')
        except Exception as error:
            self._abort(f'HOLD: {error}')

    def _watch(self):
        while not self._stop_event.wait(SAMPLE_INTERVAL_SECONDS):
            self._sample_once()
            if self._failure:
                return

    def _stop_role(self, role):
        try:
            item, state = self._attest_pinned(role)
        except Exception as error:
            self._record_cleanup(role, 'HOLD_IDENTITY_DRIFT')
            self._failure = self._failure or f'HOLD: {error}'
            return
        if not state.get('Running'):
            self._record_cleanup(role, 'ALREADY_STOPPED', item['Id'])
            return
        try:
            self._run(('/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', 'stop', '--time', '5', item['Id']), 7)
        except Exception:
            try:
                self._attest_pinned(role)
                self._run(('/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', 'kill', item['Id']), 5)
            except Exception as error:
                self._failure = self._failure or f'HOLD: unable to stop pinned {role}: {error}'
                self._record_cleanup(role, 'STOP_FAILED', item['Id'])
                return
        try:
            _, after = self._attest_pinned(role)
            if after.get('Running') or after.get('Pid', 0):
                raise ValueError('Pinned clone did not stop')
            self._record_cleanup(role, 'STOPPED', item['Id'])
        except Exception as error:
            self._failure = self._failure or f'HOLD: {error}'
            self._record_cleanup(role, 'HOLD_POST_STOP_DRIFT', item['Id'])

    def _record_cleanup(self, role, decision, identity=None):
        record = {'role': role, 'decision': decision}
        if identity is not None:
            record['id'] = identity
        for index, previous in enumerate(self._cleanup):
            if previous['role'] == role:
                self._cleanup[index] = record
                return
        self._cleanup.append(record)

    def _stop_apps(self):
        if not self._entered:
            return
        for role in APP_ROLES:
            self._stop_role(role)

    def _active_receipt(self):
        return {
            'contract': 'LEETPLUS_REHEARSAL_MEMORY_GUARD_PINS_V1', 'project': PROJECT,
            'targetProfile': 'API_6G_V1',
            'composeSha256': hashlib.sha256(self._compose_bytes.encode() if isinstance(self._compose_bytes, str) else self._compose_bytes).hexdigest(),
            'pinned': {role: {
                'id': self._pinned[role]['id'], 'name': f'{PROJECT}-{role}', 'image': self._prestart_baseline['identity'][role]['image'],
                'memory': EXPECTED_RESOURCES[role][0], 'memorySwap': EXPECTED_RESOURCES[role][1],
                'nanoCpus': int(float(self._document['services'][role]['cpus']) * 1_000_000_000),
            } for role in ROLES},
            'stopRoles': list(APP_ROLES),
        }

    def _write_active_receipt(self):
        active_receipt = ROOT / 'evidence/resource-window-active.json'
        if active_receipt.exists() or active_receipt.is_symlink():
            raise ValueError('Existing active rehearsal resource-window receipt requires owner reconciliation')
        active_receipt.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with open(active_receipt, 'xb') as output:
            os.chmod(active_receipt, 0o600)
            raw = canonical(self._active_receipt())
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
        self._active_receipt_sha256 = hashlib.sha256(raw).hexdigest()

    def __enter__(self):
        self._assert_paths()
        self._document = self._load_compose()
        self._entered_at = self.clock()
        items = self._inspect_many()
        for role in ROLES:
            item, state = self._attest(role, self._document['services'][role], items[f'{PROJECT}-{role}'])
            if role in APP_ROLES and (state.get('Running') or state.get('Pid', 0)):
                raise ValueError('Rehearsal API/Web containers must be stopped before monitoring')
            if role in DATA_ROLES and (not state.get('Running') or not state.get('Pid', 0)):
                raise ValueError('Rehearsal PostgreSQL/Redis must already be running')
            self._pinned[role] = {'id': item['Id'], 'memorySwap': item.get('HostConfig', {}).get('MemorySwap')}
        self._entered = True
        initial = self._collect()
        self._append(initial)
        self._prestart_baseline = {'identity': initial['identity'], 'memory': initial['memory'], 'peak': initial['peak'], 'swap': initial['swap'], 'events': initial['events'],
                                   'maxswap': {role: self._pinned[role]['memorySwap'] for role in ROLES}}
        required = sum(bytes_limit(memory) for memory, _ in EXPECTED_RESOURCES.values()) - sum(initial['memory'].values()) + INITIAL_MARGIN
        if initial['avail'] < required:
            self._entered = False
            raise ValueError('Measured rehearsal capacity is below the required monitored-window margin')
        self._write_active_receipt()
        if self.start_watchdog:
            self._thread = threading.Thread(target=self._watch, name='leetplus-rehearsal-memory-watchdog', daemon=True)
            self._thread.start()
        return self

    def mark(self, label):
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,63}', label):
            raise ValueError('Invalid rehearsal memory mark')
        self._sample_once()
        self.check()
        self._marks.append({'label': label, 'at': round(self.clock() - self._entered_at, 3), 'sample': len(self._samples) - 1})

    def start_apps(self):
        if not self._entered or self._closed:
            raise ValueError('Rehearsal memory guard is not available for native warmup')
        for role in APP_ROLES:
            try:
                self._sample_once()
                self.check()
                item, state = self._attest_pinned(role)
                if state.get('Running') or state.get('Pid', 0):
                    raise ValueError('Native warmup requires a precreated stopped pinned clone')
                self._run(('/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', 'start', item['Id']), 5)
                self._sample_once()
                self.check()
                _, after = self._attest_pinned(role)
                if not after.get('Running') or not after.get('Pid', 0):
                    raise ValueError('Pinned clone did not start')
            except Exception as error:
                self._abort(f'HOLD: native rehearsal warmup failed: {error}')
                self._stop_apps()
                raise RehearsalMemoryGuardFailure(self._failure) from error

    def check(self):
        if self._failure:
            raise RehearsalMemoryGuardFailure(self._failure)

    def _summary(self):
        return {
            'contract': 'LEETPLUS_REHEARSAL_MEMORY_GUARD_V1',
            'decision': 'HOLD' if self._failure else ('PASS' if self._closed else 'MONITORING_ACTIVE'),
            'cooldownDecision': 'NOT_EVALUATED', 'composeSha256': hashlib.sha256(self._compose_bytes.encode() if isinstance(self._compose_bytes, str) else self._compose_bytes).hexdigest(),
            'elapsedSeconds': round(self.clock() - self._entered_at, 3), 'deadlineSeconds': DEADLINE_SECONDS,
            'initialMarginBytes': INITIAL_MARGIN, 'runtimeFloorBytes': RUNTIME_FLOOR,
            'pinned': self._pinned, 'activeReceiptSha256': self._active_receipt_sha256, 'prestartBaseline': self._prestart_baseline, 'marks': self._marks, 'samples': self._samples,
            'samplesSha256': hashlib.sha256(canonical(self._samples)).hexdigest(), 'cleanup': self._cleanup,
            'failure': self._failure,
        }

    def finish_result(self):
        if not self._closed:
            raise ValueError('Rehearsal memory guard must finish cleanup before reporting success')
        return self._summary()

    def _write_evidence(self):
        if self._evidence_written:
            return
        self.evidence_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with open(self.evidence_path, 'xb') as output:
            os.chmod(self.evidence_path, 0o600)
            output.write(canonical(self._summary()))
            output.flush()
            os.fsync(output.fileno())
        self._evidence_written = True

    def __exit__(self, exc_type, exc, traceback):
        if exc_type is not None:
            self._failure = self._failure or 'HOLD: guarded acceptance failed'
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=35)
            if self._thread.is_alive():
                self._failure = self._failure or 'HOLD: watchdog did not stop within its bounded join'
        with self._lock:
            self._stop_apps()
            self._closed = True
            self._write_evidence()
        if exc_type is None:
            self.check()
        return False


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _fixed_runner(args, timeout):
    result = subprocess.run(args, capture_output=True, timeout=timeout,
                            env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC'})
    if result.returncode:
        raise RuntimeError('Bounded Docker cleanup command failed')
    return result.stdout.decode()


def _fixed_inspect(name):
    value = json.loads(_fixed_runner(('/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', 'inspect', name), 5))
    _require(isinstance(value, list) and len(value) == 1 and isinstance(value[0], dict), 'Pinned cleanup inspection is ambiguous')
    return value[0]


def _secure_active_receipt():
    receipt = ROOT / 'evidence/resource-window-active.json'
    if not receipt.exists() and not receipt.is_symlink():
        return None
    _require(os.getuid() == 0, 'Fixed cleanup requires the root-controlled rehearsal service')
    for parent in (ROOT, receipt.parent):
        info = parent.lstat()
        _require(stat.S_ISDIR(info.st_mode) and not parent.is_symlink() and info.st_uid == 0 and not info.st_mode & 0o022, 'Untrusted active receipt ancestor')
    info = receipt.lstat()
    _require(stat.S_ISREG(info.st_mode) and not receipt.is_symlink() and info.st_uid == 0 and info.st_nlink == 1 and not info.st_mode & 0o022 and info.st_size <= 128 * 1024, 'Untrusted active receipt')
    fd = os.open(receipt, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read(128 * 1024 + 1)
    finally:
        os.close(fd)
    _require(len(raw) <= 128 * 1024, 'Oversized active receipt')
    value = json.loads(raw)
    _require(raw == canonical(value), 'Active receipt must be canonical')
    return value


def _attest_fixed(role, pin):
    item = _fixed_inspect(pin['name'])
    labels = item.get('Config', {}).get('Labels', {})
    host = item.get('HostConfig', {})
    _require(item.get('Id') == pin['id'] and item.get('Name') == '/' + pin['name'] and item.get('Image') == pin['image'] and
             labels.get('com.docker.compose.project') == PROJECT and labels.get('ru.leetplus.contract') == CONTRACT and labels.get('ru.leetplus.role') == role and
             host.get('Memory') == bytes_limit(pin['memory']) and host.get('NanoCpus') == pin['nanoCpus'], 'Pinned cleanup identity or resource drift; replacement will not be stopped')
    if pin['memorySwap'] is not None:
        _require(host.get('MemorySwap') == bytes_limit(pin['memorySwap']), 'Pinned cleanup memory+swap drift; replacement will not be stopped')
    return item


def cleanup_fixed():
    value = _secure_active_receipt()
    if value is None:
        return {'decision': 'NO_EFFECT'}
    _require(value.get('contract') == 'LEETPLUS_REHEARSAL_MEMORY_GUARD_PINS_V1' and value.get('project') == PROJECT and value.get('targetProfile') == 'API_6G_V1' and value.get('stopRoles') == list(APP_ROLES) and isinstance(value.get('pinned'), dict) and set(value['pinned']) == set(ROLES), 'Invalid fixed cleanup receipt')
    for role in ROLES:
        pin = value['pinned'][role]
        _require(isinstance(pin, dict) and pin.get('name') == f'{PROJECT}-{role}' and isinstance(pin.get('id'), str) and pin.get('memory') == EXPECTED_RESOURCES[role][0] and pin.get('memorySwap') == EXPECTED_RESOURCES[role][1] and isinstance(pin.get('image'), str) and isinstance(pin.get('nanoCpus'), int), 'Invalid pinned cleanup scope')
    stopped, holds = [], []
    for role in APP_ROLES:
        pin = value['pinned'][role]
        try:
            item = _attest_fixed(role, pin)
        except Exception:
            holds.append({'role': role, 'decision': 'HOLD_IDENTITY_DRIFT'})
            continue
        if not item.get('State', {}).get('Running'):
            stopped.append({'role': role, 'decision': 'ALREADY_STOPPED'})
            continue
        try:
            _fixed_runner(('/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', 'stop', '--time', '5', pin['id']), 7)
        except Exception:
            try:
                _attest_fixed(role, pin)
                _fixed_runner(('/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', 'kill', pin['id']), 5)
            except Exception:
                holds.append({'role': role, 'decision': 'HOLD_STOP_FAILURE'})
                continue
        try:
            final = _attest_fixed(role, pin)
            if final.get('State', {}).get('Running') or final.get('State', {}).get('Pid', 0):
                raise ValueError('Pinned clone did not stop')
        except Exception:
            holds.append({'role': role, 'decision': 'HOLD_POST_STOP_DRIFT'})
            continue
        stopped.append({'role': role, 'decision': 'STOPPED'})
    return {'decision': 'HOLD' if holds else 'CLEANUP_COMPLETE', 'stopped': stopped, 'holds': holds}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['cleanup-fixed'])
    args = parser.parse_args()
    if args.command == 'cleanup-fixed':
        result = cleanup_fixed()
        print(json.dumps(result))
        if result['decision'] == 'HOLD':
            raise SystemExit(1)
