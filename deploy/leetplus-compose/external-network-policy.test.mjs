import test from 'node:test';
import assert from 'node:assert/strict';
import { externalNetworkRules, EXTERNAL_NETWORK_CHAIN, EXTERNAL_NETWORK_SET } from './external-network-policy.mjs';

test('external fixed source can reach only own PostgreSQL and exact HTTPS set, no broad provider sets', () => {
  const rules = externalNetworkRules();
  assert.equal(rules.length, 3); assert.deepEqual(rules.at(-1), ['-j', 'DROP']);
  assert.equal(rules[0][rules[0].indexOf('--dport') + 1], '5432');
  assert.equal(rules[1][rules[1].indexOf('--match-set') + 1], EXTERNAL_NETWORK_SET);
  assert.equal(JSON.stringify(rules).includes('lp_leetplus_https'), false);
  assert.equal(JSON.stringify(rules).includes('6379'), false);
  assert.equal(EXTERNAL_NETWORK_CHAIN, 'LP_LEETPLUS_LANGAME_EXT_V1');
});
test('rehearsal external source has PostgreSQL only and no provider egress', () => {
  assert.deepEqual(externalNetworkRules({ rehearsal: true }), [
    ['-s', '172.31.52.22/32', '-d', '172.31.52.2/32', '-p', 'tcp', '-m', 'tcp', '--dport', '5432', '-j', 'RETURN'],
    ['-j', 'DROP'],
  ]);
});
