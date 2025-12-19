/**
 * 서명 SQLite Repository
 * - signatures, signature_settings 테이블 관리
 */
import { getStorageDatabase } from './database'
import { getOrCreateAccountId, getAccountId } from './account-helper'
import { v4 as uuidv4 } from 'uuid'

// =====================================================
// 타입 정의
// =====================================================

export interface Signature {
  id: string
  name: string
  content: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface SignatureSettings {
  enabled: boolean
  signatures: Signature[]
  defaultSignatureId?: string
  includeInReply: boolean
  includeInForward: boolean
}

interface SignatureRow {
  id: string
  account_id: string
  name: string
  content: string
  is_default: number
  created_at: number
  updated_at: number
}

interface SignatureSettingsRow {
  account_id: string
  enabled: number
  include_in_reply: number
  include_in_forward: number
}

// =====================================================
// 서명 설정 CRUD
// =====================================================

/**
 * 서명 설정 조회
 */
export function getSignatureSettings(accountEmail: string): SignatureSettings {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return getDefaultSignatureSettings()
  }

  const db = getStorageDatabase().getDatabase()

  // 설정 조회
  const settings = db
    .prepare('SELECT * FROM signature_settings WHERE account_id = ?')
    .get(accountId) as SignatureSettingsRow | undefined

  // 서명 목록 조회
  const signatureRows = db
    .prepare('SELECT * FROM signatures WHERE account_id = ? ORDER BY name')
    .all(accountId) as SignatureRow[]

  const signatures = signatureRows.map(rowToSignature)
  const defaultSignature = signatures.find((s) => s.isDefault)

  return {
    enabled: settings?.enabled === 1,
    signatures,
    defaultSignatureId: defaultSignature?.id,
    includeInReply: settings?.include_in_reply === 1,
    includeInForward: settings?.include_in_forward === 1
  }
}

/**
 * 기본 서명 설정
 */
export const defaultSignatureSettings: SignatureSettings = {
  enabled: false,
  signatures: [],
  defaultSignatureId: undefined,
  includeInReply: true,
  includeInForward: true
}

function getDefaultSignatureSettings(): SignatureSettings {
  return { ...defaultSignatureSettings }
}

/**
 * 서명 설정 업데이트
 */
export function updateSignatureSettings(
  accountEmail: string,
  updates: Partial<Pick<SignatureSettings, 'enabled' | 'includeInReply' | 'includeInForward'>>
): { success: boolean; settings?: SignatureSettings; error?: string } {
  const accountId = getOrCreateAccountId(accountEmail)
  const db = getStorageDatabase().getDatabase()

  // 기존 설정 확인
  const existing = db
    .prepare('SELECT * FROM signature_settings WHERE account_id = ?')
    .get(accountId) as SignatureSettingsRow | undefined

  if (existing) {
    // 업데이트
    const fields: string[] = []
    const values: (string | number)[] = []

    if (updates.enabled !== undefined) {
      fields.push('enabled = ?')
      values.push(updates.enabled ? 1 : 0)
    }
    if (updates.includeInReply !== undefined) {
      fields.push('include_in_reply = ?')
      values.push(updates.includeInReply ? 1 : 0)
    }
    if (updates.includeInForward !== undefined) {
      fields.push('include_in_forward = ?')
      values.push(updates.includeInForward ? 1 : 0)
    }

    if (fields.length > 0) {
      values.push(accountId)
      db.prepare(`UPDATE signature_settings SET ${fields.join(', ')} WHERE account_id = ?`).run(
        ...values
      )
    }
  } else {
    // 새로 생성
    db.prepare(
      'INSERT INTO signature_settings (account_id, enabled, include_in_reply, include_in_forward) VALUES (?, ?, ?, ?)'
    ).run(
      accountId,
      updates.enabled ? 1 : 0,
      updates.includeInReply !== false ? 1 : 0,
      updates.includeInForward !== false ? 1 : 0
    )
  }

  return { success: true, settings: getSignatureSettings(accountEmail) }
}

/**
 * 서명 설정 초기화
 */
export function resetSignatureSettings(accountEmail: string): { success: boolean } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: true }
  }

  const db = getStorageDatabase().getDatabase()

  db.transaction(() => {
    db.prepare('DELETE FROM signature_settings WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM signatures WHERE account_id = ?').run(accountId)
  })()

  return { success: true }
}

// =====================================================
// 서명 CRUD
// =====================================================

/**
 * 서명 추가
 */
