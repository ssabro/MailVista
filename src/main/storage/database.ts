import Database from 'better-sqlite3'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { initializeSchema, runMigrations } from './schema'

const DB_VERSION = 5

export class StorageDatabase {
  private db: Database.Database
  private static instance: StorageDatabase | null = null
  private storagePath: string

  private constructor() {
    this.storagePath = path.join(app.getPath('userData'), 'mail-storage')
    fs.mkdirSync(this.storagePath, { recursive: true })

    const dbPath = path.join(this.storagePath, 'mailvista.db')
    this.db = new Database(dbPath)

    // WAL 모드 활성화 (동시 읽기/쓰기 성능 향상)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('cache_size = -64000') // 64MB 캐시
    this.db.pragma('temp_store = MEMORY')
    this.db.pragma('foreign_keys = ON')

    this.initialize()
  }

  private initialize(): void {
    // 버전 체크 및 스키마 초기화
    const versionResult = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
      .get()

    if (!versionResult) {
      // 새 데이터베이스 - 스키마 초기화
      console.log('[DB] New database, initializing schema...')
      initializeSchema(this.db)
      this.db.prepare('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER)').run()
      this.db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(DB_VERSION)
      console.log(`[DB] Schema initialized at version ${DB_VERSION}`)

      // 새 데이터베이스에도 추가 테이블 생성 (마이그레이션에 포함된 테이블들)
      this.ensureMissingTables()
    } else {
      // 기존 데이터베이스 - 마이그레이션 체크
      const currentVersion = this.db.prepare('SELECT version FROM schema_version').get() as
        | { version: number }
        | undefined

      console.log(`[DB] Current schema version: ${currentVersion?.version}, target: ${DB_VERSION}`)

      if (!currentVersion || currentVersion.version < DB_VERSION) {
        console.log(
          `[DB] Running migrations from ${currentVersion?.version || 0} to ${DB_VERSION}...`
        )
        runMigrations(this.db, currentVersion?.version || 0, DB_VERSION)
        this.db.prepare('UPDATE schema_version SET version = ?').run(DB_VERSION)
        console.log(`[DB] Migrations completed, now at version ${DB_VERSION}`)
      } else {
        console.log('[DB] Schema is up to date')
      }

      // 누락된 테이블 확인 및 생성 (마이그레이션 이후 추가된 테이블)
      this.ensureMissingTables()
    }
  }

  // 누락된 테이블이 있으면 생성
  private ensureMissingTables(): void {
    // 잘못된 스키마 테이블 수정 (mail_filters 컬럼 확인)
    this.fixInvalidSchemas()

    // 누락 가능한 모든 테이블 확인 및 생성
    const tablesToCheck = [
      'spam_settings',
      'blocked_senders',
      'blocked_domains',
      'vip_senders',
      'signatures',
      'signature_settings',
      'contacts',
      'contact_groups',
      'contact_group_members',
      'mail_filters',
      'filter_conditions',
      'tags',
      'email_tags',
      'email_templates'
    ]

    const missingTables: string[] = []
    for (const table of tablesToCheck) {
      const exists = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table)
      if (!exists) {
        missingTables.push(table)
      }
    }

