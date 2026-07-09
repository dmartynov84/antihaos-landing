"""Генерує favicon PNG (16/32/180) і assets/logo/antihaos-icon.png з реального
майстер-лого tools/logo-master.png (витягнуто й обрізано з оригінального
brand-kit зображення "лого на використання/1/...(3).png", chroma-key на
білому тлі — НЕ перемальовується вручну, щоб не повторити помилку
кольорів/деталей, як у попередній Pillow-версії цього скрипта).

Запуск: python tools/generate_favicon.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MASTER = Path(__file__).resolve().parent / "logo-master.png"
OUT = ROOT / "assets" / "logo"


def main():
    master = Image.open(MASTER).convert("RGBA")
    for size, name in [
        (480, "antihaos-icon.png"),
        (180, "apple-touch-icon.png"),
        (32, "favicon-32.png"),
        (16, "favicon-16.png"),
    ]:
        resized = master.resize((size, size), Image.LANCZOS)
        resized.save(OUT / name)
        print(f"saved {name} ({size}x{size})")


if __name__ == "__main__":
    main()
