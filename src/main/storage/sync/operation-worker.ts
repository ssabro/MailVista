import { BrowserWindow } from 'electron'
import {
  getOperationQueue,
  OperationQueueService,
  OperationQueueItem,
  OperationType
} from './operation-queue'
import { getEmailRepository, EmailRepository } from '../email-repository'
import { getFolderRepository, FolderRepository } from '../folder-repository'
import { logger, LogCategory } from '../../logger'

// IMAP 작업 함수 타입 (main/index.ts에서 주입)
export interface ImapOperationFunctions {
  setEmailFlags: (
    email: string,
    folderPath: string,
    uid: number,
    flags: string[],
    add: boolean
  ) => Promise<{ success: boolean; error?: string }>
  deleteEmail: (
    email: string,
    folderPath: string,
    uid: number,
    permanent?: boolean
  ) => Promise<{ success: boolean; error?: string }>
  moveEmail: (
    email: string,
    fromFolder: string,
    toFolder: string,
    uid: number
  ) => Promise<{ success: boolean; error?: string }>
  deleteBulkEmails: (
    email: string,
    folderPath: string,
    uids: number[],
    permanent?: boolean
  ) => Promise<{ success: boolean; count?: number; error?: string }>
  moveBulkEmails: (
    email: string,
    fromFolder: string,
    toFolder: string,
    uids: number[]
  ) => Promise<{ success: boolean; count?: number; error?: string }>
}

export interface OperationWorkerStatus {
  isRunning: boolean
  lastProcessTime: number | null
  processingCount: number
  pendingCount: number
  failedCount: number
  lastError: string | null
}

export class OperationWorker {
  private isRunning = false
  private intervalId: NodeJS.Timeout | null = null
  private operationQueue: OperationQueueService
  private emailRepo: EmailRepository
  private folderRepo: FolderRepository
  private mainWindow: BrowserWindow | null = null
  private imapFunctions: ImapOperationFunctions | null = null
  private lastProcessTime: number | null = null

  constructor() {
    this.operationQueue = getOperationQueue()
    this.emailRepo = getEmailRepository()
    this.folderRepo = getFolderRepository()
  }

  /**
   * IMAP 작업 함수 설정
   */
  setImapFunctions(fns: ImapOperationFunctions): void {
    this.imapFunctions = fns
  }

  /**
   * 메인 윈도우 설정 (UI 알림용)
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  /**
   * 워커 시작
   */
  start(intervalMs: number = 5000): void {
    if (this.isRunning) {
      logger.info(LogCategory.SYNC, 'OperationWorker already running')
      return
    }

    logger.info(LogCategory.SYNC, `OperationWorker starting with interval ${intervalMs}ms`)
    this.isRunning = true

    // 즉시 한 번 실행
    this.processQueue().catch((err) => {
      logger.error(LogCategory.SYNC, 'OperationWorker initial process error', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      })
    })

