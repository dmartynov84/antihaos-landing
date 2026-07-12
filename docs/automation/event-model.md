# Event model

Джерело істини для lead/support/refund/VIP workflows — immutable events
у Netlify Blobs (`_lib/events.js`), не contact/order snapshot. Snapshot —
похідна, перебудовувана projection.

## Envelope

```json
{
  "event_id": "uuid",
  "event_type": "lead_submitted",
  "schema_version": 1,
  "entity_type": "contact",
  "entity_id": "normalized-email-or-random-id",
  "workflow_id": "lead:hash | vip:uuid | support:uuid | refund:uuid",
  "correlation_id": "prefix_timestamp_random",
  "idempotency_key": "string",
  "timestamp": "ISO-8601 UTC",
  "source": "netlify-form | vip-intake-form | support-form | refund-form | automation",
  "status": "accepted",
  "payload": {}
}
```

## Ключ у Blobs

`${entity_type}:${entity_id}::${idempotency_key}` — одночасно (а) атомарний
dedup через `onlyIfNew` і (б) `list({prefix: entity_type+":"+entity_id+"::"})`
для перебудови projection.

## Фактично використані event_type

| event_type | entity_type | Хто пише |
|---|---|---|
| `lead_submitted` | `contact` | submission-created.js |
| `contact_created` | `contact` | lead-processor.js |
| `lead_stage_changed` | `contact` | lead-processor.js |
| `lead_duplicate_submission` | `contact` | lead-processor.js |
| `support_request_created` | `support_request` | support-submit.js |
| `refund_request_created` | `refund_request` | refund-submit.js |
| `refund_status_changed` | `refund_request` | refund-submit.js |
| `vip_workflow_created` | `vip_workflow` | vip-trigger.js |
| `vip_status_changed` | `vip_workflow` | vip-trigger.js, vip-intake.js |
| `vip_intake_received` | `vip_workflow` | vip-intake.js |

## Ідемпотентність

`idempotency_key` детермінований там, де повтор реально можливий
(точний retry тієї самої Netlify submission — `sha256(form|email|created_at)`).
Для довільних новостворюваних сутностей (support/refund/VIP) —
`idempotency_key` фіксований рядок на подію (`"created"`,
`"status:owner_review"`) в межах уже унікального `entity_id` (сам
`entity_id` — unguessable `crypto.randomUUID()` через
`_lib/request-dedup.js`, dedup за вмістом відбувається окремим шаром
ДО генерації entity_id, щоб публічний ID лишався невгадуваним — див.
`docs/automation/internal-endpoints.md`).

## Projection rebuild

`_lib/projections.js#projectContact(events)` — чиста функція, згортає
історію подій у поточний contact-стан. Можна викликати будь-коли
(`crm-lookup.js?rebuild=1`) без втрати даних — навіть якщо кеш-запис
projection постраждав від паралельного запису, повна історія в events
незмінна.

## Schema versioning

`schema_version: 1` — перше й поки єдине покоління. Якщо структура
`payload` для якогось `event_type` зміниться в майбутньому, підняти
версію й обробляти обидві в `projectContact`/відповідному processor-і
(не мігрувати старі записи заднім числом — вони immutable).
