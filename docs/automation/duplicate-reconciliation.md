# Duplicate reconciliation

Постфактум-виявлення дублів, окреме від синхронного dedup у
`support-submit.js`/`refund-submit.js`/`vip-trigger.js`. Мотивація —
живий вимір цього циклу: два submit впритул (без паузи), навіть з тим
самим `client_request_id`, НЕ дедуплікувались (read-lag на самій
dedup-перевірці); та сама пара з 25с паузою — дедуплікувалась коректно.
Детально — `docs/automation/consistency-contracts.md`.

## Механізм детекції

`_lib/duplicate-reconciliation.js#detectCandidates(entityType,
{windowMinutes})`:
1. Перелічити всі entityId цього типу (`listEntityIds`).
2. Для кожного — знайти creation-подію, обчислити fingerprint
   (email+category для support, email+orderId для refund, email для
   VIP — НАВМИСНО грубіше за dedup-хеш, бо мета інша: піймати те, що
   dedup пропустив через гонку, не повторити ту саму перевірку).
3. Згрупувати за fingerprint, відсортувати за часом.
4. Кожен запис у групі, крім першого (canonical candidate), у межах
   `windowMinutes` (дефолт 15) — кандидат на дублювання.

**Нічого не видаляється й не блокується автоматично** — детекція лише
рекомендує, рішення завжди ручне.

## Стани рішення

`suspected_duplicate` (дефолт, поки власник не вирішив) →
`confirmed_duplicate` | `false_positive` → (якщо confirmed)
`linked_to_canonical` (вказано, який запис справжній) → `merged`
(canonical запис обробляється, дублікат позначено, але його events
лишаються в `automation-events` назавжди — merge торкається лише
`duplicate-reconciliation` стору, не самої історії подій).

## Як приймати рішення

```bash
python3 tools/ops_cli.py duplicates list --entity-type support_request
python3 tools/ops_cli.py duplicates decide \
  --entity-type support_request --entity-id <suspected-id> \
  --decision confirmed_duplicate --canonical-id <original-id> \
  --note "той самий клієнт, повторний reload за 2с"
```

## Що НЕ реалізовано цього циклу

- Автоматичне `merged`-об'єднання даних двох записів в один UI-запис
  (наприклад, для показу клієнту "один тікет замість двох") — поза
  обсягом, `merged`-стан лише позначає намір, фактичне злиття
  презентації — майбутня робота, якщо власник підтвердить потребу.
- Живе тестування самого detectCandidates() на production —
  заблоковано відсутністю `ADMIN_TOKEN` (O-15), як і решта ops-*
  endpoints цього циклу.
