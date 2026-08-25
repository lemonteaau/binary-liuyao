import { BRANCHES } from '@/data/trigrams'
import type { Branch, ShenShaEntry, Stem } from '@/types'

export interface ShenShaContext {
  dayStem: Stem
  dayBranch: Branch
  monthBranch: Branch
  yearBranch: Branch
}

interface ShenShaRule {
  id: string
  name: string
  calculate(ctx: ShenShaContext): Branch | Branch[]
}

/** 三合组：寅午戌 / 申子辰 / 巳酉丑 / 亥卯未 */
const SANHE: Array<{ members: Branch[]; key: string }> = [
  { members: ['寅', '午', '戌'], key: '寅午戌' },
  { members: ['申', '子', '辰'], key: '申子辰' },
  { members: ['巳', '酉', '丑'], key: '巳酉丑' },
  { members: ['亥', '卯', '未'], key: '亥卯未' },
]

function sanheKey(branch: Branch): string {
  const g = SANHE.find((g) => g.members.includes(branch))
  return g ? g.key : ''
}

function bySanhe(table: Record<string, Branch>, branch: Branch): Branch {
  return table[sanheKey(branch)]!
}

/** 季节（按日支）：春 寅卯辰 / 夏 巳午未 / 秋 申酉戌 / 冬 亥子丑 */
function seasonOf(branch: Branch): '春' | '夏' | '秋' | '冬' {
  const i = BRANCHES.indexOf(branch)
  if (i >= 2 && i <= 4) return '春'
  if (i >= 5 && i <= 7) return '夏'
  if (i >= 8 && i <= 10) return '秋'
  return '冬'
}

const DAY_BRANCH_INDEX: Record<Branch, number> = Object.fromEntries(
  BRANCHES.map((b, i) => [b, i]),
) as Record<Branch, number>

/**
 * 规则版本 LY-1.0，流派以 PRD §14 样本排盘锁定：
 * - 贵人用「庚辛逢虎马」歌（庚辛 → 寅午）
 * - 天喜按日支季节
 * - 天医按日支退一位
 * - 羊刃仅阳干
 * 在 About 页公开说明；调整规则只需修改本数组。
 */
export const SHEN_SHA_RULES: readonly ShenShaRule[] = [
  {
    id: 'yima',
    name: '驿马',
    calculate: (c) => bySanhe({ 寅午戌: '申', 申子辰: '寅', 巳酉丑: '亥', 亥卯未: '巳' }, c.dayBranch),
  },
  {
    id: 'taohua',
    name: '桃花',
    calculate: (c) => bySanhe({ 寅午戌: '卯', 申子辰: '酉', 巳酉丑: '午', 亥卯未: '子' }, c.dayBranch),
  },
  {
    id: 'rilu',
    name: '日禄',
    calculate: (c) =>
      ({
        甲: '寅', 乙: '卯', 丙: '巳', 丁: '午', 戊: '巳',
        己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子',
      } as Record<Stem, Branch>)[c.dayStem]!,
  },
  {
    id: 'guiren',
    name: '贵人',
    calculate: (c) =>
      ({
        甲: ['丑', '未'], 戊: ['丑', '未'],
        乙: ['子', '申'], 己: ['子', '申'],
        丙: ['亥', '酉'], 丁: ['亥', '酉'],
        庚: ['寅', '午'], 辛: ['寅', '午'],
        壬: ['卯', '巳'], 癸: ['卯', '巳'],
      } as Record<Stem, Branch[]>)[c.dayStem]!,
  },
  {
    id: 'tianxi',
    name: '天喜',
    calculate: (c) => ({ 春: '戌', 夏: '丑', 秋: '辰', 冬: '未' })[seasonOf(c.dayBranch)]! as Branch,
  },
  {
    id: 'tianyi',
    name: '天医',
    calculate: (c) => BRANCHES[(DAY_BRANCH_INDEX[c.dayBranch] + 11) % 12]!, // 日支退一位
  },
  {
    id: 'zaisha',
    name: '灾煞',
    calculate: (c) => bySanhe({ 寅午戌: '子', 申子辰: '午', 巳酉丑: '卯', 亥卯未: '酉' }, c.dayBranch),
  },
  {
    id: 'jiehsa',
    name: '劫煞',
    calculate: (c) => bySanhe({ 寅午戌: '亥', 申子辰: '巳', 巳酉丑: '寅', 亥卯未: '申' }, c.dayBranch),
  },
  {
    id: 'mouxing',
    name: '谋星',
    calculate: (c) => bySanhe({ 寅午戌: '辰', 申子辰: '丑', 巳酉丑: '戌', 亥卯未: '未' }, c.dayBranch),
  },
  {
    id: 'huagai',
    name: '华盖',
    calculate: (c) => bySanhe({ 寅午戌: '戌', 申子辰: '辰', 巳酉丑: '丑', 亥卯未: '未' }, c.dayBranch),
  },
  {
    id: 'jiangxing',
    name: '将星',
    calculate: (c) => bySanhe({ 寅午戌: '午', 申子辰: '子', 巳酉丑: '酉', 亥卯未: '卯' }, c.dayBranch),
  },
  {
    id: 'wenchang',
    name: '文昌',
    calculate: (c) =>
      (({
        甲: '巳', 乙: '午', 丙: '申', 丁: '酉', 戊: '申',
        己: '酉', 庚: '亥', 辛: '子', 壬: '寅', 癸: '卯',
      }) as Record<Stem, Branch>)[c.dayStem]!,
  },
  {
    id: 'yangren',
    name: '羊刃',
    calculate: (c) =>
      ({
        甲: '卯', 丙: '午', 戊: '午', 庚: '酉', 壬: '子',
      } as Partial<Record<Stem, Branch>>)[c.dayStem] ?? [],
  },
]

export function calculateShenSha(ctx: ShenShaContext): ShenShaEntry[] {
  const entries: ShenShaEntry[] = []
  for (const rule of SHEN_SHA_RULES) {
    let branches: Branch[]
    try {
      const r = rule.calculate(ctx)
      branches = Array.isArray(r) ? r : r ? [r] : []
    } catch {
      branches = []
    }
    entries.push({ id: rule.id, name: rule.name, branches })
  }
  return entries
}
