# CURRENT188 staged reconcile: exact-SHA CI evidence

Дата фиксации: 13.08.2026.

Статус: `ACCEPTED DORMANT EVIDENCE / NOT DEPLOYED / NO ACCESS GO`.

## Идентичность запуска

- repository: `boozik3412/leetplus`;
- branch: `codex/open-beta-hardening`;
- exact commit: `4e2c9b29c2f8400ec74ab760caa6c336f28b904f`;
- GitHub Actions run: `31671722614`;
- workflow result: `3/3 SUCCESS`;
- application checks job: `94357549063`;
- authority root trust gate job: `94357549134`;
- PostgreSQL migration smoke job: `94357549138`.

## Принятый dormant reconcile boundary

`POST /integrations/langame/onboarding/reconcile`:

- первым действием повторно получает persisted `NETWORK` authority через
  `FreshStoreScopeService`;
- default-off и безусловно запрещён при `NODE_ENV=production`;
- повторно вычисляет exact tenant/actor/receipt/request/config/Store/domain/
  club HMAC binding;
- возвращает `ACTIVATED` только при полном совпадении receipt, claim, Store,
  IntegrationSource, IntegrationCredential и `ACTIVATED` audit event;
- возвращает `NOT_APPLIED` или `EXPIRED` только при доказанном отсутствии
  activation request, claim и activation audit evidence;
- отвергает пустую, множественную, partial, changed и over-broad проекцию;
- не читает plaintext credential, не обращается к provider, не повторяет
  activation и не запускает sync.

Dormant Web BFF принимает exact same-origin cookie-only request, ограничивает
request/response 8 KiB, требует exact Nest `201 application/json`, связывает
receipt и Store с исходным command и возвращает только allowlisted private/
no-store projection. Активные Route Handler и UI его не импортируют.

## Проверки exact SHA

- CURRENT188 Langame API adapter: `5 suites / 201 tests`, failures `0`;
- tenant execution: `18 suites / 986 tests`, failures `0`;
- background containment: `16 suites / 781 tests`, failures `0`;
- full API: `150 suites / 3038 passed / 2 todo`, failures `0`;
- CURRENT188 Web BFF: `17/17`, failures `0`;
- API/Web lint, typecheck и build — `SUCCESS`;
- clean PostgreSQL migration smoke и Gate 1MT assortment/team-chat/
  communications/users-roles matrices — `SUCCESS`.

## SHA-bound artifact

- artifact ID: `9170110158`;
- name:
  `leetplus-release-4e2c9b29c2f8400ec74ab760caa6c336f28b904f`;
- archive digest:
  `sha256:7bea44f81f9fff197ad482af239af364c3e6fdde950a11351d723af2078003b1`;
- size: `16,297,045` bytes;
- artifact не просрочен на момент фиксации evidence.

## Граница решения

Evidence принимает только dormant reconciliation и связанный Web transport.
Оно не делает CURRENT188 canonical, не выдаёт runtime relation/execute grants,
не разрешает production status/reconcile, provider-read preflight, initial
platform import или UI cutover. Production, текущая сеть из четырёх клубов,
внешний tester account и owner invite не изменялись; `SHARED BETA GO` не выдан.
