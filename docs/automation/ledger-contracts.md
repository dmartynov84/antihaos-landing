# Ledger contracts

Для кожного ledger — фактична схема (перевірено читанням коду, не
бажана). Де схема НЕ покриває вимогу (напр. gross/fee/tax
розділення) — прямо позначено як gap, не замовчано.

## leads / contacts (`automation-events`, `entity_type: contact`)

```
Purpose: contact-профіль лідів, побудований з immutable events
Canonical: automation-events (Blobs)
Record format: event envelope, див. docs/automation/event-model.md
Schema version: 1 (SCHEMA_VERSION у _lib/events.js)
Unique key: entityType:entityId::idempotencyKey
Ordering: за timestamp (сортується в listEvents() перед fold)
Duplicate policy: best-effort dedup (setIfAbsent, eventual consistency
  — задокументовано в docs/automation/consistency-contracts.md)
Reconciliation: ops-projections-audit.js (check/rebuild)
Checksum: немає на рівні events (append-only, довіра до Blobs
  durability); backup-файли (tools/ops_cli.py backup) МАЮТЬ sha256
Allowed mutations: жодних -- append-only, "зміна" = новий event
Report precondition: projection має бути in_sync (не drift_detected)
  перед довірою до звіту
```

## support-requests / refund-requests / vip-workflows (`automation-events`)

Та сама схема, що leads (спільний event store), різний `entity_type`.
Дедуп -- той самий клас гарантій (best-effort), характеризовано живим
тестом OWNER OPERATIONS циклу: миттєвий повторний submit НЕ
дедуплікується, повтор через 25с -- дедуплікується.

## orders (`checkout-orders`, Blobs read-modify-write)

```
Purpose: sandbox-замовлення (CHECKOUT_MODE, завжди disabled на production)
Canonical: checkout-orders (Blobs)
Record format: { id, packageId, amountUah, email, consentGiven,
  consentTextSnapshot, offerVersion, refundVersion, status, mode,
  createdAt, paidAt?, refundedAt?, lastEventId?, refundAmountUah? }
Schema version: НЕМАЄ явного поля schema_version -- ⚠️ GAP, на
  відміну від automation-events. Якщо схема order-запису колись
  зміниться, немає механізму відрізнити старий/новий формат.
Unique key: order.id (crypto.randomUUID())
Ordering: N/A (одна сутність, не стрім подій)
Duplicate policy: N/A на рівні order; на рівні webhook-подій --
  markEventOnce(eventId), атомарний dedup через setIfAbsent
Reconciliation: НЕМАЄ автоматичного (checkout-orders поза scope
  Owner Operations projection-audit -- окремий стор)
Checksum: немає
Allowed mutations: pending→paid, paid→refunded (updateOrder,
  read-modify-write) -- КОЖНА мутація МАЄ супроводжуватись appendAudit
  (перевірено: так, у всіх гілках webhook-processor.js)
Report precondition: НЕ визначено формально -- ⚠️ GAP (§18 задання
  вимагає reconciliation gate перед фінансовим звітом, checkout-orders
  зараз поза ops:reconcile-data, бо CHECKOUT_MODE завжди disabled --
  свідомо відкладено, не забуто, задокументовано в owner-blockers O-03)
```

### ⚠️ Відомий gap: gross/fee/tax/net розділення

`order.amountUah` -- ОДНЕ поле, немає окремих `gross_amount`,
`provider_fee`, `tax_amount`, `net_amount`. Це НЕ помилка поточного
коду (жоден реальний provider ще не інтегрований -- немає fee/tax
даних, які реально приходили б від кудись), АЛЕ це прямий gap проти
invariant §16 "Гросс vs нет" з payment-security skill і §16 завдання
цього циклу. **Обов'язково закрити ДО вибору платіжного провайдера
(O-02)** -- додати explicit `currency` field і gross/fee/tax/net
розділення в схему order-запису, коли реальний provider дає ці дані.
Наразі: `amountUah` за замовчуванням трактується як gross (клієнт
платить цю суму), що коректно для sandbox, але поле МАЄ бути
перейменоване чи доповнене при реальній інтеграції.

## checkout-webhook-events (`checkout-webhook-events`, dedup-only store)

```
Purpose: ідемпотентність provider webhook -- один eventId обробляється
  один раз
Canonical: checkout-webhook-events (Blobs)
Record format: { seenAt: ISO-8601 } -- мінімальний, лише факт "бачили"
Schema version: N/A (запис надто простий для версіонування)
Unique key: eventId (від provider)
Ordering: N/A
Duplicate policy: setIfAbsent -- get-then-set, невеликий race window
  (задокументовано в _lib/conditional-write.js), прийнятний ризик
  для webhook-дедуплікації (не фінансовий подвійний рахунок сам по
  собі -- подвійна ОБРОБКА того самого платежу заблокована на рівні
  order.status==="paid" check, dedup тут -- друга лінія захисту)
Reconciliation: немає окремого
Checksum: немає
Allowed mutations: жодних (write-once факт)
```

## checkout-audit-log (`checkout-audit-log`, append-only)

```
Purpose: повна історія дій по кожному order (audit trail)
Canonical: checkout-audit-log (Blobs)
Record format: { orderId, type, data, at }, ключ orderId:timestamp:type
Schema version: N/A
Unique key: orderId:Date.now():type (можливий, хоч малоймовірний,
  колізія при двох подіях того самого типу в ту саму мілісекунду --
  ⚠️ незначний теоретичний gap, не спостерігався на практиці)
Ordering: сортується за `at` у listAudit()
Duplicate policy: N/A (append-only, кожен виклик -- новий запис,
  дублювання самого факту логування нешкідливе)
Reconciliation: N/A (це вже і є reconciliation-джерело для order)
Checksum: немає
Allowed mutations: жодних
```

## duplicate-reconciliation (`duplicate-reconciliation`, update-in-place)

Єдиний ledger цього проєкту, де update-in-place НАВМИСНИЙ (не
events/audit) -- операційне рішення (`suspected_duplicate`→
`confirmed_duplicate` тощо) МАЄ змінюватись з часом, на відміну від
факту самої заявки. Деталі: `docs/automation/duplicate-reconciliation.md`.
