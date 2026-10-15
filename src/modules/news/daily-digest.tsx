import { useState } from 'react'
import { CalendarDays, ExternalLink, Newspaper, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useDailyReports, useRebuildDigest } from './api'
import { isCloudMode } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { formatReportDate } from './digest-view'
import { cn } from '@/lib/utils'
import type { DailyReport } from '@/lib/db/types'

/**
 * AI 日报（v1.27）：/api/digest 服务端生成，这里只读。
 * 与「热榜」是同一批数据的两个视图——热榜是素材层，日报是成品层。
 */
export function DailyDigest() {
  const { data: reports, isLoading } = useDailyReports()
  const rebuild = useRebuildDigest()
  const [picked, setPicked] = useState<string | null>(null)
  const list = reports ?? []
  const current: DailyReport | undefined = list.find(r => r.reportDate === picked) ?? list[0]

  function buildNow() {
    rebuild.mutate(undefined, {
      onSuccess: r => {
        if (r?.built) toast.success(`已生成 ${r.items ?? 0} 条事件`)
        else toast.info(r?.error ?? '今天还没有可编排的事件——先让服务端跑一次抓取')
      },
      onError: e => toast.error(e instanceof Error ? e.message : '生成失败'),
    })
  }

  if (isLoading) {
    return <div className="space-y-2"><Skeleton className="h-24 w-full rounded-2xl" /><Skeleton className="h-40 w-full rounded-2xl" /></div>
  }

  if (!current) {
    return (
      <EmptyState
        icon={<Sparkles />}
        title="还没有日报"
        desc={isCloudMode
          ? '每天 07:30 由服务端自动抓取热点并整理成日报。也可以现在手动生成一次（需要当天已有抓取记录）'
          : 'AI 日报需要云端模式（服务端用 service role 抓取与生成），当前是本地模式'}
        action={isCloudMode
          ? <Button size="sm" onClick={buildNow} disabled={rebuild.isPending}><Sparkles className="mr-1 size-3.5" />{rebuild.isPending ? '生成中…' : '立即生成'}</Button>
          : undefined}
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* 日期切换：历史日报多了以后靠它回看 */}
      {list.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {list.map(r => (
            <button key={r.id} onClick={() => setPicked(r.reportDate)}
              className={cn('shrink-0 rounded-full border px-3 py-1 text-xs', r.reportDate === current.reportDate ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
              {formatReportDate(r.reportDate)}
            </button>
          ))}
        </div>
      )}

      <article className="rounded-2xl border border-border bg-card p-5">
        <header className="mb-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <CalendarDays className="size-3.5" />
            {formatReportDate(current.reportDate)}
            <span className="text-muted-foreground/50">·</span>
            {current.itemCount} 条事件 · {current.sourceCount} 个来源
          </div>
          <h2 className="mt-1 text-lg font-bold leading-snug">{current.title}</h2>
          {current.overview && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{current.overview}</p>}
        </header>

        <div className="space-y-5">
          {current.sections.map(sec => (
            <section key={sec.category}>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Newspaper className="size-3.5" strokeWidth={1.8} />{sec.category}
              </h3>
              <div className="divide-y divide-border/60 rounded-xl border border-border/70">
                {sec.items.map(it => (
                  <div key={it.eventId} className="px-3.5 py-3">
                    <p className="text-sm font-medium leading-snug">{it.title}</p>
                    {it.point && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{it.point}</p>}
                    {it.sources.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {it.sources.map((s, i) => (
                          <a key={i} href={s.url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary">
                            <ExternalLink className="size-2.5" />{s.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
          <span className="text-[10px] text-muted-foreground/70">
            {current.model ? `由 ${current.model} 生成` : 'AI 生成'}
          </span>
          {isCloudMode && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={buildNow} disabled={rebuild.isPending}>
              <RefreshCw className={cn('mr-1 size-3', rebuild.isPending && 'animate-spin')} />重新生成
            </Button>
          )}
        </footer>
      </article>

      {current.sections.length === 0 && (
        <EmptyState icon={<Sparkles />} title="这条日报是空的" desc="当天没有筛出足够重要的事件，换个日期看看" />
      )}

      <p className="px-1 text-[10px] leading-relaxed text-muted-foreground/70">
        日报由服务端按「分类排序用代码、模型只写文字」的方式编排：分类与顺序是确定性的，只有摘要与总述由模型撰写。
      </p>
    </div>
  )
}
