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
          <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge py-3 text-[14px] tracking-[0.18em] text-fog">
            <span>本地计算</span>
            <span aria-hidden="true">//</span>
            <span>匿名访问统计</span>
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
