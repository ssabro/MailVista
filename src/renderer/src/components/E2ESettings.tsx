/**
 * E2E Encryption Settings Component
 * Allows users to set up and manage Signal Protocol encryption
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Shield,
  ShieldCheck,
  Key,
  Copy,
  RefreshCw,
  Download,
  Upload,
  Loader2,
  Check,
  AlertCircle,
  X,
  RotateCcw
} from 'lucide-react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from './ui/dialog'

interface E2ESettingsProps {
  accountEmail: string
}

interface KeyBundle {
  registrationId: number
  identityKey: string
  signedPreKey: {
    keyId: number
    publicKey: string
    signature: string
  }
  preKey?: {
    keyId: number
    publicKey: string
  }
}

export function E2ESettings({ accountEmail }: E2ESettingsProps) {
  const { t } = useTranslation()
  const [isRegistered, setIsRegistered] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [keyBundle, setKeyBundle] = useState<KeyBundle | null>(null)

  // Import dialog state
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importEmail, setImportEmail] = useState('')
  const [importKeyData, setImportKeyData] = useState('')

  // Export dialog state
  const [showExportDialog, setShowExportDialog] = useState(false)

  // Confirm dialog state
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Check registration status on mount
  useEffect(() => {
    checkRegistration()
  }, [accountEmail])

  const checkRegistration = async () => {
    setIsLoading(true)
    try {
      const registered = await window.electron.ipcRenderer.invoke('e2e-is-registered', accountEmail)
      setIsRegistered(registered)

      if (registered) {
        // Load fingerprint
        const fpResult = await window.electron.ipcRenderer.invoke(
          'e2e-get-fingerprint',
          accountEmail
        )
        if (fpResult.success) {
          setFingerprint(fpResult.fingerprint)
        }
      }
    } catch (err) {
      console.error('Failed to check E2E registration:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async () => {
    setIsProcessing(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await window.electron.ipcRenderer.invoke('e2e-register', accountEmail)

      if (result.success) {
        setIsRegistered(true)
        setKeyBundle(result.keyBundle)
        setSuccess(t('e2eSettings.setupSuccess'))

        // Load fingerprint
        const fpResult = await window.electron.ipcRenderer.invoke(
          'e2e-get-fingerprint',
          accountEmail
        )
        if (fpResult.success) {
          setFingerprint(fpResult.fingerprint)
        }
      } else {
        setError(result.error || t('e2eSettings.setupFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('e2eSettings.setupError'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExportKeys = async () => {
    setIsProcessing(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('e2e-export-key-bundle', accountEmail)

      if (result.success) {
        setKeyBundle(result.keyBundle)
        setShowExportDialog(true)
      } else {
        setError(result.error || t('e2eSettings.exportFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('e2eSettings.exportError'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleImportKeys = async () => {
    if (!importEmail.trim() || !importKeyData.trim()) {
      setError(t('e2eSettings.importRequired'))
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      const bundleData = JSON.parse(importKeyData)
      const result = await window.electron.ipcRenderer.invoke(
        'e2e-import-key-bundle',
        accountEmail,
        importEmail.trim(),
        bundleData
      )

      if (result.success) {
        setSuccess(t('e2eSettings.importSuccess', { email: importEmail }))
        setShowImportDialog(false)
        setImportEmail('')
        setImportKeyData('')
      } else {
        setError(result.error || t('e2eSettings.importFailed'))
      }
    } catch {
      setError(t('e2eSettings.importInvalidFormat'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRefreshOTPKs = async () => {
    setIsProcessing(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('e2e-refresh-otpks', accountEmail)

      if (result.success) {
        if (result.newKeyCount > 0) {
          setSuccess(t('e2eSettings.refreshSuccess', { count: result.newKeyCount }))
        } else {
          setSuccess(t('e2eSettings.refreshSufficient'))
        }
      } else {
        setError(t('e2eSettings.refreshFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('e2eSettings.refreshError'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReset = async () => {
    setIsProcessing(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('e2e-clear-all', accountEmail)

      if (result.success) {
        setIsRegistered(false)
        setFingerprint(null)
        setKeyBundle(null)
        setSuccess(t('e2eSettings.resetSuccess'))
        setShowResetConfirm(false)
      } else {
        setError(result.error || t('e2eSettings.resetFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('e2eSettings.resetError'))
    } finally {
      setIsProcessing(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setSuccess(t('e2eSettings.copySuccess'))
      setTimeout(() => setSuccess(null), 2000)
    } catch {
      setError(t('e2eSettings.copyFailed'))
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t('e2eSettings.loading')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{t('e2eSettings.title')}</h2>
        {isRegistered && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResetConfirm(true)}
              disabled={isProcessing}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('e2eSettings.resetButton')}
            </Button>
          </div>
        )}
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

          {/* 성공 메시지 */}
          {success && (
            <div className="flex items-center gap-2 rounded-md border border-green-500 bg-green-50 p-3 text-green-700">
              <Check className="h-4 w-4" />
              <span className="text-sm">{success}</span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-6 w-6 text-green-700 hover:text-green-800"
                onClick={() => setSuccess(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* 상태 카드 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                {isRegistered ? (
                  <ShieldCheck className="h-6 w-6 text-green-500" />
                ) : (
                  <Shield className="h-6 w-6 text-muted-foreground" />
                )}
                <div>
                  <CardTitle className="text-base">{t('e2eSettings.statusTitle')}</CardTitle>
                  <CardDescription>{t('e2eSettings.statusDesc')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('e2eSettings.e2eEncryption')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {isRegistered
                      ? t('e2eSettings.statusEnabled')
                      : t('e2eSettings.statusDisabled')}
                  </p>
                </div>
                {!isRegistered ? (
                  <Button onClick={handleRegister} disabled={isProcessing}>
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('e2eSettings.settingUp')}
                      </>
                    ) : (
                      <>
                        <Key className="h-4 w-4 mr-2" />
                        {t('e2eSettings.registerButton')}
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-green-600">
                      {t('e2eSettings.active')}
                    </span>
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 등록된 경우에만 표시되는 설정들 */}
          {isRegistered && (
            <>
              {/* 신원 지문 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('e2eSettings.fingerprintTitle')}</CardTitle>
                  <CardDescription>{t('e2eSettings.fingerprintDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md bg-muted p-3 text-xs font-mono break-all">
                      {fingerprint || t('e2eSettings.loadingText')}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => fingerprint && copyToClipboard(fingerprint)}
                      disabled={!fingerprint}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* 키 관리 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('e2eSettings.keyManageTitle')}</CardTitle>
                  <CardDescription>{t('e2eSettings.keyManageDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('e2eSettings.exportLabel')}</Label>
                      <p className="text-sm text-muted-foreground">{t('e2eSettings.exportDesc')}</p>
                    </div>
                    <Button variant="outline" onClick={handleExportKeys} disabled={isProcessing}>
                      <Download className="h-4 w-4 mr-2" />
                      {t('e2eSettings.exportButton')}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('e2eSettings.importLabel')}</Label>
                      <p className="text-sm text-muted-foreground">{t('e2eSettings.importDesc')}</p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setShowImportDialog(true)}
                      disabled={isProcessing}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {t('e2eSettings.importButton')}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t('e2eSettings.refreshLabel')}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t('e2eSettings.refreshDesc')}
                      </p>
                    </div>
                    <Button variant="outline" onClick={handleRefreshOTPKs} disabled={isProcessing}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      {t('e2eSettings.refreshButton')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* 사용 안내 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('e2eSettings.usageTitle')}</CardTitle>
                  <CardDescription>{t('e2eSettings.usageDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                    <li>{t('e2eSettings.usageStep1')}</li>
                    <li>{t('e2eSettings.usageStep2')}</li>
                    <li>{t('e2eSettings.usageStep3')}</li>
                    <li>{t('e2eSettings.usageStep4')}</li>
                  </ol>
                </CardContent>
              </Card>
            </>
          )}

          {/* 미등록 시 안내 */}
          {!isRegistered && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('e2eSettings.aboutTitle')}</CardTitle>
                <CardDescription>{t('e2eSettings.aboutDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
                  <li>{t('e2eSettings.aboutPoint1')}</li>
                  <li>{t('e2eSettings.aboutPoint2')}</li>
                  <li>{t('e2eSettings.aboutPoint3')}</li>
                  <li>{t('e2eSettings.aboutPoint4')}</li>
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('e2eSettings.exportDialogTitle')}</DialogTitle>
            <DialogDescription>{t('e2eSettings.exportDialogDesc')}</DialogDescription>
          </DialogHeader>

          {keyBundle && (
            <div className="space-y-4">
              <Textarea
                readOnly
                className="font-mono text-xs h-48"
                value={JSON.stringify(keyBundle, null, 2)}
              />

              <Button className="w-full" onClick={() => copyToClipboard(JSON.stringify(keyBundle))}>
                <Copy className="h-4 w-4 mr-2" />
                {t('e2eSettings.copyToClipboard')}
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('e2eSettings.importDialogTitle')}</DialogTitle>
            <DialogDescription>{t('e2eSettings.importDialogDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('e2eSettings.partnerEmail')}</Label>
              <Input
                type="email"
                placeholder="example@email.com"
                value={importEmail}
                onChange={(e) => setImportEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('e2eSettings.publicKeyData')}</Label>
              <Textarea
                className="font-mono text-xs h-48"
                placeholder='{"registrationId": ..., "identityKey": "...", ...}'
                value={importKeyData}
                onChange={(e) => setImportKeyData(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleImportKeys} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('e2eSettings.importing')}
                </>
              ) : (
                t('e2eSettings.importButton')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirm Dialog */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {t('e2eSettings.resetDialogTitle')}
            </DialogTitle>
            <DialogDescription>{t('e2eSettings.resetDialogDesc')}</DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive space-y-2">
            <p className="font-medium">{t('e2eSettings.resetWarning')}</p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t('e2eSettings.resetWarn1')}</li>
              <li>{t('e2eSettings.resetWarn2')}</li>
              <li>{t('e2eSettings.resetWarn3')}</li>
            </ul>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleReset} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('e2eSettings.resetting')}
                </>
              ) : (
                t('e2eSettings.resetButton')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
