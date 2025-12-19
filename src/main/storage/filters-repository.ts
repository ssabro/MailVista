/**
 * 메일 필터 SQLite Repository
 * - mail_filters, filter_conditions 테이블 관리
 */
import type Database from 'better-sqlite3'
import { getStorageDatabase } from './database'
import { getOrCreateAccountId, getAccountId } from './account-helper'
import { v4 as uuidv4 } from 'uuid'

// =====================================================
// 타입 정의
// =====================================================

export type FilterConditionField =
  | 'fromName'
  | 'fromAddress'
  | 'toName'
  | 'toAddress'
  | 'subject'
  | 'body'

export type FilterConditionOperator = 'contains' | 'equals' | 'startsWith' | 'endsWith'

export type FilterAction = 'move' | 'delete' | 'markRead' | 'markStarred'

export interface FilterCondition {
  id?: string
  field: FilterConditionField
  operator: FilterConditionOperator
  value: string
}

export interface MailFilter {
  id: string
  name: string
  enabled: boolean
  conditions: FilterCondition[]
  matchAll: boolean // true = AND, false = OR
  action: FilterAction
  targetFolder?: string
  priority: number
  createdAt: number
  updatedAt?: number
}

interface FilterRow {
  id: string
  account_id: string
  name: string
  enabled: number
  match_type: string
  action: string
  target_folder: string | null
  priority: number
  created_at: number
  updated_at: number
}

interface ConditionRow {
  id: string
  filter_id: string
  field: string
  operator: string
  value: string
}

// =====================================================
// 필터 CRUD
// =====================================================

/**
 * 필터 목록 조회
 */
export function getMailFilters(accountEmail: string): MailFilter[] {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return []
  }

  const db = getStorageDatabase().getDatabase()

  const rows = db
    .prepare('SELECT * FROM mail_filters WHERE account_id = ? ORDER BY priority DESC, created_at')
    .all(accountId) as FilterRow[]

  return rows.map((row) => rowToFilter(db, row))
}

/**
 * 활성화된 필터만 조회
 */
export function getEnabledFilters(accountEmail: string): MailFilter[] {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return []
  }

  const db = getStorageDatabase().getDatabase()

  const rows = db
    .prepare(
      'SELECT * FROM mail_filters WHERE account_id = ? AND enabled = 1 ORDER BY priority DESC, created_at'
    )
    .all(accountId) as FilterRow[]

  return rows.map((row) => rowToFilter(db, row))
}

// 두 필터 조건이 동일한지 비교
function areConditionsEqual(cond1: FilterCondition[], cond2: FilterCondition[]): boolean {
  if (cond1.length !== cond2.length) return false

  const sortConditions = (conditions: FilterCondition[]) =>
    [...conditions].sort((a, b) => {
      const fieldCompare = a.field.localeCompare(b.field)
      if (fieldCompare !== 0) return fieldCompare
      const opCompare = a.operator.localeCompare(b.operator)
      if (opCompare !== 0) return opCompare
      return a.value.localeCompare(b.value)
    })

  const sorted1 = sortConditions(cond1)
  const sorted2 = sortConditions(cond2)

  return sorted1.every(
    (cond, i) =>
      cond.field === sorted2[i].field &&
      cond.operator === sorted2[i].operator &&
      cond.value.toLowerCase() === sorted2[i].value.toLowerCase()
  )
}

/**
 * 중복 필터 찾기
 */
export function findDuplicateFilter(
  accountEmail: string,
  filter: Omit<MailFilter, 'id' | 'createdAt'>
): MailFilter | null {
  const filters = getMailFilters(accountEmail)

  return (
    filters.find((existing) => {
      if (existing.action !== filter.action) return false
      if (filter.action === 'move' && existing.targetFolder !== filter.targetFolder) return false
      if (existing.matchAll !== filter.matchAll) return false
      return areConditionsEqual(existing.conditions, filter.conditions)
    }) || null
  )
}

/**
 * 필터 추가
 */
