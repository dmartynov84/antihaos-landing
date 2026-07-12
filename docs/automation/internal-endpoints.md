# Internal endpoints inventory

| Endpoint | Public | Internal | PII | Auth | Production action |
|---|---|---|---|---|---|
| `create-order` | ✅ (checkout) | — | email (input only) | CHECKOUT_MODE gate | Створює order |
| `webhook` | ✅ (майбутній provider) | — | — | HMAC signature | Позначає paid/refunded |
| `simulate-pay` | mock-only | ✅ | — | CHECKOUT_MODE=mock gate | Симулює webhook |
| `download` | ✅ (з токеном) | — | — | signed token + order.status | Видає файл |
| `order-status` | ✅ (з orderId) | — | немає email у відповіді | possession of random UUID orderId | Читає |
| `submission-created` | — | ✅ (Netlify-only trigger) | email/name/UTM (input, не в response) | Netlify platform invocation | Приймає lead, пише events |
| **`crm-lookup`** | ❌ | ✅ | **повний контакт** | **X-Admin-Token (CRITICAL fix цього циклу)** | Читає |
| `replay-workflow` | ❌ | ✅ | опосередковано (через event payload) | X-Admin-Token | Повторює downstream-обробку |
| `health` | ✅ | — | немає | — (навмисно публічний, без PII) | Читає-пінгує Blobs |
| `support-submit` | ✅ | — | email (input) | AUTOMATION_MODE gate | Створює тікет |
| `support-status` | ✅ (з requestId) | — | masked email лише | possession of random UUID requestId | Читає |
| `refund-submit` | ✅ | — | email (input) | order email match | Створює запит |
| `refund-status` | ✅ (з requestId) | — | немає email у відповіді | possession of random UUID requestId | Читає |
| `vip-trigger` | ✅ (order) / ❌ (test) | частково | email (input) | order validation / X-Admin-Token для test-шляху | Створює workflow |
| `vip-intake` | ✅ (з workflowId) | — | intake-дані (input) | possession of random UUID workflowId + state machine gate | Записує intake |
| `vip-status` | ✅ (з workflowId) | — | немає email у відповіді | possession of random UUID workflowId | Читає |
| `ops-report-data` | ❌ | ✅ | немає (лічильники, не email/payload) | X-Admin-Token | Читає, PII-minimal агрегат |
| `ops-duplicates` | ❌ | ✅ | опосередковано (entityId у кандидатах) | X-Admin-Token | GET читає / POST записує decision-метадану (не events) |
| `ops-dead-letter` | ❌ | ✅ | опосередковано (через event history в inspect) | X-Admin-Token | GET list/inspect читає / POST cancel записує стан |
| `ops-projections-audit` | ❌ | ✅ | опосередковано (email у results) | X-Admin-Token | GET check читає / POST rebuild перебудовує кеш (не events) |
| `ops-events-export` | ❌ | ✅ | **повний payload, реальний PII** (навмисно — для backup) | X-Admin-Token | Читає, повний export одного entityType |
| `ops-events-restore` | ❌ | ✅ | повний payload (з backup-файлу) | X-Admin-Token | Пише ЛИШЕ в ізольований `automation-events-restore-drill` стор (hardcoded, не production) |

## Правила, застосовані послідовно

- **CORS не використовується як автентифікація** ніде — усі внутрішні
  endpoints (`crm-lookup`, `replay-workflow`) захищені `X-Admin-Token`
  header, не origin-перевіркою.
- **Status endpoints для клієнта** (`order-status`, `support-status`,
  `refund-status`, `vip-status`) повертають лише дані ЦЬОГО конкретного
  id — жодного endpoint-у зі списком усіх записів немає взагалі.
- **Публічний health** не містить record count, email, contact ID чи
  internal paths — лише `"healthy"/"degraded"` і режими підсистем.
- **Debug endpoints, яких більше немає**: старий `crm-lookup` без auth
  (виправлено, див. `docs/automation/process-map.md` і commit
  `4603e5c`).
- **Dry-run за замовчуванням для side-effect дій**: `replay-workflow`
  з цього циклу вимагає `execute:true` явно в тілі запиту — без нього
  ЛИШЕ читає й прогнозує, жодного `appendEvent`/email/mutation
  (OWNER OPERATIONS FINAL HARDENING цикл, знайдено як реальний gap
  проти власної вимоги контуру "dry-run за замовчуванням").
- **`ops-*` endpoints ще не верифіковані живим тестом бізнес-логіки** —
  `ADMIN_TOKEN` не встановлено на Netlify (O-06), усі 8 fail-closed
  верифіковано (503/405), жоден не протестований authenticated живим
  запитом. Задокументовано в кожному відповідному runbook
  (`docs/runbooks/`), не приховано.
