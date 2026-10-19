#!/usr/bin/env python3
"""Regenera la marca de Dual Tracker (conceptos A y D).

Fuente de geometría: la misma que produjo las propuestas (resvg + Pillow).
Escribe los SVG en assets/brand/ y los PNG que consume app.json.

  python3 -m pip install resvg-py pillow
  python3 scripts/brand/build.py

El splash nativo es la marca A centrada sobre obsidian #050505. No hay variante
clara: app.json fija userInterfaceStyle en "dark" y el splash del sistema no
cambia con la paleta de JS.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

try:
    import resvg_py
    from PIL import Image
except ImportError:
    sys.stderr.write("Faltan dependencias. Instala: python3 -m pip install resvg-py pillow\n")
    raise SystemExit(1)

import io

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "assets" / "brand"
IMAGES = ROOT / "assets" / "images"

OBSIDIAN = (0x05, 0x05, 0x05, 255)
GOLD = "#C5A059"
WHITE = "#FFFFFF"
SECONDARY = "#A0A0A0"
CARBON = "#161616"
OBS = "#050505"


def pin(cx: float, cy: float, r: float, tipy: float) -> str:
    d = tipy - cy
    a = math.acos(r / d)
    x = r * math.sin(a)
    y = r * math.cos(a)
    return f"M {cx - x:.1f},{cy + y:.1f} A {r} {r} 0 1 1 {cx + x:.1f},{cy + y:.1f} L {cx},{tipy} Z"


def foreground(key: str, g: str, w: str, s: str) -> str:
    if key == "A":
        p = pin(512, 440, 200, 790)
        return (
            f'<path d="{p}" fill="none" stroke="{g}" stroke-width="56" stroke-linejoin="round"/>\n'
            f'<path d="M512,440 L512,342 M512,440 L582,486" fill="none" stroke="{w}" stroke-width="44" stroke-linecap="round"/>\n'
            f'<circle cx="512" cy="440" r="30" fill="{g}"/>'
        )
    if key == "D":
        p = pin(512, 420, 190, 760)
        return (
            '<defs><mask id="mD" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">'
            '<rect width="1024" height="1024" fill="#fff"/>\n'
            '<path d="M432,428 L488,484 L596,376" fill="none" stroke="#000" stroke-width="60" '
            'stroke-linecap="round" stroke-linejoin="round"/></mask></defs>\n'
            f'<path d="{p}" fill="{g}" stroke="{g}" stroke-width="24" stroke-linejoin="round" mask="url(#mD)"/>\n'
            f'<path d="M432,812 L592,812" stroke="{s}" stroke-width="40" stroke-linecap="round"/>'
        )
    raise KeyError(key)


def svg_doc(key: str, bg: bool = True, mono: bool = False) -> str:
    g, w, s = (WHITE, WHITE, WHITE) if mono else (GOLD, WHITE, SECONDARY)
    back = ""
    if bg:
        back = (
            f'<defs><radialGradient id="bg" cx="50%" cy="38%" r="75%">'
            f'<stop offset="0" stop-color="{CARBON}"/>'
            f'<stop offset="1" stop-color="{OBS}"/></radialGradient></defs>\n'
            f'<rect width="1024" height="1024" fill="url(#bg)"/>'
        )
    body = foreground(key, g, w, s)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
        f"{back}{body}</svg>\n"
    )


def render(svg: str, size: int) -> Image.Image:
    raw = resvg_py.svg_to_bytes(svg_string=svg, width=size, height=size, skip_system_fonts=True)
    return Image.open(io.BytesIO(bytes(raw))).convert("RGBA")


def force_white(im: Image.Image) -> Image.Image:
    """Silueta blanca: Android tiñe el icono de notificación y el monocromo por el alfa."""
    im = im.convert("RGBA")
    _, _, _, alpha = im.split()
    white = Image.new("L", im.size, 255)
    return Image.merge("RGBA", (white, white, white, alpha))


def assert_white(im: Image.Image, label: str) -> None:
    raw = im.convert("RGBA").tobytes()
    bad = 0
    for i in range(0, len(raw), 4):
        r, g, b, a = raw[i : i + 4]
        if a and (r != 255 or g != 255 or b != 255):
            bad += 1
            if bad > 8:
                break
    if bad:
        raise SystemExit(f"{label}: hay pixeles que no son blanco con alfa ({bad}+)")


def flatten(im: Image.Image, bg: tuple[int, int, int, int]) -> Image.Image:
    base = Image.new("RGBA", im.size, bg)
    base.alpha_composite(im)
    return base.convert("RGB")


def write_svg(folder: Path, name: str, text: str) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_text(text, encoding="utf-8")


def main() -> None:
    IMAGES.mkdir(parents=True, exist_ok=True)
    for key in ("A", "D"):
        folder = BRAND / key
        write_svg(folder, "icon.svg", svg_doc(key, bg=True))
        write_svg(folder, "adaptive-foreground.svg", svg_doc(key, bg=False))
        write_svg(folder, "monochrome.svg", svg_doc(key, bg=False, mono=True))

    icon = flatten(render(svg_doc("A", bg=True), 1024), OBSIDIAN)
    icon.save(IMAGES / "icon.png", optimize=True)
    icon.resize((48, 48), Image.Resampling.LANCZOS).save(IMAGES / "favicon.png", optimize=True)

    fg = render(svg_doc("A", bg=False), 1024)
    fg.save(IMAGES / "adaptive-icon.png", optimize=True)

    mono = force_white(render(svg_doc("A", bg=False, mono=True), 1024))
    assert_white(mono, "adaptive-monochrome")
    mono.save(IMAGES / "adaptive-monochrome.png", optimize=True)

    splash = Image.new("RGBA", (1284, 1284), OBSIDIAN)
    splash.alpha_composite(fg, ((1284 - 1024) // 2, (1284 - 1024) // 2))
    splash.convert("RGB").save(IMAGES / "splash.png", optimize=True)

    note = force_white(render(svg_doc("D", bg=False, mono=True), 96))
    assert_white(note, "notification-icon")
    note.save(IMAGES / "notification-icon.png", optimize=True)

    print("marca A → assets/images/icon.png, adaptive-icon.png, adaptive-monochrome.png, splash.png, favicon.png")
    print("marca D → assets/images/notification-icon.png")
    print("svg → assets/brand/A assets/brand/D")


if __name__ == "__main__":
    main()
