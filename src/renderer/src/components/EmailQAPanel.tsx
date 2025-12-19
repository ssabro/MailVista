import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Loader2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import { cn } from '@renderer/lib/utils'

interface QAMessage {
  role: 'user' | 'assistant'
  content: string
}

interface EmailQAPanelProps {
  accountEmail: string
  emailId: string
  emailContent: string
  emailSubject: string
  className?: string
}

export function EmailQAPanel({
  accountEmail,
  emailId,
  emailContent,
  emailSubject: _emailSubject,
  className
}: EmailQAPanelProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<QAMessage[]>([])
  const [isEnabled, setIsEnabled] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Check if Q&A feature is enabled
  useEffect(() => {
    const checkEnabled = async () => {
      try {
        const settings = await window.electron.ipcRenderer.invoke('llm-get-settings', accountEmail)
        const hasValidProvider = Object.values(settings.credentials || {}).some(
          (cred) => (cred as { validated?: boolean } | undefined)?.validated
        )
        setIsEnabled(hasValidProvider && settings.features?.emailQA?.enabled)
      } catch (err) {
        console.error('Failed to check AI settings:', err)
        setIsEnabled(false)
      }
    }
    checkEnabled()
  }, [accountEmail])

  // Reset messages when email changes
  useEffect(() => {
    setMessages([])
    setQuestion('')
  }, [emailId])

  // Scroll to bottom when new messages appear
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleAsk = async () => {
    if (!question.trim() || isLoading) return

    const userQuestion = question.trim()
    setQuestion('')
    setMessages((prev) => [...prev, { role: 'user', content: userQuestion }])
    setIsLoading(true)

    try {
      // IPC 핸들러는 (accountEmail, emailContent, question) 3개 파라미터만 받음
      const result = await window.electron.ipcRenderer.invoke(
        'llm-ask',
        accountEmail,
        emailContent,
        userQuestion
      )

      if (result.error) {
        setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${result.error}` }])
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: result.answer }])
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get answer'
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${errorMsg}` }])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAsk()
    }
  }

  if (!isEnabled) {
    return null
  }

  return (
    <Card className={cn('border-primary/20', className)}>
      <CardHeader
        className="py-2 px-4 cursor-pointer flex flex-row items-center justify-between"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-medium">{t('ai.qa.title')}</CardTitle>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="py-2 px-4 space-y-3">
          {messages.length > 0 && (
            <ScrollArea className="h-48 rounded-md border p-2">
              <div className="space-y-3">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                        msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      )}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t('ai.qa.thinking')}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          )}

          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              placeholder={t('ai.qa.placeholder')}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="flex-1"
            />
            <Button size="sm" onClick={handleAsk} disabled={!question.trim() || isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
