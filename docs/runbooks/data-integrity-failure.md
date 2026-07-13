# Runbook: Data-integrity failure

## Призначення

Реагувати, коли `python3 tools/data_integrity_cli.py` (будь-яка
підкоманда) чи `ops_cli.py reconcile` повертає FAILED/problems.

## Симптоми

- `ops_cli.py reconcile` → verdict `FAILED`.
- CI job `unit-tests` падає на `tools/data_integrity_cli.py self-test`.
- `ops-projections-audit.js?action=check` показує `unknown_schema_version`.

## Severity

**HIGH** якщо `unknown_schema_version` (структурна проблема, потребує
рішення, не автоматичного fix). **MEDIUM** якщо `dead_letter`
(окремий, вже задокументований шлях — `dead-letter-replay.md`).

## Prerequisites

`ADMIN_TOKEN` для live reconcile; для fixture-based перевірок — нічого,
працює локально.

## Безпечна діагностика

```bash
python3 tools/data_integrity_cli.py self-test          # fixture-based, локально
python3 tools/ops_cli.py reconcile                      # live, потребує ADMIN_TOKEN
python3 tools/ops_cli.py projections check               # деталі по кожному контакту
```

## Дії за типом проблеми

**`unknown_schema_version`**: НЕ rebuild-ити наосліп
(`docs/runbooks/projection-rebuild.md` §STOP). З'ясувати, звідки
взявся event з іншою версією — чи це помилка запису, чи навмисна
міграція схеми, яку слід врахувати в `projectContact()` перед тим, як
довіряти rebuild.

**`dead_letter`**: `docs/runbooks/dead-letter-replay.md`.

**`drift_detected`** (DEGRADED, не FAILED): `docs/runbooks/
projection-rebuild.md` — rebuild безпечний, детермінований.

## Expected output

`self-test`: 10/10 PASS. `reconcile`: JSON з `verdict`/`reasons`.

## Verification

Повторний прогін `reconcile` після виправлення — verdict має
покращитись (FAILED→DEGRADED→HEALTHY).

## Rollback

Data-integrity перевірки самі нічого не змінюють (read-only) — немає
"відкату" самої перевірки. Rollback стосується дії, яку вона виявила
потребу зробити (rebuild/replay/cancel — див. відповідні runbooks).

## Owner communication

FAILED — негайно (O-08). DEGRADED — щоденний review.

## STOP conditions

- Не будувати фінансовий/бізнес-звіт, поки verdict `FAILED` (§18).
- Не ігнорувати `unknown_schema_version` як "напевно нешкідливо".

## Пов'язані owner blockers

O-06 (live reconcile потребує ADMIN_TOKEN), O-08 (alert channel).
