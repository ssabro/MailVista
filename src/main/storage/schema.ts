import Database from 'better-sqlite3'

export function initializeSchema(db: Database.Database): void {
  db.exec(`
    -- 계정 테이블
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- 폴더 테이블
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      delimiter TEXT,
      special_use TEXT,
      uid_validity INTEGER,
      last_sync INTEGER,
      total_count INTEGER DEFAULT 0,
      unread_count INTEGER DEFAULT 0,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      UNIQUE(account_id, path)
    );

    CREATE INDEX IF NOT EXISTS idx_folders_account ON folders(account_id);
    CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(account_id, path);

    -- 이메일 테이블
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL,
      uid INTEGER NOT NULL,
      message_id TEXT,
      subject TEXT,
      from_name TEXT,
      from_address TEXT,
      to_addresses TEXT,
      cc_addresses TEXT,
      date INTEGER,
      flags TEXT,
      has_attachment INTEGER DEFAULT 0,
      body_path TEXT,
      body_text TEXT,
      size INTEGER DEFAULT 0,
      cached_at INTEGER,
      sync_status TEXT DEFAULT 'pending',
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
      UNIQUE(folder_id, uid)
    );

    CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder_id);
    CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(folder_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_emails_uid ON emails(folder_id, uid);
    CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);
    CREATE INDEX IF NOT EXISTS idx_emails_sync_status ON emails(sync_status);

    -- 첨부파일 테이블
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      email_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT,
      size INTEGER DEFAULT 0,
      part_id TEXT,
      content_id TEXT,
      FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_email ON attachments(email_id);

    -- FTS5 가상 테이블 (전문 검색)
    CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
      subject,
      from_name,
      from_address,
      to_addresses,
      body_text,
      attachment_names,
      content='emails',
      content_rowid='rowid'
    );

    -- 동기화 상태 테이블
    CREATE TABLE IF NOT EXISTS sync_state (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      folder_id TEXT,
      sync_type TEXT NOT NULL,
      status TEXT DEFAULT 'idle',
      progress INTEGER DEFAULT 0,
      total_items INTEGER DEFAULT 0,
      synced_items INTEGER DEFAULT 0,
      last_error TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    -- 동기화 큐 테이블 (백그라운드 다운로드 우선순위)
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      email_id TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, priority DESC);

    -- 작업 큐 테이블 (사용자 작업의 백그라운드 IMAP 동기화)
    CREATE TABLE IF NOT EXISTS operation_queue (
      id TEXT PRIMARY KEY,
      account_email TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      target_folder TEXT,
      uids TEXT NOT NULL,
      flags TEXT,
      original_data TEXT,
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      created_at INTEGER NOT NULL,
      updated_at INTEGER,
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_operation_queue_status ON operation_queue(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_operation_queue_account ON operation_queue(account_email);
  `)

  // FTS 트리거 생성 (자동 동기화)
  createFtsTriggers(db)
}

