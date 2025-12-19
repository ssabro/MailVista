import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Palette } from 'lucide-react'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

type ToneType = 'formal' | 'casual' | 'assertive' | 'apologetic' | 'enthusiastic'

interface ToneOption {
  id: ToneType
  labelKey: string
}

const TONES: ToneOption[] = [
  { id: 'formal', labelKey: 'ai.tone.formal' },
  { id: 'casual', labelKey: 'ai.tone.casual' },
  { id: 'assertive', labelKey: 'ai.tone.assertive' },
  { id: 'apologetic', labelKey: 'ai.tone.apologetic' },
  { id: 'enthusiastic', labelKey: 'ai.tone.enthusiastic' }
]

interface ToneDropdownProps {
  accountEmail: string
  emailContent: string
  onToneConverted: (convertedContent: string) => void
  onError?: (error: string) => void
  disabled?: boolean
  className?: string
}

export function ToneDropdown({
  accountEmail,
  emailContent,
  onToneConverted,
  onError,
  disabled = false,
  className
}: ToneDropdownProps) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)

  // Check if tone conversion feature is enabled
  useEffect(() => {
    const checkEnabled = async () => {
      try {
        const settings = await window.electron.ipcRenderer.invoke('llm-get-settings', accountEmail)
        const hasValidProvider = Object.values(settings.credentials || {}).some(
          (cred) => (cred as { validated?: boolean } | undefined)?.validated
        )
        setIsEnabled(hasValidProvider && settings.features?.toneConversion?.enabled)
      } catch (err) {
        console.error('Failed to check AI settings:', err)
        setIsEnabled(false)
      }
    }
    checkEnabled()
  }, [accountEmail])

  const handleConvert = async (tone: ToneType) => {
    if (!emailContent.trim() || isLoading) return

    setIsLoading(true)

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'llm-convert-tone',
        accountEmail,
        emailContent,
        tone
      )

      if (result.error) {
        console.error('Tone conversion failed:', result.error)
        onError?.(result.error)
      } else if (result.converted) {
        onToneConverted(result.converted)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Tone conversion failed'
      console.error('Tone conversion failed:', err)
      onError?.(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isEnabled) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || isLoading || !emailContent.trim()}
          className={className}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Palette className="h-4 w-4 mr-1" />
          )}
          {isLoading ? t('ai.tone.converting') : t('ai.tone.title')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {TONES.map((tone) => (
          <DropdownMenuItem key={tone.id} onClick={() => handleConvert(tone.id)}>
            {t(tone.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
