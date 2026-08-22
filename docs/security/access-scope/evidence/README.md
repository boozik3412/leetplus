# AccessScope release evidence

Для каждого candidate release создаётся каталог:

```text
evidence/<full-release-sha>/
```

Минимальный набор:

- `current-network-scope-manifest.md`;
- `migration-and-restore.md`;
- `test-and-reconciliation.md`;
- `rollout-decision.md`.

Evidence содержит только counts, checksums, обезличенные aliases и ссылки на
защищённые операционные записи. Здесь запрещены production IDs, email, телефоны,
invite/session tokens, API keys и database URLs.

Шаблон manifest:

```markdown
# Current network scope manifest

- Candidate SHA:
- Migration revision/count:
- Protected operational record reference:
- Tenant alias:
- Tenant fingerprint/checksum:
- Store aliases/fingerprints/count (expected: four):
- Langame source aliases and store mapping fingerprints:
- Public/QR/Telegram link inventory and checksums:
- User totals by mode/role:
- Unresolved account count:
- Cross-tenant link count (expected: zero):
- Pending invite totals by mode:
- Backup/restore evidence:
- Approved by / date:
```
