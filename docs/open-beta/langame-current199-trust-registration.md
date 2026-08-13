# CURRENT199: trust-registration provenance bridge

| Поле                           | Значение                                       |
| ------------------------------ | ---------------------------------------------- |
| Статус                         | `LOCAL FOUNDATION / DENY-ONLY / NOT PERSISTED` |
| Дата                           | 14.08.2026                                     |
| Production root                | отсутствует                                    |
| Production / Tenant A / tester | не изменялись                                  |

CURRENT199 подготавливает единственную immutable registration-запись для
первичного runtime trust enrollment. Это промежуточная граница между
CURRENT196 signed proposal + CURRENT197 protected acquisition и будущим
owner-only PostgreSQL ledger.

## Закрытый provenance-разрыв

CURRENT196 verification receipt теперь переносит полный
`enrollmentPayloadDigest`, а CURRENT197 включает тот же digest в protected
receipt и его digest. Благодаря этому CURRENT199 сравнивает и связывает весь
двухконтрольный proposal, а не только совпавшую проекцию отдельных полей.

Registration digest дополнительно фиксирует:

- exact CURRENT198 bootstrap registry contract/digest и bootstrap key identity;
- release SHA/artifact, verifier, runtime config и cluster identity;
- database/owner/runtime role names и OID;
- оба runtime key ID/fingerprint и SHA-256 exact public-key file bytes;
- TLS CA/leaf/SPKI, endpoint/server name, protocol и validity;
- resolved-address set, TLS observation и protected-acquisition receipt;
- enrollment ID/generation, issued/collected/prepared/valid-until timeline.

## Fail-closed свойства

- production entry принимает только настоящие process-branded CURRENT196 и
  CURRENT197 receipts, причём acquisition обязан иметь production origin;
- все cross-receipt поля должны совпасть, а registration готовится до expiry;
- proxy/accessor inputs отклоняются без вызова accessor;
- output process-branded, immutable и явно содержит `authorization=false`,
  `canPersist/apply/rotate/revoke=false`, `sharedBetaAccess=false`;
- модуль не имеет Prisma, filesystem, network, process-env, private-key или
  signing authority.

## Проверка и остаток

Focused CURRENT199 matrix — `7/7`; CURRENT196/197 compatibility с реальным
loopback TLS fixture — `25/25`; database typecheck и format/diff checks зелёные.

Этот срез не является ledger: после рестарта process brand теряется, DB-записи
и append-only events отсутствуют. Следующий P0 — owner-only PostgreSQL
registration/event ledger с exact replay, lost-response reconciliation,
expiry, unique one-time enrollment и запретом update/delete; затем отдельные
rotation/revocation command contracts. До них production enrollment и внешний
тест остаются `NO-GO`.
