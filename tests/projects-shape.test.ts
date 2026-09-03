import { describe, it, expect } from 'vitest'
import type { ProjectInfo as ApiProjectInfo, ProjectDetail as ApiProjectDetail } from '../api/projects'
import type { ProjectInfo, ProjectDetail } from '../src/modules/projects/api'
import { SOURCES } from '../api/hot'
import { DIRECT_META } from '../src/lib/hot'

/**
 * 双份类型的编译期护栏：api/*.ts 单文件约束禁止跨文件运行时导入（AGENTS 硬性约定 1），
 * 服务端与前端只能各持一份类型。本文件让字段集合（keyof）在两侧强制同步——
 * 任何一侧增删改字段名，npm run build 的 tsc 阶段即红（v1.23 横扫发现 dir 漂移的防再犯）。
 * 注意 keyof 不含可选性：前端 dir?: 的 optional 是 CDN 在途缓存防御（AGENTS 衔接裁决），属预期差异。
 */
type Expect<T extends true> = T
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false

export type _projectInfoKeys = Expect<Equal<keyof ApiProjectInfo, keyof ProjectInfo>>
export type _projectDetailKeys = Expect<Equal<keyof ApiProjectDetail, keyof ProjectDetail>>

describe('热点直连降级与代理源元数据一致', () => {
  it('DIRECT_META 每个源在服务端 SOURCES 中同名同分类', () => {
    const api = new Map(SOURCES.map(s => [s.id, s]))
    for (const m of DIRECT_META) {
      const s = api.get(m.id)
      expect(s, `源 ${m.id} 不在服务端 SOURCES`).toBeTruthy()
      expect(s?.name, `源 ${m.id} 名称漂移`).toBe(m.name)
      expect(s?.category).toBe(m.category)
    }
  })
})
