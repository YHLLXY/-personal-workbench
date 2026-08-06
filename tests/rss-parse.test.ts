import { describe, it, expect } from 'vitest'
import { parseRssXml } from '../api/rss-parse'

describe('parseRssXml', () => {
  it('解析 RSS 2.0 的 item title/link', () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>Hello</title><link>https://a.com/1</link></item><item><title>World</title><link>https://a.com/2</link></item></channel></rss>`
    expect(parseRssXml(xml)).toEqual([
      { title: 'Hello', url: 'https://a.com/1' },
      { title: 'World', url: 'https://a.com/2' },
    ])
  })
  it('title 含 CDATA 时剥离 CDATA 标签', () => {
    const xml = `<rss><channel><item><title><![CDATA[ 今日 <b>热点</b> & 快讯 ]]></title><link>https://a.com/x</link></item></channel></rss>`
    expect(parseRssXml(xml)[0].title).toBe('今日 <b>热点</b> & 快讯')
  })
  it('解码 HTML 实体（amp/lt/gt/quot/apos/数字实体）', () => {
    const xml = `<rss><channel><item><title>a&amp;b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#65;</title><link>https://a.com/y</link></item></channel></rss>`
    expect(parseRssXml(xml)[0].title).toBe('a&b <c> "d" \'e\' A')
  })
  it('item 缺 title 或 link 时跳过该条', () => {
    const xml = `<rss><channel><item><title>只有标题</title></item><item><link>https://a.com/z</link></item><item><title>完整</title><link>https://a.com/w</link></item></channel></rss>`
    expect(parseRssXml(xml)).toEqual([{ title: '完整', url: 'https://a.com/w' }])
  })
  it('空串/非法 XML 返回空数组不崩溃', () => {
    expect(parseRssXml('')).toEqual([])
    expect(parseRssXml('<broken><unclosed')).toEqual([])
    expect(parseRssXml(null as unknown as string)).toEqual([])
  })
  it('title 前后空白修剪', () => {
    const xml = `<rss><channel><item><title>\n  Space Title  </title><link> https://a.com/s </link></item></channel></rss>`
    expect(parseRssXml(xml)).toEqual([{ title: 'Space Title', url: 'https://a.com/s' }])
  })
})
