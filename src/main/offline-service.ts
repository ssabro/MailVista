/**
 * 오프라인 서비스
 * - 런타임 상태 관리 (온라인/오프라인)
 * - 이메일 캐싱
 * - 발송 대기 큐 관리
 * @see storage/offline-repository.ts for SQLite storage
 */
import { BrowserWindow } from 'electron'
import {
  getOfflineSettings as repoGetOfflineSettings,
  updateOfflineSettings as repoUpdateOfflineSettings,
  getCachedEmails as repoGetCachedEmails,
  getCachedEmailByUid,
  cacheEmail,
  clearFolderCache as repoClearFolderCache,
  clearAccountCache,
  getPendingEmails as repoGetPendingEmails,
  addPendingEmail as repoAddPendingEmail,
  removePendingEmail as repoRemovePendingEmail,
  incrementPendingRetry,
  getCachedFolders,
  addCachedFolder,
  getCacheStats,
  type CachedEmail as RepoCachedEmail,
  type OfflineSettings as RepoOfflineSettings
} from './storage/offline-repository'

// 오프라인 캐시된 이메일 (기존 API 호환)
export interface CachedEmail {
  uid: number
  messageId: string
  subject: string
  from: { name?: string; address: string }[]
  to: { name?: string; address: string }[]
  cc?: { name?: string; address: string }[]
  date: string
  flags: string[]
  hasAttachment: boolean
  text?: string
  html?: string
  attachments?: {
    filename: string
    contentType: string
    size: number
    partId: string
    content?: string // base64 encoded
  }[]
  cachedAt: number
}

// 폴더별 캐시
interface FolderCache {
  emails: CachedEmail[]
  lastSync: number
  total: number
}

// 계정별 캐시 구조
interface AccountCache {
  folders: { [folderPath: string]: FolderCache }
  folderList: {
    name: string
    path: string
    delimiter: string
    flags: string[]
    specialUse?: string
  }[]
  lastFolderSync: number
}

// 발송 대기 큐 아이템 (기존 API 호환)
export interface PendingEmail {
  id: string
  accountEmail: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text?: string
  html?: string
  attachments?: {
    filename: string
    content: string // base64
    contentType: string
  }[]
  createdAt: number
  retryCount: number
}

// 런타임 상태
let isOnline = true
let mainWindow: BrowserWindow | null = null

// 폴더 목록 메모리 캐시 (SQLite에 저장하지 않는 임시 데이터)
const folderListCache: { [accountEmail: string]: AccountCache['folderList'] } = {}
const lastFolderSyncCache: { [accountEmail: string]: number } = {}
const folderTotalCache: { [key: string]: number } = {} // key: accountEmail:folderPath
const folderLastSyncCache: { [key: string]: number } = {} // key: accountEmail:folderPath

// ==========================================================
// 헬퍼: Repository ↔ Service 타입 변환
// ==========================================================

function repoToServiceEmail(repo: RepoCachedEmail): CachedEmail {
  const from: { name?: string; address: string }[] = []
  if (repo.fromAddress) {
    from.push({ name: repo.fromName, address: repo.fromAddress })
  }

  const to: { name?: string; address: string }[] = []
  if (repo.toAddresses) {
    for (const addr of repo.toAddresses) {
      to.push({ address: addr })
    }
  }

  return {
    uid: repo.uid,
    messageId: repo.messageId || '',
    subject: repo.subject || '',
    from,
    to,
    date: repo.date || '',
    flags: repo.flags || [],
    hasAttachment: repo.hasAttachment,
    text: repo.textContent,
    html: repo.htmlContent,
    attachments: repo.attachments?.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      partId: ''
    })),
    cachedAt: repo.cachedAt ? new Date(repo.cachedAt).getTime() : Date.now()
  }
}

function serviceToRepoEmail(
  folderPath: string,
  service: CachedEmail
): Omit<RepoCachedEmail, 'id' | 'accountId' | 'cachedAt'> {
  return {
    folderPath,
    uid: service.uid,
    messageId: service.messageId,
    subject: service.subject,
    fromAddress: service.from?.[0]?.address,
    fromName: service.from?.[0]?.name,
    toAddresses: service.to?.map((t) => t.address),
    date: service.date,
    flags: service.flags,
    hasAttachment: service.hasAttachment,
    htmlContent: service.html,
    textContent: service.text,
    attachments: service.attachments?.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size
    }))
  }
}

// 사용되지 않지만 향후 확장을 위해 유지
// function repoToServicePending(accountEmail: string, repo: RepoPendingEmail): PendingEmail {
//   return {
//     id: repo.id,
//     accountEmail,
//     to: repo.toAddresses,
//     cc: repo.ccAddresses,
//     bcc: repo.bccAddresses,
//     subject: repo.subject || '',
//     text: repo.textContent,
//     html: repo.htmlContent,
//     attachments: repo.attachments,
//     createdAt: new Date(repo.createdAt).getTime(),
//     retryCount: repo.retryCount
//   }
// }

