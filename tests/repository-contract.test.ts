import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { LocalRepository } from '../src/lib/db/local-repository'
import { SupabaseRepository } from '../src/lib/db/supabase-repository'
import type { WorkbenchRepository } from '../src/lib/db/types'

// 构造函数会走 getSupabaseClient（无 env 时真实 createClient 抛错）——注入每用例新建的 fake
const holder = vi.hoisted(() => ({ fake: null as unknown as SupabaseClient }))
vi.mock('../src/lib/db/supabase-client', () => ({ getSupabaseClient: () => holder.fake }))

/**
 * 仓储契约测试：同一套业务操作脚本分别跑在 LocalRepository 与 SupabaseRepository（有状态 fake）上，
 * 断言两者的「逻辑快照」一致。双实现是手写同步的，这类测试防止一处改了另一处漂移
 * （如 v1.11 身体记录「当日覆盖」就曾需要两边各改一遍）。
 *
 * fake 语义映射（对应真实 Supabase 行为）：
 * - insert 自动补 created_at/updated_at（真实库有 default now()）
 * - upsert 按 onConflict 键合并：保留旧行 id/created_at，JSON 序列化丢弃 undefined 键（supabase-js 真实行为）
 * - delete wb_habits 级联清理 wb_habit_logs（迁移 001 的 on delete cascade）
 * - update(...) 不带 select 的直接 await（deleteHabit 的行动解绑）与带 .select().single() 的返回行，两种都要支持
 */

type Row = Record<string, unknown>

function fakeSupabase(): SupabaseClient {
  const db: Record<string, Row[]> = {}
  const rowsOf = (name: string): Row[] => (db[name] ??= [])
  const dropUndefined = (p: Row): Row => JSON.parse(JSON.stringify(p))
  // 真实库 default now() 的列：insert 未带时自动补
  const withDefaults = (name: string, p: Row): Row => {
    const now = new Date().toISOString()
    const out: Row = { ...p }
    if (['wb_tasks', 'wb_habits', 'wb_notes', 'wb_exams', 'wb_focus_sessions', 'wb_papers'].includes(name) && out.created_at == null) out.created_at = now
    if (name === 'wb_notes' && out.updated_at == null) out.updated_at = now
    if (name === 'wb_focus_sessions' && out.start_at == null) out.start_at = now
    if (name === 'wb_reviews' && out.updated_at == null) out.updated_at = now
    if (name === 'wb_folders' && out.sort == null) out.sort = 0
    if (['wb_push_subscriptions', 'wb_reminders'].includes(name) && out.created_at == null) out.created_at = now
    return out
  }
  const applyUpdate = (name: string, payload: Row, col: string, val: unknown): Row[] => {
    const rows = rowsOf(name)
    const merged: Row[] = []
    for (const r of rows) {
      if (r[col] === val) { const next = { ...r, ...dropUndefined(payload) }; rows.splice(rows.indexOf(r), 1, next); merged.push(next) }
    }
    return merged
  }
  const cmp = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? '')))

  function from(name: string): Record<string, unknown> {
    const ctx = { filters: [] as Array<(r: Row) => boolean> }
    const matched = () => rowsOf(name).filter(r => ctx.filters.every(f => f(r)))
    const b: Record<string, unknown> = {
      select: () => {
        ctx.filters = []
        // 支持链式多列 .order().order()：依次做稳定排序（后序 key 优先级低），语义与 PostgREST 一致
        const sorts: Array<{ col: string; asc: boolean }> = []
        const apply = (rows2: Row[]) => {
          let out = [...rows2]
          for (const { col, asc } of [...sorts].reverse()) {
            out = out.sort((a, b2) => (asc ? cmp(a[col], b2[col]) : -cmp(a[col], b2[col])))
          }
          return out
        }
        const node: Record<string, unknown> = {
          order: (col: string, o?: { ascending?: boolean }) => { sorts.push({ col, asc: o?.ascending !== false }); return node },
          eq: (c: string, v: unknown) => { ctx.filters.push(r => r[c] === v); return node },
          limit: () => node,
          maybeSingle: () => Promise.resolve({ data: matched()[0] ?? null, error: null }),
          then: (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve({ data: apply(matched()), error: null }).then(res, rej),
        }
        return node
      },
      insert: (payload: Row) => {
        const row = withDefaults(name, dropUndefined(payload))
        rowsOf(name).push(row)
        return { select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) }
      },
      update: (payload: Row) => ({
        eq: (col: string, val: unknown) => {
          const updated = applyUpdate(name, payload, col, val)
          return {
            select: () => ({ single: () => Promise.resolve({ data: updated[0] ?? null, error: null }) }),
            then: (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ error: null }).then(res, rej),
          }
        },
        // deleteFolder 用 .in 批量清 folder_id（v1.24 子树对齐）
        in: (col: string, vals: unknown[]) => {
          const updated: Row[] = []
          for (const val of vals) updated.push(...applyUpdate(name, payload, col, val))
          return {
            select: () => ({ single: () => Promise.resolve({ data: updated[0] ?? null, error: null }) }),
            then: (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ error: null }).then(res, rej),
          }
        },
      }),
      upsert: (payload: Row, opts?: { onConflict?: string }) => {
        const keys = (opts?.onConflict ?? '').split(',').map(s => s.trim()).filter(Boolean)
        const clean = dropUndefined(payload)
        const existing = keys.length ? rowsOf(name).find(r => keys.every(k => r[k] === clean[k])) : undefined
        let merged: Row
        if (existing) {
          merged = { ...existing, ...clean } // 冲突合并保留旧行 id/created_at（真实主键 upsert 行为）
          rowsOf(name).splice(rowsOf(name).indexOf(existing), 1, merged)
        } else {
          merged = withDefaults(name, clean)
          rowsOf(name).push(merged)
        }
        return {
          select: () => ({ single: () => Promise.resolve({ data: merged, error: null }) }),
          then: (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ error: null }).then(res, rej),
        }
      },
      delete: () => ({
        eq: (col: string, val: unknown) => {
          const rows = rowsOf(name)
          for (const r of [...rows]) if (r[col] === val) rows.splice(rows.indexOf(r), 1)
          // 迁移 001：wb_habit_logs.habit_id 对 wb_habits on delete cascade
          if (name === 'wb_habits') db['wb_habit_logs'] = rowsOf('wb_habit_logs').filter(l => l.habit_id !== val)
          return Promise.resolve({ error: null })
        },
        // deleteFolder 用 .in 批量删子树（v1.24）
        in: (col: string, vals: unknown[]) => {
          const rows = rowsOf(name)
          for (const r of [...rows]) if (vals.includes(r[col])) rows.splice(rows.indexOf(r), 1)
          return Promise.resolve({ error: null })
        },
      }),
    }
    return b
  }
  return { from: (name: string) => from(name), auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } } as unknown as SupabaseClient
}

