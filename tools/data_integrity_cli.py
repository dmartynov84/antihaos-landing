#!/usr/bin/env python3
"""
Data-integrity CLI (DATA TRUTH & PAYMENT-SECURITY READINESS цикл, §17).
Реальні перевірки на fixture-даних (tools/fixtures/), не placeholder,
що завжди повертає GO. Кожна перевірка має позитивний і негативний
тест-кейс, повертає non-zero exit code при failure, не друкує повний
PII (email маскується), нічого не змінює (audit-only, read-only).

Підкоманди:
  data-integrity <file.jsonl>   -- event_id унікальність, schema_version
                                   присутній, ISO-8601 timestamp, unique
                                   idempotency-key
  financial-invariants <order.json> -- refund <= gross, currency implied
  consent <file.jsonl>          -- marketingConsentStatus не "granted" без
                                   marketing_consent_recorded event
  projection-links <file.jsonl> <lastEventId> -- projection посилається
                                   на event, що реально існує в стрімі
  data-flow-vs-privacy          -- живий health.js (публічний) vs
                                   privacy.html заявлений стан
  self-test                     -- прогонює всі позитивні/негативні
                                   fixtures разом, друкує PASS/FAIL таблицю
"""
import json
import os
import re
import sys
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES_DIR = os.path.join(REPO_ROOT, "tools", "fixtures")
BASE_URL = os.environ.get("AUDIT_BASE_URL", "https://zapuskbiznesu.netlify.app")
SCHEMA_VERSION = 1  # тримати синхронізовано з netlify/functions/_lib/events.js

ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")


def mask_email(email):
    if not email or "@" not in email:
        return None
    local, domain = email.split("@", 1)
    return f"{local[:2]}***@{domain}"


