import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { CaretDown } from '@phosphor-icons/react/dist/icons/CaretDown'
import { Check } from '@phosphor-icons/react/dist/icons/Check'
import { MagnifyingGlass } from '@phosphor-icons/react/dist/icons/MagnifyingGlass'
import { cn } from '@/lib/cn'
import { buildTimezoneCatalog, matchesTimezoneQuery, timezoneEntry } from '@/lib/timezone-catalog'
import type { TimezoneEntry } from '@/lib/timezone-catalog'

interface Section {
  label: string
  entries: TimezoneEntry[]
  /** 本组第一项在整张列表里的序号 */
  start: number
}

interface TimezonePickerProps {
  /** 'auto' 或 IANA 时区名 */
  value: string
  detected: string
  fellBack: boolean
  onChange: (timezone: string) => void
}

/** 能用鼠标的设备才自动聚焦搜索框；触屏上一打开就弹键盘反而挡住列表 */
function prefersSearchFocus(): boolean {
  try {
    return window.matchMedia('(pointer: fine)').matches
  } catch {
    return false
  }
}

export function TimezonePicker({ value, detected, fellBack, onChange }: TimezonePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLDivElement | null>>([])
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = (index: number) => `${baseId}-option-${index}`

  const current = useMemo(() => timezoneEntry(value, detected, fellBack), [value, detected, fellBack])

  const sections = useMemo<Section[]>(() => {
    if (!open) return []
    const catalog = buildTimezoneCatalog(detected, fellBack, value)
    if (!query.trim()) {
      const common = [catalog.auto, ...catalog.pinned]
      return [
        { label: '常用', entries: common, start: 0 },
        { label: '全部时区', entries: catalog.rest, start: common.length },
      ]
    }
    const matches = [catalog.auto, ...catalog.pinned, ...catalog.rest]
      .filter((entry) => matchesTimezoneQuery(entry, query))
    return [{ label: '搜索结果', entries: matches, start: 0 }]
  }, [open, query, detected, fellBack, value])

  const options = useMemo(() => sections.flatMap((section) => section.entries), [sections])

  useEffect(() => {
    if (!open) return
    if (prefersSearchFocus()) searchRef.current?.focus()
    else listRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeIndex])

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [open])

  // 打开时停在当前选中项：常用里的直接定位，其余要等目录建好，按排序位置算
  const openPicker = () => {
    const catalog = buildTimezoneCatalog(detected, fellBack, value)
    const ordered = [catalog.auto, ...catalog.pinned, ...catalog.rest]
    setActiveIndex(Math.max(ordered.findIndex((entry) => entry.value === value), 0))
    setOpen(true)
  }

  const close = (restoreFocus: boolean) => {
    setOpen(false)
    setQuery('')
    if (restoreFocus) triggerRef.current?.focus()
  }

  const choose = (entry: TimezoneEntry) => {
    if (entry.value !== value) onChange(entry.value)
    close(true)
  }

  const onPanelKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => Math.min(index + 1, options.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => Math.max(index - 1, 0))
        break
      case 'PageDown':
        event.preventDefault()
        setActiveIndex((index) => Math.min(index + 8, options.length - 1))
        break
      case 'PageUp':
        event.preventDefault()
        setActiveIndex((index) => Math.max(index - 8, 0))
        break
      case 'Enter': {
        const entry = options[activeIndex]
        if (entry) {
          event.preventDefault()
          choose(entry)
        }
        break
      }
      case 'Escape':
        event.preventDefault()
        close(true)
        break
      case 'Tab':
        close(false)
        break
    }
  }

  return (
    <div ref={rootRef} className="tz-picker" data-open={open}>
      <button
        ref={triggerRef}
        type="button"
        className="tz-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`时区：${current.title}`}
        onClick={() => (open ? close(false) : openPicker())}
      >
        <span className="tz-picker-trigger-text">
          <span className="tz-picker-title">{current.title}</span>
          <span className="tz-picker-detail">{current.detail}</span>
        </span>
        <CaretDown size={16} aria-hidden="true" className="tz-picker-caret" />
      </button>

      {open && (
        <div className="tz-picker-panel" onKeyDown={onPanelKeyDown}>
          <label className="tz-picker-search">
            <MagnifyingGlass size={16} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveIndex(0)
              }}
              placeholder="搜索城市、时区或 +8"
              role="combobox"
              aria-label="搜索时区"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={options[activeIndex] ? optionId(activeIndex) : undefined}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="时区"
            tabIndex={-1}
            className="tz-picker-list"
            aria-activedescendant={options[activeIndex] ? optionId(activeIndex) : undefined}
          >
            {options.length === 0 && <p className="tz-picker-empty">没有匹配的时区</p>}
            {sections.map((section, sectionIndex) => section.entries.length > 0 && (
              <Fragment key={section.label}>
                {sectionIndex > 0 && <div role="separator" className="tz-picker-divider" />}
                <div role="group" aria-label={section.label}>
                  <div className="tz-picker-group" aria-hidden="true">{section.label}</div>
                  {section.entries.map((entry, offset) => {
                    const index = section.start + offset
                    const selected = entry.value === value
                    return (
                      <div
                        key={entry.value}
                        ref={(node) => { optionRefs.current[index] = node }}
                        id={optionId(index)}
                        role="option"
                        aria-selected={selected}
                        className={cn('tz-picker-option', index === activeIndex && 'is-active')}
                        onPointerMove={() => setActiveIndex(index)}
                        onClick={() => choose(entry)}
                      >
                        <span className="tz-picker-option-text">
                          <span className="tz-picker-title">{entry.title}</span>
                          <span className="tz-picker-detail">{entry.detail}</span>
                        </span>
                        {selected && <Check size={16} aria-hidden="true" className="tz-picker-check" />}
                      </div>
                    )
                  })}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
