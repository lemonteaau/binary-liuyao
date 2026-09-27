import { Link, useLocation } from 'react-router-dom'
import { GUA_INDEX_PATH } from '@/lib/gua'

/** Rendered in place for unknown paths; the address bar is left untouched. */
export function NotFoundPage() {
  const { pathname } = useLocation()
  const isGuaPath = pathname.toLowerCase().startsWith(`${GUA_INDEX_PATH}/`)

  return (
    <div className="pt-6">
      <h1 className="mb-2 text-2xl font-bold tracking-[0.2em]">页面不存在</h1>
      <p className="mb-6 text-[0.9375rem] leading-relaxed text-fog">
        找不到这个地址，可能是链接有误，或页面已经移除。
      </p>

      <section className="panel p-4 sm:p-5">
        <span className="panel-tag">404</span>
        {isGuaPath && (
          <p className="mb-3 text-base leading-relaxed text-fog">
            卦号应为 1–64，如 <Link to={`${GUA_INDEX_PATH}/1`} className="text-signal">{GUA_INDEX_PATH}/1</Link>。
          </p>
        )}
        <ul className="text-base leading-loose">
          <li><Link to="/" className="text-signal">→ 回到起卦</Link></li>
          <li><Link to={GUA_INDEX_PATH} className="text-signal">→ 六十四卦</Link></li>
        </ul>
      </section>
    </div>
  )
}
