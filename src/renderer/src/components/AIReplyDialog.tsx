import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles, RefreshCw, Copy, Check } from 'lucide-react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'

interface AIReplyDialogProps {
  accountEmail: string
  originalEmailId: string
  originalSubject: string
  originalContent: string
  originalSender: string
  isOpen: boolean
  onClose: () => void
  onInsert: (reply: string) => void
}

export function AIReplyDialog({
  accountEmail,
  originalEmailId: _originalEmailId,
  originalSubject: _originalSubject,
  originalContent,
  originalSender: _originalSender,
  isOpen,
  onClose,
  onInsert
}: AIReplyDialogProps) {
  const { t } = useTranslation()
  const [instruction, setInstruction] = useState('')
  const [generatedReply, setGeneratedReply] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)

  // Check if smart reply feature is enabled
  useEffect(() => {
    const checkEnabled = async () => {
      try {
        const settings = await window.electron.ipcRenderer.invoke('llm-get-settings', accountEmail)
        const hasValidProvider = Object.values(settings.credentials || {}).some(
          (cred) => (cred as { validated?: boolean } | undefined)?.validated
        )
        setIsEnabled(hasValidProvider && settings.features?.smartReply?.enabled)
      } catch (err) {
        console.error('Failed to check AI settings:', err)
        setIsEnabled(false)
      }
    }
    if (isOpen) {
      checkEnabled()
    }
  }, [accountEmail, isOpen])

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setInstruction('')
      setGeneratedReply('')
      setError(null)
      setCopied(false)
    }
  }, [isOpen])

  const handleGenerate = async () => {
    if (!instruction.trim() || isLoading) return

    setIsLoading(true)
    setError(null)

    try {
      // IPC 핸들러는 (accountEmail, emailContent, instructions) 3개 파라미터만 받음
      const result = await window.electron.ipcRenderer.invoke(
        'llm-generate-reply',
        accountEmail,
        originalContent,
        instruction.trim()
      )

      if (!result.success || result.error) {
        setError(result.error || 'Failed to generate reply')
      } else if (result.draft?.draft) {
        setGeneratedReply(result.draft.draft)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate reply')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!generatedReply) return
    try {
      await navigator.clipboard.writeText(generatedReply)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleInsert = () => {
    if (generatedReply) {
      onInsert(generatedReply)
      onClose()
    }
  }

  if (!isEnabled) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('ai.reply.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Instruction input */}
          <div className="space-y-2">
            <Label>{t('ai.reply.instruction')}</Label>
            <Textarea
              placeholder={t('ai.reply.instructionPlaceholder')}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!instruction.trim() || isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('ai.reply.generating')}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {t('ai.reply.generate')}
              </>
            )}
          </Button>

          {error && (
            <div className="text-sm text-destructive p-2 bg-destructive/10 rounded">{error}</div>
          )}

          {/* Generated reply */}
          {generatedReply && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('ai.reply.title')}</Label>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 gap-1">
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? t('common.copied') : t('common.copy')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className="h-7 gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {t('ai.reply.regenerate')}
                  </Button>
                </div>
              </div>
              <Textarea
                value={generatedReply}
                onChange={(e) => setGeneratedReply(e.target.value)}
                rows={8}
                className="resize-none"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleInsert} disabled={!generatedReply}>
            {t('ai.reply.insert')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
