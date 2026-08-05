import { describe, it, expect, beforeEach } from 'vitest'
import { LocalRepository } from '../src/lib/db/local-repository'

describe('LocalRepository', () => {
  let repo: LocalRepository
  beforeEach(() => { localStorage.clear(); repo = new LocalRepository() })

  it('创建任务并读取', async () => {
    const t = await repo.createTask({ title: '完成作业' })
    expect(t.id).toBeTruthy()
    expect(t.status).toBe('todo')
    expect((await repo.listTasks())[0].title).toBe('完成作业')
  })

  it('完成任务自动记录 completedAt', async () => {
    const t = await repo.createTask({ title: 'x' })
    const done = await repo.updateTask(t.id, { status: 'done' })
    expect(done.completedAt).toBeTruthy()
  })

  it('打卡 upsert 按 habitId+date 覆盖', async () => {
    await repo.setHabitLog('h1', '2026-08-04', 1)
    await repo.setHabitLog('h1', '2026-08-04', 2)
    const logs = await repo.listHabitLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].count).toBe(2)
  })

  it('upsertReview 同日期只留一条', async () => {
    await repo.upsertReview('2026-08-04', { mood: 4 })
    await repo.upsertReview('2026-08-04', { summary: '很好' })
    const rs = await repo.listReviews()
    expect(rs).toHaveLength(1)
    expect(rs[0].summary).toBe('很好')
  })

  it('重命名已完成任务不丢失 completedAt', async () => {
    const t = await repo.createTask({ title: 'x' })
    const done = await repo.updateTask(t.id, { status: 'done' })
    const renamed = await repo.updateTask(done.id, { title: 'y' })
    expect(renamed.completedAt).toBe(done.completedAt)
  })

  it('取消完成状态清空 completedAt', async () => {
    const t = await repo.createTask({ title: 'x' })
    const done = await repo.updateTask(t.id, { status: 'done' })
    const todo = await repo.updateTask(done.id, { status: 'todo' })
    expect(todo.completedAt).toBeNull()
  })

  it('删除任务', async () => {
    const t = await repo.createTask({ title: 'x' })
    await repo.deleteTask(t.id)
    expect(await repo.listTasks()).toHaveLength(0)
  })

  describe('folders', () => {
    it('创建根级与子文件夹', async () => {
      const root = await repo.createFolder({ name: '机器学习' })
      expect(root.id).toBeTruthy()
      expect(root.parentId).toBeNull()
      const sub = await repo.createFolder({ name: 'Transformer', parentId: root.id })
      expect(sub.parentId).toBe(root.id)
      expect((await repo.listFolders())).toHaveLength(2)
    })

    it('重命名与移动文件夹', async () => {
      const a = await repo.createFolder({ name: 'A' })
      const b = await repo.createFolder({ name: 'B' })
      const renamed = await repo.updateFolder(a.id, { name: 'A2' })
      expect(renamed.name).toBe('A2')
      const moved = await repo.moveFolder(b.id, a.id)
      expect(moved.parentId).toBe(a.id)
    })

    it('删除文件夹时其中资料移入未分类（不级联删除）', async () => {
      const f = await repo.createFolder({ name: '待清理' })
      const p = await repo.createPaper({ title: '论文', authors: '', arxivId: null, url: null, status: 'want', rating: null, note: null, type: 'paper', folderId: f.id, tags: [], content: null, summary: null, keywords: [], source: null })
      await repo.deleteFolder(f.id)
      expect(await repo.listFolders()).toHaveLength(0)
      const papers = await repo.listPapers()
      expect(papers.find(x => x.id === p.id)?.folderId).toBeNull()
    })
  })

  describe('papers 资料库字段', () => {
    it('创建文案笔记类型资料', async () => {
      const p = await repo.createPaper({ title: '视频文案', authors: '', arxivId: null, url: 'https://example.com/v', status: 'want', rating: null, note: null, type: 'note', folderId: null, tags: ['口播'], content: '大家好，今天聊聊。', summary: JSON.stringify({ title: 'AI 科普', key_points: ['点一'] }), keywords: ['AI'], source: 'douyin' })
      expect(p.type).toBe('note')
      expect(p.tags).toEqual(['口播'])
      expect(p.content).toBe('大家好，今天聊聊。')
    })

    it('旧数据读取自动补齐默认字段', async () => {
      // 模拟 v1.0 旧数据（无新字段）
      localStorage.setItem('wb:papers', JSON.stringify([{ id: 'old1', title: '旧论文', authors: '', arxivId: null, url: null, status: 'want', rating: null, note: null, createdAt: '2026-08-01T00:00:00.000Z' }]))
      const papers = await repo.listPapers()
      expect(papers[0].type).toBe('paper')
      expect(papers[0].folderId).toBeNull()
      expect(papers[0].tags).toEqual([])
      expect(papers[0].keywords).toEqual([])
      expect(papers[0].content).toBeNull()
    })
  })
})
