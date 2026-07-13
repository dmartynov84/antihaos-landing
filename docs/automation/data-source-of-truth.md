# Canonical data sources

Для кожної сутності — де ПРАВДА, де похідна projection/кеш, і яке
джерело ЗАБОРОНЕНО вважати правдою (навіть якщо воно "виглядає
правильним").

| Сутність | Канон | Projection | Cache | Заборонене джерело |
|---|---|---|---|---|
| Contact | `automation-events` (`entity_type: contact`) | `projection-contacts` (rebuildable, `_lib/projections.js#projectContact`) | Немає окремого HTTP-кешу | Пряме читання застарілого `_lib/adapters/crm.js` mutation-шляху (не write-path з AUTOMATION OPERATIONS циклу) |
| Consent (service/marketing) | `consent_recorded`/`marketing_consent_recorded` events усередині contact-стріму | `projection-contacts.consentStatus`/`.marketingConsentStatus` | — | Значення в браузері/formulярі (клієнт міг щось локально показати, це НЕ доказ згоди — доказ лише event) |
| Lead stage | `lead_stage_changed` events | `projection-contacts.stage` | — | Будь-яке зовнішнє CRM (не підключено) |
| Support case | `automation-events` (`entity_type: support_request`) | Немає окремого — `support-status.js` читає events напряму, fold on-the-fly | — | — |
| Refund request | `automation-events` (`entity_type: refund_request`) | Немає окремого | — | Redirect success URL (НІКОЛИ не доказ оплати чи повернення — checkout-контур окремий) |
| VIP workflow | `automation-events` (`entity_type: vip_workflow`) + `_lib/vip-state-machine.js` | Немає окремого | — | — |
| Order (sandbox) | `checkout-orders` (Blobs, read-modify-write) | — | — | Frontend-заявлена ціна (сервер завжди звіряє з `_lib/products.js` каталогом) |
| Payment event | `checkout-webhook-events` (dedup за eventId) | Мутує `checkout-orders.status` | — | **Browser success URL redirect — ніколи не доказ оплати** (перевірено кодом: `download.js` перевіряє `order.status === "paid"`, не query-параметр) |
| Entitlement | `checkout-orders.status === "paid"` | — | Signed download token (`download.js`) | Сам факт наявності token URL (token підписаний, але перевірка статусу все одно йде проти order) |
| Delivery record | `checkout-audit-log` (append-only) | — | — | — |
| Owner blocker | `docs/owner-blockers.md` (канонічний реєстр) | — | — | Усний опис у чаті без запису в файл |
| Dead-letter/retry стан | `workflow-status` Blobs store | — | — | Netlify Function logs (корисні для діагностики, але НЕ канон стану — можуть бути обрізані/ротовані) |
| Duplicate-reconciliation рішення | `duplicate-reconciliation` Blobs store | — | — | — |

## Проекції НІКОЛИ не є джерелом правди для фінансових рішень

`projection-contacts` та будь-яка інша projection (support/refund/VIP
fold) — зручні для READ, але при розбіжності з events завжди
перебудовуються з events, не навпаки (`ops-projections-audit.js`,
`docs/runbooks/projection-rebuild.md`). Для `checkout-orders` це
особливо критично: сам запис у Blobs МАЄ мутуватись (read-modify-write,
не append-only, на відміну від `automation-events`), тому єдиний
захист від втраченого update — `checkout-webhook-events` dedup-шар,
що не дає одному й тому самому provider-event застосуватись двічі.
