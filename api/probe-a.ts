// 临时探针：无 import 的单文件函数，探测 Vercel Node 运行时（验证后删除）
export default async function handler(_req: unknown, res: { json: (o: unknown) => void }) {
  res.json({ node: process.version, hasFetch: typeof fetch === 'function', ok: true })
}
