# Runbook: Projection audit / rebuild

## Призначення

Виявити й виправити розбіжність між кешованим CRM contact projection
і фактичною історією подій (`automation-events`), не торкаючись самих
подій.

## Симптоми

- `crm-lookup.js` показує застарілий stage/consent для контакту, який
  точно мав оновитись (напр. після повторної lead-заявки).
- `tools/ops_cli.py report` — немає прямого лічильника drift зараз
  (окрема команда нижче), запускати `projections check` регулярно
  для видимості.

## Severity

**LOW-MEDIUM** — projection відновлювана з events будь-коли, дані
ніколи не втрачені, лише кеш-знімок застарів. Не CRITICAL.

## Prerequisites

`ADMIN_TOKEN` (O-06), `OPS_BASE_URL`/`OPS_ADMIN_TOKEN` локально.

## Безпечна діагностика / dry-run (нічого не змінює)

```bash
python3 tools/ops_cli.py projections check
```

Сканує ВСІ contact projections, повертає для кожного:
`in_sync` / `drift_detected` / `unknown_schema_version`. Це САМЕ дія
з ефектом dry-run — `ops-projections-audit.js?action=check` лише
читає (`auditContactProjection`), нічого не пише.

## Команда виконання

Одна сутність (після перегляду `check`):

```bash
python3 tools/ops_cli.py projections rebuild --email <email-з-check>
```

Усі `drift_detected` одразу:

```bash
python3 tools/ops_cli.py projections rebuild-all
```

`rebuild-all` пропускає (не чіпає) будь-який `unknown_schema_version`
запис — fail loud, не мовчазне припущення (`ops-projections-audit.js`,
перевіряє `schema_version` кожної події проти поточного
`SCHEMA_VERSION` у `_lib/events.js`).

## Expected output

`check`: `{"ok":true,"total":N,"summary":{"in_sync":X,"drift_detected":Y,"unknown_schema_version":Z},"results":[...]}`.

`rebuild`: `{"ok":true,"rebuilt":true,"previousStatus":"drift_detected"}`.
Якщо `previousStatus` був `unknown_schema_version` — endpoint повертає
`409`, НЕ виконує rebuild (перевірено в коді `ops-projections-audit.js`:
`if (before.status === "unknown_schema_version") return 409`).

`rebuild-all`: `{"ok":true,"rebuiltCount":N,"skippedUnknownSchemaCount":M,"skippedUnknownSchema":[emails]}`.

## Side effects під час rebuild

**Жодних.** `rebuildContactProjection()` (`_lib/projections.js`) лише
`listEvents` (read) + `projectContact` (чиста функція, no side effects)
+ один `setJSON` на сам projection-кеш. Не викликає email/CRM/VIP
action — перевірено читанням коду `_lib/projections.js` і
`_lib/lead-processor.js` (rebuild НЕ імпортує `adapters/email.js`).

## Verification

```bash
python3 tools/ops_cli.py projections check
```

Той самий email мав перейти в `in_sync`.

## Rollback

Rebuild детермінований і чистий (`projectContact` — pure fold) —
повторний виклик дає той самий результат, "відкат" не потрібен у
класичному сенсі. Якщо rebuild дав НЕОЧІКУВАНИЙ результат — це
означає проблему в самих events (напр. неправильний порядок
timestamps), не в rebuild-механізмі; діагностувати через
`ops-events-export.js?entityType=contact` (authenticated, повний
export для одного типу).

## Owner communication

MEDIUM severity не потребує негайного alert — включити в наступний
`tools/ops_cli.py report`.

## STOP conditions

- `unknown_schema_version` — НЕ форсувати rebuild, спершу з'ясувати,
  звідки взялась подія з іншою `schema_version` (наразі
  `SCHEMA_VERSION=1` єдина існуюча — будь-яке відхилення підозріле,
  не очікуване).
- `rebuild-all` показує підозріло велику кількість `drift_detected`
  одночасно (напр. >50% контактів) — це радше симптом ширшої
  проблеми (напр. годинниковий дрейф, помилка в самому check) ніж
  нормальна операційна застряглість; ескалувати, не rebuild-ити наосліп.

## Пов'язані owner blockers

O-06 (admin auth для доступу до endpoint).
