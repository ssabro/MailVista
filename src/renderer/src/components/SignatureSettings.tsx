import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import {
  Save,
  RotateCcw,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  FileSignature,
  AlertCircle
} from 'lucide-react'

interface Signature {
  id: string
  name: string
  content: string
  isDefault: boolean
}

interface SignatureSettingsData {
  enabled: boolean
  signatures: Signature[]
  defaultSignatureId: string | null
  includeInReply: boolean
  includeInForward: boolean
}

interface SignatureSettingsProps {
  accountEmail: string
}

export function SignatureSettings({ accountEmail }: SignatureSettingsProps) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<SignatureSettingsData>({
    enabled: false,
    signatures: [],
    defaultSignatureId: null,
    includeInReply: true,
    includeInForward: true
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [originalSettings, setOriginalSettings] = useState<SignatureSettingsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 편집 상태
  const [editingSignature, setEditingSignature] = useState<Signature | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [editName, setEditName] = useState('')
  const [editContent, setEditContent] = useState('')

  useEffect(() => {
    loadSettings()
  }, [accountEmail])

  const loadSettings = async () => {
    if (!accountEmail) return
    setIsLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'get-signature-settings',
        accountEmail
      )
      setSettings(result)
      setOriginalSettings(result)
      setHasChanges(false)
    } catch (err) {
      console.error('Failed to load signature settings:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const updateSettings = (updates: Partial<SignatureSettingsData>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...updates }
      setHasChanges(JSON.stringify(updated) !== JSON.stringify(originalSettings))
      return updated
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'update-signature-settings',
        accountEmail,
        settings
      )
      if (result.success) {
        setOriginalSettings(result.settings)
        setHasChanges(false)
      } else {
        setError(result.error || t('settings.signatureSettings.saveFailed'))
      }
    } catch (err) {
      console.error('Failed to save signature settings:', err)
      setError(t('settings.signatureSettings.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm(t('settings.signatureSettings.resetConfirm'))) return

    setIsSaving(true)
    setError(null)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'reset-signature-settings',
        accountEmail
      )
      if (result.success) {
        setSettings(result.settings)
        setOriginalSettings(result.settings)
        setHasChanges(false)
      } else {
        setError(result.error || t('settings.signatureSettings.resetFailed'))
      }
    } catch (err) {
      console.error('Failed to reset signature settings:', err)
      setError(t('settings.signatureSettings.resetFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const startAddingSignature = () => {
    setIsAddingNew(true)
    setEditingSignature(null)
    setEditName('')
    setEditContent('')
    setError(null)
  }

  const startEditingSignature = (signature: Signature) => {
    setEditingSignature(signature)
    setIsAddingNew(false)
    setEditName(signature.name)
    setEditContent(signature.content)
    setError(null)
  }

  const cancelEditing = () => {
    setEditingSignature(null)
    setIsAddingNew(false)
    setEditName('')
    setEditContent('')
  }

  const saveSignature = () => {
    if (!editName.trim()) {
      setError(t('settings.signatureSettings.nameRequired'))
      return
    }
    if (!editContent.trim()) {
      setError(t('settings.signatureSettings.contentRequired'))
      return
    }

    setError(null)

    if (isAddingNew) {
      const newSignature: Signature = {
        id: Date.now().toString(),
        name: editName.trim(),
        content: editContent.trim(),
        isDefault: settings.signatures.length === 0
      }
      const newSignatures = [...settings.signatures, newSignature]
      updateSettings({
        signatures: newSignatures,
        defaultSignatureId:
          newSignatures.length === 1 ? newSignature.id : settings.defaultSignatureId
      })
    } else if (editingSignature) {
      const updatedSignatures = settings.signatures.map((sig) =>
        sig.id === editingSignature.id
          ? { ...sig, name: editName.trim(), content: editContent.trim() }
          : sig
      )
      updateSettings({ signatures: updatedSignatures })
    }

    cancelEditing()
  }

  const deleteSignature = (id: string) => {
    if (!confirm(t('settings.signatureSettings.deleteConfirm'))) return

    const updatedSignatures = settings.signatures.filter((sig) => sig.id !== id)
    const newDefaultId =
      settings.defaultSignatureId === id
        ? updatedSignatures.length > 0
          ? updatedSignatures[0].id
          : null
        : settings.defaultSignatureId

    updateSettings({
      signatures: updatedSignatures,
      defaultSignatureId: newDefaultId
    })
  }

  const setDefaultSignature = (id: string) => {
    updateSettings({ defaultSignatureId: id })
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t('settings.loadingSettings')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{t('settings.signatureSettings.title')}</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('settings.signatureSettings.reset')}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>

      {/* 내용 */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-4">
          {/* 오류 메시지 */}
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-6 w-6"
                onClick={() => setError(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Signature Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t('settings.signatureSettings.useSignature')}
              </CardTitle>
              <CardDescription>{t('settings.signatureSettings.useSignatureDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="signatureEnabled">
                    {t('settings.signatureSettings.useSignature')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.signatureSettings.addNewSignature')}
                  </p>
                </div>
                <Switch
                  id="signatureEnabled"
                  checked={settings.enabled}
                  onCheckedChange={(checked) => updateSettings({ enabled: checked })}
                />
              </div>

              {settings.enabled && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="includeInReply">
                        {t('settings.signatureSettings.includeInReply')}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {t('settings.signatureSettings.includeInReplyDesc')}
                      </p>
                    </div>
                    <Switch
                      id="includeInReply"
                      checked={settings.includeInReply}
                      onCheckedChange={(checked) => updateSettings({ includeInReply: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="includeInForward">
                        {t('settings.signatureSettings.includeInForward')}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {t('settings.signatureSettings.includeInForwardDesc')}
                      </p>
                    </div>
                    <Switch
                      id="includeInForward"
                      checked={settings.includeInForward}
                      onCheckedChange={(checked) => updateSettings({ includeInForward: checked })}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Signature List */}
          {settings.enabled && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {t('settings.signatureSettings.signatureList')}
                    </CardTitle>
                    <CardDescription>
                      {t('settings.signatureSettings.signatureListDesc')}
                    </CardDescription>
                  </div>
                  {!isAddingNew && !editingSignature && (
                    <Button variant="outline" size="sm" onClick={startAddingSignature}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('settings.signatureSettings.addSignature')}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add/Edit Signature Form */}
                {(isAddingNew || editingSignature) && (
                  <div className="space-y-3 rounded-md border border-primary bg-background p-4">
                    <div className="space-y-2">
                      <Label htmlFor="signatureName">
                        {t('settings.signatureSettings.signatureName')}
                      </Label>
                      <Input
                        id="signatureName"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder={t('settings.signatureSettings.signatureNamePlaceholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signatureContent">
                        {t('settings.signatureSettings.signatureContent')}
                      </Label>
                      <Textarea
                        id="signatureContent"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        placeholder={t('settings.signatureSettings.signatureContentPlaceholder')}
                        rows={5}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={cancelEditing}>
                        <X className="mr-2 h-4 w-4" />
                        {t('common.cancel')}
                      </Button>
                      <Button size="sm" onClick={saveSignature}>
                        <Check className="mr-2 h-4 w-4" />
                        {isAddingNew ? t('common.add') : t('common.edit')}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Signature List */}
                {settings.signatures.length === 0 && !isAddingNew ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t('settings.signatureSettings.noSignatures')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {settings.signatures.map((signature) => (
                      <div
                        key={signature.id}
                        className={`rounded-md border bg-background p-3 ${
                          settings.defaultSignatureId === signature.id ? 'border-primary' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <FileSignature className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{signature.name}</span>
                                {settings.defaultSignatureId === signature.id && (
                                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                                    {t('settings.signatureSettings.default')}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground line-clamp-2">
                                {signature.content}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {settings.defaultSignatureId !== signature.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDefaultSignature(signature.id)}
                                title={t('settings.signatureSettings.setAsDefault')}
                              >
                                {t('settings.signatureSettings.setAsDefault')}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => startEditingSignature(signature)}
                              disabled={!!editingSignature || isAddingNew}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => deleteSignature(signature.id)}
                              disabled={!!editingSignature || isAddingNew}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
