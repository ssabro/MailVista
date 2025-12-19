/**
 * 스팸 설정 SQLite Repository
 * - spam_settings, blocked_senders, blocked_domains 테이블 관리
 */
import { getStorageDatabase } from './database'
import { getOrCreateAccountId, getAccountId } from './account-helper'
import { v4 as uuidv4 } from 'uuid'

// =====================================================
// 타입 정의
// =====================================================

export interface BlockedSender {
  id: string
  email: string
  addedAt: number
}

export interface BlockedDomain {
  id: string
  domain: string
  addedAt: number
}

export interface SpamSettings {
  enabled: boolean
  blockedSenders: BlockedSender[]
  blockedDomains: BlockedDomain[]
  autoDeleteSpam: boolean
  spamRetentionDays: number
}

interface SpamSettingsRow {
  account_id: string
  enabled: number
  auto_delete: number
  retention_days: number
}

interface BlockedSenderRow {
  id: string
  account_id: string
  email: string
  added_at: number
}

interface BlockedDomainRow {
  id: string
  account_id: string
  domain: string
  added_at: number
}

// =====================================================
// 스팸 설정 CRUD
// =====================================================

/**
 * 스팸 설정 조회
 */
export function getSpamSettings(accountEmail: string): SpamSettings {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return getDefaultSpamSettings()
  }

  const db = getStorageDatabase().getDatabase()

  // 설정 조회
  const settings = db.prepare('SELECT * FROM spam_settings WHERE account_id = ?').get(accountId) as
    | SpamSettingsRow
    | undefined

  // 차단 발신자 조회
  const blockedSenders = db
    .prepare('SELECT * FROM blocked_senders WHERE account_id = ? ORDER BY email')
    .all(accountId) as BlockedSenderRow[]

  // 차단 도메인 조회
  const blockedDomains = db
    .prepare('SELECT * FROM blocked_domains WHERE account_id = ? ORDER BY domain')
    .all(accountId) as BlockedDomainRow[]

  return {
    enabled: settings?.enabled === 1,
    blockedSenders: blockedSenders.map((r) => ({
      id: r.id,
      email: r.email,
      addedAt: r.added_at
    })),
    blockedDomains: blockedDomains.map((r) => ({
      id: r.id,
      domain: r.domain,
      addedAt: r.added_at
    })),
    autoDeleteSpam: settings?.auto_delete === 1,
    spamRetentionDays: settings?.retention_days ?? 30
  }
}

/**
 * 기본 스팸 설정
 */
export const defaultSpamSettings: SpamSettings = {
  enabled: true,
  blockedSenders: [],
  blockedDomains: [],
  autoDeleteSpam: false,
  spamRetentionDays: 30
}

function getDefaultSpamSettings(): SpamSettings {
  return { ...defaultSpamSettings }
}

/**
 * 스팸 설정 업데이트
 */
export function updateSpamSettings(
  accountEmail: string,
  updates: Partial<SpamSettings>
): { success: boolean; settings?: SpamSettings; error?: string } {
  const accountId = getOrCreateAccountId(accountEmail)
  const db = getStorageDatabase().getDatabase()

  // 기존 설정 확인
  const existing = db.prepare('SELECT * FROM spam_settings WHERE account_id = ?').get(accountId) as
    | SpamSettingsRow
    | undefined

  if (existing) {
    // 업데이트
    const fields: string[] = []
    const values: (string | number)[] = []

    if (updates.enabled !== undefined) {
      fields.push('enabled = ?')
      values.push(updates.enabled ? 1 : 0)
    }
    if (updates.autoDeleteSpam !== undefined) {
      fields.push('auto_delete = ?')
      values.push(updates.autoDeleteSpam ? 1 : 0)
    }
    if (updates.spamRetentionDays !== undefined) {
      fields.push('retention_days = ?')
      values.push(updates.spamRetentionDays)
    }

    if (fields.length > 0) {
      values.push(accountId)
      db.prepare(`UPDATE spam_settings SET ${fields.join(', ')} WHERE account_id = ?`).run(
        ...values
      )
    }
  } else {
    // 새로 생성
    db.prepare(
      'INSERT INTO spam_settings (account_id, enabled, auto_delete, retention_days) VALUES (?, ?, ?, ?)'
    ).run(
      accountId,
      updates.enabled ? 1 : 0,
      updates.autoDeleteSpam ? 1 : 0,
      updates.spamRetentionDays ?? 30
    )
  }

  return { success: true, settings: getSpamSettings(accountEmail) }
}

/**
 * 스팸 설정 초기화
 */
export function resetSpamSettings(accountEmail: string): { success: boolean } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: true }
  }

  const db = getStorageDatabase().getDatabase()

  db.transaction(() => {
    db.prepare('DELETE FROM spam_settings WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM blocked_senders WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM blocked_domains WHERE account_id = ?').run(accountId)
  })()

  return { success: true }
}

// =====================================================
// 차단 발신자 CRUD
// =====================================================

/**
 * 발신자 차단
 */
export function addBlockedSender(
  accountEmail: string,
  email: string
): { success: boolean; blockedSender?: BlockedSender; error?: string } {
  const accountId = getOrCreateAccountId(accountEmail)
  const db = getStorageDatabase().getDatabase()

  const emailLower = email.toLowerCase()

  // 이미 차단되어 있는지 확인
  const existing = db
    .prepare('SELECT id FROM blocked_senders WHERE account_id = ? AND LOWER(email) = ?')
    .get(accountId, emailLower)

  if (existing) {
    return { success: false, error: '이미 차단된 발신자입니다.' }
  }

  const id = uuidv4()
  const now = Date.now()

  db.prepare(
    'INSERT INTO blocked_senders (id, account_id, email, added_at) VALUES (?, ?, ?, ?)'
  ).run(id, accountId, emailLower, now)

  return {
    success: true,
    blockedSender: {
      id,
      email: emailLower,
      addedAt: now
    }
  }
}

