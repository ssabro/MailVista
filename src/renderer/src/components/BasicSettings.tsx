import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select'
import { Switch } from './ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'
import { Save, RotateCcw, CheckCircle } from 'lucide-react'
import { changeLanguage } from '../i18n'

interface AppSettings {
  emailsPerPage: number
  senderName: string
  saveSentMail: boolean
  delayedSend: {
    enabled: boolean
    delay: number
  }
  includeOriginalOnReply: boolean
  viewMode: 'list' | 'split'
  pollingInterval: number // 메일 동기화 주기 (초): 0 = 사용안함
}

interface BasicSettingsProps {
  accountEmail: string
  onSettingsChange?: (settings: AppSettings) => void
}

export function BasicSettings({ accountEmail, onSettingsChange }: BasicSettingsProps) {
  const { t, i18n } = useTranslation()
  const [settings, setSettings] = useState<AppSettings>({
    emailsPerPage: 20,
    senderName: '',
    saveSentMail: true,
    delayedSend: {
      enabled: false,
      delay: 10
    },
    includeOriginalOnReply: true,
    viewMode: 'list',
    pollingInterval: 30
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [originalSettings, setOriginalSettings] = useState<AppSettings | null>(null)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [accountEmail])

  const loadSettings = async () => {
    if (!accountEmail) return
    setIsLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('get-app-settings', accountEmail)

      // senderName이 비어있으면 계정의 이름을 기본값으로 설정
      if (!result.senderName) {
        const accounts = await window.electron.ipcRenderer.invoke('get-accounts')
        const currentAccountInfo = accounts?.find(
          (a: { email: string }) => a.email === accountEmail
        )
        if (currentAccountInfo) {
          result.senderName = currentAccountInfo.name
        }
      }

      setSettings(result)
      setOriginalSettings(result)
      setHasChanges(false)
    } catch (error) {
      console.error('설정 불러오기 실패:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: value }
      setHasChanges(JSON.stringify(updated) !== JSON.stringify(originalSettings))
      return updated
    })
  }

  const updateDelayedSend = (updates: Partial<AppSettings['delayedSend']>) => {
    setSettings((prev) => {
      const updated = {
        ...prev,
        delayedSend: { ...prev.delayedSend, ...updates }
      }
      setHasChanges(JSON.stringify(updated) !== JSON.stringify(originalSettings))
      return updated
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'update-app-settings',
        accountEmail,
        settings
      )
      if (result.success) {
        setOriginalSettings(result.settings)
        setHasChanges(false)
        onSettingsChange?.(result.settings)
        setShowSaveSuccess(true)
      } else {
        console.error('설정 저장 실패:', result.error)
      }
    } catch (error) {
      console.error('설정 저장 실패:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm(t('settings.resetConfirm'))) return

    setIsSaving(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('reset-app-settings', accountEmail)
      if (result.success) {
        setSettings(result.settings)
        setOriginalSettings(result.settings)
        setHasChanges(false)
        onSettingsChange?.(result.settings)
      } else {
        console.error('설정 초기화 실패:', result.error)
      }
    } catch (error) {
      console.error('설정 초기화 실패:', error)
    } finally {
      setIsSaving(false)
    }
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
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{t('settings.general')}</h2>
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

      {/* 내용 */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-4">
          {/* 언어 설정 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('settings.language')}</CardTitle>
              <CardDescription>{t('settings.languageDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label htmlFor="language">{t('settings.language')}</Label>
                <Select value={i18n.language} onValueChange={(value) => changeLanguage(value)}>
                  <SelectTrigger className="w-40">
                    <span>{t(`languages.${i18n.language}`)}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ko">{t('languages.ko')}</SelectItem>
                    <SelectItem value="en">{t('languages.en')}</SelectItem>
                    <SelectItem value="ja">{t('languages.ja')}</SelectItem>
                    <SelectItem value="zh">{t('languages.zh')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* 목록 보기 설정 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('settings.listView.title')}</CardTitle>
              <CardDescription>{t('settings.listView.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="emailsPerPage">{t('settings.listView.count')}</Label>
                <Select
                  value={String(settings.emailsPerPage)}
                  onValueChange={(value) => updateSetting('emailsPerPage', Number(value))}
                >
                  <SelectTrigger className="w-32">
                    <span>
                      {t('settings.listView.countUnit', { count: settings.emailsPerPage })}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">
                      {t('settings.listView.countUnit', { count: 10 })}
                    </SelectItem>
                    <SelectItem value="20">
                      {t('settings.listView.countUnit', { count: 20 })}
                    </SelectItem>
                    <SelectItem value="30">
                      {t('settings.listView.countUnit', { count: 30 })}
                    </SelectItem>
                    <SelectItem value="50">
                      {t('settings.listView.countUnit', { count: 50 })}
                    </SelectItem>
                    <SelectItem value="80">
                      {t('settings.listView.countUnit', { count: 80 })}
                    </SelectItem>
                    <SelectItem value="100">
                      {t('settings.listView.countUnit', { count: 100 })}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="viewMode">{t('settings.listView.mode')}</Label>
                  <p className="text-sm text-muted-foreground">{t('settings.listView.modeDesc')}</p>
                </div>
                <Select
                  value={settings.viewMode}
                  onValueChange={(value: string) =>
                    updateSetting('viewMode', value as 'list' | 'split')
                  }
                >
                  <SelectTrigger className="w-40">
                    <span>
                      {settings.viewMode === 'list'
                        ? t('settings.listView.listOnly')
                        : t('settings.listView.splitView')}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="list">{t('settings.listView.listOnly')}</SelectItem>
                    <SelectItem value="split">{t('settings.listView.splitView')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* 보내기 설정 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('settings.send.title')}</CardTitle>
              <CardDescription>{t('settings.send.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="senderName">{t('settings.send.senderName')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.send.senderNameDesc')}
                  </p>
                </div>
                <Input
                  id="senderName"
                  className="w-48"
                  value={settings.senderName}
                  onChange={(e) => updateSetting('senderName', e.target.value)}
                  placeholder={t('settings.send.senderNamePlaceholder')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="saveSentMail">{t('settings.send.saveSent')}</Label>
                  <p className="text-sm text-muted-foreground">{t('settings.send.saveSentDesc')}</p>
                </div>
                <Switch
                  id="saveSentMail"
                  checked={settings.saveSentMail}
                  onCheckedChange={(checked) => updateSetting('saveSentMail', checked)}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="delayedSend">{t('settings.send.delayedSend')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.send.delayedSendDesc')}
                    </p>
                  </div>
                  <Switch
                    id="delayedSend"
                    checked={settings.delayedSend.enabled}
                    onCheckedChange={(checked) => updateDelayedSend({ enabled: checked })}
                  />
                </div>

                {settings.delayedSend.enabled && (
                  <div className="ml-4 flex items-center gap-2">
                    <Label htmlFor="delayTime" className="text-sm text-muted-foreground">
                      {t('settings.send.delayTime')}
                    </Label>
                    <Select
                      value={String(settings.delayedSend.delay)}
                      onValueChange={(value) => updateDelayedSend({ delay: Number(value) })}
                    >
                      <SelectTrigger className="w-32">
                        <span>
                          {settings.delayedSend.delay === 60
                            ? t('settings.send.minute')
                            : t('settings.send.seconds', { count: settings.delayedSend.delay })}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">
                          {t('settings.send.seconds', { count: 10 })}
                        </SelectItem>
                        <SelectItem value="30">
                          {t('settings.send.seconds', { count: 30 })}
                        </SelectItem>
                        <SelectItem value="60">{t('settings.send.minute')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 답장 설정 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('settings.reply.title')}</CardTitle>
              <CardDescription>{t('settings.reply.desc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="includeOriginal">{t('settings.reply.includeOriginal')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.reply.includeOriginalDesc')}
                  </p>
                </div>
                <Switch
                  id="includeOriginal"
                  checked={settings.includeOriginalOnReply}
                  onCheckedChange={(checked) => updateSetting('includeOriginalOnReply', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* 동기화 설정 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('settings.sync.title')}</CardTitle>
              <CardDescription>{t('settings.sync.desc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="pollingInterval">{t('settings.sync.interval')}</Label>
                  <p className="text-sm text-muted-foreground">{t('settings.sync.intervalDesc')}</p>
                </div>
                <Select
                  value={String(settings.pollingInterval ?? 30)}
                  onValueChange={(value) => updateSetting('pollingInterval', Number(value))}
                >
                  <SelectTrigger className="w-32">
                    <span>
                      {settings.pollingInterval === 0
                        ? t('settings.sync.disabled')
                        : settings.pollingInterval === 30
                          ? t('settings.sync.seconds', { count: 30 })
                          : settings.pollingInterval === 60
                            ? t('settings.sync.minute')
                            : t('settings.sync.minutes', {
                                count: Math.floor((settings.pollingInterval ?? 30) / 60)
                              })}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t('settings.sync.disabled')}</SelectItem>
                    <SelectItem value="30">{t('settings.sync.seconds', { count: 30 })}</SelectItem>
                    <SelectItem value="60">{t('settings.sync.minute')}</SelectItem>
                    <SelectItem value="180">{t('settings.sync.minutes', { count: 3 })}</SelectItem>
                    <SelectItem value="300">{t('settings.sync.minutes', { count: 5 })}</SelectItem>
                    <SelectItem value="600">{t('settings.sync.minutes', { count: 10 })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 저장 완료 다이얼로그 */}
      <Dialog open={showSaveSuccess} onOpenChange={setShowSaveSuccess}>
        <DialogContent className="max-w-xs">
          <DialogTitle className="sr-only">{t('settings.saveComplete')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('settings.saveCompleteDesc')}
          </DialogDescription>
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-sm text-foreground">{t('settings.saveCompleteDesc')}</p>
          </div>
          <div className="flex justify-center">
            <Button onClick={() => setShowSaveSuccess(false)}>{t('common.confirm')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
