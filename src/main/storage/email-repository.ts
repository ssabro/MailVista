import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { getStorageDatabase } from './database'
import { updateEmailFtsAttachments } from './schema'

export interface EmailRecord {
  id: string
  folder_id: string
  uid: number
  message_id: string | null
  subject: string | null
  from_name: string | null
  from_address: string | null
  to_addresses: string | null
  cc_addresses: string | null
  date: number | null
  flags: string | null
  has_attachment: number
  body_path: string | null
  body_text: string | null
  size: number
  cached_at: number | null
  sync_status: string
}

export interface EmailInput {
  folderId: string
  uid: number
  messageId?: string
  subject?: string
  fromName?: string
  fromAddress?: string
  toAddresses?: string[] | string
  ccAddresses?: string[] | string
  date?: number | Date
  flags?: string[]
  hasAttachment?: boolean
  size?: number
}

export interface EmailBodyUpdate {
  bodyPath: string
  bodyText: string
  cachedAt?: number
}

export interface AttachmentRecord {
  id: string
  email_id: string
  filename: string
  content_type: string | null
  size: number
  part_id: string | null
  content_id: string | null
}

export interface AttachmentInput {
  emailId: string
  filename: string
  contentType?: string
  size?: number
  partId?: string
  contentId?: string
}

