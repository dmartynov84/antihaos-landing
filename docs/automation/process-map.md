# Process map — фактичний стан на 2026-07-12 (HEAD `4edcc04`)

Побудовано за реальним кодом репозиторію (grep + читання файлів), не за
уявним ідеалом. "До" = що є зараз без правок цього циклу. "Після" = що
додав цикл ANTIHAOS AUTOMATION OS (Етап 1-3). Усе, що не позначено
"Після" — свідомо не чіпалось цього циклу (див. `docs/owner-blockers.md`
і фінальний звіт для причини).

| ID | Процес | Trigger | Input | Система | Output | Retry | Owner alert | Status (до) | Status (після) |
|---|---|---|---|---|---|---|---|---|---|
| P-01 | lead form submitted (hero, email-only) | POST на `lead-checklist-mobile` (Netlify native forms, перехоплено `js/form-submit.js` через fetch) | email, utm_*, honeypot | Netlify Forms (нативне сховище) | redirect на `/thanks` | немає | немає | ручний перегляд у Netlify UI | + `submission-created.js`: normalize/dedup email → mock CRM, email sink event, structured log |
| P-02 | lead form submitted (full, name+email+telegram+product_type) | POST на `lead-checklist` | name, email, telegram?, product_type?, utm_*, honeypot | те саме | те саме | немає | немає | те саме | те саме (той самий `submission-created.js` обробляє обидві форми за `form_name`) |
| P-03 | lead magnet requested | наслідок P-01/P-02 | — | статичний PDF на Netlify (публічний, вже задеплоєний) | завантаження чекліста | — | — | працює (файл публічний, підтверджено раніше) | без змін |
| P-04 | product detail opened (матриця/калькулятор/план/prodocs) | клік `.product-trigger` | — | client-side JS (`js/product-detail.js`), дані з `js/product-data.js` | inline-панель | — | — | працює (SITE-1.14 цикл) | аналітична подія НЕ додана цього циклу (owner blocker: analytics provider) |
| P-05 | problem card opened | клік `[data-link-product]` | — | те саме | скрол+відкриття відповідної панелі | — | — | працює | те саме |
| P-06 | package viewed (Starter/Pro/VIP сторінки) | навігація | — | статичні сторінки | — | — | — | працює | без змін |
| P-07 | checkout started (sandbox) | submit `checkout-test.html` | packageId, email, consent | `create-order.js` | order pending, `amountUah` з сервера | немає (клієнт сам ретраїть) | немає | збудовано попереднім циклом | без змін цього циклу |
| P-08 | checkout abandoned | немає webhook протягом TTL | — | — | order лишається `pending` назавжди | — | — | не реалізовано | **не реалізовано** (owner blocker: потрібен scheduled cleanup, Етап 4+) |
| P-09 | order created | `create-order.js` success | — | Netlify Blobs `checkout-orders` | order record | — | — | реалізовано | без змін |
| P-10 | payment successful (mock/sandbox) | `webhook.js` / `simulate-pay.js`, `type:"payment_succeeded"` | signed event | `webhook-processor.js` | order→paid, download tokens, audit | idempotent (немає retry — подія одноразова за конструкцією) | немає | реалізовано | без змін |
| P-11 | webhook duplicate | той самий `eventId` вдруге | — | `markEventOnce` (Blobs `onlyIfNew`) | 200 `{deduped:true}`, нуль повторної обробки | n/a | немає | реалізовано, перевірено логічно (не наживо — CHECKOUT_MODE=disabled) | без змін |
| P-12 | delivery successful | наслідок P-10 | — | `issueDownloadToken` + `download.js` | signed token, файл-заглушка | немає | немає | реалізовано (лише sandbox-заглушка, не реальні файли) | без змін |
| P-13 | delivery failed | помилка Blobs при видачі токена | — | необроблений виняток → 500 | — | — | — | **не оброблено явно** | не реалізовано (Етап 4+: явний retry/dead-letter для delivery) |
| P-14 | download opened | GET `/download?token=` | token | `download.js` | файл або 401/403 | — | — | реалізовано | без змін |
| P-15 | refund (mock) | `simulate-pay` `action:"refund"` | orderId | `webhook-processor.js` | order→refunded, майбутні download 403 | — | немає | реалізовано | без змін |
| P-16 | VIP booking requested | — | — | — | — | — | — | **не існує** (VIP сторінка — статичний опис + mailto) | не реалізовано цього циклу (Етап 6) |
| P-17 | support request | — | — | — | — | — | — | **не існує** (лише mailto на всіх сторінках) | не реалізовано цього циклу (Етап 6) |
| P-18 | refund request (реальний, не mock) | — | — | — | — | — | — | **не існує** (лише mailto, вручну) | не реалізовано цього циклу (Етап 6) |
| P-19 | unsubscribe | — | — | — | — | — | — | **не існує** — маркетингових розсилок ще немає взагалі | не реалізовано (Етап 3+, залежить від O-12) |
| P-20 | data deletion request | — | — | — | — | — | — | описано текстом на privacy.html (лист на email), процесу немає | не реалізовано |
| P-21 | automation failure | — | — | — | — | — | — | немає структурованого логування взагалі | + `_lib/logger.js` (структуровані JSON-логи для P-01/02 цього циклу; решта процесів — Етап 4+) |
| P-22 | daily owner digest | — | — | — | — | — | — | `tools/ops_cli.py report` (локально, вручну) | реалізовано частково цього циклу — див. `docs/automation/owner-operations.md`; автоматична доставка потребує O-08 (канал сповіщень) |

## Що це означає практично

- **Уже автоматизовано й перевірено на проді**: доставка лід-магніту (файл публічний, форми відправляються).
- **Уже автоматизовано, перевірено логічно, не наживо**: увесь sandbox-checkout контур (P-07…P-15) — код є, деплой є, `CHECKOUT_MODE=disabled` за замовчуванням підтверджено curl-ом на проді; end-to-end прогін вимагає секретів, яких асистент не може встановити (Netlify dashboard).
- **Додано цим циклом**: P-01/P-02 отримали реальну автоматизацію (mock CRM upsert + dedup + email-sink подія + структурований лог) через нативний Netlify `submission-created.js` hook — без жодної зміни існуючого HTML/JS форм.
- **Свідомо не зроблено цим циклом**: VIP-workflow, support-тікети, реальний refund-процес, unsubscribe, daily digest, owner dashboard, CI/CD gates, backup/recovery runbooks. Причина не «забув», а: (а) кожен із них потребує owner-рішення (провайдер CRM/email/calendar), яке асистент не має права вигадувати; (б) спроба зробити все за один цикл суперечила б власній вимозі завдання «не робити один гігантський commit» і ризикувала б недоперевіреним кодом там, де вже раз (payment-readiness цикл) знайдено реальний баг лише завдяки уважному, повільному рев'ю.
