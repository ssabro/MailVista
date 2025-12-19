/**
 * VIP 발신자 SQLite Repository
 * - vip_senders 테이블 관리
 */
import { getStorageDatabase } from './database'
import { getOrCreateAccountId, getAccountId } from './account-helper'
import { v4 as uuidv4 } from 'uuid'

// =====================================================
// 타입 정의
// =====================================================

export interface VipSender {
  id: string
  email: string
  name: string
  addedAt: string
}

interface VipSenderRow {
  id: string
  account_id: string
  email: string
  name: string | null
  added_at: number
}

// =====================================================
// VIP CRUD
// =====================================================

/**
 * VIP 목록 조회
 */
export function getVipSenders(accountEmail: string): VipSender[] {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return []
  }

  const db = getStorageDatabase().getDatabase()

  const rows = db
    .prepare('SELECT * FROM vip_senders WHERE account_id = ? ORDER BY name, email')
    .all(accountId) as VipSenderRow[]

  return rows.map(rowToVipSender)
}

/**
 * VIP 추가
 */
export function addVipSender(
  accountEmail: string,
  email: string,
  name: string
): { success: boolean; vipSender?: VipSender; error?: string } {
  const accountId = getOrCreateAccountId(accountEmail)
  const db = getStorageDatabase().getDatabase()

  const emailLower = email.toLowerCase()

  // 이미 VIP인지 확인
  const existing = db
    .prepare('SELECT id FROM vip_senders WHERE account_id = ? AND LOWER(email) = ?')
    .get(accountId, emailLower)

  if (existing) {
    return { success: false, error: '이미 VIP로 등록된 발신자입니다.' }
  }

  const id = uuidv4()
  const now = Date.now()

  db.prepare(
    'INSERT INTO vip_senders (id, account_id, email, name, added_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, accountId, emailLower, name || null, now)

  const newVip: VipSender = {
    id,
    email: emailLower,
    name,
    addedAt: new Date(now).toISOString()
  }

  return { success: true, vipSender: newVip }
}

/**
 * VIP 삭제
 */
export function removeVipSender(
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
    .prepare('DELETE FROM vip_senders WHERE account_id = ? AND LOWER(email) = ?')
    .run(accountId, emailLower)

  if (result.changes === 0) {
    return { success: false, error: 'VIP 목록에서 찾을 수 없습니다.' }
  }

  return { success: true }
}

/**
 * VIP 삭제 (ID로)
 */
export function removeVipSenderById(
  accountEmail: string,
  id: string
): { success: boolean; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()

  const result = db
    .prepare('DELETE FROM vip_senders WHERE id = ? AND account_id = ?')
    .run(id, accountId)

  if (result.changes === 0) {
    return { success: false, error: 'VIP 목록에서 찾을 수 없습니다.' }
  }

  return { success: true }
}

/**
 * VIP 여부 확인
 */
export function isVipSender(accountEmail: string, email: string): boolean {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return false
  }

  const db = getStorageDatabase().getDatabase()
  const emailLower = email.toLowerCase()

  const result = db
    .prepare('SELECT 1 FROM vip_senders WHERE account_id = ? AND LOWER(email) = ?')
    .get(accountId, emailLower)

  return !!result
}

/**
 * VIP 토글
 */
export function toggleVipSender(
  accountEmail: string,
  email: string,
  name: string
): { success: boolean; isVip: boolean; error?: string } {
  if (isVipSender(accountEmail, email)) {
    const result = removeVipSender(accountEmail, email)
    return { ...result, isVip: false }
  } else {
    const result = addVipSender(accountEmail, email, name)
    return { success: result.success, isVip: true, error: result.error }
  }
}

/**
 * 여러 이메일의 VIP 여부 일괄 확인
 */
export function checkVipSenders(accountEmail: string, emails: string[]): Set<string> {
  const accountId = getAccountId(accountEmail)
  if (!accountId || emails.length === 0) {
    return new Set()
  }

  const db = getStorageDatabase().getDatabase()
  const emailsLower = emails.map((e) => e.toLowerCase())
  const placeholders = emailsLower.map(() => '?').join(', ')

  const rows = db
    .prepare(
      `SELECT email FROM vip_senders WHERE account_id = ? AND LOWER(email) IN (${placeholders})`
    )
    .all(accountId, ...emailsLower) as { email: string }[]

  return new Set(rows.map((r) => r.email.toLowerCase()))
}

// =====================================================
// 헬퍼 함수
// =====================================================

function rowToVipSender(row: VipSenderRow): VipSender {
  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    addedAt: new Date(row.added_at).toISOString()
  }
}
