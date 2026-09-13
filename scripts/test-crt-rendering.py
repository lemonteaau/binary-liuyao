"""Compare CRT sweep pixels and interactions against the previous CSS.

Run against a production preview with Python Playwright and Pillow installed.
Headless rAF timing does not reproduce native Firefox's compositor stalls;
measure performance separately in a foreground browser at the affected resolution.
"""
import argparse
import io
from urllib.parse import urlparse

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:42813')
parser.add_argument('--browser', choices=['chromium', 'firefox', 'webkit'], default='firefox')
args = parser.parse_args()
base = args.url.rstrip('/')
assert urlparse(base).hostname in ['127.0.0.1', 'localhost'], 'Use a local preview'

with sync_playwright() as p:
    browser = getattr(p, args.browser).launch(headless=True)
    for width, height in [(1280, 900), (390, 844)]:
        ctx = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=2)
        ctx.add_init_script("sessionStorage.setItem('hex64.booted','1')")

        def intercept(route):
            url = urlparse(route.request.url)
            if url.hostname not in ['127.0.0.1', 'localhost'] or url.path.startswith('/x/'):
                route.fulfill(content_type='application/javascript', body='')
            elif url.path.startswith('/api/'):
                route.fulfill(content_type='application/json', body='{"ordinal":1354}')
            else:
                # Also works with WebKit runtimes that cannot reach loopback directly.
                route.fulfill(response=route.fetch())

        ctx.route('**/*', intercept)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.clock.set_fixed_time(1787553757000)

        def compare(label, time=3000, tolerance=0):
            freeze = '''async t => {
                await document.fonts.ready;
                const animations = document.getAnimations();
                animations.forEach(a => a.pause());
                await Promise.all(animations.map(a => a.ready));
                animations.forEach(a => { a.currentTime = t });
            }'''
            page.evaluate(freeze, time)
            expected_timing = 'steps(255)' if args.browser == 'firefox' else 'linear'
            expect(page.locator('.fx-roll')).to_have_css('animation-timing-function', expected_timing)
            after = Image.open(io.BytesIO(page.screenshot())).convert('RGB')
            old = page.add_style_tag(content='.fx-roll{animation-timing-function:linear!important}')
            page.evaluate(freeze, time)
            before = Image.open(io.BytesIO(page.screenshot())).convert('RGB')
            old.evaluate('(e)=>e.remove()')
            diff = ImageChops.difference(before, after)
            max_delta = max(high for low, high in diff.getextrema())
            assert max_delta <= tolerance, (args.browser, width, label, max_delta)
            print(args.browser, width, label, 'max channel delta', max_delta, flush=True)

        page.goto(base)
        page.wait_for_load_state('networkidle')
        for phase in [500, 3000, 7000]:
            compare('home-'+str(phase), phase)
        # At the end of a 30 Hz step, the soft band is slightly behind the old
        # continuous sweep; bound that difference without ignoring layout pixels.
        compare('home-between-steps', 3032, tolerance=3)
        page.get_by_role('button', name='01 摇币起卦').click()
        page.wait_for_load_state('networkidle')
        # Mode selection also starts a native smooth scroll on small viewports.
        page.wait_for_timeout(1800)
        compare('coins')
        page.get_by_role('link', name='[关于]', exact=True).click()
        expect(page.get_by_role('heading', name='关于 HEX//64', exact=True)).to_be_visible()
        page.wait_for_load_state('networkidle')
        compare('about')
        page.locator('.crt-content').evaluate('(e)=>e.scrollTop=e.scrollHeight')
        assert page.locator('.crt-content').evaluate('(e)=>e.scrollTop>0')
        compare('about-scrolled')
        page.get_by_role('link', name='[起卦]', exact=True).click()
        expect(page.get_by_role('heading', name='选择起卦方式')).to_be_visible()
        assert page.locator('.crt-content').evaluate('(e)=>e.scrollTop===0')
        # Keep actual coin animations enabled while completing a reading.
        page.get_by_role('button', name='01 摇币起卦').click()
        for line in ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']:
            page.get_by_role('button', name='点击开始摇动' + line).click()
            page.get_by_role('button', name='点击停止并记录' + line).click()
        page.get_by_role('button', name='六爻已完成，生成排盘').click()
        expect(page.get_by_text('排盘完成', exact=True)).to_be_visible()
        page.reload()
        expect(page.get_by_text('排盘完成', exact=True)).to_be_visible()
        assert not errors, errors
        ctx.close()
    browser.close()
