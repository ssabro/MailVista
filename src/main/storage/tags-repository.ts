/**
 * 태그 SQLite Repository
 * - tags, email_tags 테이블 관리
 */
import { getStorageDatabase } from './database'
import { getOrCreateAccountId, getAccountId } from './account-helper'
import { v4 as uuidv4 } from 'uuid'

// =====================================================
// 타입 정의
// =====================================================

export interface Tag {
  id: string
  name: string
  color: string
  createdAt: string
}

interface TagRow {
  id: string
  account_id: string
  name: string
  color: string
  created_at: number
}

// 기본 태그 정의
const DEFAULT_TAGS: Omit<Tag, 'id' | 'createdAt'>[] = [
  { name: '중요', color: '#ef4444' },
  { name: '업무', color: '#3b82f6' },
  { name: '개인', color: '#22c55e' },
  { name: '나중에', color: '#f59e0b' },
  { name: '참고', color: '#8b5cf6' }
]

// =====================================================
// 태그 CRUD
// =====================================================

/**
 * 태그 목록 조회 (없으면 기본 태그 생성)
 */
export function getTags(accountEmail: string): Tag[] {
  const accountId = getOrCreateAccountId(accountEmail)
  const db = getStorageDatabase().getDatabase()

  const rows = db
    .prepare('SELECT * FROM tags WHERE account_id = ? ORDER BY created_at')
    .all(accountId) as TagRow[]

  // 태그가 없으면 기본 태그 생성
  if (rows.length === 0) {
    return createDefaultTags(accountId)
  }

  return rows.map(rowToTag)
}

/**
 * 기본 태그 생성
 */
