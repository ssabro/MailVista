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
import { Label } from './ui/label'
import {
  Cloud,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  Link,
  HardDrive,
  ExternalLink
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'

interface LargeFile {
  id: string
  name: string
  path: string
  size: number
  type: string
}

type UploadErrorCode =
  | 'FILE_TOO_LARGE'
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'NETWORK_ERROR'
  | 'AUTH_REQUIRED'
  | 'UNKNOWN_ERROR'

interface UploadResult {
  fileId: string
  success: boolean
  provider: string
  fileName: string
  fileSize: number
  shareUrl?: string
  error?: string
  errorCode?: UploadErrorCode
  maxFileSize?: number
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
type ProviderType = 'google-drive' | 'transfer-sh'

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
  const [selectedProvider, setSelectedProvider] = React.useState<ProviderType>('transfer-sh')
  const [canUseGoogleDrive, setCanUseGoogleDrive] = React.useState(false)
  const [uploadStates, setUploadStates] = React.useState<Map<string, FileUploadState>>(new Map())
  const [isUploading, setIsUploading] = React.useState(false)

  // 다이얼로그가 열릴 때 상태 초기화
  React.useEffect(() => {
    if (isOpen) {
      // 새로운 파일로 다이얼로그가 열리면 업로드 상태 초기화
      setUploadStates(new Map())
      setIsUploading(false)
    }
  }, [isOpen, files])

  // Gmail OAuth로 Google Drive 사용 가능 여부 확인
  React.useEffect(() => {
    if (isOpen && accountEmail) {
      checkGoogleDriveAvailability()
    }
  }, [isOpen, accountEmail])

  const checkGoogleDriveAvailability = async () => {
    try {
      const canUse = await window.electron.ipcRenderer.invoke(
        'can-use-google-drive',
        accountEmail
      )
      setCanUseGoogleDrive(canUse)
      // Gmail OAuth 계정이면 기본으로 Google Drive 선택
      if (canUse) {
        setSelectedProvider('google-drive')
      } else {
        setSelectedProvider('transfer-sh')
      }
    } catch (error) {
      console.error('Failed to check Google Drive availability:', error)
      setCanUseGoogleDrive(false)
      setSelectedProvider('transfer-sh')
    }
  }

  const getProviderName = (p: ProviderType): string => {
    switch (p) {
      case 'google-drive':
        return 'Google Drive'
      case 'transfer-sh':
        return 'Transfer.sh'
      default:
        return p
    }
  }

  const getProviderIcon = (p: ProviderType) => {
    switch (p) {
      case 'google-drive':
        return <HardDrive className="h-5 w-5 text-blue-500" />
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

  const getErrorMessage = (result: UploadResult): string => {
    const providerName = result.provider === 'google-drive' ? 'Google Drive' : 'Transfer.sh'

    switch (result.errorCode) {
      case 'FILE_TOO_LARGE':
        const maxSize = result.maxFileSize ? formatFileSize(result.maxFileSize) : '512 MB'
        return t('largeFile.error.fileTooLarge', {
          defaultValue: `파일이 너무 큽니다. ${providerName}은(는) 최대 ${maxSize}까지 업로드할 수 있습니다.`,
          provider: providerName,
          maxSize
        })
      case 'PERMISSION_DENIED':
        return t('largeFile.error.permissionDenied', {
          defaultValue: `${providerName} 접근 권한이 없습니다. 계정을 다시 연결해주세요.`,
          provider: providerName
        })
      case 'AUTH_REQUIRED':
        return t('largeFile.error.authRequired', {
          defaultValue: `${providerName} 인증이 필요합니다. 계정을 다시 연결해주세요.`,
          provider: providerName
        })
      case 'FILE_NOT_FOUND':
        return t('largeFile.error.fileNotFound', {
          defaultValue: '파일을 찾을 수 없습니다.'
        })
      case 'NETWORK_ERROR':
        return t('largeFile.error.networkError', {
          defaultValue: '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.'
        })
      default:
        return result.error || t('largeFile.error.unknown', { defaultValue: '업로드 중 오류가 발생했습니다.' })
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
          file.name,
          selectedProvider
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
          provider: selectedProvider,
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
  const allUploaded =
    uploadStates.size > 0 &&
    Array.from(uploadStates.values()).every((s) => s.status === 'success' || s.status === 'error')

  const successCount = Array.from(uploadStates.values()).filter(
    (s) => s.status === 'success'
  ).length

  const errorCount = Array.from(uploadStates.values()).filter(
    (s) => s.status === 'error'
  ).length

  // 에러가 있을 때는 외부 클릭으로 닫히지 않도록
  const handleOpenChange = (open: boolean) => {
    if (!open && errorCount > 0) {
      // 에러가 있으면 명시적 닫기 버튼만 허용
      return
    }
    if (!open) {
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {errorCount > 0 && allUploaded ? (
              <AlertCircle className="h-5 w-5 text-red-500" />
            ) : (
              <Cloud className="h-5 w-5" />
            )}
            {errorCount > 0 && allUploaded
              ? t('largeFile.uploadError', { defaultValue: '업로드 오류' })
              : t('largeFile.title')}
          </DialogTitle>
          <DialogDescription>
            {errorCount > 0 && allUploaded
              ? t('largeFile.errorDescription', { defaultValue: '아래 오류 내용을 확인해주세요.' })
              : t('largeFile.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 에러 표시 (상단에 눈에 띄게) */}
          {allUploaded && errorCount > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800">
                    {successCount === 0
                      ? t('largeFile.allUploadsFailed', { defaultValue: '업로드에 실패했습니다' })
                      : t('largeFile.someUploadsFailed', {
                          defaultValue: `${errorCount}개 파일 업로드에 실패했습니다`,
                          count: errorCount
                        })}
                  </p>
                  {Array.from(uploadStates.values())
                    .filter((s) => s.status === 'error' && s.result)
                    .map((s) => (
                      <div key={s.fileId} className="mt-2 p-2 bg-red-100 rounded text-sm">
                        <p className="font-medium text-red-900">{s.result?.fileName}</p>
                        <p className="text-red-700 mt-1">{getErrorMessage(s.result!)}</p>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* 클라우드 서비스 선택 */}
          {!isUploading && !allUploaded && (
            <div className="space-y-2">
              <Label>{t('largeFile.selectService') || '업로드 서비스 선택'}</Label>
              <div className="flex gap-2">
                {/* Google Drive 옵션 (Gmail OAuth 계정만) */}
                {canUseGoogleDrive && (
                  <Button
                    variant={selectedProvider === 'google-drive' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedProvider('google-drive')}
                    className="flex-1"
                  >
                    <HardDrive className="h-4 w-4 mr-2" />
                    Google Drive
                  </Button>
                )}
                {/* Transfer.sh 옵션 (항상 사용 가능) */}
                <Button
                  variant={selectedProvider === 'transfer-sh' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedProvider('transfer-sh')}
                  className="flex-1"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Transfer.sh
                </Button>
              </div>
            </div>
          )}

          {/* 선택된 서비스 정보 */}
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              {getProviderIcon(selectedProvider)}
              <div>
                <p className="font-medium">{getProviderName(selectedProvider)}</p>
                {selectedProvider === 'google-drive' && (
                  <p className="text-xs text-muted-foreground">{accountEmail}</p>
                )}
              </div>
              <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />
            </div>

            {selectedProvider === 'transfer-sh' && (
              <p className="text-xs text-muted-foreground mt-2">{t('largeFile.transferShNote')}</p>
            )}
            {selectedProvider === 'google-drive' && (
              <p className="text-xs text-muted-foreground mt-2">
                {t('largeFile.googleDriveNote') || 'Gmail 계정의 Google Drive에 업로드됩니다.'}
              </p>
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
              {selectedProvider === 'transfer-sh' && (
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
              <Button onClick={handleUpload} disabled={isUploading}>
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
    </Dialog>
  )
}
