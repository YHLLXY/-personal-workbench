/** URL-safe base64（VAPID applicationServerKey 格式）→ Uint8Array（ArrayBuffer 承载，可直接作为 BufferSource 传给 pushManager.subscribe） */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
