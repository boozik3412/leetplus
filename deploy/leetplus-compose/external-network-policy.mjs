import { demand } from './contract.mjs';

export const EXTERNAL_NETWORK_CONTRACT = 'LEETPLUS_LANGAME_EXTERNAL_NETWORK_V1';
export const EXTERNAL_NETWORK_SET = 'lp_leetplus_langame_1171';
export const EXTERNAL_NETWORK_CHAIN = 'LP_LEETPLUS_LANGAME_EXT_V1';
export const EXTERNAL_NETWORK_HOST = '1171.langame.ru';
export const EXTERNAL_SOURCE = ['172.31.43.22/32', '172.31.42.22/32'];

export function externalNetworkRules({ rehearsal = false } = {}) {
  const data = rehearsal ? '172.31.52' : '172.31.42';
  return [
    ['-s', `${data}.22/32`, '-d', `${data}.2/32`, '-p', 'tcp', '-m', 'tcp', '--dport', '5432', '-j', 'RETURN'],
    ...(!rehearsal ? [['-s', '172.31.43.22/32', '-p', 'tcp', '-m', 'tcp', '--dport', '443', '-m', 'set', '--match-set', EXTERNAL_NETWORK_SET, 'dst', '-j', 'RETURN']] : []),
    ['-j', 'DROP'],
  ];
}

export function validateExternalNetworkObservation(observed) {
  demand(observed?.contract === EXTERNAL_NETWORK_CONTRACT && observed.decision === 'PASS' &&
    observed.hostname === EXTERNAL_NETWORK_HOST &&
    observed.postgres === '172.31.42.22->172.31.42.2:5432' &&
    observed.langameTls === '172.31.43.22->ipset:443',
  'External worker network set identity drift');
  demand(Array.isArray(observed.addresses) && observed.addresses.length > 0 && observed.addresses.length <= 64 &&
    new Set(observed.addresses).size === observed.addresses.length &&
    observed.addresses.every(address => typeof address === 'string' && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)),
  'External network set is missing or stale');
  return observed;
}
