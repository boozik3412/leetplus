# CURRENT187-J5-R7 exact-SHA CI evidence

Дата приёмки: 12.08.2026.

Статус: `ACCEPTED / NO PRODUCTION EFFECT / NOT DEPLOYABLE`.

## Release identity

- commit: `5f2b529af8d957909806252edf122c04058a40a2`;
- branch: `codex/open-beta-hardening`;
- workflow: `CI`;
- run: [`31617615666`](https://github.com/boozik3412/leetplus/actions/runs/31617615666);
- conclusion: `3/3 SUCCESS`;
- completed: `2026-08-12T16:42:46Z`.

## SHA-bound artifact

- artifact ID: `9150250522`;
- name: `leetplus-release-5f2b529af8d957909806252edf122c04058a40a2`;
- digest:
  `sha256:77b3e24a6590e8b3e24b9c37755df948be6b304141db649b40b49030ea360b0a`;
- size: `16,275,625` bytes;
- expiry: `2026-09-11T16:37:40Z`;
- expired at acceptance: `false`.

## Accepted scope

R7 requires production J4 input to contain an exact bounded client certificate
and PKCS#8 private key with separate SHA-256 bindings. Only the TLS client sees
the PEM values; the public receipt contains a domain-separated aggregate digest
and excludes PEM/raw hashes. Synthetic mode requires four exact nulls.

Acceptance evidence:

- J4 unit/contract: `9/9 PASS`;
- aggregate CURRENT187: `125/125 PASS`;
- actual disposable wire/TLS runner integration: `2/2 PASS` without skip;
- database typecheck: `PASS`;
- immutable refreeze manifest: `17/17 PASS`;
- disposable release assembler: `21/21 PASS`;
- GitHub Application checks: `SUCCESS`;
- Authority root trust gate: `SUCCESS`;
- PostgreSQL migration smoke: `SUCCESS`.

## Deliberate non-claim

The accepted SHA validates the J4 input and zero-leak contract. Its existing
PgBouncer CI fixture is still synthetic/plaintext; actual J4 client mTLS through
the public collector is the separate R8 gate. One co-located strict J1–J4
production-runner topology, protected production signer/key/root, canonical
ledger/runtime roles and restored-copy rehearsal remain mandatory.

Production, current four-club network, external tenant/tester, invites and
providers were not changed. External beta access remains `NO-GO`.
