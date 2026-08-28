import { useQuery } from '@tanstack/react-query'
import { isCloudMode } from '../../lib/db'
import { getSupabaseClient } from '../../lib/db/supabase-client'

export interface ProjectInfo {
  name: string
  /** 知识库 30-项目/ 下的目录名（详情寻址用；旧缓存可能缺失，取值时回退 name） */
  dir?: string
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

export interface ProjectDetail {
  dir: string
  name: string
  html: string | null
  markdown: string | null
  rendered: boolean
  gatewayPath: string | null
  files: { name: string; path: string }[]
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

async function accessToken(): Promise<string | null> {
  if (!isCloudMode) return null
  try {
    const { data } = await getSupabaseClient().auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

export async function fetchProjectDetail(dir: string): Promise<ProjectDetail> {
  const token = await accessToken()
  const r = await fetch(`/api/projects?entry=detail&dir=${encodeURIComponent(dir)}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  })
  if (!r.ok) throw new Error(String(r.status))
  return r.json() as Promise<ProjectDetail>
}

export function useProjectDetail(dir: string | undefined) {
  return useQuery({
    queryKey: ['project-detail', dir],
    queryFn: () => fetchProjectDetail(dir!),
    enabled: dir != null && dir !== '',
    staleTime: 10 * 60 * 1000,
    retry: false,
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
