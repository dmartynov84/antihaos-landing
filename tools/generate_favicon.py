"""Генерує favicon PNG (16/32/180) з того самого значка, що й у хедері
(assets/logo/antihaos-icon.svg), тим самим arc-to-center підходом, що
tools/generate_og_image.py (нема cairosvg в оточенні).

Запуск: python tools/generate_og_image.py вже містить свою копію
svg_arc_to_center — цей скрипт має власну (незалежну від og-image).
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "logo"

GOLD = (217, 164, 65)   # #D9A441 — точний HEX з набору лого
NAVY = (6, 43, 105)     # #062B69

ARCS = [
    (106, 42, 36, 118, 82),
    (46, 158, 100, 204, 82),
    (150, 202, 198, 154, 82),
    (196, 108, 178, 68, 82),
]
PEAK = [(88, 154), (122, 88), (162, 154)]
DOT = (122, 152, 9)
FLAG = [(160, 76), (185, 52), (185, 75)]


def svg_arc_to_center(x1, y1, x2, y2, r):
    x1p, y1p = (x1 - x2) / 2, (y1 - y2) / 2
    num = max(r * r * r * r - r * r * y1p * y1p - r * r * x1p * x1p, 0)
    den = r * r * y1p * y1p + r * r * x1p * x1p
    co = math.sqrt(num / den) if den else 0
    cxp, cyp = co * y1p, -co * x1p
    cx, cy = cxp + (x1 + x2) / 2, cyp + (y1 + y2) / 2

    def ang(ux, uy, vx, vy):
        dot = ux * vx + uy * vy
        length = math.hypot(ux, uy) * math.hypot(vx, vy)
        a = math.degrees(math.acos(max(-1, min(1, dot / length))))
        return -a if (ux * vy - uy * vx) < 0 else a

    theta1 = ang(1, 0, (x1p - cxp) / r, (y1p - cyp) / r)
    dtheta = ang((x1p - cxp) / r, (y1p - cyp) / r, (-x1p - cxp) / r, (-y1p - cyp) / r)
    return cx, cy, theta1, theta1 + dtheta


def draw_icon(size):
    scale = size / 240
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def tp(x, y):
        return (x * scale, y * scale)

    for x1, y1, x2, y2, r in ARCS:
        cx, cy, a1, a2 = svg_arc_to_center(x1, y1, x2, y2, r)
        p0 = tp(cx - r, cy - r)
        p1 = tp(cx + r, cy + r)
        d.arc([p0[0], p0[1], p1[0], p1[1]], min(a1, a2), max(a1, a2),
              fill=GOLD, width=max(1, round(10 * scale)))

    width_peak = max(1, round(16 * scale))
    d.line([tp(*p) for p in PEAK], fill=NAVY, width=width_peak, joint="curve")
    for p in PEAK:
        rj = width_peak / 2
        cx, cy = tp(*p)
        d.ellipse([cx - rj, cy - rj, cx + rj, cy + rj], fill=NAVY)

    cx, cy, r = DOT
    cx, cy = tp(cx, cy)
    d.ellipse([cx - r * scale, cy - r * scale, cx + r * scale, cy + r * scale], fill=GOLD)

    d.line([tp(*p) for p in FLAG], fill=GOLD, width=max(1, round(7 * scale)), joint="curve")
    return img


def main():
    for size, name in [(16, "favicon-16.png"), (32, "favicon-32.png"), (180, "apple-touch-icon.png")]:
        img = draw_icon(size)
        img.save(OUT / name, "PNG")
        print(f"saved {name} ({size}x{size})")


if __name__ == "__main__":
    main()
