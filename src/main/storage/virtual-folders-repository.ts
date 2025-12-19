/**
 * 가상 폴더 SQLite Repository
 * - virtual_folders, virtual_folder_conditions 테이블 관리
 */
import type Database from 'better-sqlite3'
import { getStorageDatabase } from './database'
import { getOrCreateAccountId, getAccountId } from './account-helper'
import { v4 as uuidv4 } from 'uuid'

// =====================================================
// 타입 정의
// =====================================================

export interface VirtualFolderCondition {
  field: 'from' | 'to' | 'subject' | 'body' | 'hasAttachment' | 'isUnread' | 'isStarred' | 'date'
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'before' | 'after' | 'is'
  value: string | boolean
}

export interface VirtualFolder {
  id: string
  name: string
  icon: string
  color: string
  conditions: VirtualFolderCondition[]
  conditionLogic: 'and' | 'or'
  createdAt: number
  updatedAt: number
}

interface VirtualFolderRow {
  id: string
  account_id: string
  name: string
  icon: string | null
  color: string | null
  condition_logic: string
  created_at: number
  updated_at: number
}

interface ConditionRow {
  id: string
  virtual_folder_id: string
  field: string
  operator: string
  value: string
}

// =====================================================
// 가상 폴더 CRUD
// =====================================================

/**
 * 가상 폴더 목록 조회
 */
export function getVirtualFolders(accountEmail: string): VirtualFolder[] {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return []
  }

  const db = getStorageDatabase().getDatabase()

  const rows = db
    .prepare('SELECT * FROM virtual_folders WHERE account_id = ? ORDER BY name')
    .all(accountId) as VirtualFolderRow[]

  return rows.map((row) => rowToVirtualFolder(db, row))
}

/**
 * 가상 폴더 조회 (ID로)
 */
export function getVirtualFolderById(accountEmail: string, id: string): VirtualFolder | null {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return null
  }

  const db = getStorageDatabase().getDatabase()

  const row = db
    .prepare('SELECT * FROM virtual_folders WHERE id = ? AND account_id = ?')
    .get(id, accountId) as VirtualFolderRow | undefined

  return row ? rowToVirtualFolder(db, row) : null
}

/**
 * 가상 폴더 추가
 */
