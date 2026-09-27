# External Langame worker network fence

Status: source-only controller candidate. It has no production authority and
has not been installed on a server.

`external-network-fence.py` adds a separate exact-source `DOCKER-USER` fence
for the external Langame worker. It owns only:

- source `172.31.42.22/32` to PostgreSQL `172.31.42.2:5432`;
- source `172.31.43.22/32` to the public IPv4 set resolved only from
  `1171.langame.ru`, TCP 443;
- chain `LP_LEETPLUS_LANGAME_EXT_V1`;
- ipset `lp_leetplus_langame_1171` and its bounded temporary refresh set;
- two exact source hooks placed immediately before the existing LeetPlus
  project hook.

Every other packet from those two source identities is dropped. The policy has
no Redis, general HTTPS, SMTP, INPUT/host-service, reverse-proxy or provider
set authority. It never flushes `DOCKER-USER`, Docker-owned chains or global
ipsets. DNS refresh rejects empty, private, reserved and fake-IP answers before
swapping the owned set.

## Lifecycle

The root-only commands are:

```text
python3 external-network-fence.py install
python3 external-network-fence.py verify
python3 external-network-fence.py refresh
python3 external-network-fence.py rollback
```

Install records the complete original `DOCKER-USER` rule list and its digest
before the first effect. The chain is complete before either traffic hook is
inserted. An interrupted install resumes only an exact chain prefix, exact
owned set and one of the expected zero/one/two-hook parent states. Any other
state is ambiguous and fails closed.

Rollback first requires the exact installed parent, chain and durable origin.
It removes only the two exact hooks, flushes and deletes only its named chain,
destroys only its named ipset, then proves the complete original parent list is
restored byte for byte. Interrupted rollback accepts only its exact remaining
hook states. A changed parent, chain, set or temporary refresh set blocks it.

## Compatibility integration required before activation

The current `network-fence.py verify` requires the project hook to be the first
`DOCKER-USER` rule. The additive external fence intentionally places its two
exact source hooks before that hook, so activation also needs a narrow reviewed
compatibility change in that existing verifier.

The minimal change is to recognize exactly these two ordered rules:

```text
-s 172.31.42.22/32 -j LP_LEETPLUS_LANGAME_EXT_V1
-s 172.31.43.22/32 -j LP_LEETPLUS_LANGAME_EXT_V1
```

When both are present and the external controller independently verifies its
chain and ipset, the existing verifier may skip those two entries and still
require the unchanged project hook to be first in the remaining list. It must
reject one hook, reversed order, a wider source, another target, extra external
hooks, or an external verification failure. No change to the existing project
chain contents is needed.

Until that compatibility change, exact-main admission, installed-path rehearsal
and a separately approved plan are complete, production activation stays HOLD.
