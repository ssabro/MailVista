import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Cloud,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  Link,
  HardDrive,
  ExternalLink,
  Settings
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'

interface LargeFile {
  id: string
  name: string
  path: string
  size: number
  type: string
}

interface UploadResult {
  fileId: string
  success: boolean
  provider: string
  fileName: string
  fileSize: number
  shareUrl?: string
  error?: string
  expiresAt?: string
}

interface LargeFileUploadDialogProps {
  isOpen: boolean
  onClose: () => void
  files: LargeFile[]
  accountEmail: string
  onUploadComplete: (results: UploadResult[]) => void
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

interface FileUploadState {
  fileId: string
  status: UploadStatus
  progress: number
  result?: UploadResult
}

export function LargeFileUploadDialog({
  isOpen,
  onClose,
  files,
  accountEmail,
  onUploadComplete
}: LargeFileUploadDialogProps) {
  const { t } = useTranslation()
  const [provider, setProvider] = React.useState<string>('auto')
  const [isConnected, setIsConnected] = React.useState(false)
  const [connectedEmail, setConnectedEmail] = React.useState<string>('')
  const [uploadStates, setUploadStates] = React.useState<Map<string, FileUploadState>>(new Map())
  const [isUploading, setIsUploading] = React.useState(false)
  const [showGoogleSetup, setShowGoogleSetup] = React.useState(false)
  const [googleClientId, setGoogleClientId] = React.useState('')
  const [googleClientSecret, setGoogleClientSecret] = React.useState('')
  const [isConnecting, setIsConnecting] = React.useState(false)

  // 계정에 맞는 클라우드 서비스 감지
  React.useEffect(() => {
    if (isOpen && accountEmail) {
      detectProvider()
    }
  }, [isOpen, accountEmail])

  const detectProvider = async () => {
    try {
      const detected = await window.electron.ipcRenderer.invoke(
        'detect-cloud-provider',
        accountEmail
      )
      setProvider(detected)

      // 연결 상태 확인
      if (detected !== 'transfer-sh') {
        const connected = await window.electron.ipcRenderer.invoke(
          'is-cloud-provider-connected',
          detected
        )
        setIsConnected(connected)

        if (connected) {
          const creds = await window.electron.ipcRenderer.invoke('get-cloud-credentials', detected)
          if (creds.email) {
            setConnectedEmail(creds.email)
          }
        }
      } else {
        setIsConnected(true) // Transfer.sh는 항상 사용 가능
      }
    } catch (error) {
      console.error('Failed to detect provider:', error)
      setProvider('transfer-sh')
      setIsConnected(true)
    }
  }

  const getProviderName = (p: string): string => {
    switch (p) {
      case 'google-drive':
        return 'Google Drive'
      case 'onedrive':
        return 'OneDrive'
      case 'naver-cloud':
        return t('largeFile.naverCloud')
      case 'transfer-sh':
        return 'Transfer.sh'
      default:
        return p
    }
  }

  const getProviderIcon = (p: string) => {
    switch (p) {
      case 'google-drive':
        return <HardDrive className="h-5 w-5 text-blue-500" />
      case 'onedrive':
        return <Cloud className="h-5 w-5 text-blue-600" />
      case 'transfer-sh':
        return <Upload className="h-5 w-5 text-green-500" />
      default:
        return <Cloud className="h-5 w-5" />
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  const handleConnectGoogleDrive = async () => {
    if (!googleClientId || !googleClientSecret) return

    setIsConnecting(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'connect-google-drive',
        googleClientId,
        googleClientSecret
      )

      if (result.success) {
        setIsConnected(true)
        setShowGoogleSetup(false)
        await detectProvider() // 연결 후 다시 상태 확인
      } else {
        alert(result.error || t('largeFile.connectionFailed'))
      }
    } catch (error) {
      console.error('Failed to connect:', error)
      alert(t('largeFile.connectionFailed'))
    } finally {
      setIsConnecting(false)
    }
  }

  const handleUpload = async () => {
    setIsUploading(true)

    // 초기 상태 설정
    const initialStates = new Map<string, FileUploadState>()
    files.forEach((file) => {
      initialStates.set(file.id, { fileId: file.id, status: 'idle', progress: 0 })
    })
    setUploadStates(initialStates)

    const results: UploadResult[] = []

    for (const file of files) {
      // 업로드 시작
      setUploadStates((prev) => {
        const next = new Map(prev)
        next.set(file.id, { fileId: file.id, status: 'uploading', progress: 50 })
        return next
      })

      try {
        const result = await window.electron.ipcRenderer.invoke(
          'upload-large-file',
          file.path,
          accountEmail,
          file.name
        )

        const uploadResult: UploadResult = {
          fileId: file.id,
          ...result
        }

        results.push(uploadResult)

        setUploadStates((prev) => {
          const next = new Map(prev)
          next.set(file.id, {
            fileId: file.id,
            status: result.success ? 'success' : 'error',
            progress: 100,
            result: uploadResult
          })
          return next
        })
      } catch (error) {
        const errorResult: UploadResult = {
          fileId: file.id,
          success: false,
          provider: provider,
          fileName: file.name,
          fileSize: file.size,
          error: error instanceof Error ? error.message : 'Upload failed'
        }

        results.push(errorResult)

        setUploadStates((prev) => {
          const next = new Map(prev)
          next.set(file.id, {
            fileId: file.id,
            status: 'error',
            progress: 100,
            result: errorResult
          })
          return next
        })
      }
    }

    setIsUploading(false)
    onUploadComplete(results)
  }

  // 업로드가 시작되었고 모든 파일이 완료되었는지 확인
  // uploadStates.size > 0 조건 추가: 빈 배열의 every()는 true를 반환하기 때문
  const allUploaded =
    uploadStates.size > 0 &&
    Array.from(uploadStates.values()).every((s) => s.status === 'success' || s.status === 'error')

  const successCount = Array.from(uploadStates.values()).filter(
    (s) => s.status === 'success'
  ).length

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            {t('largeFile.title')}
          </DialogTitle>
          <DialogDescription>{t('largeFile.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 클라우드 서비스 정보 */}
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getProviderIcon(provider)}
                <div>
                  <p className="font-medium">{getProviderName(provider)}</p>
                  {provider !== 'transfer-sh' && isConnected && connectedEmail && (
                    <p className="text-xs text-muted-foreground">{connectedEmail}</p>
                  )}
                </div>
              </div>

              {provider === 'google-drive' && !isConnected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGoogleSetup(true)}
                  className="text-xs"
                >
                  <Settings className="h-3 w-3 mr-1" />
                  {t('largeFile.connect')}
                </Button>
              )}

              {isConnected && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {t('largeFile.connected')}
                </span>
              )}
            </div>

