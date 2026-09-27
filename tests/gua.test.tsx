import { describe, expect, it } from 'vitest'
import { hexagramByKingWen } from '@/data/hexagrams'
import { zhouyiTextByKingWen } from '@/data/zhouyi'
import { GUA_NUMBERS, guaNumberFromPath, guaProfile, palaceGroups } from '@/lib/gua'
import { PUBLIC_ROUTES, canonicalUrl, robotsContent, routeMetadata } from '@/lib/seo'
import { renderPublicPage } from '../src/prerender'

describe('六十四卦静态页', () => {
  it('只接受 /gua/1 至 /gua/64', () => {
    expect(guaNumberFromPath('/gua/1')).toBe(1)
    expect(guaNumberFromPath('/gua/64')).toBe(64)
    for (const path of ['/gua', '/gua/0', '/gua/65', '/gua/013', '/gua/1/x', '/gua/qian']) {
      expect(guaNumberFromPath(path)).toBeNull()
    }
  })

  it('八纯卦简称取首字，其余取卦名后部', () => {
    expect(hexagramByKingWen(1)!.shortName).toBe('乾')
    expect(hexagramByKingWen(29)!.shortName).toBe('坎')
    expect(hexagramByKingWen(13)!.shortName).toBe('同人')
    expect(hexagramByKingWen(3)!.shortName).toBe('屯')
  })

  it('天火同人：离宫归魂，世三应上，错综互卦', () => {
    const gua = guaProfile(13)
    expect(gua.state.palace).toBe('离宫')
    expect(gua.state.palaceRank).toBe('归魂')
    expect(gua.lines.map((line) => `${line.najia.stem}${line.najia.branch}${line.relation}${line.shiYing ?? ''}`)).toEqual([
      '己卯父母', '己丑子孙', '己亥官鬼世', '壬午兄弟', '壬申妻财', '壬戌子孙应',
    ])
    expect(gua.fuShen).toEqual([])
    expect(gua.cuo.chineseName).toBe('地水师')
    expect(gua.zong.chineseName).toBe('火天大有')
    expect(gua.hu.chineseName).toBe('天风姤')
  })

  it('天风姤缺妻财，伏于首卦乾为天二爻甲寅木', () => {
    expect(guaProfile(44).fuShen).toEqual([
      { index: 1, relation: '妻财', najia: { stem: '甲', branch: '寅', element: '木' } },
    ])
  })

  it('八宫各八卦，恰好覆盖六十四卦', () => {
    const groups = palaceGroups()
    expect(groups.map((group) => group.members.length)).toEqual(Array(8).fill(8))
    expect(new Set(groups.flatMap((group) => group.members.map((record) => record.kingWenNumber))).size).toBe(64)
    expect(groups[0]!.members.map((record) => record.chineseName)).toEqual([
      '乾为天', '天风姤', '天山遁', '天地否', '风地观', '山地剥', '火地晋', '火天大有',
    ])
  })

  it('每卦都有独立、可收录的元信息', () => {
    const titles = GUA_NUMBERS.map((number) => routeMetadata(`/gua/${number}`).title)
    expect(new Set(titles).size).toBe(64)
    expect(routeMetadata('/gua/2').description).toContain('京房八宫属坤宫首卦，')
    expect(routeMetadata('/gua/13').description).toContain('京房八宫属离宫归魂卦，')
    for (const path of ['/gua', '/gua/1', '/gua/64']) {
      expect(PUBLIC_ROUTES).toContain(path)
      expect(robotsContent(path)).toMatch(/^index,/)
      expect(canonicalUrl(path)).toBe(`https://liuyao.lemontea.xyz${path}`)
    }
    for (const path of ['/gua/0', '/gua/65', '/gua/222']) {
      expect(robotsContent(path)).toBe('noindex,follow')
      expect(canonicalUrl(path)).toBe('https://liuyao.lemontea.xyz/')
      expect(routeMetadata(path).title).toBe('页面不存在 - HEX//64')
    }
  })

  it('预渲染出每卦的正文与互链', () => {
    for (const number of GUA_NUMBERS) {
      const html = renderPublicPage(`/gua/${number}`)
      const record = hexagramByKingWen(number)!
      expect(html).toMatch(new RegExp(`<h1[^>]*>${record.chineseName}<`))
      expect(html).toContain(zhouyiTextByKingWen(number).statement)
      expect(html).toContain('href="/gua"')
    }
    const index = renderPublicPage('/gua')
    for (const number of GUA_NUMBERS) expect(index).toContain(`href="/gua/${number}"`)
  })

  it('无效卦号显示 404 页面，而不是起卦页', () => {
    for (const path of ['/gua/222', '/gua/0', '/gua/65']) {
      const html = renderPublicPage(path)
      expect(html).toMatch(/<h1[^>]*>页面不存在<\/h1>/)
      expect(html).toContain('卦号应为 1–64')
      expect(html).toContain('href="/gua"')
      expect(html).not.toMatch(/<h1[^>]*>六爻排盘<\/h1>/)
      expect(html).not.toContain('摇币起卦')
    }
  })
})
