# Runbook: Disable all automations

## Призначення

Швидко зупинити ВЕСЬ automation-контур (lead/support/refund/VIP), коли
щось пішло серйозно не так і потрібен час на діагностику без нових
подій, що додають шум чи ризик.

## Симптоми, що виправдовують disable

- Підозра на security-інцидент (`security-incident.md`).
- Масове дублювання/некоректні дані від automation, причина ще не
  зрозуміла.
- Blobs-збій, який робить будь-яку обробку непередбачуваною (не просто
  повільною — `blob-failure.md` для звичайного degraded-режиму).

## Severity

**CRITICAL** — це найгрубіший інструмент у контурі, зупиняє прийом
НОВИХ lead/support/refund/VIP заявок сайтом. Використовувати лише коли
менш різкі дії (окремий workflow cancel, dead-letter replay) не
підходять.

## Prerequisites

Доступ до Netlify dashboard (env vars) АБО можливість власника внести
зміну — асистент не може сам змінити Netlify env vars.

## Безпечна діагностика (перед вимкненням)

```bash
curl -s https://zapuskbiznesu.netlify.app/.netlify/functions/health
python3 tools/ops_cli.py report
```

Зрозуміти масштаб ПЕРЕД тим, як вимикати — health/report самі по собі
нешкідливі read-only виклики.

## Команда (dry-run еквівалент)

Немає окремого "dry-run" для disable — сама дія є конфігураційною
зміною env var, не викликом endpoint. "Dry-run" тут = перевірити
ПОТОЧНЕ значення перед зміною:

```bash
curl -s https://zapuskbiznesu.netlify.app/.netlify/functions/health | python3 -m json.tool
```

(`components.checkout` вже показує `disabled` за замовчуванням —
checkout ЗАВЖДИ вимкнений, доки `CHECKOUT_MODE`/`CHECKOUT_LIVE_UNLOCK`
не встановлені разом. Цей runbook — про AUTOMATION_MODE, окремий
перемикач.)

## Команда виконання

На Netlify (Site settings → Environment variables):

```
AUTOMATION_MODE=disabled
```

`_lib/automation-mode.js#getAutomationModes()` читає це значення без
кешування коду — застосовується одразу на наступний виклик функції
(Netlify Functions — stateless, немає перезапуску сервера, що
потрібно чекати).

## Expected output

Після зміни: `support-submit.js`/`refund-submit.js`/`vip-trigger.js`
повертають `503 {"error":"automation_disabled"}` на будь-який запит.

`submission-created.js` (lead) поводиться інакше, але так само
безпечно: перевіряє `AUTOMATION_MODE` НАЙПЕРШИМ рядком (навіть до
парсингу payload) і повертає `200` без запису (Netlify platform event
handler — немає client, що чекає код відповіді, підтверджено пошуком
документації минулого циклу) — лід під час disabled взагалі НЕ
потрапляє в `automation-events`, не queued на потім. Це свідоме,
консервативніше рішення для lead, ніж 503 для support/refund/VIP
(де є реальний client, якому має сенс показати помилку) — не gap,
перевірено читанням `submission-created.js:24-31` цього runbook.

## Verification

```bash
curl -s -X POST https://zapuskbiznesu.netlify.app/.netlify/functions/support-submit \
  -H "Content-Type: application/json" \
  -d '{"email":"qa-disable-check@example.com","category":"general","description":"verify disable works"}'
```

Очікується `503 automation_disabled`.

## Rollback (повернення до нормальної роботи)

```
AUTOMATION_MODE=mock
```

(чи `sandbox`/`live` — залежно від контексту; `mock` — поточний
безпечний дефолт для всього циклу).

## Owner communication

Це CRITICAL дія — власник МАЄ бути залучений до рішення про disable
(не одностороннє рішення асистента без підтвердження в поточній
розмові — узгоджено з CLAUDE.md "Ніяких автоматичних торгових дій").

## STOP conditions

- Не вимикати automation через цей runbook як реакцію на звичайний
  dead-letter (для цього — `dead-letter-replay.md`, набагато вужчий
  інструмент).
- Не вимикати без документованої причини в owner-звіті/git-коміті
  (навіть якщо зміна відбувається через Netlify UI, не git).

## Пов'язані owner blockers

O-06 (admin auth — сама Netlify dashboard-зміна поза цим контуром
взагалі), O-08 (owner alert — про сам факт disable мав би прийти
alert, зараз лише structured log при наступному запиті).