            {provider === 'transfer-sh' && (
              <p className="text-xs text-muted-foreground mt-2">{t('largeFile.transferShNote')}</p>
            )}
          </div>

          {/* 파일 목록 */}
          <div className="space-y-2">
            <Label>{t('largeFile.files')}</Label>
            <div className="max-h-48 overflow-auto space-y-2">
              {files.map((file) => {
                const state = uploadStates.get(file.id)
                return (
                  <div
                    key={file.id}
                    className={cn(
                      'flex items-center justify-between p-2 rounded border',
                      state?.status === 'success' && 'bg-green-50 border-green-200',
                      state?.status === 'error' && 'bg-red-50 border-red-200'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>

                    <div className="ml-2">
                      {state?.status === 'uploading' && (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      )}
                      {state?.status === 'success' && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {state?.status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 업로드 결과 링크 */}
          {allUploaded && successCount > 0 && (
            <div className="p-3 bg-green-50 rounded-lg space-y-2">
              <p className="text-sm font-medium text-green-800 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                {t('largeFile.uploadComplete', { count: successCount })}
              </p>
              {Array.from(uploadStates.values())
                .filter((s) => s.status === 'success' && s.result?.shareUrl)
                .map((s) => (
                  <div key={s.fileId} className="flex items-center gap-2 text-xs">
                    <Link className="h-3 w-3 text-blue-600" />
                    <a
                      href={s.result!.shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex-1 truncate"
                    >
                      {s.result!.shareUrl}
                    </a>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </div>
                ))}
              {provider === 'transfer-sh' && (
                <p className="text-xs text-muted-foreground">{t('largeFile.expiresIn14Days')}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!allUploaded ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={isUploading}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleUpload} disabled={isUploading || !isConnected}>
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('largeFile.uploading')}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    {t('largeFile.upload')}
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>{t('common.close')}</Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Google Drive 설정 다이얼로그 */}
      <Dialog open={showGoogleSetup} onOpenChange={setShowGoogleSetup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('largeFile.googleDriveSetup')}</DialogTitle>
            <DialogDescription>{t('largeFile.googleDriveSetupDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clientId">{t('largeFile.clientId')}</Label>
              <Input
                id="clientId"
                value={googleClientId}
                onChange={(e) => setGoogleClientId(e.target.value)}
                placeholder="xxxxxxxxx.apps.googleusercontent.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientSecret">{t('largeFile.clientSecret')}</Label>
              <Input
                id="clientSecret"
                type="password"
                value={googleClientSecret}
                onChange={(e) => setGoogleClientSecret(e.target.value)}
                placeholder="GOCSPX-xxxxxxxxx"
              />
            </div>

            <div className="p-3 bg-muted rounded-lg text-xs space-y-1">
              <p className="font-medium">{t('largeFile.howToGetCredentials')}</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>{t('largeFile.step1')}</li>
                <li>{t('largeFile.step2')}</li>
                <li>{t('largeFile.step3')}</li>
                <li>{t('largeFile.step4')}</li>
              </ol>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGoogleSetup(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleConnectGoogleDrive}
              disabled={!googleClientId || !googleClientSecret || isConnecting}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('largeFile.connecting')}
                </>
              ) : (
                t('largeFile.connect')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
