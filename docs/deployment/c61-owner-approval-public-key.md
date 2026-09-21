# C61 owner approval public key

The C61 exception is disabled unless both API slots receive the exact public PEM
as `C61_OWNER_APPROVAL_PUBLIC_KEY_PEM`. The application hashes the supplied PEM
and requires fingerprint `a49227c157fdb02193a6c97bbd5666969432b221b393bee7e7b09bd4c8255f5e`.

The private Ed25519 key remains in Windows DPAPI custody. Do not copy, rotate,
or provision it to API hosts. The offline command is `sign-c61-owner-approval`;
it accepts only the canonical C61 envelope and confirmation `APPROVE C61
LP-BUG-C61EE785 <envelopeSha>`. Publish the resulting signed JSON only through
the normal admitted application rollout. This document is not deployment GO.
