import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { detectTimezone } from '@/calendar/solar-lunar'
import { DEFAULT_AI_INSTRUCTION } from '@/formatters/rawText'

export type FontSize = 'small' | 'standard' | 'large'
export type SettingsSaveStatus = 'saving' | 'saved' | 'error'

export interface Settings {
  /** 'auto' 或 IANA 时区名 */
  timezone: string
  fontSize: FontSize
  aiInstruction: boolean
  aiInstructionPrompt: string
  animation: boolean
  screenFx: boolean
}

const STORAGE_KEY = 'hex64.settings.v1'

function loadSettings(): Settings {
  const defaults: Settings = {
    timezone: 'auto',
    fontSize: 'standard',
    aiInstruction: false,
    aiInstructionPrompt: DEFAULT_AI_INSTRUCTION,
    animation: true,
    screenFx: true,
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const stored = JSON.parse(raw) as Partial<Settings> | null
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return defaults
    const fontSize = isFontSize(stored.fontSize) ? stored.fontSize : defaults.fontSize
    const aiInstructionPrompt = typeof stored.aiInstructionPrompt === 'string'
      ? stored.aiInstructionPrompt
      : defaults.aiInstructionPrompt
    let timezone = defaults.timezone
    if (typeof stored.timezone === 'string' && stored.timezone !== 'auto') {
      try {
        new Intl.DateTimeFormat('en', { timeZone: stored.timezone })
        timezone = stored.timezone
      } catch {
        /* 损坏或已失效的时区设置回退到自动检测 */
      }
    }
    return {
      timezone,
      fontSize,
      aiInstructionPrompt,
      aiInstruction: typeof stored.aiInstruction === 'boolean' ? stored.aiInstruction : defaults.aiInstruction,
      animation: typeof stored.animation === 'boolean' ? stored.animation : defaults.animation,
      screenFx: typeof stored.screenFx === 'boolean' ? stored.screenFx : defaults.screenFx,
    }
  } catch {
    return defaults
  }
}

function isFontSize(value: unknown): value is FontSize {
  return value === 'small' || value === 'standard' || value === 'large'
}

interface SettingsContextValue {
  settings: Settings
  saveStatus: SettingsSaveStatus
  resolvedTimezone: string
  setTimezone: (tz: string) => void
  setFontSize: (fontSize: FontSize) => void
  setAiInstruction: (on: boolean) => void
  setAiInstructionPrompt: (prompt: string) => void
  setAnimation: (on: boolean) => void
  setScreenFx: (on: boolean) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

interface DisplaySettingsContextValue {
  animation: boolean
  resolvedTimezone: string
}

const DisplaySettingsContext = createContext<DisplaySettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [saveStatus, setSaveStatus] = useState<SettingsSaveStatus>('saved')
  const settingsRef = useRef(settings)
  const saveStatusTimerRef = useRef<number | null>(null)
  const detected = useMemo(() => detectTimezone(), [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsRef.current))
    } catch {
      /* 首次加载时不打断使用；用户修改设置时会显示保存错误 */
    }
    return () => {
      if (saveStatusTimerRef.current !== null) window.clearTimeout(saveStatusTimerRef.current)
    }
  }, [])

  useLayoutEffect(() => {
    document.documentElement.dataset.fontSize = settings.fontSize
    document.documentElement.dataset.motion = settings.animation ? 'on' : 'off'
    document.documentElement.dataset.screenFx = settings.screenFx ? 'on' : 'off'
  }, [settings.animation, settings.fontSize, settings.screenFx])

  const update = useCallback((patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch }
    settingsRef.current = next
    setSettings(next)
    setSaveStatus('saving')

    if (saveStatusTimerRef.current !== null) window.clearTimeout(saveStatusTimerRef.current)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      saveStatusTimerRef.current = window.setTimeout(() => setSaveStatus('saved'), 300)
    } catch {
      setSaveStatus('error')
    }
  }, [])

  const resolvedTimezone = settings.timezone === 'auto' ? detected : settings.timezone
  const setTimezone = useCallback((timezone: string) => update({ timezone }), [update])
  const setFontSize = useCallback((fontSize: FontSize) => update({ fontSize }), [update])
  const setAiInstruction = useCallback(
    (aiInstruction: boolean) => update({ aiInstruction }),
    [update],
  )
  const setAiInstructionPrompt = useCallback(
    (aiInstructionPrompt: string) => update({ aiInstructionPrompt }),
    [update],
  )
  const setAnimation = useCallback((animation: boolean) => update({ animation }), [update])
  const setScreenFx = useCallback((screenFx: boolean) => update({ screenFx }), [update])

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      saveStatus,
      resolvedTimezone,
      setTimezone,
      setFontSize,
      setAiInstruction,
      setAiInstructionPrompt,
      setAnimation,
      setScreenFx,
    }),
    [
      settings,
      saveStatus,
      resolvedTimezone,
      setTimezone,
      setFontSize,
      setAiInstruction,
      setAiInstructionPrompt,
      setAnimation,
      setScreenFx,
    ],
  )
  const displayValue = useMemo<DisplaySettingsContextValue>(
    () => ({ animation: settings.animation, resolvedTimezone }),
    [settings.animation, resolvedTimezone],
  )

  return (
    <DisplaySettingsContext.Provider value={displayValue}>
      <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
    </DisplaySettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}

export function useDisplaySettings(): DisplaySettingsContextValue {
  const ctx = useContext(DisplaySettingsContext)
  if (!ctx) throw new Error('useDisplaySettings must be used within SettingsProvider')
  return ctx
}
