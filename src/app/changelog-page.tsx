import { Link } from 'react-router-dom'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { CHANGELOG } from './changelog'
import { RichText } from '@/components/rich-text'

/** 完整更新日志（v1.32）。
 *  以前塞在「今日概览」弹窗里做 max-h 内部滚动：PC 上宽 448px、每条形如长句，还挤出横向滚动条。
 *  更新日志是**读**的内容，不是提示，给它一页；弹窗里只留最新一条做引子。 */
export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-4xl pb-10">
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" />返回工作台
      </Link>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold"><Sparkles className="size-4 text-primary" strokeWidth={1.7} />更新日志</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">共 {CHANGELOG.length} 个版本 · 最新 {CHANGELOG[0]?.version}</p>
      </div>
      <ol className="space-y-8">
        {CHANGELOG.map((e, idx) => (
          <li key={e.version} id={e.version}>
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-base font-semibold text-primary">{e.version}</h2>
              <span className="text-xs text-muted-foreground">{e.date}</span>
              {idx === 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">最新</span>}
            </div>
            <p className="mt-1 text-sm font-medium">{e.title}</p>
            <ul className="mt-2.5 space-y-2 border-l border-border pl-4">
              {e.items.map((it, i) => {
                // 每条以「新增：/修复：/变更：…」开头（VERSIONING §3 的约定），把它挑出来加粗，扫读时一眼看清类别
                const m = it.match(/^(新增|修复|变更|提速|安全|移除)：/)
                return (
                  <li key={i} className="relative text-sm leading-relaxed text-muted-foreground">
                    <span aria-hidden className="absolute -left-4 top-[9px] size-1.5 rounded-full bg-primary/40" />
                    {m && <span className="font-medium text-foreground">{m[0]}</span>}
                    <RichText text={m ? it.slice(m[0].length) : it} />
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}
