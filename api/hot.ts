import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const tasks: Array<{ key: string; fetch: () => Promise<{ title: string; url: string }[]> }> = [
      { key: 'GitHub', fetch: async () => { const r = await fetch('https://api.github.com/search/repositories?q=created:%3E7d&sort=stars&per_page=8'); const j = await r.json() as any; return (j.items ?? []).map((it: any) => ({ title: `GitHub 热门新库：${it.full_name}（${it.stargazers_count}★）`, url: it.html_url })) } },
      { key: 'Hacker News', fetch: async () => { const r = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json'); const ids = (await r.json() as number[]).slice(0, 5); const out: { title: string; url: string }[] = []; for (const id of ids) { try { const j = await (await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)).json(); out.push({ title: `HN: ${j.title}`, url: `https://news.ycombinator.com/item?id=${id}` }) } catch {} } return out } },
    ]
    const items: Array<{ title: string; source: string; url: string }> = []
    for (const t of tasks) { try { const rows = await t.fetch(); items.push(...rows.map(r => ({ ...r, source: t.key }))) } catch {} }
    res.setHeader('Cache-Control', 's-maxage=600')
    res.json({ items })
  } catch { res.status(500).json({ items: [] }) }
}
