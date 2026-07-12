# Alert policy — severity taxonomy

Канал доставки (email/Telegram/Slack) — O-08 у `docs/owner-blockers.md`
(перенесено з попереднього O-11), досі OPEN. Цей документ визначає ЩО
має алертити й з якою терміновістю, незалежно від того, ЯКИМ каналом
це піде — щоб рішення про канал не блокувало рішення про політику.

## Рівні

| Рівень | Коли | Приклад цього циклу | Дія |
|---|---|---|---|
| **CRITICAL** | Дані під загрозою, security-межа порушена | Unauthenticated PII endpoint (минулий цикл, вже виправлено) | Негайно, будь-яким доступним каналом, не чекати на batch-дайджест |
| **HIGH** | Workflow остаточно провалився (dead_letter) | `markFailure` → `dead_letter` після 5 спроб | Owner alert подія записується одразу (`sendOwnerAlert`, зараз sink-only — O-08) |
| **MEDIUM** | Технічна застряглість (stale), ще не dead-letter | `processing` довше 10хв (`_lib/stale-detection.js`) | У щоденний звіт (`tools/ops_cli.py report`), не негайно |
| **LOW** | Suspected duplicate, projection drift | `detectCandidates` знайшов кандидата; `ops-projections-audit` знайшов drift | У щоденний звіт, ручний розгляд коли зручно |
| **INFO** | Звичайна операційна метрика | Кількість нових support-заявок за день | Лише в звіті, ніякого алерту |

## Що НЕ підвищується автоматично

`false_positive`-позначені duplicate-кандидати, `in_sync` projection-
записи, `completed`/`manually_replayed` workflows — НЕ фігурують у
жодному рівні алерту, щоб дайджест не перетворився на шум.

## Наразі реалізовано

- CRITICAL/HIGH: подія пишеться в structured log (`_lib/logger.js`) +
  `sendOwnerAlert` (sink, не реальний email/Telegram — O-08).
- MEDIUM/LOW/INFO: видно лише через `tools/ops_cli.py report`, ручний
  запуск (немає cron — `docs/automation/scheduled-jobs.md`).

## Наступний крок (після O-08)

Коли власник обере канал: підключити `sendOwnerAlert` до реального
провайдера для CRITICAL/HIGH негайно; MEDIUM/LOW/INFO лишаються в
дайджесті (не варто спамити тим самим каналом щохвилини для
низькопріоритетних подій).
