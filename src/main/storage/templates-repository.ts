/**
 * 이메일 템플릿 SQLite Repository
 * - email_templates 테이블 관리
 */
import { getStorageDatabase } from './database'
import { v4 as uuidv4 } from 'uuid'

// =====================================================
// 타입 정의
// =====================================================

export interface EmailTemplate {
  id: string
  name: string
  subject: string
  content: string
  createdAt: number
  updatedAt: number
}

interface TemplateRow {
  id: string
  name: string
  subject: string | null
  content: string
  created_at: number
  updated_at: number
}

// =====================================================
// 템플릿 CRUD
// =====================================================

/**
 * 템플릿 목록 조회
 */
export function getEmailTemplates(): EmailTemplate[] {
  const db = getStorageDatabase().getDatabase()

  const rows = db.prepare('SELECT * FROM email_templates ORDER BY name').all() as TemplateRow[]

  return rows.map(rowToTemplate)
}

/**
 * 템플릿 조회 (ID로)
 */
export function getEmailTemplateById(id: string): EmailTemplate | null {
  const db = getStorageDatabase().getDatabase()

  const row = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id) as
    | TemplateRow
    | undefined

  return row ? rowToTemplate(row) : null
}

/**
 * 템플릿 추가
 */
export function addEmailTemplate(
  name: string,
  content: string,
  subject: string = ''
): { success: boolean; template?: EmailTemplate; error?: string } {
  const db = getStorageDatabase().getDatabase()

  // 이름 중복 체크
  const existing = db.prepare('SELECT id FROM email_templates WHERE name = ?').get(name)

  if (existing) {
    return { success: false, error: '이미 존재하는 템플릿 이름입니다.' }
  }

  const id = uuidv4()
  const now = Date.now()

  db.prepare(
    'INSERT INTO email_templates (id, name, subject, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, subject || null, content, now, now)

  return {
    success: true,
    template: {
      id,
      name,
      subject,
      content,
      createdAt: now,
      updatedAt: now
    }
  }
}

/**
 * 템플릿 추가 (별칭 - 기존 API 호환)
 */
export function createTemplate(
  name: string,
  subject: string,
  content: string
): { success: boolean; template?: EmailTemplate; error?: string } {
  return addEmailTemplate(name, content, subject)
}

/**
 * 템플릿 목록 가져오기 (별칭)
 */
export function getTemplates(): EmailTemplate[] {
  return getEmailTemplates()
}

/**
 * 템플릿 조회 (별칭)
 */
export function getTemplate(id: string): EmailTemplate | null {
  return getEmailTemplateById(id)
}

/**
 * 템플릿 수정
 */
export function updateEmailTemplate(
  id: string,
  updates: Partial<Pick<EmailTemplate, 'name' | 'subject' | 'content'>>
): { success: boolean; template?: EmailTemplate; error?: string } {
  const db = getStorageDatabase().getDatabase()

  const existing = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id) as
    | TemplateRow
    | undefined

  if (!existing) {
    return { success: false, error: '템플릿을 찾을 수 없습니다.' }
  }

  // 이름 중복 체크
  if (updates.name) {
    const duplicate = db
      .prepare('SELECT id FROM email_templates WHERE name = ? AND id != ?')
      .get(updates.name, id)

    if (duplicate) {
      return { success: false, error: '이미 존재하는 템플릿 이름입니다.' }
    }
  }

  const now = Date.now()
  const fields: string[] = ['updated_at = ?']
  const values: (string | number | null)[] = [now]

  if (updates.name !== undefined) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.subject !== undefined) {
    fields.push('subject = ?')
    values.push(updates.subject || null)
  }
  if (updates.content !== undefined) {
    fields.push('content = ?')
    values.push(updates.content)
  }

  values.push(id)
  db.prepare(`UPDATE email_templates SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  const updatedRow = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id) as TemplateRow

  return { success: true, template: rowToTemplate(updatedRow) }
}

/**
 * 템플릿 삭제
 */
export function deleteEmailTemplate(id: string): { success: boolean; error?: string } {
  const db = getStorageDatabase().getDatabase()

  const result = db.prepare('DELETE FROM email_templates WHERE id = ?').run(id)

  if (result.changes === 0) {
    return { success: false, error: '템플릿을 찾을 수 없습니다.' }
  }

  return { success: true }
}

/**
 * 템플릿 삭제 (별칭)
 */
export function deleteTemplate(id: string): { success: boolean; error?: string } {
  return deleteEmailTemplate(id)
}

/**
 * 템플릿 순서 재정렬 (SQLite에서는 순서가 name으로 정렬되므로 no-op)
 */
export function reorderTemplates(_templateIds: string[]): { success: boolean; error?: string } {
  // SQLite에서는 ORDER BY name으로 정렬하므로 재정렬 기능이 필요없음
  // 기존 API 호환성을 위해 빈 함수 제공
  return { success: true }
}

/**
 * 템플릿 검색
 */
export function searchEmailTemplates(query: string): EmailTemplate[] {
  const db = getStorageDatabase().getDatabase()
  const searchLower = `%${query.toLowerCase()}%`

  const rows = db
    .prepare(
      `SELECT * FROM email_templates
      WHERE LOWER(name) LIKE ? OR LOWER(subject) LIKE ? OR LOWER(content) LIKE ?
      ORDER BY name`
    )
    .all(searchLower, searchLower, searchLower) as TemplateRow[]

  return rows.map(rowToTemplate)
}

// =====================================================
// 헬퍼 함수
// =====================================================

function rowToTemplate(row: TemplateRow): EmailTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject || '',
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