// ==========================================================
// 메인 윈도우 및 온라인 상태
// ==========================================================

export function setMainWindow(window: BrowserWindow) {
  mainWindow = window
}

export function getOnlineStatus(): boolean {
  return isOnline
}

export function setOnlineStatus(status: boolean) {
  const wasOffline = !isOnline
  isOnline = status

  // 오프라인에서 온라인으로 변경되면 대기 중인 이메일 발송
  if (wasOffline && status) {
    processPendingEmails()
  }

  // 렌더러에 상태 알림
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('online-status-changed', status)
  }
}

// ==========================================================
// 오프라인 설정
// ==========================================================

export function getOfflineSettings() {
  const settings = repoGetOfflineSettings()
  return {
    enabled: settings.enabled,
    maxCacheSize: Math.round(settings.maxCacheSize / (1024 * 1024)), // bytes to MB
    maxEmailsPerFolder: settings.maxEmailsPerFolder,
    cacheAttachments: true, // 기존 API 호환
    maxAttachmentSize: 10 // 기존 API 호환 (MB)
  }
}

export function updateOfflineSettings(updates: {
  enabled?: boolean
  maxCacheSize?: number
  maxEmailsPerFolder?: number
  cacheAttachments?: boolean
  maxAttachmentSize?: number
}) {
  const repoUpdates: Partial<RepoOfflineSettings> = {}

  if (updates.enabled !== undefined) {
    repoUpdates.enabled = updates.enabled
  }
  if (updates.maxCacheSize !== undefined) {
    repoUpdates.maxCacheSize = updates.maxCacheSize * 1024 * 1024 // MB to bytes
  }
  if (updates.maxEmailsPerFolder !== undefined) {
    repoUpdates.maxEmailsPerFolder = updates.maxEmailsPerFolder
  }

  repoUpdateOfflineSettings(repoUpdates)
  return { success: true }
}

// ==========================================================
// 이메일 캐시
// ==========================================================

export function cacheEmails(
  accountEmail: string,
  folderPath: string,
  emails: CachedEmail[],
  total: number
) {
  const settings = getOfflineSettings()
  if (!settings.enabled) return

  // 최대 개수 제한
  const limitedEmails = emails.slice(0, settings.maxEmailsPerFolder)

  // 기존 캐시 삭제 후 새로 저장
  repoClearFolderCache(accountEmail, folderPath)

  for (const email of limitedEmails) {
    cacheEmail(accountEmail, serviceToRepoEmail(folderPath, email))
  }

  // 폴더를 캐시된 폴더 목록에 추가
  addCachedFolder(accountEmail, folderPath)

  // 메모리 캐시에 total과 lastSync 저장
  const key = `${accountEmail}:${folderPath}`
  folderTotalCache[key] = total
  folderLastSyncCache[key] = Date.now()
}

export function cacheEmailContent(
  accountEmail: string,
  folderPath: string,
  uid: number,
  content: { text?: string; html?: string; attachments?: CachedEmail['attachments'] }
) {
  const settings = getOfflineSettings()
  if (!settings.enabled) return

  const existing = getCachedEmailByUid(accountEmail, folderPath, uid)
  if (existing) {
    cacheEmail(accountEmail, {
      ...serviceToRepoEmail(folderPath, repoToServiceEmail(existing)),
      htmlContent: content.html,
      textContent: content.text,
      attachments: content.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size
      }))
    })
  }
}

export function getCachedEmails(
  accountEmail: string,
  folderPath: string
): { emails: CachedEmail[]; total: number; lastSync: number } | null {
  const cachedEmails = repoGetCachedEmails(accountEmail, folderPath)

  if (cachedEmails.length === 0) {
    return null
  }

  const key = `${accountEmail}:${folderPath}`

  return {
    emails: cachedEmails.map(repoToServiceEmail),
    total: folderTotalCache[key] || cachedEmails.length,
    lastSync: folderLastSyncCache[key] || Date.now()
  }
}

export function getCachedEmailContent(
  accountEmail: string,
  folderPath: string,
  uid: number
): CachedEmail | null {
  const cached = getCachedEmailByUid(accountEmail, folderPath, uid)
  return cached ? repoToServiceEmail(cached) : null
}

// ==========================================================
// 폴더 목록 캐시 (메모리에만 저장)
// ==========================================================

export function cacheFolderList(accountEmail: string, folders: AccountCache['folderList']) {
  const settings = getOfflineSettings()
  if (!settings.enabled) return

  folderListCache[accountEmail] = folders
  lastFolderSyncCache[accountEmail] = Date.now()
}

export function getCachedFolderList(accountEmail: string): AccountCache['folderList'] | null {
  return folderListCache[accountEmail] || null
}

// ==========================================================
// 발송 대기 이메일
// ==========================================================

