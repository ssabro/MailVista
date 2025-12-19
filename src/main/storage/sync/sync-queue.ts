import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { getStorageDatabase } from '../database'

export interface SyncQueueItem {
  id: string
  email_id: string
  priority: number
  status: 'pending' | 'processing' | 'completed' | 'error'
  retry_count: number
  created_at: number
}

export interface QueueEmailInfo {
  id: string
  email_id: string
  priority: number
  status: string
  retry_count: number
  created_at: number
  // 이메일 정보
  uid: number
  folder_id: string
  folder_path: string
  account_id: string
  account_email: string
  subject: string | null
  date: number | null
}

export class SyncQueue {
  private db: Database.Database
  private maxRetries: number = 3

  constructor(db?: Database.Database) {
    this.db = db || getStorageDatabase().getDatabase()
  }

  // 큐에 항목 추가
  enqueue(emailId: string, priority: number = 0): SyncQueueItem {
    const id = uuidv4()
    const now = Date.now()

    // 이미 큐에 있는지 확인
    const existing = this.db
      .prepare('SELECT id FROM sync_queue WHERE email_id = ? AND status IN (?, ?)')
      .get(emailId, 'pending', 'processing')

    if (existing) {
      // 기존 항목의 우선순위 업데이트 (더 높은 우선순위로)
      this.db
        .prepare('UPDATE sync_queue SET priority = MAX(priority, ?) WHERE email_id = ?')
        .run(priority, emailId)
      return this.getByEmailId(emailId)!
    }

    this.db
      .prepare(
        `
      INSERT INTO sync_queue (id, email_id, priority, status, retry_count, created_at)
      VALUES (?, ?, ?, 'pending', 0, ?)
    `
      )
      .run(id, emailId, priority, now)

    return this.getById(id)!
  }

