import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SOURCES } from './sources.ts'
import { fetchAll } from './fetch-all.ts'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const ids = typeof req.query.sources === 'string' ? req.query.sources.split(',').filter(Boolean) : []
    const selected = ids.length > 0 ? SOURCES.filter(s => ids.includes(s.id)) : SOURCES
    const items = await fetchAll(selected)
    const sources = SOURCES.map(({ id, name, category, experimental }) => ({ id, name, category, experimental }))
    res.setHeader('Cache-Control', 's-maxage=600')
    res.json({ items, sources, fetchedAt: new Date().toISOString() })
  } catch {
    res.status(500).json({ items: [], sources: [], fetchedAt: null })
  }
}
