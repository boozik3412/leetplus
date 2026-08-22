# Telegram poller update dedupe CI evidence — 2026-08-20

| Поле               | Значение                                                    |
| ------------------ | ----------------------------------------------------------- |
| Статус             | `PARTIAL PASS` для poller stale/duplicate update guard      |
| Exact SHA          | `b415c5a3e199f4a34a29693dd8f9e814ce3e8c9a`                  |
| Branch             | `codex/open-beta-hardening`                                 |
| GitHub Actions run | `32346243064`                                               |
| Release decision   | `NO-GO` для внешнего beta invite до полного Gate 1MT/Gate 2 |

## Что изменено

`runTelegramPollingTick()` теперь пропускает stale Telegram updates до
LeetPlus webhook handler, если `update_id < currentOffset`. Это также
закрывает duplicate `update_id` внутри одного `getUpdates` batch: первый
update продвигает offset, повтор с тем же id становится stale и не доходит до
handler.

Это не является полноценной durable дедупликацией Telegram update ID в базе.
Durable cross-process/cross-restart dedupe, tenant-aware shared Telegram
routing, multi-profile identity A/B negative tests и production canary остаются
открытыми Gate 1MT пунктами.

## Локальная проверка

- Targeted Telegram/API suite:
  `telegram-edge-adapter`, `telegram-edge-poller.cli`,
  `telegram-bot-api-fetch`, `telegram-send-message-payload`,
  `guest-portal.service` — `5/5 suites`, `218/218 tests`.
- Targeted ESLint для poller source/spec — зелёный.
- API typecheck — зелёный.
- Prettier check для poller source/spec — зелёный.
- `git diff --check` — зелёный.

## CI acceptance

GitHub Actions run `32346243064` прошёл полностью:

- `Authority root trust gate` — success.
- `Application checks` — success.
- `Release artifact API child process` — success.
- `PostgreSQL migration smoke` — success.

Известные non-blocking annotations в этом run относятся к существующим Web
lint warnings в `apps/web/src/app/play/game/game-summary-client.tsx` и к
GitHub runner Node.js deprecation warning; они не связаны с Telegram poller
изменением и не остановили CI.

## Beta impact

Срез уменьшает риск повторной обработки stale/duplicate updates в poller mode,
но не разрешает включать общий Telegram/outbound контур для внешнего tenant.
Перед открытым тестом всё ещё нужны:

1. durable Telegram update ID dedupe;
2. shared Telegram routing и multi-profile identity A/B negative tests;
3. tenant-aware public guest/Telegram/outbound matrix;
4. production canary/kill-switch для внешнего tenant.
