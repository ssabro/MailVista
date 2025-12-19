/**
 * 계정 관련 헬퍼 함수
 * - 이메일 주소와 account_id 간 매핑
 */
import { getStorageDatabase } from './database'
import { v4 as uuidv4 } from 'uuid'

interface AccountRow {
  id: string
  email: string
  name: string
}

/**
 * 이메일 주소로 account_id 조회 (없으면 생성)
 */
export function getOrCreateAccountId(email: string, name?: string): string {
  const db = getStorageDatabase().getDatabase()

  // 기존 계정 조회
  const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email) as
    | { id: string }
    | undefined

  if (existing) {
    return existing.id
  }

  // 새 계정 생성
  const id = uuidv4()
  const now = Date.now()
  db.prepare(
    'INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, email, name || email.split('@')[0], now, now)

  return id
}

/**
 * 이메일 주소로 account_id 조회 (없으면 null)
 */
export function getAccountId(email: string): string | null {
  const db = getStorageDatabase().getDatabase()

  const result = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email) as
    | { id: string }
    | undefined

  return result?.id || null
}

/**
 * account_id로 이메일 주소 조회
 */
export function getAccountEmail(accountId: string): string | null {
  const db = getStorageDatabase().getDatabase()

  const result = db.prepare('SELECT email FROM accounts WHERE id = ?').get(accountId) as
    | { email: string }
    | undefined

  return result?.email || null
}

/**
 * 모든 계정 목록 조회
 */
export function getAllAccounts(): AccountRow[] {
  const db = getStorageDatabase().getDatabase()

  return db.prepare('SELECT id, email, name FROM accounts').all() as AccountRow[]
}

/**
 * 계정 이름 업데이트
 */
export function updateAccountName(email: string, name: string): boolean {
  const db = getStorageDatabase().getDatabase()

  const result = db
    .prepare('UPDATE accounts SET name = ?, updated_at = ? WHERE email = ?')
    .run(name, Date.now(), email)

  return result.changes > 0
}
