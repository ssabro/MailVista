/**
 * 오프라인 캐시 SQLite Repository
 * - offline_settings, offline_cached_emails, offline_pending_emails, offline_cached_folders 테이블 관리
 */
import { getStorageDatabase } from './database'
import { getOrCreateAccountId, getAccountId } from './account-helper'
import { v4 as uuidv4 } from 'uuid'

// =====================================================
// 타입 정의
// =====================================================

export interface OfflineSettings {
  enabled: boolean
  maxCacheSize: number
  maxEmailsPerFolder: number
}

export interface CachedEmail {
  id: string
  accountId: string
  folderPath: string
  uid: number
  messageId?: string
  subject?: string
  fromAddress?: string
  fromName?: string
  toAddresses?: string[]
  date?: string
  flags?: string[]
  hasAttachment: boolean
  htmlContent?: string
  textContent?: string
  attachments?: CachedAttachment[]
  cachedAt: string
}

export interface CachedAttachment {
  filename: string
  contentType: string
  size: number
}

export interface PendingEmail {
  id: string
  accountId: string
  toAddresses: string[]
  ccAddresses?: string[]
  bccAddresses?: string[]
  subject?: string
  htmlContent?: string
  textContent?: string
  attachments?: PendingAttachment[]
  replyToMessageId?: string
  retryCount: number
  lastError?: string
  createdAt: string
}

export interface PendingAttachment {
  filename: string
  contentType: string
  content: string // base64
}

interface OfflineSettingsRow {
  id: number
  enabled: number
  max_cache_size: number
  max_emails_per_folder: number
}

interface CachedEmailRow {
  id: string
  account_id: string
  folder_path: string
  uid: number
  message_id: string | null
  subject: string | null
  from_address: string | null
  from_name: string | null
  to_addresses: string | null
  date: number | null
  flags: string | null
  has_attachment: number
  html_content: string | null
  text_content: string | null
  attachments: string | null
  cached_at: number
}

interface PendingEmailRow {
  id: string
  account_id: string
  to_addresses: string
  cc_addresses: string | null
  bcc_addresses: string | null
  subject: string | null
  html_content: string | null
  text_content: string | null
  attachments: string | null
  reply_to_message_id: string | null
  retry_count: number
  last_error: string | null
  created_at: number
}

// =====================================================
// 오프라인 설정
// =====================================================

/**
 * 오프라인 설정 조회
 */
export function getOfflineSettings(): OfflineSettings {
  const db = getStorageDatabase().getDatabase()

  const row = db.prepare('SELECT * FROM offline_settings WHERE id = 1').get() as
    | OfflineSettingsRow
    | undefined

  if (!row) {
    return {
      enabled: false,
      maxCacheSize: 100 * 1024 * 1024, // 100MB
      maxEmailsPerFolder: 100
    }
  }

  return {
    enabled: row.enabled === 1,
    maxCacheSize: row.max_cache_size,
    maxEmailsPerFolder: row.max_emails_per_folder
  }
}

/**
 * 오프라인 설정 업데이트
 */
export function updateOfflineSettings(updates: Partial<OfflineSettings>): {
  success: boolean
  settings?: OfflineSettings
} {
  const db = getStorageDatabase().getDatabase()

  const fields: string[] = []
  const values: number[] = []

  if (updates.enabled !== undefined) {
    fields.push('enabled = ?')
    values.push(updates.enabled ? 1 : 0)
  }
  if (updates.maxCacheSize !== undefined) {
    fields.push('max_cache_size = ?')
    values.push(updates.maxCacheSize)
  }
  if (updates.maxEmailsPerFolder !== undefined) {
    fields.push('max_emails_per_folder = ?')
    values.push(updates.maxEmailsPerFolder)
  }

  if (fields.length > 0) {
    db.prepare(`UPDATE offline_settings SET ${fields.join(', ')} WHERE id = 1`).run(...values)
  }

  return { success: true, settings: getOfflineSettings() }
}

// =====================================================
// 캐시된 이메일
// =====================================================

/**
 * 캐시된 이메일 목록 조회
 */
