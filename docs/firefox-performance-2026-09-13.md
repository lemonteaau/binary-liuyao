# Firefox CRT sweep performance

The moving, translucent `.fx-roll` band causes persistent GPU work on the tested
Mac (M1 Pro, 5120×2880 display, device pixel ratio 2, Firefox target 144 Hz).
The issue reproduced in native Firefox 151 and 155. Headless Firefox did not
reproduce it, so headless rAF timing is not evidence that this issue is fixed.

On Firefox 155, a 10-second foreground rAF comparison at a 2560×1326 CSS viewport
gave these results. These are callback timings, not direct measurements of
presented GPU frames, and results vary with the machine and workload.

| Sweep updates | Callbacks | 95th-percentile interval | Intervals over 25 ms |
| --- | ---: | ---: | ---: |
| Original continuous sweep | 758 | 34.78 ms | 121 |
| 60 Hz | 785 | 34.38 ms | 106 |
| 30 Hz | 1351 | 7.74 ms | 8 |
| 15 Hz | 1426 | 7.60 ms | 2 |

The final, freshly loaded production build was then measured for 18 seconds per
condition, without concurrent builds/tests:

| Final build comparison | Callbacks | 95th-percentile interval | Intervals over 25 ms |
| --- | ---: | ---: | ---: |
| Built 30 Hz rule | 2467 | 7.72 ms | 8 |
| Original linear timing on the same page | 1168 | 41.60 ms | 281 |

The fix uses `steps(255, end)` over the existing 8.5-second cycle, only inside a
Firefox feature query. It keeps the same gradient, dimensions, transform path,
cycle duration and settings. It changes the decorative band's update cadence;
coin animations and application interactions retain their existing timing.
The 30 Hz option preserves finer movement than 15 Hz while reducing long frames.

Merely changing clipping, adding layer hints or replacing the band with a cached
image did not reliably improve long samples. Those experimental changes were
removed. Native GPU-process sampling showed substantial waits in
`glClientWaitSync`/`gleFinishSync`, consistent with a rendering bottleneck rather
than a calculation loop in the application.

## Regression checks

Run `npm run build` and a local production preview, then:

```sh
python3 scripts/test-crt-rendering.py --browser firefox
python3 scripts/test-crt-rendering.py --browser chromium
python3 scripts/test-crt-rendering.py --browser webkit
```

The script mocks analytics and API requests, checks desktop/mobile views, completes
all six coin tosses, generates a chart and verifies it survives a refresh. It also
checks scrolling and navigation. Matching sweep positions produce identical
pixels. Between 30 Hz updates, the soft band differs from the old continuous
sweep by at most 3/255 in an RGB channel in the tested screenshots. Chromium and
WebKit keep the original animation and produce identical screenshots throughout.

For native performance verification, keep the window foreground at the affected
resolution, close developer tools before sampling, and measure at least 18 seconds
(more than two full sweep cycles). Do not run builds or headless browser tests
concurrently. Short samples and tests after repeated style changes gave misleading
results during diagnosis; always also test a freshly loaded production build.