const TODAY = '2026-08-29'

/** 业务脚本：日常高频操作全链路，返回与 id 无关的逻辑快照 */
async function runScript(repo: WorkbenchRepository) {
  // —— 习惯与打卡：创建 2 个 → 同日覆盖 → 删除一个（级联）——
  const h1 = await repo.createHabit({ name: '运动', targetPerDay: 1 })
  const h2 = await repo.createHabit({ name: '阅读', icon: '📖' })
  await repo.setHabitLog(h1.id, TODAY, 1)
  await repo.setHabitLog(h1.id, TODAY, 2) // 同habit同日 upsert 覆盖
  await repo.setHabitLog(h2.id, TODAY, 1)
  const logs = await repo.listHabitLogs()
  const habitSnap = [h1, h2].map(h => ({ name: h.name, icon: h.icon, targetPerDay: h.targetPerDay, count: logs.find(l => l.habitId === h.id && l.logDate === TODAY)?.count ?? null }))
  await repo.deleteHabit(h2.id)
  const logsAfterDelete = await repo.listHabitLogs()
  const habitCascade = { habitRows: (await repo.listHabits()).length, logsForH2: logsAfterDelete.filter(l => l.habitId === h2.id).length }

  // —— 任务：创建 → 完成 → 焦点 → 删除 ——
  const t1 = await repo.createTask({ title: '写周报', dueDate: TODAY })
  const t2 = await repo.createTask({ title: '背单词', dueDate: TODAY, tags: ['英语'] })
  await repo.updateTask(t1.id, { status: 'done' })
  await repo.updateTask(t2.id, { focus: true, focusDate: TODAY })
  await repo.deleteTask(t1.id)
  const tasks = await repo.listTasks()
  const taskSnap = tasks.filter(t => [t1.id, t2.id].includes(t.id)).map(t => ({
    title: t.title, status: t.status, dueDate: t.dueDate, focus: t.focus, focusDate: t.focusDate,
    tags: t.tags, hasCompletedAt: t.completedAt != null,
  }))

  // —— 身体记录：体重当日覆盖 / 运动多条 ——
  await repo.createHealthLog({ logDate: TODAY, type: 'weight', value: 62.5 })
  await repo.createHealthLog({ logDate: TODAY, type: 'weight', value: 63.1 })
  await repo.createHealthLog({ logDate: TODAY, type: 'exercise', value: 30 })
  await repo.createHealthLog({ logDate: TODAY, type: 'exercise', value: 45 })
  const health = await repo.listHealthLogs().then(ls => ls.filter(l => l.logDate === TODAY))
  const healthSnap = {
    weightRows: health.filter(l => l.type === 'weight').map(l => l.value),
    exerciseRows: health.filter(l => l.type === 'exercise').map(l => l.value).sort((a, b) => a - b),
  }

  // —— 学习目标：创建 → 进度推进 → 完成 → 恢复 → 显式 completedAt 采纳（v1.24 对齐云端丢弃的漂移）——
  const g = await repo.createStudyGoal({ title: '刷题 50 道', target: 50, deadline: '2026-09-15', note: '每天 5 道' })
  await repo.updateStudyGoal(g.id, { progress: 10 })
  await repo.updateStudyGoal(g.id, { progress: 50 })
  await repo.updateStudyGoal(g.id, { status: 'done' })
  const goalAfterDone = (await repo.listStudyGoals()).find(x => x.id === g.id)
  await repo.updateStudyGoal(g.id, { status: 'active' })
  const goalAfterReopen = (await repo.listStudyGoals()).find(x => x.id === g.id)
  await repo.updateStudyGoal(g.id, { completedAt: '2026-01-01T00:00:00.000Z' })
  const goalAfterExplicit = (await repo.listStudyGoals()).find(x => x.id === g.id)
  const goalSnap = {
    doneAt: goalAfterDone?.completedAt != null,
    reopenCleared: goalAfterReopen?.completedAt == null,
    explicitCompletedAt: goalAfterExplicit?.completedAt === '2026-01-01T00:00:00.000Z',
    fields: { title: goalAfterExplicit?.title, target: goalAfterExplicit?.target, progress: goalAfterExplicit?.progress, deadline: goalAfterExplicit?.deadline, note: goalAfterExplicit?.note },
  }

  // —— 论文：finishedAt 跟随状态 ——
  const p1 = await repo.createPaper({ title: '契约论文', authors: 'Someone', arxivId: null, url: null, status: 'reading', rating: 4, note: null, type: 'paper', folderId: null, tags: [], content: null, summary: null, keywords: [], source: null })
  await repo.updatePaper(p1.id, { status: 'done' })
  const afterDone = (await repo.listPapers()).find(x => x.id === p1.id)
  await repo.updatePaper(p1.id, { status: 'reading' })
  const afterReopen = (await repo.listPapers()).find(x => x.id === p1.id)
  const paperSnap = { doneAt: afterDone?.finishedAt != null, reopened: afterReopen?.finishedAt == null }

  // —— 速记：创建/标签/归档（间隔数毫秒避免同毫秒时间戳碰撞的排序抖动）——
  const tick = () => new Promise(r => setTimeout(r, 3))
  const n1 = await repo.createNote('灵感一闪', '想法')
  await tick()
  await repo.updateNote(n1.id, { tags: ['想法', '灵感'] })
  await tick()
  await repo.createNote('随手记')
  await tick()
  await repo.updateNote(n1.id, { pinned: true })
  await repo.updateNote(n1.id, { content: '灵感一闪（补充）', archived: true })
  const notes = await repo.listNotes()
  const pinnedFirst = notes[0]?.pinned === true // 置顶笔记必须排最前（pinned 优先于 updated_at）
  const noteSnap = notes.filter(n => [n1.id].includes(n.id) || n.content === '随手记').map(n => ({ content: n.content, tags: n.tags, archived: n.archived, pinned: n.pinned }))

  // —— 复盘：两次 upsert 同日合并（第二次只传 mood，其余字段保留）——
  await repo.upsertReview(TODAY, { mood: 4, summary: '稳', planTomorrow: '明天跑步' })
  await repo.upsertReview(TODAY, { mood: 5 })
  const reviews = await repo.listReviews()
  const reviewSnap = reviews.filter(r => r.reviewDate === TODAY).map(r => ({ mood: r.mood, score: r.score, summary: r.summary, planTomorrow: r.planTomorrow }))

  // —— 考试：创建 → 更新 → 删除（v1.24 契约补盲）——
  const e1 = await repo.createExam({ title: '期中考', examDate: '2026-09-15', examTime: '09:00', subject: '数学' })
  const e2 = await repo.createExam({ title: '英语听力', examDate: '2026-09-20' })
  await repo.updateExam(e1.id, { subject: '高等数学' })
  await repo.deleteExam(e2.id)
  const examSnap = (await repo.listExams()).filter(x => x.id === e1.id).map(x => ({ title: x.title, examDate: x.examDate, examTime: x.examTime, subject: x.subject }))

  // —— 成长行动：steps/targets JSON 往返 + 状态更新（v1.24 契约补盲）——
  const ga = await repo.createGrowthAction({ no: 1, title: '深呼吸', emoji: '🌿', category: '身心', why: '降焦虑', steps: ['吸气 4s', '屏息 4s', '呼气 6s'], targets: ['每天 3 次'], verify: '打卡记录', habitId: null })
  await repo.updateGrowthAction(ga.id, { steps: ['吸气 4s', '屏息 4s', '呼气 6s', '复检 1min'], status: 'paused' })
  const growthSnap = (await repo.listGrowthActions()).filter(x => x.id === ga.id).map(x => ({ no: x.no, title: x.title, steps: x.steps, targets: x.targets, status: x.status, habitId: x.habitId ?? null }))

  // —— 番茄钟：两条记录，计数/总分钟与排序无关（v1.24 契约补盲）——
  await repo.createFocusSession(25, '写周报')
  await repo.createFocusSession(5)
  const sessions = await repo.listFocusSessions()
  const focusSnap = { count: sessions.length, minutes: sessions.reduce((s, x) => s + x.minutes, 0), notes: sessions.map(s => s.note ?? null).sort().join(',') }

  // —— 文件夹：子树删除 + 子树内资料全部归未分类（v1.24 对齐云端只清直属的悬空漂移）——
  const f1 = await repo.createFolder({ name: '父' })
  const f2 = await repo.createFolder({ name: '子', parentId: f1.id })
  const pf = await repo.createPaper({ title: '父内资料', authors: '', arxivId: null, url: null, status: 'want', rating: null, note: null, type: 'paper', folderId: f1.id, tags: [], content: null, summary: null, keywords: [], source: null })
  const pc = await repo.createPaper({ title: '子内资料', authors: '', arxivId: null, url: null, status: 'want', rating: null, note: null, type: 'paper', folderId: f2.id, tags: [], content: null, summary: null, keywords: [], source: null })
  await repo.deleteFolder(f1.id)
  const papersAfterFolderDelete = await repo.listPapers()
  const folderSnap = {
    foldersLeft: (await repo.listFolders()).length,
    parentPaperFolderId: papersAfterFolderDelete.find(x => x.id === pf.id)?.folderId ?? null,
    childPaperFolderId: papersAfterFolderDelete.find(x => x.id === pc.id)?.folderId ?? null,
  }

  // —— 推送订阅：同 endpoint upsert 合并 → 移除（v1.24 契约补盲）——
  await repo.savePushSubscription({ endpoint: 'https://push.example/1', keysP256dh: 'k1', keysAuth: 'a1', userAgent: 'ua-1' })
  await repo.savePushSubscription({ endpoint: 'https://push.example/1', keysP256dh: 'k2', keysAuth: 'a2' })
  const subsAfterUpsert = await repo.listPushSubscriptions()
  const pushSnap = {
    countAfterUpsert: subsAfterUpsert.length,
    row: subsAfterUpsert.map(s => ({ endpoint: s.endpoint, keysP256dh: s.keysP256dh, keysAuth: s.keysAuth, userAgent: s.userAgent ?? null }))[0] ?? null,
    countAfterRemove: 0,
  }
  await repo.removePushSubscription('https://push.example/1')
  pushSnap.countAfterRemove = (await repo.listPushSubscriptions()).length

  // —— 通道配置：写入读回 + 清空（v1.24 契约补盲）——
  await repo.saveChannelConfigs({ serverchanKey: 'SCU-1' })
  const channelSaved = (await repo.getChannelConfigs()).serverchanKey
  await repo.saveChannelConfigs({ serverchanKey: null })
  const channelCleared = (await repo.getChannelConfigs()).serverchanKey
  const channelSnap = { saved: channelSaved, cleared: channelCleared }

  return { habitSnap, habitCascade, taskSnap, healthSnap, goalSnap, paperSnap, pinnedFirst, noteSnap, reviewSnap, examSnap, growthSnap, focusSnap, folderSnap, pushSnap, channelSnap }
}

