# Runbook: Payment idempotency failure

## Призначення

Реагувати на підозру в порушенні платіжної ідемпотентності: подвійна
видача, webhook оброблено двічі, чи "мовчазна втрата" підтвердженої
оплати (invariant #7, `docs/automation/payment-security-checklist.md`).

## Симптоми

- Netlify Function logs містять `payment_confirmed_delivery_failed`
  (critical, доданий цього циклу).
- `checkout-audit-log` для order-а показує `payment_succeeded` двічі
  з різними `eventId`, але тим самим логічним платежем.
- Provider (коли буде обраний, O-02) повідомляє про повторну спробу
  webhook, яка отримала неочікуваний результат.

## Severity

**CRITICAL** — фінансовий контур, навіть у sandbox тестується як
живий (per payment-security skill).

## Prerequisites

Доступ до Netlify Function logs; `ADMIN_TOKEN` не потрібен (логи —
не authenticated endpoint).

## Безпечна діагностика

Перевірити Netlify Function logs на `payment_confirmed_delivery_failed`
чи `amount_mismatch`. Для конкретного order:
```
listAudit(orderId)  -- внутрішня функція, немає прямого CLI/endpoint
                        цього циклу (той самий gap, що ledger-
                        reconciliation.md)
```

## Що робити, якщо знайдено `payment_confirmed_delivery_failed`

Це означає: `markEventOnce(eventId)` вже позначив цей eventId як
"бачений" (dedup), АЛЕ щось після цього (issueDownloadToken/
updateOrder/appendAudit) кинуло виняток — доставка НЕ завершилась,
І provider-retry того самого eventId тепер отримає `{deduped:true}`,
не спробує знову.

**Немає автоматичного recovery для цього сценарію цього циклу**
(відомий, задокументований gap — `payment-security-checklist.md` #7).
Ручне відновлення:
1. Знайти orderId з critical-логу.
2. Підтвердити з provider (коли буде), що платіж дійсно пройшов.
3. Вручну повторити логіку видачі — **наразі немає CLI-команди для
   цього**, потрібен буде окремий `ops-checkout-recover` endpoint у
   майбутньому циклі (не збудовано зараз — не вигадувати наперед).

## Expected output / Verification

Немає автоматизованої перевірки цього сценарію цього циклу — це сам
по собі задокументований gap, не помилка виконання.

## Rollback

N/A — це recovery-процедура, не дія, яку можна відкотити.

## Owner communication

CRITICAL — негайно, будь-яким доступним каналом (O-08 ще не
підключено).

## STOP conditions

- Не намагатись вручну "повторити" видачу без підтвердження від
  provider, що гроші дійсно надійшли (uncritically re-issuing access
  без цього — той самий ризик, що invariant #1 захищає).

## Пов'язані owner blockers

O-02 (payment provider — без нього немає з ким звірити реальний
статус платежу), O-03 (transactional storage — краща архітектура
усунула б клас "dedup consumed, delivery failed" повністю).
