# Payment security checklist — результат рев'ю

Skill: `payment-security` (antyhaos-marketing/.claude/skills/payment-security/SKILL.md).
Застосовано до РЕАЛЬНОГО коду цього репо (`netlify/functions/webhook.js`,
`_lib/webhook-processor.js`, `_lib/security.js`, `create-order.js`,
`download.js`, `simulate-pay.js`, `store.js`) — не до antyhaos-marketing
(skill's власний контекстний нотатка про той проєкт стосується ІНШОГО,
ще не збудованого webhook, не цього).

`CHECKOUT_MODE=disabled` на production увесь цей цикл (перевірено:
`curl .../health` → `"checkout":"disabled"`) — код dormant, але
перевірено так, ніби йде в production, per skill's власне формулювання.

## 8 інваріантів — вердикт по кожному

| # | Інваріант | Вердикт | Доказ |
|---|---|---|---|
| 1 | Signature перевіряється завжди, до бізнес-логіки | ✅ GO | `webhook-processor.js`: `verifySignature()` — перший виклик, до `JSON.parse` навіть |
| 2 | Ідемпотентність: один платіж = одна видача | ✅ GO (з виправленням) | `markEventOnce()` до будь-якого lookup + `order.status==="paid"` check. **Знайдено й виправлено цього циклу**: exception між dedup-mark і `updateOrder` міг мовчки загубити підтверджену оплату — тепер try/catch + critical log + audit trail |
| 3 | Секрети — ніколи в git | ✅ GO | `process.env.CHECKOUT_WEBHOOK_SECRET`/`CHECKOUT_DOWNLOAD_SECRET`, fail-closed якщо відсутні; `audit_cli.py secrets` чисто на кожному CI-прогоні |
| 4 | Sandbox перед live | ✅ GO | `CHECKOUT_MODE` double-gate (`disabled`→`mock`/`sandbox`→`live`+`CHECKOUT_LIVE_UNLOCK`), перевірено живо щоцикл |
| 5 | Сума/валюта звіряється проти замовлення на сервері | ⚠️ ЧАСТКОВО | Сума: ✅ (`isAmountMatching`). Валюта: НЕМАЄ explicit поля — implicit UAH-only. Задокументовано gap, не критично для одновалютного продукту, АЛЕ обов'язково закрити, якщо колись з'явиться мультивалютність |
| 6 | Гросс vs нет | ⚠️ GAP | Один `amountUah`, немає fee/tax/net розділення. Немає реального provider з fee-даними ще — не можна вигадати структуру наперед. **Обов'язково перед O-02** |
| 7 | Fail-loud: збій видачі після підтвердженої оплати | ✅ GO (виправлено цього циклу) | Було: мовчазна втрата можлива. Стало: try/catch, critical log (`payment_confirmed_delivery_failed`), audit entry. **Не є повністю автоматичним retry** — потребує людини, яка побачить critical log; не з'єднано з Owner Operations dead-letter machinery (окремий Blobs-стор) |
| 8 | Платні файли ніколи публічно | ✅ GO | `download.js` — signed token + order-status звірка, sandbox-заглушка замість реального файлу (реальні PRO/VIP/Starter файли взагалі не в цьому репо) |

## Додатково перевірено (поза 8 інваріантами, з §19 завдання)

| Перевірка | Вердикт | Доказ |
|---|---|---|
| Raw body не змінюється до signature verification | ✅ GO | `event.body` передається як `rawBody` напряму в `verifySignature`, `JSON.parse` — ПІСЛЯ |
| Timestamp/replay window на самому підписі | ➖ N/A цього циклу | Провайдер не обрано (O-02) — replay-вікно провайдер-специфічний, не можна імплементувати наперед. Ідемпотентність через `eventId` вже захищає від replay-НАСЛІДКІВ (не від самого факту повторної доставки) |
| Provider event ID унікальний | ✅ GO | `markEventOnce()` |
| Order існує / Product ID відповідає order | ✅ GO | `getOrder(orderId)` 404 якщо ні; `order.packageId !== packageId` перевірка в `download.js` |
| Merchant/account ID перевіряється | ➖ N/A | Немає провайдера — нема merchant ID перевіряти. Owner Blocker O-02 |
| Environment sandbox/live не змішується | ⚠️ ЧАСТКОВО | `order.mode` записується, але немає explicit runtime-перевірки "sandbox event не апдейтить live order" — той самий стор для обох |
| Один payment → один entitlement | ✅ GO | `order.status` — єдине поле, структурно один entitlement на order |
| Повтор webhook не видає матеріали вдруге | ✅ GO | dedup + `order.status==="paid"` idempotent-check |
| Refund/chargeback окрема обробка | ✅ GO (виправлено цього циклу) | Було: без перевірки статусу чи суми. Стало: `status==="paid"` guard, refund amount validation, idempotent на `already-refunded` |
| Live mode fail closed без legal/provider gates | ✅ GO | `CHECKOUT_LIVE_UNLOCK` окремий gate, `isLiveUnlocked()` перевірено попередніми циклами |

## Підсумок

**PAYMENT SECURITY REVIEW: GO IN MOCK/SANDBOX.** Два реальні виправлення
цього циклу (fail-loud delivery, refund validation) закрили конкретні,
знайдені читанням коду gap. Два залишкові gap (gross/fee/tax/net,
явна currency) — не можна закрити без реального provider (O-02), не
вигадуються наперед. **LIVE PAYMENTS лишається BLOCKED** незалежно від
цього вердикту (окремий gate, окреме рішення власника).
