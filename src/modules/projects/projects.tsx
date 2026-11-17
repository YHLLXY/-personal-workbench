import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, FolderKanban, RefreshCcw } from 'lucide-react'
import { useProjects, sortProjects, PHASE_ORDER, type ProjectInfo } from './api'
import { PHASE_STYLE, fmtDate } from './shared'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

function ProjectCard({ p }: { p: ProjectInfo }) {
  return (
    <Link to={`/projects/${encodeURIComponent(p.dir ?? p.name)}`}
      className="block rounded-2xl border border-border bg-card p-4 hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-xl">{p.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold truncate">{p.name}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', PHASE_STYLE[p.phase] ?? 'bg-muted text-muted-foreground')}>{p.phase}</span>
            {p.updatedAt && <span className="text-[10px] text-muted-foreground">更新 {fmtDate(p.updatedAt)}</span>}
            <ChevronRight className="size-4 text-muted-foreground/50 shrink-0 ml-auto" />
          </div>
          {p.summary && <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">{p.summary}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {p.stack.map(s => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}
            {p.aliases.map(a => <span key={a} className="text-[10px] text-muted-foreground/70">{a}</span>)}
          </div>
        </div>
      </div>
    </Link>
  )
}

/** 我的项目页：知识库门户口动态同步（GitHub API 拉取，10 分钟缓存），卡片可点进详情 */
export default function Projects() {
  const { data, isLoading, isError, refetch, isFetching } = useProjects()
  const projects = sortProjects(data?.projects ?? [])
  const fallback = data?.source === 'fallback'
  // 刷新回音：v1.34 之前点刷新只有图标转圈，服务端 10 分钟缓存 + 客户端 staleTime 10 分钟时数据多半不变
  // → 用户看不到任何变化。现在按接口自带的 updatedAt（服务端生成时刻）判三条文案，三条都可达。
  // 不用 dataUpdatedAt：那是「客户端收到的时刻」，CDN 给 10 分钟前的副本时它照样显示当前时间。
  // 用常驻状态行而不是 toast：toast 几秒就没了，「生成于 HH:mm」这种要读的信息留不住。
  const [status, setStatus] = useState<string | null>(null)

  async function refresh() {
    const before = data?.updatedAt ?? null
    try {
      const res = await refetch()
      const next = res.data
      if (!next) { setStatus('刷新失败，请稍后重试'); return }
      if (next.source === 'fallback') { setStatus('网络不可用，当前为离线快照'); return }
      const when = next.updatedAt
        ? new Date(next.updatedAt).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
        : null
      if (!when) { setStatus(`服务端未返回生成时间 · ${next.projects.length} 个项目`); return }
      setStatus(next.updatedAt !== before
        ? `已更新 · ${next.projects.length} 个项目（生成于 ${when}）`
        : `服务端未更新 · 生成于 ${when}（CDN 最长缓存 10 分钟）`)
    } catch {
      setStatus('刷新失败，请稍后重试')
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><FolderKanban className="size-5 text-primary" strokeWidth={1.7} />我的项目</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            知识库门户口实时同步{fallback && <span className="text-amber-600 dark:text-amber-400"> · 当前为离线快照，可能不是最新</span>}
          </p>
          {/* live region 要一直在 DOM 里才可靠播报，所以容器常驻、只换文字 */}
          <p role="status" aria-live="polite" className="mt-1 min-h-4 text-[10px] text-muted-foreground">{status}</p>
        </div>
        <button onClick={refresh} disabled={isFetching} aria-label="刷新"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50">
          <RefreshCcw className={cn('size-3.5', isFetching && 'animate-spin')} />刷新
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-destructive">加载失败，请稍后重试</p>
      ) : projects.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">知识库中还没有项目门户口</p>
      ) : (
        // 骨架 → 内容只淡入（.fade-rise）：整页已有 page-enter，这里避免「加载完成」时content硬切一下
        <div className="fade-rise space-y-5">
          {PHASE_ORDER.map(phase => {
            const list = projects.filter(p => p.phase === phase)
            if (list.length === 0) return null
            return (
              <section key={phase}>
                <h2 className="mb-2 text-xs font-medium text-muted-foreground">{phase} · {list.length} 个</h2>
                <div className="space-y-2">
                  {list.map(p => <ProjectCard key={p.name} p={p} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
