# Consistency contracts — чесні гарантії по кожному workflow

Джерело рішень: `docs/adr/ADR-automation-storage-consistency.md`.
Правило циклу: **не називати best-effort механізм "гарантованою
ідемпотентністю"**. Кожен рядок нижче — те, що система РЕАЛЬНО робить,
перевірено живим тестуванням цього й минулого циклу, не те, що хотілось
би.

Легенда consistency-класів:
- **at-most-once** — може загубитись, ніколи не задублюється
- **at-least-once** — може задублюватись, ніколи не губиться
- **best-effort dedup** — намагаємось не дублювати, рідкісний дубль
  можливий і видимий/зливний, не прихований
- **effectively-once** — дубль структурно неможливий (state machine
  блокує повторний перехід), а не лише "малоймовірний"
- **strong exactly-once** — потребує транзакційного сховища, недоступне
  на поточній архітектурі (§ADR)

## Lead (Netlify form → contact event)

| | |
|---|---|
| Source of truth | `automation-events` store, `event_type: lead_submitted`/`contact_created` |
| Read/write model | Append-only write, ніколи update-in-place |
| Consistency | Eventual (Blobs edge-кеш, до 60с за докою Netlify) |
| Duplicate tolerance | ТАК — детермінований `idempotency_key = sha256(form|email|created_at)`, точний platform-retry того самого submission дедуплюється |
| Idempotency guarantee | **best-effort dedup**, не strong — гонка двох близьких за часом (не ідентичних) invocation теоретично можлива через read-lag |
| Retry guarantee | at-least-once обробка (submission-created.js не ковтає виключення на appendEvent) |
| Ordering | Не гарантовано між різними lead — не потрібно (незалежні сутності) |
| Recovery | `replay-workflow.js` (authenticated), джерело — сам event, не втрачається |
| Live-allowed | ТАК (вже live) |

## CRM contact projection

| | |
|---|---|
| Source of truth | НЕ сам projection-запис — events (`entity_type: contact`) |
| Read/write model | Projection = чиста функція `projectContact(events)`, кешується, будь-коли перебудовна |
| Consistency | Eventual read кешу; rebuild завжди дає коректний знімок за наявними events на момент виклику |
| Duplicate tolerance | N/A (projection не створюється двічі — вона одна на email, перезаписується) |
| Idempotency guarantee | **effectively-once** для кінцевого стану (fold — детермінований і повторюваний) |
| Retry guarantee | Rebuild можна викликати повторно без побічних ефектів |
| Ordering | Критично — fold сортує events за `timestamp` перед згорткою; якщо два events мають однаковий timestamp (той самий мс), порядок між ними не гарантовано |
| Recovery | `crm-lookup.js?rebuild=1` (authenticated) |
| Live-allowed | ТАК (вже live) |

## Support request

| | |
|---|---|
| Source of truth | `automation-events`, `entity_type: support_request` |
| Read/write model | Append-only create; статус — окремий event append, не update |
| Consistency | Eventual |
| Duplicate tolerance | Best-effort. Два механізми: (1) 10-хвилинне вікно за контентним хешем `sha256(email|category|messageHash|timeBucket)` — fallback, коли клієнт не передав ID; (2) `client_request_id` — стабільний ID з localStorage, коли клієнт передав |
| Idempotency guarantee | **best-effort dedup, НЕ гарантія** — виміряно живим тестом цього циклу з `client_request_id`: два submit **впритул** (без паузи) → dedup НЕ спрацював (два різні `requestId`, обидва `duplicate:false` — той самий read-lag на dedup-перевірці, що й контентний хеш); той самий `client_request_id` через **25с паузу** → dedup СПРАЦЮВАВ коректно (той самий `requestId`, `duplicate:true`). Практичний висновок: захищає від "користувач перезавантажив сторінку й надіслав ще раз через хвилину", НЕ захищає від "подвійний клік" чи "два паралельні submit з тієї самої вкладки". Реальний захист від псевдо-одночасних дублів — постфактум-реконсиляція (нижче), не синхронний dedup |
| Retry guarantee | at-least-once (форма може бути надіслана повторно вручну користувачем) |
| Ordering | Не критично — кожен request незалежний |
| Recovery | Duplicate reconciliation (§цей цикл): `suspected_duplicate` → ручний merge, не автоматичний |
| Live-allowed | GO in mock — коштом дублю є зайвий тікет, не втрата грошей/даних |

