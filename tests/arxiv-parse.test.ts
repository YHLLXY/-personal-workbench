import { describe, it, expect } from 'vitest'
import { parseArxivXml } from '../src/lib/arxiv'

const SAMPLE = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><id>http://arxiv.org/abs/2401.00001v1</id><title>  A   Test  Paper on   RL </title><summary>  Abstract text here.  </summary><author><name>Alice</name></author><author><name>Bob</name></author><published>2024-01-01T00:00:00Z</published></entry></feed>`

describe('parseArxivXml', () => {
  it('解析标题/作者/摘要并清理空白', () => {
    const [r] = parseArxivXml(SAMPLE)
    expect(r.title).toBe('A Test Paper on RL')
    expect(r.authors).toEqual(['Alice', 'Bob'])
    expect(r.arxivId).toBe('2401.00001v1')
    expect(r.abstract).toBe('Abstract text here.')
    expect(r.published).toBe('2024-01-01')
  })
  it('无 entry 返回空数组', () => { expect(parseArxivXml('<feed/>')).toEqual([]) })
})
