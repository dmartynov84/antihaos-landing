# Backup policy — ЧЕРНЕТКА (Owner Blocker для затвердження)

Статус: **DRAFT**, технічний механізм готовий (`tools/ops_cli.py
backup`, `ops-events-export.js`), сама ПОЛІТИКА (частота, термін
зберігання backup-файлів, хто має доступ до `.local/backups/`) —
рішення власника, узгоджене з O-06 (data retention) у
`docs/owner-blockers.md`.

## Формат

`tools/ops_cli.py backup` → `.local/backups/<UTC timestamp>/`:
- `contact.jsonl`, `support_request.jsonl`, `refund_request.jsonl`,
  `vip_workflow.jsonl` — по одному JSON-об'єкту (event envelope) на
  рядок, увесь event-стрім кожного entityType.
- `manifest.json` — `{generatedAt, files: [{entityType, file,
  eventCount, sha256}]}`.

Джерело — `ops-events-export.js` (authenticated, повний export ОДНОГО
entityType, включно з payload — реальний PII, навмисно: це backup, не
PII-minimal звіт).

## Що backup НЕ робить

- Не бекапить `checkout-orders`/`checkout-webhook-events`/`checkout-
  audit-log` (checkout store, окремий від automation-events) — поза
  обсягом цього циклу (checkout лишається `CHECKOUT_MODE=disabled`).
- Не бекапить `workflow-status` (retry/dead-letter стан) —
  відновлюваний з events за потреби (dead-letter — похідний стан, не
  джерело істини).
- Не шифрує файл на диску — `.local/` лишається на локальній машині
  оператора, не на спільному/публічному сховищі. Якщо власник хоче
  зберігати backup довше одноразового локального прогону — шифрування
  й місце зберігання самі по собі потребують рішення (частина O-06).
- **Не автоматичний, не за розкладом** — `docs/automation/
  scheduled-jobs.md` пояснює, чому жодного cron немає цього циклу.
  Backup = ручна команда, запущена оператором, коли потрібно.

## Retention

Скільки backup-знімків зберігати локально, скільки часу — Owner
Blocker (O-06 у `docs/owner-blockers.md`, той самий, що охоплює PII
lifecycle взагалі). До явного рішення: жодного автоматичного видалення
старих backup-файлів немає.

## Restore

Процедура — окремий документ `docs/automation/restore-procedure.md`.
