import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Globe } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@renderer/lib/utils'

interface Language {
  code: string
  name: string
  nativeName: string
}

const LANGUAGES: Language[] = [
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' }
]

interface LanguageSelectorProps {
  isOpen: boolean
  onClose: (selectedLanguage: string) => void
}

export function LanguageSelector({ isOpen, onClose }: LanguageSelectorProps) {
  const { i18n } = useTranslation()
  const [selectedLang, setSelectedLang] = React.useState<string>(() => {
    // Try to detect browser/system language
    const browserLang = navigator.language.split('-')[0]
    const supportedLang = LANGUAGES.find((lang) => lang.code === browserLang)
    return supportedLang ? supportedLang.code : 'en'
  })

  const handleConfirm = async () => {
    await i18n.changeLanguage(selectedLang)
    // Save language preference
    try {
      await window.electron.ipcRenderer.invoke('save-global-settings', {
        language: selectedLang,
        languageSelected: true
      })
    } catch (err) {
      console.error('Failed to save language setting:', err)
    }
    onClose(selectedLang)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-haze-deep to-haze-medium px-6 py-8 text-white text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4">
            <Globe className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to MailVista</h1>
          <p className="text-haze-pale text-sm">Select your preferred language</p>
        </div>

        {/* Language Options */}
        <div className="p-6">
          <div className="grid grid-cols-2 gap-3">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setSelectedLang(lang.code)}
                className={cn(
                  'relative flex flex-col items-center p-4 rounded-lg border-2 transition-all',
                  selectedLang === lang.code
                    ? 'border-primary bg-secondary'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                )}
              >
                {selectedLang === lang.code && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-primary" />
                  </div>
                )}
                <span className="text-lg font-medium text-gray-900">{lang.nativeName}</span>
                <span className="text-sm text-gray-500">{lang.name}</span>
              </button>
            ))}
          </div>

          {/* Confirm Button */}
          <Button onClick={handleConfirm} className="w-full mt-6" size="lg">
            Continue
          </Button>

          <p className="text-xs text-gray-400 text-center mt-4">
            You can change this later in Settings
          </p>
        </div>
      </div>
    </div>
  )
}