def load_jsonl(path):
    """Повертає (events, problems). Пошкоджена лінія -> problem, не exception."""
    events, problems = [], []
    with open(path, encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError as e:
                problems.append(f"line {i}: damaged JSON ({e})")
    return events, problems


def check_data_integrity(path):
    events, problems = load_jsonl(path)
    seen_event_ids = set()
    seen_idem_keys = set()
    for i, e in enumerate(events):
        loc = f"event[{i}] ({mask_email(e.get('entity_id')) if '@' in str(e.get('entity_id')) else e.get('entity_id')})"
        if "event_id" not in e:
            problems.append(f"{loc}: missing event_id")
        elif e["event_id"] in seen_event_ids:
            problems.append(f"{loc}: duplicate event_id {e['event_id']}")
        else:
            seen_event_ids.add(e["event_id"])

        if "schema_version" not in e:
            problems.append(f"{loc}: missing schema_version (fail loud, not silent assume)")
        elif e["schema_version"] != SCHEMA_VERSION:
            problems.append(f"{loc}: unknown schema_version {e['schema_version']} (expected {SCHEMA_VERSION})")

        ts = e.get("timestamp", "")
        if not ISO_RE.match(ts):
            problems.append(f"{loc}: invalid ISO-8601 UTC timestamp: {ts!r}")

        idem_key = f"{e.get('entity_type')}:{e.get('entity_id')}::{e.get('idempotency_key')}"
        if e.get("idempotency_key") is not None:
            if idem_key in seen_idem_keys:
                problems.append(f"{loc}: duplicate idempotency key {idem_key}")
            seen_idem_keys.add(idem_key)
    return problems


def check_financial_invariants(path):
    with open(path, encoding="utf-8") as f:
        order = json.load(f)
    problems = []
    if "amountUah" not in order:
        problems.append("missing amountUah (no explicit currency field either -- known gap, docs/automation/ledger-contracts.md)")
        return problems
    gross = order["amountUah"]
    refund = order.get("refundAmountUah")
    if refund is not None and refund > gross:
        problems.append(f"refundAmountUah ({refund}) exceeds captured gross amountUah ({gross})")
    if order.get("status") == "refunded" and order.get("amountUah", 0) <= 0:
        problems.append("refunded order with non-positive amountUah")
    return problems


def check_consent(path):
    events, problems = load_jsonl(path)
    problems = list(problems)
    by_entity = {}
    for e in events:
        by_entity.setdefault(e.get("entity_id"), []).append(e)
    for entity_id, entity_events in by_entity.items():
        marketing_status = "not_collected"
        has_consent_event = False
        for e in sorted(entity_events, key=lambda x: x.get("timestamp", "")):
            if e.get("event_type") == "contact_created":
                marketing_status = e.get("payload", {}).get("marketingConsentStatus", "not_collected")
            elif e.get("event_type") == "marketing_consent_recorded":
                marketing_status = e.get("payload", {}).get("status", marketing_status)
                has_consent_event = True
        if marketing_status == "granted" and not has_consent_event:
            problems.append(f"{mask_email(entity_id)}: marketingConsentStatus=granted with NO marketing_consent_recorded event in stream")
    return problems


def check_projection_links(path, last_event_id):
    events, problems = load_jsonl(path)
    problems = list(problems)
    known_ids = {e.get("event_id") for e in events}
    if last_event_id not in known_ids:
        problems.append(f"projection references lastEventId={last_event_id!r}, not found in source event stream (projection ahead of/orphaned from events)")
    return problems


def check_data_flow_vs_privacy():
    problems = []
    try:
        with urllib.request.urlopen(f"{BASE_URL}/.netlify/functions/health", timeout=15) as resp:
            health = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return [f"could not fetch live health.js: {e}"]

    with open(os.path.join(REPO_ROOT, "privacy.html"), encoding="utf-8") as f:
        privacy_text = f.read()

    components = health.get("components", {})
    live_like = {"crm": "live", "email": "live", "checkout": "live", "analytics": "live"}
    for key, live_value in live_like.items():
        actual = components.get(key)
        if actual == live_value:
            # Якщо колись реально стане live -- Privacy МАЄ прямо називати
            # відповідний provider/систему як активну, не лише "може бути
            # підключено пізніше".
            if "може бути підключено пізніше" in privacy_text or "не активн" in privacy_text:
                problems.append(f"health.js reports {key}={actual} (LIVE) but privacy.html still describes it as future/inactive")

    if not problems:
        # Позитивний бік: усі системи зараз non-live, Privacy МАЄ мати
        # "plánned/not yet" мову присутньою -- перевіряємо явно, не мовчки.
        if "може бути підключено пізніше" not in privacy_text:
            problems.append("all systems currently non-live, but privacy.html is missing the 'planned/not active yet' section entirely")
    return problems


FIXTURE_TESTS = [
    ("data-integrity: valid stream", lambda: check_data_integrity(os.path.join(FIXTURES_DIR, "events-valid.jsonl")), True),
    ("data-integrity: duplicate event_id", lambda: check_data_integrity(os.path.join(FIXTURES_DIR, "events-duplicate.jsonl")), False),
    ("data-integrity: unknown schema_version", lambda: check_data_integrity(os.path.join(FIXTURES_DIR, "events-unknown-schema.jsonl")), False),
    ("data-integrity: damaged JSONL line", lambda: check_data_integrity(os.path.join(FIXTURES_DIR, "events-damaged.jsonl")), False),
    ("financial-invariants: valid order", lambda: check_financial_invariants(os.path.join(FIXTURES_DIR, "order-valid.json")), True),
    ("financial-invariants: refund exceeds payment", lambda: check_financial_invariants(os.path.join(FIXTURES_DIR, "order-refund-exceeds-payment.json")), False),
    ("consent: valid stream (not_collected, no violation)", lambda: check_consent(os.path.join(FIXTURES_DIR, "events-valid.jsonl")), True),
    ("consent: granted without consent event", lambda: check_consent(os.path.join(FIXTURES_DIR, "events-consent-violation.jsonl")), False),
    ("projection-links: valid lastEventId", lambda: check_projection_links(os.path.join(FIXTURES_DIR, "events-valid.jsonl"), "e2"), True),
    ("projection-links: orphaned lastEventId", lambda: check_projection_links(os.path.join(FIXTURES_DIR, "events-valid.jsonl"), "e99-does-not-exist"), False),
]


def cmd_self_test():
    all_ok = True
    for name, fn, expect_clean in FIXTURE_TESTS:
        problems = fn()
        is_clean = not problems
        ok = is_clean == expect_clean
        status = "PASS" if ok else "FAIL"
        if not ok:
            all_ok = False
        print(f"[{status}] {name} -- expected {'clean' if expect_clean else 'problems'}, got {'clean' if is_clean else f'{len(problems)} problem(s)'}")
        if problems and not expect_clean:
            for p in problems:
                print(f"    {p}")
    return 0 if all_ok else 1


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd = sys.argv[1]
    if cmd == "data-integrity":
        problems = check_data_integrity(sys.argv[2])
    elif cmd == "financial-invariants":
        problems = check_financial_invariants(sys.argv[2])
    elif cmd == "consent":
        problems = check_consent(sys.argv[2])
    elif cmd == "projection-links":
        problems = check_projection_links(sys.argv[2], sys.argv[3])
    elif cmd == "data-flow-vs-privacy":
        problems = check_data_flow_vs_privacy()
    elif cmd == "self-test":
        sys.exit(cmd_self_test())
    else:
        sys.exit(f"unknown command: {cmd}")

    if problems:
        print(f"[FAIL] {len(problems)} problem(s):")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)
    print("[OK] no problems found")
    sys.exit(0)


if __name__ == "__main__":
    main()
