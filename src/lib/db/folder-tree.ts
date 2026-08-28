import type { Folder } from './types'

/**
 * 断言将 id 移动到 newParentId 不会形成循环引用。
 * 从 newParentId 沿 parentId 向上遍历，若遇到 id 说明目标是子孙 → 抛错。
 * 共享函数：supabase-repository 和 local-repository 共用。
 */
export function assertNoCycle(folders: Folder[], id: string, newParentId: string | null): void {
  if (newParentId === null) return // 移到根目录不会成环
  if (newParentId === id) throw new Error('不能移动到自身')
  const parentOf = new Map<string, string | null>()
  for (const f of folders) parentOf.set(f.id, f.parentId)
  let current: string | null = newParentId
  let iterations = 0
  const MAX = 1000
  while (current !== null) {
    if (current === id) throw new Error('不能移动到自己的子文件夹内')
    current = parentOf.get(current) ?? null
    if (++iterations > MAX) throw new Error('文件夹结构异常：遍历祖先链超限')
  }
}
