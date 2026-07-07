"""Генерує og-image.png (1200x630) для соцмережевих прев'ю лендінгу.

Логотип — точна копія brand-mark, який вже живе інлайн-SVG в index.html
(viewBox 0 0 240 240, ті самі координати/кольори), відрендерена через Pillow
(без залежності від cairosvg, якого нема в оточенні). Палітра й headline —
з v7_true_redesign (style.css :root, hero h1 mobile-варіант).

Запуск: python tools/generate_og_image.py
Потребує: pip install Pillow (шрифти Inter лежать поруч у tools/fonts/).
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "og-image.png"
FONTS = Path(__file__).resolve().parent / "fonts"

W, H = 1200, 630
PAPER = (247, 242, 232)      # --paper #F7F2E8
PAPER2 = (255, 253, 248)     # --paper2 #FFFDF8
NAVY = (11, 35, 65)          # --ink #0B2341
GOLD = (197, 139, 43)        # --gold #C58B2B

# Точні шляхи brand-mark з index.html (viewBox 0 0 240 240).
ARCS = [  # (x1, y1, x2, y2, r) — усі "A r r 0 0 0" (large-arc=0, sweep=0)
    (106, 42, 36, 118, 82),
    (46, 158, 100, 204, 82),
    (150, 202, 198, 154, 82),
    (196, 108, 178, 68, 82),
]
PEAK = [(88, 154), (122, 88), (162, 154)]
DOT = (122, 152, 9)
FLAG = [(160, 76), (185, 52), (185, 75)]


def svg_arc_to_center(x1, y1, x2, y2, r):
    """Ендпоінт->центр параметризація для кола (rx=ry=r), large-arc=0, sweep=0."""
    x1p, y1p = (x1 - x2) / 2, (y1 - y2) / 2
    num = max(r * r * r * r - r * r * y1p * y1p - r * r * x1p * x1p, 0)
    den = r * r * y1p * y1p + r * r * x1p * x1p
    co = math.sqrt(num / den) if den else 0
    # large_arc_flag(0) != sweep_flag(0) -> sign +1
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


def draw_logo(canvas, ox, oy, scale):
    d = ImageDraw.Draw(canvas)

    def tp(x, y):
        return (ox + x * scale, oy + y * scale)

    for x1, y1, x2, y2, r in ARCS:
        cx, cy, a1, a2 = svg_arc_to_center(x1, y1, x2, y2, r)
        bbox = [tp(cx - r, cy - r), tp(cx + r, cy + r)]
        bbox = [bbox[0][0], bbox[0][1], bbox[1][0], bbox[1][1]]
        d.arc(bbox, min(a1, a2), max(a1, a2), fill=GOLD, width=max(2, round(10 * scale)))

    d.line([tp(*p) for p in PEAK], fill=NAVY, width=max(3, round(16 * scale)), joint="curve")
    for p in PEAK:
        rjoin = max(3, round(16 * scale)) / 2
        cx, cy = tp(*p)
        d.ellipse([cx - rjoin, cy - rjoin, cx + rjoin, cy + rjoin], fill=NAVY)

    cx, cy, r = DOT
    cx, cy = tp(cx, cy)
    d.ellipse([cx - r * scale, cy - r * scale, cx + r * scale, cy + r * scale], fill=GOLD)

    d.line([tp(*p) for p in FLAG], fill=GOLD, width=max(2, round(7 * scale)), joint="curve")


def paper_gradient():
    """Вертикальний градієнт paper2 -> paper, як body{background} в style.css."""
    top = Image.new("RGB", (W, H), PAPER2)
    bottom = Image.new("RGB", (W, H), PAPER)
    mask = Image.new("L", (1, H))
    for y in range(H):
        mask.putpixel((0, y), round(255 * y / (H - 1)))
    return Image.composite(bottom, top, mask.resize((W, H)))


def main():
    img = paper_gradient()
    draw_logo(img, 90, 78, 0.62)

    bold = ImageFont.truetype(str(FONTS / "Inter-Bold.ttf"), 30)
    semibold = ImageFont.truetype(str(FONTS / "Inter-SemiBold.ttf"), 26)
    headline_font = ImageFont.truetype(str(FONTS / "Inter-Bold.ttf"), 64)

    d = ImageDraw.Draw(img)
    d.text((240, 118), "Антихаос", font=bold, fill=NAVY)
    d.text((240, 158), "для Онлайн-Підприємця", font=semibold, fill=GOLD)

    eyebrow = "ДЛЯ ЕКСПЕРТІВ, ФРІЛАНСЕРІВ І АВТОРІВ ЦИФРОВИХ ПРОДУКТІВ"
    d.text((90, 300), eyebrow, font=semibold, fill=GOLD)

    line1, line2 = "Запусти цифровий продукт", "без хаосу"
    d.text((90, 350), line1, font=headline_font, fill=NAVY)
    d.text((90, 350 + 78), line2, font=headline_font, fill=GOLD)

    rule_y = 350 + 78 + 90
    d.line([(90, rule_y), (90 + 340, rule_y)], fill=GOLD, width=4)

    img.save(OUT, "PNG", optimize=True)
    print(f"Saved {OUT} ({OUT.stat().st_size / 1024:.1f} KB, {img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    main()
