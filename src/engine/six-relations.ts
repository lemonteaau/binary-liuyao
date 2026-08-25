import { generates, overcomes } from '@/data/trigrams'
import type { Element, SixRelation } from '@/types'

/**
 * 六亲以本宫五行为「我」：
 * 同我为兄弟，我生者为子孙，生我者为父母，我克者为妻财，克我者为官鬼。
 */
export function relationOf(lineElement: Element, palaceElement: Element): SixRelation {
  if (lineElement === palaceElement) return '兄弟'
  if (generates(palaceElement, lineElement)) return '子孙'
  if (generates(lineElement, palaceElement)) return '父母'
  if (overcomes(palaceElement, lineElement)) return '妻财'
  return '官鬼'
}

export const SIX_RELATIONS: readonly SixRelation[] = ['父母', '兄弟', '子孙', '妻财', '官鬼']
