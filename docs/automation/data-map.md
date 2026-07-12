# Data map

Фактичні дані, які система збирає чи зберігає, станом на 2026-07-12.
Retention-строки НЕ вигадані — де власник/юрист ще не підтвердив строк,
позначено `OWNER BLOCKER — DATA RETENTION POLICY` (те саме, що O-11 у
`docs/owner-blockers.md`).

| Data | Source | Purpose | Storage | Retention | Access | Delete flow |
|---|---|---|---|---|---|---|
| Email (lead-checklist-mobile) | Hero-форма, `index.html` | Надіслати чекліст, зв'язатись щодо пакета | Netlify Forms (нативне) + (цей цикл) mock CRM у Netlify Blobs `crm-contacts` | **OWNER BLOCKER — DATA RETENTION POLICY** | Власник через Netlify UI; Blobs — лише через функції з доступом до сайту | Немає автоматизованого flow; вручну через Netlify UI (Forms) і `docs/runbooks/` (Blobs — не написано цього циклу) |
| Ім'я, email, Telegram (опц.), тип продукту (lead-checklist) | Повна форма, `#lead-form` | Те саме + сегментація за типом продукту | Те саме | **OWNER BLOCKER — DATA RETENTION POLICY** | Те саме | Те саме |
| UTM-параметри (source/medium/campaign/content) + referrer | `js/utm.js`, приховані поля форм | Атрибуція джерела заявки | Разом із контактом (Forms + mock CRM) | Прив'язана до retention контакту | Те саме | Те саме |
| Email + orderId (sandbox checkout) | `checkout-test.html` → `create-order.js` | Ідентифікація замовлення, доказ згоди | Netlify Blobs `checkout-orders` | Не визначено (sandbox-дані, не реальні клієнти) | Лише функції | Немає — sandbox, не реальні персональні дані клієнтів (сторінка explicitly позначена як тестова) |
| `consentTextSnapshot`, `offerVersion`, `refundVersion` (order) | `create-order.js` | Доказ, яку саме версію умов бачив покупець на момент згоди | Netlify Blobs `checkout-orders` | Прив'язана до order | Лише функції | — |
| Webhook event ID (dedup) | `webhook.js` / `simulate-pay.js` | Ідемпотентність, захист від replay | Netlify Blobs `checkout-webhook-events` | Не визначено (технічний артефакт, не PII) | Лише функції | — |
| Audit log записи (order lifecycle) | `_lib/webhook-processor.js`, `download.js` | Розслідування інцидентів, доказ дій системи | Netlify Blobs `checkout-audit-log` | Не визначено | Лише функції (у майбутньому — owner dashboard, Етап 7) | — |
| **IP-адреса** | — | — | **НЕ збирається ніде в цьому контурі** | n/a | n/a | n/a |
| **Платіжні дані (номер картки, CVV)** | — | — | **НЕ приймаються й НЕ зберігаються ніде** — оплата завжди в mock/sandbox | n/a | n/a | n/a |
| **Marketing consent** | — | — | **НЕ збирається** — жодна з двох lead-форм не має чекбокса окремої згоди на маркетингові листи | n/a | n/a | n/a |

## Явні дизайн-рішення (data minimization)

- IP-адреса свідомо НЕ логується і НЕ зберігається в жодному з нових
  сховищ Blobs — навіть `docs/checkout-legal-spec.md` (розділ D) прямо
  каже "лише якщо є законна підстава й необхідність", і оскільки такої
  підстави поки не підтверджено, вибір — не збирати.
- `submission-created.js` (Етап 3) записує контакт у mock CRM з полем
  `consentStatus: "not_collected"` — НЕ `"granted"` — саме тому, що
  форми фізично не мають чекбокса згоди. Це не помилка форм, а чесна
  фіксація реального стану, поки O-06 (email provider) і рішення про
  double opt-in не закриті.
- Реальні PRO/VIP/Starter файли клієнтів НЕ проходять через жоден
  Blobs-стор цього циклу — вони взагалі не задеплоєні на Netlify
  (окремий, значно старіший owner blocker: хостинг платних файлів).

## OWNER BLOCKER — DATA RETENTION POLICY

Жоден рядок цього документа не встановлює конкретний строк зберігання
email/імені/telegram лідів. Це рішення власника (за потреби — спільно з
юристом), не технічне рішення. Доки воно не ухвалене:

- нові контакти в mock CRM зберігаються без TTL (Blobs-об'єкти не
  видаляються автоматично);
- це прийнятно для sandbox/mock даних, але НЕ прийнятно, коли CRM_MODE
  перейде в `live` з реальними контактами — тому запис у
  `docs/owner-blockers.md` (O-11) блокує саме `CRM_MODE=live`, не
  поточний mock-режим.
