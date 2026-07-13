# Data-integrity invariants

Машинно перевірювані інваріанти. Кожен рядок нижче має відповідний
код-check у `tools/data_integrity_cli.py` і принаймні один fixture у
`tools/fixtures/` (позитивний і/або негативний), прогнаний через
`python3 tools/data_integrity_cli.py self-test` — 10/10 PASS,
перевірено локально й у CI (`.github/workflows/ci.yml`).

## Загальні (усі event-based ledgers)

| Invariant | Перевірка | Fixture |
|---|---|---|
| Кожен event має унікальний `event_id` | `data-integrity` | `events-duplicate.jsonl` (негативний) |
| Кожен event має `schema_version` | `data-integrity` | відсутність поля → fail loud |
| Timestamp — валідний UTC ISO-8601 | `data-integrity`, regex `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$` | `events-valid.jsonl` (позитивний) |
| Невідома schema version → fail loud | `data-integrity` + `ops-projections-audit.js` (production-код) | `events-unknown-schema.jsonl` (негативний) |
| Immutable event не перезаписується | Структурно: `appendEvent()` використовує `setIfAbsent`, ніколи `setJSON` напряму на існуючий ключ (перевірено читанням `_lib/events.js`) | Немає fixture-тесту (структурна гарантія коду, не runtime-перевірка) |
| Projection посилається на source events, що реально існують | `projection-links` | `events-valid.jsonl` (позитивний) / орфан lastEventId (негативний) |
| Projection не новіша за останній source event | Структурно: `projectContact()` — чиста фолд-функція з тих самих events, не може "випередити" вхідні дані | — |
| Missing source event → audit failure | `projection-links` (той самий механізм: lastEventId, що не знайдено у стрімі) | Орфан-фікстура вище |
| Test records мають явний marker | Конвенція: `@example.com`/`qa-*` префікс (не машинна перевірка, документована практика) | — |
| Public status token не походить із PII | Структурно: `crypto.randomUUID()` для публічних ID, окремо від контентного sha256-хешу (`_lib/request-dedup.js`) | — |

## Contact/lead

| Invariant | Перевірка | Fixture |
|---|---|---|
| Email нормалізований однаково | `_lib/adapters/crm.js#normalizeEmail` (production-код, той самий виклик усюди) | — |
| Service processing не змінює marketing consent | `consent` | `events-valid.jsonl` (позитивний: not_collected лишається not_collected) |
| `not_collected` не переходить у `granted` без consent event | `consent` | `events-consent-violation.jsonl` (негативний) |

## Orders/payments (§16 повний список — статус кожного)

| Invariant | Статус |
|---|---|
| Amount в єдиному точному форматі | ✅ `amountUah` — ціле число, хоч і без явного minor-units/major-units розрізнення (UAH зазвичай ціле число копійок не вимагає для цього продукту) |
| Currency обов'язкова | ⚠️ GAP — `currency` не є explicit полем, implicit через назву `amountUah`. Задокументовано в `ledger-contracts.md`, обов'язково закрити до O-02 |
| gross_amount окремо | ⚠️ GAP — немає розділення gross/fee/tax/net, лише один `amountUah`. Немає реального provider з fee-даними ще |
| provider_fee окремо | ⚠️ GAP (те саме) |
| tax_amount окремо | ⚠️ GAP (те саме) |
| refund_amount окремо | ✅ Додано цього циклу — `refundAmountUah` поле, `isRefundAmountValid()` |
| Сума refunds не більша за captured gross | ✅ `financial-invariants` перевірка + unit-тест `isRefundAmountValid` + production-код (`webhook-processor.js`) |
| Один provider event ID обробляється один раз | ✅ `markEventOnce()` + unit-тестовано минулими циклами |
| Один paid order — не більше одного активного entitlement | ✅ Структурно: `order.status` — єдине поле стану, не може бути одночасно "paid" і мати другий незалежний entitlement-запис (модель одне замовлення = один entitlement за конструкцією, немає окремої entitlement-таблиці) |
| Delivery можлива лише після verified payment event | ✅ `download.js`: `order.status !== "paid"` → 403 |
| Redirect success не змінює payment status | ✅ Немає жодного коду, що читає query-параметри редиректу для зміни статусу — лише `webhook.js`/`simulate-pay.js` через `processWebhookEvent` |
| Mock payment не змішується з production ledger | ✅ Один і той самий `checkout-orders` стор, АЛЕ `CHECKOUT_MODE=disabled` на production означає mock ніколи не виконується там узагалі (weaker guarantee — немає окремого namespace, покладається на mode-gate, не на ізоляцію сховища) |
| Environment обов'язковий | ⚠️ Частково — `order.mode` записується (`getMode()` на момент створення), але немає explicit перевірки "sandbox-подія не може оновити live-order" чи навпаки |

## Refund (§16)

| Invariant | Статус |
|---|---|
| Refund request ≠ refund execution | ✅ `refund-submit.js` завжди `status: owner_review`, ніколи не виконує реальне повернення |
| Approved request не означає provider success | ✅ Немає автоматичного зв'язку між `refund_request` (automation-events) і `refunded` (checkout-orders) — це навмисно ДВІ окремі речі |
| Provider refund event має окремий ID | ✅ `eventId` на webhook-рівні, окремий від `refund_request`'s `requestId` |
| Повторний refund event не збільшує суму двічі | ✅ Цього циклу додано: `order.status === "refunded"` check → idempotent no-op, не повторне зарахування |
| Refund entitlement policy не вигадується кодом | ✅ O-13 лишається OPEN, код не приймає рішення за власника |

## Самотест

```bash
python3 tools/data_integrity_cli.py self-test
```

Останній прогін: 10/10 PASS (усі позитивні fixture чисті, усі негативні
коректно виявлені).
