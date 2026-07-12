# Runbook: Security incident

## Призначення

Реагувати на підозрювану security-подію: витік PII, компрометований
`ADMIN_TOKEN`, неавторизований доступ до internal endpoint, підозріла
активність в logs.

## Симптоми

- Незрозумілі виклики `ops-*`/`crm-lookup`/`replay-workflow` в logs
  (обсяг/патерн, не характерний для власника).
- `ADMIN_TOKEN` міг потрапити в публічний коміт/лог/скріншот.
- Автоматична адверсаріальна перевірка (§25 циклу) виявила, що
  internal endpoint приймає запити БЕЗ токена (мало бути 503, отримано
  200+дані).

## Severity

**CRITICAL** завжди — за замовчуванням, доки не спростовано.

## Prerequisites

Доступ до Netlify dashboard (для ротації `ADMIN_TOKEN`), git access.

## Безпечна діагностика (READ-ONLY, перш ніж щось міняти)

```bash
# Перевірити фактичний захист усіх internal endpoints
for fn in crm-lookup replay-workflow ops-report-data ops-duplicates ops-dead-letter ops-projections-audit ops-events-export ops-events-restore; do
  echo "=== $fn ==="
  curl -s -o /dev/null -w "%{http_code}\n" "https://zapuskbiznesu.netlify.app/.netlify/functions/$fn"
done
```

Очікується `503` (без токена, `ADMIN_TOKEN` не встановлено), `401/403`
(токен встановлено, запит без нього відхилено), або `405` (endpoint
приймає лише POST, метод перевіряється до auth-гейту -- `replay-
workflow` саме так поводиться: GET без тіла дає 405, не 503, це НЕ
проблема, бо 405 не розкриває жодної інформації про стан токена).
Живий curl-прогін цього runbook (2026-07-13): усі 8 internal endpoints
дали 503, крім `replay-workflow` (405, очікувано, POST-only). Будь-який
`200` тут — CRITICAL, negative-secure-by-default порушено.

```bash
python3 tools/audit_cli.py secrets
python3 tools/audit_cli.py admin-endpoints
```

## Команда dry-run

Немає "dry-run" для security-інциденту — сама діагностика вище є
безпечною (read-only). "Виконання" нижче — це вже дії з наслідками.

## Дії (за підтвердженим інцидентом)

1. **Ротація `ADMIN_TOKEN`** (Netlify dashboard, owner action — асистент
   не має доступу):
   - Згенерувати новий токен.
   - Оновити `ADMIN_TOKEN` env var на Netlify.
   - Оновити всі локальні `OPS_ADMIN_TOKEN` в оточенні операторів.
2. **Якщо секрет потрапив у git-історію**: НЕ просто видалити файл
   новим комітом (стара версія лишається в історії) — це вимагає
   `git filter-repo`/BFG чи еквівалент, ЯВНО поза автоматичною дією
   асистента (force-push історії — заборонена дія без явного дозволу
   власника, CLAUDE.md).
3. **Перевірити logs** на факт використання скомпрометованого токена
   до ротації (Netlify Function logs, `X-Admin-Token` value сам НЕ
   логується — `_lib/logger.js#redact()` маскує паттерни token/secret/
   password — але IP/timing викликів видно).

## Expected output

Після ротації: старий токен → 503 на будь-який `ops-*`/`crm-lookup`/
`replay-workflow` виклик; новий токен → нормальна робота.

## Verification

Повторити діагностичний блок вище з НОВИМ токеном — усі endpoints
мають відповідати нормально; зі СТАРИМ токеном — 503/403.

## Rollback

Ротація токена не має "rollback" — це односторонній, безпечний рух
вперед. Якщо ротація зламала легітимний доступ (оператор не встиг
оновити свій `OPS_ADMIN_TOKEN`) — це не "відкат", а звичайна
синхронізація конфігурації.

## Owner communication

CRITICAL — власник МАЄ бути повідомлений НЕГАЙНО, незалежно від каналу
(O-08 ще не підключено — зараз це означає прямий контакт поза
automation-контуром, напр. в поточній розмові з асистентом чи вручну).

## STOP conditions

- Не ротувати `ADMIN_TOKEN` без підтвердження власника, ЯКЩО
  діагностика показує false positive (напр. власний тестовий трафік
  сплутано з інцидентом) — ротація має реальну вартість (усі
  оператори мають оновити свій локальний токен).
- Не публікувати деталі інциденту (які саме дані могли витекти) у
  публічний git commit message чи issue — internal-only канал.

## Пов'язані owner blockers

O-06 (production-grade admin auth — сирий shared `ADMIN_TOKEN` це і
є частина ризику, яку O-06 мав би закрити), O-08 (owner alert channel
— для майбутньої автоматизації цього першого кроку).