export function getCachedEmails(
  accountEmail: string,
  folderPath: string,
  options?: { limit?: number; offset?: number }
): CachedEmail[] {
  const accountId = getAccountId(accountEmail)
  if (!accountId) return []

  const db = getStorageDatabase().getDatabase()

  let query =
    'SELECT * FROM offline_cached_emails WHERE account_id = ? AND folder_path = ? ORDER BY date DESC'
  const params: (string | number)[] = [accountId, folderPath]

  if (options?.limit) {
    query += ' LIMIT ?'
    params.push(options.limit)
    if (options.offset) {
      query += ' OFFSET ?'
      params.push(options.offset)
    }
  }

  const rows = db.prepare(query).all(...params) as CachedEmailRow[]
  return rows.map(rowToCachedEmail)
}

/**
 * 캐시된 이메일 조회 (UID로)
 */
export function getCachedEmailByUid(
  accountEmail: string,
  folderPath: string,
  uid: number
): CachedEmail | null {
  const accountId = getAccountId(accountEmail)
  if (!accountId) return null

  const db = getStorageDatabase().getDatabase()

  const row = db
    .prepare(
      'SELECT * FROM offline_cached_emails WHERE account_id = ? AND folder_path = ? AND uid = ?'
    )
    .get(accountId, folderPath, uid) as CachedEmailRow | undefined

  return row ? rowToCachedEmail(row) : null
}

/**
 * 이메일 캐시 추가/업데이트
 */
