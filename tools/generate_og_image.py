"""Генерує og-image.png (1200x630) для соцмережевих прев'ю лендінгу.

Реальне лого (tools/logo-master.png, витягнуто з оригінального brand-kit
зображення) — переважно navy лінії, тому фон paper/світлий (як і в
оригінальному brand-kit референсі та в реальному хедері/футері сайту),
а НЕ navy — на temному тлі navy-лінії лога були б нечитабельні.

Запуск: python tools/generate_og_image.py
Потребує: pip install Pillow (шрифти Inter лежать поруч у tools/fonts/).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "og-image.png"
FONTS = Path(__file__).resolve().parent / "fonts"
LOGO = Path(__file__).resolve().parent / "logo-master.png"

W, H = 1200, 630
PAPER = (247, 242, 232)      # --paper #F7F2E8
PAPER2 = (255, 253, 248)     # --paper2 #FFFDF8
NAVY = (6, 43, 105)          # #062B69 — navy реального лого
GOLD = (217, 164, 65)        # #D9A441 — gold реального лого


def paper_gradient():
    top = Image.new("RGB", (W, H), PAPER2)
    bottom = Image.new("RGB", (W, H), PAPER)
    mask = Image.new("L", (1, H))
    for y in range(H):
        mask.putpixel((0, y), round(255 * y / (H - 1)))
    return Image.composite(bottom, top, mask.resize((W, H)))


def main():
    img = paper_gradient()

    logo = Image.open(LOGO).convert("RGBA")
    logo = logo.resize((160, 160), Image.LANCZOS)
    img.paste(logo, (90, 78), logo)

    bold = ImageFont.truetype(str(FONTS / "Inter-Bold.ttf"), 30)
    semibold = ImageFont.truetype(str(FONTS / "Inter-SemiBold.ttf"), 26)
    headline_font = ImageFont.truetype(str(FONTS / "Inter-Bold.ttf"), 64)

    d = ImageDraw.Draw(img)
    d.text((270, 118), "Антихаос", font=bold, fill=NAVY)
    d.text((270, 158), "для Онлайн-Підприємця", font=semibold, fill=GOLD)

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
