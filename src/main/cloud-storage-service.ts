import { BrowserWindow } from 'electron'
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
// Transfer.sh 업로드 (대체 서비스 - 인증 불필요)
// =====================================================

export async function uploadToTransferSh(
  filePath: string,
  fileName?: string
): Promise<UploadResult> {
  const actualFileName = fileName || path.basename(filePath)

  logger.info(LogCategory.EXPORT, 'Uploading to Transfer.sh', { fileName: actualFileName })

  try {
    const fileBuffer = fs.readFileSync(filePath)
    const fileSize = fileBuffer.length

    // Transfer.sh API 호출
    const response = await fetch(`https://transfer.sh/${encodeURIComponent(actualFileName)}`, {
      method: 'PUT',
      body: fileBuffer,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Max-Days': '14' // 14일간 보관
      }
    })

    if (!response.ok) {
      throw new Error(`Transfer.sh upload failed: ${response.status} ${response.statusText}`)
    }

    const shareUrl = await response.text()

    // 만료일 계산 (14일 후)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 14)

    logger.info(LogCategory.EXPORT, 'Transfer.sh upload completed', {
      fileName: actualFileName,
      shareUrl
    })

    return {
      success: true,
      provider: 'transfer-sh',
      fileName: actualFileName,
      fileSize,
      shareUrl: shareUrl.trim(),
      expiresAt: expiresAt.toISOString()
    }
  } catch (error) {
    logger.error(LogCategory.EXPORT, 'Transfer.sh upload failed', {
      error: error instanceof Error ? error.message : String(error)
    })

    return {
      success: false,
      provider: 'transfer-sh',
      fileName: actualFileName,
      fileSize: 0,
      error: error instanceof Error ? error.message : 'Upload failed'
    }
  }
}

// =====================================================
// Google Drive OAuth 및 업로드
// =====================================================

const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.file' // 앱이 생성한 파일만 접근
]

let authWindow: BrowserWindow | null = null

/**
 * Google OAuth 인증 시작
 */
export async function startGoogleAuth(clientId: string, clientSecret: string): Promise<boolean> {
  return new Promise((resolve) => {
    const redirectUri = 'http://localhost:8234/oauth/callback'

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', GOOGLE_OAUTH_SCOPES.join(' '))
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')

    // OAuth 콜백을 받을 로컬 서버 생성
    const http = require('http')
    const server = http.createServer(async (req: any, res: any) => {
      const url = new URL(req.url, `http://localhost:8234`)

      if (url.pathname === '/oauth/callback') {
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end('<html><body><h1>인증 실패</h1><p>창을 닫아주세요.</p></body></html>')
          server.close()
          if (authWindow) {
            authWindow.close()
            authWindow = null
          }
          resolve(false)
          return
        }

        if (code) {
          try {
            // Authorization code를 access token으로 교환
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
              })
            })

            const tokenData = await tokenResponse.json()

            if (tokenData.access_token) {
              // 사용자 이메일 가져오기
              const userInfoResponse = await fetch(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                {
                  headers: { Authorization: `Bearer ${tokenData.access_token}` }
                }
              )
              const userInfo = await userInfoResponse.json()

              saveCloudCredentials('google-drive', {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresAt: Date.now() + tokenData.expires_in * 1000,
                email: userInfo.email
              })

              // 설정에 클라이언트 정보 저장
              updateCloudStorageSettings({
                googleDrive: { clientId, clientSecret }
              })

              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
              res.end(
                '<html><body><h1>인증 성공!</h1><p>이 창을 닫아주세요.</p><script>window.close()</script></body></html>'
              )
              server.close()
              if (authWindow) {
                authWindow.close()
                authWindow = null
              }
              resolve(true)
              return
            }
          } catch (err) {
            logger.error(LogCategory.APP, 'Google OAuth token exchange failed', { error: err })
          }
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body><h1>인증 실패</h1><p>창을 닫아주세요.</p></body></html>')
        server.close()
        if (authWindow) {
          authWindow.close()
          authWindow = null
        }
        resolve(false)
      }
    })

    server.listen(8234, () => {
      // 인증 윈도우 열기
      authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      authWindow.loadURL(authUrl.toString())

      authWindow.on('closed', () => {
        authWindow = null
        server.close()
      })
    })
  })
}

