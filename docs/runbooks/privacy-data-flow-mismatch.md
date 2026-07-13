# Runbook: Privacy / data-flow mismatch

## Призначення

Реагувати, коли `tools/data_integrity_cli.py data-flow-vs-privacy`
(чи CI-прогін цієї перевірки) виявляє розбіжність між реальним
станом adapters (`health.js`) і заявленим станом у `privacy.html`.

## Симптоми

- CI job падає на кроці "privacy vs live config consistency".
- Хтось поставив `CRM_MODE=live`/`EMAIL_MODE=live`/`ANALYTICS_MODE=live`
  на Netlify, не оновивши Privacy.

## Severity

**HIGH** — юридичний/довірчий ризик (Privacy, що бреше про реальний
стан обробки даних), не лише технічна незручність.

## Prerequisites

Немає (перевірка читає публічний `health.js`, без auth).

## Безпечна діагностика

```bash
python3 tools/data_integrity_cli.py data-flow-vs-privacy
```

## Дії

1. З'ясувати, ЯКА система стала live (`health.js` покаже конкретний
   `components.*` зі значенням, відмінним від безпечного дефолту).
2. Оновити `privacy.html`: перемістити цю систему з розділу "Що може
   бути підключено пізніше" у розділ "Де зберігаються зараз", назвати
   конкретного provider (не generic "стандартні інструменти").
3. Якщо система стала live БЕЗ підготовленого Privacy-тексту —
   розглянути тимчасове повернення до non-live (`_MODE=mock`/`sink`/
   `disabled`) на Netlify, доки текст не готовий — Privacy МАЄ
   випереджати активацію, не наздоганяти постфактум (§22 завдання).
4. Повторно прогнати перевірку.

## Expected output

Після виправлення: `[OK] no problems found`.

## Verification

CI (`unit-tests` job) — зелений на наступному push.

## Rollback

Якщо Privacy-текст неточний і потребує подальшого правки — просто
редагувати `privacy.html` знову, немає технічного rollback (це
контент, не мутація стану).

## Owner communication

HIGH — власник МАЄ підтвердити формулювання нового розділу Privacy
перед тим, як система реально стає live (не постфактум).

## STOP conditions

- Не активувати `CRM_MODE=live`/`EMAIL_MODE=live`/тощо, доки Privacy
  не описує це точно — послідовність МАЄ бути: текст спершу, live
  потім, не навпаки.

## Пов'язані owner blockers

O-04 (CRM provider), O-05 (email provider) — обидва, коли активуються,
проходять через цей runbook.
