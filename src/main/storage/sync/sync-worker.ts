import { simpleParser } from 'mailparser'
import { getEmailRepository } from '../email-repository'
import type { EmailInput } from '../email-repository'
import { getFolderRepository } from '../folder-repository'
import { getBodyStorage } from '../body-storage'
import { getSyncQueue, SyncQueue } from './sync-queue'
import { getStorageDatabase } from '../database'
import { v4 as uuidv4 } from 'uuid'
import { logger, LogCategory } from '../../logger'

// 타입 정의 (mail-service.ts와 호환)
export interface AccountConfig {
  email: string
  password: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  secure: boolean
  oauth2?: {
    accessToken: string
    refreshToken?: string
    expires?: number
  }
}

export interface FolderInfo {
  name: string
  path: string
  delimiter: string
  specialUse?: string
  flags?: string[]
}

export interface SyncProgress {
  accountId: string
  folderId?: string
  folderPath?: string
  type: 'header' | 'body'
  status: 'running' | 'paused' | 'completed' | 'error'
  progress: number
  total: number
  synced: number
  currentItem?: string
  error?: string
}

export type ProgressCallback = (progress: SyncProgress) => void

export class SyncWorker {
  private isStopped = false
  private isPaused = false
  private emailRepo = getEmailRepository()
  private folderRepo = getFolderRepository()
  private bodyStorage = getBodyStorage()
  private syncQueue = getSyncQueue()

  // IMAP 연결 팩토리 (외부에서 주입)
  private imapConnectFn: ((account: AccountConfig) => Promise<ImapConnection>) | null = null

  setImapConnector(fn: (account: AccountConfig) => Promise<ImapConnection>): void {
    this.imapConnectFn = fn
  }

  stop(): void {
    this.isStopped = true
  }

  pause(): void {
    this.isPaused = true
  }

  resume(): void {
    this.isPaused = false
  }

  isRunning(): boolean {
    return !this.isStopped && !this.isPaused
  }

  // 계정 등록 또는 업데이트
  ensureAccount(email: string, name?: string): string {
    const db = getStorageDatabase().getDatabase()
    const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email) as
      | { id: string }
      | undefined

    if (existing) {
      return existing.id
    }

    const id = uuidv4()
    const now = Date.now()
    db.prepare(
      'INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, email, name || email, now, now)

    return id
  }

