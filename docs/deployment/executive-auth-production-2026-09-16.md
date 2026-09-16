# Executive dashboard and USER_CALL Web release, 16 September 2026

## Current checkpoint: previous working version restored at 16:39 UTC

Explicitly approved emergency operation `0caaf0e3-2572-4918-8e69-a985ee46ed61`
completed all five native phases. Active production is **BLUE
`b5c03360941e1e5d59fe83f334b8dc29c2eced3b`, generation7, API4GiB**. GREEN02/API6
is retained with its known executive UI defect; it is not a healthy UI fallback.
Serving controller02, data399, PG/Redis container identities and CURRENT191 remain
unchanged. There were no schema or provider-scope changes.

The literal human reply was `подтверждаю`, directly bound to the emergency plan
SHA `c35902679283a4e76a0e30b921ae3f94516d067aa8f2eb1c392eb89f14f2705d`
and worker policy `8e1cdda1f8debf7253f5f6f821abb26d983805abc484a91aef1129dfed1789bb`.
The final native receipt SHA is
`4fff5c6822f88c702598d6a34d8d64da8446338dfc443e0ff76f47e8b165964c`.
This approval does not authorize the corrected feature release.

Only daily/bonus schedules paused, with natural worker drain and no kills.
Both original schedules were restored at16:40UTC after native validation of
same-profile generation7 TIMER grants: daily `727d7cf1-00a7-41ac-8a88-a4b928351e16`,
bonus `ec7624b2-0faa-416d-869c-0d257a97d2a4`; original December13 expiry retained.
An ordinary bonus run passed at16:43:23.633UTC: receipt
`558ca12c-23ab-4fd9-82a0-cfa43dc6ca03`, SHA
`810b8575562a15d2e58705557869240eb43d260d95a6ffbdc3aee379f0b442fa`.
Daily next runs16September23:30UTC /17September04:30Yekaterinburg; no manual run.

Final live runtime/worker postcheck passed at16:44:37UTC: public Web/API identity,
corporate/store/guest reads, current grants/timers, six containers and schema191.
Genuine corporate Chromium verified the public dashboard at16:41:28UTC, including
desktop and390px screenshots: visible data, no page/network errors and no page
horizontal overflow. Public health observation recorded210 samples with0failures
from16:36:30 to16:45:22UTC. This is acceptance of the restored **old** dashboard;
the newer dashboard and USER_CALL feedback UI are temporarily absent.

Pre-recovery backup `backup-20260916T150831Z.lpbackup`, cipher SHA
`c7220edbefc5332c2b1f581e28d1ec11f68440948de21bf1aa99a40382d069a0`, was authenticated
off-host against actual GREEN6, accepted controller/history and exact worker
grants/profiles. Its database was not relabeled as the original tested b5 restore.

PR214 merged as `6957af8817318d4210b5d125e46f90a59e5f0b86`; Fast CI passed but
Full35115131562 failed because one PostgreSQL integration assertion still expected
the old `data.summary` wrapper. No admitted artifact was downloaded or deployed.
The follow-up checks flat fields, missing values and absence of engine rows;
all17 local PostgreSQL integration scenarios passed on the isolated loopback
fixture, which was then stopped. New admission and actual
backend-to-hydrated-browser acceptance remain required.

## Earlier checkpoint at15:00UTC: GREEN02 rollout, UI acceptance failed

## Production during the earlier GREEN02 checkpoint

- GREEN `02acca249783cf47c0a24897203d51a206e1c5b2`, generation 6; API RAM 6 GiB, total RAM+swap 8 GiB, CPU 2.
- BLUE `b5c03360941e1e5d59fe83f334b8dc29c2eced3b`, API 4 GiB, retained as rollback.
- Data release `399876b560b4ac611eae35ee425d99422fb140b9`, CURRENT191, unchanged.
- Serving controller `02acca…`, accepted separately at 13:13 UTC by operation `4639608f-8a29-4997-ab95-114738fa50ae`; manifest `5ee7133885692b4c6e86ab680b4040770c985cee4c3381fb372302041232fcad`.
- Application operation `617e0c9e-54b9-48cd-b2a8-fc6f7b22e4f2`, plan `2b68a4a41876ac2b7325ec12b9d182cd6cfd75b789e9e62a830ebc656f8d818f`, completed all five native phases. Final receipt SHA `9fc163909d60ff718e4b3d2c6eecec71b53ca77d8f0d9a27a4ff9c403145b0c7`.
- MainFast `35091177915` and MainFull `35091177900` passed for this exact release. Controller acceptance, CI and native health are distinct from rendered UI acceptance.

Only the original daily and bonus timer schedules were paused; in-flight workers drained naturally. Same-profile TIMER grants were bound to generation6 and both schedules restored at 14:39 UTC. Nine ordinary bonus receipts passed through 14:58:42 UTC; latest receipt `7ad2003a-3523-48f2-af4d-90949b692222`, SHA `40c52f43b4c2424b60350cabff0bb1ea658e32309b350eea1d434d1541022900`. Daily is scheduled for 23:30 UTC; it was not manually started. Original tenant/provider scopes and December13 grant expiry were retained.

## Rendered UI defect and correction

Real Chromium with a genuine existing ADMIN corporate session returned HTTP200 for `/dashboard`, then rendered the error boundary with `Cannot read properties of undefined (reading 'value')`. Live `executive-operations` returns `assortment.data = { rows, summary }` (about 4.7 MB); Web expects the compact summary directly and reads `data.outOfStock.value`.

The API correction returns `data.health.summary` and types the DTO as `AssortmentHealth['summary']`. It does not change calculations, freshness, coverage, scope or unavailable values. A regression serializes the actual assortment engine output with a nonempty row set, asserts the flat metric fields and absence of engine rows, and preserves `null`, `MISSING`, reason and coverage.

Previous synthetic UI fixtures already used the intended flat shape. The previous native corpus checked the operations scope and a raw SSR heading, which did not establish successful hydration. Future acceptance must check the actual operations shape and the fully rendered dashboard before production, including the priority block and KPI-to-chart interaction. No frontend guard or fabricated zero is used to conceal this defect.

The source correction is not deployed by this document. Terminal operation617 cannot be replayed. A successor rollout or emergency return to BLUE requires its own supported native plan, exact evidence and explicit approval. Reverse-slot normalization was excluded from the original approval.

## Other included scope and limits

PR206 USER_CALL Web feedback is present in the accepted Web image: countdown, expiry/error, explicit retry and READY-only Telegram fallback. This does not prove a repaired provider telephone line or a successful new natural guest login. No phone/Telegram canary, reward replay, guest creation, schema change or external-beta admission was performed.

Pre-cutover backup `backup-20260916T134133Z.lpbackup` was authenticated off-host: cipher SHA `eef9e22159259f9ba2de8192906cdb537f2e838c44161299e3828786e98ad6f3`, captured appBLUEb5/controller02 and exact acceptance/profile bytes. Its fresh dump was not relabeled as the separately restored and tested dump. Operator evidence is in `deploy-evidence/executive-application-20260916`; correction journal in `deploy-evidence/executive-operations-contract-20260916`.
