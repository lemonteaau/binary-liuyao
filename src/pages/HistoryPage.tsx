import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SupportNudge } from '@/components/SupportNudge'
import { trackEvent } from '@/lib/analytics'
import {
  historyBackupFilename,
  parseHistoryBackup,
  serializeHistoryBackup,
} from '@/lib/history-backup'
import { HISTORY_LIMIT, INPUT_METHOD_LABELS_UI, useReading } from '@/store/reading'
import type { ReadingRecord } from '@/store/reading'

type ImportStatus = { tone: 'ok' | 'error'; text: string } | null

export function HistoryPage() {
  const navigate = useNavigate()
  const { history, openReading, deleteReading, importReadings } = useReading()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<ImportStatus>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [exportedAt, setExportedAt] = useState<number | null>(null)

  function open(record: ReadingRecord) {
    if (!openReading(record.id)) return
    trackEvent('打开历史排盘', { 已记应验: Boolean(record.outcome?.trim()) })
    navigate('/result')
  }

  function exportHistory() {
    const blob = new Blob([serializeHistoryBackup(history)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = historyBackupFilename()
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    trackEvent('导出排盘记录', { 条数: history.length })
    setStatus({ tone: 'ok', text: `已导出 ${history.length} 条记录，请妥善保存备份文件。` })
    setExportedAt(Date.now())
  }

  async function importHistory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const parsed = parseHistoryBackup(await file.text())
    if (!parsed) {
      setStatus({ tone: 'error', text: '无法识别该文件，请选择从 HEX//64 导出的 JSON 备份。' })
      return
    }
    const added = importReadings(parsed.records)
    const skipped = parsed.skipped > 0 ? `，跳过 ${parsed.skipped} 条无效记录` : ''
    setStatus({ tone: 'ok', text: `已导入 ${added} 条新记录${skipped}。` })
    trackEvent('导入排盘记录', { 条数: added })
  }

  return (
    <div className="pt-6">
      <h1 className="mb-2 text-2xl font-bold tracking-[0.2em]">历史排盘</h1>
      <p className="mb-6 text-[0.9375rem] leading-relaxed text-fog">
        保存在当前浏览器，最多 {HISTORY_LIMIT} 条。清除浏览器数据会一并删除，建议定期导出备份。
      </p>

      <section className="panel p-4 sm:p-5">
        <span className="panel-tag">备份</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={exportHistory} disabled={history.length === 0}>
            [ 导出备份 ]
          </button>
          <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
            [ 导入备份 ]
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={importHistory}
          />
        </div>
        <p
          role="status"
          aria-live="polite"
          className={`mt-3 text-[0.875rem] leading-relaxed ${status?.tone === 'error' ? 'text-flux' : 'text-fog'}`}
        >
          {status?.text ?? `共 ${history.length} 条记录。导入时相同排盘不会重复，已有的备注以本机为准。`}
        </p>
        {exportedAt !== null && (
          <SupportNudge key={exportedAt} kind="export" occurrence={String(exportedAt)} className="mt-2">
            如果这些记录对你有用，欢迎
          </SupportNudge>
        )}
      </section>

      {history.length === 0 ? (
        <div className="mt-8 text-base leading-loose text-fog">
          <p>还没有排盘记录。</p>
          <Link to="/" className="text-signal">→ 去起一卦</Link>
        </div>
      ) : (
        <ol className="history-list mt-6" aria-label="排盘记录">
          {history.map((record) => (
            <li key={record.id} className="history-item panel">
              <button type="button" className="history-item-main" onClick={() => open(record)}>
                <span className="history-item-meta">
                  <span className="tabular-nums">{record.chart.createdAt.slice(0, 16)}</span>
                  <span aria-hidden="true">//</span>
                  <span>
                    {record.source === 'share-link'
                      ? '分享链接'
                      : INPUT_METHOD_LABELS_UI[record.chart.inputMethod]}
                  </span>
                  {record.outcome?.trim() && <span className="history-item-badge">已记应验</span>}
                </span>
                <span className="history-item-hex">
                  {record.chart.primary.record.chineseName}
                  {record.chart.mutationMask !== 0 && (
                    <>
                      <span className="text-fog" aria-label="变为"> → </span>
                      {record.chart.result.record.chineseName}
                    </>
                  )}
                </span>
                <span className={record.question?.trim() ? 'history-item-question' : 'history-item-question is-empty'}>
                  {record.question?.trim() || '未记录所问之事'}
                </span>
              </button>
              <div className="history-item-actions">
                {pendingDeleteId === record.id ? (
                  <>
                    <button
                      type="button"
                      className="history-item-action text-flux"
                      onClick={() => {
                        deleteReading(record.id)
                        setPendingDeleteId(null)
                      }}
                    >
                      确认删除
                    </button>
                    <button
                      type="button"
                      className="history-item-action"
                      onClick={() => setPendingDeleteId(null)}
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="history-item-action"
                    aria-label={`删除排盘 ${record.id}`}
                    onClick={() => setPendingDeleteId(record.id)}
                  >
                    删除
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
