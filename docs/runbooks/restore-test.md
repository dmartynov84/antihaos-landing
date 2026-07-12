# Runbook: Restore drill (synthetic data only)

## Призначення

Перевірити, що backup дійсно відновлюваний — не просто "файл
існує", а "дані з нього реально повертаються в робочий стан" — на
синтетичних даних, в ізольованому сторі.

## Симптоми, що виправдовують запуск

- Плановий періодичний drill (рекомендовано власником, не
  автоматизовано — `docs/automation/scheduled-jobs.md`).
- Після зміни формату backup/events (schema version) — перевірити,
  що restore досі працює на новому форматі.
- Перед тим, як покладатись на backup для реального інциденту.

## Severity

**N/A для самого drill** (профілактична дія на synthetic-даних, не
production incident response). Якщо drill ПРОВАЛЮЄТЬСЯ — це MEDIUM
знахідка (backup-механізм ненадійний, з'ясувати до того, як він
знадобиться насправді).

## Prerequisites

`ADMIN_TOKEN`, тестові дані з явним маркером (`qa-*@example.com` —
той самий маркер, що використовувався в AUTOMATION OPERATIONS циклі).
**НІКОЛИ не використовувати реальні клієнтські дані для drill.**

## Безпечна діагностика / dry-run

Checksum-верифікація ВБУДОВАНА в сам restore-drill як fail-closed
gate (не окрема команда) — `tools/ops_cli.py restore-drill` без
`--skip-checksum-verification` ЗАВЖДИ спершу звіряє checksum і
eventCount проти `manifest.json`, ДО будь-якого мережевого виклику.
Перевірено 4 негативними тестами локально цього циклу (missing
manifest / corrupted checksum / eventCount mismatch — усі коректно
зупиняють виконання).

## Сценарій drill

1. Створити synthetic support-заявку (позначену `qa-`):

```bash
curl -s -X POST https://zapuskbiznesu.netlify.app/.netlify/functions/support-submit \
  -H "Content-Type: application/json" \
  -d '{"email":"qa-restore-drill@example.com","category":"general","description":"synthetic restore drill data","clientRequestId":"restoredrilltest1234"}'
```

2. Зробити backup:

```bash
python3 tools/ops_cli.py backup
```

3. Перевірити checksums (див. `backup-failure.md` verification-блок).

4. Відновити в ізольований стор:

```bash
python3 tools/ops_cli.py restore-drill --file .local/backups/<ts>/support_request.jsonl
```

5. Перевірити, що дані реально там:

```bash
python3 tools/ops_cli.py restore-verify
```

## Таблиця Check/Expected/Actual/Status

Заповнюється під час фактичного прогону (шаблон):

| Check | Expected | Actual | Evidence | Status |
|---|---|---|---|---|
| Backup створено | 4 файли + manifest | | вивід `ops_cli.py backup` | |
| Checksum кожного файлу збігається | усі OK | | Python-скрипт з `backup-failure.md` | |
| Restore-drill із валідним backup | `restored: N` | | вивід `restore-drill` | |
| `restore-verify` показує ключ | ключ присутній | | вивід `restore-verify` | |
| Email/CRM/provider НЕ викликались | 0 side effects | | `ops-events-restore.js` не імпортує `adapters/email.js`/`adapters/crm.js` mutation functions (перевірено читанням коду) | |

## Обов'язкові негативні тести (виконано локально цього циклу)

| Тест | Очікування | Результат |
|---|---|---|
| Відсутній `manifest.json` | FAIL CLOSED до мережевого виклику | ✅ Підтверджено |
| Пошкоджений checksum (дописаний рядок у .jsonl) | FAIL CLOSED, показує expected vs actual | ✅ Підтверджено |
| `eventCount` у manifest не збігається з фактичним | FAIL CLOSED | ✅ Підтверджено |
| Валідний checksum, але сервер fail-closed (немає реального `ADMIN_TOKEN`) | Checksum OK друкується, ПОТІМ мережева 503 | ✅ Підтверджено — демонструє, що checksum-гейт спрацьовує ДО мережевого виклику, а не замінює серверну авторизацію |

## ВІДОМЕ ОБМЕЖЕННЯ цього циклу

**Повний end-to-end drill (крок 4-5, реальний виклик `ops-events-
restore.js` з дійсним `ADMIN_TOKEN`) НЕ виконано** — заблоковано
відсутністю `ADMIN_TOKEN` на Netlify (O-06). Перевірено:
- checksum-гейт (client-side, повністю)
- fail-closed поведінка сервера без токена (503)
- код `ops-events-restore.js` вручну (пише лише в ізольований
  `automation-events-restore-drill` стор, hardcoded назва, не параметр)

НЕ перевірено живим тестом: чи `ops-events-restore.js` дійсно коректно
записує події в ізольований стор і чи `restore-verify` дійсно їх бачить
(read-lag того самого класу, що знайдено минулими циклами, теоретично
міг би вплинути й тут). Owner action item: після встановлення
`ADMIN_TOKEN` прогнати кроки 1-5 цього runbook і заповнити таблицю
вище фактичними значеннями.

## Rollback

Restore-drill пише ЛИШЕ в `automation-events-restore-drill` (окремий
Blobs-стор, hardcoded на бекенді) — production `automation-events`
недосяжний з цього шляху структурно. "Rollback" не потрібен: очистити
тестовий стор можна повторним запуском з іншими даними (перезапис за
тим самим ключем) — видалення старих ключів не реалізовано (низький
пріоритет, ізольований тестовий стор, не production).

## Owner communication

Плановий drill не потребує alert. Провалений drill — MEDIUM, включити
в наступний review.

## STOP conditions

- НІКОЛИ не запускати цей сценарій з реальними клієнтськими даними.
- Якщо checksum verification колись пропущено (`--skip-checksum-
  verification` використано) — STOP, з'ясувати ЧОМУ команда взагалі
  була потрібна, перш ніж продовжувати.

## Пов'язані owner blockers

O-06 (admin auth — блокує повний end-to-end прогін), O-07 (independent
backup storage — це drill на local/mock backup, не на незалежному
production сховищі, якого ще не існує).
