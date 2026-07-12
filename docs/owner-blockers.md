# Owner blockers — master registry (канонічна нумерація O-01…O-15)

Єдиний реєстр рішень/дій, які МАЄ ухвалити або виконати власник (за
потреби — разом із юристом/бухгалтером). Claude Code не заповнює
жодне з них вигаданим значенням.

Ця нумерація задана явно завданням OWNER OPERATIONS — FINAL HARDENING
циклу і СУПЕРСЕДИТЬ попередню (Owner Operations checkpoint `e64c5eb`),
яка сама superseded AUTOMATION OPERATIONS-нумерацію O-01…O-19. Мапа
відповідності — в кінці файлу.

| ID | Рішення / дія | Статус | Хто підтверджує | Що блокує |
|---|---|---|---|---|
| O-01 | Юридична перевірка практикуючим юристом (включно з checkout consent-текстом, `docs/checkout-legal-spec.md`) | OPEN | Lawyer | Live payments |
| O-02 | Платіжний провайдер (включно з KYC-онбордингом) | OPEN | Owner | Live checkout |
| O-03 | Transactional storage (зовнішня БД чи Async Workloads замість Netlify Blobs eventual consistency) | OPEN | Owner/Engineer | Financial idempotency — детально `docs/adr/ADR-automation-storage-consistency.md` §4: payment/entitlement/delivery залишаються BLOCKED саме через відсутність цього рішення |
| O-04 | CRM provider | OPEN | Owner | `CRM_MODE=live` |
| O-05 | Email provider | OPEN | Owner | `EMAIL_MODE=live` |
| O-06 | Admin authentication (production-grade, не лише shared `ADMIN_TOKEN`) | OPEN | Owner/Engineer | Authenticated web-admin dashboard (зараз лише CLI + `X-Admin-Token`, свідомо без публічного dashboard) |
| O-07 | Independent backup storage (поза локальною машиною оператора) | OPEN | Owner | Production backup — поточний `tools/ops_cli.py backup` явно local/mock, `docs/automation/backup-policy-draft.md` |
| O-08 | Owner alert / daily digest канал (email/Telegram/Slack) | OPEN | Owner | Реальна доставка сповіщень і дайджесту — severity-таксономія готова (`docs/automation/alert-policy.md`), доставка — ні |
| O-09 | Data retention policy | OPEN | Lawyer/Owner | PII lifecycle, `CRM_MODE=live` з реальними контактами, cleanup-політика для local backup |
| O-10 | Support response SLA (бізнес-строк, не технічна stale-детекція) | OPEN | Owner | Клієнтські очікування щодо строку відповіді. Технічна "зависла" детекція (`_lib/stale-detection.js`) вже є й НЕ є заміною цього рішення |
| O-11 | VIP support start date rule (від якої події рахувати 7 днів супроводу) | OPEN | Owner | 7-day automation (немає автоматичного таймера, доки не вирішено) |
| O-12 | Calendar provider/link | OPEN | Owner | VIP booking, `[CALENDAR_LINK]` |
| O-13 | Refund entitlement policy (миттєво vs grace-період) | OPEN | Owner/Lawyer | Access after refund (технічний дефолт: миттєво, не підтверджена політика) |
| O-14 | ПРРО/фіскалізація (включно з реквізитами продавця) | OPEN | Owner/Accountant/Lawyer | Live payments |
| O-15 | Marketing consent UI (чекбокс на формах) | OPEN | Owner/Lawyer | Будь-яка маркетингова розсилка (зараз `not_collected` для кожного контакту) |

## Явно НЕ є owner blocker

Технічні задачі, які Claude Code МОЖЕ зробити сам (runbooks, dead-letter
CLI, projection audit, dry-run replay, checksum-verified restore, CI
forced-failure gates — усе вже зроблено цими двома циклами) —
обсяг роботи, не рішення власника.

`ADMIN_TOKEN` на Netlify (сирий env var, не production-grade auth
рішення з O-06) лишається окремою технічною дією власника — асистент
не має доступу до Netlify dashboard, щоб встановити його сам. Без
нього `crm-lookup`/`replay-workflow`/усі `ops-*` endpoints
fail-closed-верифіковані (503), але їхня бізнес-логіка не
перевірена живим тестом — розкрито в кожному релевантному runbook.

## Мапа відповідності до попередньої нумерації (трасування, не для нових посилань)

| Нова (канонічна, цей цикл) | Owner Operations checkpoint (`e64c5eb`) |
|---|---|
| O-01 | O-01 (lawyer) |
| O-02 | O-02 (payment provider) |
| O-03 | **новий** — раніше не мав окремого ID, був лише висновком ADR |
| O-04 | O-03 (CRM provider) |
| O-05 | O-04 (email provider) |
| O-06 | **новий** — раніше частина O-15 (Netlify config), тепер виокремлено як production-grade рішення, не просто env var |
| O-07 | **новий** — раніше лише дисклеймер у backup-policy-draft.md, тепер офіційний blocker |
| O-08 | O-08 (owner alert channel) — збігається |
| O-09 | O-06 (data retention) |
| O-10 | O-10 (support SLA) — збігається |
| O-11 | O-09 (VIP 7-day rule) |
| O-12 | O-07 (calendar) |
| O-13 | O-11 (refund entitlement) |
| O-14 | O-13 (реквізити продавця + ПРРО, тут явно об'єднано з фокусом на ПРРО) |
| O-15 | O-12 (marketing consent UI) |

**Два пункти з попередньої нумерації, яких немає в новій 15-пунктовій
таблиці явно, але вони лишаються реальними, не забутими:**
- Хостинг платних файлів (реальні PRO/VIP/Starter, не sandbox-заглушка)
  — був O-14 на checkpoint `e64c5eb`. Контекстно близький до O-07
  (production storage decisions), але не тотожний — реальна видача
  клієнтських файлів, не automation-backup. Не отримав окремого ID у
  новій таблиці; лишається відкритим, відстежується тут текстом, доки
  власник не підтвердить, куди його віднести.
- GA4/Pixel ID — був частиною старого O-15. Малий, суто технічний
  пункт (env var), не блокує жоден з described-here контурів; лишається
  відкритим, без окремого ID.

Примітка: `ADMIN_TOKEN`/`CHECKOUT_WEBHOOK_SECRET`/`CHECKOUT_DOWNLOAD_SECRET`
на Netlify — та сама технічна дія, що раніше називалась O-19/O-15 у
попередніх схемах, тепер сирий env var під O-06 (доки не замінений
production-grade auth-рішенням).
