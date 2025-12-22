import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Input } from './ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select'
import { Button } from './ui/button'
import {
  Globe,
  Bell,
  Monitor,
  FileText,
  Shield,
  Trash2,
  Database,
  RefreshCw,
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  FolderOpen,
  Sun,
  Moon,
  Check,
  RotateCcw
} from 'lucide-react'
import { changeLanguage } from '../i18n'
import { useTheme, ColorPalette, ThemeMode, paletteInfo } from '../contexts/ThemeContext'
import { Progress } from './ui/progress'

export interface GlobalSettingsData {
  language: string
  languageSelected: boolean
  notifications: {
    enabled: boolean
    sound: boolean
    showPreview: boolean
  }
  startup: {
    launchAtLogin: boolean
    minimizeToTray: boolean
    startMinimized: boolean
  }
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error'
    retentionDays: number
  }
  security: {
    autoLock: boolean
    autoLockTime: number
    pinEnabled: boolean
    pinHash: string | null
  }
  updates: {
    autoCheck: boolean
    autoDownload: boolean
  }
}

interface GlobalSettingsProps {
  isOpen: boolean
  onClose: () => void
}

interface StorageStats {
  totalEmails: number
  cachedBodies: number
  totalFolders: number
  storageSize: number
}

interface UpdateStatus {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error'
  currentVersion: string
  latestVersion?: string
  releaseNotes?: string
  releaseDate?: string
  downloadProgress?: number
  error?: string
}

const defaultSettings: GlobalSettingsData = {
  language: 'ko',
  languageSelected: true,
  notifications: {
    enabled: true,
    sound: true,
    showPreview: true
  },
  startup: {
    launchAtLogin: false,
    minimizeToTray: false,
    startMinimized: false
  },
  logging: {
    level: 'info',
    retentionDays: 30
  },
  security: {
    autoLock: false,
    autoLockTime: 5,
    pinEnabled: false,
    pinHash: null
  },
  updates: {
    autoCheck: true,
    autoDownload: false
  }
}

