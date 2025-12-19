import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Loader2, Sparkles, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

interface SummaryResult {
  summary: string
  actionItems: string[]
  keyPoints: string[]
  sentiment?: 'positive' | 'neutral' | 'negative'
}

interface EmailAISummaryProps {
  accountEmail: string
  emailContent: string
  onError?: (error: string) => void
}

export function EmailAISummary({ accountEmail, emailContent, onError }: EmailAISummaryProps) {
  const { t, i18n } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [summary, setSummary] = useState<SummaryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isEnabled, setIsEnabled] = useState(false)

  // Check if AI summary feature is enabled
  useEffect(() => {
    const checkEnabled = async () => {
      try {
        const settings = await window.electron.ipcRenderer.invoke('llm-get-settings', accountEmail)
        const hasValidProvider = Object.values(settings.credentials || {}).some(
          (cred) => (cred as { validated?: boolean } | undefined)?.validated
        )
        setIsEnabled(hasValidProvider && settings.features?.summary?.enabled)
      } catch (err) {
        console.error('Failed to check AI settings:', err)
        setIsEnabled(false)
      }
    }
    checkEnabled()
  }, [accountEmail])

  const fetchSummary = async () => {
    if (!emailContent || isLoading) return

    setIsLoading(true)
    setError(null)

    try {
      // 현재 언어 설정 가져오기
      const currentLanguage = i18n.language || 'en'

      const result = await window.electron.ipcRenderer.invoke(
        'llm-summarize',
        accountEmail,
        emailContent,
        currentLanguage
      )

      if (!result.success || result.error) {
        setError(result.error || 'Failed to generate summary')
        onError?.(result.error || 'Failed to generate summary')
      } else if (result.summary) {
        // result.summary가 EmailSummary 객체
        setSummary(result.summary)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate summary'
      setError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-fetch summary when component mounts and is enabled
  useEffect(() => {
    if (isEnabled && emailContent && !summary && !isLoading) {
      fetchSummary()
    }
  }, [isEnabled, emailContent])

  if (!isEnabled) {
    return null
  }

  return (
    <Card className="mb-4 border-primary/20 bg-primary/5">
      <CardHeader
        className="py-2 px-4 cursor-pointer flex flex-row items-center justify-between"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-medium">
            {t('ai.summary.title', 'AI Summary')}
          </CardTitle>
        </div>
        <div className="flex items-center gap-1">
          {summary && !isLoading && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation()
                fetchSummary()
              }}
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="py-2 px-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('ai.summary.generating', 'Generating summary...')}
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={fetchSummary}>
                {t('common.retry')}
              </Button>
            </div>
          ) : summary ? (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed">{summary.summary}</p>
              {summary.actionItems && summary.actionItems.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t('ai.summary.actionItems', 'Action Items')}:
                  </p>
                  <ul className="list-disc list-inside text-sm space-y-0.5">
                    {summary.actionItems.map((item, index) => (
                      <li key={index} className="text-sm">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <Button variant="outline" size="sm" className="text-xs" onClick={fetchSummary}>
              <Sparkles className="h-3 w-3 mr-1" />
              {t('ai.summary.generate', 'Generate Summary')}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  )
}
