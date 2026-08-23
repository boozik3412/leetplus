# CURRENT187-J5-R10: exact-SHA CI evidence

Дата фиксации: 13.08.2026.

Статус: `ACCEPTED ENGINEERING EVIDENCE / NO PRODUCTION ROOT / NO ACCESS GO`.

## Идентичность запуска

- repository: `boozik3412/leetplus`;
- branch: `codex/open-beta-hardening`;
- exact commit: `8c34895a35bdebc91cf5deba4258adcc709a6b7f`;
- GitHub Actions run: `31639146344`;
- workflow result: `3/3 SUCCESS`;
- jobs: authority root trust gate, application checks и PostgreSQL migration
  smoke — `SUCCESS`.

## Целевое доказательство R10

Шаг `Verify CURRENT187 actual PgBouncer stats-only control plane` выполнил
disposable TLS/PgBouncer fixture и завершил четыре subtests:

1. strict production-origin J4 receipt получен через actual mTLS stats-only
   console;
2. application login не допущен в PgBouncer admin console;
3. verify-full отклонил клиента без client certificate;
4. co-located public J1–J4 chain выполнил production runner matrix и подписал
   exact R9 receipt внешним production file-backed signer.

Итог целевого прогона: `tests=4`, `pass=4`, `fail=0`, `skipped=0`, `todo=0`.
После scoped cleanup все последующие PostgreSQL/shared-beta steps также
завершились успешно.

## SHA-bound artifact

- artifact ID: `9158424615`;
- name:
  `leetplus-release-8c34895a35bdebc91cf5deba4258adcc709a6b7f`;
- archive digest:
  `sha256:9ac538fa08ccf2024e7e1acf54814b00995ec7a84dfd9adbb75c8a62906b00a4`;
- artifact не просрочен на момент фиксации evidence.

## Граница решения

Это evidence принимает disposable bridge между actual R9 runner и внешним
file-backed signer. Оно не является key ceremony, production root enrollment,
production deployment, `SHARED BETA GO` или разрешением создать `Tenant B`,
tester account либо owner invite. Production root registry остаётся
frozen-empty и обязан отклонять одноразовый CI root.
