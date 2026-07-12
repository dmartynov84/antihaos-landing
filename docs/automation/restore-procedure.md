# Restore procedure

## Механізм (готовий, live-задеплоєний, fail-closed перевірено)

```bash
export OPS_BASE_URL=https://zapuskbiznesu.netlify.app
export OPS_ADMIN_TOKEN=<ADMIN_TOKEN>

python3 tools/ops_cli.py backup                       # створює .local/backups/<ts>/*.jsonl
python3 tools/ops_cli.py restore-drill --file .local/backups/<ts>/support_request.jsonl
python3 tools/ops_cli.py restore-verify                # перелічує ключі у restore-drill сторі
```

`ops-events-restore.js` пише ВИКЛЮЧНО в `automation-events-restore-drill`
— назва стору захардкожена на бекенді, не параметр запиту, тому
навіть баг у клієнті (`tools/ops_cli.py`) не може випадково націлитись
на справжній `automation-events`. Restore на production дані —
ОКРЕМЕ рішення, що потребує явного дозволу власника (§ нижче), не
частина цього циклу.

## Restore drill на синтетичних даних — ЗАПЛАНОВАНО, НЕ ВИКОНАНО цього циклу

| Крок | Очікується | Фактично | Статус |
|---|---|---|---|
| 1. Backup реальних (mock/sandbox) events | `tools/ops_cli.py backup` створює JSONL+manifest | Не виконано | ⛔ BLOCKED |
| 2. Restore у ізольований стор | `restore-drill` записує події, повертає `restored: N` | Не виконано | ⛔ BLOCKED |
| 3. Verify | `restore-verify` показує ті самі ключі | Не виконано | ⛔ BLOCKED |
| 4. Checksum-звірка backup-файлу з відновленими даними | Кількість подій співпадає | Не виконано | ⛔ BLOCKED |

**Причина блокування: `ADMIN_TOKEN` не встановлено на Netlify (O-15,
`docs/owner-blockers.md`)** — усі `ops-*` endpoints, включно з
`ops-events-restore.js`, коректно повертають `503
admin_token_not_configured` (перевірено живим curl-тестом, це
fail-closed за дизайном, не помилка). Асистент не має доступу до
Netlify dashboard, щоб встановити токен самостійно.

Це той самий блокер, що заважав `crm-lookup.js`/`replay-workflow.js`
до їхнього першого живого тестування — НЕ новий, окремий недолік
цього циклу.

## Owner action item

Після встановлення `ADMIN_TOKEN` на Netlify: прогнати команди вище
самостійно (чи попросити наступний цикл асистента це зробити) і
заповнити таблицю фактичними результатами перед тим, як покладатись
на backup/restore для реального інциденту.

## Restore на production дані (НЕ синтетичні) — окремий Owner Blocker

Явно поза обсягом цього циклу й будь-якого автоматичного виконання.
Якщо колись знадобиться відновити production `automation-events` із
backup (напр. після випадкового пошкодження) — це вимагає:
1. Явного дозволу власника в поточній розмові (не заздалегідь).
2. Окремого endpoint/шляху, який пише в `automation-events` (не
   `-restore-drill`) — наразі НЕ існує, зроблено НАВМИСНО, щоб
   випадковий restore-drill запуск не міг зачепити production дані.
