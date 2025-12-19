import { EventEmitter } from 'events'
import { getSyncWorker, AccountConfig, FolderInfo, SyncProgress } from './sync-worker'
import type { SyncWorker } from './sync-worker'
import { getSyncQueue } from './sync-queue'
import type { SyncQueue } from './sync-queue'
import { getFolderRepository } from '../folder-repository'
import { getStorageDatabase } from '../database'

export interface SyncSettings {
  autoSync: boolean
  syncIntervalMs: number
  maxConcurrentDownloads: number
  bandwidthLimitKBps: number
}

export interface SyncStatus {
  isRunning: boolean
  isPaused: boolean
  currentAccount?: string
  currentFolder?: string
  headerProgress: SyncProgress | null
  bodyProgress: {
    total: number
    synced: number
    pending: number
    processing: number
    error: number
  }
}

export class SyncService extends EventEmitter {
  private static instance: SyncService | null = null

  private worker: SyncWorker
  private queue: SyncQueue
  private isRunning = false
  private isPaused = false
  private isStopping = false

  private settings: SyncSettings = {
    autoSync: true,
    syncIntervalMs: 5 * 60 * 1000, // 5분
    maxConcurrentDownloads: 3,
    bandwidthLimitKBps: 0 // 무제한
  }

  private currentProgress: SyncProgress | null = null
  private bodyDownloadCount = 0
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private bodyWorkers: Promise<void>[] = []

  // 계정 설정 캐시 (외부에서 주입)
  private accountConfigs: Map<string, AccountConfig> = new Map()