  // 배치 추가
  enqueueBatch(items: Array<{ emailId: string; priority: number }>): number {
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO sync_queue (id, email_id, priority, status, retry_count, created_at)
      VALUES (?, ?, ?, 'pending', 0, ?)
    `)

    let count = 0
    const now = Date.now()

    const transaction = this.db.transaction(
      (items: Array<{ emailId: string; priority: number }>) => {
        for (const item of items) {
          const id = uuidv4()
          const result = insertStmt.run(id, item.emailId, item.priority, now)
          count += result.changes
        }
      }
    )

    transaction(items)
    return count
  }

  // 항목 조회 (ID)
  getById(id: string): SyncQueueItem | null {
    return (
      (this.db.prepare('SELECT * FROM sync_queue WHERE id = ?').get(id) as SyncQueueItem) || null
    )
  }

  // 항목 조회 (이메일 ID)
  getByEmailId(emailId: string): SyncQueueItem | null {
    return (
      (this.db
        .prepare('SELECT * FROM sync_queue WHERE email_id = ?')
        .get(emailId) as SyncQueueItem) || null
    )
  }

  // 다음 처리할 항목 가져오기 (우선순위 높은 순)
  dequeue(): QueueEmailInfo | null {
    const item = this.db
      .prepare(
        `
      SELECT
        sq.*,
        e.uid, e.folder_id, e.subject, e.date,
        f.path as folder_path, f.account_id,
        a.email as account_email
      FROM sync_queue sq
      JOIN emails e ON sq.email_id = e.id
      JOIN folders f ON e.folder_id = f.id
      JOIN accounts a ON f.account_id = a.id
      WHERE sq.status = 'pending'
      ORDER BY sq.priority DESC, sq.created_at ASC
      LIMIT 1
    `
      )
      .get() as QueueEmailInfo | undefined

    if (!item) return null

    // 상태를 processing으로 변경
    this.db.prepare("UPDATE sync_queue SET status = 'processing' WHERE id = ?").run(item.id)

    return item
  }

  // 여러 항목 가져오기
  dequeueBatch(limit: number = 10): QueueEmailInfo[] {
    const items = this.db
      .prepare(
        `
      SELECT
        sq.*,
        e.uid, e.folder_id, e.subject, e.date,
        f.path as folder_path, f.account_id,
        a.email as account_email
      FROM sync_queue sq
      JOIN emails e ON sq.email_id = e.id
      JOIN folders f ON e.folder_id = f.id
      JOIN accounts a ON f.account_id = a.id
      WHERE sq.status = 'pending'
      ORDER BY sq.priority DESC, sq.created_at ASC
      LIMIT ?
    `
      )
      .all(limit) as QueueEmailInfo[]

    if (items.length === 0) return []

    // 상태를 processing으로 변경
    const ids = items.map((item) => item.id)
    const placeholders = ids.map(() => '?').join(',')
    this.db
      .prepare(`UPDATE sync_queue SET status = 'processing' WHERE id IN (${placeholders})`)
      .run(...ids)

    return items
  }

  // 완료 처리
  complete(id: string): void {
    this.db.prepare("UPDATE sync_queue SET status = 'completed' WHERE id = ?").run(id)
  }

  // 에러 처리 (재시도 가능)
  error(id: string): boolean {
    const item = this.getById(id)
    if (!item) return false

    if (item.retry_count < this.maxRetries) {
      // 재시도 대기
      this.db
        .prepare(
          "UPDATE sync_queue SET status = 'pending', retry_count = retry_count + 1 WHERE id = ?"
        )
        .run(id)
      return true
    } else {
      // 최대 재시도 초과
      this.db.prepare("UPDATE sync_queue SET status = 'error' WHERE id = ?").run(id)
      return false
    }
  }

  // 항목 삭제
  remove(id: string): boolean {
    const result = this.db.prepare('DELETE FROM sync_queue WHERE id = ?').run(id)
    return result.changes > 0
  }

  // 완료된 항목 정리
  cleanupCompleted(): number {
    const result = this.db.prepare("DELETE FROM sync_queue WHERE status = 'completed'").run()
    return result.changes
  }

  // 오래된 에러 항목 정리
  cleanupErrors(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const threshold = Date.now() - maxAgeMs
    const result = this.db
      .prepare("DELETE FROM sync_queue WHERE status = 'error' AND created_at < ?")
      .run(threshold)
    return result.changes
  }

  // 큐 상태 조회
  getStatus(): QueueStatus {
    const result = this.db
      .prepare(
        `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error
      FROM sync_queue
    `
      )
      .get() as {
      total: number
      pending: number
      processing: number
      completed: number
      error: number
    }

    return {
      total: result.total || 0,
      pending: result.pending || 0,
      processing: result.processing || 0,
      completed: result.completed || 0,
      error: result.error || 0
    }
  }

  // 계정별 큐 상태 조회
  getStatusByAccount(accountId: string): QueueStatus {
    const result = this.db
      .prepare(
        `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN sq.status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN sq.status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN sq.status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN sq.status = 'error' THEN 1 ELSE 0 END) as error
      FROM sync_queue sq
      JOIN emails e ON sq.email_id = e.id
      JOIN folders f ON e.folder_id = f.id
      WHERE f.account_id = ?
    `
      )
      .get(accountId) as {
      total: number
      pending: number
      processing: number
      completed: number
      error: number
    }

    return {
      total: result.total || 0,
      pending: result.pending || 0,
      processing: result.processing || 0,
      completed: result.completed || 0,
      error: result.error || 0
    }
  }

  // 큐 초기화
  clear(): void {
    this.db.prepare('DELETE FROM sync_queue').run()
  }

  // 처리 중인 항목을 대기 상태로 리셋 (앱 재시작 시)
  resetProcessing(): number {
    const result = this.db
      .prepare("UPDATE sync_queue SET status = 'pending' WHERE status = 'processing'")
      .run()
    return result.changes
  }

  // 우선순위 계산 헬퍼
  static calculatePriority(date: number | null): number {
    if (!date) return 50

    const now = Date.now()
    const ageMs = now - date

    // 24시간 이내: 최고 우선순위 (1000)
    if (ageMs < 24 * 60 * 60 * 1000) return 1000

    // 7일 이내: 높은 우선순위 (500)
    if (ageMs < 7 * 24 * 60 * 60 * 1000) return 500

    // 30일 이내: 중간 우선순위 (100)
    if (ageMs < 30 * 24 * 60 * 60 * 1000) return 100

    // 그 외: 낮은 우선순위 (나이에 따라 감소)
    return Math.max(1, 100 - Math.floor(ageMs / (24 * 60 * 60 * 1000)))
  }

  // 폴더 우선순위
  static getFolderPriority(specialUse: string | null): number {
    switch (specialUse) {
      case 'inbox':
        return 1000
      case 'sent':
        return 500
      case 'drafts':
        return 400
      default:
        return 100
    }
  }
}

export interface QueueStatus {
  total: number
  pending: number
  processing: number
  completed: number
  error: number
}

// 싱글톤 인스턴스
let syncQueueInstance: SyncQueue | null = null

export function getSyncQueue(): SyncQueue {
  if (!syncQueueInstance) {
    syncQueueInstance = new SyncQueue()
  }
  return syncQueueInstance
}
