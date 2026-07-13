# Privacy-to-config consistency contract

## Правило

`privacy.html` МАЄ описувати системи, які реально активні ЗАРАЗ
(перевірено через публічний `health.js`), не бажаний майбутній стан.
Якщо `AUTOMATION_MODE`/`EMAIL_MODE`/`CRM_MODE`/`ANALYTICS_MODE`/
`CHECKOUT_MODE` коли-небудь стане `live`, Privacy МАЄ бути оновлена
ДО того, як дані почнуть текти в цю систему, не постфактум.

## Машинна перевірка

`tools/data_integrity_cli.py data-flow-vs-privacy`:
1. Фетчить живий `GET /.netlify/functions/health` (публічний, без
   auth — не заблоковано O-06).
2. Для кожного з `crm`/`email`/`checkout`/`analytics`: якщо значення
   `"live"`, перевіряє, що `privacy.html` НЕ містить фраз
   "може бути підключено пізніше"/"не активн" (тобто явно описує
   систему як активну, не як заплановану).
3. Якщо ВСІ системи non-live: перевіряє, що Privacy МІСТИТЬ явний
   розділ про заплановані системи (не мовчить про це взагалі).

Прогнано в CI (`.github/workflows/ci.yml`, `unit-tests` job) на
кожному push — якщо хтось поставить `CRM_MODE=live` на Netlify, не
оновивши Privacy, наступний CI-прогін після цього (чи ручний запуск)
це впіймає.

## Live-перевірка цього циклу

```
$ python3 tools/data_integrity_cli.py data-flow-vs-privacy
[OK] no problems found
```

Станом на 2026-07-13: усі adapters non-live (`crm: mock, email: sink,
checkout: disabled, analytics: debug`), Privacy коректно містить
розділ "Що може бути підключено пізніше".

## Обмеження цієї перевірки

- Не перевіряє ТОЧНІСТЬ опису (напр. чи Privacy правильно називає
  Netlify Blobs) — лише узгодженість "live-статус vs заплановано".
  Точність опису — предмет ручного Council-рев'ю (§12 завдання), не
  автоматизованого CI.
- CI job робить живий мережевий запит до production — залежить від
  доступності `zapuskbiznesu.netlify.app` під час CI-прогону
  (прийнятний ризик: якщо production недоступний, це вже CRITICAL
  проблема сама по собі, вартує CI-fail).

## Пов'язані owner blockers

O-03/O-04/O-05 (провайдери, які, коли стануть live, вимагатимуть
оновлення Privacy — ця перевірка це виявить автоматично).