/**
 * Google Drive 토큰 갱신
 */
async function refreshGoogleToken(): Promise<boolean> {
  const credentials = getCloudCredentials('google-drive')
  const settings = getCloudStorageSettings()

  if (!credentials?.refreshToken || !settings.googleDrive) {
    return false
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: settings.googleDrive.clientId,
        client_secret: settings.googleDrive.clientSecret,
        refresh_token: credentials.refreshToken,
        grant_type: 'refresh_token'
      })
    })

    const data = await response.json()

    if (data.access_token) {
      saveCloudCredentials('google-drive', {
        ...credentials,
        accessToken: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000
      })
      return true
    }
  } catch (error) {
    logger.error(LogCategory.APP, 'Failed to refresh Google token', { error })
  }

  return false
}

/**
 * Google Drive에 파일 업로드
 */
export async function uploadToGoogleDrive(
  filePath: string,
  fileName?: string
): Promise<UploadResult> {
  const actualFileName = fileName || path.basename(filePath)

  logger.info(LogCategory.EXPORT, 'Uploading to Google Drive', { fileName: actualFileName })

  // 토큰 확인 및 갱신
  let credentials = getCloudCredentials('google-drive')

  if (!credentials) {
    return {
      success: false,
      provider: 'google-drive',
      fileName: actualFileName,
      fileSize: 0,
      error: 'Google Drive not connected'
    }
  }

  // 토큰 만료 확인
  if (credentials.expiresAt && Date.now() > credentials.expiresAt - 60000) {
    const refreshed = await refreshGoogleToken()
    if (!refreshed) {
      return {
        success: false,
        provider: 'google-drive',
        fileName: actualFileName,
        fileSize: 0,
        error: 'Token expired and refresh failed'
      }
    }
    credentials = getCloudCredentials('google-drive')!
  }

  try {
    const fileBuffer = fs.readFileSync(filePath)
    const fileSize = fileBuffer.length
    const mimeType = getMimeType(actualFileName)

    // 1. 파일 메타데이터 생성 및 업로드 (resumable upload)
    const metadataResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: actualFileName,
          mimeType
        })
      }
    )

    if (!metadataResponse.ok) {
      throw new Error(`Failed to initiate upload: ${metadataResponse.status}`)
    }

    const uploadUrl = metadataResponse.headers.get('Location')
    if (!uploadUrl) {
      throw new Error('No upload URL returned')
    }

    // 2. 실제 파일 업로드
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(fileSize)
      },
      body: fileBuffer
    })

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status}`)
    }

    const uploadedFile = await uploadResponse.json()

    // 3. 공유 권한 설정 (링크가 있는 모든 사용자)
    await fetch(`https://www.googleapis.com/drive/v3/files/${uploadedFile.id}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    })

    // 4. 공유 링크 가져오기
    const fileInfoResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${uploadedFile.id}?fields=webViewLink,webContentLink`,
      {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`
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

  // 해당 서비스가 연결되어 있는지 확인
  if (provider !== 'transfer-sh' && !isCloudProviderConnected(provider)) {
    logger.info(LogCategory.EXPORT, 'Cloud provider not connected, falling back to Transfer.sh', {
      provider
    })
    provider = 'transfer-sh'
  }

  // 업로드 실행
  switch (provider) {
    case 'google-drive':
      return uploadToGoogleDrive(filePath, fileName)

    case 'onedrive':
      // OneDrive는 추후 구현, Transfer.sh로 대체
      logger.info(LogCategory.EXPORT, 'OneDrive not implemented, using Transfer.sh')
      return uploadToTransferSh(filePath, fileName)

    case 'naver-cloud':
      // 네이버 클라우드는 추후 구현, Transfer.sh로 대체
      logger.info(LogCategory.EXPORT, 'Naver Cloud not implemented, using Transfer.sh')
      return uploadToTransferSh(filePath, fileName)

    case 'transfer-sh':
    default:
      return uploadToTransferSh(filePath, fileName)
  }
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
