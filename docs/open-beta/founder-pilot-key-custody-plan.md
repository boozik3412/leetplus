# Founder pilot: key custody plan

Статус: `APPROVED_FOR_ONE_PILOT / NOT_EXECUTED`.

Область: один founder и одна полнодисково зашифрованная флешка для bootstrap и
recovery глобального platform trust LeetPlus. Носитель не соответствует
конкретному tenant/store. Alias владельца: `founder-primary`.

## Правила

1. На носителе создаются отдельные зашифрованные Ed25519 private keys для
   bootstrap root и founder approval. Они физически находятся на одном
   носителе; независимость не заявляется.
2. Passphrase хранится отдельно от флешки и не попадает в Git, `.env`, backup
   проекта, облачный диск, мессенджер или issue tracker.
3. Private keys не копируются на online workstation. На неё передаются только
   public SPKI PEM, exact payload и detached signature.
4. До и после подписи founder сверяет public fingerprints с бумажной записью.
5. После операции носитель безопасно отключается. Все временные payload и
   signature файлы на online workstation содержат только публичные данные.
6. Потеря, повреждение, неожиданное изменение fingerprint или подозрение на
   компрометацию означает `STOP`: registry transition, deploy и invite не
   продолжаются.
7. Перед ротацией/revoke глобального platform root или существенным расширением
   команды этот план заменяется CURRENT201 с независимыми людьми/носителями и
   проверенной recovery-копией. Добавление tenant само по себе ротации не
   требует.

Этот документ не содержит private material. Его exact LF-normalized bytes
хешируются SHA-256 и передаются как `keyCustodyPlanDigest` CURRENT202.
