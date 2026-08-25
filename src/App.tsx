import { HashRouter, Link, Route, Routes } from 'react-router-dom'
import { BootSequence, useBootOnce } from '@/components/BootSequence'
import { LiveClock } from '@/components/LiveClock'
import { GeneratorPage } from '@/pages/GeneratorPage'
import { ResultPage } from '@/pages/ResultPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AboutPage } from '@/pages/AboutPage'
import { ReadingProvider } from '@/store/reading'
import { SettingsProvider, useSettings } from '@/store/settings'
import { RULE_VERSION } from '@/types'

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

function Shell() {
  const { settings, resolvedTimezone } = useSettings()
  const { booting, finish } = useBootOnce(settings.animation)

  if (booting) return <BootSequence onDone={finish} />

  return (
    <div className="min-h-dvh bg-void text-ink">
      <div className="scanlines" aria-hidden="true" />
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
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
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge py-3 text-[10px] tracking-[0.18em] text-fog">
          <span>本地计算</span>
          <span aria-hidden="true">//</span>
          <span>无数据传输</span>
          <span aria-hidden="true">//</span>
          <span>引擎 {RULE_VERSION}</span>
        </footer>
      </div>
    </div>
  )
}

function Header({ timezone }: { timezone: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-edge py-4">
      <Link to="/" className="text-sm font-bold tracking-[0.28em] text-signal no-underline">
        HEX//64
      </Link>
      <nav className="flex items-center gap-1 text-[11px] tracking-[0.16em]">
        <NavLink to="/">生成器</NavLink>
        <NavLink to="/settings">设置</NavLink>
        <NavLink to="/about">协议</NavLink>
      </nav>
      <LiveClock key={timezone} timezone={timezone} className="text-[11px] tabular-nums tracking-[0.14em] text-fog" />
    </header>
  )
}

function NavLink({ to, children }: { to: string; children: string }) {
  const active = window.location.hash.startsWith(`#${to}`)
  return (
    <Link
      to={to}
      className={`px-2 py-1 no-underline transition-colors hover:text-signal ${
        active ? 'text-signal' : 'text-fog'
      }`}
    >
      [{children}]
    </Link>
  )
}