export function GlobalSettings({ isOpen, onClose }: GlobalSettingsProps) {
  const { t } = useTranslation()
  const { colorPalette, themeMode, setColorPalette, setThemeMode } = useTheme()
  const [settings, setSettings] = useState<GlobalSettingsData>(defaultSettings)
  const [isLoading, setIsLoading] = useState(true)
  const [isClearingCache, setIsClearingCache] = useState(false)
  const [isClearingStorage, setIsClearingStorage] = useState(false)
  const [isClearingLogs, setIsClearingLogs] = useState(false)
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null)
  const [cacheResult, setCacheResult] = useState<{
    deletedFiles: number
    deletedSize: number
    message: string
  } | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    status: 'idle',
    currentVersion: '1.0.0'
  })

  // PIN 설정 상태
  const [showPinSetup, setShowPinSetup] = useState(false)
  const [pinInput, setPinInput] = useState(['', '', '', '', '', ''])
  const [pinConfirm, setPinConfirm] = useState(['', '', '', '', '', ''])
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter')
  const [pinError, setPinError] = useState<string | null>(null)

  // 앱 초기화 상태
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')

  // 업데이트 상태 변경 이벤트 리스너
  const handleUpdateStatusChange = useCallback((_event: unknown, status: UpdateStatus) => {
    setUpdateStatus(status)
  }, [])

  useEffect(() => {
    // 업데이트 상태 변경 이벤트 구독
    const removeListener = window.electron.ipcRenderer.on(
      'update-status-changed',
      handleUpdateStatusChange
    )

    return () => {
      if (removeListener) {
        removeListener()
      }
    }
  }, [handleUpdateStatusChange])

  useEffect(() => {
    if (isOpen) {
      loadSettings()
      loadUpdateStatus()
    }
  }, [isOpen])

  const loadSettings = async () => {
    setIsLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('get-global-settings')
      if (result) {
        setSettings({ ...defaultSettings, ...result })
      }
      // 스토리지 통계 로드
      await loadStorageStats()
    } catch (error) {
      console.error('Failed to load global settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadStorageStats = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('storage-get-stats')
      if (result.success) {
        setStorageStats(result.stats)
      }
    } catch (error) {
      console.error('Failed to load storage stats:', error)
    }
  }

  const loadUpdateStatus = async () => {
    try {
      const status = await window.electron.ipcRenderer.invoke('update-get-status')
      if (status) {
        setUpdateStatus(status)
      }
      // 현재 버전도 가져오기
      const versionInfo = await window.electron.ipcRenderer.invoke('update-get-version')
      if (versionInfo) {
        setUpdateStatus((prev) => ({ ...prev, currentVersion: versionInfo.version }))
      }
    } catch (error) {
      console.error('Failed to load update status:', error)
    }
  }

  const handleCheckForUpdates = async () => {
    try {
      await window.electron.ipcRenderer.invoke('update-check')
    } catch (error) {
      console.error('Failed to check for updates:', error)
    }
  }

  const handleDownloadUpdate = async () => {
    try {
      await window.electron.ipcRenderer.invoke('update-download')
    } catch (error) {
      console.error('Failed to download update:', error)
    }
  }

  const handleInstallUpdate = async () => {
    try {
      await window.electron.ipcRenderer.invoke('update-install')
    } catch (error) {
      console.error('Failed to install update:', error)
    }
  }

  // PIN 설정 핸들러
  const handlePinSetup = async () => {
    const pin = pinInput.join('')
    const confirm = pinConfirm.join('')

    if (pinStep === 'enter') {
      if (pin.length !== 6) {
        setPinError(t('globalSettings.security.pinLengthError'))
        return
      }
      setPinStep('confirm')
      setPinError(null)
    } else {
      if (pin !== confirm) {
        setPinError(t('globalSettings.security.pinMismatch'))
        setPinConfirm(['', '', '', '', '', ''])
        return
      }

      try {
        const result = await window.electron.ipcRenderer.invoke('set-pin', pin)
        if (result.success) {
          setSettings((prev) => ({
            ...prev,
            security: { ...prev.security, pinEnabled: true }
          }))
          resetPinSetup()
        } else {
          setPinError(result.error || t('globalSettings.security.pinSetupError'))
        }
      } catch (error) {
        setPinError(t('globalSettings.security.pinSetupError'))
      }
    }
  }

  const handleDisablePin = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('disable-pin')
      if (result.success) {
        setSettings((prev) => ({
          ...prev,
          security: { ...prev.security, pinEnabled: false, pinHash: null }
        }))
      }
    } catch (error) {
      console.error('Failed to disable PIN:', error)
    }
  }

  const resetPinSetup = () => {
    setShowPinSetup(false)
    setPinInput(['', '', '', '', '', ''])
    setPinConfirm(['', '', '', '', '', ''])
    setPinStep('enter')
    setPinError(null)
  }

  const updateSettings = async (updates: Partial<GlobalSettingsData>) => {
    const newSettings = { ...settings, ...updates }
    setSettings(newSettings)
    try {
      await window.electron.ipcRenderer.invoke('update-global-settings', updates)
    } catch (error) {
      console.error('Failed to save global settings:', error)
    }
  }

  const handleLanguageChange = async (lang: string) => {
    await updateSettings({ language: lang })
    changeLanguage(lang)
  }

  const handleClearCache = async () => {
    setIsClearingCache(true)
    setCacheResult(null)
    try {
      const result = await window.electron.ipcRenderer.invoke('clear-cache')
      if (result.success) {
        setCacheResult({
          deletedFiles: result.deletedFiles,
          deletedSize: result.deletedSize,
          message: result.message
        })
        // 5초 후 결과 메시지 숨김
        setTimeout(() => setCacheResult(null), 5000)
      }
    } catch (error) {
      console.error('Failed to clear cache:', error)
    } finally {
      setIsClearingCache(false)
    }
  }

  const handleClearStorage = async () => {
    setIsClearingStorage(true)
    try {
      await window.electron.ipcRenderer.invoke('storage-clear-cache')
      await loadStorageStats()
    } catch (error) {
      console.error('Failed to clear storage:', error)
    } finally {
      setIsClearingStorage(false)
    }
  }

  const handleOpenLogDirectory = async () => {
    try {
      await window.electron.ipcRenderer.invoke('open-log-directory')
    } catch (error) {
      console.error('Failed to open log directory:', error)
    }
  }

  const handleExportLogs = async () => {
    try {
      await window.electron.ipcRenderer.invoke('export-logs')
    } catch (error) {
      console.error('Failed to export logs:', error)
    }
  }

  const handleClearLogs = async () => {
    setIsClearingLogs(true)
    try {
      await window.electron.ipcRenderer.invoke('clear-logs')
    } catch (error) {
      console.error('Failed to clear logs:', error)
    } finally {
      setIsClearingLogs(false)
    }
  }

  const handleAppReset = async () => {
    if (resetConfirmText !== 'RESET') {
      return
    }

    setIsResetting(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('app-reset')
      if (result.success) {
        // 초기화 성공 - 앱 전체 재시작 (main process 포함)
        setShowResetConfirm(false)
        setResetConfirmText('')
        await window.electron.ipcRenderer.invoke('app-restart')
      } else {
        console.error('App reset failed:', result.error)
      }
    } catch (error) {
      console.error('Failed to reset app:', error)
    } finally {
      setIsResetting(false)
    }
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const languageOptions = [
    { value: 'ko', label: '한국어' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
    { value: 'zh', label: '中文' }
  ]

  const logLevelOptions = [
    { value: 'debug', label: t('globalSettings.logging.levels.debug') },
    { value: 'info', label: t('globalSettings.logging.levels.info') },
    { value: 'warn', label: t('globalSettings.logging.levels.warn') },
    { value: 'error', label: t('globalSettings.logging.levels.error') }
  ]

  const retentionOptions = [
    { value: 7, label: t('globalSettings.logging.days', { count: 7 }) },
    { value: 14, label: t('globalSettings.logging.days', { count: 14 }) },
    { value: 30, label: t('globalSettings.logging.days', { count: 30 }) },
    { value: 60, label: t('globalSettings.logging.days', { count: 60 }) },
    { value: 90, label: t('globalSettings.logging.days', { count: 90 }) }
  ]

  const autoLockOptions = [
    { value: 5, label: t('globalSettings.security.minutes', { count: 5 }) },
    { value: 15, label: t('globalSettings.security.minutes', { count: 15 }) },
    { value: 30, label: t('globalSettings.security.minutes', { count: 30 }) },
    { value: 60, label: t('globalSettings.security.minutes', { count: 60 }) }
  ]

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogTitle className="sr-only">{t('globalSettings.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('globalSettings.description')}</DialogDescription>
          <div className="flex items-center justify-center py-8">
            <span className="text-muted-foreground">{t('common.loading')}</span>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('globalSettings.title')}</DialogTitle>
          <DialogDescription>{t('globalSettings.description')}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="general" className="flex items-center gap-1.5 text-xs">
              <Globe className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('globalSettings.tabs.general')}</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-1.5 text-xs">
              <Bell className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('globalSettings.tabs.notifications')}</span>
            </TabsTrigger>
            <TabsTrigger value="startup" className="flex items-center gap-1.5 text-xs">
              <Monitor className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('globalSettings.tabs.startup')}</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-1.5 text-xs">
              <Shield className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('globalSettings.tabs.security')}</span>
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex items-center gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('globalSettings.tabs.advanced')}</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            {/* 일반 설정 */}
            <TabsContent value="general" className="mt-0 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('globalSettings.language.title')}</CardTitle>
                  <CardDescription>{t('globalSettings.language.description')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Select value={settings.language} onValueChange={handleLanguageChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('globalSettings.language.select')} />
                    </SelectTrigger>
                    <SelectContent>
                      {languageOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* 외관 설정 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('settings.appearance.title')}</CardTitle>
                  <CardDescription>{t('settings.appearance.desc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* 다크 모드 설정 */}
                  <div className="space-y-3">
                    <Label>{t('settings.appearance.themeMode')}</Label>
                    <div className="flex gap-2">
                      {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setThemeMode(mode)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                            themeMode === mode
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border hover:border-primary/50 hover:bg-muted'
                          }`}
                        >
                          {mode === 'light' && <Sun className="h-4 w-4" />}
                          {mode === 'dark' && <Moon className="h-4 w-4" />}
                          {mode === 'system' && <Monitor className="h-4 w-4" />}
                          <span className="text-sm">{t(`settings.appearance.${mode}`)}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 컬러 팔레트 설정 */}
                  <div className="space-y-3">
                    <Label>{t('settings.appearance.colorPalette')}</Label>
                    <div className="grid grid-cols-5 gap-3">
                      {(Object.keys(paletteInfo) as ColorPalette[]).map((palette) => (
                        <button
                          key={palette}
                          onClick={() => setColorPalette(palette)}
                          className={`relative flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                            colorPalette === palette
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50 hover:bg-muted'
                          }`}
                        >
                          {colorPalette === palette && (
                            <div className="absolute top-1 right-1">
                              <Check className="h-3 w-3 text-primary" />
                            </div>
                          )}
                          <div
                            className="w-8 h-8 rounded-full border-2 border-white shadow-md"
                            style={{ backgroundColor: paletteInfo[palette].primaryColor }}
                          />
                          <span className="text-xs font-medium">
                            {t(`settings.appearance.palettes.${palette}`)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('globalSettings.updates.title')}</CardTitle>
                  <CardDescription>{t('globalSettings.updates.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 현재 버전 및 업데이트 상태 */}
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t('globalSettings.updates.currentVersion')}
                      </span>
                      <span className="font-medium">v{updateStatus.currentVersion}</span>
                    </div>

                    {/* 업데이트 상태 표시 */}
                    {updateStatus.status === 'checking' && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t('globalSettings.updates.checking')}</span>
                      </div>
                    )}

                    {updateStatus.status === 'not-available' && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span>{t('globalSettings.updates.upToDate')}</span>
                      </div>
                    )}

                    {updateStatus.status === 'available' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                          <Download className="h-4 w-4" />
                          <span>
                            {t('globalSettings.updates.available', {
                              version: updateStatus.latestVersion
                            })}
                          </span>
                        </div>
                        <Button size="sm" onClick={handleDownloadUpdate} className="w-full">
                          <Download className="h-4 w-4 mr-2" />
                          {t('globalSettings.updates.downloadNow')}
                        </Button>
                      </div>
                    )}

                    {updateStatus.status === 'downloading' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>{t('globalSettings.updates.downloading')}</span>
                          <span>{updateStatus.downloadProgress}%</span>
                        </div>
                        <Progress value={updateStatus.downloadProgress} />
                      </div>
                    )}

                    {updateStatus.status === 'downloaded' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          <span>
                            {t('globalSettings.updates.readyToInstall', {
                              version: updateStatus.latestVersion
                            })}
                          </span>
                        </div>
                        <Button size="sm" onClick={handleInstallUpdate} className="w-full">
                          <RefreshCw className="h-4 w-4 mr-2" />
                          {t('globalSettings.updates.installAndRestart')}
                        </Button>
                      </div>
                    )}

                    {updateStatus.status === 'error' && (
                      <div className="flex items-center gap-2 text-sm text-red-600">
                        <AlertCircle className="h-4 w-4" />
                        <span>{updateStatus.error || t('globalSettings.updates.error')}</span>
                      </div>
                    )}

                    {(updateStatus.status === 'idle' ||
                      updateStatus.status === 'not-available' ||
                      updateStatus.status === 'error') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCheckForUpdates}
                        className="w-full"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t('globalSettings.updates.checkNow')}
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('globalSettings.updates.autoCheck')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('globalSettings.updates.autoCheckDesc')}
                      </p>
                    </div>
                    <Switch
                      checked={settings.updates.autoCheck}
                      onCheckedChange={(checked) =>
                        updateSettings({
                          updates: { ...settings.updates, autoCheck: checked }
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('globalSettings.updates.autoDownload')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('globalSettings.updates.autoDownloadDesc')}
                      </p>
                    </div>
                    <Switch
                      checked={settings.updates.autoDownload}
                      onCheckedChange={(checked) =>
                        updateSettings({
                          updates: { ...settings.updates, autoDownload: checked }
                        })
                      }
                      disabled={!settings.updates.autoCheck}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 알림 설정 */}
            <TabsContent value="notifications" className="mt-0 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    {t('globalSettings.notifications.title')}
                  </CardTitle>
                  <CardDescription>{t('globalSettings.notifications.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('globalSettings.notifications.enabled')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('globalSettings.notifications.enabledDesc')}
                      </p>
                    </div>
                    <Switch
                      checked={settings.notifications.enabled}
                      onCheckedChange={(checked) =>
                        updateSettings({
                          notifications: { ...settings.notifications, enabled: checked }
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('globalSettings.notifications.sound')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('globalSettings.notifications.soundDesc')}
                      </p>
                    </div>
                    <Switch
                      checked={settings.notifications.sound}
                      onCheckedChange={(checked) =>
                        updateSettings({
                          notifications: { ...settings.notifications, sound: checked }
                        })
                      }
                      disabled={!settings.notifications.enabled}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('globalSettings.notifications.showPreview')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('globalSettings.notifications.showPreviewDesc')}
                      </p>
                    </div>
                    <Switch
                      checked={settings.notifications.showPreview}
                      onCheckedChange={(checked) =>
                        updateSettings({
                          notifications: { ...settings.notifications, showPreview: checked }
                        })
                      }
                      disabled={!settings.notifications.enabled}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 시작 옵션 */}
            <TabsContent value="startup" className="mt-0 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('globalSettings.startup.title')}</CardTitle>
                  <CardDescription>{t('globalSettings.startup.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('globalSettings.startup.launchAtLogin')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('globalSettings.startup.launchAtLoginDesc')}
                      </p>
                    </div>
                    <Switch
                      checked={settings.startup.launchAtLogin}
                      onCheckedChange={(checked) =>
                        updateSettings({
                          startup: { ...settings.startup, launchAtLogin: checked }
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('globalSettings.startup.minimizeToTray')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('globalSettings.startup.minimizeToTrayDesc')}
                      </p>
                    </div>
                    <Switch
                      checked={settings.startup.minimizeToTray}
                      onCheckedChange={(checked) =>
                        updateSettings({
                          startup: { ...settings.startup, minimizeToTray: checked }
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('globalSettings.startup.startMinimized')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('globalSettings.startup.startMinimizedDesc')}
                      </p>
                    </div>
                    <Switch
                      checked={settings.startup.startMinimized}
                      onCheckedChange={(checked) =>
                        updateSettings({
                          startup: { ...settings.startup, startMinimized: checked }
                        })
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 보안 설정 */}
            <TabsContent value="security" className="mt-0 space-y-4">
              {/* PIN 코드 설정 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    {t('globalSettings.security.pinTitle')}
                  </CardTitle>
                  <CardDescription>{t('globalSettings.security.pinDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('globalSettings.security.pinLock')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('globalSettings.security.pinLockDesc')}
                      </p>
                    </div>
                    {settings.security.pinEnabled ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-green-600">
                          {t('globalSettings.security.pinEnabled')}
                        </span>
                        <Button variant="outline" size="sm" onClick={handleDisablePin}>
                          {t('globalSettings.security.pinDisable')}
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setShowPinSetup(true)}>
                        {t('globalSettings.security.pinSetup')}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 자동 잠금 설정 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('globalSettings.security.title')}</CardTitle>
                  <CardDescription>{t('globalSettings.security.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('globalSettings.security.autoLock')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('globalSettings.security.autoLockDesc')}
                      </p>
                    </div>
                    <Switch
                      checked={settings.security.autoLock}
                      onCheckedChange={(checked) =>
                        updateSettings({
                          security: { ...settings.security, autoLock: checked }
                        })
                      }
                    />
                  </div>
                  {settings.security.autoLock && (
                    <div className="space-y-2">
                      <Label>{t('globalSettings.security.autoLockTime')}</Label>
                      <Select
                        value={String(settings.security.autoLockTime)}
                        onValueChange={(value) =>
                          updateSettings({
                            security: { ...settings.security, autoLockTime: Number(value) }
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {autoLockOptions.map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 고급 설정 (로그, 캐시) */}
            <TabsContent value="advanced" className="mt-0 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('globalSettings.logging.title')}</CardTitle>
                  <CardDescription>{t('globalSettings.logging.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('globalSettings.logging.level')}</Label>
                    <Select
                      value={settings.logging.level}
                      onValueChange={(value) =>
                        updateSettings({
                          logging: {
                            ...settings.logging,
                            level: value as GlobalSettingsData['logging']['level']
                          }
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {logLevelOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('globalSettings.logging.retention')}</Label>
                    <Select
                      value={String(settings.logging.retentionDays)}
                      onValueChange={(value) =>
                        updateSettings({
                          logging: { ...settings.logging, retentionDays: Number(value) }
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {retentionOptions.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 로그 관리 버튼 */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    <Button variant="outline" size="sm" onClick={handleOpenLogDirectory}>
                      <FolderOpen className="h-4 w-4 mr-2" />
                      {t('globalSettings.logging.openFolder')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportLogs}>
                      <Download className="h-4 w-4 mr-2" />
                      {t('globalSettings.logging.export')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearLogs}
                      disabled={isClearingLogs}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {isClearingLogs ? t('common.processing') : t('globalSettings.logging.clear')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('globalSettings.cache.title')}</CardTitle>
                  <CardDescription>{t('globalSettings.cache.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    variant="outline"
                    onClick={handleClearCache}
                    disabled={isClearingCache}
                    className="w-full"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {isClearingCache ? t('common.processing') : t('globalSettings.cache.clear')}
                  </Button>
                  {cacheResult && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-muted-foreground">
                        {cacheResult.message === 'cache_empty'
                          ? t('globalSettings.cache.empty')
                          : t('globalSettings.cache.cleared', {
                              files: cacheResult.deletedFiles,
                              size: formatBytes(cacheResult.deletedSize)
                            })}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    {t('globalSettings.storage.title')}
                  </CardTitle>
                  <CardDescription>{t('globalSettings.storage.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {storageStats && (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">
                          {t('globalSettings.storage.diskUsage')}
                        </p>
                        <p className="font-medium">{formatBytes(storageStats.storageSize)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">
                          {t('globalSettings.storage.totalEmails')}
                        </p>
                        <p className="font-medium">{storageStats.totalEmails.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">
                          {t('globalSettings.storage.cachedBodies')}
                        </p>
                        <p className="font-medium">{storageStats.cachedBodies.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">
                          {t('globalSettings.storage.totalFolders')}
                        </p>
                        <p className="font-medium">{storageStats.totalFolders.toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                  <Button
                    variant="destructive"
                    onClick={handleClearStorage}
                    disabled={isClearingStorage}
                    className="w-full"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {isClearingStorage ? t('common.processing') : t('globalSettings.storage.clear')}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {t('globalSettings.storage.clearWarning')}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-destructive/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-destructive">
                    <RotateCcw className="h-4 w-4" />
                    {t('globalSettings.reset.title')}
                  </CardTitle>
                  <CardDescription>{t('globalSettings.reset.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <p className="text-sm text-muted-foreground">
                      {t('globalSettings.reset.warning')}
                    </p>
                    <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside space-y-1">
                      <li>{t('globalSettings.reset.items.accounts')}</li>
                      <li>{t('globalSettings.reset.items.emails')}</li>
                      <li>{t('globalSettings.reset.items.settings')}</li>
                      <li>{t('globalSettings.reset.items.cache')}</li>
                    </ul>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => setShowResetConfirm(true)}
                    className="w-full"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {t('globalSettings.reset.button')}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose}>{t('common.close')}</Button>
        </div>
      </DialogContent>

      {/* PIN 설정 다이얼로그 */}
      <Dialog open={showPinSetup} onOpenChange={(open) => !open && resetPinSetup()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {pinStep === 'enter'
                ? t('globalSettings.security.pinSetupTitle')
                : t('globalSettings.security.pinConfirmTitle')}
            </DialogTitle>
            <DialogDescription>
              {pinStep === 'enter'
                ? t('globalSettings.security.pinSetupDesc')
                : t('globalSettings.security.pinConfirmDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center space-y-4 py-4">
            {/* PIN 입력 필드 */}
            <div className="flex gap-2">
              {(pinStep === 'enter' ? pinInput : pinConfirm).map((digit, index) => (
                <input
                  key={index}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => {
                    const value = e.target.value
                    if (!/^\d*$/.test(value)) return

                    const setter = pinStep === 'enter' ? setPinInput : setPinConfirm
                    const current = pinStep === 'enter' ? [...pinInput] : [...pinConfirm]
                    current[index] = value.slice(-1)
                    setter(current)
                    setPinError(null)

                    // 다음 입력으로 자동 이동
                    if (value && index < 5) {
                      const nextInput = document.querySelector(
                        `input[data-pin-index="${index + 1}"]`
                      ) as HTMLInputElement
                      nextInput?.focus()
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace') {
                      const setter = pinStep === 'enter' ? setPinInput : setPinConfirm
                      const current = pinStep === 'enter' ? [...pinInput] : [...pinConfirm]
                      if (!current[index] && index > 0) {
                        const prevInput = document.querySelector(
                          `input[data-pin-index="${index - 1}"]`
                        ) as HTMLInputElement
                        prevInput?.focus()
                        current[index - 1] = ''
                        setter(current)
                      }
                    }
                  }}
                  data-pin-index={index}
                  className="h-12 w-10 rounded-lg border-2 border-input bg-background text-center text-xl font-bold transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              ))}
            </div>

            {/* 에러 메시지 */}
            {pinError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {pinError}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetPinSetup}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handlePinSetup}>
              {pinStep === 'enter' ? t('common.next') : t('common.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 앱 초기화 확인 다이얼로그 */}
      <Dialog
        open={showResetConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setShowResetConfirm(false)
            setResetConfirmText('')
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              {t('globalSettings.reset.confirmTitle')}
            </DialogTitle>
            <DialogDescription>{t('globalSettings.reset.confirmDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">
                {t('globalSettings.reset.confirmWarning')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-confirm">
                {t('globalSettings.reset.confirmLabel')}
              </Label>
              <Input
                id="reset-confirm"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="RESET"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {t('globalSettings.reset.confirmHint')}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowResetConfirm(false)
                setResetConfirmText('')
              }}
              disabled={isResetting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleAppReset}
              disabled={resetConfirmText !== 'RESET' || isResetting}
            >
              {isResetting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('globalSettings.reset.resetting')}
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  {t('globalSettings.reset.confirmButton')}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
