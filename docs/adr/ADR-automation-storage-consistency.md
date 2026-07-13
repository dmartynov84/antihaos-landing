# ADR: сховище й consistency-модель для automation-контуру

Статус: **ACCEPTED**. Дата: 2026-07-12 (OWNER OPERATIONS & RELIABILITY
CONTROL PLANE цикл). Автор рішення: Claude Code (технічне рішення в
межах дозволеного обсягу — не торкається платежів/ризику/секретів,
які лишаються owner blockers).

## 0. Контекст

Automation-контур (lead/support/refund/VIP workflows, event store,
projections, dead-letter, майбутні owner-операції: backup, ops-звіт)
зараз повністю живе в Netlify Blobs. Минулого циклу (AUTOMATION
OPERATIONS) живе адверсаріальне тестування знайшло два реальні
розходження документація-vs-production у цьому сховищі:

1. `setJSON(key, value, {onlyIfNew:true})` не повертає `{modified,
   etag}`, як описано в доках — повертає `undefined`, TypeError на
   деструктуризації.
2. `store.get(exactKey)` відставав від `store.list({prefix})` на той
   самий ключ на секунди після запису іншим invocation.

Цей цикл вимагає формального рішення: чи лишатись на Blobs, чи
переходити на Async Workloads / зовнішню транзакційну БД / гібрид —
і чесно задокументувати, яку саме consistency-гарантію кожен workflow
реально отримує.

## 1. Що перевірено цього циклу (документація + жива production-перевірка)

### 1.1 Netlify Blobs — офіційна документація

