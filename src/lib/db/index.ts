import type { WorkbenchRepository } from './types'
import { LocalRepository } from './local-repository'
import { SupabaseRepository } from './supabase-repository'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** 云端模式：配置了 Supabase 环境变量 */
export const isCloudMode = Boolean(supabaseUrl && supabaseAnon)

export const repository: WorkbenchRepository = isCloudMode
  ? new SupabaseRepository()
  : new LocalRepository()
