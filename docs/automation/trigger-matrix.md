# Trigger matrix

Лише процеси, що ФАКТИЧНО реалізовані станом на HEAD `4edcc04` + цей
цикл. Не описує бажаний майбутній стан як наявний.

| Trigger | Condition | Action | Retry | Owner alert | User message |
|---|---|---|---|---|---|
| Lead form submit (обидві форми) | Валідний email, не honeypot | `submission-created.js`: append event, projection, structured log (event-sourcing з AUTOMATION OPERATIONS циклу — див. `docs/automation/event-model.md`) | `replay-workflow.js` (authenticated manual replay) + retry/dead-letter стан у `_lib/workflow-status.js` | Лише при винятку в самій функції (Netlify показує в Function logs — власник має дивитись вручну, автоматичного push-сповіщення немає, O-08 не закрито) | Redirect на `/thanks` (незалежно від успіху/невдачі — форма НЕ повинна показувати помилку користувачу через внутрішній automation-збій) |
| `create-order` POST | `CHECKOUT_MODE != disabled`, валідний package+email+consent | Order pending, сервер визначає суму | Немає (клієнт сам повторює за бажанням — нова спроба = новий order, дублювання orders можливе, зафіксовано як відомий UX-нюанс, не money-issue, бо реальних грошей нема) | Немає | JSON-помилка з кодом (`unknown_package`, `invalid_email`, `consent_required`) |
| `webhook` / `simulate-pay` payment event | Валідний HMAC-підпис, перше бачення `eventId`, сума збігається з order | Order→paid, download tokens видано, аудит-записи | n/a (webhook — одноразова подія за конструкцією; ідемпотентність замінює retry) | Немає (Етап 4+: owner alert на `amount_mismatch`) | — (це server-to-server, немає прямого user-facing повідомлення) |
| `webhook` / `simulate-pay` refund event | Валідний підпис, order існує | Order→refunded, майбутні download 403 | n/a | Немає | — |
| `download` GET з token | Токен валідний (підпис+TTL) І order.status==="paid" | Serve sandbox-заглушку, аудит-запис | Немає (клієнт може повторити GET, це safe — не бізнес-подія) | Немає | 401/403/200 з файлом |

## Свідомо НЕ реалізовані тригери цього циклу (не вигадані значення — порожньо, бо порожньо)

| Trigger | Чому не реалізовано |
|---|---|
| Payment webhook → CRM stage update | CRM adapter (Етап 2) існує як mock-примітив (`upsertContact` тощо), але НЕ підключений до checkout-контуру цього циклу — це окрема інтеграційна робота, свідомо відкладена, щоб не змішувати недоперевірений checkout з недоперевіреним CRM в одному коміті |
| Delivery failed → retry | `download.js`/`webhook-processor.js` не мають retry/dead-letter — Blobs-помилка при видачі токена зараз просто повертає 500 |
| VIP paid → VIP workflow creation | VIP checkout взагалі не існує (VIP сторінка — mailto) |
| Support form → ticket | Support-форми не існує на сайті |
| Refund request (реальний) → owner review workflow | Реального refund-запиту (не mock webhook) не існує — лише mailto |
| Cron/scheduled owner digest | Жодної scheduled function не створено цього циклу |
