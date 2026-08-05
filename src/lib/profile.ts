/** 莫兰迪 6 色头像色板 */
export const AVATAR_COLORS = ['#7D8CA3', '#8AA77D', '#9B8CA6', '#C9A86A', '#C48B9F', '#B08968'] as const

export interface Profile { nickname: string; avatarColor: string }

const KEY = 'wb:profile'

export function getLocalProfile(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Profile>
    const color = (AVATAR_COLORS as readonly string[]).includes(raw.avatarColor ?? '') ? raw.avatarColor! : AVATAR_COLORS[0]
    return { nickname: typeof raw.nickname === 'string' ? raw.nickname : '', avatarColor: color }
  } catch {
    return { nickname: '', avatarColor: AVATAR_COLORS[0] }
  }
}

export function setLocalProfile(p: Profile): void {
  localStorage.setItem(KEY, JSON.stringify(p))
}