    if (missingTables.length > 0) {
      console.log(`[DB] Creating missing tables: ${missingTables.join(', ')}`)
      this.db.exec(`
        -- 스팸 설정 테이블
        CREATE TABLE IF NOT EXISTS spam_settings (
          account_id TEXT PRIMARY KEY,
          enabled INTEGER DEFAULT 0,
          auto_delete INTEGER DEFAULT 0,
          retention_days INTEGER DEFAULT 30,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS blocked_senders (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          email TEXT NOT NULL,
          added_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
          UNIQUE(account_id, email)
        );
        CREATE INDEX IF NOT EXISTS idx_blocked_senders_account ON blocked_senders(account_id);
        CREATE INDEX IF NOT EXISTS idx_blocked_senders_email ON blocked_senders(account_id, email);

        CREATE TABLE IF NOT EXISTS blocked_domains (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          domain TEXT NOT NULL,
          added_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
          UNIQUE(account_id, domain)
        );
        CREATE INDEX IF NOT EXISTS idx_blocked_domains_account ON blocked_domains(account_id);

        -- VIP 발신자 테이블
        CREATE TABLE IF NOT EXISTS vip_senders (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          email TEXT NOT NULL,
          name TEXT,
          added_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
          UNIQUE(account_id, email)
        );
        CREATE INDEX IF NOT EXISTS idx_vip_senders_account ON vip_senders(account_id);
        CREATE INDEX IF NOT EXISTS idx_vip_senders_email ON vip_senders(account_id, email);

        -- 서명 테이블
        CREATE TABLE IF NOT EXISTS signatures (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          name TEXT NOT NULL,
          content TEXT NOT NULL,
          is_default INTEGER DEFAULT 0,
          include_in_reply INTEGER DEFAULT 1,
          include_in_forward INTEGER DEFAULT 1,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        -- 연락처 테이블
        CREATE TABLE IF NOT EXISTS contacts (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT,
          organization TEXT,
          memo TEXT,
          starred INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
          UNIQUE(account_id, email)
        );
        CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(account_id);
        CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(account_id, email);

        CREATE TABLE IF NOT EXISTS contact_groups (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          name TEXT NOT NULL,
          parent_id TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_id) REFERENCES contact_groups(id) ON DELETE SET NULL,
          UNIQUE(account_id, name, parent_id)
        );
        CREATE INDEX IF NOT EXISTS idx_contact_groups_account ON contact_groups(account_id);

        CREATE TABLE IF NOT EXISTS contact_group_members (
          contact_id TEXT NOT NULL,
          group_id TEXT NOT NULL,
          PRIMARY KEY (contact_id, group_id),
          FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
          FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE CASCADE
        );

        -- 메일 필터 테이블
        CREATE TABLE IF NOT EXISTS mail_filters (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          name TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          match_type TEXT DEFAULT 'all',
          action TEXT NOT NULL,
          target_folder TEXT,
          priority INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_mail_filters_account ON mail_filters(account_id);
        CREATE INDEX IF NOT EXISTS idx_mail_filters_enabled ON mail_filters(account_id, enabled);

        -- 필터 조건 테이블
        CREATE TABLE IF NOT EXISTS filter_conditions (
          id TEXT PRIMARY KEY,
          filter_id TEXT NOT NULL,
          field TEXT NOT NULL,
          operator TEXT NOT NULL,
          value TEXT NOT NULL,
          FOREIGN KEY (filter_id) REFERENCES mail_filters(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_filter_conditions_filter ON filter_conditions(filter_id);

        -- 태그 테이블
        CREATE TABLE IF NOT EXISTS tags (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
          UNIQUE(account_id, name)
        );
        CREATE INDEX IF NOT EXISTS idx_tags_account ON tags(account_id);

        CREATE TABLE IF NOT EXISTS email_tags (
          email_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          PRIMARY KEY (email_id, tag_id),
          FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_email_tags_email ON email_tags(email_id);
        CREATE INDEX IF NOT EXISTS idx_email_tags_tag ON email_tags(tag_id);

        -- 서명 설정 테이블
        CREATE TABLE IF NOT EXISTS signature_settings (
          account_id TEXT PRIMARY KEY,
          enabled INTEGER DEFAULT 1,
          include_in_reply INTEGER DEFAULT 1,
          include_in_forward INTEGER DEFAULT 1,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        -- 이메일 템플릿 테이블
        CREATE TABLE IF NOT EXISTS email_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          subject TEXT,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_email_templates_name ON email_templates(name);
      `)
      console.log('[DB] Missing tables created successfully')
    }
  }

  // 잘못된 스키마를 가진 테이블 수정
  private fixInvalidSchemas(): void {
    // mail_filters 테이블 컬럼 확인
    const mailFiltersExists = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mail_filters'")
      .get()

    if (mailFiltersExists) {
      // action 컬럼이 있는지 확인
      const columns = this.db.prepare('PRAGMA table_info(mail_filters)').all() as Array<{
        name: string
      }>
      const hasActionColumn = columns.some((col) => col.name === 'action')
      const hasConditionsColumn = columns.some((col) => col.name === 'conditions')

      // 잘못된 스키마인 경우 (conditions 컬럼이 있고 action 컬럼이 없으면)
      if (hasConditionsColumn && !hasActionColumn) {
        console.log('[DB] Fixing mail_filters table schema...')
        this.db.exec(`
          DROP TABLE IF EXISTS mail_filters;
          DROP TABLE IF EXISTS filter_conditions;
        `)
        console.log('[DB] Invalid mail_filters table dropped, will be recreated')
      }
    }
  }

  static getInstance(): StorageDatabase {
    if (!StorageDatabase.instance) {
      StorageDatabase.instance = new StorageDatabase()
    }
    return StorageDatabase.instance
  }

  getDatabase(): Database.Database {
    return this.db
  }

  getStoragePath(): string {
    return this.storagePath
  }

  // 트랜잭션 헬퍼
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }

  // 스토리지 통계 조회
  getStorageStats(accountEmail?: string): StorageStats {
    let totalEmails: number
    let cachedBodies: number
    let totalFolders: number

    if (accountEmail) {
      const accountResult = this.db
        .prepare('SELECT id FROM accounts WHERE email = ?')
        .get(accountEmail) as { id: string } | undefined

      if (!accountResult) {
        return { totalEmails: 0, cachedBodies: 0, totalFolders: 0, storageSize: 0 }
      }

      totalEmails = (
        this.db
          .prepare(
            `
        SELECT COUNT(*) as count FROM emails e
        JOIN folders f ON e.folder_id = f.id
        WHERE f.account_id = ?
      `
          )
          .get(accountResult.id) as { count: number }
      ).count

      cachedBodies = (
        this.db
          .prepare(
            `
        SELECT COUNT(*) as count FROM emails e
        JOIN folders f ON e.folder_id = f.id
        WHERE f.account_id = ? AND e.body_path IS NOT NULL
      `
          )
          .get(accountResult.id) as { count: number }
      ).count

      totalFolders = (
        this.db
          .prepare('SELECT COUNT(*) as count FROM folders WHERE account_id = ?')
          .get(accountResult.id) as {
          count: number
        }
      ).count
    } else {
      totalEmails = (
        this.db.prepare('SELECT COUNT(*) as count FROM emails').get() as { count: number }
      ).count

      cachedBodies = (
        this.db
          .prepare('SELECT COUNT(*) as count FROM emails WHERE body_path IS NOT NULL')
          .get() as {
          count: number
        }
      ).count

      totalFolders = (
        this.db.prepare('SELECT COUNT(*) as count FROM folders').get() as { count: number }
      ).count
    }

    // 디스크 사용량 계산
    const bodiesPath = path.join(this.storagePath, 'bodies')
    const storageSize = this.calculateDirectorySize(bodiesPath)

    return { totalEmails, cachedBodies, totalFolders, storageSize }
  }

  private calculateDirectorySize(dirPath: string): number {
    if (!fs.existsSync(dirPath)) {
      return 0
    }

    let totalSize = 0
    const files = fs.readdirSync(dirPath)

    for (const file of files) {
      const filePath = path.join(dirPath, file)
      const stats = fs.statSync(filePath)

      if (stats.isDirectory()) {
        totalSize += this.calculateDirectorySize(filePath)
      } else {
        totalSize += stats.size
      }
    }

    return totalSize
  }

  // 데이터베이스 정리 (VACUUM)
  vacuum(): void {
    this.db.exec('VACUUM')
  }

  // 데이터베이스 연결 종료
  close(): void {
    if (this.db) {
      this.db.close()
      StorageDatabase.instance = null
    }
  }

  // 전체 데이터 삭제 (캐시 초기화)
  clearAllData(): void {
    this.transaction(() => {
      this.db.exec('DELETE FROM operation_queue')
      this.db.exec('DELETE FROM sync_queue')
      this.db.exec('DELETE FROM attachments')
      this.db.exec('DELETE FROM emails')
      this.db.exec('DELETE FROM folders')
      this.db.exec('DELETE FROM accounts')
      this.db.exec('DELETE FROM sync_state')
    })

    // 본문 파일 삭제
    const bodiesPath = path.join(this.storagePath, 'bodies')
    if (fs.existsSync(bodiesPath)) {
      fs.rmSync(bodiesPath, { recursive: true, force: true })
    }
    fs.mkdirSync(bodiesPath, { recursive: true })

    this.vacuum()
  }

  // 특정 계정 데이터 삭제
  clearAccountData(accountEmail: string): void {
    const accountResult = this.db
      .prepare('SELECT id FROM accounts WHERE email = ?')
      .get(accountEmail) as { id: string } | undefined

    if (!accountResult) return

    this.transaction(() => {
      // CASCADE로 인해 관련 데이터 자동 삭제
      this.db.prepare('DELETE FROM accounts WHERE id = ?').run(accountResult.id)
    })

    // 본문 파일 삭제
    const accountBodiesPath = path.join(this.storagePath, 'bodies', accountResult.id)
    if (fs.existsSync(accountBodiesPath)) {
      fs.rmSync(accountBodiesPath, { recursive: true, force: true })
    }
  }
}

export interface StorageStats {
  totalEmails: number
  cachedBodies: number
  totalFolders: number
  storageSize: number
}

// 싱글톤 인스턴스 접근 헬퍼
export function getStorageDatabase(): StorageDatabase {
  return StorageDatabase.getInstance()
}
