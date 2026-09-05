import { useCallback, useEffect, useRef, useState } from 'react'
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { BookmarkInvitation } from '@/components/BookmarkInvitation'
import { BootSequence, useBootOnce } from '@/components/BootSequence'
import { FeedbackInvitation } from '@/components/FeedbackInvitation'
import { LiveClock } from '@/components/LiveClock'
import { GeneratorPage } from '@/pages/GeneratorPage'
import { ResultPage } from '@/pages/ResultPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AboutPage } from '@/pages/AboutPage'
import { ReadingProvider } from '@/store/reading'
import { SettingsProvider, useDisplaySettings } from '@/store/settings'

export function App() {
  return (
    <SettingsProvider>
      <ReadingProvider>
        <HashRouter>
          <Shell />
        </HashRouter>
      </ReadingProvider>
    </SettingsProvider>
  )
}

function CrtFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="crt-room">
      <div className="crt-bezel">
        <div className="crt-screen">{children}</div>
        <span className="crt-led" aria-hidden="true" />
      </div>
    </div>
  )
}

export function CrtFx() {
  const { animation } = useDisplaySettings()

  return (
    <div className="crt-fx" aria-hidden="true">
      <div className="fx-grille" />
      <div className="fx-scanlines" />
      <div className="fx-vignette" />
      {animation && (
        <>
          <div className="fx-roll" />
          <div className="fx-flicker" />
        </>
      )}
    </div>
  )
}

function Shell() {
  const { animation, resolvedTimezone } = useDisplaySettings()
  const { booting, finish } = useBootOnce(animation)
  const location = useLocation()
  const feedbackCooldownTimerRef = useRef<number>(0)
  const [bookmarkInvitationVisible, setBookmarkInvitationVisible] = useState(false)
  const [feedbackInvitationDeferred, setFeedbackInvitationDeferred] = useState(false)

  const deferFeedbackInvitation = useCallback(() => {
    window.clearTimeout(feedbackCooldownTimerRef.current)
    setFeedbackInvitationDeferred(true)
    feedbackCooldownTimerRef.current = window.setTimeout(() => {
      setFeedbackInvitationDeferred(false)
    }, 60_000)
  }, [])

  useEffect(() => () => window.clearTimeout(feedbackCooldownTimerRef.current), [])

  useEffect(() => {
    const metadata = routeMetadata(location.pathname)
    document.title = metadata.title
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', metadata.description)
  }, [location.pathname])

  if (booting) {
    return (
      <CrtFrame>
        <BootSequence onDone={finish} />
        <CrtFx />
      </CrtFrame>
    )
  }

  return (
    <CrtFrame>
      {/*
        iOS WebKit may keep the stale backing store of a programmatically reset
        overflow scroller until the user scrolls again. A new route gets a new
        native scroll layer instead, which both starts at zero and paints the
        incoming page immediately.
      */}
      <div key={location.key} className="crt-content">
        <button
          type="button"
          className="skip-link"
          onClick={() => {
            window.setTimeout(() => {
              const heading = document.querySelector<HTMLElement>('#main-content h1')
                ?? document.getElementById('main-content')
              if (!heading) return
              heading.tabIndex = -1
              heading.focus()
              document.getElementById('main-content')?.scrollIntoView({ block: 'start' })
            }, 0)
          }}
        >
          跳到主要内容
        </button>
        <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 sm:px-6">
          <Header timezone={resolvedTimezone} />
          <main id="main-content" tabIndex={-1} className="flex-1 pb-10">
            <Routes>
              <Route path="/" element={<GeneratorPage />} />
              <Route path="/result" element={<ResultPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="*" element={<GeneratorPage />} />
            </Routes>
          </main>
          <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-edge py-3 text-[0.875rem] tracking-[0.18em] text-fog">
            <div className="flex items-center gap-3">
              <span>By lemontea, with ❤️</span>
              <a
                href="https://github.com/lemonteaau/binary-liuyao"
                target="_blank"
                rel="noreferrer"
                aria-label="在 GitHub 查看 binary-liuyao 项目"
                title="GitHub · binary-liuyao"
                className="inline-flex text-fog transition-colors hover:text-signal"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-4 fill-current"
                >
                  <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.78 1.2 1.78 1.2 1.04 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.74-1.55-2.57-.3-5.27-1.29-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.28 5.68.42.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
                </svg>
              </a>
            </div>
          </footer>
        </div>
      </div>
      <BookmarkInvitation
        onDismiss={deferFeedbackInvitation}
        onVisibilityChange={setBookmarkInvitationVisible}
      />
      <FeedbackInvitation
        suppressed={bookmarkInvitationVisible || feedbackInvitationDeferred}
      />
      <CrtFx />
    </CrtFrame>
  )
}

const DEFAULT_DESCRIPTION =
  'HEX//64 是免费的在线六爻排盘工具，支持摇币、电脑、手动、卦名、数字、时间和汉字起卦，自动生成纳甲、六亲、六神、世应、伏神、卦身、神煞与四柱；所有计算均在浏览器本地完成。'

function routeMetadata(pathname: string): { title: string; description: string } {
  switch (pathname) {
    case '/result':
      return {
        title: '六爻排盘结果 - HEX//64',
        description: '查看 HEX//64 生成的六爻排盘结果，包括本卦、动爻、变卦、周易卦辞爻辞、纳甲、六亲、六神、世应、伏神、卦身、神煞与四柱。',
      }
    case '/settings':
      return {
        title: '设置 - HEX//64 六爻排盘',
        description: '设置 HEX//64 六爻排盘的时区、字号、动效与排盘复制选项。',
      }
    case '/about':
      return {
        title: '关于 - HEX//64 六爻排盘',
        description: '了解 HEX//64 在线六爻排盘的起卦算法、排盘内容、隐私保护与分享方式。',
      }
    default:
      return {
        title: '六爻排盘｜免费在线起卦、纳甲装卦 - HEX//64',
        description: DEFAULT_DESCRIPTION,
      }
  }
}

function Header({ timezone }: { timezone: string }) {
  return (
    <header className="app-header border-b border-edge py-4">
      <Link
        to="/"
        className="app-logo chroma text-lg font-bold tracking-[0.28em] text-signal no-underline"
      >
        HEX//64
      </Link>
      <nav className="app-nav flex items-center gap-1 text-[0.9375rem] tracking-[0.16em]">
        <HeaderNavLink to="/">起卦</HeaderNavLink>
        <HeaderNavLink to="/settings">设置</HeaderNavLink>
        <HeaderNavLink to="/about">关于</HeaderNavLink>
      </nav>
      <LiveClock
        key={timezone}
        timezone={timezone}
        className="app-clock text-[0.9375rem] tabular-nums tracking-[0.14em] text-fog"
      />
    </header>
  )
}

function HeaderNavLink({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `app-nav-link inline-flex min-h-11 items-center px-2 no-underline ${
          isActive ? 'text-signal' : 'text-fog'
        }`
      }
    >
      [{children}]
    </NavLink>
  )
}
