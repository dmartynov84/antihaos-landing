# VIP workflow (mock)

## Стани й дозволені переходи

`_lib/vip-state-machine.js` — єдине джерело правди для переходів, не
цей документ (документ описує те саме для читання людиною).

```
vip_new -> entitlement_pending
entitlement_pending -> intake_pending | failed
intake_pending -> intake_received | cancelled
intake_received -> audit_pending
audit_pending -> audit_in_progress
audit_in_progress -> fix_required | owner_review
fix_required -> owner_review
owner_review -> calendar_pending
calendar_pending -> support_scheduled
support_scheduled -> support_active
support_active -> support_completed
support_completed -> closed
* -> cancelled | failed (лише з причиною)
```

Явно заборонено (немає в ALLOWED, тому технічно неможливо, не лише
задокументовано): `vip_new → support_active`, `intake_pending → closed`
без причини, `calendar_pending → support_completed`.

## Entitlement

Лише два джерела (`vip-trigger.js`):
1. Sandbox order: `getOrder(orderId)`, `packageId==="vip"`,
   `status==="paid"`, email збігається.
2. Admin test entitlement: `testEntitlement:true` + `X-Admin-Token`.

Ніколи — browser query параметр як самодостатній доказ.

## Calendar (O-06 — досі OPEN)

Поки календар не підключено: `calendar_pending` повертає чесний текст
("Час консультації буде узгоджено окремо"), не `[CALENDAR_LINK]`.

## 7 днів супроводу — початок періоду (O-07 — досі OPEN)

Канонічне формулювання ("персональний план правок із 7 днями
супроводу") лишається без змін. Яка саме подія стартує відлік 7 днів
(дата консультації? дата передачі плану? перша відповідь?) — власник
має підтвердити; цей цикл НЕ вирішує це самостійно, `support_active`
стан існує, але автоматичного 7-денного таймера немає.

## Intake

`vip-intake.js` — довільний `intake` object, зберігається як є в
payload події. Мінімальний набір полів для реальної форми — рішення
наступного циклу разом із власником (уникнути дублювання питань з
VIP-01 анкети, яка вже існує як DOCX-файл пакета).
