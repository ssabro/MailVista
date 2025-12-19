import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import ko from './locales/ko.json'
import en from './locales/en.json'
import ja from './locales/ja.json'
import zh from './locales/zh.json'

const resources = {
  ko: { translation: ko },
  en: { translation: en },
  ja: { translation: ja },
  zh: { translation: zh }
}

// 저장된 언어 설정 불러오기
const getSavedLanguage = (): string => {
  try {
    const saved = localStorage.getItem('app-language')
    if (saved && ['ko', 'en', 'ja', 'zh'].includes(saved)) {
      return saved
    }
  } catch {
    // localStorage 접근 실패 시 기본값 사용
  }
  return 'ko'
}

i18n.use(initReactI18next).init({
  resources,
  lng: getSavedLanguage(),
  fallbackLng: 'ko',
  interpolation: {
    escapeValue: false
  }
})

// 언어 변경 시 localStorage에 저장
export const changeLanguage = async (lang: string): Promise<void> => {
  await i18n.changeLanguage(lang)
  try {
    localStorage.setItem('app-language', lang)
    // 백엔드에도 설정 저장
    if (window.electron && window.electron.ipcRenderer) {
      await window.electron.ipcRenderer.invoke('save-global-settings', { language: lang })
    }
  } catch (error) {
    console.error('Failed to save language setting:', error)
  }
}

export default i18n
