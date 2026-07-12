#!/usr/bin/env python3
"""
Static repo audits, призначені для CI (.github/workflows/ci.yml) і
локального запуску перед комітом. Кожна перевірка -- реальна, не stub:
читає файли й падає з ненульовим exit code, якщо знаходить проблему.

Підкоманди:
  admin-endpoints -- кожен endpoint, названий як "внутрішній/адмінський"
                     (ops-*.js, crm-lookup.js, replay-workflow.js), МАЄ
                     містити виклик requireAdmin(event). Це прямий
                     regression-гард проти класу бага, знайденого й
                     виправленого AUTOMATION OPERATIONS циклом
                     (crm-lookup.js без auth -- CRITICAL).
  secrets         -- явні патерни секретів (API-ключі, private key
                     блоки, sk_live_ тощо) у відстежуваних файлах.
  pii             -- email-адреси поза відомими тестовими доменами
                     (example.com, qa-*) у коді/доках.
  paid-files      -- жодного файлу з іменем, що збігається з реальними
                     платними PRO/VIP/Starter delivery-файлами, у
                     публічно роздаваному дереві цього репозиторію.
"""
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUNCTIONS_DIR = os.path.join(REPO_ROOT, "netlify", "functions")

ADMIN_ONLY_PREFIXES = ("ops-",)
ADMIN_ONLY_EXPLICIT = {"crm-lookup.js", "replay-workflow.js"}

def list_function_files():
    if not os.path.isdir(FUNCTIONS_DIR):
        return []
    return sorted(
        f for f in os.listdir(FUNCTIONS_DIR)
        if f.endswith(".js") and os.path.isfile(os.path.join(FUNCTIONS_DIR, f))
    )

REQUIRE_ADMIN_CALL_RE = re.compile(r"\brequireAdmin\s*\(")

def audit_admin_endpoints():
    problems = []
    for fname in list_function_files():
        is_admin_only = fname.startswith(ADMIN_ONLY_PREFIXES) or fname in ADMIN_ONLY_EXPLICIT
        if not is_admin_only:
            continue
        path = os.path.join(FUNCTIONS_DIR, fname)
        content = open(path, encoding="utf-8").read()
        # \b word-boundary регекс, НЕ підрядок -- "DISABLED_requireAdmin("
        # усе ще МІСТИТЬ підрядок "requireAdmin(", але це не справжній
        # виклик функції. Перевірено живим тестом цього циклу: перша
        # версія (простий "in content") пропустила симульовану регресію.
        if not REQUIRE_ADMIN_CALL_RE.search(content):
            problems.append(f"{fname}: named as admin-only but does NOT call requireAdmin(event)")
    return problems

