import { LocalRepository } from './local-repository'
import type { WorkbenchRepository } from './types'

// TODO Task 5: 接入 SupabaseRepository（配置 VITE_SUPABASE_URL/ANON_KEY 时启用云端模式）
export const isCloudMode = false

export const repository: WorkbenchRepository = new LocalRepository()
