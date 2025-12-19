import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Languages, Loader2, Check } from 'lucide-react'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from './ui/dropdown-menu'
import { cn } from '@renderer/lib/utils'

const LANGUAGES = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' }
]

interface TranslationToggleProps {
  accountEmail: string
  emailContent: string
  onTranslated?: (translatedContent: string) => void
  onShowOriginal?: () => void
  className?: string
}

export function TranslationToggle({
  accountEmail,
  emailContent,
  onTranslated,
  onShowOriginal,
  className
}: TranslationToggleProps) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [isTranslated, setIsTranslated] = useState(false)
  const [currentLanguage, setCurrentLanguage] = useState<string | null>(null)
  const [isEnabled, setIsEnabled] = useState(false)

  // Check if translation feature is enabled
  useEffect(() => {
    const checkEnabled = async () => {
      try {
        const settings = await window.electron.ipcRenderer.invoke('llm-get-settings', accountEmail)
        const hasValidProvider = Object.values(settings.credentials || {}).some(
          (cred) => (cred as { validated?: boolean } | undefined)?.validated
        )
        setIsEnabled(hasValidProvider && settings.features?.translation?.enabled)
      } catch (err) {
        console.error('Failed to check AI settings:', err)
        setIsEnabled(false)
      }
    }
    checkEnabled()
  }, [accountEmail])

  const handleTranslate = async (targetLang: string) => {
    if (!emailContent || isLoading) return

    // If already translated to this language, show original
    if (isTranslated && currentLanguage === targetLang) {
      setIsTranslated(false)
      setCurrentLanguage(null)
      onShowOriginal?.()
      return
    }

    setIsLoading(true)

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'llm-translate',
        accountEmail,
        emailContent,
        targetLang
      )

      if (result.error) {
        console.error('Translation failed:', result.error)
      } else {
        setIsTranslated(true)
        setCurrentLanguage(targetLang)
        onTranslated?.(result.translatedText)
      }
    } catch (err) {
      console.error('Translation failed:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleShowOriginal = () => {
    setIsTranslated(false)
    setCurrentLanguage(null)
    onShowOriginal?.()
  }

  if (!isEnabled) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={isTranslated ? 'default' : 'ghost'}
          size="sm"
          className={cn('gap-1', className)}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Languages className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {isLoading
              ? t('ai.translate.translating')
              : isTranslated
                ? t('ai.translate.translated')
                : t('ai.translate.title')}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isTranslated && (
          <>
            <DropdownMenuItem onClick={handleShowOriginal}>
              {t('ai.translate.original')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleTranslate(lang.code)}
            className="flex items-center justify-between"
          >
            {lang.label}
            {currentLanguage === lang.code && <Check className="h-4 w-4 ml-2" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
