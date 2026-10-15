import { describe, it, expect } from 'vitest'
import { normalizeUrl, titleHash, parseLlmJson, normalizeEnrichment, groupByCategory, mapLimit, intEnv, splitBudget } from '../api/digest'

/** AI 日报的纯函数（v1.27）。API 本体要打真网络，这里只钉住可判定的部分。 */

describe('normalizeUrl（层次 1 去重 / url_hash 的唯一输入）', () => {
  it('http 升 https、统一小写', () => {
    expect(normalizeUrl('HTTP://Example.COM/Path')).toBe('https://example.com/path')
  })
  it('去掉 utm_* 与常见跟踪参数', () => {
    expect(normalizeUrl('https://a.com/x?utm_source=weibo&utm_medium=share&id=7'))
      .toBe('https://a.com/x?id=7')
    expect(normalizeUrl('https://a.com/x?fbclid=abc')).toBe('https://a.com/x')
  })
  it('去尾斜杠；同一篇文章的两种写法归一后相等', () => {
    expect(normalizeUrl('https://a.com/x/')).toBe(normalizeUrl('https://a.com/x'))
    expect(normalizeUrl('http://a.com/x?utm_source=wx')).toBe(normalizeUrl('https://a.com/x'))
  })
  it('空值不崩', () => {
    expect(normalizeUrl('')).toBe('')
  })
})

describe('titleHash（层次 2 去重：不同站点转载同一篇）', () => {
  it('忽略标点、空格、大小写', () => {
    expect(titleHash('OpenAI 发布 GPT-5！')).toBe(titleHash('openai发布gpt5'))
  })
  it('不同标题给出不同指纹', () => {
    expect(titleHash('苹果发布新机')).not.toBe(titleHash('苹果发布新系统'))
  })
  it('标题全为标点时退化为空串的 md5，不抛错', () => {
    expect(titleHash('—— ……')).toBe(titleHash(''))
  })
})

describe('parseLlmJson（模型偶尔不守 response_format）', () => {
  it('裸 JSON', () => {
    expect(parseLlmJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 })
  })
  it('剥掉 ```json 围栏', () => {
    expect(parseLlmJson<{ a: number }>('```json\n{"a":2}\n```')).toEqual({ a: 2 })
  })
  it('忽略前后废话', () => {
    expect(parseLlmJson<{ a: number }>('好的，结果如下：{"a":3} 希望有帮助')).toEqual({ a: 3 })
  })
  it('无法解析时返回 null 而不是抛错', () => {
    expect(parseLlmJson('完全不是 JSON')).toBeNull()
    expect(parseLlmJson('')).toBeNull()
    expect(parseLlmJson('{坏掉的')).toBeNull()
  })
})

describe('normalizeEnrichment（钳制模型输出，防止脏数据进库）', () => {
  it('分数钳制到 [0,10]', () => {
    expect(normalizeEnrichment({ score: 99 }).score).toBe(10)
    expect(normalizeEnrichment({ score: -3 }).score).toBe(0)
    expect(normalizeEnrichment({ score: Number('abc') }).score).toBe(0)
    expect(normalizeEnrichment(null).score).toBe(0)
  })
  it('标签去 # 号、去空、限量 5 个、限长', () => {
    const r = normalizeEnrichment({ tags: ['#AI', ' 芯片 ', '', 'a', 'b', 'c', 'd'] })
    expect(r.tags).toEqual(['AI', '芯片', 'a', 'b', 'c'])
    expect(normalizeEnrichment({ tags: ['x'.repeat(50)] }).tags[0].length).toBe(16)
  })
  it('分类缺失兜底「其他」，摘要限长', () => {
    expect(normalizeEnrichment({}).category).toBe('其他')
    expect(normalizeEnrichment({ category: '  ' }).category).toBe('其他')
    expect(normalizeEnrichment({ summary: 'x'.repeat(500) }).summary.length).toBe(300)
  })
  it('skip 只在严格 true 时成立', () => {
    expect(normalizeEnrichment({ skip: true }).skip).toBe(true)
    expect(normalizeEnrichment({ skip: 'yes' as never }).skip).toBe(false)
  })
})