- Consistency за замовчуванням: **eventual**. Новий blob стає
  глобально доступним одразу; update/delete гарантовано
  розповсюджуються по edge-locations **впродовж до 60 секунд**.
  (https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
- Є опція **strong consistency**: на рівні store (`getStore({name,
  consistency:"strong"})`) або на рівні окремого read (`store.get(key,
  {consistency:"strong"})`, також `getWithMetadata`/`getMetadata`).
  Ціна — повільніший read (запит іде через Netlify API, не edge-кеш).
- `netlify dev`/CLI завжди strong consistency за визначенням.

### 1.2 ЖИВА перевірка `consistency:"strong"` у нашому runtime — ВІДХИЛЕНО

Застосували `{consistency:"strong"}` до `getWithRetry`, задеплоїли,
одразу перевірили `support-submit` на production:

```
{"errorType":"BlobsConsistencyError","errorMessage":"Netlify Blobs has
failed to perform a read using strong consistency because the
environment has not been configured with a 'uncachedEdgeURL' property"}
```

Production було зламано (support-submit кидав 500) до відкату
(комміти `5cd7e58` → `f2d9e52`, обидва протестовані наживо — перший
зламав, другий підтверджено відновив `{"ok":true,...}`).

**Висновок:** `consistency:"strong"` розрахований на контекст, де
Netlify сам ін'єктить повний runtime-контекст (Edge Functions, або
Functions v2 з нативним `Context`-об'єктом). Наш код — Functions
**v1 "Lambda compatibility mode"**, credentials ін'єктяться вручну
через `connectLambda(event)` (`_lib/with-blobs.js`, знахідка ще
POST-payment-readiness циклу) — цей шлях, вочевидь, не заповнює
`uncachedEdgeURL`, потрібний strong-consistency read. Це ТРЕТЯ
поспіль розбіжність docs-vs-production саме в цьому шарі. Ми не
переходимо на Functions v2 цього циклу (окрема, більша зміна —
торкнулась би кожного з 15 function-файлів; поза обсягом Owner
Operations циклу) — тому **strong consistency лишається недоступним
інструментом у поточній архітектурі**, а не просто "не використаним".

**ОНОВЛЕНО (DATA TRUTH & PAYMENT-SECURITY READINESS циклу, §21):**
попередній каveat (нижче, закреслено логічно, лишено для історії) —
"тестовано лише per-read варіант" — закрито остаточним тестом. Створено
ізольований тимчасовий endpoint (`temp-consistency-probe.js`, НЕ
торкався жодного production code path, синтетичний ключ у окремому
`temp-consistency-probe` Blobs store), що перевірив ОБИДВА документовані
варіанти в одному прогоні:

```json
{"storeLevelStrong":{"ok":false,"error":"Netlify Blobs has failed to
perform a read using strong consistency because the environment has
not been configured with a 'uncachedEdgeURL' property"},
"perReadStrong":{"ok":false,"error":"... той самий error ..."}}
```

**Остаточний висновок:** обидва варіанти (`getStore({consistency:
"strong"})` і `get(key,{consistency:"strong"})`) кидають ІДЕНТИЧНУ
помилку в цьому runtime. Це підтверджує, що причина — не вибір API-
варіанту, а сам runtime-контекст (Lambda-compatibility mode,
`connectLambda`-ін'єктовані credentials не заповнюють `uncachedEdgeURL`
— властивість самого способу підключення, не конкретного read-виклику).
**`consistency:"strong"` недоступний у цій архітектурі підтверджено
обома документованими варіантами**, не інференцією одного. Endpoint
видалено одразу після отримання результату (комміт після `02ba091`).

~~Попередній (тепер закритий) каveat: живим тестом перевірено ЛИШЕ
per-read варіант... store-level НЕ перевірявся окремо...~~

### 1.3 Netlify Scheduled Functions — офіційна документація

- Cron-формат (UTC), `netlify.toml` або inline `config.schedule`.
- Timeout **30с**, без payload, без response body, працює тільки на
  published-деплоях (не Deploy Preview/branch deploy).
- Документація **НЕ описує** overlap-захист чи exactly-once execution
  guarantee — прогалина, яку ми не можемо закрити читанням, лише
  власним lock-механізмом у коді (див. `docs/automation/scheduled-jobs.md`).
- Ручний запуск лише через Netlify UI ("Run now") або `netlify
  functions:invoke` в `netlify dev` — **немає** authenticated HTTP
  шляху для нас самостійно тригернути й перевірити наживо без доступу
  до dashboard (якого в асистента немає).

### 1.4 Netlify Async Workloads — офіційна документація

FIFO-черга з durable execution (persisted state, автоматичні retries
при мережевих/timeout-збоях), event-driven, керована Netlify — по
суті managed queue поверх їхньої інфраструктури. Виглядає як
архітектурно правильна відповідь на клас проблем, який ми зараз
латаємо вручну (retry/dead-letter у `_lib/workflow-status.js`). Явно
**поза обсягом цього циклу** (задання прямо забороняє встановлення —
"Explicitly out of scope: Netlify Async Workloads installation") —
новий, ніколи не перевірений цим кодом примітив; ризик того самого
класу, що й consistency:"strong" вище, вимагає окремого циклу з
власним адверсаріальним тестуванням, не рядка в ADR.

## 2. Розглянуті варіанти

| Варіант | Consistency | Готовність | Ризик |
|---|---|---|---|
| A. Blobs as-is (eventual + retry + client polling) | best-effort, секунди лагу можливі | Вже працює, перевірено двічі адверсаріально | Відомий, задокументований, прийнятний для non-фінансових workflows |
| B. Blobs + `consistency:"strong"` | мала б бути strong | **Зламано в нашому runtime** (§1.2) | Відхилено цього циклу |
| C. Netlify Async Workloads | durable, керована черга | Не встановлено, поза обсягом циклу за завданням | Невідомий — вимагає окремого циклу перевірки |
| D. Зовнішня транзакційна БД (Postgres/Supabase/etc) | strong, справжні транзакції | Потребує нового провайдера — Owner Blocker (новий provider = наступний цикл "PROVIDER INTEGRATION DECISION") | Найбезпечніший довгостроково для платежів/entitlement, але не рішення на цей цикл |
| E. Гібрид: Blobs append-only event log (без in-place update) + чесно задокументована best-effort consistency для похідних projection/dedup | write-once записи не мають race на overwrite; read-side лаг — відомий і митигований | Це фактично поточна архітектура з цього й минулого циклу | Прийнятний ризик для lead/support/refund-request/VIP-intake; НЕ прийнятний для payment/entitlement/delivery |

## 3. Рішення

**Варіант E (гібрид), формалізований.** Без змін архітектури цього
циклу (Blobs залишається), але з явним обмеженням: **строго заборонено
переводити payment/entitlement/delivery на "live" на цій архітектурі**,
доки одне з двох не станеться:
(a) Async Workloads перевірено окремим циклом і дає прийнятну
    durability-гарантію, або
(b) прийнято рішення про зовнішню транзакційну БД (наступний цикл
    PROVIDER INTEGRATION DECISION).

Це узгоджується з уже чинним `CHECKOUT_MODE` double-gate
(`disabled`/`CHECKOUT_LIVE_UNLOCK`) — технічна заборона вже існує,
цей ADR додає до неї явне архітектурне обґрунтування "чому".

## 4. Per-workflow consistency-рішення

| Workflow | Джерело істини | Consistency-модель | Live-дозвіл на цій архітектурі |
|---|---|---|---|
| Lead (contact_created) | events (append-only) | eventual, duplicate-tolerant | ТАК (вже live) |
| CRM contact projection | похідна від events, rebuildable | eventual, self-healing через rebuild | ТАК (вже live) |
| Support request | events + dedup (best-effort) | eventual, duplicate-tolerant (можливий рідкісний дубль) | GO in mock (як зараз) |
| Refund request | events + order-lookup (Blobs) | eventual для create; **order-existence check сам по собі не є фінансовою транзакцією** — лише прив'язка до вже існуючого sandbox-запису | GO in sandbox (як зараз) |
| VIP workflow | events + state machine | eventual, дубль неможливий за станом (state machine блокує повторний intake) | GO in mock (як зараз) |
| Owner alert | events (sink) | eventual, best-effort (не критично, якщо один alert прийде двічі) | Sink-only, provider — O-04 |
| Daily digest | читає projections/events (read-only агрегація) | eventual, знімок "станом на", не потребує strong | Локально, не production |
| **Payment** | б currently disabled | strong required, недоступна на цій архітектурі (§1.2) | **BLOCKED** |
| **Entitlement** | order-record (Blobs, read-modify-write) | strong required (подвійний download/подвійна виплата — неприйнятний ризик) | **BLOCKED** поза sandbox |
| **Delivery** | залежить від entitlement | успадковує BLOCKED статус entitlement | **BLOCKED** поза sandbox |

## 5. Наслідки

- Жодних змін до вже задеплоєного коду, крім відкоченого
  експерименту з `consistency:"strong"` (§1.2) — чистий net-zero щодо
  runtime-поведінки, плюс: тепер задокументовано ЧОМУ strong
  consistency не використовується, а не просто "ще не спробували".
- `docs/automation/consistency-contracts.md` (окремий файл) деталізує
  це per-workflow рішення в термінах source-of-truth/duplicate
  tolerance/idempotency/ordering/recovery — операційний "контракт", не
  архітектурне обґрунтування (це тут).
- Наступний перегляд цього ADR: коли власник ухвалить рішення про
  provider для CRM/email/auth/storage (наступний цикл за назвою
  завдання) — цей ADR визначає E як chosen baseline, доки той цикл не
  замінить його новим ADR (не редагувати заднім числом — додати
  ADR-002, що супersedes цей).
