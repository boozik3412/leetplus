# Pre-production mail and Telegram ACL hardening — 27.08.2026

Статус: `LOCAL PASS / DISABLED BY DEFAULT / PRODUCTION UNCHANGED`.

## Что реализовано

### Identity-mail SMTP egress

- отдельный secret-free TCP broker допускает только один exact SMTP DNS target
  на canonical port `465` либо `587`;
- DNS разрешается заново перед каждым соединением, а соединение выполняется по
  уже проверенному public IPv4, чтобы не доверять повторному DNS lookup;
- loopback, private, link-local, CGNAT, documentation, benchmark, multicast и
  reserved IPv4 отклоняются fail-closed;
- relay и health listeners привязаны только к `127.0.0.1`;
- worker допускает `LOOPBACK_BROKER` только при явном включении broker, exact
  совпадении release SHA, SMTP TLS identity и provider port;
- provider authority digest остаётся привязанным к внешнему TLS endpoint, а
  локальный transport меняет только runtime config digest;
- worker и broker получают отдельные per-slot environment files. Общий slot
  environment и весь `/etc/leetplus` недоступны уже запущенным процессам;
- systemd units имеют пустой capability set, `NoNewPrivileges`, read-only
  release tree и выключены конфигурацией по умолчанию.

### Telegram update ledger ACL

Добавлен exact controller для
`public."GuestPortalTelegramUpdateLedger" → leetplus_runtime` на
`CURRENT_187`. Он:

- проверяет exact migration count/head и безопасную runtime role topology;
- приводит только эту таблицу к `SELECT, INSERT, UPDATE` без grant option;
- удаляет `PUBLIC`, `DELETE`, `TRUNCATE`, `REFERENCES` и `TRIGGER`;
- не создаёт role, не выдаёт schema-wide или all-tables grants;
- поддерживает `plan`, `check` и approval-bound `apply`;
- в apply использует serializable transaction, короткие timeouts, advisory
  lock, live-drift recheck, postcondition и проверку после commit;
- принимает только credentialed numeric-loopback PostgreSQL URL без query
  parameters, способных переопределить target.

## Локальная проверка

```text
Identity-mail lint:                  PASS
Identity-mail/API typecheck:         PASS
Identity-mail suites:                20/20 PASS
Identity-mail tests:                 520/520 PASS
Telegram ACL controller tests:       7/7 PASS
Telegram ACL PostgreSQL 16:          1/1 PASS
Database typecheck:                  PASS
Runtime artifact integrity:          PASS
Production systemd templates (LF):   PASS
Production control artifact (LF):    PASS
```

Linux-only root/permission fixtures должны быть подтверждены Full Release
Admission на exact commit; Windows не воспроизводит Unix owner/mode semantics.

## Что намеренно не сделано

- production server, database, systemd, environment и SMTP не изменялись;
- production ACL plan/check/apply не запускались;
- worker и broker не устанавливались и не включались;
- SMTP письмо и live mail-canary не отправлялись;
- этот slice сам по себе не закрывает весь Gate 1MT, Gate 2 или `SHARED BETA
  GO`.

## Следующее production-окно

После зелёного exact-SHA admission потребуется отдельное уведомление и
согласование перед каждым изменяющим шагом:

1. установить admitted production-control generation и новые systemd units;
2. создать per-slot broker/worker env, оставив switches `false`;
3. выполнить read-only ACL `check`; при drift отдельно согласовать exact
   `planDigest/actionCount` и только затем `apply`;
4. провести SMTP connectivity/health canary без tenant delivery;
5. включить один reviewed tenant, отправить одно controlled письмо и проверить
   `PENDING → SENT → accept`, после чего снова выключить canary до review.
