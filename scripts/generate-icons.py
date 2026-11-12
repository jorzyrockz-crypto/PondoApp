#!/usr/bin/env python3
"""Regenerate Pondo's icon assets from assets/icon-source/master-icon.png.

Requires Pillow: python -m pip install Pillow
The master is the supplied artwork cropped to its rounded-square silhouette.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
master = Image.open(ROOT / 'assets/icon-source/master-icon.png').convert('RGBA')
resample = Image.Resampling.LANCZOS
background = (247, 247, 245, 255)


def scaled(size):
    return master.resize((size, size), resample)


def save_png(path, image):
    image.save(ROOT / path, 'PNG', optimize=True)


def on_background(size, artwork_size):
    canvas = Image.new('RGBA', (size, size), background)
    image = scaled(artwork_size)
    offset = (size - artwork_size) // 2
    canvas.alpha_composite(image, (offset, offset))
    return canvas


sizes = (72, 96, 128, 144, 152, 192, 256, 384, 512)
for size in sizes:
    image = scaled(size)
    save_png(f'icons/icon-{size}.png', image)
    save_png(f'icons/rounded/icon-{size}.png', image)
for size in (16, 32, 48):
    image = scaled(size)
    save_png(f'icons/favicon-{size}x{size}.png', image)
    save_png(f'icons/rounded/favicon-{size}x{size}.png', image)
# ICO contains multiple sizes for browser and operating-system selection.
icon = scaled(256)
for path in ('favicon.ico', 'icons/rounded/favicon.ico'):
    icon.save(ROOT / path, format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
# Maskable safe zone is the central circle with radius 40% of the icon size.
# A square at 55% of the canvas fits fully inside that circle, including corners.
for size in (192, 512):
    save_png(f'icons/icon-{size}-maskable.png', on_background(size, round(size * 0.55)))
# iOS touch icons and Microsoft tiles use an opaque background.
save_png('icons/apple-touch-icon.png', on_background(180, 180))
for size in (70, 150, 310):
    save_png(f'icons/mstile-{size}x{size}.png', on_background(size, size))
wide = Image.new('RGBA', (310, 150), background)
wide.alpha_composite(scaled(150), (80, 0))
save_png('icons/mstile-310x150.png', wide)
