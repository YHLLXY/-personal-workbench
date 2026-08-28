import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, FileText, Pencil, RefreshCcw } from 'lucide-react'
import { useProjects, useProjectDetail } from './api'
import { PHASE_STYLE, fmtDate, kbTreeUrl, kbEditUrl, kbBlobUrl } from './shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** 项目详情页（/projects/:name）：门户口全文只读镜像，编辑入口跳知识库（唯一事实源） */
export default function ProjectDetailPage() {
  // react-router 对路由参数已做 URL 解码
  const { name = '' } = useParams()
  const dir = name
  const { data } = useProjects()
  const detail = useProjectDetail(dir)
  const d = detail.data

  // 头部信息优先取列表缓存（秒开）；直链进入且列表未含时用 dir 兜底
  const info = (data?.projects ?? []).find(p => (p.dir ?? p.name) === dir)

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/projects" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="size-3.5" />返回项目列表
      </Link>

      <div className="mb-5 flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">{info?.emoji ?? '🚪'}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold truncate">{info?.name ?? dir}</h1>
            {info && <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', PHASE_STYLE[info.phase] ?? 'bg-muted text-muted-foreground')}>{info.phase}</span>}
            {info?.updatedAt && <span className="text-[10px] text-muted-foreground">更新 {fmtDate(info.updatedAt)}</span>}
          </div>
          {info?.summary && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{info.summary}</p>}
          {info && (info.stack.length > 0 || info.aliases.length > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {info.stack.map(s => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}
              {info.aliases.map(a => <span key={a} className="text-[10px] text-muted-foreground/70">{a}</span>)}
            </div>
          )}
        </div>
      </div>

      {detail.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : detail.isError ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {detail.error.message === '401'
              ? '详情需登录后查看（云端模式登录并保持联网）'
              : detail.error.message === '503'
                ? '离线快照不含详情内容，需要服务端联网获取'
                : '详情加载失败，请稍后重试'}
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => detail.refetch()}>
              <RefreshCcw className="size-3.5 mr-1" />重试
            </Button>
            <a href={kbTreeUrl(dir)} target="_blank" rel="noreferrer">
              <Button size="sm" variant="ghost"><ExternalLink className="size-3.5 mr-1" />在 GitHub 查看</Button>
            </a>
          </div>
        </div>
      ) : d?.rendered ? (
        // GitHub Markdown API 服务端渲染并消毒后的 HTML（自有知识库内容）
        <div className="md-body" dangerouslySetInnerHTML={{ __html: d.html ?? '' }} />
      ) : (
        <pre className="whitespace-pre-wrap rounded-2xl border border-border bg-card p-4 text-xs leading-relaxed">{d?.markdown ?? ''}</pre>
      )}

      {d && d.files.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-medium text-muted-foreground">目录内文档 · {d.files.length} 个</h2>
          <div className="rounded-2xl border border-border bg-card divide-y divide-border/70">
            {d.files.map(f => (
              <a key={f.path} href={kbBlobUrl(f.path)} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors">
                <FileText className="size-3.5 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{f.name}</span>
                <ExternalLink className="size-3.5 text-muted-foreground/50 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <a href={kbTreeUrl(dir)} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline"><ExternalLink className="size-3.5 mr-1" />在 GitHub 打开</Button>
        </a>
        <a href={kbEditUrl(d?.gatewayPath ?? null, dir)} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline"><Pencil className="size-3.5 mr-1" />编辑门户口</Button>
        </a>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">修改在知识库完成，保存后最多 10 分钟同步到此处</p>
    </div>
  )
}
