# Owner blockers — master registry

Єдиний реєстр рішень, які МАЄ ухвалити власник (за потреби — разом із
юристом/бухгалтером). Claude Code не заповнює жодне з них вигаданим
значенням. Оновлюється кожним циклом; статус змінюється лише коли
власник фактично підтвердив рішення (не коли асистент вважає, що
"це, мабуть, ок").

| ID | Рішення | Статус | Хто підтверджує | Що блокує |
|---|---|---|---|---|
| O-01 | Перевірка практикуючим юристом | OPEN | Lawyer | Live payments |
| O-02 | Платіжний провайдер (Stripe/WayForPay/Fondy/інший) | OPEN | Owner | Checkout live, реальний webhook endpoint провайдера |
| O-03 | KYC платіжного провайдера | OPEN | Owner/provider | Live payments |
| O-04 | Реквізити продавця (ФОП/юрособа, реєстраційні дані) для оферти й чеків | OPEN | Owner | Offer/checkout, ПРРО |
| O-05 | CRM-провайдер (чи взагалі потрібен зовнішній, чи достатньо mock+Blobs) | OPEN | Owner | `CRM_MODE=live` |
| O-06 | Email-провайдер (транзакційний + маркетинговий, окремо) | OPEN | Owner | `EMAIL_MODE=live`, будь-яка реальна розсилка |
| O-07 | Хостинг платних файлів (S3/Netlify Blobs як object storage/інше) | OPEN | Owner/Engineer | Реальна (не sandbox-заглушка) захищена видача |
| O-08 | Публічний support-email/канал | OPEN | Owner | Клієнтська підтримка (зараз лише `antyhaos.marketing@gmail.com` mailto, без тікет-системи) |
| O-09 | Календар для VIP-бронювання | OPEN | Owner | VIP booking, `[CALENDAR_LINK]` у VIP-05 |
| O-10 | GA4/Pixel ID | OPEN | Owner | `ANALYTICS_MODE=live` (зараз `"TODO"`, безпечно guard-овано — не вантажиться) |
| O-11 | Політика зберігання даних лідів (строк retention) | OPEN | Lawyer/Owner | `CRM_MODE=live` з реальними контактами (mock-режим не блокується) |
| O-12 | ПРРО / фіскалізація | OPEN | Accountant/Lawyer | Live payments |
| O-13 | Політика доступу після refund (чи миттєво відкликати, чи grace-період) | OPEN | Lawyer/Owner | Entitlement-логіка (зараз: миттєво відкликає, `download.js` звіряє живий статус — це технічний дефолт, не підтверджена політика) |
| O-14 | Канал сповіщень власника (email/Telegram/Slack) про збої автоматизації | OPEN | Owner | Daily digest, real-time owner alerts (зараз: лише Netlify Function logs, які треба дивитись вручну) |
| O-15 | Чекбокс маркетингової згоди на lead-формах | OPEN | Owner/Lawyer | Будь-яка маркетингова розсилка лідам; зараз `submission-created.js` записує `consentStatus:"not_collected"` для кожного нового контакту |
| O-16 | Checkout consent-текст (candidate, `docs/checkout-legal-spec.md`) | OPEN | Lawyer | `CHECKOUT_MODE=live` |
| O-17 | Практична перевірка mock/sandbox-контуру наживо (потрібні env-секрети) | OPEN | Owner (технічна дія: встановити `CHECKOUT_MODE`, `CHECKOUT_WEBHOOK_SECRET`, `CHECKOUT_DOWNLOAD_SECRET` у Netlify dashboard) | Повне end-to-end підтвердження sandbox checkout — асистент перевірив лише fail-closed `disabled`-поведінку |

## Явно НЕ є owner blocker (щоб не плутати з рештою)

- Технічні задачі, які Claude Code МОЖЕ зробити сам (Етап 4-8 цього
  завдання: VIP/support/refund workflows, owner dashboard, CI/CD,
  backup runbooks) — це не блокери рішень власника, а обсяг роботи,
  свідомо відкладений на наступні цикли (див. `docs/automation/
  process-map.md`, розділ "Що це означає практично").
