# Founder pilot: runnable SHA-bound release artifact

Статус:
`EXACT-SHA CI ACCEPTED / RUNNABLE ARTIFACT / PRODUCTION NO-GO`.

Цель этого этапа — превратить CI artifact из проверяемого архива build output в
воспроизводимый runtime/rehearsal package. Артефакт остаётся без secrets и без
`node_modules`: зависимости устанавливаются после проверки всех SHA-256 из
exact `pnpm-lock.yaml`.

## Обязательное содержимое

`leetplus-release-<sha>.tar.gz` теперь содержит:

- `apps/api/dist` и exact `apps/api/package.json`;
- production `.next`, `apps/web/package.json`, `next.config.ts` и `public`;
- Prisma schema и все `183` канонические migrations;
- exact `packages/database/package.json` и только шесть runtime/CLI MJS файлов
  для restored-copy preflight, activation-role lifecycle и direct network
  acceptance; test fixtures и прочие scripts в artifact не копируются, exact
  file count равен `6`;
- root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`;
- `release-provenance.json` и отсортированный `SHA256SUMS`.

`.next/cache`, `.next/dev`, любые symlink и `node_modules` в архив не
допускаются. `pg` и Prisma CLI переведены в runtime dependencies пакета
`database`, чтобы protected operational commands не зависели от dev install.

## CI acceptance

После детерминированной сборки CI обязан до upload:

1. проверить outer `.tar.gz.sha256` и gzip stream;
2. проверить exact inventory обязательных путей и отсутствие `node_modules`;
3. распаковать архив в новый system temp root;
4. проверить каждый файл по внутреннему `SHA256SUMS`;
5. сверить release SHA и три capability flag в provenance;
6. выполнить syntax check трёх founder operational CLI;
7. выполнить `pnpm install --prod --offline --frozen-lockfile` только из
   включённых manifests/lock;
8. выполнить `prisma generate`, `--help` всех трёх CLI и resolution Nest/Prisma;
9. подтвердить непустой production web `BUILD_ID`;
10. только после этого загрузить SHA-bound GitHub artifact.

Локальный layout/tar/checksum/extract smoke пройден. Созданный system temp root
после проверки был удалён; production, PostgreSQL и пользовательский `.tmp/` не
изменялись.

Implementation SHA `90a94f1bd729424751db156fb17fa2a318995a59` принят push CI
[`32075030815`](https://github.com/boozik3412/leetplus/actions/runs/32075030815)
и PR CI
[`32075035388`](https://github.com/boozik3412/leetplus/actions/runs/32075035388)
как `3/3 SUCCESS`. Push artifact `9303394475`, размер `28 419 842` bytes,
digest
`sha256:b73c932f285b17e815ac20d6dda19bc73766a0b90466363103cc87ff1bd8d5fd`.

## Безопасная hydration-последовательность

На isolated rehearsal host:

```bash
sha256sum --check leetplus-release-<sha>.tar.gz.sha256
mkdir leetplus-release-<sha>
tar -xzf leetplus-release-<sha>.tar.gz -C leetplus-release-<sha>
cd leetplus-release-<sha>
sha256sum --check --quiet SHA256SUMS
pnpm install --prod --offline --frozen-lockfile
pnpm --filter database db:generate
```

Offline install требует заранее заполненный доверенный pnpm store. Если store
не подготовлен, rehearsal останавливается до отдельного online dependency
acquisition с lockfile review; fallback на незакреплённые версии запрещён.

Этот этап не разрешает запуск с production env. Следующий gate —
[скачать принятый artifact и запустить полный API child process](./founder-pilot-release-artifact-api-child-process.md)
на isolated PostgreSQL, затем повторить на immutable production-backup restored
copy.