describe('仓储契约：LocalRepository 与 SupabaseRepository 行为一致', () => {
  let localSnap: Awaited<ReturnType<typeof runScript>>
  let supaSnap: Awaited<ReturnType<typeof runScript>>

  beforeEach(async () => {
    localStorage.clear()
    localSnap = await runScript(new LocalRepository())
    holder.fake = fakeSupabase()
    const supa = new SupabaseRepository()
    supaSnap = await runScript(supa)
  })

  it('习惯与打卡：字段默认值、同日覆盖、删除级联一致', () => {
    expect(supaSnap.habitSnap).toEqual(localSnap.habitSnap)
    expect(supaSnap.habitCascade).toEqual(localSnap.habitCascade)
  })
  it('任务：完成时间戳、焦点、删除语义一致', () => {
    expect(supaSnap.taskSnap).toEqual(localSnap.taskSnap)
  })
  it('身体记录：体重/睡眠当日覆盖、运动多条一致', () => {
    expect(supaSnap.healthSnap).toEqual(localSnap.healthSnap)
  })
  it('学习目标：进度推进、归档/恢复/显式 completedAt 一致', () => {
    expect(supaSnap.goalSnap).toEqual(localSnap.goalSnap)
  })
  it('考试：创建/更新/删除语义一致', () => {
    expect(supaSnap.examSnap).toEqual(localSnap.examSnap)
    expect(supaSnap.examSnap[0]?.subject).toBe('高等数学')
  })
  it('成长行动：steps/targets JSON 往返与状态一致', () => {
    expect(supaSnap.growthSnap).toEqual(localSnap.growthSnap)
    expect(supaSnap.growthSnap[0]?.steps).toHaveLength(4)
  })
  it('番茄钟：计数与总分钟一致', () => {
    expect(supaSnap.focusSnap).toEqual(localSnap.focusSnap)
    expect(supaSnap.focusSnap).toEqual({ count: 2, minutes: 30, notes: ',写周报' })
  })
  it('文件夹：子树删除后子树内资料全部归未分类（双实现一致，无悬空 folder_id）', () => {
    expect(supaSnap.folderSnap).toEqual(localSnap.folderSnap)
    expect(supaSnap.folderSnap).toEqual({ foldersLeft: 0, parentPaperFolderId: null, childPaperFolderId: null })
  })
  it('推送订阅：同 endpoint 合并与移除一致', () => {
    expect(supaSnap.pushSnap).toEqual(localSnap.pushSnap)
    expect(supaSnap.pushSnap.countAfterUpsert).toBe(1)
    expect(supaSnap.pushSnap.row?.keysP256dh).toBe('k2')
  })
  it('通道配置：写入读回与清空一致', () => {
    expect(supaSnap.channelSnap).toEqual(localSnap.channelSnap)
    expect(supaSnap.channelSnap).toEqual({ saved: 'SCU-1', cleared: null })
  })
  it('速记：标签、归档一致', () => {
    expect(supaSnap.noteSnap).toEqual(localSnap.noteSnap)
  })
  it('论文：finishedAt 归档写入/恢复清空一致', () => {
    expect(supaSnap.paperSnap).toEqual(localSnap.paperSnap)
    expect(supaSnap.paperSnap.doneAt).toBe(true)
    expect(supaSnap.paperSnap.reopened).toBe(true)
  })
  it('速记：置顶排最前（双实现一致）', () => {
    expect(supaSnap.pinnedFirst).toBe(true)
    expect(localSnap.pinnedFirst).toBe(true)
  })
  it('复盘：同日 upsert 合并、未传字段保留一致', () => {
    expect(supaSnap.reviewSnap).toEqual(localSnap.reviewSnap)
  })
})