## Refund request

| | |
|---|---|
| Source of truth | `automation-events`, `entity_type: refund_request` |
| Read/write model | Append-only create + status-change events |
| Consistency | Eventual |
| Duplicate tolerance | Best-effort, той самий клас ризику, що й support |
| Idempotency guarantee | **best-effort dedup** — НІКОЛИ автоматичне схвалення (`status: owner_review` для всіх причин) — сам факт дублю НЕ призводить до подвійного повернення коштів, бо жодне повернення не виконується автоматично взагалі |
| Retry guarantee | at-least-once |
| Ordering | Не критично |
| Recovery | Duplicate reconciliation + ручний owner review в будь-якому разі |
| Live-allowed | GO in sandbox — фінансовий контур (сама виплата) лишається `BLOCKED` окремо від workflow-запиту |

## VIP workflow

| | |
|---|---|
| Source of truth | `automation-events`, `entity_type: vip_workflow` + `_lib/vip-state-machine.js` |
| Read/write model | Append-only events; стан — похідний, але переходи структурно обмежені `ALLOWED`-таблицею |
| Consistency | Eventual на рівні read, але переходи стану — **effectively-once**: `canTransition()` перевіряє поточний стан перед кожним переходом, недозволений перехід — 409, не мовчазне дублювання |
| Duplicate tolerance | Дубль entitlement-тригера можливий (best-effort dedup на рівні `resolvePublicId`), але повторний `vip-intake`/повторний перехід стану — заблокований state machine, не лише dedup-шаром |
| Idempotency guarantee | **effectively-once для переходів стану**, **best-effort для самого факту тригера** |
| Retry guarantee | at-least-once на рівні events |
| Ordering | Критично для state machine — переходи мають надходити послідовно; паралельні intake для того самого workflowId — другий отримає 409, не тихо перезапише перший |
| Recovery | `replay-workflow.js`, ручний owner-review для forbidden-transition спроб |
| Live-allowed | GO in mock — entitlement перевіряється або через sandbox order, або authenticated test-flag, ніколи не production-платіж |

## Owner alert

| | |
|---|---|
| Source of truth | `_lib/adapters/email.js#sendOwnerAlert` — event у sink, не реальний email |
| Consistency | Eventual, best-effort |
| Duplicate tolerance | Прийнятно — дубль alert не шкодить (гірше — пропущений) |
| Idempotency guarantee | Немає — і не потрібна |
| Live-allowed | Sink-only, provider — O-04 (email) / O-11 (канал) |

## Daily digest

| | |
|---|---|
| Source of truth | Read-only агрегація з events/projections на момент генерації |
| Consistency | Знімок "станом на [час генерації]", не транзакційний — якщо подія записана за секунду до генерації й ще не видима через read-lag, вона з'явиться в НАСТУПНОМУ дайджесті, не в цьому |
| Duplicate tolerance | N/A (read-only, нічого не пишеться) |
| Live-allowed | Локально, не production-звіт (owner blocker щодо каналу доставки — O-11) |

## Payment / Entitlement / Delivery — BLOCKED

Ці три контури **НЕ отримують** best-effort-класифікацію — вони explicitly
заблоковані для live саме тому, що жодна з вищих best-effort-гарантій
недостатня для грошей/платного доступу. Детально — `docs/adr/
ADR-automation-storage-consistency.md` §4. Технічний gate:
`CHECKOUT_MODE` double-gate (`disabled` + окремий `CHECKOUT_LIVE_UNLOCK`),
не одна змінна.