  private constructor() {
    super()
    this.worker = getSyncWorker()
    this.queue = getSyncQueue()

    // 앱 시작 시 처리 중이던 항목 리셋
    this.queue.resetProcessing()
  }

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService()
    }
    return SyncService.instance
  }

  // 계정 설정 등록
  registerAccount(email: string, config: AccountConfig): void {
    this.accountConfigs.set(email, config)
  }

  // 계정 설정 해제
  unregisterAccount(email: string): void {
    this.accountConfigs.delete(email)
  }

  // 설정 업데이트
  updateSettings(settings: Partial<SyncSettings>): void {
    this.settings = { ...this.settings, ...settings }

    // 자동 동기화 타이머 재설정
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }

    if (this.settings.autoSync && this.isRunning) {
      this.startAutoSync()
    }
  }

  getSettings(): SyncSettings {
    return { ...this.settings }
  }

  // 전체 동기화 시작
  async startFullSync(accountEmail: string): Promise<void> {
    const config = this.accountConfigs.get(accountEmail)
    if (!config) {
      throw new Error(`Account config not found for ${accountEmail}`)
    }

    this.isRunning = true
    this.isPaused = false
    this.isStopping = false

    this.emit('sync-started', { accountEmail })

    try {
      // 폴더 목록 가져오기 (mail-service.ts 연동 필요)
      const folders = await this.getFolders(config)

      // 각 폴더 헤더 동기화
      for (const folder of folders) {
        if (this.isStopping) break

        while (this.isPaused) {
          await this.sleep(1000)
          if (this.isStopping) break
        }

        await this.worker.syncFolderHeaders(config, folder, (progress) => {
          this.currentProgress = progress
          this.emit('header-progress', progress)
        })
      }

      // 본문 다운로드 시작
      if (!this.isStopping) {
        this.startBodyDownloads()
      }

      // 자동 동기화 시작
      if (this.settings.autoSync && !this.isStopping) {
        this.startAutoSync()
      }
    } catch (error) {
      this.emit('sync-error', {
        accountEmail,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  // 특정 폴더 동기화
  async syncFolder(accountEmail: string, folderPath: string): Promise<void> {
    const config = this.accountConfigs.get(accountEmail)
    if (!config) {
      throw new Error(`Account config not found for ${accountEmail}`)
    }

    const folders = await this.getFolders(config)
    const folder = folders.find((f) => f.path === folderPath)

    if (!folder) {
      throw new Error(`Folder not found: ${folderPath}`)
    }

    await this.worker.syncFolderHeaders(config, folder, (progress) => {
      this.currentProgress = progress
      this.emit('header-progress', progress)
    })
  }

  // 본문 다운로드 워커 시작
  private startBodyDownloads(): void {
    const workerCount = this.settings.maxConcurrentDownloads

    for (let i = 0; i < workerCount; i++) {
      const worker = this.bodyDownloadWorker()
      this.bodyWorkers.push(worker)
    }

    // 모든 워커가 완료되면 이벤트 발생
    Promise.all(this.bodyWorkers).then(() => {
      this.bodyWorkers = []
      if (!this.isStopping) {
        this.emit('body-sync-completed')
      }
    })
  }

  // 본문 다운로드 워커
  private async bodyDownloadWorker(): Promise<void> {
    while (!this.isStopping) {
      while (this.isPaused) {
        await this.sleep(1000)
        if (this.isStopping) return
      }

      const item = this.queue.dequeue()
      if (!item) {
        // 큐가 비었으면 잠시 대기 후 재시도
        await this.sleep(5000)
        continue
      }

      try {
        const config = this.accountConfigs.get(item.account_email)
        if (!config) {
          this.queue.error(item.id)
          continue
        }

        // 대역폭 제한
        if (this.settings.bandwidthLimitKBps > 0) {
          await this.throttle()
        }

        const result = await this.worker.syncEmailBody(
          config,
          item.folder_path,
          item.uid,
          item.email_id
        )

        if (result.success) {
          this.queue.complete(item.id)
          this.bodyDownloadCount++

          // 진행 상태 이벤트
          const status = this.queue.getStatus()
          this.emit('body-progress', {
            total: status.total,
            synced: status.completed,
            pending: status.pending,
            processing: status.processing,
            error: status.error
          })
        } else {
          this.queue.error(item.id)
        }
      } catch (error) {
        this.queue.error(item.id)
      }
    }
  }

  // 대역폭 제한 (간단한 딜레이 구현)
  private async throttle(): Promise<void> {
    // 대역폭 제한에 따른 딜레이 계산
    // 평균 이메일 크기 50KB 가정
    const avgEmailSizeKB = 50
    const delayMs = (avgEmailSizeKB / this.settings.bandwidthLimitKBps) * 1000
    await this.sleep(Math.max(100, delayMs))
  }

  // 자동 동기화 시작
  private startAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
    }

    this.syncTimer = setInterval(async () => {
      if (this.isPaused || this.isStopping) return

      // 모든 등록된 계정에 대해 동기화
      for (const [email, config] of this.accountConfigs) {
        try {
          const folders = await this.getFolders(config)

          // 동기화가 필요한 폴더만
          const folderRepo = getFolderRepository()
          const accountId = this.worker.ensureAccount(email)
          const needSync = folderRepo.getFoldersNeedingSync(accountId, this.settings.syncIntervalMs)

          for (const folderRecord of needSync) {
            const folder = folders.find((f) => f.path === folderRecord.path)
            if (folder) {
              await this.worker.syncFolderHeaders(config, folder, (progress) => {
                this.emit('header-progress', progress)
              })
            }
          }
        } catch (error) {
          console.error(`Auto-sync error for ${email}:`, error)
        }
      }
    }, this.settings.syncIntervalMs)
  }

  // 동기화 일시정지
  pause(): void {
    this.isPaused = true
    this.worker.pause()
    this.emit('sync-paused')
  }

  // 동기화 재개
  resume(): void {
    this.isPaused = false
    this.worker.resume()
    this.emit('sync-resumed')
  }

  // 동기화 중지
  async stop(): Promise<void> {
    this.isStopping = true
    this.isRunning = false
    this.worker.stop()

    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }

    // 워커들이 종료될 때까지 대기
    await Promise.all(this.bodyWorkers)
    this.bodyWorkers = []

    this.emit('sync-stopped')
  }

  // 동기화 상태 조회
  getStatus(): SyncStatus {
    const queueStatus = this.queue.getStatus()

    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentAccount: this.currentProgress?.accountId,
      currentFolder: this.currentProgress?.folderPath,
      headerProgress: this.currentProgress,
      bodyProgress: {
        total: queueStatus.total,
        synced: queueStatus.completed,
        pending: queueStatus.pending,
        processing: queueStatus.processing,
        error: queueStatus.error
      }
    }
  }

  // 계정별 동기화 상태 조회
  getAccountStatus(accountEmail: string): SyncStatus | null {
    const db = getStorageDatabase().getDatabase()
    const account = db.prepare('SELECT id FROM accounts WHERE email = ?').get(accountEmail) as
      | { id: string }
      | undefined

    if (!account) return null

    const queueStatus = this.queue.getStatusByAccount(account.id)

    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentAccount: accountEmail,
      headerProgress: this.currentProgress?.accountId === account.id ? this.currentProgress : null,
      bodyProgress: {
        total: queueStatus.total,
        synced: queueStatus.completed,
        pending: queueStatus.pending,
        processing: queueStatus.processing,
        error: queueStatus.error
      }
    }
  }

  // 폴더 목록 가져오기 (mail-service.ts 연동)
  private async getFolders(_account: AccountConfig): Promise<FolderInfo[]> {
    // 이 함수는 mail-service.ts의 getFolders와 연동 필요
    // 임시로 빈 배열 반환 - 실제 구현 시 교체
    throw new Error('getFolders not implemented - needs mail-service integration')
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // 캐시 정리
  async cleanup(): Promise<{ completedRemoved: number; errorsRemoved: number }> {
    const completedRemoved = this.queue.cleanupCompleted()
    const errorsRemoved = this.queue.cleanupErrors()

    return { completedRemoved, errorsRemoved }
  }
}

// 싱글톤 인스턴스 접근
export function getSyncService(): SyncService {
  return SyncService.getInstance()
}
