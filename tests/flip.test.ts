import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flipIn, resetFlip, FLIP_DURATION } from '../src/lib/flip'

function mockRect(el: HTMLElement, x: number, y: number, w = 400, h = 46) {
  el.getBoundingClientRect = () => ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect
}

function makeContainer() {
  const root = document.createElement('div')
  const a = document.createElement('div'); a.dataset.flipId = 'a'
  root.append(a); document.body.append(root)
  return { root, a }
}

beforeEach(() => { resetFlip() })
afterEach(() => { document.body.innerHTML = '' })

describe('flipIn（FLIP 布局动画：星标滑顶 / 今日↔已完成滑移）', () => {
  it('首帧只记锚点不动画', () => {
    const { root, a } = makeContainer()
    const spy = vi.fn(() => ({ finished: Promise.resolve() }))
    a.animate = spy as unknown as typeof a.animate
    mockRect(a, 0, 0)
    flipIn(root)
    expect(spy).not.toHaveBeenCalled()
  })
  it('位置变化：从旧位置施加反向位移动画回零（坠落/飞回的核心）', () => {
    const { root, a } = makeContainer()
    mockRect(a, 0, 0)
    flipIn(root)
    const spy = vi.fn((_frames: Keyframe[], _opts: KeyframeAnimationOptions) => ({ finished: Promise.resolve() }))
    a.animate = spy as unknown as typeof a.animate
    mockRect(a, 0, 200) // 向下移到已完成区 → 反向从 -200px 滑回
    flipIn(root)
    expect(spy).toHaveBeenCalledTimes(1)
    const [frames, opts] = spy.mock.calls[0]
    expect(frames[0].transform).toBe('translate(0px, -200px)')
    expect(frames[1].transform).toBe('translate(0, 0)')
    expect(opts.duration).toBe(FLIP_DURATION)
  })
  it('隐藏元素（details 折叠后 0×0）不更新锚点；重新展开按最后可见位置产生动画', () => {
    const { root, a } = makeContainer()
    mockRect(a, 0, 0)
    flipIn(root)
    const spy = vi.fn((_frames: Keyframe[], _opts: KeyframeAnimationOptions) => ({ finished: Promise.resolve() }))
    a.animate = spy as unknown as typeof a.animate
    mockRect(a, 0, 0, 0, 0)
    flipIn(root)
    expect(spy).not.toHaveBeenCalled() // 折叠不误判为瞬移
    mockRect(a, 0, 500)
    flipIn(root)
    expect(spy).toHaveBeenCalledTimes(1) // 展开且位置变了 → 相对最后可见位置动画
    const frames = spy.mock.calls[0][0]
    expect(frames[0].transform).toBe('translate(0px, -500px)')
  })
  it('resetFlip 清空锚点后同位置变化不再动画（切页防误判）', () => {
    const { root, a } = makeContainer()
    mockRect(a, 0, 0)
    flipIn(root)
    resetFlip()
    const spy = vi.fn(() => ({ finished: Promise.resolve() }))
    a.animate = spy as unknown as typeof a.animate
    mockRect(a, 0, 300)
    flipIn(root)
    expect(spy).not.toHaveBeenCalled()
  })
  it('container 为 null / 无动画能力环境安全无操作', () => {
    expect(() => flipIn(null)).not.toThrow()
    const { root, a } = makeContainer()
    mockRect(a, 0, 0)
    flipIn(root)
    delete (a as { animate?: unknown }).animate
    mockRect(a, 0, 99)
    expect(() => flipIn(root)).not.toThrow() // jsdom 无 WAAPI：不因缺 API 抛错
  })
})
