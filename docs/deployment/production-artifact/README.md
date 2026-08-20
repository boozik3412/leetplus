# SHA-bound production artifact staging

`stage-release-artifact.sh` является только подготовительной частью
production-release. Он принимает artifact, который уже был выпущен GitHub Full
Release Admission для одного exact SHA, проверяет его целостность и помещает в
новую release directory. Скрипт не скачивает файлы, не читает secrets, не
подключается к PostgreSQL и не управляет systemd.

## Пример isolated rehearsal

```bash
mkdir -p /srv/leetplus/rehearsal-releases
bash stage-release-artifact.sh \
  --release-sha <exact-40-character-sha> \
  --artifact /secure/inbox/leetplus-release-<sha>.tar.gz \
  --artifact-sha256 /secure/inbox/leetplus-release-<sha>.tar.gz.sha256 \
  --output-root /srv/leetplus/rehearsal-releases \
  --hydrate
```

`--hydrate` намеренно требует pre-warmed trusted pnpm store и запускает
`pnpm install --prod --offline --frozen-lockfile`; доступ к сети не служит
fallback. Ошибка сохраняет staging directory для расследования и никогда не
перезаписывает существующий release.

## Переход к production

После успешного stage оператор выполняет только порядок из
[Controlled Beta-1 production canary plan](../../open-beta/controlled-beta-1-production-canary-plan.md):

1. проверенный backup и restored-copy rehearsal;
2. migration deploy из staged exact artifact;
3. отдельный, reviewed switch runtime `current` и restart systemd;
4. `/version` и `/health/ready` с exact SHA/migration metadata;
5. только после этого controlled `Tenant B/Store B1` activation.

Legacy `git pull → build → restart` не является допустимым заменителем этой
процедуры. Замена production timer/unit, перенос sensitive backup residue и
runtime switch требуют отдельного разрешения владельца production.

Минимальный acceptance test `/.github/scripts/test-stage-release-artifact.sh`
собирает disposable artifact, принимает его и доказывает fail-closed отказ для
повреждённого archive без созданного release directory. Он выполняется в Fast
CI и не использует PostgreSQL, systemd или production secrets.
