/**
 * Server酱³（SC3）SendKey 形态：`sctp<uid>t<rest>`。
 * 与 api/reminders.ts 的 sc3Endpoint 共用同一条正则（服务端函数不能 import src/，两处必须一起改）。
 * 旧 Turbo 的 `SCT…` key 能粘进设置页但发不出去，所以在保存前就用这条规则拦住。
 */
export function isSc3Key(key: string | null | undefined): boolean {
  return /^sctp\d+t/i.test((key ?? '').trim())
}
