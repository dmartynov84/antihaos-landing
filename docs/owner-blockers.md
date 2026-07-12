# Owner blockers — master registry

Єдиний реєстр рішень, які МАЄ ухвалити власник (за потреби — разом із
юристом/бухгалтером). Claude Code не заповнює жодне з них вигаданим
значенням. Нумерація O-01…O-14 узгоджена з завданням AUTOMATION
OPERATIONS цього циклу; O-15+ — пункти з попередніх циклів, які не
мають прямого відповідника в новій нумерації, перенесені без втрати.

| ID | Рішення | Статус | Хто підтверджує | Що блокує |
|---|---|---|---|---|
| O-01 | Перевірка практикуючим юристом | OPEN | Lawyer | Live payments |
| O-02 | Платіжний провайдер | OPEN | Owner | Live checkout |
| O-03 | CRM provider | OPEN | Owner | `CRM_MODE=live` |
| O-04 | Email provider | OPEN | Owner | `EMAIL_MODE=live` |
| O-05 | Support email/канал | OPEN | Owner | Customer support (зараз лише mailto) |
| O-06 | Calendar provider/link | OPEN | Owner | VIP booking, `[CALENDAR_LINK]` |
| O-07 | VIP support start date rule (від якої події рахувати 7 днів супроводу) | OPEN | Owner | 7-day automation (немає автоматичного таймера, доки не вирішено) |
| O-08 | Support response SLA | OPEN | Owner | Клієнтські очікування щодо строку відповіді |
| O-09 | Refund entitlement policy (миттєво vs grace-період) | OPEN | Owner/Lawyer | Access after refund (технічний дефолт: миттєво, не підтверджена політика) |
| O-10 | Data retention policy | OPEN | Lawyer/Owner | PII lifecycle, `CRM_MODE=live` з реальними контактами |
| O-11 | Owner alert channel (email/Telegram/Slack) | OPEN | Owner | Production incident notifications (зараз лише Netlify function logs) |
| O-12 | Marketing consent UI (чекбокс на формах) | OPEN | Owner/Lawyer | Будь-яка маркетингова розсилка (зараз `not_collected` для кожного контакту) |
| O-13 | Реквізити продавця | OPEN | Owner | Offer/checkout, ПРРО |
| O-14 | ПРРО/фіскалізація | OPEN | Accountant/Lawyer | Live payments |

## Перенесено з попередніх циклів (без прямого відповідника вище)

| ID | Рішення | Статус | Хто підтверджує | Що блокує |
|---|---|---|---|---|
| O-15 | KYC платіжного провайдера | OPEN | Owner/provider | Live payments |
| O-16 | Хостинг платних файлів (реальні PRO/VIP/Starter) | OPEN | Owner/Engineer | Реальна (не sandbox-заглушка) захищена видача |
| O-17 | GA4/Pixel ID | OPEN | Owner | `ANALYTICS_MODE=live` (зараз `"TODO"`, безпечно guard-овано) |
| O-18 | Checkout consent-текст (candidate, `docs/checkout-legal-spec.md`) | OPEN | Lawyer | `CHECKOUT_MODE=live` |
| O-19 | Практична перевірка mock/sandbox-контурів наживо | OPEN | Owner (технічна дія) | Потрібно встановити на Netlify: `CHECKOUT_MODE`, `CHECKOUT_WEBHOOK_SECRET`, `CHECKOUT_DOWNLOAD_SECRET`, `ADMIN_TOKEN` — асистент не має доступу до Netlify dashboard |

## Явно НЕ є owner blocker

- Технічні задачі, які Claude Code МОЖЕ зробити сам (Etap 5+: owner
  dashboard, daily digest, CI/CD gates, backup runbooks, автоматичний
  cron-retry) — обсяг роботи, не рішення власника.