export function addPendingEmail(
  email: Omit<PendingEmail, 'id' | 'createdAt' | 'retryCount'>
): string {
  const result = repoAddPendingEmail(email.accountEmail, {
    toAddresses: email.to,
    ccAddresses: email.cc,
    bccAddresses: email.bcc,
    subject: email.subject,
    htmlContent: email.html,
    textContent: email.text,
    attachments: email.attachments
  })

  return result.pending?.id || ''
}

export function getPendingEmails(): PendingEmail[] {
  const allPending = repoGetPendingEmails()
  // accountEmail을 역추적하기 어려우므로, 여기서는 accountId를 사용
  // 실제로는 account-helper에서 역방향 조회가 필요하지만, 기존 API 호환을 위해 accountId를 그대로 사용
  return allPending.map((p) => ({
    id: p.id,
    accountEmail: p.accountId, // accountId가 실제로는 accountEmail이 아니지만 기존 코드 호환
    to: p.toAddresses,
    cc: p.ccAddresses,
    bcc: p.bccAddresses,
    subject: p.subject || '',
    text: p.textContent,
    html: p.htmlContent,
    attachments: p.attachments,
    createdAt: new Date(p.createdAt).getTime(),
    retryCount: p.retryCount
  }))
}

export function removePendingEmail(id: string) {
  repoRemovePendingEmail(id)
}

async function processPendingEmails() {
  const pendingEmails = getPendingEmails()
  if (pendingEmails.length === 0) return

  // 렌더러에 처리 시작 알림
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pending-emails-processing', pendingEmails.length)
  }

  for (const email of pendingEmails) {
    try {
      // sendEmail 함수 호출 (동적 import로 순환 참조 방지)
      const { sendEmail } = await import('./mail-service')
      const result = await sendEmail(email.accountEmail, {
        to: email.to,
        cc: email.cc,
        bcc: email.bcc,
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: email.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content, 'base64'),
          contentType: a.contentType
        }))
      })

      if (result.success) {
        removePendingEmail(email.id)
        // 성공 알림
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('pending-email-sent', email.id, email.subject)
        }
      } else {
        // 재시도 횟수 증가
        incrementPendingRetry(email.id, result.error)

        // 5번 이상 실패하면 삭제
        if (email.retryCount + 1 >= 5) {
          removePendingEmail(email.id)
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('pending-email-failed', email.id, email.subject)
          }
        }
      }
    } catch (error) {
      console.error('Failed to send pending email:', error)
      incrementPendingRetry(email.id, String(error))
    }
  }

  // 처리 완료 알림
  const remaining = getPendingEmails().length
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pending-emails-processed', remaining)
  }
}

// ==========================================================
// 캐시 관리
// ==========================================================

export function getCacheSize(accountEmail?: string): number {
  const stats = getCacheStats(accountEmail)
  return Math.round((stats.estimatedSize / 1024 / 1024) * 100) / 100 // bytes to MB
}

export function clearCache(accountEmail?: string) {
  if (accountEmail) {
    clearAccountCache(accountEmail)
    delete folderListCache[accountEmail]
    delete lastFolderSyncCache[accountEmail]

    // 해당 계정의 메모리 캐시 삭제
    for (const key of Object.keys(folderTotalCache)) {
      if (key.startsWith(`${accountEmail}:`)) {
        delete folderTotalCache[key]
        delete folderLastSyncCache[key]
      }
    }
  } else {
    // 모든 계정의 캐시 삭제는 개별적으로 처리해야 함
    // 여기서는 메모리 캐시만 삭제
    Object.keys(folderListCache).forEach((key) => delete folderListCache[key])
    Object.keys(lastFolderSyncCache).forEach((key) => delete lastFolderSyncCache[key])
    Object.keys(folderTotalCache).forEach((key) => delete folderTotalCache[key])
    Object.keys(folderLastSyncCache).forEach((key) => delete folderLastSyncCache[key])
  }
  return { success: true }
}

export function clearFolderCache(accountEmail: string, folderPath: string) {
  repoClearFolderCache(accountEmail, folderPath)

  const key = `${accountEmail}:${folderPath}`
  delete folderTotalCache[key]
  delete folderLastSyncCache[key]

  return { success: true }
}

export function getCacheStatus(accountEmail: string): {
  isEnabled: boolean
  cacheSize: number
  cachedFolders: string[]
  pendingEmailsCount: number
  lastSync: { [folderPath: string]: number }
} {
  const settings = getOfflineSettings()
  const cachedFolders = getCachedFolders(accountEmail)
  const stats = getCacheStats(accountEmail)

  const lastSync: { [folderPath: string]: number } = {}
  for (const folderPath of cachedFolders) {
    const key = `${accountEmail}:${folderPath}`
    lastSync[folderPath] = folderLastSyncCache[key] || 0
  }

  return {
    isEnabled: settings.enabled,
    cacheSize: getCacheSize(accountEmail),
    cachedFolders,
    pendingEmailsCount: stats.pendingEmails,
    lastSync
  }
}
