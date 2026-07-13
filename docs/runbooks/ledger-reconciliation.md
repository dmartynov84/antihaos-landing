# Runbook: Ledger reconciliation

## Призначення

Перевірити узгодженість ledger'ів (`checkout-orders`,
`checkout-webhook-events`, `checkout-audit-log`, `automation-events`)
одне з одним перед тим, як довіряти будь-якому фінансовому чи
бізнес-звіту.

## Симптоми

- Планова перевірка перед звітом власнику.
- Підозра на розбіжність (напр. audit-log показує `payment_succeeded`,
  але order.status не "paid").

## Severity

**HIGH** для checkout-ledgers (фінансовий контур, хоч і sandbox).
**MEDIUM** для automation-events (lead/support/refund/VIP).

## Prerequisites

`ADMIN_TOKEN` для automation-events reconcile
(`tools/ops_cli.py reconcile`). Checkout-ledgers (`checkout-orders`
тощо) НЕ покриті `ops_cli.py` цього циклу — окремий стор, поза
Owner Operations projection-audit — перевірка вручну через
`listAudit(orderId)` (немає CLI-обгортки, лише через authenticated
`crm-lookup`-подібний доступ, якого зараз немає для checkout-стору
конкретно — **відомий, задокументований gap**, не помилка).

## Безпечна діагностика

```bash
python3 tools/data_integrity_cli.py self-test        # fixture: gross/net, дублі
python3 tools/ops_cli.py reconcile                    # automation-events контур
```

## Ручна перевірка checkout-ledger (без CLI, через код)

Немає authenticated endpoint для листингу всіх orders (навмисно —
жодного "list all orders" endpoint не існує, `docs/automation/
internal-endpoints.md`). Reconciliation одного конкретного order —
через `listAudit(orderId)` (внутрішня функція, викликана лише
existing endpoints, не expose-на напряму). Для sandbox-масштабу
(мала кількість test-orders) це прийнятний, хоч і не автоматизований,
рівень покриття.

## Expected output

`self-test`: 10/10 PASS, включно з `financial-invariants: refund
exceeds payment` (негативний, коректно виявлено).

## Verification

Значення в `docs/automation/data-integrity-invariants.md` таблиці
"Orders/payments" — кожен рядок або ✅, або задокументований ⚠️ GAP
з планом закриття.

## Rollback

Read-only перевірка — немає rollback потреби.

## Owner communication

Розбіжність у checkout-ledger (HIGH) — негайно, навіть у sandbox
(звичка на майбутнє, коли стане live).

## STOP conditions

- Не публікувати фінансовий звіт, якщо `ops_cli.py reconcile`
  повертає FAILED.
- Не вважати sandbox-розбіжність "неважливою, бо не реальні гроші" —
  саме зараз, поки ціна помилки нульова, варто виявляти й виправляти
  логічні дірки.

## Пов'язані owner blockers

O-03 (transactional storage — поточний Blobs read-modify-write без
явного reconciliation-CLI для checkout-orders — саме те, що O-03
мало б вирішити архітектурно).
