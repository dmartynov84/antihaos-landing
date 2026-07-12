# Retry policy

`_lib/workflow-status.js` — станова машина: `pending → processing →
completed` (щасливий шлях) або `processing → retry_scheduled →
dead_letter` (невдалий шлях), плюс `manually_replayed`/`cancelled`.

## Немає автоматичного cron-виконавця цього циклу

Свідомо: перевірити Netlify Scheduled Functions наживо без ризику ще
одного недоперевіреного шару (того самого класу, що дав
`MissingBlobsEnvironmentError` минулого циклу) — окрема робота
наступного циклу. Зараз retry = authenticated manual replay
(`replay-workflow.js`, `docs/runbooks/replay-dead-letter.md`).

## Retryable / non-retryable

```js
RETRYABLE = [
  "blob_temporary_failure", "timeout",
  "email_provider_5xx", "crm_provider_5xx", "storage_temporary_failure",
];
NON_RETRYABLE = [
  "invalid_input", "invalid_signature", "unknown_product",
  "missing_legal_gate", "malformed_order", "forbidden_transition",
];
```

Невідомий/невнесений у жоден список `reasonCode` трактується як
**non-retryable за замовчуванням** (`isRetryable()` перевіряє тільки
`RETRYABLE.has(...)`, не інвертує `NON_RETRYABLE`) — безпечніше не
ретраїти невідомий тип збою наосліп, ніж закрутити нескінченний retry
на помилці, яка сама по собі ніколи не зникне.

## Backoff

Exponential: `60s * 2^(retryCount-1)`, максимум `MAX_RETRIES = 5`
спроб, після чого — `dead_letter` незалежно від причини.

## Dead-letter

Не містить secrets (перевірено — `workflow-status.js` зберігає лише
`reasonCode`, не сирий payload події; сам event із payload лишається
в `automation-events`, доступний лише через authenticated endpoints).

## Owner alert

Цього циклу: `_lib/adapters/email.js#sendOwnerAlert` записує подію в
sink (не надсилає реальний email — provider не підключено, O-04).
Поріг "коли справді сповіщати" (кожен retry чи лише dead_letter) —
рішення для Owner Operations циклу разом із O-08 (канал сповіщень,
див. `docs/automation/alert-policy.md`).
