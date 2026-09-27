# External worker public-root enrollment

Status: source-only authority contract. It does not install a key, access a
private key, enroll a tenant, start a worker or authorize an application rollout.

The external Langame worker uses a dedicated Ed25519 public root at exactly:

```text
/etc/leetplus-compose/external-worker-root.pem
```

Its public DER SHA-256 must differ from the deployment approval root. Private
PEM input is rejected. The deployment root may authorize only the one-time
`ENROLL_PUBLIC_ONLY` statement below; it receives no external-worker grant,
tenant, provider, application signing or private-key scope.

## Canonical registration envelope

The input is canonical two-space LF JSON with these exact fields:

```json
{
  "statement": {
    "contract": "LEETPLUS_EXTERNAL_WORKER_PUBLIC_ROOT_V1_APPROVAL",
    "operationId": "12345678-1234-4123-8123-123456789abc",
    "action": "ENROLL_PUBLIC_ONLY",
    "hostIdentitySha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "publicDerSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "publicPath": "/etc/leetplus-compose/external-worker-root.pem",
    "issuedAt": "2026-09-27T10:00:00.000Z",
    "expiresAt": "2026-09-27T10:30:00.000Z"
  },
  "signature": "<base64 Ed25519 signature by the deployment root>"
}
```

`publicDerSha256` hashes the 44-byte DER SPKI exported from the supplied
external-worker public PEM. The operation ID is a canonical UUID. Times are
canonical UTC and the enrollment window is at most 30 minutes.

Fresh enrollment validates that the statement is currently live. Historical
runtime verification instead requires an immutable receipt whose `acceptedAt`
was inside the signed window:

```json
{
  "contract": "LEETPLUS_EXTERNAL_WORKER_PUBLIC_ROOT_V1_RECEIPT",
  "decision": "PUBLIC_ONLY_ENROLLED",
  "operationId": "12345678-1234-4123-8123-123456789abc",
  "envelopeSha256": "<canonical envelope SHA-256>",
  "publicDerSha256": "<same DER SPKI SHA-256>",
  "acceptedAt": "2026-09-27T10:10:00.000Z"
}
```

An expired approval can validate an already accepted immutable receipt, but it
cannot authorize another enrollment. A different operation, host, public key,
path, receipt, deployment signature, unknown field or private-key input fails
closed. Host installation and atomic file CAS remain separate controller work.

The controller publishes an immutable `LEETPLUS_EXTERNAL_WORKER_PUBLIC_ROOT_V1_INTENT`
before installing the public file. If it loses its response before a receipt,
the old approval cannot be reused after expiry. Recovery requires a fresh
deployment-root signature, a separate direct dispatcher GO and exact
postimage observation. The recovery statement is canonical two-space LF JSON
with this field order:

```text
contract, operationId, action, hostIdentitySha256, originalOperationId,
originalEnvelopeSha256, intentSha256, publicDerSha256, publicPath,
installedPostimageSha256, issuedAt, expiresAt
```

`contract` is `LEETPLUS_EXTERNAL_WORKER_PUBLIC_ROOT_V1_RECOVERY_APPROVAL`.
`RECOVER_INSTALLED` requires `installedPostimageSha256` equal to the existing
exact public PEM bytes and publishes a new receipt while leaving the file
unchanged. `RETIRE_ABSENT` requires that field to be `null` and the target file
to be absent; it atomically moves the exact unreceipted intent directory to a
retirement archive. Both actions use a distinct 30-minute signed window and
`GO EXTERNAL-WORKER-ROOT-RECOVERY <operationId> <statement-sha256>` directly
in the dispatcher task. The CLI checks exact text; the dispatcher receipts its
origin. An old signature, file `mtime`, or a foreign public key is never
acceptance evidence.

## Offline registration signer

`sign-external-worker-root.py` signs this one public-only statement with the
existing DPAPI-protected deployment key. It has no key-generation or root
mutation path. The operator supplies both public PEM files and the independently
pinned SHA-256 of each DER SubjectPublicKeyInfo. The signer rejects a private or
non-Ed25519 public input, provenance drift, and an external root equal to the
deployment root before reading the deployment private-key path.

The exact confirmation is:

```text
GO EXTERNAL-WORKER-ROOT <operationId> <statementSHA256>
```

The CLI compares this text exactly, but cannot prove who supplied it. The
trusted production dispatcher must separately retain the direct-GO receipt.
Only then may the Windows signing host run:

```text
python -B sign-external-worker-root.py \
  --input C:\protected\external-worker-root-statement.json \
  --external-public C:\protected\external-worker-public.pem \
  --expected-external-public-sha256 <external-der-spki-sha256> \
  --deployment-public C:\protected\deployment-public.pem \
  --expected-deployment-public-sha256 <deployment-der-spki-sha256> \
  --deployment-private C:\protected\deployment-private.dpapi \
  --output C:\protected\external-worker-root-approval.json \
  --confirm "GO EXTERNAL-WORKER-ROOT <operationId> <statementSHA256>"
```

The output is canonical `{statement, signature}`. Inputs are one-link,
non-reparse regular files and output uses exclusive creation with no overwrite.
Source tests use ephemeral keys only; this workflow does not include production
keys, server access, network access or root installation.