export function addSignature(
  accountEmail: string,
  name: string,
  content: string,
  isDefault: boolean = false
): { success: boolean; signature?: Signature; error?: string } {
  const accountId = getOrCreateAccountId(accountEmail)
  const db = getStorageDatabase().getDatabase()

  // 이름 중복 체크
  const existing = db
    .prepare('SELECT id FROM signatures WHERE account_id = ? AND name = ?')
    .get(accountId, name)

  if (existing) {
    return { success: false, error: '이미 존재하는 서명 이름입니다.' }
  }

  const id = uuidv4()
  const now = Date.now()

  db.transaction(() => {
    // 기본 서명으로 설정할 경우 기존 기본 서명 해제
    if (isDefault) {
      db.prepare('UPDATE signatures SET is_default = 0 WHERE account_id = ?').run(accountId)
    }

    db.prepare(
      'INSERT INTO signatures (id, account_id, name, content, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, accountId, name, content, isDefault ? 1 : 0, now, now)
  })()

  return {
    success: true,
    signature: {
      id,
      name,
      content,
      isDefault,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString()
    }
  }
}

/**
 * 서명 수정
 */
export function updateSignature(
  accountEmail: string,
  id: string,
  updates: Partial<Pick<Signature, 'name' | 'content' | 'isDefault'>>
): { success: boolean; signature?: Signature; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()

  const existing = db
    .prepare('SELECT * FROM signatures WHERE id = ? AND account_id = ?')
    .get(id, accountId) as SignatureRow | undefined

  if (!existing) {
    return { success: false, error: '서명을 찾을 수 없습니다.' }
  }

  // 이름 중복 체크
  if (updates.name) {
    const duplicate = db
      .prepare('SELECT id FROM signatures WHERE account_id = ? AND name = ? AND id != ?')
      .get(accountId, updates.name, id)

    if (duplicate) {
      return { success: false, error: '이미 존재하는 서명 이름입니다.' }
    }
  }

  const now = Date.now()

  db.transaction(() => {
    // 기본 서명으로 설정할 경우 기존 기본 서명 해제
    if (updates.isDefault) {
      db.prepare('UPDATE signatures SET is_default = 0 WHERE account_id = ?').run(accountId)
    }

    const fields: string[] = ['updated_at = ?']
    const values: (string | number)[] = [now]

    if (updates.name !== undefined) {
      fields.push('name = ?')
      values.push(updates.name)
    }
    if (updates.content !== undefined) {
      fields.push('content = ?')
      values.push(updates.content)
    }
    if (updates.isDefault !== undefined) {
      fields.push('is_default = ?')
      values.push(updates.isDefault ? 1 : 0)
    }

    values.push(id)
    db.prepare(`UPDATE signatures SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  })()

  const updatedRow = db.prepare('SELECT * FROM signatures WHERE id = ?').get(id) as SignatureRow
  return { success: true, signature: rowToSignature(updatedRow) }
}

/**
 * 서명 삭제
 */
export function deleteSignature(
  accountEmail: string,
  id: string
): { success: boolean; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()
  const result = db
    .prepare('DELETE FROM signatures WHERE id = ? AND account_id = ?')
    .run(id, accountId)

  if (result.changes === 0) {
    return { success: false, error: '서명을 찾을 수 없습니다.' }
  }

  return { success: true }
}

/**
 * 기본 서명 설정
 */
export function setDefaultSignature(
  accountEmail: string,
  id: string
): { success: boolean; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()

  const existing = db
    .prepare('SELECT id FROM signatures WHERE id = ? AND account_id = ?')
    .get(id, accountId)

  if (!existing) {
    return { success: false, error: '서명을 찾을 수 없습니다.' }
  }

  db.transaction(() => {
    db.prepare('UPDATE signatures SET is_default = 0 WHERE account_id = ?').run(accountId)
    db.prepare('UPDATE signatures SET is_default = 1 WHERE id = ?').run(id)
  })()

  return { success: true }
}

/**
 * 기본 서명 조회
 */
export function getDefaultSignature(accountEmail: string): Signature | null {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return null
  }

  const db = getStorageDatabase().getDatabase()

  const row = db
    .prepare('SELECT * FROM signatures WHERE account_id = ? AND is_default = 1')
    .get(accountId) as SignatureRow | undefined

  return row ? rowToSignature(row) : null
}

// =====================================================
// 헬퍼 함수
// =====================================================

function rowToSignature(row: SignatureRow): Signature {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    isDefault: row.is_default === 1,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  }
}
