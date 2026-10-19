/**
 * 只渲染 **加粗** 的最小实现（v1.32）。
 * changelog 的文案一直用 `**…**` 标注重点，但三个展示位置（启动弹窗 / 我的 / 更新日志页）都原样吐星号。
 * 引一个 markdown 解析器不值——体积余量只剩 5KB，而这里只有一种语法。
 */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) => (
        p.length > 4 && p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      ))}
    </>
  )
}
