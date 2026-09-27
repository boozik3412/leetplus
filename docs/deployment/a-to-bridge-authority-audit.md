# A-to-bridge predecessor authority audit

Status: **source-only HOLD**. This audit compares immutable Git objects. It did
not read or change production, execute controller code on a host, contact a
provider, or establish the current serving controller. It does not imply that
the accepted Variant A application or controller is unhealthy.

## Decision

The accepted A source `b0cbf3a4f302b299762fa055f3bffe0376a91182` cannot
establish predecessor-owned authority for installing bridge source
`bebeb41354da0dd04b218495cbbf5d75ba9f0a85` through its ordinary handoff.
The bridge adds the predecessor verifier needed for later exact-target
handoffs, but that verifier is absent from b0. The ordinary b0 path delegates
planning and execution to the staged target while its compatibility predicate
does not bind `control_handoff.py` or the new verifier leaf.

Therefore A-to-bridge remains blocked until one of these facts is produced:

1. an already accepted receipt from a trusted predecessor-side verifier that
   binds the exact b0 and bridge identities below; or
2. a separately reviewed, admitted and explicitly authorized host bootstrap
   whose verifier is independent of the bridge target and binds the same
   identities before any pointer or unit effect.

Source review, admission, a target-generated plan, or a signature over that
target-generated plan does not supply the missing predecessor observation.
The existing external `sign_a_to_bridge.py` is useful evidence but is not that
verifier: it validates its full pinned manifests and four-leaf delta only after
the target controller has generated the native plan. Its own entry point is
also deliberately held. That plan must not be reused as bootstrap authority.

## Immutable source identities

SHA-256 is over the exact Git blob bytes, including LF endings.

| Leaf | b0 SHA-256 | bridge SHA-256 | Result |
| --- | --- | --- | --- |
| `control_handoff.py` | `48aa00c4f6d3148ee210901cd572c6b5a3b3600ad4d20e3551e326ee18fcda18` | `2923d34c5632eff74b5fafd4982073dba6bb4cd25ed5248592ddfe6eac071d88` | changed privileged executor |
| `exact-target-handoff-authority.mjs` | absent | `bd5d5360220c73ce7c9c814c3ced714ee193f1c0a02100f4f6ce566749ca5abf` | new predecessor permit verifier |

Every b0 `COMPATIBLE` leaf is byte-identical in the bridge:

| Leaf | Exact SHA-256 in both commits |
| --- | --- |
| `contract.mjs` | `dda0b3bf018b26a03ed7cc714489f6f049045fb7ff78a0701dfd22ec51405e93` |
| `orchestrator.mjs` | `f3c9d239e4fbe5572fdd258bb20e2be0c3ab935105d25308d325babbcba32e45` |
| `worker-authority.mjs` | `57d19d442e8708cd9215b2e5bbc055e5e3cfcca64417ec5a7e27f5e7e1dd8e71` |
| `runtime-entry.cjs` | `2d314258e0d48190adec24257ecbce3f94152cf49bde54d5789db234c3b1787a` |
| `network.sh` | `efdbd9bb56c648c9951195fd65404a40adf48c06791797051e9a3a0f413f79d8` |
| `backup.sh` | `1b40d255d29ed57a877652d60455df457e92315b311bce75cbcad41c40af8951` |
| `postgres-entry.sh` | `1415cd97b33833cae173ef632cd0db85812ecb252069a63cff9dda31ccd53e7c` |

Additional unchanged authority and launcher bytes are evidence about this
specific diff, but b0's `COMPATIBLE` predicate does not make them requirements:

| Leaf | Exact SHA-256 in both commits |
| --- | --- |
| `control.mjs` | `1496d809e6401cc0f9b9fba983a135ba0ca6cd445ada7ce337f5f94be2714a97` |
| `control-handoff-authority.mjs` | `47258b2c78c730ede5dd453f12d33580b7f4e784b415d6ef227ed993f2a0a8d5` |
| `control.sh` | `0587c842147ebb959ca08f9ac23de95b0f377bdfb49036353013f6ee69c18ade` |
| `sign-approval.py` | `174e9d244b76051967c64deaee56263558f9980bc4c994195c609f6d96643030` |

## Verified call chain

Line references below are to the immutable b0 `control_handoff.py` blob.

- Line 39 defines `COMPATIBLE` without `control_handoff.py` or an exact-target
  verifier.
- Lines 360–371 compare only `COMPATIBLE` leaves. The source test proves the
  predicate accepts the changed executor plus the added verifier, then rejects
  a mutation to `contract.mjs` as a control case.
- Lines 398–415 run `prepare`, compatibility, snapshot rendering and current
  authority checks from the file executing in the target root.
- Lines 512–535 validate the saved plan through the same implementation.
- Lines 611–644 run forward validation and authority from the target executor.
- Lines 746–753 require both `plan` and `apply`/`rollback` to execute from the
  staged target release directory.

The bridge corrects this shape for later transitions: its `bridge-plan`,
`bridge-apply` and permit validation remain in the serving predecessor root.
That correction cannot attest its own first installation because b0 has none
of those commands or verifier bytes.

## Required external predecessor-bound verifier

The missing authority must execute outside the bridge target and, before any
effect, bind all of the following in one signed, bounded plan:

- exact b0 release, admitted installed-manifest digest and b0 verifier digest;
- exact bridge release, V1 admission digest, control archive digest, installed
  manifest digest, complete file-map digest and every changed privileged leaf;
- host identity, current complete active-state digest and serving b0 pointer;
- unchanged application, data, nginx, worker grants, timers, provider policy,
  container identities and network-refresh unit;
- effect scope limited to the controller pointer and any explicitly identical
  unit byte, with application restart and timer stop forbidden;
- immutable pre-effect intent, receipt, expiry, lost-response reconciliation,
  and separate receipt-bound rollback authority.

The verifier must inspect staged bridge bytes itself. It must not call bridge
code to construct expected identities, validate its own permit, or decide its
own postimage. Introducing this verifier is itself a new privileged production
authority and needs its own exact plan, review and GO. This repository audit
does not provide that authority.

The source-only validator
`deploy/leetplus-compose/a-bridge-bootstrap-authority.mjs` freezes the proposed
interface without implementing a server effect. Its domain-separated
`LEETPLUS_A_BRIDGE_BOOTSTRAP_PERMIT_V1` authorizes only
`PREPARE_A_BRIDGE_BOOTSTRAP`, for at most 30 minutes. The signed permit binds:

- exact b0 release, installed manifest, existing verifier and serving-core map;
- exact bridge release, admission, control archive, installed manifest and
  complete file map;
- host and active-state digests observed independently of bridge code;
- the standalone verifier source digest and the digest of its Ed25519 public
  root.

`verifyThenPrepare` verifies all of that before invoking either adapter
callback, re-observes the same immutable identities, and only then reaches
`preTargetExec`. It does not import bridge code. A rejected or expired permit
cannot reach even the adapter snapshot.

This is still an interface proposal. A usable production path additionally
requires separate admission and protected installation of the standalone
verifier, enrollment of its public root, dispatcher ownership, immutable
evidence, and a fresh user GO for the exact bootstrap permit. No production
apply or rollback implementation exists in this change.

## Reproduction

Run from a checkout containing both immutable Git objects:

```text
python -B deploy/leetplus-compose/test_a_bridge_predecessor_gap.py
node --test deploy/leetplus-compose/a-bridge-bootstrap-authority.test.mjs
```

The test reads Git blobs, evaluates only b0's pure compatibility predicate,
and checks source dispatch text. It performs no target-code execution, network
access, systemd call, Docker call, filesystem mutation outside its process, or
production effect.