SECRET_PATTERNS = [
    (re.compile(r"sk_live_[A-Za-z0-9]{10,}"), "Stripe-подібний live secret key"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AWS access key ID"),
    (re.compile(r"-----BEGIN (RSA |EC )?PRIVATE KEY-----"), "приватний ключ у відкритому вигляді"),
    (re.compile(r"(?i)admin_token\s*[:=]\s*[\"'][^\"'\s]{6,}[\"']"), "хардкоджений ADMIN_TOKEN"),
]
SKIP_DIRS = {".git", "node_modules", ".netlify", ".local", ".venv-tools", "venv", "__pycache__"}

def walk_repo_files():
    for root, dirs, files in os.walk(REPO_ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.endswith((".js", ".py", ".md", ".html", ".toml", ".json")):
                yield os.path.join(root, f)

def audit_secrets():
    problems = []
    for path in walk_repo_files():
        try:
            content = open(path, encoding="utf-8", errors="ignore").read()
        except Exception:
            continue
        for pattern, label in SECRET_PATTERNS:
            if pattern.search(content):
                problems.append(f"{os.path.relpath(path, REPO_ROOT)}: {label}")
    return problems

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
ALLOWED_TEST_DOMAINS_RE = re.compile(r"@example\.(com|org|net)$", re.IGNORECASE)
ALLOWED_LOCAL_PREFIXES = ("qa-", "test", "noreply", "support", "info", "hello", "owner", "office")
# Реальна публічна бізнес-адреса власника, навмисно видима на маркетингових
# сторінках (index/privacy/pro/refund/starter/vip.html) -- це НЕ витік PII
# клієнта, це задокументований контакт бізнесу. Явний allowlist, не
# мовчазний виняток -- якщо власник колись змінить адресу, цей рядок
# теж треба оновити.
ALLOWED_BUSINESS_EMAILS = {"antyhaos.marketing@gmail.com"}

def audit_pii():
    problems = []
    for path in walk_repo_files():
        try:
            content = open(path, encoding="utf-8", errors="ignore").read()
        except Exception:
            continue
        for match in EMAIL_RE.findall(content):
            if ALLOWED_TEST_DOMAINS_RE.search(match):
                continue
            if match.lower() in ALLOWED_BUSINESS_EMAILS:
                continue
            local = match.split("@")[0].lower()
            if any(local.startswith(p) for p in ALLOWED_LOCAL_PREFIXES):
                continue
            if "fonts.g" in match or "googleapis" in match:
                continue
            problems.append(f"{os.path.relpath(path, REPO_ROOT)}: {match} (не test-домен/префікс/allowlist)")
    return problems

KNOWN_PAID_FILENAMES = {
    "pro-package.zip", "vip-package.zip", "starter-package.zip",
    "pro.pdf", "vip.pdf", "starter.pdf",
}

def audit_paid_files():
    problems = []
    for root, dirs, files in os.walk(REPO_ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.lower() in KNOWN_PAID_FILENAMES:
                problems.append(f"{os.path.relpath(os.path.join(root, f), REPO_ROOT)}: ім'я файлу збігається з відомим платним delivery-файлом")
    return problems

LIVE_FLAG_DEFAULT_CHECKS = [
    ("netlify/functions/_lib/mode.js", r'process\.env\.CHECKOUT_MODE\s*\|\|\s*["\']disabled["\']', "CHECKOUT_MODE fallback має лишатись \"disabled\""),
    ("netlify/functions/_lib/automation-mode.js", r'"AUTOMATION_MODE".*?,\s*"mock"\)', "AUTOMATION_MODE fallback має лишатись \"mock\""),
    ("netlify/functions/_lib/automation-mode.js", r'"CRM_MODE".*?,\s*"mock"\)', "CRM_MODE fallback має лишатись \"mock\""),
    ("netlify/functions/_lib/automation-mode.js", r'"EMAIL_MODE".*?,\s*"sink"\)', "EMAIL_MODE fallback має лишатись \"sink\""),
]

def audit_live_flags():
    problems = []
    for rel_path, pattern, label in LIVE_FLAG_DEFAULT_CHECKS:
        path = os.path.join(REPO_ROOT, rel_path)
        if not os.path.isfile(path):
            problems.append(f"{rel_path}: файл не знайдено (audit застарів чи файл видалено?)")
            continue
        content = open(path, encoding="utf-8").read()
        if not re.search(pattern, content):
            problems.append(f"{rel_path}: {label} -- патерн безпечного дефолту НЕ знайдено (перевір, чи хтось не змінив fallback на live)")
    return problems

AUDITS = {
    "admin-endpoints": audit_admin_endpoints,
    "secrets": audit_secrets,
    "pii": audit_pii,
    "paid-files": audit_paid_files,
    "live-flags": audit_live_flags,
}

def main():
    if len(sys.argv) < 2 or sys.argv[1] not in AUDITS and sys.argv[1] != "all":
        sys.exit(f"usage: audit_cli.py <{'|'.join(list(AUDITS) + ['all'])}>")

    targets = list(AUDITS) if sys.argv[1] == "all" else [sys.argv[1]]
    any_problems = False
    for name in targets:
        problems = AUDITS[name]()
        if problems:
            any_problems = True
            print(f"[FAIL] {name}: {len(problems)} problem(s)")
            for p in problems:
                print(f"  - {p}")
        else:
            print(f"[OK] {name}: no problems found")
    sys.exit(1 if any_problems else 0)

if __name__ == "__main__":
    main()