describe('groupByCategory（分类与排序交给代码，模型只写文字）', () => {
  const items = [
    { ai_category: '科技', ai_score: 5 },
    { ai_category: '科技', ai_score: 9 },
    { ai_category: '财经', ai_score: 7 },
    { ai_category: '科技', ai_score: 8 },
    { ai_category: '科技', ai_score: 6 },
    { ai_category: null, ai_score: 1 },
  ]
  it('组内按分数降序，每组限量', () => {
    const g = groupByCategory(items, 2)
    expect(g.find(x => x.category === '科技')!.items.map(i => i.ai_score)).toEqual([9, 8])
    expect(g.find(x => x.category === '财经')!.items.map(i => i.ai_score)).toEqual([7])
  })
  it('分类为空归入「其他」，组间按最高分排序', () => {
    const g = groupByCategory(items, 4)
    expect(g.map(x => x.category)).toEqual(['科技', '财经', '其他'])
  })
  it('空输入返回空数组', () => {
    expect(groupByCategory([])).toEqual([])
  })
})

describe('mapLimit（内置并发限流，不引 p-limit）', () => {
  it('保持结果顺序', async () => {
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => { await new Promise(r => setTimeout(r, (6 - n) * 2)); return n * 10 })
    expect(out).toEqual([10, 20, 30, 40, 50])
  })
  it('并发不超上限', async () => {
    let live = 0, peak = 0
    await mapLimit(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      live++; peak = Math.max(peak, live)
      await new Promise(r => setTimeout(r, 2))
      live--
    })
    expect(peak).toBeLessThanOrEqual(3)
  })
  it('空数组不启动 worker', async () => {
    expect(await mapLimit([], 5, async () => 1)).toEqual([])
  })
})

describe('intEnv（环境变量配错不能把整条链路静默弄哑）', () => {
  it('未配置 / 空串 → 回落默认值', () => {
    delete process.env.T_X
    expect(intEnv('T_X', 20, 0, 100)).toBe(20)
    process.env.T_X = '   '
    expect(intEnv('T_X', 20, 0, 100)).toBe(20)
    delete process.env.T_X
  })
  it('非数字 → 回落默认值（而不是 NaN）', () => {
    process.env.T_X = 'abc'
    expect(intEnv('T_X', 20, 0, 100)).toBe(20)
    process.env.T_X = 'NaN'
    expect(intEnv('T_X', 20, 0, 100)).toBe(20)
    process.env.T_X = 'Infinity'
    expect(intEnv('T_X', 20, 0, 100)).toBe(20)
    delete process.env.T_X
  })
  it('越界钳制，小数取整', () => {
    process.env.T_X = '-5'; expect(intEnv('T_X', 20, 0, 100)).toBe(0)
    process.env.T_X = '999'; expect(intEnv('T_X', 20, 0, 100)).toBe(100)
    process.env.T_X = '7.9'; expect(intEnv('T_X', 20, 0, 100)).toBe(7)
    delete process.env.T_X
  })
})

describe('mapLimit 兜底', () => {
  it('并发数传 NaN 时退化成串行，而不是起 0 个 worker 把整批活丢掉', async () => {
    const out = await mapLimit([1, 2, 3], Number.NaN, async n => n * 2)
    expect(out).toEqual([2, 4, 6])
  })
  it('并发数为 0 或负数时同样不会丢活', async () => {
    expect(await mapLimit([1, 2], 0, async n => n)).toEqual([1, 2])
    expect(await mapLimit([1, 2], -3, async n => n)).toEqual([1, 2])
  })
})

describe('splitBudget（摘要阶段不能吃满预算，否则聚簇颗粒无收）', () => {
  it('摘要拿 60%，剩下的留给聚簇', () => {
    expect(splitBudget(1000, 20_000)).toEqual({ enrichUntil: 13_000, clusterUntil: 21_000 })
  })
  it('任何正预算下，摘要的截止都严格早于聚簇', () => {
    for (const total of [1, 100, 3_000, 20_000, 280_000]) {
      const b = splitBudget(0, total)
      expect(b.enrichUntil).toBeLessThan(b.clusterUntil)
    }
  })
  it('预算为 0（只抓取落库模式）时两段都立即到期', () => {
    expect(splitBudget(1000, 0)).toEqual({ enrichUntil: 1000, clusterUntil: 1000 })
  })
})
