import { HashRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { BootSequence, useBootOnce } from '@/components/BootSequence'
import { LiveClock } from '@/components/LiveClock'
import { GeneratorPage } from '@/pages/GeneratorPage'
import { ResultPage } from '@/pages/ResultPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AboutPage } from '@/pages/AboutPage'
import { ReadingProvider } from '@/store/reading'
import { SettingsProvider, useSettings } from '@/store/settings'

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

function CrtFx() {
  return (
    <div className="crt-fx" aria-hidden="true">
      <div className="fx-grille" />
      <div className="fx-scanlines" />
      <div className="fx-roll" />
      <div className="fx-vignette" />
      <div className="fx-flicker" />
    </div>
  )
}

function Shell() {
  const { settings, resolvedTimezone } = useSettings()
  const { booting, finish } = useBootOnce(settings.animation)

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
      <div className="crt-content">
        <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 sm:px-6">
          <Header timezone={resolvedTimezone} />
          <main className="flex-1 pb-10">
            <Routes>
              <Route path="/" element={<GeneratorPage />} />
              <Route path="/result" element={<ResultPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="*" element={<GeneratorPage />} />
            </Routes>
          </main>
          <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-edge py-3 text-[14px] tracking-[0.18em] text-fog">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>本地计算</span>
              <span aria-hidden="true">//</span>
              <span>匿名访问统计</span>
            </div>
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
      <CrtFx />
    </CrtFrame>
  )
}

function Header({ timezone }: { timezone: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-edge py-4">
      <Link
        to="/"
        className="chroma text-lg font-bold tracking-[0.28em] text-signal no-underline"
      >
        HEX//64
      </Link>
      <nav className="flex items-center gap-1 text-[15px] tracking-[0.16em]">
        <HeaderNavLink to="/">生成器</HeaderNavLink>
        <HeaderNavLink to="/settings">设置</HeaderNavLink>
        <HeaderNavLink to="/about">协议</HeaderNavLink>
      </nav>
      <LiveClock key={timezone} timezone={timezone} className="text-[15px] tabular-nums tracking-[0.14em] text-fog" />
    </header>
  )
}

function HeaderNavLink({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `px-2 py-1 no-underline transition-colors hover:text-signal ${
          isActive ? 'text-signal' : 'text-fog'
        }`
      }
    >
      [{children}]
    </NavLink>
  )
}
