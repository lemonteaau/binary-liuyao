"""Generate site icons from the same pixel SVG used by the header.

Requires Pillow and Playwright with Chromium installed.
Run: python3 scripts/generate-site-icons.py
"""

from io import BytesIO
from pathlib import Path
from shutil import copyfile

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src/assets/taiji.svg'
PUBLIC = ROOT / 'public'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 256, 'height': 256}, device_scale_factor=1)
    page.goto(SOURCE.as_uri())
    pixels = page.locator('svg').screenshot(omit_background=True)
    browser.close()

icon = Image.open(BytesIO(pixels)).convert('RGBA')
icon.save(PUBLIC / 'favicon.png')
copyfile(SOURCE, PUBLIC / 'favicon.svg')
sizes = [16, 32, 48, 64, 256]
ico_images = [icon.resize((size, size), Image.Resampling.NEAREST) for size in sizes]
ico_images[-1].save(
    PUBLIC / 'favicon.ico', format='ICO', sizes=[(size, size) for size in sizes],
    append_images=ico_images[:-1],
)
for filename, size in [('apple-touch-icon.png', 180), ('icon-192.png', 192), ('icon-512.png', 512)]:
    # Keep home-screen icons opaque with ample space around the mark.
    canvas = Image.new('RGBA', (size, size), '#040807')
    # Multiples of 16 keep the eyes and stepped edges on matching pixel grids.
    mark_size = round(size * 0.8 / 16) * 16
    mark = icon.resize((mark_size, mark_size), Image.Resampling.NEAREST)
    offset = (size - mark_size) // 2
    canvas.alpha_composite(mark, (offset, offset))
    canvas.convert('RGB').save(PUBLIC / filename)
print('Generated SVG, ICO, PNG, Apple touch, and 192/512 app icons.')
