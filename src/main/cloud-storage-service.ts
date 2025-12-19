import * as fs from 'fs'
import * as path from 'path'
import { logger, LogCategory } from './logger'
import {
  getCloudStorageSettings as getSettings,
  updateCloudStorageSettings as updateSettings,
  getCloudCredentials as getCredentials,
  saveCloudCredentials as saveCredentials,
  removeCloudCredentials as removeCredentials,
  isCloudProviderConnected as isConnected,
  type CloudProvider,
  type CloudCredentials,
  type CloudStorageSettings
} from './settings/unified-config'
import {
  getOAuthTokens,
  isOAuthAccount,
  getXOAuth2Token
} from './oauth-service'

// Re-export types
export type { CloudProvider, CloudCredentials, CloudStorageSettings }

// =====================================================
// 타입 정의
// =====================================================

export interface UploadResult {
  success: boolean
  provider: CloudProvider
  fileName: string
  fileSize: number
  shareUrl?: string
  error?: string
  expiresAt?: string // For temporary services like Transfer.sh
}

// =====================================================
// 스토어 - unified-config 사용
// =====================================================

// =====================================================
// 유틸리티 함수
// =====================================================

/**
 * 이메일 주소에서 적합한 클라우드 서비스 결정
 */
export function detectCloudProvider(email: string): CloudProvider {
  const domain = email.toLowerCase().split('@')[1]

  if (!domain) return 'transfer-sh'

  // Gmail -> Google Drive
  if (domain === 'gmail.com' || domain.endsWith('.google.com')) {
    return 'google-drive'
  }

  // Outlook/Hotmail -> OneDrive
  if (
    domain === 'outlook.com' ||
    domain === 'hotmail.com' ||
    domain === 'live.com' ||
    domain.endsWith('.outlook.com')
  ) {
    return 'onedrive'
  }

  // Naver -> Naver Cloud (추후 구현)
  if (domain === 'naver.com') {
    return 'transfer-sh' // 네이버 클라우드는 추후 구현, 현재는 대체 서비스 사용
  }

  // 기타 -> Transfer.sh (무료 대체 서비스)
  return 'transfer-sh'
}

/**
 * 파일 크기를 사람이 읽기 쉬운 형식으로 변환
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * 대용량 첨부가 필요한지 확인
 */
export function needsCloudUpload(fileSizeBytes: number): boolean {
  const settings = getCloudStorageSettings()
  const thresholdBytes = settings.fileSizeThreshold * 1024 * 1024
  return fileSizeBytes >= thresholdBytes
}

// =====================================================
// 설정 관리 (unified-config 위임)
// =====================================================

export function getCloudStorageSettings(): CloudStorageSettings {
  return getSettings()
}

export function updateCloudStorageSettings(
  updates: Partial<CloudStorageSettings>
): CloudStorageSettings {
  const updated = updateSettings(updates)
  logger.info(LogCategory.APP, 'Cloud storage settings updated', updates)
  return updated
}

export function getCloudCredentials(provider: CloudProvider): CloudCredentials | undefined {
  return getCredentials(provider)
}

export function saveCloudCredentials(provider: CloudProvider, credentials: CloudCredentials): void {
  saveCredentials(provider, credentials)
  logger.info(LogCategory.APP, 'Cloud credentials saved', { provider })
}

export function removeCloudCredentials(provider: CloudProvider): void {
  removeCredentials(provider)
  logger.info(LogCategory.APP, 'Cloud credentials removed', { provider })
}

export function isCloudProviderConnected(provider: CloudProvider): boolean {
  return isConnected(provider)
}

// =====================================================
// 파일 업로드 서비스 (무료 대체 서비스)
// =====================================================

