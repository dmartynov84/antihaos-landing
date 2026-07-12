# Runbook: Duplicate reconciliation (merge)

## Призначення

Розглянути кандидатів на дублювання (support/refund/VIP), знайдених
постфактум-детекцією, і зафіксувати рішення — БЕЗ видалення жодної
оригінальної події.

## Симптоми

- `tools/ops_cli.py report` показує `duplicateCandidateCounts > 0`.
- Клієнт скаржиться "я двічі відправив форму" або підтримка бачить
  два майже ідентичних тікети.

## Severity

**LOW** для support/lead (дубль — зайвий тікет, не втрата грошей чи
даних). **MEDIUM** для refund (дубль-запит МОЖЕ означати, що клієнт
думає, що перший загубився — варто перевірити, чи обидва звернення
про той самий факт, перш ніж обробляти окремо).

## Prerequisites

`ADMIN_TOKEN` (O-06).

## Безпечна діагностика / dry-run

```bash
python3 tools/ops_cli.py duplicates list --entity-type support_request
python3 tools/ops_cli.py duplicates list --entity-type refund_request
python3 tools/ops_cli.py duplicates list --entity-type vip_workflow
```

`ops-duplicates.js` GET лише читає (`detectCandidates` — не пише
нічого, групує за fingerprint + часовим вікном, 15 хв за замовчуванням,
`--window-minutes` для іншого вікна). Кожен кандидат показує
`currentDecision` (`suspected_duplicate`, якщо рішення ще не
записане).

## Команда виконання (рішення)

```bash
python3 tools/ops_cli.py duplicates decide \
  --entity-type support_request --entity-id <suspected-id> \
  --decision confirmed_duplicate --canonical-id <original-id> \
  --note "той самий клієнт, повторний submit за N секунд"
```

Дозволені `--decision`: `suspected_duplicate` / `confirmed_duplicate` /
`linked_to_canonical` / `merged` / `false_positive`.

## Expected output

`list`: `{"ok":true,"entityType":"...","count":N,"candidates":[{"entityId":"...","canonicalEntityId":"...","gapMs":N,"currentDecision":"..."}]}`.

`decide`: `{"ok":true,"record":{"entityType":"...","entityId":"...","canonicalEntityId":"...","decision":"...","decidedAt":"..."}}`.

## Side effects

**Жодних змін в `automation-events`.** Рішення пишеться ОКРЕМО в
`duplicate-reconciliation` стор (`recordDecision` — update-in-place
навмисно, бо це операційна метадана, яка МАЄ змінюватись, на відміну
від самих подій). Оригінальні `support_request_created`/
`refund_request_created`/`vip_workflow_created` події лишаються
незмінними назавжди — перевірено читанням `_lib/duplicate-
reconciliation.js`.

## Verification

```bash
python3 tools/ops_cli.py duplicates list --entity-type support_request
```

Той самий `entityId` тепер показує оновлений `currentDecision`.

## Rollback

Рішення можна переглянути (напр. `false_positive` → `confirmed_duplicate`
пізніше, якщо з'явиться нова інформація) — просто повторити `decide` з
іншим значенням, той самий `recordDecision` перезаписує.

## Owner communication

LOW severity — не потребує негайного alert. Refund MEDIUM — включити в
щоденний review, якщо `refund_request` кандидатів > 0.

## STOP conditions

- НЕ позначати `merged`, доки не підтверджено, який запис справді
  canonical (не вгадувати за першістю за замовчуванням — `list`
  показує `canonicalEntityId` як "перший за часом", це ЕВРИСТИКА для
  сортування, не остаточне рішення).
- Для refund: НЕ обробляти два запити як два окремі повернення коштів,
  доки не з'ясовано, чи це справді два різні факти чи один дубль —
  фінансовий контур і так `BLOCKED` (жодне повернення не автоматичне),
  але ручний review власника МАЄ це знати.

## Пов'язані owner blockers

O-06 (admin auth), O-13 (refund entitlement policy — дублі-запити на
повернення мають розглядатись у контексті ще не підтвердженої
політики).
