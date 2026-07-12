# Owner blockers — master registry (канонічна нумерація O-01…O-15)

Єдиний реєстр рішень/дій, які МАЄ ухвалити або виконати власник (за
потреби — разом із юристом/бухгалтером). Claude Code не заповнює
жодне з них вигаданим значенням.

Ця нумерація СУПЕРСЕДИТЬ усі попередні (AUTOMATION OPERATIONS
циклу O-01…O-19, і ще старішу схему, видиму в деяких per-workflow
доках до цього циклу) — мапа відповідності в кінці файлу для
трасування посилань у git-історії.

| ID | Рішення / дія | Статус | Хто підтверджує | Що блокує |
|---|---|---|---|---|
| O-01 | Юридична перевірка практикуючим юристом (включно з checkout consent-текстом, `docs/checkout-legal-spec.md`) | OPEN | Lawyer | Live payments |
| O-02 | Платіжний провайдер (включно з KYC-онбордингом) | OPEN | Owner | Live checkout |
| O-03 | CRM provider | OPEN | Owner | `CRM_MODE=live` |
| O-04 | Email provider | OPEN | Owner | `EMAIL_MODE=live` |
| O-05 | Support email/канал (реальний, не лише mailto) | OPEN | Owner | Customer support |
| O-06 | Data retention policy | OPEN | Lawyer/Owner | PII lifecycle, `CRM_MODE=live` з реальними контактами, тривалість зберігання локальних backup (`docs/automation/backup-policy-draft.md`) |
| O-07 | Calendar provider/link | OPEN | Owner | VIP booking, `[CALENDAR_LINK]` |
| O-08 | Owner alert / daily digest канал (email/Telegram/Slack) | OPEN | Owner | Реальна доставка сповіщень і дайджесту — severity-таксономія готова (`docs/automation/alert-policy.md`), доставка — ні |
| O-09 | VIP support start date rule (від якої події рахувати 7 днів супроводу) | OPEN | Owner | 7-day automation (немає автоматичного таймера, доки не вирішено) |
| O-10 | Support response SLA (бізнес-строк, не технічна stale-детекція) | OPEN | Owner | Клієнтські очікування щодо строку відповіді. Технічна "зависла" детекція (`_lib/stale-detection.js`) вже є й НЕ є заміною цього рішення |
| O-11 | Refund entitlement policy (миттєво vs grace-період) | OPEN | Owner/Lawyer | Access after refund (технічний дефолт: миттєво, не підтверджена політика) |
| O-12 | Marketing consent UI (чекбокс на формах) | OPEN | Owner/Lawyer | Будь-яка маркетингова розсилка (зараз `not_collected` для кожного контакту) |
| O-13 | Реквізити продавця + ПРРО/фіскалізація | OPEN | Owner/Accountant/Lawyer | Live payments, offer |
| O-14 | Хостинг платних файлів (реальні PRO/VIP/Starter, не sandbox-заглушка) | OPEN | Owner/Engineer | Реальна захищена видача |
| O-15 | Практична конфігурація Netlify: `ADMIN_TOKEN`, `CHECKOUT_MODE`, `CHECKOUT_WEBHOOK_SECRET`, `CHECKOUT_DOWNLOAD_SECRET`, GA4/Pixel ID | OPEN (технічна дія, не рішення) | Owner (технічна дія) | Живе тестування `crm-lookup`/`replay-workflow`/усіх `ops-*` endpoints (Owner Operations цикл), analytics live-режим. Асистент не має доступу до Netlify dashboard |

## Явно НЕ є owner blocker

Технічні задачі, які Claude Code МОЖЕ зробити сам (owner dashboard-
дизайн уже зроблено локально, CI/CD gates уже зроблено, backup/
restore-механізм уже зроблено, projection audit уже зроблено) —
обсяг роботи, не рішення власника. Різниця: O-15 — це дія, яку
власник МАЄ виконати (немає способу автоматизувати без доступу до
dashboard), не рішення, яке треба обдумати.

## Мапа відповідності до попередніх нумерацій (трасування, не для нових посилань)

| Нова (канонічна) | AUTOMATION OPERATIONS (O-01…O-19) | Найстаріша схема (де відрізнялась) |
|---|---|---|
| O-01 | O-01 (lawyer) + O-18 (checkout consent text, злито) | — |
| O-02 | O-02 (payment provider) + O-15 (KYC, злито) | — |
| O-03 | O-03 (CRM provider) | — |
| O-04 | O-04 (email provider) | збігалась |
| O-05 | O-05 (support channel) | — |
| O-06 | O-10 (data retention) | — |
| O-07 | O-06 (calendar) | збігалась |
| O-08 | O-11 (owner alert channel) | збігалась |
| O-09 | O-07 (VIP 7-day rule) | збігалась |
| O-10 | O-08 (support SLA) | збігалась |
| O-11 | O-09 (refund entitlement) | збігалась |
| O-12 | O-12 (marketing consent UI) | — |
| O-13 | O-13 (seller details) + O-14 (ПРРО, злито) | — |
| O-14 | O-16 (paid file hosting) | — |
| O-15 | O-17 (GA4/Pixel) + O-19 (practical env setup, злито) | — |

Примітка: деякі документи в `docs/automation/*.md`, написані ДО
AUTOMATION OPERATIONS циклу, посилались на O-14 як "канал сповіщень"
— це була застаріла помилка того часу, виправлена цього циклу на
коректний O-08.
