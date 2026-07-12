# Support workflow (mock)

## Категорії

`access, broken_file, wrong_package, payment, refund, vip, technical, general`
— валідується server-side (`support-submit.js`), не лише в UI.

## Dedup

`sha256(email|category|messageHash|timeBucket)`, `timeBucket` = 10-хвилинне
вікно. Повторний Submit у межах вікна повертає ІСНУЮЧИЙ `requestId`
(`duplicate:true`), не створює другий тікет. Різні звернення того самого
email НЕ зливаються — dedup враховує і категорію, і хеш тексту, не лише
email.

## Public requestId ≠ dedup key

`requestId`, який бачить клієнт, — `crypto.randomUUID()`
(`_lib/request-dedup.js`), не сам content-хеш. Хтось, хто знає чийсь
email і приблизний текст звернення, НЕ може обчислити чужий `requestId`
і підглянути статус.

## Service consent ≠ marketing consent

`marketingConsentStatus: "not_collected"` записується завжди — сам факт
звернення в підтримку ніколи не переводить це в `"granted"` (§21).

## SLA (O-10 — досі OPEN)

Жодного строку відповіді не обіцяно. `support-status.js` не повертає
"строк відповіді", бо власник його ще не підтвердив.
