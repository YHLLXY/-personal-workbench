// 临时探针：带 .ts 后缀相对 import，探测 Vercel 是否支持跨文件 TS 导入（验证后删除）
import { parseRssXml } from './rss-parse.ts'

export default async function handler(_req: unknown, res: { json: (o: unknown) => void }) {
  const items = parseRssXml('<rss><channel><item><title>T</title><link>U</link></item></channel></rss>')
  res.json({ items: items.length, ok: true })
}
