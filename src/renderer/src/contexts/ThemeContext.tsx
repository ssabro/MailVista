import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export type ColorPalette = 'haze' | 'forest' | 'sunset' | 'lavender' | 'rose'
export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextType {
  colorPalette: ColorPalette
  themeMode: ThemeMode
  isDark: boolean
  setColorPalette: (palette: ColorPalette) => void
  setThemeMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_STORAGE_KEY = 'mailvista-theme'
const PALETTE_STORAGE_KEY = 'mailvista-palette'

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [colorPalette, setColorPaletteState] = useState<ColorPalette>('haze')
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light')
  const [isDark, setIsDark] = useState(false)

  // 초기 로드 시 저장된 테마 설정 불러오기
  useEffect(() => {
    const savedPalette = localStorage.getItem(PALETTE_STORAGE_KEY) as ColorPalette | null
    const savedMode = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null

    if (savedPalette && ['haze', 'forest', 'sunset', 'lavender', 'rose'].includes(savedPalette)) {
      setColorPaletteState(savedPalette)
    }
    if (savedMode && ['light', 'dark', 'system'].includes(savedMode)) {
      setThemeModeState(savedMode)
    }
  }, [])

  // 시스템 다크모드 감지
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = () => {
      if (themeMode === 'system') {
        setIsDark(mediaQuery.matches)
      }
    }

    // 초기값 설정
    if (themeMode === 'system') {
      setIsDark(mediaQuery.matches)
    } else {
      setIsDark(themeMode === 'dark')
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [themeMode])

  // HTML에 테마 클래스 적용
  useEffect(() => {
    const root = document.documentElement

    // 다크 모드 클래스
    if (isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }

    // 컬러 팔레트 클래스 (이전 팔레트 클래스 제거 후 새 클래스 추가)
    const palettes: ColorPalette[] = ['haze', 'forest', 'sunset', 'lavender', 'rose']
    palettes.forEach((p) => root.classList.remove(`theme-${p}`))
    root.classList.add(`theme-${colorPalette}`)
  }, [isDark, colorPalette])

  const setColorPalette = (palette: ColorPalette) => {
    setColorPaletteState(palette)
    localStorage.setItem(PALETTE_STORAGE_KEY, palette)
  }

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode)
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  }

  return (
    <ThemeContext.Provider
      value={{
        colorPalette,
        themeMode,
        isDark,
        setColorPalette,
        setThemeMode
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

// 각 팔레트의 기본 색상 정보 (UI 표시용)
export const paletteInfo: Record<ColorPalette, { name: string; primaryColor: string }> = {
  haze: { name: 'Haze', primaryColor: '#0F6BAE' },
  forest: { name: 'Forest', primaryColor: '#16A34A' },
  sunset: { name: 'Sunset', primaryColor: '#EA580C' },
  lavender: { name: 'Lavender', primaryColor: '#9333EA' },
  rose: { name: 'Rose', primaryColor: '#E11D48' }
}
