import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { getStorageDatabase } from './database'

export interface FolderRecord {
  id: string
  account_id: string
  name: string
  path: string
  delimiter: string | null
  special_use: string | null
  uid_validity: number | null
  last_sync: number | null
  total_count: number
  unread_count: number
}

export interface FolderInput {
  accountId: string
  name: string
  path: string
  delimiter?: string
  specialUse?: string
  uidValidity?: number
}

export interface FolderUpdate {
  name?: string
  uidValidity?: number
  lastSync?: number
  totalCount?: number
  unreadCount?: number
}

export class FolderRepository {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getStorageDatabase().getDatabase()
  }

  // 폴더 생성
  create(input: FolderInput): FolderRecord {
    const id = uuidv4()
    const now = Date.now()

    this.db
      .prepare(
        `
      INSERT INTO folders (id, account_id, name, path, delimiter, special_use, uid_validity, last_sync, total_count, unread_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `
      )
      .run(
        id,
        input.accountId,
        input.name,
        input.path,
        input.delimiter || null,
        input.specialUse || null,
        input.uidValidity || null,
        now
      )

    return this.getById(id)!
  }

  // 폴더 조회 (ID)
  getById(id: string): FolderRecord | null {
    return (this.db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as FolderRecord) || null
  }

  // 폴더 조회 (계정 + 경로)
  getByPath(accountId: string, path: string): FolderRecord | null {
    return (
      (this.db
        .prepare('SELECT * FROM folders WHERE account_id = ? AND path = ?')
        .get(accountId, path) as FolderRecord) || null
    )
  }

  // 폴더 조회 (계정 이메일 + 경로) - Local-First 작업용
  getByEmailAndPath(accountEmail: string, path: string): FolderRecord | null {
    const result = this.db
      .prepare(
        `
        SELECT f.* FROM folders f
        JOIN accounts a ON f.account_id = a.id
        WHERE a.email = ? AND f.path = ?
      `
      )
      .get(accountEmail, path) as FolderRecord | undefined
    return result || null
  }

  // 계정 ID 조회 (이메일 기반)
  getAccountIdByEmail(email: string): string | null {
    const result = this.db.prepare('SELECT id FROM accounts WHERE email = ?').get(email) as
      | { id: string }
      | undefined
    return result?.id || null
  }

  // 폴더 조회 또는 생성
  getOrCreate(input: FolderInput): FolderRecord {
    const existing = this.getByPath(input.accountId, input.path)
    if (existing) {
      return existing
    }
    return this.create(input)
  }

  // 계정의 모든 폴더 조회
  getByAccountId(accountId: string): FolderRecord[] {
    return this.db
      .prepare('SELECT * FROM folders WHERE account_id = ? ORDER BY path')
      .all(accountId) as FolderRecord[]
  }

  // 특정 용도 폴더 조회 (inbox, sent, drafts 등)
  getBySpecialUse(accountId: string, specialUse: string): FolderRecord | null {
    return (
      (this.db
        .prepare('SELECT * FROM folders WHERE account_id = ? AND special_use = ?')
        .get(accountId, specialUse) as FolderRecord) || null
    )
  }

  // 폴더 업데이트
  update(id: string, update: FolderUpdate): FolderRecord | null {
    const sets: string[] = []
    const values: (string | number | null)[] = []

    if (update.name !== undefined) {
      sets.push('name = ?')
      values.push(update.name)
    }
    if (update.uidValidity !== undefined) {
      sets.push('uid_validity = ?')
      values.push(update.uidValidity)
    }
    if (update.lastSync !== undefined) {
      sets.push('last_sync = ?')
      values.push(update.lastSync)
    }
    if (update.totalCount !== undefined) {
      sets.push('total_count = ?')
      values.push(update.totalCount)
    }
    if (update.unreadCount !== undefined) {
      sets.push('unread_count = ?')
      values.push(update.unreadCount)
    }

    if (sets.length === 0) {
      return this.getById(id)
    }

    values.push(id)
    this.db.prepare(`UPDATE folders SET ${sets.join(', ')} WHERE id = ?`).run(...values)

    return this.getById(id)
  }

  // UIDVALIDITY 업데이트 (캐시 무효화 체크용)
  updateUidValidity(id: string, uidValidity: number): boolean {
    const folder = this.getById(id)
    if (!folder) return false

    // UIDVALIDITY가 변경되면 해당 폴더의 모든 이메일 삭제
    if (folder.uid_validity !== null && folder.uid_validity !== uidValidity) {
      // 이메일 삭제는 CASCADE로 자동 처리됨
      this.db.prepare('DELETE FROM emails WHERE folder_id = ?').run(id)
    }

    this.db.prepare('UPDATE folders SET uid_validity = ? WHERE id = ?').run(uidValidity, id)
    return true
  }

  // 마지막 동기화 시간 업데이트
  updateLastSync(id: string): void {
    this.db.prepare('UPDATE folders SET last_sync = ? WHERE id = ?').run(Date.now(), id)
  }

  // 이메일 카운트 업데이트
  updateCounts(id: string, totalCount: number, unreadCount: number): void {
    this.db
      .prepare('UPDATE folders SET total_count = ?, unread_count = ? WHERE id = ?')
      .run(totalCount, unreadCount, id)
  }

  // 읽지 않은 메일 수 증감
  incrementUnreadCount(id: string, delta: number): void {
    this.db
      .prepare('UPDATE folders SET unread_count = MAX(0, unread_count + ?) WHERE id = ?')
      .run(delta, id)
  }

  // ========== Local-First 작업 메서드 ==========

  /**
   * 전체 메일 수 증감
   */
  incrementTotalCount(id: string, delta: number): void {
    this.db
      .prepare('UPDATE folders SET total_count = MAX(0, total_count + ?) WHERE id = ?')
      .run(delta, id)
  }

  /**
   * 실제 이메일 데이터 기반 카운트 재계산 (삭제 표시 제외)
   */
  recalculateCounts(id: string): { totalCount: number; unreadCount: number } {
    // 삭제 표시되지 않은 이메일만 카운트
    const totalResult = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM emails WHERE folder_id = ? AND sync_status != 'deleted'`
      )
      .get(id) as { count: number }

    const unreadResult = this.db
      .prepare(
        `
        SELECT COUNT(*) as count FROM emails
        WHERE folder_id = ? AND sync_status != 'deleted' AND flags NOT LIKE '%Seen%'
      `
      )
      .get(id) as { count: number }

    const totalCount = totalResult.count
    const unreadCount = unreadResult.count

    this.db
      .prepare('UPDATE folders SET total_count = ?, unread_count = ? WHERE id = ?')
      .run(totalCount, unreadCount, id)

    return { totalCount, unreadCount }
  }

  /**
   * 여러 폴더의 카운트 일괄 재계산
   */
  recalculateCountsBatch(folderIds: string[]): void {
    if (folderIds.length === 0) return

    const transaction = this.db.transaction(() => {
      for (const id of folderIds) {
        this.recalculateCounts(id)
      }
    })

    transaction()
  }

  /**
   * 계정의 모든 폴더 카운트 재계산
   */
  recalculateAllCounts(accountId: string): void {
    const folders = this.getByAccountId(accountId)
    this.recalculateCountsBatch(folders.map((f) => f.id))
  }

  // 폴더 삭제
  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM folders WHERE id = ?').run(id)
    return result.changes > 0
  }

  // 계정의 모든 폴더 삭제
  deleteByAccountId(accountId: string): number {
    const result = this.db.prepare('DELETE FROM folders WHERE account_id = ?').run(accountId)
    return result.changes
  }

  // 동기화가 필요한 폴더 조회 (마지막 동기화 시간 기준)
  getFoldersNeedingSync(accountId: string, maxAgeMs: number = 5 * 60 * 1000): FolderRecord[] {
    const threshold = Date.now() - maxAgeMs
    return this.db
      .prepare(
        `
      SELECT * FROM folders
      WHERE account_id = ? AND (last_sync IS NULL OR last_sync < ?)
      ORDER BY
        CASE special_use
          WHEN 'inbox' THEN 1
          WHEN 'sent' THEN 2
          WHEN 'drafts' THEN 3
          ELSE 4
        END,
        path
    `
      )
      .all(accountId, threshold) as FolderRecord[]
  }

  // 폴더 통계
  getStats(accountId: string): FolderStats {
    const result = this.db
      .prepare(
        `
      SELECT
        COUNT(*) as total_folders,
        SUM(total_count) as total_emails,
        SUM(unread_count) as unread_emails,
        MIN(last_sync) as oldest_sync
      FROM folders
      WHERE account_id = ?
    `
      )
      .get(accountId) as {
      total_folders: number
      total_emails: number
      unread_emails: number
      oldest_sync: number | null
    }

    return {
      totalFolders: result.total_folders,
      totalEmails: result.total_emails || 0,
      unreadEmails: result.unread_emails || 0,
      oldestSync: result.oldest_sync
    }
  }
}

export interface FolderStats {
  totalFolders: number
  totalEmails: number
  unreadEmails: number
  oldestSync: number | null
}

// 싱글톤 인스턴스
let folderRepositoryInstance: FolderRepository | null = null

export function getFolderRepository(): FolderRepository {
  if (!folderRepositoryInstance) {
    folderRepositoryInstance = new FolderRepository()
  }
  return folderRepositoryInstance
}