    // 주기적 실행
    this.intervalId = setInterval(() => {
      this.processQueue().catch((err) => {
        logger.error(LogCategory.SYNC, 'OperationWorker process error', {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        })
      })
    }, intervalMs)
  }

  /**
   * 워커 중지
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isRunning = false
    logger.info(LogCategory.SYNC, 'OperationWorker stopped')
  }

  /**
   * 상태 조회
   */
  getStatus(): OperationWorkerStatus {
    const stats = this.operationQueue.getStats()
    return {
      isRunning: this.isRunning,
      lastProcessTime: this.lastProcessTime,
      processingCount: stats.processing,
      pendingCount: stats.pending,
      failedCount: stats.failed,
      lastError: stats.lastError
    }
  }

  /**
   * 큐 처리 메인 루프
   */
  private async processQueue(): Promise<void> {
    if (!this.imapFunctions) {
      logger.warn(LogCategory.SYNC, 'OperationWorker IMAP functions not set, skipping')
      return
    }

    // 대기 중인 작업 가져오기 (한 번에 5개)
    const operations = this.operationQueue.dequeueBatch(5)
    if (operations.length === 0) {
      return
    }

    logger.info(LogCategory.SYNC, `OperationWorker processing ${operations.length} operations`)
    this.lastProcessTime = Date.now()

    // UI에 상태 알림
    this.broadcastStatus()

    for (const operation of operations) {
      try {
        await this.executeOperation(operation)
        this.operationQueue.markCompleted(operation.id)

        // 삭제 작업 성공 시 실제 DB에서 삭제
        if (
          operation.operation_type === 'delete_trash' ||
          operation.operation_type === 'delete_permanent'
        ) {
          const uids = OperationQueueService.parseUids(operation.uids)
          const folder = this.folderRepo.getByEmailAndPath(
            operation.account_email,
            operation.folder_path
          )
          if (folder) {
            this.emailRepo.purgeDeleted(folder.id, uids)
          }
        }

        logger.info(LogCategory.SYNC, `Operation completed`, {
          operationId: operation.id,
          type: operation.operation_type,
          account: operation.account_email,
          folder: operation.folder_path
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorStack = error instanceof Error ? error.stack : undefined

        // 재시도 불가능한 오류 체크 (폴더가 존재하지 않는 경우 등)
        const isNonRetryableError =
          errorMessage.includes('NONEXISTENT') ||
          errorMessage.includes('Unknown Mailbox') ||
          errorMessage.includes('Mailbox doesn\'t exist')

        if (isNonRetryableError) {
          // 재시도 불가능한 오류 - 즉시 완료 처리 (로컬 작업은 이미 완료됨)
          logger.warn(LogCategory.SYNC, 'Non-retryable error, marking as complete', {
            operationId: operation.id,
            type: operation.operation_type,
            account: operation.account_email,
            folder: operation.folder_path,
            error: errorMessage
          })
          this.operationQueue.markCompleted(operation.id)
          continue
        }

        logger.error(LogCategory.SYNC, 'Operation failed', {
          operationId: operation.id,
          type: operation.operation_type,
          account: operation.account_email,
          folder: operation.folder_path,
          uids: operation.uids,
          error: errorMessage,
          stack: errorStack,
          retryCount: operation.retry_count
        })

        const canRetry = this.operationQueue.markFailed(operation.id, errorMessage)

        if (!canRetry) {
          // 최대 재시도 초과 - 롤백 수행
          logger.warn(LogCategory.SYNC, 'Max retries exceeded, rolling back operation', {
            operationId: operation.id,
            type: operation.operation_type,
            maxRetries: operation.max_retries
          })
          await this.rollbackOperation(operation, errorMessage)
        }
      }
    }

    this.broadcastStatus()
  }

  /**
   * 개별 작업 실행
   */
  private async executeOperation(operation: OperationQueueItem): Promise<void> {
    if (!this.imapFunctions) {
      throw new Error('IMAP functions not configured')
    }

    const allUids = OperationQueueService.parseUids(operation.uids)
    const flags = OperationQueueService.parseFlags(operation.flags)

    // 양수 UID만 필터링 (음수 UID는 로컬 임시 ID로 서버에 없음)
    const serverUids = allUids.filter((uid) => uid > 0)
    const localTempUids = allUids.filter((uid) => uid < 0)

    // 음수 UID만 있는 경우 - 서버 작업 필요 없음 (로컬 전용)
    if (serverUids.length === 0) {
      if (localTempUids.length > 0) {
        logger.info(LogCategory.SYNC, 'Skipping operation - all UIDs are local temp IDs', {
          operationId: operation.id,
          type: operation.operation_type,
          localTempUids: localTempUids.length
        })
      }
      return // 성공으로 간주하여 작업 완료
    }

    if (localTempUids.length > 0) {
      logger.info(LogCategory.SYNC, 'Filtered out local temp UIDs from operation', {
        operationId: operation.id,
        type: operation.operation_type,
        serverUids: serverUids.length,
        skippedLocalUids: localTempUids.length
      })
    }

    switch (operation.operation_type as OperationType) {
      case 'flag_add':
        await this.executeFlagOperation(operation, serverUids, flags, true)
        break

      case 'flag_remove':
        await this.executeFlagOperation(operation, serverUids, flags, false)
        break

      case 'delete_trash':
        await this.executeDeleteOperation(operation, serverUids, false)
        break

      case 'delete_permanent':
        await this.executeDeleteOperation(operation, serverUids, true)
        break

      case 'move':
        await this.executeMoveOperation(operation, serverUids)
        break

      default:
        throw new Error(`Unknown operation type: ${operation.operation_type}`)
    }
  }

  /**
   * 플래그 변경 작업 실행
   */
  private async executeFlagOperation(
    operation: OperationQueueItem,
    uids: number[],
    flags: string[],
    add: boolean
  ): Promise<void> {
    if (!this.imapFunctions) throw new Error('IMAP functions not configured')

    // 각 UID에 대해 플래그 변경
    for (const uid of uids) {
      const result = await this.imapFunctions.setEmailFlags(
        operation.account_email,
        operation.folder_path,
        uid,
        flags,
        add
      )

      if (!result.success) {
        throw new Error(result.error || 'Flag operation failed')
      }
    }
  }

  /**
   * 삭제 작업 실행
   */
  private async executeDeleteOperation(
    operation: OperationQueueItem,
    uids: number[],
    permanent: boolean
  ): Promise<void> {
    if (!this.imapFunctions) throw new Error('IMAP functions not configured')

    if (uids.length === 1) {
      const result = await this.imapFunctions.deleteEmail(
        operation.account_email,
        operation.folder_path,
        uids[0],
        permanent
      )

      if (!result.success) {
        throw new Error(result.error || 'Delete operation failed')
      }
    } else {
      const result = await this.imapFunctions.deleteBulkEmails(
        operation.account_email,
        operation.folder_path,
        uids,
        permanent
      )

      if (!result.success) {
        throw new Error(result.error || 'Bulk delete operation failed')
      }
    }
  }

  /**
   * 이동 작업 실행
   */
  private async executeMoveOperation(operation: OperationQueueItem, uids: number[]): Promise<void> {
    if (!this.imapFunctions) throw new Error('IMAP functions not configured')
    if (!operation.target_folder) throw new Error('Target folder not specified')

    if (uids.length === 1) {
      const result = await this.imapFunctions.moveEmail(
        operation.account_email,
        operation.folder_path,
        operation.target_folder,
        uids[0]
      )

      if (!result.success) {
        throw new Error(result.error || 'Move operation failed')
      }
    } else {
      const result = await this.imapFunctions.moveBulkEmails(
        operation.account_email,
        operation.folder_path,
        operation.target_folder,
        uids
      )

      if (!result.success) {
        throw new Error(result.error || 'Bulk move operation failed')
      }
    }
  }

  /**
   * 작업 실패 시 롤백
   */
  private async rollbackOperation(
    operation: OperationQueueItem,
    errorMessage: string
  ): Promise<void> {
    logger.info(LogCategory.SYNC, 'Rolling back operation', {
      operationId: operation.id,
      type: operation.operation_type,
      account: operation.account_email,
      folder: operation.folder_path
    })

    const uids = OperationQueueService.parseUids(operation.uids)
    const folder = this.folderRepo.getByEmailAndPath(operation.account_email, operation.folder_path)

    if (!folder) {
      logger.warn(LogCategory.SYNC, 'Folder not found for rollback', {
        operationId: operation.id,
        account: operation.account_email,
        folder: operation.folder_path
      })
      return
    }

    try {
      switch (operation.operation_type as OperationType) {
        case 'delete_trash':
        case 'delete_permanent':
          // 삭제 표시 해제
          this.emailRepo.restoreDeleted(folder.id, uids)
          break

        case 'move': {
          // 원래 폴더로 복원
          const originalData = OperationQueueService.parseOriginalData(operation.original_data)
          if (
            originalData &&
            Array.isArray(originalData.emailIds) &&
            Array.isArray(originalData.originalUids)
          ) {
            this.emailRepo.restoreMove(
              originalData.emailIds as string[],
              originalData.originalFolderId as string,
              originalData.originalUids as number[]
            )
          }
          break
        }

        case 'flag_add':
        case 'flag_remove': {
          // 원래 플래그로 복원
          const flagData = OperationQueueService.parseOriginalData(operation.original_data)
          if (flagData && Array.isArray(flagData.originalFlags)) {
            for (const uid of uids) {
              this.emailRepo.restoreFlags(folder.id, uid, flagData.originalFlags as string[])
            }
          }
          break
        }
      }

      // 폴더 카운트 재계산
      this.folderRepo.recalculateCounts(folder.id)
      if (operation.target_folder) {
        const targetFolder = this.folderRepo.getByEmailAndPath(
          operation.account_email,
          operation.target_folder
        )
        if (targetFolder) {
          this.folderRepo.recalculateCounts(targetFolder.id)
        }
      }

      logger.info(LogCategory.SYNC, 'Rollback completed', {
        operationId: operation.id,
        type: operation.operation_type
      })
    } catch (rollbackError) {
      logger.error(LogCategory.SYNC, 'Rollback failed', {
        operationId: operation.id,
        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        stack: rollbackError instanceof Error ? rollbackError.stack : undefined
      })
    }

    // UI에 실패 알림
    this.notifyOperationFailed(operation, errorMessage)
  }

  /**
   * UI에 동기화 상태 알림
   */
  private broadcastStatus(): void {
    if (!this.mainWindow) return

    const stats = this.operationQueue.getStats()
    this.mainWindow.webContents.send('sync-status-update', {
      pending: stats.pending,
      processing: stats.processing,
      failed: stats.failed,
      lastError: stats.lastError
    })
  }

  /**
   * UI에 작업 실패 알림
   */
  private notifyOperationFailed(operation: OperationQueueItem, error: string): void {
    const uids = OperationQueueService.parseUids(operation.uids)

    // 더 상세한 에러 메시지 생성
    let detailedError = error
    if (error === 'Command failed' || error === 'Unknown error') {
      detailedError = `${error} (${operation.operation_type} on ${operation.folder_path})`
    }

    logger.warn(LogCategory.SYNC, 'Notifying UI of operation failure', {
      operationType: operation.operation_type,
      folderPath: operation.folder_path,
      affectedCount: uids.length,
      error: detailedError
    })

    if (!this.mainWindow) return

    this.mainWindow.webContents.send('sync-operation-failed', {
      operationType: operation.operation_type,
      folderPath: operation.folder_path,
      affectedCount: uids.length,
      error: detailedError
    })
  }
}

// 싱글톤 인스턴스
let operationWorkerInstance: OperationWorker | null = null

export function getOperationWorker(): OperationWorker {
  if (!operationWorkerInstance) {
    operationWorkerInstance = new OperationWorker()
  }
  return operationWorkerInstance
}
