/**
 * Unified Encryption Settings Component
 * Supports Signal Protocol, PGP, and S/MIME encryption
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Shield,
  ShieldCheck,
  Key,
  Copy,
  Download,
  Upload,
  Loader2,
  Check,
  AlertCircle,
  X,
  RotateCcw,
  FileKey,
  Trash2
} from 'lucide-react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from './ui/dialog'

interface EncryptionSettingsProps {
  accountEmail: string
}

type EncryptionTab = 'signal' | 'pgp' | 'smime'

interface PGPKeyInfo {
  fingerprint: string
  keyId: string
  userId: string
  createdAt: number
}

interface SMIMECertInfo {
  fingerprint: string
  subject: string
  issuer: string
  validFrom: string
  validTo: string
  email: string
  createdAt: number
}

interface ContactKey {
  email: string
  fingerprint: string
  userId?: string
  subject?: string
  importedAt: number
}

export function EncryptionSettings({ accountEmail }: EncryptionSettingsProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<EncryptionTab>('signal')
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Signal Protocol state
  const [signalRegistered, setSignalRegistered] = useState(false)
  const [signalFingerprint, setSignalFingerprint] = useState<string | null>(null)

  // PGP state
  const [pgpSetup, setPgpSetup] = useState(false)
  const [pgpKeyInfo, setPgpKeyInfo] = useState<PGPKeyInfo | null>(null)
  const [pgpContacts, setPgpContacts] = useState<ContactKey[]>([])

  // S/MIME state
  const [smimeSetup, setSmimeSetup] = useState(false)
  const [smimeCertInfo, setSmimeCertInfo] = useState<SMIMECertInfo | null>(null)
  const [smimeContacts, setSmimeContacts] = useState<ContactKey[]>([])

  // Dialog states
  const [showPassphraseDialog, setShowPassphraseDialog] = useState(false)
  const [_passphraseAction, setPassphraseAction] = useState<'generate' | 'export' | 'import'>(
    'generate'
  )
  const [passphrase, setPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [userName, setUserName] = useState('')

  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importEmail, setImportEmail] = useState('')
  const [importKeyData, setImportKeyData] = useState('')

  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportedKey, setExportedKey] = useState('')

  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Load all encryption statuses
  useEffect(() => {
    loadEncryptionStatus()
  }, [accountEmail])

  const loadEncryptionStatus = async () => {
    setIsLoading(true)
    try {
      // Check Signal Protocol
      const signalReg = await window.electron.ipcRenderer.invoke('e2e-is-registered', accountEmail)
      setSignalRegistered(signalReg)
      if (signalReg) {
        const fpResult = await window.electron.ipcRenderer.invoke(
          'e2e-get-fingerprint',
          accountEmail
        )
        if (fpResult.success) {
          setSignalFingerprint(fpResult.fingerprint)
        }
      }

      // Check PGP
      const pgpIsSetup = await window.electron.ipcRenderer.invoke('pgp-is-setup', accountEmail)
      setPgpSetup(pgpIsSetup)
      if (pgpIsSetup) {
        const pgpResult = await window.electron.ipcRenderer.invoke('pgp-load-keys', accountEmail)
        if (pgpResult.success) {
          setPgpKeyInfo(pgpResult.keyInfo)
        }
        const pgpContactsResult = await window.electron.ipcRenderer.invoke(
          'pgp-list-contacts',
          accountEmail
        )
        if (pgpContactsResult.success) {
          setPgpContacts(
            pgpContactsResult.contacts.map((c: any) => ({
              email: c.email,
              fingerprint: c.fingerprint,
              userId: c.userId,
              importedAt: c.importedAt
            }))
          )
        }
      }

      // Check S/MIME
      const smimeIsSetup = await window.electron.ipcRenderer.invoke('smime-is-setup', accountEmail)
      setSmimeSetup(smimeIsSetup)
      if (smimeIsSetup) {
        const smimeResult = await window.electron.ipcRenderer.invoke(
          'smime-load-cert',
          accountEmail
        )
        if (smimeResult.success) {
          setSmimeCertInfo(smimeResult.certInfo)
        }
        const smimeContactsResult = await window.electron.ipcRenderer.invoke(
          'smime-list-contacts',
          accountEmail
        )
        if (smimeContactsResult.success) {
          setSmimeContacts(
            smimeContactsResult.contacts.map((c: any) => ({
              email: c.email,
              fingerprint: c.fingerprint,
              subject: c.subject,
              importedAt: c.importedAt
            }))
          )
        }
      }
    } catch (err) {
      console.error('Failed to load encryption status:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // ============ Signal Protocol Handlers ============

  const handleSignalRegister = async () => {
    setIsProcessing(true)
    setError(null)
    try {
      const result = await window.electron.ipcRenderer.invoke('e2e-register', accountEmail)
      if (result.success) {
        setSignalRegistered(true)
        setSuccess(t('encryptionSettings.signal.setupSuccess'))
        const fpResult = await window.electron.ipcRenderer.invoke(
          'e2e-get-fingerprint',
          accountEmail
        )
        if (fpResult.success) {
          setSignalFingerprint(fpResult.fingerprint)
        }
      } else {
        setError(result.error || t('encryptionSettings.signal.setupFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('encryptionSettings.errorOccurred'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSignalExport = async () => {
    setIsProcessing(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('e2e-export-key-bundle', accountEmail)
      if (result.success) {
        setExportedKey(JSON.stringify(result.keyBundle, null, 2))
        setShowExportDialog(true)
      } else {
        setError(result.error || t('encryptionSettings.signal.exportFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('encryptionSettings.errorOccurred'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSignalImport = async () => {
    if (!importEmail.trim() || !importKeyData.trim()) {
      setError(t('encryptionSettings.signal.importRequired'))
      return
    }
    setIsProcessing(true)
    try {
      const bundleData = JSON.parse(importKeyData)
      const result = await window.electron.ipcRenderer.invoke(
        'e2e-import-key-bundle',
        accountEmail,
        importEmail.trim(),
        bundleData
      )
      if (result.success) {
        setSuccess(t('encryptionSettings.signal.importSuccess', { email: importEmail }))
        setShowImportDialog(false)
        setImportEmail('')
        setImportKeyData('')
      } else {
        setError(result.error || t('encryptionSettings.signal.importFailed'))
      }
    } catch {
      setError(t('encryptionSettings.signal.importInvalidFormat'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSignalReset = async () => {
    setIsProcessing(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('e2e-clear-all', accountEmail)
      if (result.success) {
        setSignalRegistered(false)
        setSignalFingerprint(null)
        setSuccess(t('encryptionSettings.signal.resetSuccess'))
        setShowResetConfirm(false)
      } else {
        setError(result.error || t('encryptionSettings.resetFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('encryptionSettings.errorOccurred'))
    } finally {
      setIsProcessing(false)
    }
  }

  // ============ PGP Handlers ============

  const handlePGPGenerate = async () => {
    if (passphrase !== confirmPassphrase) {
      setError(t('encryptionSettings.passphrase.mismatch'))
      return
    }
    if (passphrase.length < 8) {
      setError(t('encryptionSettings.passphrase.tooShort'))
      return
    }
    setIsProcessing(true)
    setError(null)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'pgp-generate-keys',
        accountEmail,
        userName || accountEmail.split('@')[0],
        passphrase
      )
      if (result.success) {
        setPgpSetup(true)
        setPgpKeyInfo({
          fingerprint: result.keyPair.fingerprint,
          keyId: result.keyPair.keyId,
          userId: result.keyPair.userId,
          createdAt: result.keyPair.createdAt
        })
        setSuccess(t('encryptionSettings.pgp.generateSuccess'))
        setShowPassphraseDialog(false)
        setPassphrase('')
        setConfirmPassphrase('')
        setUserName('')
      } else {
        setError(result.error || t('encryptionSettings.pgp.generateFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('encryptionSettings.errorOccurred'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePGPExport = async () => {
    setIsProcessing(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('pgp-export-public-key', accountEmail)
      if (result.success) {
        setExportedKey(result.publicKey)
        setShowExportDialog(true)
      } else {
        setError(result.error || t('encryptionSettings.pgp.exportFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('encryptionSettings.errorOccurred'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePGPImport = async () => {
    if (!importEmail.trim() || !importKeyData.trim()) {
      setError(t('encryptionSettings.pgp.importRequired'))
      return
    }
    setIsProcessing(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'pgp-import-public-key',
        accountEmail,
        importEmail.trim(),
        importKeyData.trim()
      )
      if (result.success) {
        setSuccess(t('encryptionSettings.pgp.importSuccess', { email: importEmail }))
        setPgpContacts([
          ...pgpContacts,
          {
            email: importEmail.trim(),
            fingerprint: result.keyInfo.fingerprint,
            userId: result.keyInfo.userId,
            importedAt: result.keyInfo.importedAt
          }
        ])
        setShowImportDialog(false)
        setImportEmail('')
        setImportKeyData('')
      } else {
        setError(result.error || t('encryptionSettings.pgp.importFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('encryptionSettings.errorOccurred'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePGPReset = async () => {
    setIsProcessing(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('pgp-delete-keys', accountEmail)
      if (result.success) {
        setPgpSetup(false)
        setPgpKeyInfo(null)
        setPgpContacts([])
        setSuccess(t('encryptionSettings.pgp.deleteSuccess'))
        setShowResetConfirm(false)
      } else {
        setError(result.error || t('encryptionSettings.deleteFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('encryptionSettings.errorOccurred'))
    } finally {
      setIsProcessing(false)
    }
  }

  // ============ S/MIME Handlers ============

  const handleSMIMEGenerate = async () => {
    if (passphrase !== confirmPassphrase) {
      setError(t('encryptionSettings.passphrase.mismatch'))
      return
    }
    if (passphrase.length < 8) {
      setError(t('encryptionSettings.passphrase.tooShort'))
      return
    }
    setIsProcessing(true)
    setError(null)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'smime-generate-cert',
        accountEmail,
        userName || accountEmail.split('@')[0],
        passphrase,
        365
      )
      if (result.success) {
        setSmimeSetup(true)
        setSmimeCertInfo({
          fingerprint: result.certificate.fingerprint,
          subject: result.certificate.subject,
          issuer: result.certificate.issuer,
          validFrom: result.certificate.validFrom,
          validTo: result.certificate.validTo,
          email: result.certificate.email,
          createdAt: result.certificate.createdAt
        })
        setSuccess(t('encryptionSettings.smime.generateSuccess'))
        setShowPassphraseDialog(false)
        setPassphrase('')
        setConfirmPassphrase('')
        setUserName('')
      } else {
        setError(result.error || t('encryptionSettings.smime.generateFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('encryptionSettings.errorOccurred'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSMIMEExport = async () => {
    setIsProcessing(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('smime-export-cert', accountEmail)
      if (result.success) {
        setExportedKey(result.certificate)
        setShowExportDialog(true)
      } else {
        setError(result.error || t('encryptionSettings.smime.exportFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('encryptionSettings.errorOccurred'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSMIMEImport = async () => {
    if (!importEmail.trim() || !importKeyData.trim()) {
      setError(t('encryptionSettings.smime.importRequired'))
      return
    }
    setIsProcessing(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'smime-import-cert',
        accountEmail,
        importEmail.trim(),
        importKeyData.trim()
      )
      if (result.success) {
        setSuccess(t('encryptionSettings.smime.importSuccess', { email: importEmail }))
        setSmimeContacts([
          ...smimeContacts,
          {
            email: importEmail.trim(),
            fingerprint: result.certInfo.fingerprint,
            subject: result.certInfo.subject,
            importedAt: result.certInfo.importedAt
          }
        ])
        setShowImportDialog(false)
        setImportEmail('')
        setImportKeyData('')
      } else {
        setError(result.error || t('encryptionSettings.smime.importFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('encryptionSettings.errorOccurred'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSMIMEReset = async () => {
    setIsProcessing(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('smime-delete-cert', accountEmail)
      if (result.success) {
        setSmimeSetup(false)
        setSmimeCertInfo(null)
        setSmimeContacts([])
        setSuccess(t('encryptionSettings.smime.deleteSuccess'))
        setShowResetConfirm(false)
      } else {
        setError(result.error || t('encryptionSettings.deleteFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('encryptionSettings.errorOccurred'))
    } finally {
      setIsProcessing(false)
    }
  }

  // ============ Common Handlers ============

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setSuccess(t('encryptionSettings.copySuccess'))
      setTimeout(() => setSuccess(null), 2000)
    } catch {
      setError(t('encryptionSettings.copyFailed'))
    }
  }

  const deleteContact = async (email: string, type: 'pgp' | 'smime') => {
    if (!confirm(t('encryptionSettings.deleteConfirm', { email }))) return

    try {
      if (type === 'pgp') {
        await window.electron.ipcRenderer.invoke('pgp-delete-contact-key', accountEmail, email)
        setPgpContacts(pgpContacts.filter((c) => c.email !== email))
      } else {
        await window.electron.ipcRenderer.invoke('smime-delete-contact-cert', accountEmail, email)
        setSmimeContacts(smimeContacts.filter((c) => c.email !== email))
      }
      setSuccess(t('encryptionSettings.contactDeleted'))
    } catch (err) {
      setError(t('encryptionSettings.deleteFailed'))
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t('encryptionSettings.loading')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{t('encryptionSettings.title')}</h2>
      </div>

      {/* 내용 */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-4">
          {/* 오류/성공 메시지 */}
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

          {success && (
            <div className="flex items-center gap-2 rounded-md border border-green-500 bg-green-50 p-3 text-green-700">
              <Check className="h-4 w-4" />
              <span className="text-sm">{success}</span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-6 w-6 text-green-700"
                onClick={() => setSuccess(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* 탭 */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EncryptionTab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="signal" className="gap-2">
                <Shield className="h-4 w-4" />
                Signal
              </TabsTrigger>
              <TabsTrigger value="pgp" className="gap-2">
                <Key className="h-4 w-4" />
                PGP
              </TabsTrigger>
              <TabsTrigger value="smime" className="gap-2">
                <FileKey className="h-4 w-4" />
                S/MIME
              </TabsTrigger>
            </TabsList>

            {/* Signal Protocol Tab */}
            <TabsContent value="signal" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {signalRegistered ? (
                        <ShieldCheck className="h-6 w-6 text-green-500" />
                      ) : (
                        <Shield className="h-6 w-6 text-muted-foreground" />
                      )}
                      <div>
                        <CardTitle className="text-base">
                          {t('encryptionSettings.signal.title')}
                        </CardTitle>
                        <CardDescription>{t('encryptionSettings.signal.desc')}</CardDescription>
                      </div>
                    </div>
                    {signalRegistered && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveTab('signal')
                          setShowResetConfirm(true)
                        }}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        {t('encryptionSettings.common.reset')}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!signalRegistered ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground mb-4">
                        {t('encryptionSettings.signal.info')}
                      </p>
                      <Button onClick={handleSignalRegister} disabled={isProcessing}>
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Key className="h-4 w-4 mr-2" />
                        )}
                        {t('encryptionSettings.common.register')}
                      </Button>
                    </div>
                  ) : (
                    <>
                      {signalFingerprint && (
                        <div className="space-y-2">
                          <Label>{t('encryptionSettings.signal.fingerprint')}</Label>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 rounded-md bg-muted p-2 text-xs font-mono">
                              {signalFingerprint}
                            </code>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => copyToClipboard(signalFingerprint)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={handleSignalExport}
                          disabled={isProcessing}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {t('encryptionSettings.signal.exportButton')}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setActiveTab('signal')
                            setShowImportDialog(true)
                          }}
                          disabled={isProcessing}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {t('encryptionSettings.signal.importButton')}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* PGP Tab */}
            <TabsContent value="pgp" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {pgpSetup ? (
                        <ShieldCheck className="h-6 w-6 text-green-500" />
                      ) : (
                        <Key className="h-6 w-6 text-muted-foreground" />
                      )}
                      <div>
                        <CardTitle className="text-base">
                          {t('encryptionSettings.pgp.title')}
                        </CardTitle>
                        <CardDescription>{t('encryptionSettings.pgp.desc')}</CardDescription>
                      </div>
                    </div>
                    {pgpSetup && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveTab('pgp')
                          setShowResetConfirm(true)
                        }}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        {t('encryptionSettings.common.reset')}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!pgpSetup ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground mb-4">
                        {t('encryptionSettings.pgp.info')}
                      </p>
                      <Button
                        onClick={() => {
                          setPassphraseAction('generate')
                          setActiveTab('pgp')
                          setShowPassphraseDialog(true)
                        }}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Key className="h-4 w-4 mr-2" />
                        )}
                        {t('encryptionSettings.pgp.generateButton')}
                      </Button>
                    </div>
                  ) : (
                    <>
                      {pgpKeyInfo && (
                        <div className="space-y-2">
                          <Label>{t('encryptionSettings.pgp.keyInfo')}</Label>
                          <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                            <p>
                              <span className="text-muted-foreground">Key ID:</span>{' '}
                              {pgpKeyInfo.keyId}
                            </p>
                            <p>
                              <span className="text-muted-foreground">
                                {t('encryptionSettings.pgp.fingerprintLabel')}:
                              </span>{' '}
                              {pgpKeyInfo.fingerprint.slice(0, 20)}...
                            </p>
                            <p>
                              <span className="text-muted-foreground">
                                {t('encryptionSettings.pgp.userLabel')}:
                              </span>{' '}
                              {pgpKeyInfo.userId}
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={handlePGPExport} disabled={isProcessing}>
                          <Download className="h-4 w-4 mr-2" />
                          {t('encryptionSettings.pgp.exportButton')}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setActiveTab('pgp')
                            setShowImportDialog(true)
                          }}
                          disabled={isProcessing}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {t('encryptionSettings.pgp.importButton')}
                        </Button>
                      </div>

                      {pgpContacts.length > 0 && (
                        <div className="space-y-2">
                          <Label>
                            {t('encryptionSettings.pgp.registeredContacts')} ({pgpContacts.length})
                          </Label>
                          <div className="space-y-2">
                            {pgpContacts.map((contact) => (
                              <div
                                key={contact.email}
                                className="flex items-center justify-between rounded-md border p-2 text-sm"
                              >
                                <div>
                                  <p className="font-medium">{contact.email}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {contact.fingerprint.slice(0, 16)}...
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => deleteContact(contact.email, 'pgp')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* S/MIME Tab */}
            <TabsContent value="smime" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {smimeSetup ? (
                        <ShieldCheck className="h-6 w-6 text-green-500" />
                      ) : (
                        <FileKey className="h-6 w-6 text-muted-foreground" />
                      )}
                      <div>
                        <CardTitle className="text-base">
                          {t('encryptionSettings.smime.title')}
                        </CardTitle>
                        <CardDescription>{t('encryptionSettings.smime.desc')}</CardDescription>
                      </div>
                    </div>
                    {smimeSetup && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveTab('smime')
                          setShowResetConfirm(true)
                        }}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        {t('encryptionSettings.common.reset')}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!smimeSetup ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground mb-4">
                        {t('encryptionSettings.smime.info')}
                      </p>
                      <Button
                        onClick={() => {
                          setPassphraseAction('generate')
                          setActiveTab('smime')
                          setShowPassphraseDialog(true)
                        }}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <FileKey className="h-4 w-4 mr-2" />
                        )}
                        {t('encryptionSettings.smime.generateButton')}
                      </Button>
                    </div>
                  ) : (
                    <>
                      {smimeCertInfo && (
                        <div className="space-y-2">
                          <Label>{t('encryptionSettings.smime.certInfo')}</Label>
                          <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                            <p>
                              <span className="text-muted-foreground">
                                {t('encryptionSettings.smime.subjectLabel')}:
                              </span>{' '}
                              {smimeCertInfo.subject}
                            </p>
                            <p>
                              <span className="text-muted-foreground">
                                {t('encryptionSettings.smime.issuerLabel')}:
                              </span>{' '}
                              {smimeCertInfo.issuer}
                            </p>
                            <p>
                              <span className="text-muted-foreground">
                                {t('encryptionSettings.smime.validityLabel')}:
                              </span>{' '}
                              {new Date(smimeCertInfo.validFrom).toLocaleDateString()} ~{' '}
                              {new Date(smimeCertInfo.validTo).toLocaleDateString()}
                            </p>
                            <p>
                              <span className="text-muted-foreground">
                                {t('encryptionSettings.smime.fingerprintLabel')}:
                              </span>{' '}
                              {smimeCertInfo.fingerprint.slice(0, 20)}...
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={handleSMIMEExport}
                          disabled={isProcessing}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {t('encryptionSettings.smime.exportButton')}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setActiveTab('smime')
                            setShowImportDialog(true)
                          }}
                          disabled={isProcessing}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {t('encryptionSettings.smime.importButton')}
                        </Button>
                      </div>

                      {smimeContacts.length > 0 && (
                        <div className="space-y-2">
                          <Label>
                            {t('encryptionSettings.smime.registeredContacts')} (
                            {smimeContacts.length})
                          </Label>
                          <div className="space-y-2">
                            {smimeContacts.map((contact) => (
                              <div
                                key={contact.email}
                                className="flex items-center justify-between rounded-md border p-2 text-sm"
                              >
                                <div>
                                  <p className="font-medium">{contact.email}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {contact.subject || contact.fingerprint.slice(0, 16) + '...'}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => deleteContact(contact.email, 'smime')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* 비교 카드 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t('encryptionSettings.comparison.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4">
                        {t('encryptionSettings.comparison.item')}
                      </th>
                      <th className="text-center py-2 px-2">Signal</th>
                      <th className="text-center py-2 px-2">PGP</th>
                      <th className="text-center py-2 px-2">S/MIME</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b">
                      <td className="py-2 pr-4">
                        {t('encryptionSettings.comparison.compatibility')}
                      </td>
                      <td className="text-center py-2 px-2">
                        {t('encryptionSettings.comparison.nmailOnly')}
                      </td>
                      <td className="text-center py-2 px-2">
                        {t('encryptionSettings.comparison.high')}
                      </td>
                      <td className="text-center py-2 px-2">
                        {t('encryptionSettings.comparison.high')}
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4">{t('encryptionSettings.comparison.difficulty')}</td>
                      <td className="text-center py-2 px-2">
                        {t('encryptionSettings.comparison.easy')}
                      </td>
                      <td className="text-center py-2 px-2">
                        {t('encryptionSettings.comparison.medium')}
                      </td>
                      <td className="text-center py-2 px-2">
                        {t('encryptionSettings.comparison.medium')}
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4">
                        {t('encryptionSettings.comparison.keyManagement')}
                      </td>
                      <td className="text-center py-2 px-2">
                        {t('encryptionSettings.comparison.auto')}
                      </td>
                      <td className="text-center py-2 px-2">
                        {t('encryptionSettings.comparison.manual')}
                      </td>
                      <td className="text-center py-2 px-2">
                        {t('encryptionSettings.comparison.certificate')}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4">
                        {t('encryptionSettings.comparison.targetUsers')}
                      </td>
                      <td className="text-center py-2 px-2">nmail</td>
                      <td className="text-center py-2 px-2">
                        {t('encryptionSettings.comparison.allPGP')}
                      </td>
                      <td className="text-center py-2 px-2">
                        {t('encryptionSettings.comparison.enterprise')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Passphrase Dialog */}
      <Dialog open={showPassphraseDialog} onOpenChange={setShowPassphraseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('encryptionSettings.passphrase.dialogTitle', {
                type: activeTab === 'pgp' ? 'PGP' : 'S/MIME'
              })}
            </DialogTitle>
            <DialogDescription>{t('encryptionSettings.passphrase.dialogDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('encryptionSettings.passphrase.nameLabel')}</Label>
              <Input
                placeholder={accountEmail.split('@')[0]}
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('encryptionSettings.passphrase.passwordLabel')}</Label>
              <Input
                type="password"
                placeholder={t('encryptionSettings.passphrase.passwordPlaceholder')}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('encryptionSettings.passphrase.confirmLabel')}</Label>
              <Input
                type="password"
                placeholder={t('encryptionSettings.passphrase.confirmPlaceholder')}
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPassphraseDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={activeTab === 'pgp' ? handlePGPGenerate : handleSMIMEGenerate}
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t('encryptionSettings.common.generate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {activeTab === 'signal'
                ? t('encryptionSettings.signal.importDialogTitle')
                : activeTab === 'pgp'
                  ? t('encryptionSettings.pgp.importDialogTitle')
                  : t('encryptionSettings.smime.importDialogTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('encryptionSettings.common.partnerKeyDesc', {
                type:
                  activeTab === 'signal'
                    ? t('encryptionSettings.signal.keyBundleLabel')
                    : activeTab === 'pgp'
                      ? t('encryptionSettings.pgp.publicKeyLabel')
                      : t('encryptionSettings.smime.certLabel')
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('encryptionSettings.common.emailLabel')}</Label>
              <Input
                type="email"
                placeholder="example@email.com"
                value={importEmail}
                onChange={(e) => setImportEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>
                {activeTab === 'signal'
                  ? t('encryptionSettings.signal.keyBundleLabel')
                  : activeTab === 'pgp'
                    ? t('encryptionSettings.pgp.publicKeyLabel')
                    : t('encryptionSettings.smime.certLabel')}
              </Label>
              <Textarea
                className="font-mono text-xs h-48"
                placeholder={
                  activeTab === 'pgp'
                    ? '-----BEGIN PGP PUBLIC KEY BLOCK-----\n...'
                    : activeTab === 'smime'
                      ? '-----BEGIN CERTIFICATE-----\n...'
                      : '{"registrationId":...}'
                }
                value={importKeyData}
                onChange={(e) => setImportKeyData(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={
                activeTab === 'signal'
                  ? handleSignalImport
                  : activeTab === 'pgp'
                    ? handlePGPImport
                    : handleSMIMEImport
              }
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t('encryptionSettings.common.import')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {activeTab === 'signal'
                ? t('encryptionSettings.signal.exportDialogTitle')
                : activeTab === 'pgp'
                  ? t('encryptionSettings.pgp.exportDialogTitle')
                  : t('encryptionSettings.smime.exportDialogTitle')}
            </DialogTitle>
            <DialogDescription>{t('encryptionSettings.common.exportDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea readOnly className="font-mono text-xs h-64" value={exportedKey} />
            <Button className="w-full" onClick={() => copyToClipboard(exportedKey)}>
              <Copy className="h-4 w-4 mr-2" />
              {t('encryptionSettings.common.copyToClipboard')}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirm Dialog */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {activeTab === 'signal'
                ? t('encryptionSettings.signal.resetDialogTitle')
                : activeTab === 'pgp'
                  ? t('encryptionSettings.pgp.resetDialogTitle')
                  : t('encryptionSettings.smime.resetDialogTitle')}
            </DialogTitle>
            <DialogDescription>{t('encryptionSettings.resetConfirm.desc')}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-medium">{t('encryptionSettings.resetConfirm.warning')}</p>
            <ul className="list-disc list-inside mt-2">
              <li>{t('encryptionSettings.resetConfirm.warn1')}</li>
              <li>{t('encryptionSettings.resetConfirm.warn2')}</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={
                activeTab === 'signal'
                  ? handleSignalReset
                  : activeTab === 'pgp'
                    ? handlePGPReset
                    : handleSMIMEReset
              }
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t('encryptionSettings.common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
