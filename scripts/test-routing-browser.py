"""Run against `wrangler pages dev dist`; optional --baseline compares the old build.

Requires Python Playwright (and Pillow only for the optional visual comparison).
Network-changing API calls and analytics are mocked; no feedback is sent.
"""
import argparse
import base64
import io
import json
import re
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:42713')
parser.add_argument('--baseline')
parser.add_argument('--proxy-local-requests', action='store_true', help='Use Playwright request transport if the local WebKit runtime cannot connect to loopback')
parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
args = parser.parse_args()
base = args.url.rstrip('/')
share = 'v=2&s=101010&m=001000&t=1787553757&z=Asia%2FShanghai&i=coin&r=A1B2C3&o=864'
settings = {'animation': False, 'screenFx': False, 'timezone': 'Asia/Shanghai', 'fontSize': 'standard'}
artifacts = Path('/tmp/hex64-routing-checks')
artifacts.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = getattr(p, args.browser).launch(headless=True)
    errors, requests = [], []

    def context_for(viewport=None):
        ctx = browser.new_context(viewport=viewport or ({'width': 390, 'height': 844} if args.browser == 'webkit' else {'width': 1280, 'height': 900}), reduced_motion='reduce', timezone_id='Asia/Shanghai')
        ctx.add_init_script('''
          if (!localStorage.getItem('hex64.settings.v1')) localStorage.setItem('hex64.settings.v1', %s);
          Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
            writeText: async text => { window.__copied = text; }
          }});
        ''' % json.dumps(json.dumps(settings)))
        def intercept(route):
            url = urlparse(route.request.url)
            requests.append(route.request.url)
            if url.hostname not in ['127.0.0.1', 'localhost']:
                route.abort()
            elif url.path.startswith('/x/'):
                route.fulfill(status=200, content_type='application/javascript', body='')
            elif url.path == '/api/hexagram-count':
                route.fulfill(status=200, content_type='application/json', body='{"ordinal":864}')
            elif url.path == '/api/feedback':
                route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
            elif args.proxy_local_requests:
                route.fulfill(response=route.fetch())
            else:
                route.continue_()
        ctx.route('**/*', intercept)
        return ctx

    def page_for(ctx):
        page = ctx.new_page()
        page.set_default_timeout(10000)
        page.clock.set_fixed_time(1787553757000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        return page

    def ready(page, path):
        response = page.goto(base + path)
        if response is not None: assert response.status == 200, (path, response.status)
        page.wait_for_load_state('networkidle')
        page.wait_for_function("document.documentElement.dataset.motion === 'off'")
        return response

    ctx = context_for()
    page = page_for(ctx)
    # Verify actual Pages responses without JS: distinct HTML, canonical, noindex,
    # static public content, legacy deployment assets and Function routes.
    for route, title in [('/about', '关于 HEX//64'), ('/ai-guide', 'AI解卦教程')]:
        response = ctx.request.get(base + route)
        assert response.status == 200
        html = response.text()
        assert title in html and f'https://liuyao.lemontea.xyz{route}' in html
        assert '<article' in html if route == '/ai-guide' else 'id="support"' in html
        assert 'noindex' not in html
    for route in ['/settings', '/result']:
        assert 'noindex,follow' in ctx.request.get(base + route).text()
    for asset in ['/robots.txt', '/sitemap.xml', '/favicon.png', '/og-liuyao.png', '/site.webmanifest']:
        assert ctx.request.get(base + asset).status == 200, asset
    assert ctx.request.get(base + '/api/hexagram-count').status == 200
    assert ctx.request.get(base + '/api/feedback').status == 405
    assert ctx.request.get(base + '/x/not-a-route').status == 404

    for path, heading in [('/about', '关于 HEX//64'), ('/about/', '关于 HEX//64'), ('/ai-guide', 'AI解卦教程'), ('/ai-guide/', 'AI解卦教程')]:
        ready(page, path)
        expect(page.get_by_role('heading', name=heading, exact=True)).to_be_visible()
        page.reload()
        expect(page.get_by_role('heading', name=heading, exact=True)).to_be_visible()
    ready(page, '/settings')
    expect(page.get_by_role('link', name='[设置]')).to_have_attribute('aria-current', 'page')
    page.get_by_role('link', name='[AI解卦]').click()
    expect(page.get_by_role('heading', name='AI解卦教程')).to_be_visible()
    page.go_back()
    expect(page.get_by_role('link', name='[设置]')).to_have_attribute('aria-current', 'page')
    page.go_forward()
    expect(page.get_by_role('heading', name='AI解卦教程')).to_be_visible()

    for old in ['/#/about?support=1', '/#/about?feedback=1', '/#/settings', '/#/ai-guide']:
        ready(page, old)
        assert not urlparse(page.url).fragment, page.url
        assert urlparse(page.url).path == old.split('#')[1].split('?')[0]
    for section in ['support', 'feedback']:
        ready(page, '/#/about?' + section + '=1')
        target = page.locator('#support h2') if section == 'support' else page.get_by_role('textbox', name='反馈意见')
        expect(target).to_be_focused()

    for link in ['/#/result?' + share, '/result#' + share, '/#/result?s=101010&m=001000']:
        ready(page, link)
        expect(page.get_by_text('排盘完成', exact=True)).to_be_visible()
        assert urlparse(page.url).path == '/result' and not urlparse(page.url).query
        original = page.evaluate("JSON.parse(localStorage.getItem('hex64.current.v1'))")
        page.reload()
        expect(page.get_by_text('排盘完成', exact=True)).to_be_visible()
        restored = page.evaluate("JSON.parse(localStorage.getItem('hex64.current.v1'))")
        assert restored == original

    # All seven input modes must still produce charts and survive a refresh.
    modes = ['摇币起卦', '电脑起卦', '手动排卦', '卦名起卦', '数字起卦', '时间起卦', '汉字起卦']
    for mode in modes:
        ready(page, '/')
        page.get_by_role('button', name=re.compile(mode)).click()
        if mode == '摇币起卦':
            for line in ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']:
                page.get_by_role('button', name='点击开始摇动' + line).click()
                page.get_by_role('button', name='点击停止并记录' + line).click()
            page.get_by_role('button', name='六爻已完成，生成排盘').click()
        elif mode == '电脑起卦':
            page.get_by_role('button', name='立即起卦').click()
        elif mode == '时间起卦':
            page.get_by_role('button', name='使用当前时间戳', exact=True).click()
        else:
            if mode == '数字起卦': page.get_by_label('数字种子').fill('128 64 32')
            if mode == '汉字起卦': page.get_by_label('用于起卦的汉字').fill('天地')
            page.get_by_role('button', name='生成排盘 →').click()
        expect(page.get_by_text('排盘完成', exact=True)).to_be_visible()
        assert urlparse(page.url).path == '/result'
        original = page.evaluate("JSON.parse(localStorage.getItem('hex64.current.v1'))")
        page.get_by_role('button', name='复制排盘', exact=True).click()
        page.wait_for_function("window.__copied && !window.__copied.startsWith('http')")
        page.get_by_role('button', name='[ 复制链接 ]').click()
        page.wait_for_function("window.__copied.startsWith('http')")
        copied = page.evaluate('window.__copied')
        assert urlparse(copied).path == '/result' and not urlparse(copied).query
        ready(page, copied.removeprefix(base))
        expect(page.get_by_text('排盘完成', exact=True)).to_be_visible()
        restored = page.evaluate("JSON.parse(localStorage.getItem('hex64.current.v1'))")
        assert restored['chart'] == original['chart'], mode
        assert restored['rawLines'] == original['rawLines'], mode
        page.reload()
        expect(page.get_by_text('排盘完成', exact=True)).to_be_visible()
        page.get_by_role('button', name='[ 修改排盘 ]').click()
        expect(page.get_by_role('button', name='生成排盘 →')).to_be_visible()
        assert urlparse(page.url).path == '/'
        print('PASS input/share/reload/edit:', mode, flush=True)

    ready(page, '/result#' + share)
    expect(page.get_by_text('排盘完成', exact=True)).to_be_visible()
    if args.browser == 'webkit':
        # Keep real canvas rendering, but capture the OS share handoff instead
        # of opening a native share dialog or expecting an anchor download.
        page.evaluate("""() => {
          Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
          Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }) => {
            const file = files[0];
            const data = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            window.__sharedImage = { name: file.name, type: file.type, size: file.size, data };
          }});
        }""")
        page.get_by_role('button', name='导出分享图', exact=True).click()
        page.wait_for_function('window.__sharedImage !== undefined')
        exported = page.evaluate('window.__sharedImage')
        assert exported['type'] == 'image/png' and exported['size'] > 10000
        png = base64.b64decode(exported['data'].split(',', 1)[1])
        assert png[:8] == b'\x89PNG\r\n\x1a\n'
        assert int.from_bytes(png[16:20], 'big') == 1080
        (artifacts / 'share-webkit.png').write_bytes(png)
    else:
        with page.expect_download() as download:
            page.get_by_role('button', name='导出分享图', exact=True).click()
        download.value.save_as(artifacts / ('share-' + args.browser + '.png'))
        assert (artifacts / ('share-' + args.browser + '.png')).stat().st_size > 10000
    # Verify the real inline analytics sanitizer for old and new share URLs.
    payload = page.evaluate("""([base, share]) => window.umamiBeforeSend('event', {
      url: base + '/result#' + share,
      referrer: base + '/#/result?' + share,
    })""", [base, share])
    assert payload == {'url': '/result', 'referrer': '/result'}
    assert not any(set(parse_qs(urlparse(url).query)) & {'s', 'm', 't', 'z', 'r', 'o'} for url in requests)
    assert not errors, errors
    ctx.close()

    if args.baseline:
        from PIL import Image, ImageChops
        for width, height in [(1280, 900), (390, 844)]:
            for path in ['/', '/ai-guide', '/about', '/settings', '/result']:
                images, texts = [], []
                for origin, legacy in [(args.baseline.rstrip('/'), True), (base, False)]:
                    comparison = context_for({'width': width, 'height': height})
                    tab = page_for(comparison)
                    route = '/#' + path if legacy else path
                    if path == '/result': route += ('?' if legacy else '#') + share
                    tab.goto(origin + route)
                    tab.wait_for_load_state('networkidle')
                    tab.wait_for_function("document.documentElement.dataset.motion === 'off'")
                    if path == '/result': expect(tab.get_by_text('排盘完成', exact=True)).to_be_visible()
                    # Lazy images (e.g. about-page photos) may still be decoding
                    # when network goes idle; force decode + paint so WebKit
                    # full-page screenshots are deterministic. decode() only
                    # resolves for loadable images, so filter to complete ones
                    # and scroll first to trigger below-fold lazy loads.
                    tab.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                    tab.wait_for_timeout(500)
                    tab.evaluate('window.scrollTo(0, 0)')
                    tab.wait_for_timeout(500)
                    tab.evaluate("""async () => {
                      await document.fonts.ready;
                      await Promise.all([...document.images]
                        .filter((img) => img.complete && img.naturalWidth > 0)
                        .map((img) => img.decode().catch(() => 0)));
                    }""")
                    texts.append(tab.locator('#root').inner_text())
                    images.append(tab.screenshot(animations='disabled'))
                    comparison.close()
                assert texts[0] == texts[1], ('visible text mismatch', width, path)
                diff = ImageChops.difference(Image.open(io.BytesIO(images[0])).convert('RGB'), Image.open(io.BytesIO(images[1])).convert('RGB'))
                if diff.getbbox():
                    for i, data in enumerate(images):
                        (artifacts / f'compare-{width}-{path.strip("/") or "home"}-{i}.png').write_bytes(data)
                    raise AssertionError(('visual mismatch', width, path, diff.getbbox()))
                print('PASS identical screenshot:', width, path, flush=True)
    browser.close()
print('PASS Pages routing, legacy links, privacy, seven modes, copy, image export and navigation; no page errors.', flush=True)
