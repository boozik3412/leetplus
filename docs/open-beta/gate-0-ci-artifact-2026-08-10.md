# Gate 0: clean SHA и воспроизводимый CI artifact — 10.08.2026

## Вердикт

Gate 0 (`canonical source`) принят. Это подтверждение канонического исходного
состояния и воспроизводимой сборки, но не разрешение production deployment,
cutover текущей сети или выдачи внешнего OWNER invite.

## Git evidence

- release branch: `codex/open-beta-hardening`;
- exact SHA: `183270f6d7b26196844210fc428639945a081cd5`;
- latest `origin/main` влит merge-коммитом
  `05a23cd9` (`merge: synchronize open beta with latest main`);
- на момент приёмки `origin/main...HEAD`: behind `0`;
- branch и `origin/codex/open-beta-hardening` указывают на один exact SHA;
- локальный `.tmp/` не отслеживается Git, не staged и не входит в release
  artifact.

## CI evidence

- workflow: [CI run 31385942115](https://github.com/boozik3412/leetplus/actions/runs/31385942115);
- `Authority root trust gate`: `SUCCESS`;
- `Application checks`: `SUCCESS`;
- `PostgreSQL migration smoke`: `SUCCESS`.

PostgreSQL job включает canonical deploy, upgrade/replay/rollback проверки,
CURRENT183–187, CURRENT186 duty-role lifecycle, OWNER invite HOLD,
PostgreSQL + trusted TLS SMTP worker, shared tenant activation, design-partner
boundaries и поздние tenant/store security matrices.

## Artifact evidence

- artifact: `leetplus-release-183270f6d7b26196844210fc428639945a081cd5`;
- GitHub artifact ID: `9061942094`;
- размер: `16 274 727` байт;
- archive digest:
  `sha256:1e28b8c10ff3ffe03a72bba5a593db6dfde14fddbe9eab41d2071175f06a4966`;
- создан: `2026-08-10T12:08:30Z`;
- срок хранения GitHub: до `2026-09-09T12:08:29Z`.

Artifact привязан к exact release SHA, содержит собранные API/Web/Prisma
артефакты и per-file `SHA256SUMS`; tar metadata нормализуется CI workflow.

## Что это разрешает

- перейти от стабилизации исходного состояния к reviewed canonical promotion
  и production-like restored-copy rehearsal;
- использовать exact SHA и digest как входные данные последующих signed
  runbook/attestation процедур.

## Что это не разрешает

- не накатывать изменения на production;
- не изменять `Tenant A` и его `Store A1..A4`;
- не создавать `Tenant B/Store B1`, пользователя тестера или пароль `123456`;
- не отправлять invite на `gr1mmphone1@gmail.com`;
- не включать dormant CURRENT188–190 routes, jobs, SMTP или другие outbound
  effects.

Следующий обязательный этап: canonical/runtime review, Gate 1MT и signed
restore/apply/repeat/rollback/zero-diff на восстановленной production-like
копии. Только после cutover текущей сети, стабильной internal alpha и отдельного
persisted `SHARED BETA GO` разрешён первый внешний OWNER invite.
