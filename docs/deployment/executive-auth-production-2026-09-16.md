# Executive dashboard and USER_CALL Web release, 16 September 2026

Status at 15:00 UTC: application rollout is accepted, but **dashboard UI acceptance failed**. Do not report the release as fully accepted.

## Actual production

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
