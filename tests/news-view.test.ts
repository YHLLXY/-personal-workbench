import { describe, it, expect, beforeEach } from 'vitest'
import { filterNotes, loadReadIds, saveReadId, hotNoteText } from '../src/modules/news/news-view'
import type { Note } from '../src/lib/db/types'

function n(partial: Partial<Note>): Note { return { id: 'x', content: '', tag: null, archived: false, createdAt: '', updatedAt: '', ...partial } }

beforeEach(() => { localStorage.clear() })

describe('filterNotes（速记搜索 + 标签筛选）', () => {
  const notes = [
    n({ id: 'a', content: 'React Query 缓存要点', tag: '前端' }),
    n({ id: 'b', content: '跑步 5 公里', tag: '健康' }),
    n({ id: 'c', content: 'react hooks 心得', tag: null }),
    n({ id: 'd', content: '读书笔记', tag: '前端' }),
  ]
  it('无过滤条件时原样返回全部', () => {
    expect(filterNotes(notes, '', null).map(x => x.id)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('按 content 不区分大小写过滤（大小写混合命中全部）', () => {
    expect(filterNotes(notes, 'REACT', null).map(x => x.id)).toEqual(['a', 'c'])
  })
  it('按 tag 精确过滤；无 tag 的笔记只被「全部」命中', () => {
    expect(filterNotes(notes, '', '前端').map(x => x.id)).toEqual(['a', 'd'])
    expect(filterNotes(notes, '', '健康').map(x => x.id)).toEqual(['b'])
  })
  it('query + tag 组合取交集', () => {
    expect(filterNotes(notes, 'react', '前端').map(x => x.id)).toEqual(['a'])
    expect(filterNotes(notes, '跑步', '前端')).toEqual([])
  })
  it('关键词首尾空格被忽略', () => {
    expect(filterNotes(notes, '  react ', null)).toHaveLength(2)
  })
  it('匹配不到时返回空数组', () => {
    expect(filterNotes(notes, '不存在', null)).toEqual([])
  })
})

describe('热点已读标记（localStorage wb:hot-read）', () => {
  it('无记录时返回空数组', () => {
    expect(loadReadIds()).toEqual([])
  })
  it('saveReadId 追加并保持插入序；重复 id 去重并移到最新', () => {
    saveReadId('u1'); saveReadId('u2'); saveReadId('u1')
    expect(loadReadIds()).toEqual(['u2', 'u1'])
  })
  it('超过 500 条丢最旧，只保留最近 500 条', () => {
    for (let i = 0; i < 505; i++) saveReadId(`id-${i}`)
    const ids = loadReadIds()
    expect(ids).toHaveLength(500)
    expect(ids[0]).toBe('id-5')
    expect(ids[499]).toBe('id-504')
  })
  it('损坏的 JSON 回退为空数组，不抛异常', () => {
    localStorage.setItem('wb:hot-read', '{oops')
    expect(loadReadIds()).toEqual([])
  })
  it('非数组 JSON 与非字符串元素都被过滤', () => {
    localStorage.setItem('wb:hot-read', JSON.stringify(['ok', 3, null, 'fine']))
    expect(loadReadIds()).toEqual(['ok', 'fine'])
    localStorage.setItem('wb:hot-read', JSON.stringify({ not: 'array' }))
    expect(loadReadIds()).toEqual([])
  })
})

describe('hotNoteText（存速记正文拼接）', () => {
  it('标题 + 换行 + 链接', () => {
    expect(hotNoteText('某热点', 'https://example.com/a')).toBe('某热点\nhttps://example.com/a')
  })
  it('空标题时仅剩换行加链接（不做裁剪，保留原文）', () => {
    expect(hotNoteText('', 'https://e.com')).toBe('\nhttps://e.com')
  })
})
