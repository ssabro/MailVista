import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { getStorageDatabase } from '../database'

// 작업 유형
export type OperationType =
  | 'delete_trash'
  | 'delete_permanent'
  | 'move'
  | 'flag_add'
  | 'flag_remove'

// 작업 상태
export type OperationStatus = 'pending' | 'processing' | 'completed' | 'failed'

// 작업 큐 아이템
export interface OperationQueueItem {
  id: string
  account_email: string
  operation_type: OperationType
  folder_path: string
  target_folder: string | null
  uids: string // JSON 배열
  flags: string | null // JSON 배열
  original_data: string | null // 롤백용 원본 데이터 (JSON)
  status: OperationStatus
  retry_count: number
  max_retries: number
  created_at: number
  updated_at: number | null
  error_message: string | null
}

// 작업 추가 입력
export interface EnqueueOperationInput {
  accountEmail: string
  operationType: OperationType
  folderPath: string
  targetFolder?: string
  uids: number[]
  flags?: string[]
  originalData?: Record<string, unknown>
}

// 큐 통계
export interface OperationQueueStats {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
  lastError: string | null
}

export class OperationQueueService {
  private db: Database.Database
  private maxRetries: number = 3

  constructor(db?: Database.Database) {
    this.db = db || getStorageDatabase().getDatabase()
  }

  /**
   * 작업 추가
   */
  enqueue(input: EnqueueOperationInput): string {
    const id = uuidv4()
    const now = Date.now()

    this.db
      .prepare(
        `
        INSERT INTO operation_queue (
          id, account_email, operation_type, folder_path, target_folder,
          uids, flags, original_data, status, retry_count, max_retries,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, NULL)
      `
      )
      .run(
        id,
        input.accountEmail,
        input.operationType,
        input.folderPath,
        input.targetFolder || null,
        JSON.stringify(input.uids),
        input.flags ? JSON.stringify(input.flags) : null,
        input.originalData ? JSON.stringify(input.originalData) : null,
        this.maxRetries,
        now
      )

    return id
  }

  /**
   * 배치 작업 추가
   */
  enqueueBatch(inputs: EnqueueOperationInput[]): string[] {
    const ids: string[] = []
    const now = Date.now()

    const insertStmt = this.db.prepare(`
      INSERT INTO operation_queue (
        id, account_email, operation_type, folder_path, target_folder,
        uids, flags, original_data, status, retry_count, max_retries,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, NULL)
    `)

    const transaction = this.db.transaction((inputs: EnqueueOperationInput[]) => {
      for (const input of inputs) {
        const id = uuidv4()
        insertStmt.run(
          id,
          input.accountEmail,
          input.operationType,
          input.folderPath,
          input.targetFolder || null,
          JSON.stringify(input.uids),
          input.flags ? JSON.stringify(input.flags) : null,
          input.originalData ? JSON.stringify(input.originalData) : null,
          this.maxRetries,
          now
        )
        ids.push(id)
      }
    })

    transaction(inputs)
    return ids
  }

  /**
   * ID로 작업 조회
   */
  getById(id: string): OperationQueueItem | null {
    return (
      (this.db
        .prepare('SELECT * FROM operation_queue WHERE id = ?')
        .get(id) as OperationQueueItem) || null
    )
  }

  /**
   * 대기 중인 작업 조회
   */
  getPending(limit: number = 10): OperationQueueItem[] {
    return this.db
      .prepare(
        `
        SELECT * FROM operation_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT ?
      `
      )
      .all(limit) as OperationQueueItem[]
  }

  /**
   * 다음 처리할 작업 가져오기 (상태를 processing으로 변경)
   */
  dequeue(): OperationQueueItem | null {
    const item = this.db
      .prepare(
        `
        SELECT * FROM operation_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
      `
      )
      .get() as OperationQueueItem | undefined

    if (!item) return null

    // 상태를 processing으로 변경
    this.db
      .prepare("UPDATE operation_queue SET status = 'processing', updated_at = ? WHERE id = ?")
      .run(Date.now(), item.id)

    return { ...item, status: 'processing' }
  }

  /**
   * 여러 작업 가져오기
   */
  dequeueBatch(limit: number = 5): OperationQueueItem[] {
    const items = this.db
      .prepare(
        `
        SELECT * FROM operation_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT ?
      `
      )
      .all(limit) as OperationQueueItem[]

    if (items.length === 0) return []

    // 상태를 processing으로 변경
    const ids = items.map((item) => item.id)
    const placeholders = ids.map(() => '?').join(',')
    const now = Date.now()
    this.db
      .prepare(
        `UPDATE operation_queue SET status = 'processing', updated_at = ? WHERE id IN (${placeholders})`
      )
      .run(now, ...ids)

    return items.map((item) => ({ ...item, status: 'processing' as OperationStatus }))
  }

  /**
   * 작업 완료 처리
   */
  markCompleted(id: string): void {
    this.db
      .prepare("UPDATE operation_queue SET status = 'completed', updated_at = ? WHERE id = ?")
      .run(Date.now(), id)
  }

