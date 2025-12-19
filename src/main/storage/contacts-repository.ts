/**
 * 연락처 SQLite Repository
 * - contacts, contact_groups 테이블 관리
 */
import type Database from 'better-sqlite3'
import { getStorageDatabase } from './database'
import { getOrCreateAccountId, getAccountId } from './account-helper'
import { v4 as uuidv4 } from 'uuid'

// =====================================================
// 타입 정의
// =====================================================

export interface Contact {
  id: string
  name: string
  email: string
  phone?: string
  organization?: string
  memo?: string
  starred: boolean
  groupIds: string[]
  createdAt: string
  updatedAt: string
}

export interface ContactGroup {
  id: string
  name: string
  parentId?: string
  createdAt: string
}

interface ContactRow {
  id: string
  account_id: string
  name: string
  email: string
  phone: string | null
  organization: string | null
  memo: string | null
  starred: number
  created_at: number
  updated_at: number
}

interface ContactGroupRow {
  id: string
  account_id: string
  name: string
  parent_id: string | null
  created_at: number
}

// =====================================================
// 연락처 CRUD
// =====================================================

/**
 * 연락처 목록 조회
 */
export function getContacts(
  accountEmail: string,
  options?: {
    groupId?: string
    starred?: boolean
    search?: string
    sortBy?: 'name' | 'email' | 'organization' | 'createdAt'
    sortOrder?: 'asc' | 'desc'
    start?: number
    limit?: number
  }
): { contacts: Contact[]; total: number } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { contacts: [], total: 0 }
  }

  const db = getStorageDatabase().getDatabase()

  // 기본 쿼리
  let query = `
    SELECT DISTINCT c.* FROM contacts c
  `
  const params: (string | number)[] = []
  const conditions: string[] = ['c.account_id = ?']
  params.push(accountId)

  // 그룹 필터
  if (options?.groupId) {
    if (options.groupId === '__no_group__') {
      query += `
        LEFT JOIN contact_group_members cgm ON c.id = cgm.contact_id
      `
      conditions.push('cgm.contact_id IS NULL')
    } else {
      query += `
        JOIN contact_group_members cgm ON c.id = cgm.contact_id
      `
      conditions.push('cgm.group_id = ?')
      params.push(options.groupId)
    }
  }

  // 즐겨찾기 필터
  if (options?.starred !== undefined) {
    conditions.push('c.starred = ?')
    params.push(options.starred ? 1 : 0)
  }

  // 검색
  if (options?.search) {
    const searchLower = `%${options.search.toLowerCase()}%`
    conditions.push(`(
      LOWER(c.name) LIKE ? OR
      LOWER(c.email) LIKE ? OR
      LOWER(c.organization) LIKE ? OR
      c.phone LIKE ?
    )`)
    params.push(searchLower, searchLower, searchLower, `%${options.search}%`)
  }

  query += ` WHERE ${conditions.join(' AND ')}`

  // 전체 개수 조회
  const countQuery = query.replace('SELECT DISTINCT c.*', 'SELECT COUNT(DISTINCT c.id) as count')
  const totalResult = db.prepare(countQuery).get(...params) as { count: number }
  const total = totalResult.count

  // 정렬
  const sortBy = options?.sortBy || 'name'
  const sortOrder = options?.sortOrder || 'asc'
  const sortColumn = sortBy === 'createdAt' ? 'c.created_at' : `c.${sortBy}`
  query += ` ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}`

  // 페이징
  if (options?.start !== undefined && options?.limit !== undefined) {
    query += ` LIMIT ? OFFSET ?`
    params.push(options.limit, options.start)
  }

  const rows = db.prepare(query).all(...params) as ContactRow[]

  // 그룹 ID 매핑
  const contacts = rows.map((row) => rowToContact(db, row))

  return { contacts, total }
}

/**
 * 연락처 추가
 */
