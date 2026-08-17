# Founder pilot: downloaded release artifact API child process

Статус:
`ENGINEERING IMPLEMENTED / EXACT-SHA CI PENDING / PRODUCTION NO-GO`.

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

## Что остаётся после CI

Зелёный synthetic child-process gate доказывает исполнимость скачанного
артефакта и полный HTTP/auth/database path. Он не заменяет:

- immutable production backup и isolated restored target;
- production HBA/TLS certificate и PgBouncer/session drain;
- production-like apply/replay/rollback/readiness;
- SMTP real-send и `SENT/reissue/revoke/accept` barrier;
- Gate 1MT/2 и отдельный controlled production activation.
