import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { detectTimezone } from '@/calendar/solar-lunar'

export interface Settings {
  /** 'auto' 或 IANA 时区名 */
  timezone: string
  aiInstruction: boolean
  animation: boolean
  screenFx: boolean
}

const STORAGE_KEY = 'hex64.settings.v1'

function loadSettings(): Settings {
  const defaults: Settings = {
    timezone: 'auto',
    aiInstruction: false,
    animation: true,
    screenFx: true,
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    return { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return defaults
  }
}

interface SettingsContextValue {
  settings: Settings
  resolvedTimezone: string
  setTimezone: (tz: string) => void
  setAiInstruction: (on: boolean) => void
  setAnimation: (on: boolean) => void
  setScreenFx: (on: boolean) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const detected = useMemo(() => detectTimezone(), [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      /* storage 不可用时静默降级 */
    }
  }, [settings])

  useEffect(() => {
    document.documentElement.dataset.motion = settings.animation ? 'on' : 'off'
    document.documentElement.dataset.screenFx = settings.screenFx ? 'on' : 'off'
  }, [settings.animation, settings.screenFx])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      resolvedTimezone: settings.timezone === 'auto' ? detected : settings.timezone,
      setTimezone: (timezone) => update({ timezone }),
      setAiInstruction: (aiInstruction) => update({ aiInstruction }),
      setAnimation: (animation) => update({ animation }),
      setScreenFx: (screenFx) => update({ screenFx }),
    }),
    [settings, detected, update],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
