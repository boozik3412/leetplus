# Bridge to external-worker successor authority

Status: **source-only interface, production HOLD**. This change defines an
independent permit validator and negative fixtures. It does not install a
controller, execute target code, change an application, stop timers, replace
grants, call a provider, or authorize production.

## Why a separate transition is required

The reviewed bridge controller
`bebeb41354da0dd04b218495cbbf5d75ba9f0a85` deliberately accepts only its
generic exact-target compatibility scope. The external-worker successor changes
`contract.mjs`, `runtime-entry.cjs`, `control.sh`, worker authority and systemd
units. Those changes are outside the generic bridge contract. Widening its
generic `bridge-plan` would mix unrelated authority into accepted history.

`bridge-external-successor-authority.mjs` instead defines the domain-separated
`LEETPLUS_BRIDGE_EXTERNAL_SUCCESSOR_PERMIT_V1` for the sole action
`PREPARE_BRIDGE_EXTERNAL_SUCCESSOR`.

## Frozen predecessor and target evidence

The validator pins the predecessor before any target callback:

- release `bebeb41354da0dd04b218495cbbf5d75ba9f0a85`;
- installed manifest SHA-256
  `39a4941dfccc7b6695d4d5b0923ccaf933490bccb6a10e40168e043577738d48`;
- predecessor verifier SHA-256
  `2923d34c5632eff74b5fafd4982073dba6bb4cd25ed5248592ddfe6eac071d88`;
- complete 101-file map SHA-256
  `ff7912faefcf7ccceb8586bde94872b0a9b7db3232150660a97779bf4feaf579`.

The combined app and controller target release is intentionally unknown until
its exact main merge and admission. The permit therefore binds independently
observed target release, manifest, admission, control archive, complete file
map, file count and a fixed critical-leaf map. The critical set includes the
launcher, renderer, runtime entrypoint, worker contracts, network authorities,
handoff authorities, installer, runner, observer, lock policy and all new
external-worker service/timer units. Any added, removed or changed byte creates
a different signed permit and requires fresh review.

The same permit binds host identity, full active-state digest, approval-root
digest, serving bridge pointer, standalone verifier source and public root. Its
effect scope is exactly `CONTROLLER_POINTER_ONLY`; application restart, data
mutation, timer mutation, worker-grant mutation and provider effects are false.
Validity is at most 30 minutes.

## Execution boundary

`verifyThenPrepareSuccessor` verifies signature, root, expiry, predecessor,
target inventory, host and effect scope before calling any adapter function.
It then requires a fresh snapshot to reproduce the same signed observations.
Only after that comparison may `preTargetExec` return
`PREPARED_NOT_AUTHORIZATION`. Rejection cannot reach target code.

This source is not an installer or signer. Production still requires:

1. separately reviewed admission and protected installation of the standalone
   predecessor-side verifier;
2. explicit enrollment of its Ed25519 public root;
3. independent reproduction of the target manifest/archive/file maps;
4. one exact permit signed only after a direct production-dispatcher GO;
5. a separate reviewed installer with durable intent, receipt, recovery and
   receipt-bound rollback authority.

No prior A-to-bridge or generic bridge GO can authorize this transition.

## Source checks

```text
node --test deploy/leetplus-compose/bridge-external-successor-authority.test.mjs
```

Fixtures use ephemeral keys and in-memory adapters. They perform no server,
network, Docker, systemd, provider or production action.
