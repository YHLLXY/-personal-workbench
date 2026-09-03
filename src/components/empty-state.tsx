import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

export function EmptyState({ icon, title, desc, action, className }: { icon?: ReactNode; title: string; desc?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-10 text-center', className)}>
      <div className="size-11 rounded-xl bg-muted flex items-center justify-center mb-3 text-muted-foreground/60">
        {icon && typeof icon === 'string' ? <span className="text-lg">{icon}</span> : icon ?? <Inbox className="size-5" strokeWidth={1.7} />}
      </div>
      <p className="text-sm font-medium text-foreground/80">{title}</p>
      {desc && <p className="text-xs text-muted-foreground mt-1">{desc}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
