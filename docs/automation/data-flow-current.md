# Data flow — фактичний стан (не бажаний)

Станом на 2026-07-13 (DATA TRUTH циклу). Кожен рядок — те, що код РЕАЛЬНО
робить зараз, перевірено читанням `netlify/functions/*.js`, не
припущенням про архітектуру. Джерело правди для `privacy.html` —
цей документ, не навпаки.

| Trigger | Дані | Первинне приймання | Durable store | Projection | Logs | Backup | External recipient |
|---|---|---|---|---|---|---|---|
| Lead checklist form (обидві версії, hero + `#lead-form`) | name, email, telegram(опц.), product_type, UTM×4, referrer | Netlify Forms (нативне, `data-netlify="true"`) | `automation-events` (Blobs), event `lead_submitted`→`contact_created` | `projection-contacts` (Blobs), кеш поточного стану контакту | `_lib/logger.js` structured JSON (Netlify Function logs) | `tools/ops_cli.py backup` (local/mock, вручну) | Жодного — `EMAIL_MODE=sink` записує "would send", не надсилає |
| Package-interest (клік на product-preview картці) | interestedProduct (без нової форми — це вже частина lead-контакту) | Те саме, що lead | Те саме (`interest_recorded` event) | Те саме | Те саме | Те саме | Жодного |
| VIP intake (`vip-trigger.js`→`vip-intake.js`) | email, order/test-entitlement джерело, niche/product/offer (intake) | POST до `vip-trigger.js` (order-validated чи admin test) | `automation-events`, `entity_type: vip_workflow` | Немає окремого projection — стан читається прямим fold events (`vip-status.js`) | structured log | `ops_cli.py backup` (entityType=vip_workflow) | Жодного |
| Support request (`support-submit.js`) | email, category, description | POST з `automation-test.html` (внутрішня QA-сторінка, noindex) чи будь-якого клієнта | `automation-events`, `entity_type: support_request` | Немає окремого — fold напряму | structured log | `ops_cli.py backup` | Жодного |
| Refund request (`refund-submit.js`) | email, orderId, reason, description | POST, потребує існуючий sandbox order | `automation-events`, `entity_type: refund_request` | Немає окремого | structured log | `ops_cli.py backup` | Жодного |
| Test order (`create-order.js`) | email, packageId, consent snapshot | POST, лише якщо `CHECKOUT_MODE != disabled` (зараз ЗАВЖДИ `disabled` на production) | `checkout-orders` (Blobs, окремий стор від automation-events) | Немає | structured log | НЕ покрито `ops_cli.py backup` (окремий store, поза scope Owner Operations циклу) | Жодного |
| Mock payment (`simulate-pay.js`) | eventId, orderId, action (paid/refund) | POST, `CHECKOUT_MODE=mock` gate | `checkout-webhook-events` (dedup) + мутує `checkout-orders` + `checkout-audit-log` | Немає | structured log | Не покрито | Жодного |
| Status polling (`support-status`/`refund-status`/`vip-status`/`order-status`) | possession of random UUID | GET, публічний | READ-ONLY, нічого не пише | — | structured log лише на помилку | — | — |
| Owner operations (`tools/ops_cli.py`) | Агреговані лічильники (report) чи повний export (backup) | Authenticated GET/POST до `ops-*.js` | READ-ONLY для report/audit; `ops-events-restore.js` пише лише в ІЗОЛЬОВАНИЙ `automation-events-restore-drill` | — | structured log | `.local/` (gitignored, локальна машина оператора) | Жодного |
| Backup (`tools/ops_cli.py backup`) | Повний event payload (реальний PII) 4 entityType: contact/support_request/refund_request/vip_workflow | GET `ops-events-export.js` | Читає `automation-events`, пише локально | — | structured log | `.local/backups/<ts>/` (gitignored) | Жодного |

## Явно НЕ підключено (не описувати як активне в Privacy)

- **CRM provider** (зовнішній) — `CRM_MODE=mock`, `_lib/adapters/crm.js` не викликається як write-path (застаріла з попереднього циклу, лишена для сумісності, event-sourcing замінив її роль).
- **Email provider** (зовнішній) — `EMAIL_MODE=sink`, `_lib/adapters/email.js#sendTransactional` записує подію "would send", жодного реального листа.
- **Analytics** (GA4/Meta Pixel) — `ANALYTICS_MODE=debug`, `js/analytics-config.js`/`js/analytics.js` існують у коді, але жодного реального provider ID не підключено (O-17 у попередніх циклах, зараз частина O-15 "GA4/Pixel", не отримав окремого ID у канонічній таблиці).
- **Payment provider** — не обрано, `CHECKOUT_MODE=disabled` на production.
- **Calendar provider** — не підключено (O-12).

## Дві окремі системи зберігання — не одна

**Критично для Privacy-точності:** цей проєкт має ДВІ незалежні Blobs-groups
даних, не одну:
1. `automation-events` + `projection-contacts` + `duplicate-reconciliation` +
   `workflow-status` — lead/support/refund/VIP-workflow контур (Owner
   Operations цикли).
2. `checkout-orders` + `checkout-webhook-events` + `checkout-audit-log` —
   sandbox checkout контур (payment-readiness цикл, значно старіший,
   `CHECKOUT_MODE=disabled` завжди на production).

Privacy МАЄ згадувати "Netlify Blobs" явно (не лише "Netlify Forms") —
поточний текст (до цього циклу) називає лише Netlify Forms, що
фактично неточно з моменту event-sourcing переходу (AUTOMATION
OPERATIONS цикл).

## Test/synthetic дані

Усі синтетичні записи, створені під час цього й попередніх циклів для
тестування, позначені email-доменом `@example.com` чи префіксом `qa-`
— НЕ реальні клієнтські дані. Жодного механізму автоматичного
видалення test-даних не існує (низький пріоритет — обсяг мізерний,
Blobs-об'єкти без TTL).