export function addMailFilter(
  accountEmail: string,
  filter: Omit<MailFilter, 'id' | 'createdAt'>
): {
  success: boolean
  filter?: MailFilter
  error?: string
  isDuplicate?: boolean
  existingFilter?: MailFilter
} {
  console.log('[filters-repository:addMailFilter] === START ===')
  console.log('[filters-repository:addMailFilter] accountEmail:', accountEmail)
  console.log('[filters-repository:addMailFilter] filter:', JSON.stringify(filter, null, 2))

  try {
    // 중복 필터 검사
    console.log('[filters-repository:addMailFilter] Checking for duplicate filters...')
    const duplicateFilter = findDuplicateFilter(accountEmail, filter)
    if (duplicateFilter) {
      console.log('[filters-repository:addMailFilter] Duplicate filter found:', duplicateFilter.name)
      return {
        success: false,
        error: 'duplicate_filter',
        isDuplicate: true,
        existingFilter: duplicateFilter
      }
    }
    console.log('[filters-repository:addMailFilter] No duplicate found')

    const accountId = getOrCreateAccountId(accountEmail)
    console.log('[filters-repository:addMailFilter] accountId:', accountId)

    const db = getStorageDatabase().getDatabase()
    console.log('[filters-repository:addMailFilter] Database obtained')

    const id = uuidv4()
    const now = Date.now()
    console.log('[filters-repository:addMailFilter] Generated filter id:', id)

    db.transaction(() => {
      console.log('[filters-repository:addMailFilter] Starting transaction...')
      // 필터 추가
      db.prepare(
        `
        INSERT INTO mail_filters (id, account_id, name, enabled, match_type, action, target_folder, priority, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        id,
        accountId,
        filter.name,
        filter.enabled ? 1 : 0,
        filter.matchAll ? 'all' : 'any',
        filter.action,
        filter.targetFolder || null,
        filter.priority || 0,
        now,
        now
      )
      console.log('[filters-repository:addMailFilter] Filter row inserted')

      // 조건 추가
      const insertCondition = db.prepare(
        'INSERT INTO filter_conditions (id, filter_id, field, operator, value) VALUES (?, ?, ?, ?, ?)'
      )
      for (const condition of filter.conditions) {
        const conditionId = uuidv4()
        insertCondition.run(conditionId, id, condition.field, condition.operator, condition.value)
        console.log('[filters-repository:addMailFilter] Condition inserted:', {
          conditionId,
          field: condition.field,
          operator: condition.operator,
          value: condition.value
        })
      }
      console.log('[filters-repository:addMailFilter] Transaction completed')
    })()

    const newFilter: MailFilter = {
      id,
      ...filter,
      priority: filter.priority || 0,
      createdAt: now
    }

    console.log('[filters-repository:addMailFilter] Filter created successfully:', newFilter.id)
    console.log('[filters-repository:addMailFilter] === END ===')
    return { success: true, filter: newFilter }
  } catch (error) {
    console.error('[filters-repository:addMailFilter] Error:', error)
    console.error('[filters-repository:addMailFilter] Stack:', error instanceof Error ? error.stack : 'N/A')
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * 필터 수정
 */
export function updateMailFilter(
  accountEmail: string,
  id: string,
  updates: Partial<Omit<MailFilter, 'id' | 'createdAt'>>
): { success: boolean; filter?: MailFilter; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()

  const existing = db
    .prepare('SELECT * FROM mail_filters WHERE id = ? AND account_id = ?')
    .get(id, accountId) as FilterRow | undefined

  if (!existing) {
    return { success: false, error: 'Filter not found' }
  }

  const now = Date.now()

  db.transaction(() => {
    const fields: string[] = ['updated_at = ?']
    const values: (string | number | null)[] = [now]

    if (updates.name !== undefined) {
      fields.push('name = ?')
      values.push(updates.name)
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?')
      values.push(updates.enabled ? 1 : 0)
    }
    if (updates.matchAll !== undefined) {
      fields.push('match_type = ?')
      values.push(updates.matchAll ? 'all' : 'any')
    }
    if (updates.action !== undefined) {
      fields.push('action = ?')
      values.push(updates.action)
    }
    if (updates.targetFolder !== undefined) {
      fields.push('target_folder = ?')
      values.push(updates.targetFolder || null)
    }
    if (updates.priority !== undefined) {
      fields.push('priority = ?')
      values.push(updates.priority)
    }

    values.push(id)
    db.prepare(`UPDATE mail_filters SET ${fields.join(', ')} WHERE id = ?`).run(...values)

    // 조건 업데이트
    if (updates.conditions !== undefined) {
      db.prepare('DELETE FROM filter_conditions WHERE filter_id = ?').run(id)

      const insertCondition = db.prepare(
        'INSERT INTO filter_conditions (id, filter_id, field, operator, value) VALUES (?, ?, ?, ?, ?)'
      )
      for (const condition of updates.conditions) {
        insertCondition.run(uuidv4(), id, condition.field, condition.operator, condition.value)
      }
    }
  })()

  const updatedRow = db.prepare('SELECT * FROM mail_filters WHERE id = ?').get(id) as FilterRow
  return { success: true, filter: rowToFilter(db, updatedRow) }
}

/**
 * 필터 삭제
 */
export function deleteMailFilter(
  accountEmail: string,
  id: string
): { success: boolean; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()
  const result = db
    .prepare('DELETE FROM mail_filters WHERE id = ? AND account_id = ?')
    .run(id, accountId)

  if (result.changes === 0) {
    return { success: false, error: '필터를 찾을 수 없습니다.' }
  }

  return { success: true }
}

/**
 * 필터 활성화/비활성화 토글
 */
export function toggleMailFilter(
  accountEmail: string,
  id: string
): { success: boolean; filter?: MailFilter; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()

  const existing = db
    .prepare('SELECT * FROM mail_filters WHERE id = ? AND account_id = ?')
    .get(id, accountId) as FilterRow | undefined

  if (!existing) {
    return { success: false, error: '필터를 찾을 수 없습니다.' }
  }

  const newEnabled = existing.enabled === 1 ? 0 : 1
  const now = Date.now()

  db.prepare('UPDATE mail_filters SET enabled = ?, updated_at = ? WHERE id = ?').run(
    newEnabled,
    now,
    id
  )

  const updatedRow = db.prepare('SELECT * FROM mail_filters WHERE id = ?').get(id) as FilterRow
  return { success: true, filter: rowToFilter(db, updatedRow) }
}

/**
 * 특정 폴더를 사용하는 필터 조회
 */
export function getFiltersUsingFolder(accountEmail: string, folderPath: string): MailFilter[] {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return []
  }

  const db = getStorageDatabase().getDatabase()

  const rows = db
    .prepare('SELECT * FROM mail_filters WHERE account_id = ? AND target_folder = ?')
    .all(accountId, folderPath) as FilterRow[]

  return rows.map((row) => rowToFilter(db, row))
}

/**
 * 필터의 대상 폴더 일괄 업데이트
 */
export function updateFiltersTargetFolder(
  accountEmail: string,
  oldFolder: string,
  newFolder: string
): { success: boolean; updatedCount: number } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, updatedCount: 0 }
  }

  const db = getStorageDatabase().getDatabase()
  const now = Date.now()

  const result = db
    .prepare(
      'UPDATE mail_filters SET target_folder = ?, updated_at = ? WHERE account_id = ? AND target_folder = ?'
    )
    .run(newFolder, now, accountId, oldFolder)

  return { success: true, updatedCount: result.changes }
}

/**
 * 특정 폴더를 사용하는 필터 삭제
 */
export function deleteFiltersUsingFolder(
  accountEmail: string,
  folderPath: string
): { success: boolean; deletedCount: number } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, deletedCount: 0 }
  }

  const db = getStorageDatabase().getDatabase()

  const result = db
    .prepare('DELETE FROM mail_filters WHERE account_id = ? AND target_folder = ?')
    .run(accountId, folderPath)

  return { success: true, deletedCount: result.changes }
}

// =====================================================
// 헬퍼 함수
// =====================================================

function rowToFilter(db: Database.Database, row: FilterRow): MailFilter {
  // 조건 조회
  const conditionRows = db
    .prepare('SELECT * FROM filter_conditions WHERE filter_id = ?')
    .all(row.id) as ConditionRow[]

  const conditions: FilterCondition[] = conditionRows.map((c) => ({
    id: c.id,
    field: c.field as FilterConditionField,
    operator: c.operator as FilterConditionOperator,
    value: c.value
  }))

  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    conditions,
    matchAll: row.match_type === 'all',
    action: row.action as FilterAction,
    targetFolder: row.target_folder || undefined,
    priority: row.priority,
    createdAt: row.created_at
  }
}
