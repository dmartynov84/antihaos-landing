# Owner operations — огляд контуру

Локальний (не production, не публічний) операційний контур для
власника. Джерело даних — `ops-report-data.js` (authenticated,
PII-minimal агрегат). Інструмент — `tools/ops_cli.py`.

## Чому локально, не production dashboard

Задання прямо забороняє production admin dashboard без підтвердженого
auth-провайдера цього циклу. `ops-*` endpoints authenticated (X-Admin-
Token), але результат СПОЖИВАЄТЬСЯ локально — `tools/ops_cli.py report`
пише JSON у `.local/reports/` (gitignored, ніколи не коммітиться,
ніколи не деплоїться як сторінка).

## Як користуватись

```bash
export OPS_BASE_URL=https://zapuskbiznesu.netlify.app
export OPS_ADMIN_TOKEN=<те саме значення, що ADMIN_TOKEN на Netlify>

python3 tools/ops_cli.py report                 # PII-minimal звіт -> .local/reports/
python3 tools/ops_cli.py backup                 # повний JSONL+manifest -> .local/backups/
python3 tools/ops_cli.py dead-letter list
python3 tools/ops_cli.py dead-letter inspect --workflow-id lead:abc123
python3 tools/ops_cli.py dead-letter replay --workflow-id lead:abc123
python3 tools/ops_cli.py dead-letter cancel --workflow-id lead:abc123 --reason-code owner_cancelled
python3 tools/ops_cli.py duplicates list --entity-type support_request
python3 tools/ops_cli.py duplicates decide --entity-type support_request --entity-id <id> --decision confirmed_duplicate --canonical-id <id2>
python3 tools/ops_cli.py projections check
python3 tools/ops_cli.py projections rebuild-all
```

## Що показує `report`

- `modes` — поточні AUTOMATION_MODE/EMAIL_MODE/CRM_MODE/DELIVERY_MODE/
  ANALYTICS_MODE/CHECKOUT_MODE знімки.
- `workflowCounts` — скільки workflows у кожному стані
  (pending/processing/completed/retry_scheduled/dead_letter/
  manually_replayed/cancelled).
- `deadLetterCount`/`deadLetter` — список dead-letter workflows з
  `lastErrorCode`.
- `staleCount`/`stale` — **технічна** (не бізнес-SLA) застряглість:
  `pending`/`processing` довше 10хв, `retry_scheduled` довше доби без
  прогресу (`_lib/stale-detection.js`).
- `entitySummaries` — лічильники support/refund/VIP за статусом.
- `duplicateCandidateCounts` — скільки кандидатів на дублювання
  знайдено (детально — `duplicates list`).

## ВІДОМЕ ОБМЕЖЕННЯ цього циклу — не приховано

`ADMIN_TOKEN` не встановлено на Netlify (O-15 у оновленому реєстрі
`docs/owner-blockers.md`). Усі `ops-*` endpoints correctно fail-closed
(503 `admin_token_not_configured`) — перевірено живим curl-тестом.
**Бізнес-логіка цих endpoints (агрегація, дедуп-детекція, projection
diff) НЕ верифікована живим тестом цього циклу** — заблокована тим
самим O-15, що блокувало `crm-lookup`/`replay-workflow` до
попереднього циклу. Код пройшов ручний рев'ю, `tools/ops_cli.py`
перевірено локально на рівні HTTP/CLI-механіки (аргументи, обробка
помилок), не на рівні реальних даних. Рекомендація: після встановлення
`ADMIN_TOKEN` — прогнати `tools/ops_cli.py report`/`backup`/
`projections check` наживо і звірити результат з очікуваним, перш ніж
покладатись на них для реальних рішень.

## Daily digest

Окремого cron-генератора немає (§`docs/automation/scheduled-jobs.md` —
жодного живого cron цього циклу). `tools/ops_cli.py report`, запущений
вручну (чи оператором за розкладом на своїй машині, поза Netlify) —
поточний практичний еквівалент "daily digest". Канал доставки самого
дайджесту власнику — O-11 (той самий, що й owner alert channel).
