# Runbook: Replay dead-letter

**Симптом:** workflow застряг у `retry_scheduled` чи `dead_letter` (lead
projection не завершилась, наприклад через тимчасовий Blobs-збій).

**Як виявити:** `submission-created.js` логує `lead_projection_failed`
зі `status` і `reasonCode` у Netlify function logs. `workflowId` формату
`lead:<hash>` (лід) видно там само.

**Як зупинити шкоду:** нічого — оригінальна подія (`lead_submitted`)
уже durable, replay лише повторює downstream-крок, не створює
дублікат-лід (усі внутрішні appendEvent-виклики в `lead-processor.js`
мають фіксовані idempotencyKey per contact).

**Як відновити / replay:**
```bash
curl -X POST https://zapuskbiznesu.netlify.app/.netlify/functions/replay-workflow \
  -H "X-Admin-Token: <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"workflowId":"lead:<hash-з-логів>"}'
```

**Ідемпотентність replay:** повторний виклик того самого workflowId
ПІСЛЯ успішного replay повертає `{ok:true, alreadyDone:true,
status:"manually_replayed"}`, не повторює обробку (`TERMINAL_SUCCESS_STATES`
у `replay-workflow.js`).

**Як перевірити:** відповідь `{ok:true, status:"manually_replayed"}`;
`crm-lookup.js?email=...` (authenticated) показує оновлений контакт.

**Коли повідомити власника:** якщо replay сам провалюється (`ok:false`)
— означає durable-шар усе ще недоступний, ескалувати до
`blob-failure.md`.
