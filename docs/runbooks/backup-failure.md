# Runbook: Backup failure

## Призначення

Діагностувати й відновити після невдалого `tools/ops_cli.py backup`
прогону.

## Симптоми

- `tools/ops_cli.py backup` завершується з ненульовим exit code.
- Один чи кілька entityType пропущені в виводі ("HTTP N -- ... (пропущено)").
- `manifest.json` містить менше файлів, ніж очікувалось (4 entityType:
  `contact`, `support_request`, `refund_request`, `vip_workflow`).

## Severity

**MEDIUM** — це LOCAL/MOCK backup (O-07, `docs/automation/
backup-policy-draft.md`), не production independent storage. Втрата
одного прогону не критична сама по собі (наступний прогін дасть
свіжий знімок), АЛЕ якщо backup систематично не вдається — це сигнал
про ширшу проблему (Blobs недоступний, `ADMIN_TOKEN` протух).

## Prerequisites

`ADMIN_TOKEN` (O-06), `OPS_BASE_URL`/`OPS_ADMIN_TOKEN` локально,
достатньо місця на диску для `.local/backups/`.

## Безпечна діагностика

```bash
curl -s https://zapuskbiznesu.netlify.app/.netlify/functions/health
python3 tools/ops_cli.py report
```

Якщо `health` показує `"blobs":"degraded"` чи гірше — це
`blob-failure.md`, не backup-специфічна проблема.

Перевірити конкретний entityType export напряму:

```bash
curl -s "https://zapuskbiznesu.netlify.app/.netlify/functions/ops-events-export?entityType=support_request" \
  -H "X-Admin-Token: $OPS_ADMIN_TOKEN"
```

## Команда dry-run

Немає окремого dry-run для backup — сама команда лише ЧИТАЄ
(`ops-events-export.js` GET) і пише ЛОКАЛЬНО. "Dry-run" тут природний:
сам прогін нешкідливий, можна повторювати без ризику.

## Команда виконання

```bash
python3 tools/ops_cli.py backup
```

## Expected output

```
  contact: N events -> .local/backups/<ts>/contact.jsonl
  support_request: N events -> .local/backups/<ts>/support_request.jsonl
  refund_request: N events -> .local/backups/<ts>/refund_request.jsonl
  vip_workflow: N events -> .local/backups/<ts>/vip_workflow.jsonl
Backup завершено: .local/backups/<ts> (manifest.json + checksums)
```

## Verification

```bash
python3 -c "
import json, hashlib
m = json.load(open('.local/backups/<ts>/manifest.json'))
for f in m['files']:
    actual = hashlib.sha256(open(f'.local/backups/<ts>/{f[\"file\"]}', 'rb').read()).hexdigest()
    print(f['file'], 'OK' if actual == f['sha256'] else 'MISMATCH')
"
```

## Rollback

Backup — read-only з точки зору production даних (лише читає
`automation-events` через `ops-events-export.js`). Невдалий backup не
залишає production у гіршому стані — просто немає свіжого локального
знімку. "Rollback" тут = використати попередній успішний backup
(попередня `.local/backups/<ts>/` директорія, якщо існує).

## Owner communication

MEDIUM — не негайний alert, але якщо 2+ прогони поспіль провалюються
— підняти до власника (можлива системна проблема з `ADMIN_TOKEN` чи
Blobs).

## STOP conditions

- Якщо `admin_token_not_configured` (503) — це НЕ backup-специфічна
  проблема, ADMIN_TOKEN або не встановлено, або протух. Не намагатись
  "обійти" повторними спробами.
- Якщо checksum verification (`restore-test.md`) провалюється НА
  ЩОЙНО СТВОРЕНОМУ backup (не старому) — можлива проблема на диску
  (запис пошкоджено під час запису), не мережева.

## Пов'язані owner blockers

O-06 (admin auth), O-07 (independent backup storage — цей runbook
описує лише local/mock контур, не production-незалежне сховище).