function createFtsTriggers(db: Database.Database): void {
  // INSERT 트리거
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS emails_fts_insert AFTER INSERT ON emails BEGIN
      INSERT INTO emails_fts(rowid, subject, from_name, from_address, to_addresses, body_text, attachment_names)
      VALUES (
        new.rowid,
        new.subject,
        new.from_name,
        new.from_address,
        new.to_addresses,
        new.body_text,
        (SELECT GROUP_CONCAT(filename, ' ') FROM attachments WHERE email_id = new.id)
      );
    END;
  `)

  // DELETE 트리거
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS emails_fts_delete AFTER DELETE ON emails BEGIN
      INSERT INTO emails_fts(emails_fts, rowid, subject, from_name, from_address, to_addresses, body_text, attachment_names)
      VALUES ('delete', old.rowid, old.subject, old.from_name, old.from_address, old.to_addresses, old.body_text, '');
    END;
  `)

  // UPDATE 트리거
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS emails_fts_update AFTER UPDATE ON emails BEGIN
      INSERT INTO emails_fts(emails_fts, rowid, subject, from_name, from_address, to_addresses, body_text, attachment_names)
      VALUES ('delete', old.rowid, old.subject, old.from_name, old.from_address, old.to_addresses, old.body_text, '');
      INSERT INTO emails_fts(rowid, subject, from_name, from_address, to_addresses, body_text, attachment_names)
      VALUES (
        new.rowid,
        new.subject,
        new.from_name,
        new.from_address,
        new.to_addresses,
        new.body_text,
        (SELECT GROUP_CONCAT(filename, ' ') FROM attachments WHERE email_id = new.id)
      );
    END;
  `)
}

// 마이그레이션 함수 (버전 업그레이드 시 사용)
export function runMigrations(db: Database.Database, fromVersion: number, toVersion: number): void {
  // 버전별 마이그레이션 로직
  for (let version = fromVersion + 1; version <= toVersion; version++) {
    switch (version) {
      case 1:
        // 초기 버전 - 마이그레이션 없음
        break
      case 2:
        // operation_queue 테이블 추가 (Local-First 아키텍처)
        db.exec(`
          CREATE TABLE IF NOT EXISTS operation_queue (
            id TEXT PRIMARY KEY,
            account_email TEXT NOT NULL,
            operation_type TEXT NOT NULL,
            folder_path TEXT NOT NULL,
            target_folder TEXT,
            uids TEXT NOT NULL,
            flags TEXT,
            original_data TEXT,
            status TEXT DEFAULT 'pending',
            retry_count INTEGER DEFAULT 0,
            max_retries INTEGER DEFAULT 3,
            created_at INTEGER NOT NULL,
            updated_at INTEGER,
            error_message TEXT
          );

          CREATE INDEX IF NOT EXISTS idx_operation_queue_status ON operation_queue(status, created_at);
          CREATE INDEX IF NOT EXISTS idx_operation_queue_account ON operation_queue(account_email);
        `)
        break
      case 3:
        // 통합 저장소 마이그레이션 - contacts, filters, tags, signatures, vip_senders
        migrateToUnifiedStorage(db)
        break
      case 4:
        // 추가 통합 - email_templates, offline_cache
        migrateToUnifiedStorageV4(db)
        break
      case 5:
        // 스팸 설정 및 차단 테이블 추가
        console.log('[Migration V5] Creating spam tables...')
        migrateToSpamTables(db)
        console.log('[Migration V5] Spam tables created successfully')
        break
      default:
        break
    }
  }
}

// 버전 5: 스팸 설정 및 차단 테이블 추가
function migrateToSpamTables(db: Database.Database): void {
  db.exec(`
    -- =====================================================
    -- 스팸 설정 테이블
    -- =====================================================
    CREATE TABLE IF NOT EXISTS spam_settings (
      account_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      auto_delete INTEGER DEFAULT 0,
      retention_days INTEGER DEFAULT 30,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    -- 차단 발신자 테이블
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

    -- 차단 도메인 테이블
    CREATE TABLE IF NOT EXISTS blocked_domains (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      UNIQUE(account_id, domain)
    );

    CREATE INDEX IF NOT EXISTS idx_blocked_domains_account ON blocked_domains(account_id);
  `)
}

// 버전 4: 이메일 템플릿 및 오프라인 캐시 테이블 추가
function migrateToUnifiedStorageV4(db: Database.Database): void {
  db.exec(`
    -- =====================================================
    -- 이메일 템플릿 테이블
    -- =====================================================
    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_email_templates_name ON email_templates(name);

    -- =====================================================
    -- 오프라인 설정 테이블
    -- =====================================================
    CREATE TABLE IF NOT EXISTS offline_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER DEFAULT 0,
      max_cache_size INTEGER DEFAULT 104857600,
      max_emails_per_folder INTEGER DEFAULT 100
    );

    -- 기본값 삽입
    INSERT OR IGNORE INTO offline_settings (id, enabled, max_cache_size, max_emails_per_folder)
    VALUES (1, 0, 104857600, 100);

    -- =====================================================
    -- 오프라인 캐시된 이메일 테이블
    -- =====================================================
    CREATE TABLE IF NOT EXISTS offline_cached_emails (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      uid INTEGER NOT NULL,
      message_id TEXT,
      subject TEXT,
      from_address TEXT,
      from_name TEXT,
      to_addresses TEXT,
      date INTEGER,
      flags TEXT,
      has_attachment INTEGER DEFAULT 0,
      html_content TEXT,
      text_content TEXT,
      attachments TEXT,
      cached_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      UNIQUE(account_id, folder_path, uid)
    );

    CREATE INDEX IF NOT EXISTS idx_offline_cached_account ON offline_cached_emails(account_id);
    CREATE INDEX IF NOT EXISTS idx_offline_cached_folder ON offline_cached_emails(account_id, folder_path);

    -- =====================================================
    -- 오프라인 대기 이메일 테이블 (발송 대기)
    -- =====================================================
    CREATE TABLE IF NOT EXISTS offline_pending_emails (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      to_addresses TEXT NOT NULL,
      cc_addresses TEXT,
      bcc_addresses TEXT,
      subject TEXT,
      html_content TEXT,
      text_content TEXT,
      attachments TEXT,
      reply_to_message_id TEXT,
      retry_count INTEGER DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_offline_pending_account ON offline_pending_emails(account_id);

    -- =====================================================
    -- 오프라인 캐시된 폴더 목록
    -- =====================================================
    CREATE TABLE IF NOT EXISTS offline_cached_folders (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      cached_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      UNIQUE(account_id, folder_path)
    );

    CREATE INDEX IF NOT EXISTS idx_offline_folders_account ON offline_cached_folders(account_id);
  `)
}

// 버전 3: 통합 저장소 스키마 추가
function migrateToUnifiedStorage(db: Database.Database): void {
  db.exec(`
    -- =====================================================
    -- 연락처 테이블
    -- =====================================================
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
    CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(account_id, name);
    CREATE INDEX IF NOT EXISTS idx_contacts_starred ON contacts(account_id, starred);

    -- 연락처 그룹 테이블
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

    -- 연락처-그룹 매핑 (다대다)
    CREATE TABLE IF NOT EXISTS contact_group_members (
      contact_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      PRIMARY KEY (contact_id, group_id),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE CASCADE
    );

    -- =====================================================
    -- 메일 필터 테이블
    -- =====================================================
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

    -- =====================================================
    -- 태그 테이블
    -- =====================================================
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

    -- 이메일-태그 매핑
    CREATE TABLE IF NOT EXISTS email_tags (
      email_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      assigned_at INTEGER NOT NULL,
      PRIMARY KEY (email_id, tag_id),
      FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_email_tags_email ON email_tags(email_id);
    CREATE INDEX IF NOT EXISTS idx_email_tags_tag ON email_tags(tag_id);

    -- =====================================================
    -- VIP 발신자 테이블
    -- =====================================================
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

    -- =====================================================
    -- 서명 테이블
    -- =====================================================
    CREATE TABLE IF NOT EXISTS signatures (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_signatures_account ON signatures(account_id);

    -- 서명 설정 테이블
    CREATE TABLE IF NOT EXISTS signature_settings (
      account_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 1,
      include_in_reply INTEGER DEFAULT 1,
      include_in_forward INTEGER DEFAULT 1,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    -- =====================================================
    -- 스팸 설정 테이블
    -- =====================================================
    CREATE TABLE IF NOT EXISTS spam_settings (
      account_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      auto_delete INTEGER DEFAULT 0,
      retention_days INTEGER DEFAULT 30,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    -- 차단 발신자 테이블
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

    -- 차단 도메인 테이블
    CREATE TABLE IF NOT EXISTS blocked_domains (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      UNIQUE(account_id, domain)
    );

    CREATE INDEX IF NOT EXISTS idx_blocked_domains_account ON blocked_domains(account_id);

    -- =====================================================
    -- 가상 폴더 테이블
    -- =====================================================
    CREATE TABLE IF NOT EXISTS virtual_folders (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      match_type TEXT DEFAULT 'all',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_virtual_folders_account ON virtual_folders(account_id);

    -- 가상 폴더 조건 테이블
    CREATE TABLE IF NOT EXISTS virtual_folder_conditions (
      id TEXT PRIMARY KEY,
      virtual_folder_id TEXT NOT NULL,
      field TEXT NOT NULL,
      operator TEXT NOT NULL,
      value TEXT NOT NULL,
      FOREIGN KEY (virtual_folder_id) REFERENCES virtual_folders(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_virtual_folder_conditions_folder ON virtual_folder_conditions(virtual_folder_id);
  `)
}

// 첨부파일 추가 후 FTS 인덱스 업데이트
export function updateEmailFtsAttachments(db: Database.Database, emailId: string): void {
  const email = db.prepare('SELECT rowid, * FROM emails WHERE id = ?').get(emailId) as
    | EmailRow
    | undefined

  if (!email) return

  const attachmentNames = db
    .prepare("SELECT GROUP_CONCAT(filename, ' ') as names FROM attachments WHERE email_id = ?")
    .get(emailId) as { names: string | null }

  // FTS 레코드 업데이트 (삭제 후 재삽입)
  db.prepare(
    `
    INSERT INTO emails_fts(emails_fts, rowid, subject, from_name, from_address, to_addresses, body_text, attachment_names)
    VALUES ('delete', ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    email.rowid,
    email.subject,
    email.from_name,
    email.from_address,
    email.to_addresses,
    email.body_text,
    ''
  )

  db.prepare(
    `
    INSERT INTO emails_fts(rowid, subject, from_name, from_address, to_addresses, body_text, attachment_names)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    email.rowid,
    email.subject,
    email.from_name,
    email.from_address,
    email.to_addresses,
    email.body_text,
    attachmentNames.names || ''
  )
}

interface EmailRow {
  rowid: number
  id: string
  subject: string | null
  from_name: string | null
  from_address: string | null
  to_addresses: string | null
  body_text: string | null
}
