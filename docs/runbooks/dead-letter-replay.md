# Runbook: Dead-letter list / inspect / replay / cancel

## Призначення

Відновити workflow, застряглий у `retry_scheduled` чи `dead_letter`
(lead/support/refund/VIP), без ручного втручання в Blobs напряму.

## Симптоми

- `tools/ops_cli.py report` показує `deadLetterCount > 0` або
  `staleCount > 0`.
- Клієнт повідомляє "не отримав відповідь/файл", а `support-status`/
  `refund-status`/`vip-status` показує застарілий статус.
- Netlify function logs містять `workflow_replay_failed` чи
  `lead_projection_failed`.

## Severity

- **HIGH** — `dead_letter` (5 спроб вичерпано, автоматичний retry вже
  не станеться).
- **MEDIUM** — `retry_scheduled`, вік перевищує `_lib/stale-detection.js`
  поріг (24h) — технічно "зависло", можливо потребує ручного втручання
  раніше, ніж наступний scheduled retry (якого, до речі, не існує —
  `docs/automation/scheduled-jobs.md`).

## Prerequisites

- `ADMIN_TOKEN` встановлено на Netlify й відомий оператору (O-06 у
  `docs/owner-blockers.md` — production-grade auth заміна ще не
  ухвалена, зараз це сирий shared secret).
- `OPS_BASE_URL`/`OPS_ADMIN_TOKEN` env vars встановлені локально для
  `tools/ops_cli.py`.

## Безпечна діагностика (нічого не змінює)

```bash
python3 tools/ops_cli.py dead-letter list
python3 tools/ops_cli.py dead-letter inspect --workflow-id <id-зі списку>
```

`inspect` показує поточний стан, кількість events, типи подій — без
raw payload/PII (`ops-dead-letter.js` повертає лише `eventType`/
`timestamp`/`status` для кожної події, не сам payload).

## Команда dry-run (обов'язково перед execute)

```bash
python3 tools/ops_cli.py dead-letter replay --workflow-id <id>
```

Без `--execute` це ЗАВЖДИ dry-run (з цього циклу — раніше
`replay-workflow.js` виконував одразу, виправлено). Показує:
`currentStatus`, `sourceEventFound`, `predictedAction` (чи створить
новий контакт, чи позначить дублем), і чи піде email. Жодного
`appendEvent`/mutation.

## Команда виконання

```bash
python3 tools/ops_cli.py dead-letter replay --workflow-id <id> --execute
```

## Expected output

Dry-run: `{"ok":true,"dryRun":true,"currentStatus":"dead_letter",...,"predictedAction":"..."}`.

Execute: `{"ok":true,"status":"manually_replayed"}` (успіх) або
`{"ok":false,"status":"dead_letter"}` (replay сам провалився — durable
шар усе ще недоступний, ескалувати до `blob-failure.md`).

Повторний виклик ПІСЛЯ успіху повертає
`{"ok":true,"alreadyDone":true,"status":"manually_replayed","dryRun":...}`
— replay ідемпотентний, не дублює side effect (`TERMINAL_SUCCESS_STATES`
перевіряється до будь-якого mutation).

## Verification

```bash
python3 tools/ops_cli.py dead-letter inspect --workflow-id <id>
```

`status` має бути `manually_replayed`. Для lead-workflow додатково:
`crm-lookup.js?email=...` (authenticated) показує оновлений контакт.

## Rollback

Replay не має "відкату" в сенсі скасування — але й не незворотній:
оригінальна подія (`lead_submitted`/`support_request_created`/тощо)
лишається immutable в `automation-events`, тому стан завжди можна
перебудувати заново (`docs/runbooks/projection-rebuild.md`). Якщо
replay створив НЕБАЖАНИЙ результат (напр. email пішов комусь, кому не
мав) — це не технічна відкатна дія, а `docs/runbooks/security-incident.md`
(комунікація з отримувачем), не replay-механізм.

## Owner communication

HIGH severity (dead_letter) — повідомити власника одразу (канал —
O-08, зараз лише structured log). MEDIUM (stale retry_scheduled) —
можна дочекатись щоденного `tools/ops_cli.py report`.

## STOP conditions

- `sourceEventFound: false` — не replay-ити наосліп, ескалувати
  (можлива втрата даних в іншому шарі, не просто "спробувати ще раз").
- `status: "cancelled"` — 409, replay навмисно заблокований, спершу
  з'ясувати ЧОМУ скасовано, не форсувати.
- Dry-run показує `predictedAction`, що виглядає неочікувано (напр.
  "would create new contact" для email, який точно вже мав бути
  контактом) — зупинитись, перевірити `crm-lookup`/`ops-projections-audit`
  перед execute.

## Cancel (замість replay, коли відновлювати не потрібно)

```bash
python3 tools/ops_cli.py dead-letter cancel --workflow-id <id> --reason-code <причина>
```

НЕ видаляє оригінальну подію, лише позначає workflow `cancelled` і
пише `reasonCode`. Використовувати, коли з'ясовано, що подія не мала
оброблятись (напр. тестовий запис) — не як "швидкий спосіб позбутись
dead-letter" без розбору причини.

## Пов'язані owner blockers

O-06 (production-grade admin auth), O-08 (owner alert channel — для
негайного сповіщення про dead_letter).
