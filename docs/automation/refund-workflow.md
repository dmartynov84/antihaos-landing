# Refund request workflow (sandbox)

## Ключове правило

Запит ≠ схвалення. Незалежно від `reason` (включно з `changed_mind`)
статус після Submit завжди `owner_review` — жодного автоматичного legal
verdict за причиною (§20).

## Валідація

`refund-submit.js` перевіряє: order існує (`checkout-orders`,
попередній payment-readiness цикл), email збігається з `order.email`
(403 `order_email_mismatch`, без розкриття, чи order взагалі існує під
іншим email), дублікат у межах 10-хвилинного вікна (той самий патерн,
що й support).

## Причини

`access_not_received, broken_file, wrong_package, missing_files, material_mismatch, duplicate_payment, changed_mind, other`

## Доступ після refund (O-09 — досі OPEN)

Чи відкликати download-токени миттєво, чи дати grace-період — рішення
власника/юриста. Технічний дефолт (уже реалізований у попередньому
payment-readiness циклі): `download.js` звіряє живий `order.status`,
тому `status="refunded"` вже ФАКТИЧНО відкликає доступ миттєво. Це
поточна технічна поведінка, НЕ підтверджена політика — якщо власник
вирішить інакше (grace-період), знадобиться правка `download.js`.

## Що НЕ пише клієнту

Ніколи: "повернення схвалено", "гроші буде повернено", "повернення
неможливе" — до фактичного рішення власника/юриста. `refund-status.js`
завжди повертає note: "Запит отримано й передано на перевірку. Це не
автоматичне схвалення повернення."