function createDefaultTags(accountId: string): Tag[] {
  const db = getStorageDatabase().getDatabase()
  const now = Date.now()
  const tags: Tag[] = []

  db.transaction(() => {
    for (const tagDef of DEFAULT_TAGS) {
      const id = uuidv4()
      db.prepare(
        'INSERT INTO tags (id, account_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, accountId, tagDef.name, tagDef.color, now)
      tags.push({
        id,
        name: tagDef.name,
        color: tagDef.color,
        createdAt: new Date(now).toISOString()
      })
    }
  })()

  return tags
}

/**
 * 태그 추가
 */
export function addTag(
  accountEmail: string,
  name: string,
  color: string
): { success: boolean; tag?: Tag; error?: string } {
  const accountId = getOrCreateAccountId(accountEmail)
  const db = getStorageDatabase().getDatabase()

  // 이름 중복 체크
  const existing = db
    .prepare('SELECT id FROM tags WHERE account_id = ? AND name = ?')
    .get(accountId, name)

  if (existing) {
    return { success: false, error: '이미 존재하는 태그 이름입니다.' }
  }

  const id = uuidv4()
  const now = Date.now()

  db.prepare(
    'INSERT INTO tags (id, account_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, accountId, name, color, now)

  const newTag: Tag = {
    id,
    name,
    color,
    createdAt: new Date(now).toISOString()
  }

  return { success: true, tag: newTag }
}

/**
 * 태그 수정
 */
export function updateTag(
  accountEmail: string,
  id: string,
  updates: Partial<Pick<Tag, 'name' | 'color'>>
): { success: boolean; tag?: Tag; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()

  const existing = db
    .prepare('SELECT * FROM tags WHERE id = ? AND account_id = ?')
    .get(id, accountId) as TagRow | undefined

  if (!existing) {
    return { success: false, error: '태그를 찾을 수 없습니다.' }
  }

  // 이름 중복 체크
  if (updates.name) {
    const duplicate = db
      .prepare('SELECT id FROM tags WHERE account_id = ? AND name = ? AND id != ?')
      .get(accountId, updates.name, id)

    if (duplicate) {
      return { success: false, error: '이미 존재하는 태그 이름입니다.' }
    }
  }

  const fields: string[] = []
  const values: (string | number)[] = []

  if (updates.name !== undefined) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.color !== undefined) {
    fields.push('color = ?')
    values.push(updates.color)
  }

  if (fields.length > 0) {
    values.push(id)
    db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  const updatedRow = db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRow
  return { success: true, tag: rowToTag(updatedRow) }
}

/**
 * 태그 삭제
 */
export function deleteTag(accountEmail: string, id: string): { success: boolean; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()
  const result = db.prepare('DELETE FROM tags WHERE id = ? AND account_id = ?').run(id, accountId)

  if (result.changes === 0) {
    return { success: false, error: '태그를 찾을 수 없습니다.' }
  }

  return { success: true }
}

// =====================================================
// 이메일-태그 매핑
// =====================================================

/**
 * 이메일에 태그 할당
 */
export function assignTagToEmail(
  accountEmail: string,
  emailId: string,
  tagId: string
): { success: boolean; error?: string } {
  const accountId = getAccountId(accountEmail)
  if (!accountId) {
    return { success: false, error: '계정을 찾을 수 없습니다.' }
  }

  const db = getStorageDatabase().getDatabase()

  // 태그 소유권 확인
  const tag = db
    .prepare('SELECT id FROM tags WHERE id = ? AND account_id = ?')
    .get(tagId, accountId)
  if (!tag) {
    return { success: false, error: '태그를 찾을 수 없습니다.' }
  }

  // 이미 할당되어 있는지 확인
  const existing = db
    .prepare('SELECT 1 FROM email_tags WHERE email_id = ? AND tag_id = ?')
    .get(emailId, tagId)

  if (existing) {
    return { success: true } // 이미 할당됨
  }

  const now = Date.now()
  db.prepare('INSERT INTO email_tags (email_id, tag_id, assigned_at) VALUES (?, ?, ?)').run(
    emailId,
    tagId,
    now
  )

  return { success: true }
}

/**
 * 이메일에서 태그 제거
 */
export function removeTagFromEmail(emailId: string, tagId: string): { success: boolean } {
  const db = getStorageDatabase().getDatabase()
  db.prepare('DELETE FROM email_tags WHERE email_id = ? AND tag_id = ?').run(emailId, tagId)
  return { success: true }
}

/**
 * 이메일의 태그 목록 조회
 */
export function getEmailTags(emailId: string): Tag[] {
  const db = getStorageDatabase().getDatabase()

  const rows = db
    .prepare(
      `SELECT t.* FROM tags t
      JOIN email_tags et ON t.id = et.tag_id
      WHERE et.email_id = ?
      ORDER BY t.name`
    )
    .all(emailId) as TagRow[]

  return rows.map(rowToTag)
}

/**
 * 이메일 ID 목록의 태그 매핑 조회 (일괄 조회)
 */
export function getTagsForEmails(emailIds: string[]): Map<string, Tag[]> {
  if (emailIds.length === 0) {
    return new Map()
  }

  const db = getStorageDatabase().getDatabase()
  const placeholders = emailIds.map(() => '?').join(', ')

  const rows = db
    .prepare(
      `SELECT et.email_id, t.* FROM tags t
      JOIN email_tags et ON t.id = et.tag_id
      WHERE et.email_id IN (${placeholders})
      ORDER BY t.name`
    )
    .all(...emailIds) as (TagRow & { email_id: string })[]

  const result = new Map<string, Tag[]>()

  for (const emailId of emailIds) {
    result.set(emailId, [])
  }

  for (const row of rows) {
    const tags = result.get(row.email_id) || []
    tags.push(rowToTag(row))
    result.set(row.email_id, tags)
  }

  return result
}

/**
 * 특정 태그가 할당된 이메일 ID 목록 조회
 */
export function getEmailIdsByTag(tagId: string): string[] {
  const db = getStorageDatabase().getDatabase()

  const rows = db.prepare('SELECT email_id FROM email_tags WHERE tag_id = ?').all(tagId) as {
    email_id: string
  }[]

  return rows.map((r) => r.email_id)
}

// =====================================================
// 헬퍼 함수
// =====================================================

function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: new Date(row.created_at).toISOString()
  }
}
