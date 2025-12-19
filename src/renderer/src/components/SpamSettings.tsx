import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import {
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Check,
  X,
  ShieldBan,
  Mail,
  AtSign,
  AlertCircle
} from 'lucide-react'

interface BlockedSender {
  id: string
  email: string
  addedAt: number
}

interface BlockedDomain {
  id: string
  domain: string
  addedAt: number
}

interface SpamSettingsData {
  enabled: boolean
  blockedSenders: BlockedSender[]
  blockedDomains: BlockedDomain[]
  autoDeleteSpam: boolean
  spamRetentionDays: number
}

interface SpamSettingsProps {
  accountEmail: string
}

export function SpamSettings({ accountEmail }: SpamSettingsProps) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<SpamSettingsData>({
    enabled: true,
    blockedSenders: [],
    blockedDomains: [],
    autoDeleteSpam: false,
    spamRetentionDays: 30
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [originalSettings, setOriginalSettings] = useState<SpamSettingsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 입력 상태
  const [isAddingSender, setIsAddingSender] = useState(false)
  const [isAddingDomain, setIsAddingDomain] = useState(false)
  const [newSenderEmail, setNewSenderEmail] = useState('')
  const [newDomain, setNewDomain] = useState('')

  useEffect(() => {
    loadSettings()
  }, [accountEmail])

  const loadSettings = async () => {
    if (!accountEmail) return
    setIsLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('get-spam-settings', accountEmail)
      setSettings(result)
      setOriginalSettings(result)
      setHasChanges(false)
    } catch (err) {
      console.error('Failed to load spam settings:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const updateSettings = (updates: Partial<SpamSettingsData>) => {
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
        'update-spam-settings',
        accountEmail,
        settings
      )
      if (result.success) {
        setOriginalSettings(result.settings)
        setHasChanges(false)
      } else {
        setError(result.error || t('settings.spamSettings.saveFailed'))
      }
    } catch (err) {
      console.error('Failed to save spam settings:', err)
      setError(t('settings.spamSettings.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm(t('settings.spamSettings.resetConfirm'))) return

    setIsSaving(true)
    setError(null)
    try {
      const result = await window.electron.ipcRenderer.invoke('reset-spam-settings', accountEmail)
      if (result.success) {
        setSettings(result.settings)
        setOriginalSettings(result.settings)
        setHasChanges(false)
      } else {
        setError(result.error || t('settings.spamSettings.resetFailed'))
      }
    } catch (err) {
      console.error('Failed to reset spam settings:', err)
      setError(t('settings.spamSettings.resetFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const addBlockedSender = () => {
    const email = newSenderEmail.trim().toLowerCase()
    if (!email) {
      setError(t('settings.spamSettings.emailRequired'))
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t('settings.spamSettings.invalidEmail'))
      return
    }
    if (settings.blockedSenders.some((s) => s.email === email)) {
      setError(t('settings.spamSettings.alreadyBlockedSender'))
      return
    }

    setError(null)
    const newSender: BlockedSender = {
      id: Date.now().toString(),
      email,
      addedAt: Date.now()
    }
    updateSettings({
      blockedSenders: [...settings.blockedSenders, newSender]
    })
    setNewSenderEmail('')
    setIsAddingSender(false)
  }

  const removeBlockedSender = (id: string) => {
    updateSettings({
      blockedSenders: settings.blockedSenders.filter((s) => s.id !== id)
    })
  }

  const addBlockedDomain = () => {
    let domain = newDomain.trim().toLowerCase()
    if (!domain) {
      setError(t('settings.spamSettings.domainRequired'))
      return
    }
    // Remove @ symbol
    if (domain.startsWith('@')) {
      domain = domain.slice(1)
    }
    if (!/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/.test(domain)) {
      setError(t('settings.spamSettings.invalidDomain'))
      return
    }
    if (settings.blockedDomains.some((d) => d.domain === domain)) {
      setError(t('settings.spamSettings.alreadyBlockedDomain'))
      return
    }

    setError(null)
    const newBlockedDomain: BlockedDomain = {
      id: Date.now().toString(),
      domain,
      addedAt: Date.now()
    }
    updateSettings({
      blockedDomains: [...settings.blockedDomains, newBlockedDomain]
    })
    setNewDomain('')
    setIsAddingDomain(false)
  }

  const removeBlockedDomain = (id: string) => {
    updateSettings({
      blockedDomains: settings.blockedDomains.filter((d) => d.id !== id)
    })
  }

  const cancelAddingSender = () => {
    setIsAddingSender(false)
    setNewSenderEmail('')
    setError(null)
  }

  const cancelAddingDomain = () => {
    setIsAddingDomain(false)
    setNewDomain('')
    setError(null)
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
        <h2 className="text-lg font-semibold">{t('settings.spamSettings.title')}</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('settings.spamSettings.reset')}
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

          {/* Spam Block Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('settings.spamSettings.spamBlock')}</CardTitle>
              <CardDescription>{t('settings.spamSettings.spamBlockDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="spamEnabled">{t('settings.spamSettings.enableSpamBlock')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.spamSettings.enableSpamBlockDesc')}
                  </p>
                </div>
                <Switch
                  id="spamEnabled"
                  checked={settings.enabled}
                  onCheckedChange={(checked) => updateSettings({ enabled: checked })}
                />
              </div>

              {settings.enabled && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="autoDeleteSpam">
                        {t('settings.spamSettings.autoDelete')}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {t('settings.spamSettings.autoDeleteDesc')}
                      </p>
                    </div>
                    <Switch
                      id="autoDeleteSpam"
                      checked={settings.autoDeleteSpam}
                      onCheckedChange={(checked) => updateSettings({ autoDeleteSpam: checked })}
                    />
                  </div>

                  {settings.autoDeleteSpam && (
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="retentionDays">
                          {t('settings.spamSettings.retentionDays')}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t('settings.spamSettings.retentionDaysDesc')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          id="retentionDays"
                          type="number"
                          min="1"
                          max="365"
                          value={settings.spamRetentionDays}
                          onChange={(e) =>
                            updateSettings({
                              spamRetentionDays: Math.max(
                                1,
                                Math.min(365, parseInt(e.target.value) || 30)
                              )
                            })
                          }
                          className="w-20"
                        />
                        <span className="text-sm text-muted-foreground">
                          {t('settings.spamSettings.days')}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Blocked Senders */}
          {settings.enabled && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">
                        {t('settings.spamSettings.blockedSenders')}
                      </CardTitle>
                      <CardDescription>
                        {t('settings.spamSettings.blockedSendersDesc')}
                      </CardDescription>
                    </div>
                  </div>
                  {!isAddingSender && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsAddingSender(true)
                        setError(null)
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t('settings.spamSettings.addSender')}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Add Sender Form */}
                {isAddingSender && (
                  <div className="flex items-center gap-2 rounded-md border border-primary bg-background p-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <Input
                      value={newSenderEmail}
                      onChange={(e) => setNewSenderEmail(e.target.value)}
                      placeholder={t('settings.spamSettings.senderPlaceholder')}
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addBlockedSender()
                        if (e.key === 'Escape') cancelAddingSender()
                      }}
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={addBlockedSender}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={cancelAddingSender}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Blocked Senders List */}
                {settings.blockedSenders.length === 0 && !isAddingSender ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t('settings.spamSettings.noBlockedSenders')}
                  </p>
                ) : (
                  settings.blockedSenders.map((sender) => (
                    <div
                      key={sender.id}
                      className="flex items-center gap-2 rounded-md border bg-background p-3"
                    >
                      <ShieldBan className="h-4 w-4 text-destructive" />
                      <span className="flex-1 text-sm">{sender.email}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeBlockedSender(sender.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {/* Blocked Domains */}
          {settings.enabled && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AtSign className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">
                        {t('settings.spamSettings.blockedDomains')}
                      </CardTitle>
                      <CardDescription>
                        {t('settings.spamSettings.blockedDomainsDesc')}
                      </CardDescription>
                    </div>
                  </div>
                  {!isAddingDomain && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsAddingDomain(true)
                        setError(null)
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t('settings.spamSettings.addDomain')}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Add Domain Form */}
                {isAddingDomain && (
                  <div className="flex items-center gap-2 rounded-md border border-primary bg-background p-3">
                    <AtSign className="h-4 w-4 text-muted-foreground" />
                    <Input
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      placeholder={t('settings.spamSettings.domainPlaceholder')}
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addBlockedDomain()
                        if (e.key === 'Escape') cancelAddingDomain()
                      }}
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={addBlockedDomain}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={cancelAddingDomain}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Blocked Domains List */}
                {settings.blockedDomains.length === 0 && !isAddingDomain ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t('settings.spamSettings.noBlockedDomains')}
                  </p>
                ) : (
                  settings.blockedDomains.map((domain) => (
                    <div
                      key={domain.id}
                      className="flex items-center gap-2 rounded-md border bg-background p-3"
                    >
                      <ShieldBan className="h-4 w-4 text-destructive" />
                      <span className="flex-1 text-sm">@{domain.domain}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeBlockedDomain(domain.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