export function addVirtualFolder(
  accountEmail: string,
  folder: Omit<VirtualFolder, 'id' | 'createdAt' | 'updatedAt'>
): { success: boolean; folder?: VirtualFolder; error?: string } {
  const accountId = getOrCreateAccountId(accountEmail)
  const db = getStorageDatabase().getDatabase()

  // 이름 중복 체크
  const existing = db
    .prepare('SELECT id FROM virtual_folders WHERE account_id = ? AND name = ?')
    .get(accountId, folder.name)

  if (existing) {
    return { success: false, error: '이미 존재하는 가상 폴더 이름입니다.' }
  }

  const id = uuidv4()
  const now = Date.now()

  db.transaction(() => {
    // 폴더 추가
    db.prepare(
      `
      INSERT INTO virtual_folders (id, account_id, name, icon, color, condition_logic, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      accountId,
      folder.name,
      folder.icon || null,
      folder.color || null,
      folder.conditionLogic,
      now,
      now
    )

    // 조건 추가
    const insertCondition = db.prepare(
      'INSERT INTO virtual_folder_conditions (id, virtual_folder_id, field, operator, value) VALUES (?, ?, ?, ?, ?)'
    )
    for (const condition of folder.conditions) {
      insertCondition.run(uuidv4(), id, condition.field, condition.operator, condition.value)
    }
  })()

  const newFolder: VirtualFolder = {
    id,
    name: folder.name,
    icon: folder.icon,
    color: folder.color,
    conditions: folder.conditions,
    conditionLogic: folder.conditionLogic,
    createdAt: now,
    updatedAt: now
  }

  return { success: true, folder: newFolder }
}

/**
 * 가상 폴더 생성 (별칭 - 기존 API 호환)
 */
export function createVirtualFolder(
  accountEmail: string,
  data: Omit<VirtualFolder, 'id' | 'createdAt' | 'updatedAt'>
): { success: boolean; folder?: VirtualFolder; error?: string } {
  const result = addVirtualFolder(accountEmail, data)
  // error 코드 변환
  if (!result.success && result.error === '이미 존재하는 가상 폴더 이름입니다.') {
    return { success: false, error: 'duplicate_name' }
  }
  return result
}

/**
 * 가상 폴더 수정
 */
export function updateVirtualFolder(
  accountEmail: string,
  id: string,
  updates: Partial<Omit<VirtualFolder, 'id' | 'createdAt'>>
): { success: boolean; folder?: VirtualFolder; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()

  const existing = db
    .prepare('SELECT * FROM virtual_folders WHERE id = ? AND account_id = ?')
    .get(id, accountId) as VirtualFolderRow | undefined

  if (!existing) {
    return { success: false, error: '가상 폴더를 찾을 수 없습니다.' }
  }

  // 이름 중복 체크
  if (updates.name) {
    const duplicate = db
      .prepare('SELECT id FROM virtual_folders WHERE account_id = ? AND name = ? AND id != ?')
      .get(accountId, updates.name, id)

    if (duplicate) {
      return { success: false, error: '이미 존재하는 가상 폴더 이름입니다.' }
    }
  }

  const now = Date.now()

  db.transaction(() => {
    const fields: string[] = ['updated_at = ?']
    const values: (string | number | null)[] = [now]

    if (updates.name !== undefined) {
      fields.push('name = ?')
      values.push(updates.name)
    }
    if (updates.icon !== undefined) {
      fields.push('icon = ?')
      values.push(updates.icon || null)
    }
    if (updates.color !== undefined) {
      fields.push('color = ?')
      values.push(updates.color || null)
    }
    if (updates.conditionLogic !== undefined) {
      fields.push('condition_logic = ?')
      values.push(updates.conditionLogic)
    }

    values.push(id)
    db.prepare(`UPDATE virtual_folders SET ${fields.join(', ')} WHERE id = ?`).run(...values)

    // 조건 업데이트
    if (updates.conditions !== undefined) {
      db.prepare('DELETE FROM virtual_folder_conditions WHERE virtual_folder_id = ?').run(id)

      const insertCondition = db.prepare(
        'INSERT INTO virtual_folder_conditions (id, virtual_folder_id, field, operator, value) VALUES (?, ?, ?, ?, ?)'
      )
      for (const condition of updates.conditions) {
        insertCondition.run(uuidv4(), id, condition.field, condition.operator, condition.value)
      }
    }
  })()

  const updatedRow = db
    .prepare('SELECT * FROM virtual_folders WHERE id = ?')
    .get(id) as VirtualFolderRow
  return { success: true, folder: rowToVirtualFolder(db, updatedRow) }
}

/**
 * 가상 폴더 삭제
 */
export function deleteVirtualFolder(
  accountEmail: string,
  id: string
): { success: boolean; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()
  const result = db
    .prepare('DELETE FROM virtual_folders WHERE id = ? AND account_id = ?')
    .run(id, accountId)

  if (result.changes === 0) {
    return { success: false, error: '가상 폴더를 찾을 수 없습니다.' }
  }

  return { success: true }
}

// =====================================================
// 헬퍼 함수
// =====================================================

function rowToVirtualFolder(db: Database.Database, row: VirtualFolderRow): VirtualFolder {
  // 조건 조회
  const conditionRows = db
    .prepare('SELECT * FROM virtual_folder_conditions WHERE virtual_folder_id = ?')
    .all(row.id) as ConditionRow[]

  const conditions: VirtualFolderCondition[] = conditionRows.map((c) => ({
    field: c.field as VirtualFolderCondition['field'],
    operator: c.operator as VirtualFolderCondition['operator'],
    value: c.value === 'true' ? true : c.value === 'false' ? false : c.value
  }))

  return {
    id: row.id,
    name: row.name,
    icon: row.icon || '',
    color: row.color || '',
    conditions,
    conditionLogic: row.condition_logic as 'and' | 'or',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
