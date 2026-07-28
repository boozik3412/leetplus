# Intake первого тестового клуба

Этот шаблон собирает только данные, необходимые для подготовки одного
изолированного `Tenant D` с единственным `Store D1`. Он не является
разрешением на выдачу доступа и не содержит инфраструктурных секретов.

## 1. Данные, которые подтверждает владелец продукта

- название сети или юридического владельца данных;
- название одного тестового клуба;
- желаемый lowercase slug, например `partner-club`; web origin будет строго
  `https://<tenant-slug>.leetplus.ru`, isolated API origin —
  `https://api-<tenant-slug>.leetplus.ru`;
- город, адрес и IANA timezone клуба;
- имя и рабочий email единственного первого `NETWORK OWNER`;
- основной и резервный представитель клуба для обратной связи;
- основной и резервный LeetPlus support owner;
- желаемые дата старта, active support window и дата окончания доступа, не
  более 45 дней от provisioning;
- условия retention/export/offboarding после теста.

## 2. Источник данных

Нужно выбрать один режим:

1. `MANUAL_ONLY` — начать без Langame credentials и проверять ручные
   сценарии/imports.
2. `LANGAME` — дополнительно передать `langameDomain` и `langameClubId` через
   защищённый канал. API key, пароль и другие credentials в manifest, git,
   ticket или этот документ не записываются.

Даже при `LANGAME` unattended scheduler и outbound effects остаются `OFF` до
отдельного evidence и `GO`; допустимый ручной sync входит в проверяемый
ассортиментный slice.

## 3. Обязательный первый доступ

До передачи приглашения один exact release должен открыть и проверить:

- `DP-S0`: login, support, feedback, users/roles только в Tenant D/Store D1;
- `DP-S1`: ассортимент и товары целиком, включая отчёты, imports и ручной
  sync;
- `DP-S2`: сотрудники целиком — directory, задачи, контроль, мотивация,
  регламенты, база знаний, обучение, дисциплина и salary planning;
- `DP-S3`: внутренние коммуникации;
- `DP-S4`: геймификацию, wallet/ledger и диагностику.

Внешние reward deliveries, Langame writes, Telegram/SMS/MAX, unattended jobs,
salary payouts и автоматические санкции в первый доступ не входят и остаются
fail-closed.

## 4. Что нельзя присылать в обычный чат

- database URLs и пароли;
- JWT, HMAC, encryption, invite, integration или scheduler secrets;
- Langame API credentials;
- production tenant/store/user IDs;
- выгрузки гостей, телефоны, чеки и иные raw PII/операционные данные.

Такие значения создаются или передаются только через согласованный защищённый
канал. В git сохраняются aliases, exact SHA, counts/digests и ссылки на
protected evidence.

## 5. Готовность к приглашению

Приглашение можно передать только после всех пунктов
[launch checklist](./single-design-partner-launch-checklist.md) и отдельного
`DESIGN_PARTNER GO`. Provisioning сначала создаёт `SUSPENDED` tenant; ссылка
одноразовая, email-bound и действует не дольше 72 часов и общего окна доступа.
Потерянная ссылка ротируется только аудируемой idempotent-командой.
