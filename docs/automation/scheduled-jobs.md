# Scheduled jobs — рішення цього циклу

**Немає жодного живого cron цього циклу.** Свідоме рішення, не
недогляд — обґрунтування нижче.

## Що перевірено (офіційна документація, `docs/adr/ADR-automation-storage-consistency.md` §1.3)

- Netlify Scheduled Functions: cron у UTC, `netlify.toml` або inline
  `config.schedule`, timeout **30с**, без payload, без response body,
  працює лише на published-деплоях.
- Документація **не описує** overlap-захист чи exactly-once execution
  guarantee — власний lock потрібен у коді, якщо колись впроваджувати.
- Ручний тригер лише через Netlify UI ("Run now") чи `netlify
  functions:invoke` у `netlify dev` — **немає** authenticated HTTP
  шляху для асистента самостійно протестувати наживо без доступу до
  dashboard.

## Чому не впроваджено цього циклу

1. **Неможливо самостійно перевірити.** Кожен інший компонент цього й
   минулого циклу пройшов живе адверсаріальне тестування (curl проти
   production) ПЕРЕД тим, як отримати статус GO. Scheduled Functions —
   єдиний примітив, який фізично не можна протестувати тим самим
   способом (немає HTTP-шляху для ручного тригера ззовні). Впровадити
   й позначити "GO" без живої перевірки суперечило б дисципліні, яка
   вже двічі цього циклу знайшла реальні розходження docs-vs-production
   (§ADR 1.2 — consistency:"strong" зламався всупереч документації).
2. **Overlap-протекція — власна відповідальність, не Netlify-гарантія.**
   Якщо retry-worker колись побіжить у cron, потрібен явний lock-запис
   (напр. `ops-retry-lock` blob з TTL) — не написано цього циклу, бо
   без можливості реально спостерігати накладення двох invocations
   немає способу перевірити, що lock працює правильно, а не просто
   "виглядає правильно в коді" (той самий клас ризику, що дав minor
   пастку з `consistency:"strong"`).
3. **Retry вже має робочий, перевірений живою адверсаріальною
   перевіркою механізм**: authenticated `replay-workflow.js` +
   `tools/ops_cli.py dead-letter replay`. Втрата — не в тому, що
   немає recovery, а в тому, що recovery не автоматичний.

## Що зроблено натомість

- `ops-dead-letter.js` (list/inspect/cancel) + `replay-workflow.js`
  (replay) дають ПОВНИЙ ручний retry-контур, керований власником через
  `tools/ops_cli.py` або authenticated curl.
- Якщо власник хоче автоматизувати: наступний крок — додати ОДИН
  scheduled function (`retry-scan.js`), inline `config.schedule` у
  `netlify.toml`, що викликає ту саму логіку, що й ручний replay, для
  всіх `retry_scheduled` workflows з `nextRetryAt` у минулому. Перед
  тим, як позначити це "GO" — власник має натиснути "Run now" в Netlify
  UI хоч раз і підтвердити результат, оскільки асистент не може.

## Owner action item

Якщо власник хоче живий cron-retry: підтвердити готовність самостійно
перевірити перший запуск через Netlify UI "Run now" (асистент підготує
код, але не може сам натиснути кнопку в dashboard). До того часу —
статус: **НЕ впроваджено, ручний replay — робочий fallback**.
