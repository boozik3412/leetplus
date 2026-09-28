import { demand, EXTERNAL_WORKER_CAPABILITY } from './contract.mjs';

export function validateExternalImageCapability(release, proof, apiImage = release.images?.api ?? release.appImages?.api) {
  if (!Object.hasOwn(release, 'externalWorkerCapability')) { demand(!proof, 'Unmarked image cannot carry an external worker capability proof'); return null; }
  demand(release.externalWorkerCapability === EXTERNAL_WORKER_CAPABILITY && proof &&
    Object.keys(proof).sort().join(',') === ['contract', 'decision', 'apiImage', 'releaseSha', 'uid',
      'realRuntimeEntrypoint', 'disabledProfileRejectedBeforeNest', 'stdoutEmpty', 'networkNone', 'noProviderEffect'].sort().join(','),
  'External image capability proof fields are not exact');
  demand(proof.contract === 'LEETPLUS_EXTERNAL_WORKER_IMAGE_VALIDATION_V1' && proof.decision === 'PASS' &&
    proof.releaseSha === release.releaseSha && proof.apiImage === apiImage && proof.uid === 12042 &&
    proof.realRuntimeEntrypoint === true && proof.disabledProfileRejectedBeforeNest === true &&
    proof.stdoutEmpty === true && proof.networkNone === true && proof.noProviderEffect === true,
  'External image capability must reach its real non-root config gate without effects');
  return proof;
}
