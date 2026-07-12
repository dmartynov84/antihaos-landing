# Runbook: Lead recovery

**Симптом:** лід надіслав форму, але не отримав очікуваний lead magnet
email (наразі й так sink-режим — реального листа немає, EMAIL_MODE
live не підключено, O-04), або власник підозрює, що лід загубився.

**Як виявити:** `lead_submitted` подія завжди пишеться ПЕРШОЮ, до
будь-якої downstream-обробки (submission-created.js) — якщо email
відомий, `crm-lookup.js?email=...&rebuild=1` (authenticated) перебудовує
projection з повної історії подій і показує актуальний стан.

**Як зупинити шкоду:** нічого — durable-запис уже відбувся, немає ризику
"подвійної шкоди" від повторної перевірки.

**Як відновити:** якщо `crm-lookup` показує 404 навіть після `rebuild=1`
— лід справді не долетів до durable-шару (означає, що сам
`submission-created.js` впав ДО appendEvent, наприклад через
`MissingBlobsEnvironmentError` — див. `blob-failure.md`). У такому разі
відновлення можливе лише через Netlify Forms UI (нативне сховище форм,
незалежне від нашого Blobs-шару) — власник має перевірити там напряму.

**Як replay:** якщо запис ЄСТЬ (contact_created event існує), але
projection застаріла/неповна — `crm-lookup.js?rebuild=1` вже й є replay
(перебудова, не повторна відправка email).

**Як перевірити:** `crm-lookup` показує контакт із правильними
email/source/UTM/stage.

**Коли повідомити власника:** якщо кілька лідів поспіль показують 404
навіть у Netlify Forms UI — ознака ширшої проблеми з самою формою
(honeypot спрацював хибно, або Netlify Forms сам недоступний).