// 0x0.st에 업로드 (대체 서비스 1)
async function uploadTo0x0(
  fileBuffer: Buffer,
  fileName: string,
  fileSize: number
): Promise<UploadResult> {
  logger.info(LogCategory.EXPORT, 'Trying 0x0.st upload', { fileName })

  const FormData = (await import('form-data')).default
  const formData = new FormData()
  formData.append('file', fileBuffer, { filename: fileName })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 300000)

  try {
    const response = await fetch('https://0x0.st', {
      method: 'POST',
      body: formData as unknown as BodyInit,
      headers: formData.getHeaders(),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    logger.info(LogCategory.EXPORT, '0x0.st response', {
      status: response.status,
      statusText: response.statusText
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`0x0.st failed: ${response.status} - ${body}`)
    }

    const shareUrl = (await response.text()).trim()

    // 0x0.st는 만료 기간이 파일 크기에 따라 다름 (최소 30일)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    return {
      success: true,
      provider: 'transfer-sh', // UI 호환성을 위해 동일한 provider 사용
      fileName,
      fileSize,
      shareUrl,
      expiresAt: expiresAt.toISOString()
    }
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

// file.io에 업로드 (대체 서비스 2)
async function uploadToFileIo(
  fileBuffer: Buffer,
  fileName: string,
  fileSize: number
): Promise<UploadResult> {
  logger.info(LogCategory.EXPORT, 'Trying file.io upload', { fileName })

  const FormData = (await import('form-data')).default
  const formData = new FormData()
  formData.append('file', fileBuffer, { filename: fileName })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 300000)

  try {
    const response = await fetch('https://file.io/?expires=14d', {
      method: 'POST',
      body: formData as unknown as BodyInit,
      headers: formData.getHeaders(),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    logger.info(LogCategory.EXPORT, 'file.io response', {
      status: response.status,
      statusText: response.statusText
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`file.io failed: ${response.status} - ${body}`)
    }

    const data = await response.json()

    if (!data.success) {
      throw new Error(`file.io failed: ${data.message || 'Unknown error'}`)
    }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 14)

    return {
      success: true,
      provider: 'transfer-sh',
      fileName,
      fileSize,
      shareUrl: data.link,
      expiresAt: expiresAt.toISOString()
    }
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

// Transfer.sh에 업로드 (원래 서비스)
async function uploadToTransferShDirect(
  fileBuffer: Buffer,
  fileName: string,
  fileSize: number
): Promise<UploadResult> {
  logger.info(LogCategory.EXPORT, 'Trying Transfer.sh upload', { fileName })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 300000)

  try {
    const uploadUrl = `https://transfer.sh/${encodeURIComponent(fileName)}`

    // Buffer를 Uint8Array로 변환 (fetch 호환성)
    const bodyData = new Uint8Array(fileBuffer)

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: bodyData,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Max-Days': '14'
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    logger.info(LogCategory.EXPORT, 'Transfer.sh response', {
      status: response.status,
      statusText: response.statusText
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Transfer.sh failed: ${response.status} - ${body}`)
    }

    const shareUrl = (await response.text()).trim()

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 14)

    return {
      success: true,
      provider: 'transfer-sh',
      fileName,
      fileSize,
      shareUrl,
      expiresAt: expiresAt.toISOString()
    }
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

export async function uploadToTransferSh(
  filePath: string,
  fileName?: string
): Promise<UploadResult> {
  const actualFileName = fileName || path.basename(filePath)

  logger.info(LogCategory.EXPORT, 'Starting free file hosting upload', { fileName: actualFileName })

  try {
    // 파일 존재 여부 확인
    if (!fs.existsSync(filePath)) {
      const error = `File not found: ${filePath}`
      logger.error(LogCategory.EXPORT, 'Upload failed - file not found', {
        filePath,
        fileName: actualFileName
      })
      return {
        success: false,
        provider: 'transfer-sh',
        fileName: actualFileName,
        fileSize: 0,
        error
      }
    }

    // 파일 정보 확인
    const fileStats = fs.statSync(filePath)
    const fileSize = fileStats.size

    // 파일 크기 제한 확인 (512MB)
    const maxSize = 512 * 1024 * 1024
    if (fileSize > maxSize) {
      const error = `File too large: ${formatFileSize(fileSize)} (max: ${formatFileSize(maxSize)})`
      logger.error(LogCategory.EXPORT, 'Upload failed - file too large', {
        fileSize,
        maxSize,
        fileName: actualFileName
      })
      return {
        success: false,
        provider: 'transfer-sh',
        fileName: actualFileName,
        fileSize,
        error
      }
    }

    logger.info(LogCategory.EXPORT, 'Reading file for upload', {
      fileName: actualFileName,
      fileSize,
      fileSizeFormatted: formatFileSize(fileSize)
    })

    const fileBuffer = fs.readFileSync(filePath)

    logger.info(LogCategory.EXPORT, 'File read complete, starting upload attempts', {
      fileName: actualFileName,
      bufferSize: fileBuffer.length
    })

    // 여러 서비스 시도 (폴백 체인)
    const uploadServices = [
      { name: '0x0.st', fn: () => uploadTo0x0(fileBuffer, actualFileName, fileSize) },
      { name: 'file.io', fn: () => uploadToFileIo(fileBuffer, actualFileName, fileSize) },
      { name: 'Transfer.sh', fn: () => uploadToTransferShDirect(fileBuffer, actualFileName, fileSize) }
    ]

    const errors: string[] = []

    for (const service of uploadServices) {
      try {
        logger.info(LogCategory.EXPORT, `Attempting upload via ${service.name}`, {
          fileName: actualFileName
        })

        const result = await service.fn()

        logger.info(LogCategory.EXPORT, `Upload successful via ${service.name}`, {
          fileName: actualFileName,
          shareUrl: result.shareUrl
        })

        return result
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        errors.push(`${service.name}: ${errorMsg}`)

        logger.warn(LogCategory.EXPORT, `${service.name} upload failed, trying next service`, {
          fileName: actualFileName,
          error: errorMsg
        })
      }
    }

    // 모든 서비스 실패
    const errorMessage = `All upload services failed:\n${errors.join('\n')}`
    logger.error(LogCategory.EXPORT, 'All upload services failed', {
      fileName: actualFileName,
      errors
    })

    return {
      success: false,
      provider: 'transfer-sh',
      fileName: actualFileName,
      fileSize,
      error: errorMessage
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorName = error instanceof Error ? error.name : 'UnknownError'

    logger.error(LogCategory.EXPORT, 'Upload failed with unexpected error', {
      fileName: actualFileName,
      filePath,
      errorName,
      errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    })

    return {
      success: false,
      provider: 'transfer-sh',
      fileName: actualFileName,
      fileSize: 0,
      error: errorMessage
    }
  }
}

// =====================================================
// Google Drive 업로드 (Gmail OAuth 토큰 재사용)
// =====================================================

/**
 * Gmail 계정의 OAuth 토큰으로 Google Drive 접근 가능 여부 확인
 */
export function canUseGoogleDrive(accountEmail: string): boolean {
  if (!isOAuthAccount(accountEmail)) {
    return false
  }
  const tokens = getOAuthTokens(accountEmail)
  return tokens?.provider === 'google'
}

/**
 * Gmail OAuth 토큰에서 유효한 access token 가져오기
 */
async function getGoogleAccessToken(accountEmail: string): Promise<string | null> {
  try {
    const result = await getXOAuth2Token(accountEmail)
    if (result.success && result.accessToken) {
      return result.accessToken
    }
    logger.error(LogCategory.EXPORT, 'Failed to get Google access token', {
      email: accountEmail,
      error: result.error
    })
    return null
  } catch (error) {
    logger.error(LogCategory.EXPORT, 'Error getting Google access token', {
      email: accountEmail,
      error: error instanceof Error ? error.message : String(error)
    })
    return null
  }
}

// 기존 startGoogleAuth 함수는 더 이상 필요 없음 (Gmail OAuth로 대체)
// 하지만 하위 호환성을 위해 빈 함수로 유지
export async function startGoogleAuth(_clientId: string, _clientSecret: string): Promise<boolean> {
  logger.warn(LogCategory.APP, 'startGoogleAuth is deprecated - use Gmail OAuth instead')
  return false
}

/**
 * Google Drive에 파일 업로드 (Gmail OAuth 토큰 사용)
 */
export async function uploadToGoogleDrive(
  filePath: string,
  fileName?: string,
  accountEmail?: string
): Promise<UploadResult> {
  const actualFileName = fileName || path.basename(filePath)

  logger.info(LogCategory.EXPORT, 'Uploading to Google Drive', {
    fileName: actualFileName,
    accountEmail
  })

  // Gmail OAuth 토큰 확인
  if (!accountEmail) {
    return {
      success: false,
      provider: 'google-drive',
      fileName: actualFileName,
      fileSize: 0,
      error: 'Account email is required for Google Drive upload'
    }
  }

  if (!canUseGoogleDrive(accountEmail)) {
    return {
      success: false,
      provider: 'google-drive',
      fileName: actualFileName,
      fileSize: 0,
      error: 'This account does not support Google Drive (not a Gmail OAuth account)'
    }
  }

  // Gmail OAuth 토큰에서 access token 가져오기 (자동 갱신 포함)
  const accessToken = await getGoogleAccessToken(accountEmail)
  if (!accessToken) {
    return {
      success: false,
      provider: 'google-drive',
      fileName: actualFileName,
      fileSize: 0,
      error: 'Failed to get Google access token'
    }
  }

  try {
    const fileBuffer = fs.readFileSync(filePath)
    const fileSize = fileBuffer.length
    const mimeType = getMimeType(actualFileName)

    logger.info(LogCategory.EXPORT, 'Starting Google Drive upload', {
      fileName: actualFileName,
      fileSize,
      mimeType
    })

    // 1. 파일 메타데이터 생성 및 업로드 (resumable upload)
    const metadataResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: actualFileName,
          mimeType
        })
      }
    )

    if (!metadataResponse.ok) {
      const errorBody = await metadataResponse.text().catch(() => '')
      logger.error(LogCategory.EXPORT, 'Google Drive metadata request failed', {
        status: metadataResponse.status,
        statusText: metadataResponse.statusText,
        body: errorBody
      })
      throw new Error(`Failed to initiate upload: ${metadataResponse.status} - ${errorBody}`)
    }

    const uploadUrl = metadataResponse.headers.get('Location')
    if (!uploadUrl) {
      throw new Error('No upload URL returned')
    }

    // 2. 실제 파일 업로드
    const bodyData = new Uint8Array(fileBuffer)
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(fileSize)
      },
      body: bodyData
    })

    if (!uploadResponse.ok) {
      const errorBody = await uploadResponse.text().catch(() => '')
      logger.error(LogCategory.EXPORT, 'Google Drive upload failed', {
        status: uploadResponse.status,
        body: errorBody
      })
      throw new Error(`Upload failed: ${uploadResponse.status} - ${errorBody}`)
    }

    const uploadedFile = await uploadResponse.json()

    logger.info(LogCategory.EXPORT, 'File uploaded to Google Drive, setting permissions', {
      fileId: uploadedFile.id
    })

    // 3. 공유 권한 설정 (링크가 있는 모든 사용자)
    const permResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${uploadedFile.id}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone'
        })
      }
    )

    if (!permResponse.ok) {
      logger.warn(LogCategory.EXPORT, 'Failed to set permissions, file may not be shareable', {
        status: permResponse.status
      })
    }

    // 4. 공유 링크 가져오기
    const fileInfoResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${uploadedFile.id}?fields=webViewLink,webContentLink`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    )

    const fileInfo = await fileInfoResponse.json()

    logger.info(LogCategory.EXPORT, 'Google Drive upload completed', {
      fileName: actualFileName,
      fileId: uploadedFile.id
    })

    return {
      success: true,
      provider: 'google-drive',
      fileName: actualFileName,
      fileSize,
      shareUrl: fileInfo.webViewLink || `https://drive.google.com/file/d/${uploadedFile.id}/view`
    }
  } catch (error) {
    logger.error(LogCategory.EXPORT, 'Google Drive upload failed', {
      error: error instanceof Error ? error.message : String(error)
    })

    return {
      success: false,
      provider: 'google-drive',
      fileName: actualFileName,
      fileSize: 0,
      error: error instanceof Error ? error.message : 'Upload failed'
    }
  }
}

/**
 * 파일 확장자로 MIME 타입 추정
 */
function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.webm': 'video/webm'
  }

  return mimeTypes[ext] || 'application/octet-stream'
}

// =====================================================
// 통합 업로드 함수
// =====================================================

/**
 * 계정에 맞는 클라우드 서비스로 파일 업로드
 */
export async function uploadLargeFile(
  filePath: string,
  accountEmail: string,
  fileName?: string
): Promise<UploadResult> {
  const settings = getCloudStorageSettings()

  // 선호하는 서비스가 있으면 해당 서비스 사용
  let provider: CloudProvider = settings.preferredProvider || 'none'

  // 자동 선택 모드이면 계정에 맞는 서비스 감지
  if (settings.autoSelectByAccount || provider === 'none') {
    provider = detectCloudProvider(accountEmail)
  }

  logger.info(LogCategory.EXPORT, 'Starting large file upload', {
    provider,
    accountEmail,
    fileName: fileName || path.basename(filePath)
  })

  // Google Drive는 Gmail OAuth 계정 여부로 판단
  if (provider === 'google-drive' && !canUseGoogleDrive(accountEmail)) {
    logger.info(LogCategory.EXPORT, 'Gmail OAuth not available, falling back to Transfer.sh', {
      accountEmail
    })
    provider = 'transfer-sh'
  }

  // 다른 서비스는 기존 연결 상태로 확인
  if (provider !== 'transfer-sh' && provider !== 'google-drive' && !isCloudProviderConnected(provider)) {
    logger.info(LogCategory.EXPORT, 'Cloud provider not connected, falling back to Transfer.sh', {
      provider
    })
    provider = 'transfer-sh'
  }

  // 업로드 실행
  let result: UploadResult

  switch (provider) {
    case 'google-drive':
      result = await uploadToGoogleDrive(filePath, fileName, accountEmail)
      break

    case 'onedrive':
      // OneDrive는 추후 구현, Transfer.sh로 대체
      logger.info(LogCategory.EXPORT, 'OneDrive not implemented, using Transfer.sh')
      result = await uploadToTransferSh(filePath, fileName)
      break

    case 'naver-cloud':
      // 네이버 클라우드는 추후 구현, Transfer.sh로 대체
      logger.info(LogCategory.EXPORT, 'Naver Cloud not implemented, using Transfer.sh')
      result = await uploadToTransferSh(filePath, fileName)
      break

    case 'transfer-sh':
    default:
      result = await uploadToTransferSh(filePath, fileName)
      break
  }

  // 업로드 결과 로깅
  if (result.success) {
    logger.info(LogCategory.EXPORT, 'Large file upload completed', {
      provider: result.provider,
      fileName: result.fileName,
      fileSize: result.fileSize,
      shareUrl: result.shareUrl
    })
  } else {
    logger.error(LogCategory.EXPORT, 'Large file upload failed', {
      provider: result.provider,
      fileName: result.fileName,
      error: result.error
    })
  }

  return result
}

/**
 * 여러 파일 일괄 업로드
 */
export async function uploadMultipleLargeFiles(
  files: { path: string; name?: string }[],
  accountEmail: string
): Promise<UploadResult[]> {
  const results: UploadResult[] = []

  for (const file of files) {
    const result = await uploadLargeFile(file.path, accountEmail, file.name)
    results.push(result)
  }

  return results
}
