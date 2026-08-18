import { useProjects, sortProjects, PHASE_ORDER, type ProjectInfo } from './api'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { FolderKanban, RefreshCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

const PHASE_STYLE: Record<string, string> = {
  '进行中': 'bg-primary/12 text-primary',
  '已完成': 'bg-muted text-muted-foreground',
  '已归档': 'bg-muted/60 text-muted-foreground/60',
  '暂停': 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
}

function fmtDate(d: string | null): string {
  if (!d) return '未知'
  const [y, m, day] = d.split('-')
  return `${Number(m)}-${Number(day)}` + (y === new Date().getFullYear().toString() ? '' : ` (${y})`)
}

function ProjectCard({ p }: { p: ProjectInfo }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-xl">{p.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold truncate">{p.name}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', PHASE_STYLE[p.phase] ?? 'bg-muted text-muted-foreground')}>{p.phase}</span>
            {p.updatedAt && <span className="text-[10px] text-muted-foreground">更新 {fmtDate(p.updatedAt)}</span>}
          </div>
          {p.summary && <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">{p.summary}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {p.stack.map(s => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}
            {p.aliases.map(a => <span key={a} className="text-[10px] text-muted-foreground/70">{a}</span>)}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 我的项目页：知识库门户口动态同步（GitHub API 拉取，10 分钟缓存） */
export default function Projects() {
  const { data, isLoading, isError, refetch, isFetching } = useProjects()
  const projects = sortProjects(data?.projects ?? [])
  const fallback = data?.source === 'fallback'

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><FolderKanban className="size-5 text-primary" strokeWidth={1.7} />我的项目</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            知识库门户口实时同步{fallback && <span className="text-amber-600 dark:text-amber-400"> · 当前为离线快照，可能不是最新</span>}
          </p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} aria-label="刷新"
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
        <div className="space-y-5">
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