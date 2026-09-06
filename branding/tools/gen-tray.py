#!/usr/bin/env python3
"""Generate the Side Audio Bot macOS tray template PNGs.

Design: a filled orb (the assistant) with two wave arcs on its right —
"audio from the side". Deliberately different from the upstream glyph
(outline circle with a heartbeat-style waveform) so the tray is visually
isolated from the upstream product.

The PNGs are macOS template images: black + alpha only; macOS tints them
for light/dark menu bars. Rendered supersampled, downscaled with Lanczos.

Usage: python3 branding/tools/gen-tray.py
Writes: branding/overlay/desktop/build/trayTemplate.png (18px)
        branding/overlay/desktop/build/trayTemplate@2x.png (36px)
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]  # branding/
OUT = ROOT / "overlay" / "desktop" / "build"
GRID = 36  # design grid, mirrors trayTemplate.svg
S = 16  # supersample factor
SIZE = GRID * S

ORB_CENTER = (14, 18)
ORB_RADIUS = 9
ARCS = [(13, 45, 3.2), (17, 45, 3.2)]  # (radius, half-sweep deg, stroke on the 36 grid)

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
cx, cy = ORB_CENTER[0] * S, ORB_CENTER[1] * S
r = ORB_RADIUS * S
draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 0, 0, 255))
for radius, sweep, stroke in ARCS:
    rr = radius * S
    width = max(1, round(stroke * S / GRID))
    draw.arc([cx - rr, cy - rr, cx + rr, cy + rr], start=-sweep, end=sweep, fill=(0, 0, 0, 255), width=width)

OUT.mkdir(parents=True, exist_ok=True)
for target, name in ((36, "trayTemplate@2x.png"), (18, "trayTemplate.png")):
    small = img.resize((target, target), Image.LANCZOS)
    small.save(OUT / name)
    print(f"wrote {OUT / name} ({target}x{target})")
