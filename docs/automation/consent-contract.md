# Consent contract

## Service processing ≠ marketing consent

Кожна форма на сайті (lead checklist, support, refund, VIP intake)
запускає SERVICE processing (надіслати чекліст, опрацювати заявку,
відповісти на звернення) — це НЕ маркетингова згода. Жодна дія на
сайті не переводить `marketingConsentStatus` у `"granted"` без
окремого, явного consent-event.

## Поточний стан (Варіант A, обраний цим циклом)

- Жодна форма не має чекбокса маркетингової згоди.
- `marketingConsentStatus` завжди `"not_collected"` для кожного нового
  контакту (`_lib/lead-processor.js`, хардкод, не змінний конфігом).
- Lead-форма (§13 завдання) more раніше обіцяла "корисні матеріали" —
  виправлено цього циклу на точний опис ("надішлемо чекліст на
  вказаний email"), без обіцянки продовження.
- Жодна маркетингова розсилка НЕ надсилається нікому (`EMAIL_MODE=sink`).

## Машинна перевірка

`tools/data_integrity_cli.py consent <events.jsonl>` — перевіряє, що
жоден контакт не має `marketingConsentStatus: "granted"` без
відповідного `marketing_consent_recorded` event у власному стрімі.
Fixture: `tools/fixtures/events-consent-violation.jsonl` (негативний
тест, підтверджено виявляється).

## Якщо колись з'явиться Варіант B (окремий checkbox)

Per §13 завдання, вимоги при впровадженні:
- unchecked за замовчуванням;
- окремий від Privacy/service processing чекбокса;
- НЕ блокує отримання чекліста;
- зберігати: exact consent text, version, timestamp, source, status;
- НЕ активувати `EMAIL_MODE=live`/marketing sequence лише через факт
  чекбокса — це окреме, подальше рішення (O-15 лишається OPEN до
  явного підтвердження власника/юриста).

Це рішення НЕ ухвалено цим циклом — Варіант A лишається чинним.

## Пов'язані owner blockers

O-15 (Marketing consent UI), O-01 (юридична перевірка тексту, якщо
Варіант B колись реалізується).
