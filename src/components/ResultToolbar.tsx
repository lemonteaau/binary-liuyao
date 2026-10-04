import type { Ref } from 'react'
import { Link } from 'react-router-dom'
import { CopyButton } from '@/components/CopyButton'
import { ShareImageButton } from '@/components/ShareImageButton'
import type { NoteDraft } from '@/components/ReadingNotesPanel'
import { READING_QUESTION_MAX_LENGTH } from '@/lib/reading-storage'
import type { ChartData } from '@/types'

interface ChartOutputProps {
  chart: ChartData
  sessionId: string
  ordinal?: number | null
  getRawText: () => string
  onCopied: () => void
}

/** 结果页顶部：所问之事、全部操作与复制附带项集中在一处。 */
export function ResultToolbar({
  ref,
  question,
  getShareUrl,
  onEdit,
  onStartOver,
  includeQuestion,
  onIncludeQuestionChange,
  aiInstruction,
  onAiInstructionChange,
  ...output
}: ChartOutputProps & {
  ref?: Ref<HTMLElement>
  question: NoteDraft
  getShareUrl: () => string
  onEdit: () => void
  onStartOver: () => void
  includeQuestion: boolean
  onIncludeQuestionChange: (on: boolean) => void
  aiInstruction: boolean
  onAiInstructionChange: (on: boolean) => void
}) {
  return (
    <section ref={ref} className="result-toolbar panel mt-4" aria-label="所问与操作">
      <span className="panel-tag">所问 // 操作</span>

      <div className="result-question">
        <div className="result-question-head">
          <label htmlFor="reading-question">所问何事</label>
          <p id="reading-question-hint">只保存在当前浏览器，不会进入分享链接与分享图。</p>
          <span role="status" aria-live="polite">{question.saved ? '已保存' : '正在保存…'}</span>
        </div>
        <input
          id="reading-question"
          type="text"
          value={question.value}
          maxLength={READING_QUESTION_MAX_LENGTH}
          onChange={(event) => question.change(event.target.value)}
          onBlur={question.flush}
          placeholder="例如：这次面试能否通过"
          autoComplete="off"
          aria-describedby="reading-question-hint"
        />
      </div>

      <div className="result-actions">
        <div className="result-actions-primary">
          <CopyChartButton {...output} />
          <ShareImageButton
            chart={output.chart}
            sessionId={output.sessionId}
            ordinal={output.ordinal}
            className="result-primary-button"
          />
        </div>
        <div className="result-actions-secondary">
          <span className="result-copy">
            <CopyButton label="复制链接" getText={getShareUrl} className="result-secondary-button" />
          </span>
          <button type="button" className="btn result-secondary-button" onClick={onEdit}>
            修改排盘
          </button>
          <button type="button" className="btn result-secondary-button" onClick={onStartOver}>
            再起一卦
          </button>
          <Link to="/history" className="btn result-secondary-button no-underline">
            历史记录
          </Link>
        </div>
      </div>

      <div className="result-copy-options" role="group" aria-label="复制排盘时附带">
        <span>复制时附带</span>
        <label>
          <input
            type="checkbox"
            checked={includeQuestion}
            onChange={(event) => onIncludeQuestionChange(event.target.checked)}
          />
          所问
        </label>
        <label>
          <input
            type="checkbox"
            checked={aiInstruction}
            onChange={(event) => onAiInstructionChange(event.target.checked)}
          />
          AI 指令
        </label>
        <Link to="/settings">编辑提示词 →</Link>
      </div>
    </section>
  )
}

/** 顶部工具栏滚出视野后出现；手机上贴底，桌面端停在页尾。 */
export function ResultDock({
  visible,
  onStartOver,
  ...output
}: ChartOutputProps & {
  visible: boolean
  onStartOver: () => void
}) {
  return (
    <nav className="result-dock" hidden={!visible} aria-label="排盘快捷操作">
      <CopyChartButton {...output} />
      <ShareImageButton
        chart={output.chart}
        sessionId={output.sessionId}
        ordinal={output.ordinal}
        className="result-primary-button"
      />
      <button type="button" className="btn result-primary-button result-dock-restart" onClick={onStartOver}>
        再起一卦
      </button>
    </nav>
  )
}

function CopyChartButton({ getRawText, onCopied }: Pick<ChartOutputProps, 'getRawText' | 'onCopied'>) {
  return (
    <span className="result-copy">
      <CopyButton
        label="复制排盘"
        getText={getRawText}
        className="result-primary-button result-copy-chart"
        onCopied={onCopied}
      >
        <CopyIcon />
        <span>复制排盘</span>
      </CopyButton>
    </span>
  )
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[1em] fill-none stroke-current">
      <rect x="8" y="8" width="11" height="11" rx="1" strokeWidth="1.8" />
      <path d="M16 8V5H5v11h3" strokeWidth="1.8" />
    </svg>
  )
}