  // 폴더 헤더 동기화 (모든 폴더의 이메일 헤더 가져오기)
  async syncFolderHeaders(
    account: AccountConfig,
    folder: FolderInfo,
    onProgress?: ProgressCallback
  ): Promise<{ success: boolean; newEmails: number; error?: string }> {
    if (this.isStopped) return { success: false, newEmails: 0, error: 'Worker stopped' }

    const accountId = this.ensureAccount(account.email)

    // 폴더 등록
    const folderRecord = this.folderRepo.getOrCreate({
      accountId,
      name: folder.name,
      path: folder.path,
      delimiter: folder.delimiter,
      specialUse: folder.specialUse
    })

    try {
      // IMAP 연결
      if (!this.imapConnectFn) {
        throw new Error('IMAP connector not set')
      }

      const imap = await this.imapConnectFn(account)

      try {
        // 폴더 열기
        const mailbox = await imap.openBox(folder.path, true)

        // UIDVALIDITY 체크
        if (
          folderRecord.uid_validity !== null &&
          folderRecord.uid_validity !== mailbox.uidvalidity
        ) {
          // UIDVALIDITY 변경됨 - 모든 이메일 삭제
          this.emailRepo.deleteByFolderId(folderRecord.id)
          await this.bodyStorage.deleteFolderBodies(accountId, folderRecord.id)
        }

        // UIDVALIDITY 업데이트
        this.folderRepo.update(folderRecord.id, { uidValidity: mailbox.uidvalidity })

        // 로컬 UID 목록
        const localUids = new Set(this.emailRepo.getUidsByFolderId(folderRecord.id))

        // 서버 UID 목록 조회
        const serverUids = await imap.search(['ALL'])

        if (this.isStopped) {
          await imap.end()
          return { success: false, newEmails: 0, error: 'Worker stopped' }
        }

        // 삭제된 메일 처리
        const deletedCount = this.emailRepo.deleteNotInUids(folderRecord.id, serverUids)
        if (deletedCount > 0) {
          console.log(`Deleted ${deletedCount} removed emails from folder ${folder.path}`)
        }

        // 새 메일 식별
        const newUids = serverUids.filter((uid) => !localUids.has(uid))

        if (newUids.length === 0) {
          this.folderRepo.updateLastSync(folderRecord.id)
          await imap.end()
          return { success: true, newEmails: 0 }
        }

        // 진행 상태 보고
        onProgress?.({
          accountId,
          folderId: folderRecord.id,
          folderPath: folder.path,
          type: 'header',
          status: 'running',
          progress: 0,
          total: newUids.length,
          synced: 0
        })

        // 새 메일 헤더 가져오기 (배치)
        const batchSize = 100
        let synced = 0
        const emailInputs: EmailInput[] = []

        for (let i = 0; i < newUids.length; i += batchSize) {
          if (this.isStopped) break
          while (this.isPaused) {
            await this.sleep(1000)
            if (this.isStopped) break
          }

          const batch = newUids.slice(i, i + batchSize)
          const headers = await imap.fetchHeaders(batch)

          for (const header of headers) {
            const from = header.from?.[0]
            emailInputs.push({
              folderId: folderRecord.id,
              uid: header.uid,
              messageId: header.messageId,
              subject: header.subject,
              fromName: from?.name,
              fromAddress: from?.address,
              toAddresses: header.to?.map((t) => t.address).filter(Boolean) as string[],
              ccAddresses: header.cc?.map((c) => c.address).filter(Boolean) as string[],
              date: header.date?.getTime(),
              flags: header.flags,
              hasAttachment: header.hasAttachment,
              size: header.size
            })
          }

          synced += batch.length

          onProgress?.({
            accountId,
            folderId: folderRecord.id,
            folderPath: folder.path,
            type: 'header',
            status: 'running',
            progress: Math.round((synced / newUids.length) * 100),
            total: newUids.length,
            synced
          })
        }

        // 배치 삽입
        const insertedCount = this.emailRepo.batchCreate(emailInputs)

        // 동기화 큐에 본문 다운로드 추가
        const pendingEmails = this.emailRepo.getPendingSync(folderRecord.id, 10000)
        const queueItems = pendingEmails.map((email) => ({
          emailId: email.id,
          priority:
            SyncQueue.calculatePriority(email.date) +
            SyncQueue.getFolderPriority(folder.specialUse || null)
        }))
        this.syncQueue.enqueueBatch(queueItems)

        // 폴더 카운트 업데이트
        const totalCount = this.emailRepo.getCountByFolderId(folderRecord.id)
        const unreadCount = this.emailRepo.getUnreadCountByFolderId(folderRecord.id)
        this.folderRepo.updateCounts(folderRecord.id, totalCount, unreadCount)
        this.folderRepo.updateLastSync(folderRecord.id)

        await imap.end()

        onProgress?.({
          accountId,
          folderId: folderRecord.id,
          folderPath: folder.path,
          type: 'header',
          status: 'completed',
          progress: 100,
          total: newUids.length,
          synced: insertedCount
        })

        return { success: true, newEmails: insertedCount }
      } catch (error) {
        await imap.end().catch(() => {})
        throw error
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      onProgress?.({
        accountId,
        folderId: folderRecord.id,
        folderPath: folder.path,
        type: 'header',
        status: 'error',
        progress: 0,
        total: 0,
        synced: 0,
        error: errorMessage
      })

      return { success: false, newEmails: 0, error: errorMessage }
    }
  }

  // 본문 동기화 (단일 이메일)
  async syncEmailBody(
    account: AccountConfig,
    folderPath: string,
    uid: number,
    emailId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.isStopped) return { success: false, error: 'Worker stopped' }

    const accountId = this.ensureAccount(account.email)
    const folder = this.folderRepo.getByPath(accountId, folderPath)

    if (!folder) {
      return { success: false, error: 'Folder not found' }
    }

    try {
      if (!this.imapConnectFn) {
        throw new Error('IMAP connector not set')
      }

      const imap = await this.imapConnectFn(account)

      try {
        await imap.openBox(folderPath, true)

        // 원본 EML 가져오기
        const emlContent = await imap.fetchRaw(uid)

        if (!emlContent) {
          throw new Error('Email not found on server')
        }

        // EML 파일로 저장
        const bodyPath = await this.bodyStorage.saveBody(accountId, folder.id, uid, emlContent)

        logger.info(LogCategory.SYNC, 'Email body saved locally (background sync)', {
          accountEmail: accountId,
          folder: folder.path,
          uid,
          bodyPath,
          size: emlContent.length
        })

        // 본문 텍스트 추출 (검색용)
        const parsed = await simpleParser(emlContent)
        const bodyText = parsed.text || this.stripHtml(parsed.html || '') || ''

        // 첨부파일 메타데이터 추출 및 저장
        if (parsed.attachments && parsed.attachments.length > 0) {
          for (const att of parsed.attachments) {
            this.emailRepo.addAttachment({
              emailId,
              filename: att.filename || 'attachment',
              contentType: att.contentType,
              size: att.size,
              contentId: att.contentId || undefined
            })
          }
        }

        // DB 업데이트
        this.emailRepo.updateBody(emailId, {
          bodyPath,
          bodyText: bodyText.substring(0, 100000) // 최대 100KB 텍스트
        })

        await imap.end()
        return { success: true }
      } catch (error) {
        await imap.end().catch(() => {})
        throw error
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.emailRepo.updateSyncStatus(emailId, 'error')
      return { success: false, error: errorMessage }
    }
  }

  // HTML 태그 제거
  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// IMAP 연결 인터페이스 (mail-service.ts와 연동)
export interface ImapConnection {
  openBox(path: string, readOnly: boolean): Promise<{ uidvalidity: number }>
  search(criteria: string[]): Promise<number[]>
  fetchHeaders(uids: number[]): Promise<EmailHeader[]>
  fetchRaw(uid: number): Promise<string | null>
  end(): Promise<void>
}

export interface EmailHeader {
  uid: number
  messageId?: string
  subject?: string
  from?: Array<{ name?: string; address?: string }>
  to?: Array<{ name?: string; address?: string }>
  cc?: Array<{ name?: string; address?: string }>
  date?: Date
  flags?: string[]
  hasAttachment?: boolean
  size?: number
}

// 싱글톤 인스턴스
let syncWorkerInstance: SyncWorker | null = null

export function getSyncWorker(): SyncWorker {
  if (!syncWorkerInstance) {
    syncWorkerInstance = new SyncWorker()
  }
  return syncWorkerInstance
}
