import { Link } from 'react-router-dom'
import { FolderKanban, ArrowRight } from 'lucide-react'
import { useProjects, sortProjects } from './api'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** 首页卡片：项目概览（进行中 N 个 + 前 3 个） */
export function ProjectsCard() {
  const { data, isLoading } = useProjects()
  const projects = sortProjects(data?.projects ?? [])
  const active = projects.filter(p => p.phase === '进行中').slice(0, 3)
  const fallback = data?.source === 'fallback'

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FolderKanban className="size-4 text-primary" strokeWidth={1.7} />我的项目
          {!isLoading && <span className="text-[10px] font-normal text-muted-foreground">共 {projects.length} 个</span>}
        </CardTitle>
        <Link to="/projects" className="text-xs text-muted-foreground hover:text-primary"><ArrowRight className="size-3.5" /></Link>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? <Skeleton className="h-20 w-full" /> : active.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">暂无进行中的项目{fallback ? '（离线快照）' : ''}</p>
        ) : active.map(p => (
          <div key={p.name} className="flex items-center gap-2 text-[13px] py-1.5 hover:text-primary">
            <span className="text-base leading-none">{p.emoji}</span>
            <span className="truncate flex-1">{p.name}</span>
            <span className="text-[10px] text-muted-foreground">{p.stack.slice(0, 2).join(' / ')}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}