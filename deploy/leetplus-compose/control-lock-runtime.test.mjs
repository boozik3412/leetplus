import fs from 'node:fs';
import test from 'node:test';
import { controlLockPolicy, verifyKernelControlLocks } from './control-locks.mjs';

if (process.execArgv.includes('--test') || process.env.NODE_TEST_CONTEXT) {
  test('Linux flock runtime stub is driven by the root-only Python fixture', { skip: 'root fixture owns the bootstrap execution' }, () => {});
} else {
  const STATE = '__CONTROL_LOCK_RUNTIME_STATE__';
  const [command, ...args] = process.argv.slice(2);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!/^--[a-z-]+$/.test(args[index]) || !args[index + 1] || options[args[index].slice(2)]) throw new Error('Expected unique named arguments');
    options[args[index].slice(2)] = args[index + 1];
  }
  const policy = controlLockPolicy(command, options);
  const globalLock = fs.lstatSync(`${STATE}/control.lock`);
  const singletonLock = policy.singleton ? fs.lstatSync(`${STATE}/${policy.singleton}.lock`) : undefined;
  const parentStatus = fs.readFileSync(`/proc/${process.ppid}/status`, 'utf8');
  const outerPid = parentStatus.match(/^PPid:\s+(\d+)$/m)?.[1];
  verifyKernelControlLocks(policy, {
    globalLock,
    singletonLock,
    locks: fs.readFileSync('/proc/locks', 'utf8').split('\n'),
    parentPid: process.ppid,
    outerPid,
  });

  const marker = `${STATE}/ready-${command}-${options.operation ?? options.name ?? 'none'}`;
  fs.writeFileSync(marker, JSON.stringify(policy));
  while (!fs.existsSync(`${STATE}/release`)) await new Promise(resolve => setTimeout(resolve, 20));
}
