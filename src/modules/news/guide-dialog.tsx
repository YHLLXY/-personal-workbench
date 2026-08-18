import type { ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { FileText, Film, Search, ArrowDownToLine, FolderTree as FolderTreeIcon, CircleHelp } from 'lucide-react'

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">{icon}{title}</h3>
      <div className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[10px] font-bold text-primary">{n}</span>
      <span>{children}</span>
    </li>
  )
}

/** 资料库新手指引（❓ 按钮打开） */
export function GuideSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-md overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-1.5"><CircleHelp className="size-4" />资料库新手指引</SheetTitle>
          <SheetDescription>论文与文案笔记，统一收纳。阅读约 2 分钟</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-8 pt-2">
          <Section icon={<FileText className="size-4 text-primary" />} title="资料库是什么">
            <p>资料库统一存放两类资料：</p>
            <ul className="list-disc space-y-1 pl-4">
              <li><b className="text-foreground">论文</b>：科研文献，支持 arXiv 自动抓取与 DOI 解析</li>
              <li><b className="text-foreground">文案笔记</b>：视频/播客文案及笔记，可与「视频文案提取器」直接对接</li>
            </ul>
            <p>每条资料可设置文件夹、标签、阅读状态和评分，支持全文搜索。</p>
          </Section>

          <Section icon={<FileText className="size-4 text-primary" />} title="论文 · 三种导入方式（右上角「新建 → 添加论文」）">
            <ol className="space-y-2">
              <Step n={1}>arXiv 搜索：输入关键词（如 LLM safety）→ 结果列表点「收藏」。已收藏的论文按钮会变灰，不会重复添加。</Step>
              <Step n={2}>手动录入：标题必填，作者 / 链接 / 文件夹 / 标签可选。</Step>
              <Step n={3}>DOI 直达：粘贴 DOI（如 10.1000/xyz123）→ 点「解析」，标题、作者、链接自动填充，可修改后保存。</Step>
            </ol>
          </Section>

          <Section icon={<Film className="size-4 text-primary" />} title="文案笔记 · 两种导入方式（右上角「新建 → 添加文案笔记」）">
            <ol className="space-y-2">
              <Step n={1}>粘贴文本：把文案全文粘贴进「全文」（必填）；标题 / 来源链接 / 标签 / 总结可选。总结可粘贴 AI 生成的 JSON，详情页会渲染成「拟标题 / 核心观点 / 金句 / 结构拆解」卡片。</Step>
              <Step n={2}>上传文件：选择「上传文件」标签，支持 <code className="rounded bg-muted px-1 text-xs">.json</code> 或 <code className="rounded bg-muted px-1 text-xs">.md</code>，解析成功自动填充表单。</Step>
            </ol>
          </Section>

          <Section icon={<ArrowDownToLine className="size-4 text-primary" />} title="与视频文案提取器对接（推荐工作流）">
            <ol className="space-y-2">
              <Step n={1}>在「视频文案提取器」导出文案：选 JSON（.json）或 Markdown 笔记（.md）格式</Step>
              <Step n={2}>把文件传到手机（微信文件传输助手 / 网盘均可）</Step>
              <Step n={3}>工作台「添加文案笔记 → 上传文件」选择它，自动填充标题、来源、平台、关键词、总结和全文</Step>
              <Step n={4}>确认后保存，阅读状态从「想读」开始流转</Step>
            </ol>
            <p className="text-xs">上传支持提取器的标准导出：JSON 需含 content 字段（含 title / source_url / platform / summary / keywords）；Markdown 需带 frontmatter（title / source / platform / tags）+ 正文。</p>
          </Section>

          <Section icon={<FolderTreeIcon className="size-4 text-primary" />} title="组织与管理">
            <ul className="list-disc space-y-1 pl-4">
              <li><b className="text-foreground">文件夹</b>：桌面端在左侧树、手机端点「文件夹」按钮，可建子文件夹</li>
              <li><b className="text-foreground">标签</b>：逗号分隔，如 AI, 口播；搜索可命中标题 / 作者 / 关键词 / 内容</li>
              <li><b className="text-foreground">阅读状态</b>：列表右侧下拉切换「想读 → 在读 → 读完」</li>
              <li><b className="text-foreground">评分</b>：点开详情 → 评分 1-5 分，记下内容质量</li>
              <li><b className="text-foreground">筛选</b>：顶栏可按状态（全部/想读/在读/读完）与类型（全部/论文/文案）过滤</li>
            </ul>
          </Section>

          <Section icon={<Search className="size-4 text-primary" />} title="常见问题">
            <ul className="list-disc space-y-1 pl-4">
              <li><b className="text-foreground">arXiv 搜不到</b>：换更短的关键词，或走手动录入 / DOI 直达</li>
              <li><b className="text-foreground">DOI 解析失败</b>：网络问题或 DOI 不存在，可手动填写后保存</li>
              <li><b className="text-foreground">文件解析失败</b>：确认是提取器标准导出（.json 含 content 字段；.md 带 frontmatter），否则会当纯文本导入</li>
              <li><b className="text-foreground">删错了</b>：删除不可恢复，删除前有确认弹窗，点「取消」即可</li>
            </ul>
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  )
}