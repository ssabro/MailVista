import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select'
import {
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  Languages,
  MessageSquare,
  FileText,
  Palette
} from 'lucide-react'

// Types matching llm-settings.ts
type LLMProvider = 'openai' | 'anthropic' | 'google'
type AIFeatureId = 'summary' | 'smartReply' | 'toneConversion' | 'translation' | 'emailQA'

interface ProviderCredential {
  apiKey: string
  validated: boolean
  lastValidated?: number
}

interface AIFeatureConfig {
  enabled: boolean
}

interface AISettings {
  credentials: {
    openai?: ProviderCredential
    anthropic?: ProviderCredential
    google?: ProviderCredential
  }
  activeProvider?: LLMProvider
  features: Record<AIFeatureId, AIFeatureConfig>
  cacheEnabled: boolean
  cacheDuration: number
}

interface LLMSettingsProps {
  accountEmail: string
  onSettingsChange?: (settings: AISettings) => void
}

const PROVIDERS: Array<{ id: LLMProvider; name: string; description: string }> = [
  { id: 'openai', name: 'OpenAI', description: 'GPT-4o' },
  { id: 'anthropic', name: 'Anthropic', description: 'Claude 4.5 Sonnet' },
  { id: 'google', name: 'Google', description: 'Gemini 2.5 Flash' }
]

const FEATURES: Array<{
  id: AIFeatureId
  icon: React.ElementType
  labelKey: string
  descKey: string
}> = [
  {
    id: 'summary',
    icon: FileText,
    labelKey: 'ai.features.summary',
    descKey: 'ai.features.summaryDesc'
  },
  {
    id: 'smartReply',
    icon: MessageSquare,
    labelKey: 'ai.features.smartReply',
    descKey: 'ai.features.smartReplyDesc'
  },
  {
    id: 'toneConversion',
    icon: Palette,
    labelKey: 'ai.features.toneConversion',
    descKey: 'ai.features.toneConversionDesc'
  },
  {
    id: 'translation',
    icon: Languages,
    labelKey: 'ai.features.translation',
    descKey: 'ai.features.translationDesc'
  },
  {
    id: 'emailQA',
    icon: Sparkles,
    labelKey: 'ai.features.emailQA',
    descKey: 'ai.features.emailQADesc'
  }
]

const defaultSettings: AISettings = {
  credentials: {},
  activeProvider: undefined,
  features: {
    summary: { enabled: false },
    smartReply: { enabled: false },
    toneConversion: { enabled: false },
    translation: { enabled: false },
    emailQA: { enabled: false }
  },
  cacheEnabled: true,
  cacheDuration: 3600000
}

