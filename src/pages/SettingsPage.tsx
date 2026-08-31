import type { ReactNode } from 'react'
import { useSettings } from '@/store/settings'
import type { FontSize } from '@/store/settings'

const FONT_SIZE_OPTIONS: Array<{ value: FontSize; label: string }> = [
  { value: 'small', label: '小' },
  { value: 'standard', label: '标准' },
  { value: 'large', label: '大' },
]

function detectTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

function timezoneOptions(): string[] {
  const detected = detectTz()
  const common = [
    'UTC',
    'Asia/Shanghai',
    'Asia/Hong_Kong',
    'Asia/Taipei',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Australia/Sydney',
    'Australia/Adelaide',
    'Australia/Perth',
    'Europe/London',
    'Europe/Berlin',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'America/Vancouver',
  ]
  const supported: string[] = (() => {
    try {
      return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
        .supportedValuesOf?.('timeZone') ?? []
    } catch {
      return []
    }
  })()
  return [...new Set([detected, ...common, ...supported])].sort()
}

export function SettingsPage() {
  const {
    settings,
    saveStatus,
    resolvedTimezone,
    setTimezone,
    setFontSize,
    setAiInstruction,
    setAiInstructionPrompt,
    setAnimation,
    setScreenFx,
  } = useSettings()

  return (
    <div className="pt-6">
      <p className="mb-1 text-[0.875rem] tracking-[0.24em] text-fog">系统设置</p>
      <h1 className="mb-6 text-2xl font-bold tracking-[0.2em]">参数配置</h1>

      <section className="panel p-4 sm:p-5">
        <span className="panel-tag">时区</span>
        <p className="mb-3 text-[0.9375rem] leading-relaxed text-fog">
          排盘使用所选时区的当地墙上时间。自动 = 浏览器当前时区。
          当前生效：<span className="text-signal">{resolvedTimezone}</span>
        </p>
        <select
          value={settings.timezone}
          onChange={(e) => setTimezone(e.target.value)}
          aria-label="时区"
          className="w-full max-w-md border border-edge bg-void px-3 py-2 text-base text-ink focus:border-signal focus:outline-none"
        >
          <option value="auto">自动 ({detectTz()})</option>
          {timezoneOptions().map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </section>

      <section className="panel mt-4 p-4 sm:p-5">
        <span className="panel-tag">显示</span>
        <SettingRow
          title="界面字号"
          description="手机端会在同一档位下稍微收紧，为排盘留出更多空间。"
        >
          <div className="flex shrink-0 gap-1" role="group" aria-label="界面字号">
            {FONT_SIZE_OPTIONS.map((option) => (
              <ToggleBtn
                key={option.value}
                active={settings.fontSize === option.value}
                onClick={() => setFontSize(option.value)}
              >
                {option.label}
              </ToggleBtn>
            ))}
          </div>
        </SettingRow>
        <SettingRow
          title="系统动效"
          description="控制启动序列与界面动画；系统的“减少动态效果”设置始终优先。"
        >
          <div className="flex shrink-0 gap-1" role="group" aria-label="动画开关">
            <ToggleBtn active={settings.animation} onClick={() => setAnimation(true)}>
              开
            </ToggleBtn>
            <ToggleBtn active={!settings.animation} onClick={() => setAnimation(false)}>
              关
            </ToggleBtn>
          </div>
        </SettingRow>
        <SettingRow
          title="CRT 屏幕效果"
          description="扫描线、荫罩、荧光辉光、刷新光带、亮度波动与暗角。"
        >
          <div className="flex shrink-0 gap-1" role="group" aria-label="CRT 屏幕效果开关">
            <ToggleBtn active={settings.screenFx} onClick={() => setScreenFx(true)}>
              开
            </ToggleBtn>
            <ToggleBtn active={!settings.screenFx} onClick={() => setScreenFx(false)}>
              关
            </ToggleBtn>
          </div>
        </SettingRow>
      </section>

      <section className="panel mt-4 p-4 sm:p-5">
        <span className="panel-tag">复制格式</span>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
          <p className="text-[0.9375rem] leading-relaxed text-fog">
            附加 AI 指令 — 复制排盘时，将下面的提示词附加在内容末尾。
            <br />
            当前设置：
            <span className={settings.aiInstruction ? 'text-signal' : 'text-flux'}>
              {settings.aiInstruction ? '开' : '关'}
            </span>
          </p>
          <div className="flex shrink-0 gap-1" role="group" aria-label="AI 指令开关">
            <ToggleBtn active={settings.aiInstruction} onClick={() => setAiInstruction(true)}>
              开
            </ToggleBtn>
            <ToggleBtn active={!settings.aiInstruction} onClick={() => setAiInstruction(false)}>
              关
            </ToggleBtn>
          </div>
        </div>
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <label className="block text-[0.875rem] tracking-[0.12em] text-fog" htmlFor="ai-instruction-prompt">
            自定义提示词
          </label>
          <span
            role="status"
            aria-live="polite"
            className={`shrink-0 text-[0.8125rem] tracking-[0.08em] ${
              saveStatus === 'error' ? 'text-flux' : 'text-signal'
            }`}
          >
            {saveStatus === 'saving' ? '正在保存…' : saveStatus === 'saved' ? '已保存' : '保存失败'}
          </span>
        </div>
        <textarea
          id="ai-instruction-prompt"
          value={settings.aiInstructionPrompt}
          onChange={(event) => setAiInstructionPrompt(event.target.value)}
          rows={4}
          spellCheck={false}
          className="mt-2 w-full resize-y border border-edge bg-void px-3 py-2 text-base leading-relaxed text-ink focus:border-signal focus:outline-none"
        />
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-fog">
          自动保存在当前浏览器中，网站更新不会覆盖。留空时不附加任何提示词。
          {saveStatus === 'error' && ' 浏览器当前无法写入本地存储，请检查隐私设置。'}
        </p>
      </section>

      <section className="panel mt-4 p-4 sm:p-5">
        <span className="panel-tag">排盘参数</span>
        <dl className="grid grid-cols-1 gap-y-2 text-[0.9375rem] sm:grid-cols-2">
          <Info label="位序" value="初爻 = BIT 0（固定）" />
          <Info label="随机源" value="WEB CRYPTO API" />
          <Info label="存储" value="仅本地 / 最近 20 条" />
        </dl>
      </section>
    </div>
  )
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 border px-4 py-2 text-[0.9375rem] tracking-[0.16em] transition-[transform,border-color,color] active:translate-y-px ${
        active ? 'border-signal text-signal' : 'border-edge text-fog hover:border-edge-bright'
      }`}
    >
      {children}
    </button>
  )
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="settings-row">
      <div>
        <h2 className="text-[1rem] font-bold tracking-[0.12em] text-ink">{title}</h2>
        <p className="mt-1 max-w-[62ch] text-[0.875rem] leading-relaxed text-fog">{description}</p>
      </div>
      {children}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-fog">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