export function addContact(
  accountEmail: string,
  contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>
): { success: boolean; contact?: Contact; error?: string } {
  const accountId = getOrCreateAccountId(accountEmail)
  const db = getStorageDatabase().getDatabase()

  // 이메일 중복 체크
  const existing = db
    .prepare('SELECT id FROM contacts WHERE account_id = ? AND LOWER(email) = LOWER(?)')
    .get(accountId, contact.email)

  if (existing) {
    return { success: false, error: '이미 등록된 이메일 주소입니다.' }
  }

  const id = uuidv4()
  const now = Date.now()

  db.transaction(() => {
    // 연락처 추가
    db.prepare(
      `
      INSERT INTO contacts (id, account_id, name, email, phone, organization, memo, starred, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      accountId,
      contact.name,
      contact.email,
      contact.phone || null,
      contact.organization || null,
      contact.memo || null,
      contact.starred ? 1 : 0,
      now,
      now
    )

    // 그룹 매핑 추가
    if (contact.groupIds && contact.groupIds.length > 0) {
      const insertGroupMember = db.prepare(
        'INSERT INTO contact_group_members (contact_id, group_id) VALUES (?, ?)'
      )
      for (const groupId of contact.groupIds) {
        insertGroupMember.run(id, groupId)
      }
    }
  })()

  const newContact: Contact = {
    id,
    ...contact,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString()
  }

  return { success: true, contact: newContact }
}

/**
 * 연락처 수정
 */
export function updateContact(
  accountEmail: string,
  id: string,
  updates: Partial<Omit<Contact, 'id' | 'createdAt'>>
): { success: boolean; contact?: Contact; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()

  // 연락처 존재 확인
  const existing = db
    .prepare('SELECT * FROM contacts WHERE id = ? AND account_id = ?')
    .get(id, accountId) as ContactRow | undefined

  if (!existing) {
    return { success: false, error: '연락처를 찾을 수 없습니다.' }
  }

  // 이메일 중복 체크 (자기 자신 제외)
  if (updates.email) {
    const duplicate = db
      .prepare(
        'SELECT id FROM contacts WHERE account_id = ? AND LOWER(email) = LOWER(?) AND id != ?'
      )
      .get(accountId, updates.email, id)

    if (duplicate) {
      return { success: false, error: '이미 등록된 이메일 주소입니다.' }
    }
  }

  const now = Date.now()

  db.transaction(() => {
    // 연락처 업데이트
    const fields: string[] = ['updated_at = ?']
    const values: (string | number | null)[] = [now]

    if (updates.name !== undefined) {
      fields.push('name = ?')
      values.push(updates.name)
    }
    if (updates.email !== undefined) {
      fields.push('email = ?')
      values.push(updates.email)
    }
    if (updates.phone !== undefined) {
      fields.push('phone = ?')
      values.push(updates.phone || null)
    }
    if (updates.organization !== undefined) {
      fields.push('organization = ?')
      values.push(updates.organization || null)
    }
    if (updates.memo !== undefined) {
      fields.push('memo = ?')
      values.push(updates.memo || null)
    }
    if (updates.starred !== undefined) {
      fields.push('starred = ?')
      values.push(updates.starred ? 1 : 0)
    }

    values.push(id)
    db.prepare(`UPDATE contacts SET ${fields.join(', ')} WHERE id = ?`).run(...values)

    // 그룹 매핑 업데이트
    if (updates.groupIds !== undefined) {
      db.prepare('DELETE FROM contact_group_members WHERE contact_id = ?').run(id)
      if (updates.groupIds.length > 0) {
        const insertGroupMember = db.prepare(
          'INSERT INTO contact_group_members (contact_id, group_id) VALUES (?, ?)'
        )
        for (const groupId of updates.groupIds) {
          insertGroupMember.run(id, groupId)
        }
      }
    }
  })()

  // 업데이트된 연락처 반환
  const updatedRow = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as ContactRow

  return { success: true, contact: rowToContact(db, updatedRow) }
}

/**
 * 연락처 삭제
 */
export function deleteContact(
  accountEmail: string,
  id: string
): { success: boolean; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()
  const result = db
    .prepare('DELETE FROM contacts WHERE id = ? AND account_id = ?')
    .run(id, accountId)

  if (result.changes === 0) {
    return { success: false, error: '연락처를 찾을 수 없습니다.' }
  }

  return { success: true }
}

/**
 * 여러 연락처 삭제
 */
export function deleteContacts(
  accountEmail: string,
  ids: string[]
): { success: boolean; deletedCount: number } {
  const accountId = getAccountId(accountEmail)
  if (!accountId || ids.length === 0) {
    return { success: true, deletedCount: 0 }
  }

  const db = getStorageDatabase().getDatabase()
  const placeholders = ids.map(() => '?').join(', ')
  const result = db
    .prepare(`DELETE FROM contacts WHERE account_id = ? AND id IN (${placeholders})`)
    .run(accountId, ...ids)

  return { success: true, deletedCount: result.changes }
}

/**
 * 연락처 즐겨찾기 토글
 */
export function toggleContactStar(
  accountEmail: string,
  id: string
): { success: boolean; contact?: Contact; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()
  const existing = db
    .prepare('SELECT * FROM contacts WHERE id = ? AND account_id = ?')
    .get(id, accountId) as ContactRow | undefined

  if (!existing) {
    return { success: false, error: '연락처를 찾을 수 없습니다.' }
  }

  const newStarred = existing.starred === 1 ? 0 : 1
  const now = Date.now()

  db.prepare('UPDATE contacts SET starred = ?, updated_at = ? WHERE id = ?').run(
    newStarred,
    now,
    id
  )

  const updatedRow = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as ContactRow

  return { success: true, contact: rowToContact(db, updatedRow) }
}

/**
 * 연락처 그룹 이동
 */
export function moveContactsToGroup(
  accountEmail: string,
  contactIds: string[],
  groupId: string | null
): { success: boolean; movedCount: number } {
  const accountId = getAccountId(accountEmail)
  if (!accountId || contactIds.length === 0) {
    return { success: true, movedCount: 0 }
  }

  const db = getStorageDatabase().getDatabase()
  let movedCount = 0

  db.transaction(() => {
    const now = Date.now()

    for (const contactId of contactIds) {
      // 연락처 소유권 확인
      const contact = db
        .prepare('SELECT id FROM contacts WHERE id = ? AND account_id = ?')
        .get(contactId, accountId)

      if (!contact) continue

      if (groupId === null) {
        // 모든 그룹에서 제거
        db.prepare('DELETE FROM contact_group_members WHERE contact_id = ?').run(contactId)
      } else {
        // 기존 매핑 확인
        const existing = db
          .prepare('SELECT 1 FROM contact_group_members WHERE contact_id = ? AND group_id = ?')
          .get(contactId, groupId)

        if (!existing) {
          db.prepare('INSERT INTO contact_group_members (contact_id, group_id) VALUES (?, ?)').run(
            contactId,
            groupId
          )
        }
      }

      db.prepare('UPDATE contacts SET updated_at = ? WHERE id = ?').run(now, contactId)
      movedCount++
    }
  })()

  return { success: true, movedCount }
}

// =====================================================
// 그룹 CRUD
// =====================================================

/**
 * 그룹 목록 조회
 */
export function getContactGroups(accountEmail: string): ContactGroup[] {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return []
  }

  const db = getStorageDatabase().getDatabase()
  const rows = db
    .prepare('SELECT * FROM contact_groups WHERE account_id = ? ORDER BY name')
    .all(accountId) as ContactGroupRow[]

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parent_id || undefined,
    createdAt: new Date(row.created_at).toISOString()
  }))
}

/**
 * 그룹 추가
 */
export function addContactGroup(
  accountEmail: string,
  name: string,
  parentId?: string
): { success: boolean; group?: ContactGroup; error?: string } {
  const accountId = getOrCreateAccountId(accountEmail)
  const db = getStorageDatabase().getDatabase()

  // 이름 중복 체크
  const existing = db
    .prepare(
      'SELECT id FROM contact_groups WHERE account_id = ? AND name = ? AND (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))'
    )
    .get(accountId, name, parentId || null, parentId || null)

  if (existing) {
    return { success: false, error: '이미 존재하는 그룹 이름입니다.' }
  }

  const id = uuidv4()
  const now = Date.now()

  db.prepare(
    'INSERT INTO contact_groups (id, account_id, name, parent_id, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, accountId, name, parentId || null, now)

  const newGroup: ContactGroup = {
    id,
    name,
    parentId,
    createdAt: new Date(now).toISOString()
  }

  return { success: true, group: newGroup }
}

/**
 * 그룹 수정
 */
export function updateContactGroup(
  accountEmail: string,
  id: string,
  name: string
): { success: boolean; group?: ContactGroup; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()

  const existing = db
    .prepare('SELECT * FROM contact_groups WHERE id = ? AND account_id = ?')
    .get(id, accountId) as ContactGroupRow | undefined

  if (!existing) {
    return { success: false, error: '그룹을 찾을 수 없습니다.' }
  }

  // 이름 중복 체크 (자기 자신 제외)
  const duplicate = db
    .prepare(
      'SELECT id FROM contact_groups WHERE account_id = ? AND name = ? AND id != ? AND (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))'
    )
    .get(accountId, name, id, existing.parent_id, existing.parent_id)

  if (duplicate) {
    return { success: false, error: '이미 존재하는 그룹 이름입니다.' }
  }

  db.prepare('UPDATE contact_groups SET name = ? WHERE id = ?').run(name, id)

  const updatedGroup: ContactGroup = {
    id,
    name,
    parentId: existing.parent_id || undefined,
    createdAt: new Date(existing.created_at).toISOString()
  }

  return { success: true, group: updatedGroup }
}

/**
 * 그룹 삭제 (하위 그룹 포함)
 */
export function deleteContactGroup(
  accountEmail: string,
  id: string
): { success: boolean; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()

  const existing = db
    .prepare('SELECT id FROM contact_groups WHERE id = ? AND account_id = ?')
    .get(id, accountId)

  if (!existing) {
    return { success: false, error: '그룹을 찾을 수 없습니다.' }
  }

  // 하위 그룹 ID 수집
  const groupIdsToDelete: string[] = [id]
  const findChildGroups = (parentId: string) => {
    const children = db
      .prepare('SELECT id FROM contact_groups WHERE parent_id = ?')
      .all(parentId) as { id: string }[]

    for (const child of children) {
      groupIdsToDelete.push(child.id)
      findChildGroups(child.id)
    }
  }
  findChildGroups(id)

  db.transaction(() => {
    // 그룹 삭제 (CASCADE로 contact_group_members도 삭제됨)
    const placeholders = groupIdsToDelete.map(() => '?').join(', ')
    db.prepare(`DELETE FROM contact_groups WHERE id IN (${placeholders})`).run(...groupIdsToDelete)
  })()

  return { success: true }
}

/**
 * 그룹별 연락처 수 조회
 */
export function getContactCountByGroup(accountEmail: string): {
  [groupId: string]: number
  total: number
  starred: number
  noGroup: number
} {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { total: 0, starred: 0, noGroup: 0 }
  }

  const db = getStorageDatabase().getDatabase()

  const total = (
    db.prepare('SELECT COUNT(*) as count FROM contacts WHERE account_id = ?').get(accountId) as {
      count: number
    }
  ).count

  const starred = (
    db
      .prepare('SELECT COUNT(*) as count FROM contacts WHERE account_id = ? AND starred = 1')
      .get(accountId) as { count: number }
  ).count

  const noGroup = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM contacts c
        LEFT JOIN contact_group_members cgm ON c.id = cgm.contact_id
        WHERE c.account_id = ? AND cgm.contact_id IS NULL`
      )
      .get(accountId) as { count: number }
  ).count

  const counts: { [groupId: string]: number; total: number; starred: number; noGroup: number } = {
    total,
    starred,
    noGroup
  }

  // 그룹별 카운트
  const groupCounts = db
    .prepare(
      `SELECT cgm.group_id, COUNT(*) as count
      FROM contact_group_members cgm
      JOIN contacts c ON cgm.contact_id = c.id
      WHERE c.account_id = ?
      GROUP BY cgm.group_id`
    )
    .all(accountId) as { group_id: string; count: number }[]

  for (const gc of groupCounts) {
    counts[gc.group_id] = gc.count
  }

  return counts
}

/**
 * 이메일로 연락처 검색 (자동완성용)
 */
export function searchContactsByEmail(
  accountEmail: string,
  query: string,
  limit: number = 10
): Contact[] {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return []
  }

  const db = getStorageDatabase().getDatabase()
  const searchLower = `%${query.toLowerCase()}%`

  const rows = db
    .prepare(
      `SELECT * FROM contacts
      WHERE account_id = ? AND (LOWER(email) LIKE ? OR LOWER(name) LIKE ?)
      ORDER BY name
      LIMIT ?`
    )
    .all(accountId, searchLower, searchLower, limit) as ContactRow[]

  return rows.map((row) => rowToContact(db, row))
}

// =====================================================
// 헬퍼 함수
// =====================================================

function rowToContact(db: Database.Database, row: ContactRow): Contact {
  // 그룹 ID 조회
  const groupIds = db
    .prepare('SELECT group_id FROM contact_group_members WHERE contact_id = ?')
    .all(row.id) as { group_id: string }[]

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || undefined,
    organization: row.organization || undefined,
    memo: row.memo || undefined,
    starred: row.starred === 1,
    groupIds: groupIds.map((g) => g.group_id),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  }
}
