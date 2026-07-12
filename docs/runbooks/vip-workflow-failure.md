# Runbook: VIP workflow failure

**Симптом:** `vip-trigger`/`vip-intake` повертає 409/403/500, або
workflow застряг у станi, що не просувається.

**Як виявити:** `vip-status.js?workflowId=...` — читає повну історію
`vip_status_changed` подій, показує ОСТАННІЙ фактичний стан (не
припущення).

**Як зупинити шкоду:** `vip-intake.js` явно перевіряє
`canTransition(status, "intake_received")` перед записом — неможливо
випадково "проскочити" стан навіть повторним/невдалим запитом.

**Як відновити:**
- 409 `invalid_transition` — workflow вже не в `intake_pending` (або
  завершено, або скасовано) — перевірити `vip-status` перед повторною
  спробою, не ретраїти наосліп.
- 403 `order_not_paid`/`not_vip_package`/`order_email_mismatch` при
  trigger через order — це навмисна відмова (entitlement дійсно
  відсутній), не баг.
- Для QA без реального paid order — `testEntitlement:true` +
  `X-Admin-Token` (`docs/automation/vip-workflow.md`).

**Як replay:** VIP workflow наразі не має власного retry/dead-letter
статусу (усі його appendEvent-виклики синхронні й ідемпотентні в межах
одного HTTP-запиту, на відміну від lead-processing, що має окремий
downstream-крок) — "replay" тут означає повторний виклик того самого
endpoint з тим самим `workflowId`, що безпечно завдяки ідемпотентним
ключам подій.

**Як перевірити:** `vip-status` показує очікуваний стан;
`calendar_pending` НІКОЛИ не супроводжується мертвим `[CALENDAR_LINK]`.

**Коли повідомити власника:** будь-який workflow у `failed` — потребує
ручного розгляду (стан не має автоматичного відновлення).
