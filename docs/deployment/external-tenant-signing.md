# External Langame tenant approval signing

Status: source-only signer contract. This does not enroll a production root,
approve a tenant, activate a timer, call Langame, or authorize deployment.

`sign-external-tenant.py` is a dedicated offline Windows signer for one tenant:
`8cc79086-ed43-44fa-83d3-20207ec48758`. It is separate from deployment,
controller, worker-grant, and support signing. It has no key-generation or
public-root mutation command.

## Signed wire statement

Input is canonical indent-2 UTF-8 JSON with LF termination and this exact field
order:

```text
contract, tenantId, action, planSha256, requestId, reasonSha256, issuedAt, expiresAt
```

The contract is `LEETPLUS_EXTERNAL_LANGAME_TENANT_APPROVAL_V1`. Action is
exactly `ACTIVATE_LIVE` or `REVOKE_OUTBOUND`. The plan and reason digests are
lowercase SHA-256, request ID is a UUID, and both timestamps are UTC. The
validity window is at most 30 minutes, expiry must remain in the future, and
issue time may not be more than 30 seconds ahead of the signer clock.

The reason input is a canonical JSON string. Its digest is calculated over the
same bytes as `JSON.stringify(reason, null, 2) + "\n"`. Objects, arrays and
empty strings are rejected.

Output is the unchanged flattened statement followed by exactly one
`signature` field containing an Ed25519 base64 signature. There is no nested
approval wrapper.

## Custody and authorization boundary

The operator supplies an existing DPAPI-protected private key, its explicit
public root PEM, and the independently recorded lowercase SHA-256 of its
DER SPKI bytes. The API receives only that single-line DER SPKI encoded in
base64 under `LANGAME_EXTERNAL_TENANT_APPROVAL_PUBLIC_KEY_SPKI_B64` after a
separate public-root enrollment. The signer never creates or changes either key file. The private key must
derive the exact supplied public root.

Immediately before signing, the production dispatcher must obtain a direct GO
for the reviewed statement:

```text
GO EXTERNAL-TENANT <requestId> <statement-sha256>
```

A differently formatted confirmation is rejected. The CLI cannot establish
whether a text file or command argument originated from a direct user message;
the dispatcher must verify and receipt that fact separately before invoking
the signer. Statement
scope, tenant, action, reason, time, confirmation, public-root provenance and
the unused output path are all checked before reading the private-key path or
calling DPAPI.

All inputs must be canonical one-link regular files reached without a symlink
or reparse path. Output uses exclusive creation, fsync and no overwrite. Failed
validation produces no approval file.

## Command

Run only on the Windows signing host after the exact statement and direct GO
exist:

```text
python -B sign-external-tenant.py \
  --input C:\protected\external-tenant-statement.json \
  --reason C:\protected\external-tenant-reason.json \
  --private C:\protected\external-tenant-private.dpapi \
  --public C:\protected\external-tenant-public.pem \
  --expected-public-sha256 <recorded-DER-SPKI-sha256> \
  --output C:\protected\external-tenant-approval.json \
  --confirm "GO EXTERNAL-TENANT <requestId> <statement-sha256>"
```

The CLI prints only public identity digests. The approval must still be
verified by the consuming controller against its separately enrolled root and
exact plan. Source tests use an ephemeral Ed25519 key injected in memory; no
production private key is present or used.
