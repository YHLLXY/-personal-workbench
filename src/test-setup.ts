import '@testing-library/jest-dom/vitest'

// jsdom 不实现 Push API（window.PushManager 缺失）；组件测试「点击订阅 → pushManager.subscribe」
// 需要 `'PushManager' in window` 通过，这里补一个空桩。仅测试环境生效。
if (typeof window !== 'undefined' && !('PushManager' in window)) {
  ;(window as unknown as { PushManager: unknown }).PushManager = class PushManager {}
}
