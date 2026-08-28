import type { Paper } from '@/lib/db/types'

/** 常见中文姓氏 → 拼音轻量映射（无第三方依赖；未命中的姓氏原样保留） */
const SURNAME: Record<string, string> = { 张:'zhang',王:'wang',李:'li',刘:'liu',陈:'chen',杨:'yang',赵:'zhao',黄:'huang',周:'zhou',吴:'wu',徐:'xu',孙:'sun',胡:'hu',朱:'zhu',高:'gao',林:'lin',何:'he',郭:'guo',马:'ma',罗:'luo',郑:'zheng',梁:'liang',谢:'xie',宋:'song',唐:'tang',韩:'han',冯:'feng',董:'dong',萧:'xiao',程:'cheng',曹:'cao',袁:'yuan',邓:'deng',许:'xu',傅:'fu',沈:'shen',曾:'zeng',彭:'peng',吕:'lv',苏:'su',蒋:'jiang',蔡:'cai',贾:'jia',丁:'ding',魏:'wei',薛:'xue',叶:'ye',余:'yu',潘:'pan',杜:'du',戴:'dai',夏:'xia',钟:'zhong',汪:'wang',田:'tian',任:'ren',姜:'jiang',范:'fan',方:'fang',石:'shi',姚:'yao',谭:'tan',邹:'zou',熊:'xiong',金:'jin',陆:'lu',孔:'kong',白:'bai',崔:'cui',邱:'qiu',秦:'qin',江:'jiang',史:'shi',顾:'gu',孟:'meng',龙:'long',万:'wan',段:'duan',雷:'lei',钱:'qian',汤:'tang',尹:'yin',黎:'li',易:'yi',常:'chang',武:'wu',贺:'he',龚:'gong',文:'wen' }

/** 从 createdAt 提取四位年份（19xx/20xx），缺失/非法返回 null */
function yearOf(p: Paper): string | null {
  const m = (p.createdAt ?? '').match(/(19|20)\d{2}/)
  return m ? m[0] : null
}

/** 生成 BibTeX 引用 key：首作者姓氏（中文转拼音、西文取末词）+ 年份 + 标题首词，全部缺失兜底 'item' */
function citeKey(p: Paper): string {
  const first = (p.authors ?? '').split(/[,;，；]/)[0]?.trim() ?? ''
  const cjk = first ? /[\u4e00-\u9fff]/.test(first[0]) : false
  const tokens = first.split(/\s+/).filter(Boolean)
  const base = cjk ? (SURNAME[first[0]] ?? first[0]) : (tokens[tokens.length - 1] ?? '').replace(/[^A-Za-z0-9]/g, '').toLowerCase()
  const word = ((p.title ?? '').trim().split(/\s+/)[0] ?? '').replace(/[^\w\u4e00-\u9fff]/g, '').toLowerCase()
  return `${base}${yearOf(p) ?? ''}${word}` || 'item'
}

/** 人读引用格式：`作者 (年份). 标题. 来源. 链接`；各段缺失则整段省略，任何字段缺失不崩 */
export function formatCitation(p: Paper): string {
  const year = yearOf(p)
  const head = [p.authors?.trim() ?? '', year ? `(${year})` : ''].filter(Boolean).join(' ')
  return [head, p.title?.trim() ?? '', p.source?.trim() ?? '', p.url?.trim() ?? ''].filter(Boolean).join('. ')
}

/** BibTeX @misc 输出；字段缺失的行整行省略，key 见 citeKey */
export function toBibTeX(p: Paper): string {
  const lines: string[] = []
  const push = (field: string, val: string | null | undefined) => { const v = (val ?? '').trim(); if (v) lines.push(`  ${field} = {${v}}`) }
  push('title', p.title)
  push('author', p.authors)
  push('year', yearOf(p))
  push('url', p.url)
  return `@misc{${citeKey(p)},\n${lines.map(l => `${l},\n`).join('')}}`
}