/**
 * 발신자 차단 해제
 */
export function removeBlockedSender(
  accountEmail: string,
  email: string
): { success: boolean; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()
  const emailLower = email.toLowerCase()

  const result = db
    .prepare('DELETE FROM blocked_senders WHERE account_id = ? AND LOWER(email) = ?')
    .run(accountId, emailLower)

  if (result.changes === 0) {
    return { success: false, error: '차단 목록에서 찾을 수 없습니다.' }
  }

  return { success: true }
}

/**
 * 발신자 차단 해제 (ID로)
 */
export function removeBlockedSenderById(
  accountEmail: string,
  id: string
): { success: boolean; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()

  const result = db
    .prepare('DELETE FROM blocked_senders WHERE id = ? AND account_id = ?')
    .run(id, accountId)

  if (result.changes === 0) {
    return { success: false, error: '차단 목록에서 찾을 수 없습니다.' }
  }

  return { success: true }
}

// =====================================================
// 차단 도메인 CRUD
// =====================================================

/**
 * 도메인 차단
 */
export function addBlockedDomain(
  accountEmail: string,
  domain: string
): { success: boolean; blockedDomain?: BlockedDomain; error?: string } {
  const accountId = getOrCreateAccountId(accountEmail)
  const db = getStorageDatabase().getDatabase()

  const domainLower = domain.toLowerCase()

  // 이미 차단되어 있는지 확인
  const existing = db
    .prepare('SELECT id FROM blocked_domains WHERE account_id = ? AND LOWER(domain) = ?')
    .get(accountId, domainLower)

  if (existing) {
    return { success: false, error: '이미 차단된 도메인입니다.' }
  }

  const id = uuidv4()
  const now = Date.now()

  db.prepare(
    'INSERT INTO blocked_domains (id, account_id, domain, added_at) VALUES (?, ?, ?, ?)'
  ).run(id, accountId, domainLower, now)

  return {
    success: true,
    blockedDomain: {
      id,
      domain: domainLower,
      addedAt: now
    }
  }
}

/**
 * 도메인 차단 해제
 */
export function removeBlockedDomain(
  accountEmail: string,
  domain: string
): { success: boolean; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()
  const domainLower = domain.toLowerCase()

  const result = db
    .prepare('DELETE FROM blocked_domains WHERE account_id = ? AND LOWER(domain) = ?')
    .run(accountId, domainLower)

  if (result.changes === 0) {
    return { success: false, error: '차단 목록에서 찾을 수 없습니다.' }
  }

  return { success: true }
}

/**
 * 도메인 차단 해제 (ID로)
 */
export function removeBlockedDomainById(
  accountEmail: string,
  id: string
): { success: boolean; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()

  const result = db
    .prepare('DELETE FROM blocked_domains WHERE id = ? AND account_id = ?')
    .run(id, accountId)

  if (result.changes === 0) {
    return { success: false, error: '차단 목록에서 찾을 수 없습니다.' }
  }

  return { success: true }
}

// =====================================================
// 이메일 차단 확인
// =====================================================

/**
 * 이메일 차단 여부 확인
 */
export function isEmailBlocked(accountEmail: string, senderEmail: string): boolean {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return false
  }

  const db = getStorageDatabase().getDatabase()
  const senderLower = senderEmail.toLowerCase()

  // 발신자 직접 차단 확인
  const blockedSender = db
    .prepare('SELECT 1 FROM blocked_senders WHERE account_id = ? AND LOWER(email) = ?')
    .get(accountId, senderLower)

  if (blockedSender) {
    return true
  }

  // 도메인 차단 확인
  const domain = senderLower.split('@')[1]
  if (domain) {
    const blockedDomain = db
      .prepare('SELECT 1 FROM blocked_domains WHERE account_id = ? AND LOWER(domain) = ?')
      .get(accountId, domain)

    if (blockedDomain) {
      return true
    }
  }

  return false
}

/**
 * 여러 이메일의 차단 여부 일괄 확인
 */
export function checkBlockedEmails(accountEmail: string, senderEmails: string[]): Set<string> {
  const accountId = getAccountId(accountEmail)
  if (!accountId || senderEmails.length === 0) {
    return new Set()
  }

  const db = getStorageDatabase().getDatabase()
  const blocked = new Set<string>()

  const emailsLower = senderEmails.map((e) => e.toLowerCase())
  const domains = [...new Set(emailsLower.map((e) => e.split('@')[1]).filter(Boolean))]

  // 발신자 직접 차단 확인
  const emailPlaceholders = emailsLower.map(() => '?').join(', ')
  const blockedSenders = db
    .prepare(
      `SELECT email FROM blocked_senders WHERE account_id = ? AND LOWER(email) IN (${emailPlaceholders})`
    )
    .all(accountId, ...emailsLower) as { email: string }[]

  for (const s of blockedSenders) {
    blocked.add(s.email.toLowerCase())
  }

  // 도메인 차단 확인
  if (domains.length > 0) {
    const domainPlaceholders = domains.map(() => '?').join(', ')
    const blockedDomains = db
      .prepare(
        `SELECT domain FROM blocked_domains WHERE account_id = ? AND LOWER(domain) IN (${domainPlaceholders})`
      )
      .all(accountId, ...domains) as { domain: string }[]

    const blockedDomainSet = new Set(blockedDomains.map((d) => d.domain.toLowerCase()))

    for (const email of emailsLower) {
      const domain = email.split('@')[1]
      if (domain && blockedDomainSet.has(domain)) {
        blocked.add(email)
      }
    }
  }

  return blocked
}