export class EmailRepository {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getStorageDatabase().getDatabase()
  }

  // 이메일 생성 (헤더만)
  create(input: EmailInput): EmailRecord {
    const id = uuidv4()
    const toAddresses = Array.isArray(input.toAddresses)
      ? JSON.stringify(input.toAddresses)
      : input.toAddresses || null
    const ccAddresses = Array.isArray(input.ccAddresses)
      ? JSON.stringify(input.ccAddresses)
      : input.ccAddresses || null
    const flags = input.flags ? JSON.stringify(input.flags) : null
    const date = input.date instanceof Date ? input.date.getTime() : input.date || null

    this.db
      .prepare(
        `
      INSERT INTO emails (
        id, folder_id, uid, message_id, subject, from_name, from_address,
        to_addresses, cc_addresses, date, flags, has_attachment, size, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `
      )
      .run(
        id,
        input.folderId,
        input.uid,
        input.messageId || null,
        input.subject || null,
        input.fromName || null,
        input.fromAddress || null,
        toAddresses,
        ccAddresses,
        date,
        flags,
        input.hasAttachment ? 1 : 0,
        input.size || 0
      )

    return this.getById(id)!
  }

  // 이메일 조회 (ID)
  getById(id: string): EmailRecord | null {
    return (this.db.prepare('SELECT * FROM emails WHERE id = ?').get(id) as EmailRecord) || null
  }

  // 이메일 조회 (폴더 + UID)
  getByUid(folderId: string, uid: number): EmailRecord | null {
    return (
      (this.db
        .prepare('SELECT * FROM emails WHERE folder_id = ? AND uid = ?')
        .get(folderId, uid) as EmailRecord) || null
    )
  }

  // 이메일 조회 (Message-ID)
  getByMessageId(messageId: string): EmailRecord | null {
    return (
      (this.db
        .prepare('SELECT * FROM emails WHERE message_id = ?')
        .get(messageId) as EmailRecord) || null
    )
  }

  // 이메일 존재 여부 확인
  exists(folderId: string, uid: number): boolean {
    const result = this.db
      .prepare('SELECT 1 FROM emails WHERE folder_id = ? AND uid = ?')
      .get(folderId, uid)
    return !!result
  }

  // 이메일 생성 또는 업데이트
  upsert(input: EmailInput): EmailRecord {
    const existing = this.getByUid(input.folderId, input.uid)
    if (existing) {
      // 플래그 업데이트
      if (input.flags) {
        this.updateFlags(existing.id, input.flags)
      }
      return this.getById(existing.id)!
    }
    return this.create(input)
  }

  // 폴더의 이메일 목록 조회 (페이지네이션)
  getByFolderId(
    folderId: string,
    options: { offset?: number; limit?: number; orderBy?: 'date' | 'uid' } = {}
  ): EmailRecord[] {
    const { offset = 0, limit = 50, orderBy = 'date' } = options
    const orderClause = orderBy === 'date' ? 'date DESC' : 'uid DESC'

    return this.db
      .prepare(`SELECT * FROM emails WHERE folder_id = ? ORDER BY ${orderClause} LIMIT ? OFFSET ?`)
      .all(folderId, limit, offset) as EmailRecord[]
  }

  // 폴더의 모든 UID 조회
  getUidsByFolderId(folderId: string): number[] {
    const results = this.db
      .prepare('SELECT uid FROM emails WHERE folder_id = ? ORDER BY uid DESC')
      .all(folderId) as { uid: number }[]
    return results.map((r) => r.uid)
  }

  // 폴더의 이메일 개수 조회
  getCountByFolderId(folderId: string): number {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM emails WHERE folder_id = ?')
      .get(folderId) as { count: number }
    return result.count
  }

  // 읽지 않은 이메일 개수 조회
  getUnreadCountByFolderId(folderId: string): number {
    const result = this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM emails
      WHERE folder_id = ? AND flags NOT LIKE '%Seen%'
    `
      )
      .get(folderId) as { count: number }
    return result.count
  }

  // 본문 업데이트
  updateBody(id: string, update: EmailBodyUpdate): void {
    this.db
      .prepare(
        `
      UPDATE emails
      SET body_path = ?, body_text = ?, cached_at = ?, sync_status = 'synced'
      WHERE id = ?
    `
      )
      .run(update.bodyPath, update.bodyText, update.cachedAt || Date.now(), id)
  }

  // 플래그 업데이트
  updateFlags(id: string, flags: string[]): void {
    this.db.prepare('UPDATE emails SET flags = ? WHERE id = ?').run(JSON.stringify(flags), id)
  }

  // 단일 플래그 추가
  addFlag(id: string, flag: string): void {
    const email = this.getById(id)
    if (!email) return

    const flags: string[] = email.flags ? JSON.parse(email.flags) : []
    if (!flags.includes(flag)) {
      flags.push(flag)
      this.updateFlags(id, flags)
    }
  }

  // 단일 플래그 제거
  removeFlag(id: string, flag: string): void {
    const email = this.getById(id)
    if (!email) return

    const flags: string[] = email.flags ? JSON.parse(email.flags) : []
    const newFlags = flags.filter((f) => f !== flag)
    this.updateFlags(id, newFlags)
  }

  // 동기화 상태 업데이트
  updateSyncStatus(id: string, status: 'pending' | 'synced' | 'error'): void {
    this.db.prepare('UPDATE emails SET sync_status = ? WHERE id = ?').run(status, id)
  }

  // 이메일 삭제
  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM emails WHERE id = ?').run(id)
    return result.changes > 0
  }

  // UID로 이메일 삭제
  deleteByUid(folderId: string, uid: number): boolean {
    const result = this.db
      .prepare('DELETE FROM emails WHERE folder_id = ? AND uid = ?')
      .run(folderId, uid)
    return result.changes > 0
  }

  // 폴더의 모든 이메일 삭제
  deleteByFolderId(folderId: string): number {
    const result = this.db.prepare('DELETE FROM emails WHERE folder_id = ?').run(folderId)
    return result.changes
  }

  // 특정 UID 범위 외의 이메일 삭제 (동기화 시 서버에서 삭제된 메일 처리)
  deleteNotInUids(folderId: string, validUids: number[]): number {
    if (validUids.length === 0) {
      return this.deleteByFolderId(folderId)
    }

    const placeholders = validUids.map(() => '?').join(',')
    const result = this.db
      .prepare(`DELETE FROM emails WHERE folder_id = ? AND uid NOT IN (${placeholders})`)
      .run(folderId, ...validUids)
    return result.changes
  }

  // 본문 미동기화 이메일 조회
  getPendingSync(folderId: string, limit: number = 100): EmailRecord[] {
    return this.db
      .prepare(
        `
      SELECT * FROM emails
      WHERE folder_id = ? AND sync_status = 'pending'
      ORDER BY date DESC
      LIMIT ?
    `
      )
      .all(folderId, limit) as EmailRecord[]
  }

  // 전체 본문 미동기화 이메일 조회 (우선순위 정렬)
  getAllPendingSync(limit: number = 100): EmailWithFolderInfo[] {
    return this.db
      .prepare(
        `
      SELECT e.*, f.path as folder_path, f.account_id, a.email as account_email
      FROM emails e
      JOIN folders f ON e.folder_id = f.id
      JOIN accounts a ON f.account_id = a.id
      WHERE e.sync_status = 'pending'
      ORDER BY
        CASE f.special_use
          WHEN 'inbox' THEN 1
          WHEN 'sent' THEN 2
          WHEN 'drafts' THEN 3
          ELSE 4
        END,
        e.date DESC
      LIMIT ?
    `
      )
      .all(limit) as EmailWithFolderInfo[]
  }

  // 첨부파일 추가
  addAttachment(input: AttachmentInput): AttachmentRecord {
    const id = uuidv4()

    this.db
      .prepare(
        `
      INSERT INTO attachments (id, email_id, filename, content_type, size, part_id, content_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        input.emailId,
        input.filename,
        input.contentType || null,
        input.size || 0,
        input.partId || null,
        input.contentId || null
      )

    // FTS 인덱스 업데이트
    updateEmailFtsAttachments(this.db, input.emailId)

    return this.getAttachmentById(id)!
  }

  // 첨부파일 조회 (ID)
  getAttachmentById(id: string): AttachmentRecord | null {
    return (
      (this.db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as AttachmentRecord) ||
      null
    )
  }

  // 이메일의 첨부파일 목록 조회
  getAttachmentsByEmailId(emailId: string): AttachmentRecord[] {
    return this.db
      .prepare('SELECT * FROM attachments WHERE email_id = ?')
      .all(emailId) as AttachmentRecord[]
  }

  // 첨부파일 삭제
  deleteAttachment(id: string): boolean {
    const attachment = this.getAttachmentById(id)
    if (!attachment) return false

    const result = this.db.prepare('DELETE FROM attachments WHERE id = ?').run(id)

    // FTS 인덱스 업데이트
    if (result.changes > 0) {
      updateEmailFtsAttachments(this.db, attachment.email_id)
    }

    return result.changes > 0
  }

  // 이메일의 모든 첨부파일 삭제
  deleteAttachmentsByEmailId(emailId: string): number {
    const result = this.db.prepare('DELETE FROM attachments WHERE email_id = ?').run(emailId)
    return result.changes
  }

  // 배치 삽입 (헤더)
  batchCreate(inputs: EmailInput[]): number {
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO emails (
        id, folder_id, uid, message_id, subject, from_name, from_address,
        to_addresses, cc_addresses, date, flags, has_attachment, size, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `)

    let count = 0
    const transaction = this.db.transaction((items: EmailInput[]) => {
      for (const input of items) {
        const id = uuidv4()
        const toAddresses = Array.isArray(input.toAddresses)
          ? JSON.stringify(input.toAddresses)
          : input.toAddresses || null
        const ccAddresses = Array.isArray(input.ccAddresses)
          ? JSON.stringify(input.ccAddresses)
          : input.ccAddresses || null
        const flags = input.flags ? JSON.stringify(input.flags) : null
        const date = input.date instanceof Date ? input.date.getTime() : input.date || null

        const result = insertStmt.run(
          id,
          input.folderId,
          input.uid,
          input.messageId || null,
          input.subject || null,
          input.fromName || null,
          input.fromAddress || null,
          toAddresses,
          ccAddresses,
          date,
          flags,
          input.hasAttachment ? 1 : 0,
          input.size || 0
        )
        count += result.changes
      }
    })

    transaction(inputs)
    return count
  }

  // ========== Local-First 작업 메서드 ==========

  /**
   * 로컬 삭제 표시 (sync_status = 'deleted')
   * 실제 DB에서 삭제하지 않고 삭제 표시만 함 (롤백 가능)
   */
  markAsDeleted(folderId: string, uids: number[]): number {
    if (uids.length === 0) return 0

    const placeholders = uids.map(() => '?').join(',')
    const result = this.db
      .prepare(
        `UPDATE emails SET sync_status = 'deleted' WHERE folder_id = ? AND uid IN (${placeholders})`
      )
      .run(folderId, ...uids)
    return result.changes
  }

  /**
   * 삭제 표시 복원 (롤백용)
   */
  restoreDeleted(folderId: string, uids: number[]): number {
    if (uids.length === 0) return 0

    const placeholders = uids.map(() => '?').join(',')
    const result = this.db
      .prepare(
        `UPDATE emails SET sync_status = 'synced' WHERE folder_id = ? AND uid IN (${placeholders}) AND sync_status = 'deleted'`
      )
      .run(folderId, ...uids)
    return result.changes
  }

  /**
   * 로컬 폴더 이동 (folder_id 변경)
   * 새 폴더에서의 UID는 임시로 음수 값 사용 (서버 동기화 시 실제 UID로 업데이트)
   */
  moveToFolder(fromFolderId: string, toFolderId: string, uids: number[]): number {
    if (uids.length === 0) return 0

    const now = Date.now()

    // 임시 UID 생성 (음수 사용하여 서버 UID와 충돌 방지)
    const transaction = this.db.transaction(() => {
      let movedCount = 0
      for (const uid of uids) {
        const email = this.getByUid(fromFolderId, uid)
        if (!email) continue

        // 임시 UID 생성 (타임스탬프 기반 음수)
        const tempUid = -(now + movedCount)

        this.db
          .prepare(`UPDATE emails SET folder_id = ?, uid = ?, sync_status = 'moved' WHERE id = ?`)
          .run(toFolderId, tempUid, email.id)
        movedCount++
      }
      return movedCount
    })

    return transaction()
  }

  /**
   * 이동 복원 (롤백용) - 원래 폴더로 복귀
   * originalData에서 원래 UID와 folder_id 정보 필요
   */
  restoreMove(emailIds: string[], originalFolderId: string, originalUids: number[]): number {
    if (emailIds.length === 0 || emailIds.length !== originalUids.length) return 0

    const transaction = this.db.transaction(() => {
      let restoredCount = 0
      for (let i = 0; i < emailIds.length; i++) {
        const result = this.db
          .prepare(`UPDATE emails SET folder_id = ?, uid = ?, sync_status = 'synced' WHERE id = ?`)
          .run(originalFolderId, originalUids[i], emailIds[i])
        restoredCount += result.changes
      }
      return restoredCount
    })

    return transaction()
  }

  /**
   * 로컬 플래그 추가 (UID 기반)
   */
  addFlagByUid(folderId: string, uid: number, flag: string): boolean {
    const email = this.getByUid(folderId, uid)
    if (!email) return false

    const flags: string[] = email.flags ? JSON.parse(email.flags) : []
    if (!flags.includes(flag)) {
      flags.push(flag)
      this.db
        .prepare('UPDATE emails SET flags = ? WHERE folder_id = ? AND uid = ?')
        .run(JSON.stringify(flags), folderId, uid)
      return true
    }
    return false
  }

  /**
   * 로컬 플래그 제거 (UID 기반)
   */
  removeFlagByUid(folderId: string, uid: number, flag: string): boolean {
    const email = this.getByUid(folderId, uid)
    if (!email) return false

    const flags: string[] = email.flags ? JSON.parse(email.flags) : []
    const newFlags = flags.filter((f) => f !== flag)
    if (newFlags.length !== flags.length) {
      this.db
        .prepare('UPDATE emails SET flags = ? WHERE folder_id = ? AND uid = ?')
        .run(JSON.stringify(newFlags), folderId, uid)
      return true
    }
    return false
  }

  /**
   * 배치 플래그 추가 (여러 UID에 동시 적용)
   */
  addFlagBatch(folderId: string, uids: number[], flag: string): number {
    if (uids.length === 0) return 0

    const transaction = this.db.transaction(() => {
      let count = 0
      for (const uid of uids) {
        if (this.addFlagByUid(folderId, uid, flag)) count++
      }
      return count
    })

    return transaction()
  }

  /**
   * 배치 플래그 제거 (여러 UID에 동시 적용)
   */
  removeFlagBatch(folderId: string, uids: number[], flag: string): number {
    if (uids.length === 0) return 0

    const transaction = this.db.transaction(() => {
      let count = 0
      for (const uid of uids) {
        if (this.removeFlagByUid(folderId, uid, flag)) count++
      }
      return count
    })

    return transaction()
  }

  /**
   * 플래그 복원 (롤백용)
   */
  restoreFlags(folderId: string, uid: number, originalFlags: string[]): void {
    this.db
      .prepare('UPDATE emails SET flags = ? WHERE folder_id = ? AND uid = ?')
      .run(JSON.stringify(originalFlags), folderId, uid)
  }

  /**
   * 배치 플래그 복원 (롤백용)
   */
  restoreFlagsBatch(folderId: string, flagsData: Array<{ uid: number; flags: string[] }>): number {
    if (flagsData.length === 0) return 0

    const transaction = this.db.transaction(() => {
      let count = 0
      for (const data of flagsData) {
        const result = this.db
          .prepare('UPDATE emails SET flags = ? WHERE folder_id = ? AND uid = ?')
          .run(JSON.stringify(data.flags), folderId, data.uid)
        count += result.changes
      }
      return count
    })

    return transaction()
  }

  /**
   * UID 목록으로 이메일 조회 (롤백 데이터 수집용)
   */
  getByUids(folderId: string, uids: number[]): EmailRecord[] {
    if (uids.length === 0) return []

    const placeholders = uids.map(() => '?').join(',')
    return this.db
      .prepare(`SELECT * FROM emails WHERE folder_id = ? AND uid IN (${placeholders})`)
      .all(folderId, ...uids) as EmailRecord[]
  }

  /**
   * 삭제 표시된 이메일 조회 (특정 폴더)
   */
  getDeleted(folderId: string): EmailRecord[] {
    return this.db
      .prepare(`SELECT * FROM emails WHERE folder_id = ? AND sync_status = 'deleted'`)
      .all(folderId) as EmailRecord[]
  }

  /**
   * 삭제 표시된 이메일 실제 삭제 (동기화 성공 후)
   */
  purgeDeleted(folderId: string, uids: number[]): number {
    if (uids.length === 0) return 0

    const placeholders = uids.map(() => '?').join(',')
    const result = this.db
      .prepare(
        `DELETE FROM emails WHERE folder_id = ? AND uid IN (${placeholders}) AND sync_status = 'deleted'`
      )
      .run(folderId, ...uids)
    return result.changes
  }

  /**
   * 이동 완료된 이메일 UID 업데이트 (서버 동기화 성공 후)
   */
  updateUidAfterMove(emailId: string, newUid: number): void {
    this.db
      .prepare(`UPDATE emails SET uid = ?, sync_status = 'synced' WHERE id = ?`)
      .run(newUid, emailId)
  }

  /**
   * 폴더 내 삭제 표시되지 않은 이메일만 조회
   */
  getByFolderIdExcludeDeleted(
    folderId: string,
    options: {
      offset?: number
      limit?: number
      orderBy?: 'date' | 'uid'
      unreadOnly?: boolean
    } = {}
  ): EmailRecord[] {
    const { offset = 0, limit = 50, orderBy = 'date', unreadOnly = false } = options
    const orderClause = orderBy === 'date' ? 'date DESC' : 'uid DESC'

    // 안읽은 메일만 필터링 조건 (flags에 Seen이 없는 메일)
    // flags가 NULL이거나 빈 문자열이거나 Seen을 포함하지 않는 경우
    const unreadCondition = unreadOnly
      ? `AND (flags IS NULL OR flags = '' OR flags = '[]' OR flags NOT LIKE '%Seen%')`
      : ''

    const query = `SELECT * FROM emails WHERE folder_id = ? AND sync_status != 'deleted' ${unreadCondition} ORDER BY ${orderClause} LIMIT ? OFFSET ?`

    // 디버깅: 쿼리 로그
    if (unreadOnly) {
      console.log(`[EmailRepository] Unread query: ${query}`)
      // 첫 번째 결과의 flags 확인
      const sample = this.db
        .prepare(`SELECT flags FROM emails WHERE folder_id = ? LIMIT 5`)
        .all(folderId) as { flags: string | null }[]
      console.log(
        `[EmailRepository] Sample flags from DB:`,
        sample.map((s) => s.flags)
      )
    }

    return this.db.prepare(query).all(folderId, limit, offset) as EmailRecord[]
  }

  /**
   * 폴더 내 삭제 표시되지 않은 이메일 개수
   */
  getCountExcludeDeleted(folderId: string): number {
    const result = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM emails WHERE folder_id = ? AND sync_status != 'deleted'`
      )
      .get(folderId) as { count: number }
    return result.count
  }

  /**
   * 폴더 내 삭제 표시되지 않은 읽지 않은 이메일 개수
   */
  getUnreadCountExcludeDeleted(folderId: string): number {
    const result = this.db
      .prepare(
        `
        SELECT COUNT(*) as count FROM emails
        WHERE folder_id = ? AND sync_status != 'deleted' AND flags NOT LIKE '%Seen%'
      `
      )
      .get(folderId) as { count: number }
    return result.count
  }

  // ========== 기존 메서드 ==========

  // 이메일 통계
  getStats(folderId?: string): EmailStats {
    let query: string
    const params: (string | undefined)[] = []

    if (folderId) {
      query = `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as synced,
          SUM(CASE WHEN sync_status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN flags NOT LIKE '%Seen%' THEN 1 ELSE 0 END) as unread
        FROM emails WHERE folder_id = ?
      `
      params.push(folderId)
    } else {
      query = `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as synced,
          SUM(CASE WHEN sync_status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN flags NOT LIKE '%Seen%' THEN 1 ELSE 0 END) as unread
        FROM emails
      `
    }

    const result = this.db.prepare(query).get(...params) as {
      total: number
      synced: number
      pending: number
      unread: number
    }

    return {
      total: result.total || 0,
      synced: result.synced || 0,
      pending: result.pending || 0,
      unread: result.unread || 0
    }
  }
}

export interface EmailWithFolderInfo extends EmailRecord {
  folder_path: string
  account_id: string
  account_email: string
}

export interface EmailStats {
  total: number
  synced: number
  pending: number
  unread: number
}

// 싱글톤 인스턴스
let emailRepositoryInstance: EmailRepository | null = null

export function getEmailRepository(): EmailRepository {
  if (!emailRepositoryInstance) {
    emailRepositoryInstance = new EmailRepository()
  }
  return emailRepositoryInstance
}
