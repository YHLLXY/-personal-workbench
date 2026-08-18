import { useQuery } from '@tanstack/react-query'

export interface ProjectInfo {
  name: string
  emoji: string
  phase: string
  stack: string[]
  aliases: string[]
  updatedAt: string | null
  summary: string
}
export interface ProjectsResponse {
  updatedAt: string | null
  source: 'github' | 'fallback'
  projects: ProjectInfo[]
}

export async function loadProjects(): Promise<ProjectsResponse> {
  try {
    const r = await fetch('/api/projects', { headers: { accept: 'application/json' } })
    if (!r.ok) throw new Error(String(r.status))
    const j = await r.json() as ProjectsResponse
    if (Array.isArray(j.projects)) return j
    throw new Error('bad payload')
  } catch {
    const r2 = await fetch('/projects-status.json')
    if (!r2.ok) throw new Error('api and fallback both failed')
    const j = await r2.json() as Omit<ProjectsResponse, 'source'>
    return { ...j, source: 'fallback' }
  }
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: loadProjects,
    staleTime: 10 * 60 * 1000,
  })
}

/** phase 展示顺序（进行中在前，其余按归档程度靠后） */
export const PHASE_ORDER = ['进行中', '已完成', '已归档', '暂停'] as const
export function sortProjects(projects: ProjectInfo[]): ProjectInfo[] {
  const rank = (p: ProjectInfo) => {
    const i = (PHASE_ORDER as readonly string[]).indexOf(p.phase)
    return i === -1 ? PHASE_ORDER.length : i
  }
  return [...projects].sort((a, b) => rank(a) - rank(b) || String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
}