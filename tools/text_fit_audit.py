#!/usr/bin/env python3
"""
Responsive text-fit audit (RESPONSIVE TYPOGRAPHY & CONTENT FIT цикл,
§12 задання). Реальний browser render через Playwright (Python,
.venv-tools) -- НЕ перевірка лише source. Для кожної публічної
сторінки й кожного viewport з матриці:
  - чекає document.fonts.ready
  - реально прокручує сторінку до кінця (щоб scroll-reveal встиг)
  - чекає завершення reveal-анімацій
  - evaluate() шукає horizontal overflow / vertical clipping /
    nowrap-overflow / hidden-by-ellipsis / outside-viewport
  - зберігає screenshot у .local/text-fit-audit/ (gitignored)

Селектори адаптовано до РЕАЛЬНИХ класів цього проєкту (style.css),
не generic-список із завдання.
"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO_ROOT, ".local", "text-fit-audit")
BASE_URL = os.environ.get("AUDIT_BASE_URL", "https://zapuskbiznesu.netlify.app")

PAGES = [
    ("index", "/"),
    ("starter", "/starter"),
    ("pro", "/pro"),
    ("vip", "/vip"),
    ("privacy", "/privacy.html"),
    ("refund", "/refund.html"),
    ("thank-you", "/thank-you.html"),
]

VIEWPORTS = [
    ("320x568", 320, 568),
    ("360x800", 360, 800),
    ("375x812", 375, 812),
    ("390x844", 390, 844),
    ("430x932", 430, 932),
    ("568x320-landscape", 568, 320),
    ("768x1024", 768, 1024),
    ("820x1180", 820, 1180),
    ("1024x768", 1024, 768),
    ("1280x800", 1280, 800),
    ("1440x900", 1440, 900),
    ("1920x1080", 1920, 1080),
]

SELECTORS = [
    "h1", "h2", "h3", "h4", "p", "li", "a", "button",
    ".problem", ".step", ".step-outcome", ".price-card", ".price-card .price",
    ".preview-card", ".proof-card", ".faq-card", ".footer",
    ".btn", ".fit-chip", ".fit-formula", ".proof-pill", ".os-row", ".os-status",
    ".file-row", ".pro-row", ".hero-card", ".step-detail", ".product-detail",
    ".eyebrow", ".score-head", ".cta-band", ".label", ".brand-copy",
    ".route-node", ".route-label", ".menu a", ".breadcrumb", ".price",
    ".features li", ".notice", ".faq-card summary",
]

# Allowlist: елементи, де "overflow" -- НАВМИСНА поведінка, не баг.
# Кожен запис має обґрунтування (§12 завдання вимагає це явно).
ALLOWLIST = {
    "hp-field": "Honeypot-поле анти-спам форми (netlify-honeypot) -- навмисно "
                "приховане за межами екрана (aria-hidden), не має бути видимим "
                "чи 'вміщатись' взагалі. Це очікувана поведінка, не дефект.",
}

def is_allowlisted(selector):
    for token, _reason in ALLOWLIST.items():
        if token in selector:
            return True
    return False

EVAL_JS = """
(selectors) => {
  const els = document.querySelectorAll(selectors.join(','));
  const out = [];
  for (const el of els) {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const problems = [];
    if (el.scrollWidth > el.clientWidth + 1) problems.push('horizontal-content-overflow');
    if (el.scrollHeight > el.clientHeight + 1 && ['hidden','clip'].includes(style.overflowY)) problems.push('vertical-text-clipping');
    if (style.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 1) problems.push('nowrap-overflow');
    if (style.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) problems.push('hidden-by-ellipsis');
    if (rect.right > window.innerWidth + 1 || rect.left < -1) problems.push('outside-viewport');
    if (problems.length) {
      out.push({
        selector: el.className || el.tagName,
        text: (el.textContent || '').trim().slice(0, 160),
        problems,
        rect: { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top) },
      });
    }
  }
  const pageOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  return { pageOverflow, elements: out };
}
"""

def audit_page(page, page_name, path, viewport_name, width, height, screenshot=True):
    page.set_viewport_size({"width": width, "height": height})
    page.goto(f"{BASE_URL}{path}", wait_until="networkidle")
    page.evaluate("document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()")
    # реально прокрутити до кінця, дати scroll-reveal спрацювати
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(700)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(500)

    result = page.evaluate(EVAL_JS, SELECTORS)
    result["elements"] = [el for el in result["elements"] if not is_allowlisted(el["selector"])]

    if screenshot:
        os.makedirs(OUT_DIR, exist_ok=True)
        shot_path = os.path.join(OUT_DIR, f"{page_name}__{viewport_name}.png")
        page.screenshot(path=shot_path, full_page=True)

    return result

def main():
    only_pages = sys.argv[1].split(",") if len(sys.argv) > 1 else None
    only_viewports = sys.argv[2].split(",") if len(sys.argv) > 2 else None

    findings = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for page_name, path in PAGES:
            if only_pages and page_name not in only_pages:
                continue
            for viewport_name, w, h in VIEWPORTS:
                if only_viewports and viewport_name not in only_viewports:
                    continue
                try:
                    result = audit_page(page, page_name, path, viewport_name, w, h)
                except Exception as e:
                    print(f"[ERROR] {page_name} {viewport_name}: {e}", file=sys.stderr)
                    continue
                if result["pageOverflow"] or result["elements"]:
                    print(f"[ISSUE] {page_name} @ {viewport_name}: pageOverflow={result['pageOverflow']}, elements={len(result['elements'])}")
                    for el in result["elements"][:20]:
                        print(f"    {el['selector']}: {el['problems']} -- {el['text'][:80]!r}")
                    findings.append({"page": page_name, "viewport": viewport_name, **result})
                else:
                    print(f"[OK] {page_name} @ {viewport_name}")
        browser.close()

    os.makedirs(OUT_DIR, exist_ok=True)
    out_json = os.path.join(OUT_DIR, "findings.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(findings, f, ensure_ascii=False, indent=2)
    print(f"\n{len(findings)} page/viewport combos with issues. Details: {out_json}")

if __name__ == "__main__":
    main()