export function LLMSettings({ accountEmail, onSettingsChange }: LLMSettingsProps) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AISettings>(defaultSettings)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // API key input states
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<LLMProvider, string>>({
    openai: '',
    anthropic: '',
    google: ''
  })
  const [showApiKey, setShowApiKey] = useState<Record<LLMProvider, boolean>>({
    openai: false,
    anthropic: false,
    google: false
  })
  const [validating, setValidating] = useState<Record<LLMProvider, boolean>>({
    openai: false,
    anthropic: false,
    google: false
  })

  useEffect(() => {
    loadSettings()
  }, [accountEmail])

  const loadSettings = async () => {
    if (!accountEmail) return
    setIsLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('llm-get-settings', accountEmail)
      setSettings(result)
      setHasChanges(false)

      // Populate API key inputs (masked)
      const inputs: Record<LLMProvider, string> = { openai: '', anthropic: '', google: '' }
      if (result.credentials.openai?.apiKey) {
        inputs.openai = result.credentials.openai.apiKey
      }
      if (result.credentials.anthropic?.apiKey) {
        inputs.anthropic = result.credentials.anthropic.apiKey
      }
      if (result.credentials.google?.apiKey) {
        inputs.google = result.credentials.google.apiKey
      }
      setApiKeyInputs(inputs)
    } catch (error) {
      console.error('Failed to load AI settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleApiKeyChange = (provider: LLMProvider, value: string) => {
    setApiKeyInputs((prev) => ({ ...prev, [provider]: value }))
    // Mark credential as unvalidated when key changes
    if (settings.credentials[provider]?.apiKey !== value) {
      setSettings((prev) => ({
        ...prev,
        credentials: {
          ...prev.credentials,
          [provider]: prev.credentials[provider]
            ? { ...prev.credentials[provider], validated: false }
            : undefined
        }
      }))
      setHasChanges(true)
    }
  }

  const handleValidateApiKey = async (provider: LLMProvider) => {
    const apiKey = apiKeyInputs[provider]
    if (!apiKey) return

    setValidating((prev) => ({ ...prev, [provider]: true }))
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'llm-validate-api-key',
        provider,
        apiKey
      )

      if (result.valid) {
        // Save the validated credential
        await window.electron.ipcRenderer.invoke(
          'llm-set-provider-credential',
          accountEmail,
          provider,
          apiKey
        )
        // Update local state
        setSettings((prev) => ({
          ...prev,
          credentials: {
            ...prev.credentials,
            [provider]: { apiKey, validated: true, lastValidated: Date.now() }
          },
          // Auto-set as active if no provider selected
          activeProvider: prev.activeProvider || provider
        }))
        setHasChanges(true)
      } else {
        alert(t('ai.validationFailed') + ': ' + (result.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Failed to validate API key:', error)
      alert(t('ai.validationFailed'))
    } finally {
      setValidating((prev) => ({ ...prev, [provider]: false }))
    }
  }

  const handleDeleteCredential = async (provider: LLMProvider) => {
    if (!confirm(t('ai.deleteCredentialConfirm'))) return

    try {
      await window.electron.ipcRenderer.invoke(
        'llm-delete-provider-credential',
        accountEmail,
        provider
      )
      setApiKeyInputs((prev) => ({ ...prev, [provider]: '' }))
      setSettings((prev) => {
        const newCredentials = { ...prev.credentials }
        delete newCredentials[provider]
        return {
          ...prev,
          credentials: newCredentials,
          activeProvider: prev.activeProvider === provider ? undefined : prev.activeProvider
        }
      })
      setHasChanges(true)
    } catch (error) {
      console.error('Failed to delete credential:', error)
    }
  }

  const handleActiveProviderChange = async (provider: LLMProvider) => {
    setSettings((prev) => ({ ...prev, activeProvider: provider }))
    setHasChanges(true)
  }

  const handleFeatureToggle = (featureId: AIFeatureId, enabled: boolean) => {
    setSettings((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [featureId]: { ...prev.features[featureId], enabled }
      }
    }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'llm-update-settings',
        accountEmail,
        settings
      )
      if (result.success) {
        setHasChanges(false)
        onSettingsChange?.(result.settings)
      } else {
        console.error('Failed to save AI settings:', result.error)
      }
    } catch (error) {
      console.error('Failed to save AI settings:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm(t('settings.resetConfirm'))) return

    setIsSaving(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('llm-reset-settings', accountEmail)
      if (result.success) {
        setSettings(result.settings)
        setApiKeyInputs({ openai: '', anthropic: '', google: '' })
        setHasChanges(false)
        onSettingsChange?.(result.settings)
      }
    } catch (error) {
      console.error('Failed to reset AI settings:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const hasValidProvider = Object.values(settings.credentials).some((cred) => cred?.validated)

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
        <h2 className="text-lg font-semibold">{t('ai.title')}</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('common.reset')}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-4">
          {/* Provider Configuration */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('ai.providers.title')}</CardTitle>
              <CardDescription>{t('ai.providers.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {PROVIDERS.map((provider) => {
                const credential = settings.credentials[provider.id]
                const isValidated = credential?.validated
                const hasKey = !!apiKeyInputs[provider.id]

                return (
                  <div
                    key={provider.id}
                    className="space-y-2 border-b pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">{provider.name}</Label>
                        <p className="text-xs text-muted-foreground">{provider.description}</p>
                      </div>
                      {isValidated && (
                        <span className="flex items-center text-xs text-green-600">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          {t('ai.validated')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showApiKey[provider.id] ? 'text' : 'password'}
                          value={apiKeyInputs[provider.id]}
                          onChange={(e) => handleApiKeyChange(provider.id, e.target.value)}
                          placeholder={t('ai.apiKeyPlaceholder')}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowApiKey((prev) => ({
                              ...prev,
                              [provider.id]: !prev[provider.id]
                            }))
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showApiKey[provider.id] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleValidateApiKey(provider.id)}
                        disabled={!hasKey || validating[provider.id]}
                      >
                        {validating[provider.id] ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          t('ai.validate')
                        )}
                      </Button>

                      {hasKey && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCredential(provider.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Active Provider Selection */}
              {hasValidProvider && (
                <div className="pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('ai.activeProvider')}</Label>
                      <p className="text-xs text-muted-foreground">{t('ai.activeProviderDesc')}</p>
                    </div>
                    <Select
                      value={settings.activeProvider || ''}
                      onValueChange={(value) => handleActiveProviderChange(value as LLMProvider)}
                    >
                      <SelectTrigger className="w-40">
                        <span>
                          {settings.activeProvider
                            ? PROVIDERS.find((p) => p.id === settings.activeProvider)?.name ||
                              t('ai.selectProvider')
                            : t('ai.selectProvider')}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDERS.filter((p) => settings.credentials[p.id]?.validated).map(
                          (provider) => (
                            <SelectItem key={provider.id} value={provider.id}>
                              {provider.name}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Feature Toggles */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('ai.features.title')}</CardTitle>
              <CardDescription>{t('ai.features.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!hasValidProvider && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('ai.noProviderConfigured')}
                </p>
              )}

              {hasValidProvider &&
                FEATURES.map((feature) => {
                  const Icon = feature.icon
                  return (
                    <div
                      key={feature.id}
                      className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex items-start gap-3">
                        <Icon className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <Label className="text-sm font-medium">{t(feature.labelKey)}</Label>
                          <p className="text-xs text-muted-foreground">{t(feature.descKey)}</p>
                        </div>
                      </div>
                      <Switch
                        checked={settings.features[feature.id]?.enabled || false}
                        onCheckedChange={(checked) => handleFeatureToggle(feature.id, checked)}
                      />
                    </div>
                  )
                })}
            </CardContent>
          </Card>

          {/* Cache Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('ai.cache.title')}</CardTitle>
              <CardDescription>{t('ai.cache.desc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('ai.cache.enable')}</Label>
                  <p className="text-xs text-muted-foreground">{t('ai.cache.enableDesc')}</p>
                </div>
                <Switch
                  checked={settings.cacheEnabled}
                  onCheckedChange={(checked) => {
                    setSettings((prev) => ({ ...prev, cacheEnabled: checked }))
                    setHasChanges(true)
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
