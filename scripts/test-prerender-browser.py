"""Verify built HTML and unchanged UI against a pre-change Vite preview.

Run with --url and --baseline pointing to two local Vite preview servers.
Requires Python Playwright and Pillow. All API/analytics requests are mocked.
"""
import argparse
import io
import json
import re
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
parser.add_argument('--baseline', required=True)
args = parser.parse_args()
base = args.url.rstrip('/')
baseline = args.baseline.rstrip('/')
settings = {'animation': False, 'screenFx': False, 'timezone': 'Asia/Shanghai', 'fontSize': 'large'}
artifacts = Path('/tmp/hex64-prerender-checks')
artifacts.mkdir(exist_ok=True)
modes = ['摇币起卦', '电脑起卦', '手动排卦', '卦名起卦', '数字起卦', '时间起卦', '汉字起卦']

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    errors = []

    def context(**kwargs):
        ctx = browser.new_context(timezone_id='Asia/Shanghai', **kwargs)

        def intercept(route):
            url = urlparse(route.request.url)
            if url.hostname not in ['127.0.0.1', 'localhost']:
                route.abort()
            elif url.path.startswith('/x/'):
                route.fulfill(status=200, content_type='application/javascript', body='')
            elif url.path.startswith('/api/'):
                route.fulfill(status=200, content_type='application/json', body='{"ordinal":864}')
            else:
                route.continue_()

        ctx.route('**/*', intercept)
        return ctx

    def new_page(ctx):
        page = ctx.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.clock.set_fixed_time(1787553757000)
        return page

    # A browser that cannot execute JS receives actual visible DOM, not noscript.
    ctx = context(java_script_enabled=False)
    page = new_page(ctx)
    response = page.goto(base)
    assert response.status == 200
    assert '<div id="root"></div>' not in response.text()
    assert '<noscript>' not in response.text()
    expect(page.get_by_role('heading', name='选择起卦方式')).to_be_visible()
    for mode in modes:
        expect(page.get_by_role('button', name=re.compile(mode))).to_be_visible()
    page.get_by_role('link', name='[关于]').click()
    expect(page.get_by_role('heading', name='关于 HEX//64')).to_be_visible()
    assert '所有排盘计算均在浏览器本地完成' in page.locator('#root').inner_text()
    page.get_by_role('link', name='[AI解卦]').click()
    expect(page.get_by_role('heading', name='AI解卦教程')).to_be_visible()
    for path in ['/settings', '/result']:
        html = ctx.request.get(base + path).text()
        assert 'noindex,follow' in html and '<div id="root"></div>' in html
    ctx.close()
    print('PASS visible public HTML and navigation without JavaScript', flush=True)

    for width, height in [(1280, 900), (390, 844)]:
        for path in ['/', '/about', '/ai-guide']:
            images, texts = [], []
            for origin in [baseline, base]:
                ctx = context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
                ctx.add_init_script("localStorage.setItem('hex64.settings.v1', %s)" % json.dumps(json.dumps(settings)))
                page = new_page(ctx)
                page.goto(origin + path)
                page.wait_for_load_state('networkidle')
                page.wait_for_function("document.documentElement.dataset.fontSize === 'large'")
                page.evaluate('document.fonts.ready')
                texts.append(page.locator('#root').inner_text())
                images.append(page.screenshot(animations='disabled'))
                if origin == base and path == '/':
                    for mode in modes:
                        button = page.get_by_role('button', name=re.compile(mode))
                        button.click()
                        expect(button).to_have_attribute('aria-pressed', 'true')
                    assert json.loads(page.evaluate("localStorage.getItem('hex64.settings.v1')"))['fontSize'] == 'large'
                ctx.close()
            assert texts[0] == texts[1], ('visible text changed', width, path)
            diff = ImageChops.difference(*[Image.open(io.BytesIO(data)).convert('RGB') for data in images])
            for i, data in enumerate(images):
                (artifacts / f'{width}-{path.strip("/") or "home"}-{i}.png').write_bytes(data)
            assert diff.getbbox() is None, ('visual change', width, path, diff.getbbox())
            print('PASS identical screenshot:', width, path, flush=True)

    # Slow scripts must not flash the static default UI before the boot sequence.
    ctx = context(reduced_motion='no-preference')
    pending = []
    ctx.route('**/assets/*.js', lambda route: pending.append(route))
    page = new_page(ctx)
    page.goto(base, wait_until='commit')
    page.locator('#root[data-prerendered] h1').wait_for(state='attached')
    expect(page.get_by_role('heading', name='选择起卦方式')).to_be_hidden()
    ctx.unroute('**/assets/*.js')
    for route in pending:
        route.continue_()
    expect(page.get_by_role('button', name='系统正在启动，跳过启动动画')).to_be_visible()
    expect(page.get_by_role('heading', name='选择起卦方式')).to_be_visible()
    assert page.evaluate("sessionStorage.getItem('hex64.booted')") == '1'
    assert not page.evaluate("document.documentElement.hasAttribute('data-app-loading')")
    ctx.close()
    print('PASS startup animation and no static-page flash while scripts load', flush=True)

    ctx = context()
    ctx.route('**/assets/*.js', lambda route: route.abort())
    page = new_page(ctx)
    page.goto(base)
    expect(page.get_by_role('heading', name='选择起卦方式')).to_be_visible(timeout=6000)
    page.get_by_role('link', name='[关于]').click()
    expect(page.get_by_role('heading', name='关于 HEX//64')).to_be_visible(timeout=6000)
    ctx.close()
    print('PASS readable fallback and navigation when application scripts fail', flush=True)
    assert not errors, errors
    browser.close()
