#!/usr/bin/env python3
"""
Owner Operations CLI — локальний інструмент, НЕ деплоїться, НЕ публічний
дашборд. Ходить до authenticated ops-* Netlify Functions (X-Admin-Token)
і виводить/зберігає результат ЛОКАЛЬНО. Жодного виводу цього скрипта не
можна комітити -- реальні email/PII у report/backup режимах.

Конфігурація виключно через змінні середовища (ніколи не хардкодиться,
ніколи не в git):
  OPS_BASE_URL    -- напр. https://zapuskbiznesu.netlify.app (обов'язково)
  OPS_ADMIN_TOKEN -- те саме значення, що встановлено в Netlify env
                     ADMIN_TOKEN (обов'язково; O-19 в docs/owner-blockers.md
                     -- власник має встановити його на Netlify, асистент
                     не має доступу до dashboard, щоб зробити це сам)

Лише stdlib (urllib) -- жодної залежності від npm/pip install, узгоджено
з тим, що на цій машині немає Node і script має лишатись портативним.
"""
import json
import os
import sys
import hashlib
import datetime
import urllib.request
import urllib.error
import urllib.parse

def base_url():
    url = os.environ.get("OPS_BASE_URL")
    if not url:
        sys.exit("OPS_BASE_URL не встановлено (напр. https://zapuskbiznesu.netlify.app)")
    return url.rstrip("/")

def admin_token():
    token = os.environ.get("OPS_ADMIN_TOKEN")
    if not token:
        sys.exit(
            "OPS_ADMIN_TOKEN не встановлено. Це та сама змінна, що ADMIN_TOKEN "
            "на Netlify (docs/owner-blockers.md O-19) -- без неї усі ops-* "
            "endpoints повертають 503 admin_token_not_configured за дизайном "
            "(fail-closed), не за помилкою."
        )
    return token

def call(method, path, body=None):
    url = f"{base_url()}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("X-Admin-Token", admin_token())
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            payload = json.loads(e.read().decode("utf-8"))
        except Exception:
            payload = {"error": "non_json_response"}
        return e.code, payload

def mask_email(email):
    if not email or "@" not in email:
        return None
    local, domain = email.split("@", 1)
    return f"{local[:2]}***@{domain}"

# ---------- report ----------

def cmd_report(args):
    status, data = call("GET", "/.netlify/functions/ops-report-data")
    if status != 200:
        print(f"ops-report-data -> HTTP {status}: {data}", file=sys.stderr)
        sys.exit(1)
    out_dir = args.out_dir or ".local/reports"
    os.makedirs(out_dir, exist_ok=True)
    ts = datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    out_path = os.path.join(out_dir, f"owner-ops-report-{ts}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Звіт збережено локально: {out_path}")
    print(f"  Режими: {data.get('modes')}")
    print(f"  Workflow-статуси: {data.get('workflowCounts')}")
    print(f"  Dead-letter: {data.get('deadLetterCount')}, Stale: {data.get('staleCount')}")
    print(f"  Duplicate candidates: {data.get('duplicateCandidateCounts')}")

# ---------- backup ----------

ENTITY_TYPES = ["contact", "support_request", "refund_request", "vip_workflow"]