  /**
   * 작업 실패 처리 (재시도 가능 여부 반환)
   */
  markFailed(id: string, errorMessage: string): boolean {
    const item = this.getById(id)
    if (!item) return false

    const now = Date.now()

    if (item.retry_count < item.max_retries) {
      // 재시도 대기
      this.db
        .prepare(
          `
          UPDATE operation_queue
          SET status = 'pending', retry_count = retry_count + 1,
              error_message = ?, updated_at = ?
          WHERE id = ?
        `
        )
        .run(errorMessage, now, id)
      return true
    } else {
      // 최대 재시도 초과 - 실패로 표시
      this.db
        .prepare(
          `
          UPDATE operation_queue
          SET status = 'failed', error_message = ?, updated_at = ?
          WHERE id = ?
        `
        )
        .run(errorMessage, now, id)
      return false
    }
  }

  /**
   * 재시도 가능 여부 확인
   */
  canRetry(id: string): boolean {
    const item = this.getById(id)
    return item ? item.retry_count < item.max_retries : false
  }

  /**
   * 작업 삭제
   */
  remove(id: string): boolean {
    const result = this.db.prepare('DELETE FROM operation_queue WHERE id = ?').run(id)
    return result.changes > 0
  }

  /**
   * 완료된 작업 정리
   */
  cleanupCompleted(olderThanMs: number = 60 * 60 * 1000): number {
    const threshold = Date.now() - olderThanMs
    const result = this.db
      .prepare("DELETE FROM operation_queue WHERE status = 'completed' AND created_at < ?")
      .run(threshold)
    return result.changes
  }

  /**
   * 실패한 작업 정리
   */
  cleanupFailed(olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const threshold = Date.now() - olderThanMs
    const result = this.db
      .prepare("DELETE FROM operation_queue WHERE status = 'failed' AND created_at < ?")
      .run(threshold)
    return result.changes
  }

  /**
   * 실패한 작업 조회 (롤백용)
   */
  getFailedOperations(): OperationQueueItem[] {
    return this.db
      .prepare(
        `
        SELECT * FROM operation_queue
        WHERE status = 'failed'
        ORDER BY created_at DESC
      `
      )
      .all() as OperationQueueItem[]
  }

  /**
   * 큐 상태 조회
   */
  getStats(): OperationQueueStats {
    const result = this.db
      .prepare(
        `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM operation_queue
      `
      )
      .get() as {
      total: number
      pending: number
      processing: number
      completed: number
      failed: number
    }

    // 마지막 에러 메시지 조회
    const lastError = this.db
      .prepare(
        `
        SELECT error_message FROM operation_queue
        WHERE status = 'failed' AND error_message IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 1
      `
      )
      .get() as { error_message: string } | undefined

    return {
      total: result.total || 0,
      pending: result.pending || 0,
      processing: result.processing || 0,
      completed: result.completed || 0,
      failed: result.failed || 0,
      lastError: lastError?.error_message || null
    }
  }

  /**
   * 계정별 큐 상태 조회
   */
  getStatsByAccount(accountEmail: string): OperationQueueStats {
    const result = this.db
      .prepare(
        `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM operation_queue
        WHERE account_email = ?
      `
      )
      .get(accountEmail) as {
      total: number
      pending: number
      processing: number
      completed: number
      failed: number
    }

    const lastError = this.db
      .prepare(
        `
        SELECT error_message FROM operation_queue
        WHERE account_email = ? AND status = 'failed' AND error_message IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 1
      `
      )
      .get(accountEmail) as { error_message: string } | undefined

    return {
      total: result.total || 0,
      pending: result.pending || 0,
      processing: result.processing || 0,
      completed: result.completed || 0,
      failed: result.failed || 0,
      lastError: lastError?.error_message || null
    }
  }

  /**
   * 처리 중인 작업을 대기 상태로 리셋 (앱 재시작 시)
   */
  resetProcessing(): number {
    const result = this.db
      .prepare("UPDATE operation_queue SET status = 'pending' WHERE status = 'processing'")
      .run()
    return result.changes
  }

  /**
   * 큐 초기화
   */
  clear(): void {
    this.db.prepare('DELETE FROM operation_queue').run()
  }

  /**
   * UID 배열 파싱 헬퍼
   */
  static parseUids(uidsJson: string): number[] {
    try {
      return JSON.parse(uidsJson)
    } catch {
      return []
    }
  }

  /**
   * 플래그 배열 파싱 헬퍼
   */
  static parseFlags(flagsJson: string | null): string[] {
    if (!flagsJson) return []
    try {
      return JSON.parse(flagsJson)
    } catch {
      return []
    }
  }

  /**
   * 원본 데이터 파싱 헬퍼
   */
  static parseOriginalData(dataJson: string | null): Record<string, unknown> | null {
    if (!dataJson) return null
    try {
      return JSON.parse(dataJson)
    } catch {
      return null
    }
  }
}

// 싱글톤 인스턴스
let operationQueueInstance: OperationQueueService | null = null

export function getOperationQueue(): OperationQueueService {
  if (!operationQueueInstance) {
    operationQueueInstance = new OperationQueueService()
  }
  return operationQueueInstance
}
