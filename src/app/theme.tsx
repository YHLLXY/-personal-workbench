import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const THEME_KEY = 'wb-theme'
const MEDIA = '(prefers-color-scheme: dark)'

const ThemeContext = createContext<{
  theme: Theme
  resolvedTheme: ResolvedTheme
  toggle: () => void
  setTheme: (t: Theme) => void
}>({ theme: 'light', resolvedTheme: 'light', toggle: () => {}, setTheme: () => {} })

function systemDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(MEDIA).matches
}

function resolve(theme: Theme): ResolvedTheme {
  if (theme === 'system') return systemDark() ? 'dark' : 'light'
  return theme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === 'dark' || saved === 'system' ? saved : 'light'
  })
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolve(theme))

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  }, [resolvedTheme])

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(MEDIA)
    const onChange = () => setResolvedTheme(theme === 'system' ? (mql.matches ? 'dark' : 'light') : theme)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    setResolvedTheme(resolve(t))
  }, [])

  const toggle = useCallback(() => {
    setThemeState(prev => {
      const next: Theme = prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light'
      setResolvedTheme(resolve(next))
      return next
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
export const useTheme = () => useContext(ThemeContext)
