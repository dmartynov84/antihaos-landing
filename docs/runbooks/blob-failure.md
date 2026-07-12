# Runbook: Blob failure

**Симптом:** `MissingBlobsEnvironmentError` у Netlify function logs, або
`health` endpoint повертає `"blobs": "failed"`.

**Як виявити:** `curl https://zapuskbiznesu.netlify.app/.netlify/functions/health`
→ перевірити `components.blobs`.

**Як зупинити шкоду:** нічого додатково робити не треба — усі функції,
що торкаються Blobs, вже fail loud (кидають виняток, не мовчать). Жодна
платна дія (checkout) не залежить від lead/support/refund/VIP Blobs-сторів,
тож збій тут не блокує оплату (яка й так `CHECKOUT_MODE=disabled`).

**Як відновити:** якщо помилка саме `MissingBlobsEnvironmentError` (не
тимчасовий outage Netlify) — перевірити, що КОЖЕН новий handler
обгорнутий `_lib/with-blobs.js#withBlobs(...)` (`git grep -n
"exports.handler = withBlobs"` має збігатись із кількістю файлів, що
`require("@netlify/blobs")` прямо чи опосередковано).

**Як replay:** після відновлення Blobs — `replay-workflow.js` для
кожного workflowId у стані `retry_scheduled`/`dead_letter`, що
накопичився за час outage.

**Як перевірити:** `health` знову показує `"blobs":"healthy"`; тестовий
lead submit → `crm-lookup` (authenticated) підтверджує запис.

**Коли повідомити власника:** якщо `health` показує `degraded` довше
кількох хвилин — це блокує lead-автоматизацію повністю (хоч і не
checkout, який і так вимкнений).