export function cacheEmail(
  accountEmail: string,
  email: Omit<CachedEmail, 'id' | 'accountId' | 'cachedAt'>
): { success: boolean; cached?: CachedEmail } {
  const accountId = getOrCreateAccountId(accountEmail)
  const db = getStorageDatabase().getDatabase()

  const id = uuidv4()
  const now = Date.now()

  db.prepare(
    `
    INSERT OR REPLACE INTO offline_cached_emails
    (id, account_id, folder_path, uid, message_id, subject, from_address, from_name,
     to_addresses, date, flags, has_attachment, html_content, text_content, attachments, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    accountId,
    email.folderPath,
    email.uid,
    email.messageId || null,
    email.subject || null,
    email.fromAddress || null,
    email.fromName || null,
    email.toAddresses ? JSON.stringify(email.toAddresses) : null,
    email.date ? new Date(email.date).getTime() : null,
    email.flags ? JSON.stringify(email.flags) : null,
    email.hasAttachment ? 1 : 0,
    email.htmlContent || null,
    email.textContent || null,
    email.attachments ? JSON.stringify(email.attachments) : null,
    now
  )

  return {
    success: true,
    cached: {
      id,
      accountId,
      ...email,
      cachedAt: new Date(now).toISOString()
    }
  }
}

/**
 * 캐시된 이메일 삭제
 */
export function removeCachedEmail(
  accountEmail: string,
  folderPath: string,
  uid: number
): { success: boolean } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) return { success: false }

  const db = getStorageDatabase().getDatabase()
  db.prepare(
    'DELETE FROM offline_cached_emails WHERE account_id = ? AND folder_path = ? AND uid = ?'
  ).run(accountId, folderPath, uid)

  return { success: true }
}

/**
 * 폴더의 모든 캐시 삭제
 */
export function clearFolderCache(accountEmail: string, folderPath: string): { success: boolean } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) return { success: false }

  const db = getStorageDatabase().getDatabase()
  db.prepare('DELETE FROM offline_cached_emails WHERE account_id = ? AND folder_path = ?').run(
    accountId,
    folderPath
  )

  return { success: true }
}

/**
 * 계정의 모든 캐시 삭제
 */
export function clearAccountCache(accountEmail: string): { success: boolean } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) return { success: false }

  const db = getStorageDatabase().getDatabase()

  db.transaction(() => {
    db.prepare('DELETE FROM offline_cached_emails WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM offline_cached_folders WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM offline_pending_emails WHERE account_id = ?').run(accountId)
  })()

  return { success: true }
}

// =====================================================
// 대기 이메일 (발송 대기)
// =====================================================

/**
 * 대기 이메일 목록 조회
 */
export function getPendingEmails(accountEmail?: string): PendingEmail[] {
  const db = getStorageDatabase().getDatabase()

  let query = 'SELECT * FROM offline_pending_emails'
  const params: string[] = []

  if (accountEmail) {
    const accountId = getAccountId(accountEmail)
    if (!accountId) return []
    query += ' WHERE account_id = ?'
    params.push(accountId)
  }

  query += ' ORDER BY created_at'

  const rows = db.prepare(query).all(...params) as PendingEmailRow[]
  return rows.map(rowToPendingEmail)
}

/**
 * 대기 이메일 추가
 */
export function addPendingEmail(
  accountEmail: string,
  email: Omit<PendingEmail, 'id' | 'accountId' | 'retryCount' | 'createdAt'>
): { success: boolean; pending?: PendingEmail } {
  const accountId = getOrCreateAccountId(accountEmail)
  const db = getStorageDatabase().getDatabase()

  const id = uuidv4()
  const now = Date.now()

  db.prepare(
    `
    INSERT INTO offline_pending_emails
    (id, account_id, to_addresses, cc_addresses, bcc_addresses, subject,
     html_content, text_content, attachments, reply_to_message_id, retry_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `
  ).run(
    id,
    accountId,
    JSON.stringify(email.toAddresses),
    email.ccAddresses ? JSON.stringify(email.ccAddresses) : null,
    email.bccAddresses ? JSON.stringify(email.bccAddresses) : null,
    email.subject || null,
    email.htmlContent || null,
    email.textContent || null,
    email.attachments ? JSON.stringify(email.attachments) : null,
    email.replyToMessageId || null,
    now
  )

  return {
    success: true,
    pending: {
      id,
      accountId,
      ...email,
      retryCount: 0,
      createdAt: new Date(now).toISOString()
    }
  }
}

/**
 * 대기 이메일 재시도 횟수 증가
 */
export function incrementPendingRetry(id: string, error?: string): { success: boolean } {
  const db = getStorageDatabase().getDatabase()

  db.prepare(
    'UPDATE offline_pending_emails SET retry_count = retry_count + 1, last_error = ? WHERE id = ?'
  ).run(error || null, id)

  return { success: true }
}

/**
 * 대기 이메일 삭제
 */
export function removePendingEmail(id: string): { success: boolean } {
  const db = getStorageDatabase().getDatabase()
  db.prepare('DELETE FROM offline_pending_emails WHERE id = ?').run(id)
  return { success: true }
}

// =====================================================
// 캐시된 폴더
// =====================================================

/**
 * 캐시된 폴더 목록 조회
 */
export function getCachedFolders(accountEmail: string): string[] {
  const accountId = getAccountId(accountEmail)
  if (!accountId) return []

  const db = getStorageDatabase().getDatabase()

  const rows = db
    .prepare('SELECT folder_path FROM offline_cached_folders WHERE account_id = ?')
    .all(accountId) as { folder_path: string }[]

  return rows.map((r) => r.folder_path)
}

/**
 * 캐시된 폴더 추가
 */
export function addCachedFolder(accountEmail: string, folderPath: string): { success: boolean } {
  const accountId = getOrCreateAccountId(accountEmail)
  const db = getStorageDatabase().getDatabase()

  const id = uuidv4()
  const now = Date.now()

  db.prepare(
    `
    INSERT OR REPLACE INTO offline_cached_folders (id, account_id, folder_path, cached_at)
    VALUES (?, ?, ?, ?)
  `
  ).run(id, accountId, folderPath, now)

  return { success: true }
}

/**
 * 캐시된 폴더 제거
 */
export function removeCachedFolder(accountEmail: string, folderPath: string): { success: boolean } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) return { success: false }

  const db = getStorageDatabase().getDatabase()

  db.transaction(() => {
    db.prepare('DELETE FROM offline_cached_folders WHERE account_id = ? AND folder_path = ?').run(
      accountId,
      folderPath
    )
    db.prepare('DELETE FROM offline_cached_emails WHERE account_id = ? AND folder_path = ?').run(
      accountId,
      folderPath
    )
  })()

  return { success: true }
}

// =====================================================
// 캐시 통계
// =====================================================

export interface CacheStats {
  totalEmails: number
  totalFolders: number
  pendingEmails: number
  estimatedSize: number
}

/**
 * 캐시 통계 조회
 */
export function getCacheStats(accountEmail?: string): CacheStats {
  const db = getStorageDatabase().getDatabase()

  if (accountEmail) {
    const accountId = getAccountId(accountEmail)
    if (!accountId) {
      return { totalEmails: 0, totalFolders: 0, pendingEmails: 0, estimatedSize: 0 }
    }

    const totalEmails = (
      db
        .prepare('SELECT COUNT(*) as count FROM offline_cached_emails WHERE account_id = ?')
        .get(accountId) as { count: number }
    ).count

    const totalFolders = (
      db
        .prepare('SELECT COUNT(*) as count FROM offline_cached_folders WHERE account_id = ?')
        .get(accountId) as { count: number }
    ).count

    const pendingEmails = (
      db
        .prepare('SELECT COUNT(*) as count FROM offline_pending_emails WHERE account_id = ?')
        .get(accountId) as { count: number }
    ).count

    // 대략적인 크기 추정 (html_content + text_content 길이 합계)
    const sizeResult = db
      .prepare(
        `
      SELECT COALESCE(SUM(LENGTH(html_content) + LENGTH(text_content)), 0) as size
      FROM offline_cached_emails WHERE account_id = ?
    `
      )
      .get(accountId) as { size: number }

    return { totalEmails, totalFolders, pendingEmails, estimatedSize: sizeResult.size }
  } else {
    const totalEmails = (
      db.prepare('SELECT COUNT(*) as count FROM offline_cached_emails').get() as { count: number }
    ).count

    const totalFolders = (
      db.prepare('SELECT COUNT(*) as count FROM offline_cached_folders').get() as { count: number }
    ).count

    const pendingEmails = (
      db.prepare('SELECT COUNT(*) as count FROM offline_pending_emails').get() as { count: number }
    ).count

    const sizeResult = db
      .prepare(
        `
      SELECT COALESCE(SUM(LENGTH(html_content) + LENGTH(text_content)), 0) as size
      FROM offline_cached_emails
    `
      )
      .get() as { size: number }

    return { totalEmails, totalFolders, pendingEmails, estimatedSize: sizeResult.size }
  }
}

// =====================================================
// 헬퍼 함수
// =====================================================

function rowToCachedEmail(row: CachedEmailRow): CachedEmail {
  return {
    id: row.id,
    accountId: row.account_id,
    folderPath: row.folder_path,
    uid: row.uid,
    messageId: row.message_id || undefined,
    subject: row.subject || undefined,
    fromAddress: row.from_address || undefined,
    fromName: row.from_name || undefined,
    toAddresses: row.to_addresses ? JSON.parse(row.to_addresses) : undefined,
    date: row.date ? new Date(row.date).toISOString() : undefined,
    flags: row.flags ? JSON.parse(row.flags) : undefined,
    hasAttachment: row.has_attachment === 1,
    htmlContent: row.html_content || undefined,
    textContent: row.text_content || undefined,
    attachments: row.attachments ? JSON.parse(row.attachments) : undefined,
    cachedAt: new Date(row.cached_at).toISOString()
  }
}

function rowToPendingEmail(row: PendingEmailRow): PendingEmail {
  return {
    id: row.id,
    accountId: row.account_id,
    toAddresses: JSON.parse(row.to_addresses),
    ccAddresses: row.cc_addresses ? JSON.parse(row.cc_addresses) : undefined,
    bccAddresses: row.bcc_addresses ? JSON.parse(row.bcc_addresses) : undefined,
    subject: row.subject || undefined,
    htmlContent: row.html_content || undefined,
    textContent: row.text_content || undefined,
    attachments: row.attachments ? JSON.parse(row.attachments) : undefined,
    replyToMessageId: row.reply_to_message_id || undefined,
    retryCount: row.retry_count,
    lastError: row.last_error || undefined,
    createdAt: new Date(row.created_at).toISOString()
  }
}
