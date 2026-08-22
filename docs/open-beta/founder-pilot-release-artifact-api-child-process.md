# Founder pilot: downloaded release artifact API child process

Статус:
`EXACT-SHA CI ACCEPTED / DOWNLOADED ARTIFACT CHILD PROCESS PASS / PRODUCTION NO-GO`.

## Цель

Этот gate устраняет разницу между in-process Nest fixture и реально
доставляемым пакетом. Отдельный CI job зависит от завершённой сборки, скачивает
SHA-bound artifact через GitHub Actions и работает только с его содержимым.

Последовательность приёмки:

1. скачать exact `leetplus-release-<sha>`;
2. проверить внешний `.tar.gz.sha256`, gzip и каждый файл по внутреннему
   `SHA256SUMS`;
3. распаковать в новый system temp root;
4. выполнить `pnpm install --prod --frozen-lockfile` и `prisma generate`;
5. создать отдельную disposable PostgreSQL database и применить все `183`
   canonical migrations из artifact;
6. создать отдельную least-privilege activation role с одним разрешённым
   `SECURITY DEFINER` RPC;
7. запустить `node apps/api/dist/main.js` как настоящий child process;
8. проверить `/version` и `/health/ready` против exact SHA, migration name и
   migration count;
9. аутентифицировать persisted Platform Admin через реальный JWT guard и по
   HTTP выполнить `provision → founder GO → activate → replay`;
10. подтвердить `ACTIVE/OWNER_INVITED`, один immutable activation command, одно
    `OWNER/NETWORK` invite, один `PENDING` outbox и отсутствие `User` до accept;
11. убедиться, что response и bounded child output не содержат owner email,
    токенов, database password или encryption/HMAC material;
12. штатно остановить API, удалить disposable database и role и принять только
    zero-residue результат.

Fixture запускается только с exact confirmation phrase, loopback PostgreSQL и
непривилегированным портом. Все schedulers и outbound delivery выключены.
Production env, production database, текущий tenant из четырёх клубов и внешний
tester не используются.

## Принятое exact-SHA evidence

- implementation SHA:
  `0c721f4de5891689e9e344b89c64b5b72e6a8ce7`;
- push CI
  [32078882449](https://github.com/boozik3412/leetplus/actions/runs/32078882449)
  и PR CI
  [32078886786](https://github.com/boozik3412/leetplus/actions/runs/32078886786)
  завершены как `4/4 SUCCESS`;
- скачан artifact `9304656653`, размер `28 421 509` bytes, GitHub digest
  `sha256:5dc17d356030d480fdae5cbae3e97d0329c23b77e9032be019f2ef4336915700`;
- child process подтвердил release/version SHA, migration
  `20260817030000_founder_operator_beta_activation_runtime_v1` и все `183`
  migrations;
- фактический lifecycle:
  `SHELL_PROVISIONED → ISSUED → ACTIVATED → REPLAYED`;
- итоговое состояние: tenant `ACTIVE`, onboarding `OWNER_INVITED`, database
  residue `0`, role residue `0`;
- первая fail-closed попытка на predecessor SHA `a057260a…` корректно остановила
  activation из-за унаследованного `PUBLIC TEMPORARY`. Fixture отозвал
  `PUBLIC CREATE/TEMPORARY`, не ослабляя runtime assertion, после чего exact
  acceptance прошёл.

## Что остаётся после принятого CI

Зелёный synthetic child-process gate доказывает исполнимость скачанного
артефакта и полный HTTP/auth/database path. Он не заменяет:

- immutable production backup и isolated restored target;
- production HBA/TLS certificate и PgBouncer/session drain;
- production-like apply/replay/rollback/readiness;
- SMTP real-send и `SENT/reissue/revoke/accept` barrier;
- Gate 1MT/2 и отдельный controlled production activation.
