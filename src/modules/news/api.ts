import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isCloudMode, repository } from '../../lib/db'
import { getSupabaseClient } from '../../lib/db/supabase-client'
import type { Paper, Note, Folder } from '../../lib/db/types'

export const paperKeys = { all: ['papers'] as const }
export const noteKeys = { all: ['notes'] as const }

export function usePapers() { return useQuery({ queryKey: paperKeys.all, queryFn: () => repository.listPapers() }) }
export function usePaperMutations() {
  const qc = useQueryClient(); const inv = () => qc.invalidateQueries({ queryKey: paperKeys.all })
  return {
    create: useMutation({ mutationFn: (input: Omit<Paper, 'id' | 'createdAt'>) => repository.createPaper(input), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Paper> }) => repository.updatePaper(id, patch), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => repository.deletePaper(id), onSuccess: inv }),
  }
}

export const folderKeys = { all: ['folders'] as const }

export function useFolders() { return useQuery({ queryKey: folderKeys.all, queryFn: () => repository.listFolders() }) }
export function useFolderMutations() {
  const qc = useQueryClient()
  const inv = () => { qc.invalidateQueries({ queryKey: folderKeys.all }); qc.invalidateQueries({ queryKey: paperKeys.all }) }
  return {
    create: useMutation({ mutationFn: (input: { name: string; parentId?: string | null }) => repository.createFolder(input), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<Folder, 'name' | 'sort'>> }) => repository.updateFolder(id, patch), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => repository.deleteFolder(id), onSuccess: inv }),
    move: useMutation({ mutationFn: ({ id, newParentId }: { id: string; newParentId: string | null }) => repository.moveFolder(id, newParentId), onSuccess: inv }),
  }
}

// —— AI 日报（服务端生成，前端只读；见 api/digest.ts 与迁移 015）——
// ⚠️ limit 必须进 queryKey。首页卡只要 1 条、日报页要 30 条，若共用 ['dailyReports']，
// 先挂载的那个会决定缓存内容——从首页进「今日热点」时，日期切换器会只剩今天一条（v1.28.1 修复）。
// root 保留成前缀，好让「重新生成」后的失效能一次覆盖所有 limit。
export const digestKeys = {
  root: ['dailyReports'] as const,
  list: (limit: number) => ['dailyReports', limit] as const,
}

export function useDailyReports(limit = 30) {
  return useQuery({
    queryKey: digestKeys.list(limit),
    queryFn: () => repository.listDailyReports(limit),
    staleTime: 5 * 60_000,
    // 迁移 015 没执行时表不存在，属于配置问题——重试只是白白多等一个来回
    retry: false,
  })
}

/** 手动重生成当日日报。只有云端模式有这条链路（本地模式拿不到 service role） */
export function useRebuildDigest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!isCloudMode) throw new Error('本地模式没有 AI 日报链路')
      const sb = getSupabaseClient()
      const { data: { session } } = await sb.auth.getSession()
      if (!session) throw new Error('未登录')
      const r = await fetch('/api/build-digest', { method: 'POST', headers: { authorization: `Bearer ${session.access_token}` } })
      return await r.json() as { ok?: boolean; built?: boolean; items?: number; error?: string }
    },
    // 前缀失效：一次覆盖所有 limit 的缓存条目
    onSuccess: () => qc.invalidateQueries({ queryKey: digestKeys.root }),
  })
}

export function useNotes() { return useQuery({ queryKey: noteKeys.all, queryFn: () => repository.listNotes(), select: ns => ns.filter(n => !n.archived) }) }
export function useNoteMutations() {
  const qc = useQueryClient(); const inv = () => qc.invalidateQueries({ queryKey: noteKeys.all })
  return {
    create: useMutation({ mutationFn: ({ content, tag }: { content: string; tag?: string | null }) => repository.createNote(content, tag), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Note> }) => repository.updateNote(id, patch), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => repository.deleteNote(id), onSuccess: inv }),
  }
}
