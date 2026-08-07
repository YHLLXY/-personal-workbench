import { describe, it, expect } from 'vitest'
import { urlBase64ToUint8Array } from '../src/lib/push-utils'

describe('urlBase64ToUint8Array', () => {
  it('URL-safe base64 → Uint8Array（VAPID 公钥解码）', () => {
    const arr = urlBase64ToUint8Array('AAECAwQFBgcICQ==')
    expect(arr).toBeInstanceOf(Uint8Array)
    expect(Array.from(arr)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
  it('无 padding 输入兼容', () => {
    expect(Array.from(urlBase64ToUint8Array('AAECAwQFBgcICQ'))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})