def cmd_backup(args):
    out_dir = args.out_dir or os.path.join(".local/backups", datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ"))
    os.makedirs(out_dir, exist_ok=True)
    manifest = {"generatedAt": datetime.datetime.utcnow().isoformat() + "Z", "files": []}
    for entity_type in ENTITY_TYPES:
        status, data = call("GET", f"/.netlify/functions/ops-events-export?entityType={entity_type}")
        if status != 200:
            print(f"  {entity_type}: HTTP {status} -- {data} (пропущено)", file=sys.stderr)
            continue
        events = data.get("events", [])
        jsonl_path = os.path.join(out_dir, f"{entity_type}.jsonl")
        with open(jsonl_path, "w", encoding="utf-8") as f:
            for ev in events:
                f.write(json.dumps(ev, ensure_ascii=False) + "\n")
        checksum = hashlib.sha256(open(jsonl_path, "rb").read()).hexdigest()
        manifest["files"].append({
            "entityType": entity_type, "file": f"{entity_type}.jsonl",
            "eventCount": len(events), "sha256": checksum,
        })
        print(f"  {entity_type}: {len(events)} events -> {jsonl_path}")
    manifest_path = os.path.join(out_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"Backup завершено: {out_dir} (manifest.json + checksums)")

# ---------- dead-letter ----------

def cmd_dead_letter(args):
    if args.action == "list":
        status, data = call("GET", "/.netlify/functions/ops-dead-letter?action=list")
        print(json.dumps(data, ensure_ascii=False, indent=2))
    elif args.action == "inspect":
        if not args.workflow_id:
            sys.exit("--workflow-id обов'язковий для inspect")
        status, data = call("GET", f"/.netlify/functions/ops-dead-letter?action=inspect&workflowId={urllib.parse.quote(args.workflow_id)}")
        print(json.dumps(data, ensure_ascii=False, indent=2))
    elif args.action == "cancel":
        if not args.workflow_id:
            sys.exit("--workflow-id обов'язковий для cancel")
        status, data = call("POST", "/.netlify/functions/ops-dead-letter", {
            "action": "cancel", "workflowId": args.workflow_id, "reasonCode": args.reason_code or "owner_cancelled",
        })
        print(json.dumps(data, ensure_ascii=False, indent=2))
    elif args.action == "replay":
        if not args.workflow_id:
            sys.exit("--workflow-id обов'язковий для replay")
        status, data = call("POST", "/.netlify/functions/replay-workflow", {"workflowId": args.workflow_id})
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        sys.exit(f"невідома дія: {args.action}")

# ---------- duplicates ----------

def cmd_duplicates(args):
    if args.action == "list":
        if not args.entity_type:
            sys.exit("--entity-type обов'язковий для list")
        status, data = call("GET", f"/.netlify/functions/ops-duplicates?entityType={args.entity_type}&windowMinutes={args.window_minutes}")
        print(json.dumps(data, ensure_ascii=False, indent=2))
    elif args.action == "decide":
        for req_field in ("entity_type", "entity_id", "decision"):
            if not getattr(args, req_field):
                sys.exit(f"--{req_field.replace('_', '-')} обов'язковий для decide")
        status, data = call("POST", "/.netlify/functions/ops-duplicates", {
            "entityType": args.entity_type, "entityId": args.entity_id,
            "canonicalEntityId": args.canonical_id, "decision": args.decision, "note": args.note,
        })
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        sys.exit(f"невідома дія: {args.action}")

# ---------- projections ----------

def cmd_projections(args):
    if args.action == "check":
        status, data = call("GET", "/.netlify/functions/ops-projections-audit?action=check")
        print(json.dumps(data, ensure_ascii=False, indent=2))
    elif args.action == "rebuild":
        if not args.email:
            sys.exit("--email обов'язковий для rebuild")
        status, data = call("POST", "/.netlify/functions/ops-projections-audit", {"action": "rebuild", "email": args.email})
        print(json.dumps(data, ensure_ascii=False, indent=2))
    elif args.action == "rebuild-all":
        status, data = call("POST", "/.netlify/functions/ops-projections-audit", {"action": "rebuild-all"})
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        sys.exit(f"невідома дія: {args.action}")

def build_parser():
    import argparse
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)

    r = sub.add_parser("report", help="Локальний owner-ops звіт (PII-minimal)")
    r.add_argument("--out-dir")
    r.set_defaults(func=cmd_report)

    b = sub.add_parser("backup", help="Локальний backup усіх events (JSONL+manifest+checksums)")
    b.add_argument("--out-dir")
    b.set_defaults(func=cmd_backup)

    dl = sub.add_parser("dead-letter", help="list/inspect/replay/cancel")
    dl.add_argument("action", choices=["list", "inspect", "replay", "cancel"])
    dl.add_argument("--workflow-id")
    dl.add_argument("--reason-code")
    dl.set_defaults(func=cmd_dead_letter)

    du = sub.add_parser("duplicates", help="list/decide")
    du.add_argument("action", choices=["list", "decide"])
    du.add_argument("--entity-type", choices=["support_request", "refund_request", "vip_workflow"])
    du.add_argument("--entity-id")
    du.add_argument("--canonical-id")
    du.add_argument("--decision", choices=["suspected_duplicate", "confirmed_duplicate", "linked_to_canonical", "merged", "false_positive"])
    du.add_argument("--note")
    du.add_argument("--window-minutes", type=int, default=15)
    du.set_defaults(func=cmd_duplicates)

    pr = sub.add_parser("projections", help="check/rebuild/rebuild-all")
    pr.add_argument("action", choices=["check", "rebuild", "rebuild-all"])
    pr.add_argument("--email")
    pr.set_defaults(func=cmd_projections)

    return p

def main():
    args = build_parser().parse_args()
    args.func(args)

if __name__ == "__main__":
    main()
