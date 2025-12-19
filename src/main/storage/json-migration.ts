/**
 * JSON to SQLite Migration Utility
 * - 기존 electron-store JSON 파일을 SQLite로 마이그레이션
 * - 분산된 설정 파일을 통합 config/credentials로 마이그레이션
 * - 앱 첫 실행 시 자동으로 실행됨
 */
import type Database from 'better-sqlite3'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { getStorageDatabase } from './database'
import { getOrCreateAccountId } from './account-helper'
import { v4 as uuidv4 } from 'uuid'

// =====================================================
// 마이그레이션 상태 관리
// =====================================================

const MIGRATION_V3_MARKER = 'migration_v3_completed.marker'
const MIGRATION_V4_MARKER = 'migration_v4_completed.marker'

/**
 * V3 마이그레이션 완료 여부 확인 (SQLite 마이그레이션)
 */
export function isMigrationV3Completed(): boolean {
  const markerPath = path.join(app.getPath('userData'), MIGRATION_V3_MARKER)
  return fs.existsSync(markerPath)
}

/**
 * V4 마이그레이션 완료 여부 확인 (설정 파일 통합)
 */
export function isMigrationV4Completed(): boolean {
  const markerPath = path.join(app.getPath('userData'), MIGRATION_V4_MARKER)
  return fs.existsSync(markerPath)
}

/**
 * 전체 마이그레이션 완료 여부 확인
 */
export function isMigrationCompleted(): boolean {
  return isMigrationV3Completed() && isMigrationV4Completed()
}

/**
 * V3 마이그레이션 완료 표시
 */
function markMigrationV3Completed(): void {
  const markerPath = path.join(app.getPath('userData'), MIGRATION_V3_MARKER)
  fs.writeFileSync(markerPath, new Date().toISOString())
}

/**
 * V4 마이그레이션 완료 표시
 */
function markMigrationV4Completed(): void {
  const markerPath = path.join(app.getPath('userData'), MIGRATION_V4_MARKER)
  fs.writeFileSync(markerPath, new Date().toISOString())
}

// =====================================================
// JSON 파일 읽기 헬퍼
// =====================================================

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(content)
    }
  } catch (err) {
    console.error(`[Migration] Failed to read ${filePath}:`, err)
  }
  return defaultValue
}

function extractEmailFromFilename(filename: string): string | null {
  // 파일명: contacts_ssabro_at_gmail_dot_com.json
  const match = filename.match(/^(.+?)_(.+)\.json$/)
  if (!match) return null

  const emailPart = match[2]
  // _at_ → @, _dot_ → .
  return emailPart.replace(/_at_/g, '@').replace(/_dot_/g, '.')
}

function findAccountFiles(prefix: string): Array<{ email: string; filePath: string }> {
  const userDataPath = app.getPath('userData')
  const files: Array<{ email: string; filePath: string }> = []

  try {
    const entries = fs.readdirSync(userDataPath)

    for (const entry of entries) {
      if (entry.startsWith(`${prefix}_`) && entry.endsWith('.json')) {
        const email = extractEmailFromFilename(entry)
        if (email) {
          files.push({
            email,
            filePath: path.join(userDataPath, entry)
          })
        }
      }
    }
  } catch (err) {
    console.error('[Migration] Failed to scan directory:', err)
  }

  return files
}

// =====================================================
// 마이그레이션 함수들
// =====================================================

/**
 * 연락처 마이그레이션
 */
function migrateContacts(db: Database.Database): void {
  console.log('[Migration] Migrating contacts...')

  const contactFiles = findAccountFiles('contacts')

  for (const { email, filePath } of contactFiles) {
    const data = readJsonFile<{ contacts?: unknown[]; groups?: unknown[] }>(filePath, {})
    const accountId = getOrCreateAccountId(email)

    // 그룹 마이그레이션
    const groupIdMap = new Map<string, string>() // oldId → newId

    if (data.groups && Array.isArray(data.groups)) {
      for (const group of data.groups as Array<{
        id: string
        name: string
        parentId?: string
        createdAt?: string
      }>) {
        const newId = uuidv4()
        groupIdMap.set(group.id, newId)

        db.prepare(
          'INSERT OR IGNORE INTO contact_groups (id, account_id, name, parent_id, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(
          newId,
          accountId,
          group.name,
          group.parentId ? groupIdMap.get(group.parentId) || null : null,
          group.createdAt ? new Date(group.createdAt).getTime() : Date.now()
        )
      }
    }

    // 연락처 마이그레이션
    if (data.contacts && Array.isArray(data.contacts)) {
      for (const contact of data.contacts as Array<{
        id: string
        name: string
        email: string
        phone?: string
        organization?: string
        memo?: string
        starred?: boolean
        groupIds?: string[]
        createdAt?: string
        updatedAt?: string
      }>) {
        const newId = uuidv4()
        const now = Date.now()

        try {
          db.prepare(
            `INSERT OR IGNORE INTO contacts
            (id, account_id, name, email, phone, organization, memo, starred, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            newId,
            accountId,
            contact.name,
            contact.email,
            contact.phone || null,
            contact.organization || null,
            contact.memo || null,
            contact.starred ? 1 : 0,
            contact.createdAt ? new Date(contact.createdAt).getTime() : now,
            contact.updatedAt ? new Date(contact.updatedAt).getTime() : now
          )

          // 그룹 매핑
          if (contact.groupIds && contact.groupIds.length > 0) {
            for (const oldGroupId of contact.groupIds) {
              const newGroupId = groupIdMap.get(oldGroupId)
              if (newGroupId) {
                db.prepare(
                  'INSERT OR IGNORE INTO contact_group_members (contact_id, group_id) VALUES (?, ?)'
                ).run(newId, newGroupId)
              }
            }
          }
        } catch (err) {
          console.error(`[Migration] Failed to migrate contact ${contact.email}:`, err)
        }
      }
    }

    console.log(`[Migration] Migrated contacts for ${email}`)
  }
}

/**
 * 메일 필터 마이그레이션
 */
function migrateMailFilters(db: Database.Database): void {
  console.log('[Migration] Migrating mail filters...')

  const filterFiles = findAccountFiles('mail-filters')

  for (const { email, filePath } of filterFiles) {
    const data = readJsonFile<{ filters?: unknown[] }>(filePath, {})
    const accountId = getOrCreateAccountId(email)

    if (data.filters && Array.isArray(data.filters)) {
      for (const filter of data.filters as Array<{
        id: string
        name: string
        enabled?: boolean
        conditions?: Array<{ field: string; operator: string; value: string }>
        matchType?: string
        action: string
        targetFolder?: string
        priority?: number
        createdAt?: string
        updatedAt?: string
      }>) {
        const newId = uuidv4()
        const now = Date.now()

        try {
          db.prepare(
            `INSERT OR IGNORE INTO mail_filters
            (id, account_id, name, enabled, match_type, action, target_folder, priority, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            newId,
            accountId,
            filter.name,
            filter.enabled !== false ? 1 : 0,
            filter.matchType || 'all',
            filter.action,
            filter.targetFolder || null,
            filter.priority || 0,
            filter.createdAt ? new Date(filter.createdAt).getTime() : now,
            filter.updatedAt ? new Date(filter.updatedAt).getTime() : now
          )

          // 조건 마이그레이션
          if (filter.conditions && filter.conditions.length > 0) {
            for (const condition of filter.conditions) {
              db.prepare(
                'INSERT INTO filter_conditions (id, filter_id, field, operator, value) VALUES (?, ?, ?, ?, ?)'
              ).run(uuidv4(), newId, condition.field, condition.operator, condition.value)
            }
          }
        } catch (err) {
          console.error(`[Migration] Failed to migrate filter ${filter.name}:`, err)
        }
      }
    }

    console.log(`[Migration] Migrated mail filters for ${email}`)
  }
}

/**
 * 서명 마이그레이션
 */
function migrateSignatures(db: Database.Database): void {
  console.log('[Migration] Migrating signatures...')

  const sigFiles = findAccountFiles('signature-settings')

  for (const { email, filePath } of sigFiles) {
    const data = readJsonFile<{
      enabled?: boolean
      signatures?: Array<{
        id: string
        name: string
        content: string
        isDefault?: boolean
        createdAt?: string
        updatedAt?: string
      }>
      includeInReply?: boolean
      includeInForward?: boolean
    }>(filePath, {})
    const accountId = getOrCreateAccountId(email)

    // 설정 마이그레이션
    db.prepare(
      `INSERT OR IGNORE INTO signature_settings
      (account_id, enabled, include_in_reply, include_in_forward)
      VALUES (?, ?, ?, ?)`
    ).run(
      accountId,
      data.enabled ? 1 : 0,
      data.includeInReply !== false ? 1 : 0,
      data.includeInForward !== false ? 1 : 0
    )

    // 서명 목록 마이그레이션
    if (data.signatures && Array.isArray(data.signatures)) {
      const now = Date.now()

      for (const sig of data.signatures) {
        try {
          db.prepare(
            `INSERT OR IGNORE INTO signatures
            (id, account_id, name, content, is_default, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(
            uuidv4(),
            accountId,
            sig.name,
            sig.content,
            sig.isDefault ? 1 : 0,
            sig.createdAt ? new Date(sig.createdAt).getTime() : now,
            sig.updatedAt ? new Date(sig.updatedAt).getTime() : now
          )
        } catch (err) {
          console.error(`[Migration] Failed to migrate signature ${sig.name}:`, err)
        }
      }
    }

    console.log(`[Migration] Migrated signatures for ${email}`)
  }
}

/**
 * 스팸 설정 마이그레이션
 */
function migrateSpamSettings(db: Database.Database): void {
  console.log('[Migration] Migrating spam settings...')

  const spamFiles = findAccountFiles('spam-settings')

  for (const { email, filePath } of spamFiles) {
    const data = readJsonFile<{
      enabled?: boolean
      blockedSenders?: Array<{ email: string; addedAt?: string }>
      blockedDomains?: Array<{ domain: string; addedAt?: string }>
      autoDelete?: boolean
      retentionDays?: number
    }>(filePath, {})
    const accountId = getOrCreateAccountId(email)

    // 설정 마이그레이션
    db.prepare(
      `INSERT OR IGNORE INTO spam_settings
      (account_id, enabled, auto_delete, retention_days)
      VALUES (?, ?, ?, ?)`
    ).run(accountId, data.enabled ? 1 : 0, data.autoDelete ? 1 : 0, data.retentionDays || 30)

    // 차단 발신자 마이그레이션
    if (data.blockedSenders && Array.isArray(data.blockedSenders)) {
      for (const sender of data.blockedSenders) {
        try {
          db.prepare(
            'INSERT OR IGNORE INTO blocked_senders (id, account_id, email, added_at) VALUES (?, ?, ?, ?)'
          ).run(
            uuidv4(),
            accountId,
            sender.email.toLowerCase(),
            sender.addedAt ? new Date(sender.addedAt).getTime() : Date.now()
          )
        } catch (err) {
          console.error(`[Migration] Failed to migrate blocked sender ${sender.email}:`, err)
        }
      }
    }

    // 차단 도메인 마이그레이션
    if (data.blockedDomains && Array.isArray(data.blockedDomains)) {
      for (const domain of data.blockedDomains) {
        try {
          db.prepare(
            'INSERT OR IGNORE INTO blocked_domains (id, account_id, domain, added_at) VALUES (?, ?, ?, ?)'
          ).run(
            uuidv4(),
            accountId,
            domain.domain.toLowerCase(),
            domain.addedAt ? new Date(domain.addedAt).getTime() : Date.now()
          )
        } catch (err) {
          console.error(`[Migration] Failed to migrate blocked domain ${domain.domain}:`, err)
        }
      }
    }

    console.log(`[Migration] Migrated spam settings for ${email}`)
  }
}

/**
 * VIP 발신자 마이그레이션
 */
function migrateVipSenders(db: Database.Database): void {
  console.log('[Migration] Migrating VIP senders...')

  const vipFiles = findAccountFiles('vip-senders')

  for (const { email, filePath } of vipFiles) {
    const data = readJsonFile<{
      vipSenders?: Array<{ email: string; name?: string; addedAt?: string }>
    }>(filePath, {})
    const accountId = getOrCreateAccountId(email)

    if (data.vipSenders && Array.isArray(data.vipSenders)) {
      for (const vip of data.vipSenders) {
        try {
          db.prepare(
            'INSERT OR IGNORE INTO vip_senders (id, account_id, email, name, added_at) VALUES (?, ?, ?, ?, ?)'
          ).run(
            uuidv4(),
            accountId,
            vip.email.toLowerCase(),
            vip.name || null,
            vip.addedAt ? new Date(vip.addedAt).getTime() : Date.now()
          )
        } catch (err) {
          console.error(`[Migration] Failed to migrate VIP ${vip.email}:`, err)
        }
      }
    }

    console.log(`[Migration] Migrated VIP senders for ${email}`)
  }
}

/**
 * 태그 마이그레이션
 */
function migrateTags(db: Database.Database): void {
  console.log('[Migration] Migrating tags...')

  const userDataPath = app.getPath('userData')
  const tagsFilePath = path.join(userDataPath, 'tags.json')

  const data = readJsonFile<{
    [accountEmail: string]: {
      tags?: Array<{ id: string; name: string; color: string; createdAt?: string }>
      emailTags?: { [emailUid: string]: string[] }
    }
  }>(tagsFilePath, {})

  for (const [accountEmail, accountData] of Object.entries(data)) {
    if (!accountEmail || accountEmail === 'default') continue

    const accountId = getOrCreateAccountId(accountEmail)
    const tagIdMap = new Map<string, string>() // oldId → newId

    // 태그 목록 마이그레이션
    if (accountData.tags && Array.isArray(accountData.tags)) {
      for (const tag of accountData.tags) {
        const newId = uuidv4()
        tagIdMap.set(tag.id, newId)

        try {
          db.prepare(
            'INSERT OR IGNORE INTO tags (id, account_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)'
          ).run(
            newId,
            accountId,
            tag.name,
            tag.color,
            tag.createdAt ? new Date(tag.createdAt).getTime() : Date.now()
          )
        } catch (err) {
          console.error(`[Migration] Failed to migrate tag ${tag.name}:`, err)
        }
      }
    }

    // 이메일-태그 매핑은 이메일 ID가 새 형식과 다를 수 있어 스킵
    // 필요시 별도 마이그레이션 로직 추가

    console.log(`[Migration] Migrated tags for ${accountEmail}`)
  }
}

/**
 * 가상 폴더 마이그레이션
 */
function migrateVirtualFolders(db: Database.Database): void {
  console.log('[Migration] Migrating virtual folders...')

  const userDataPath = app.getPath('userData')
  const vfFilePath = path.join(userDataPath, 'virtual-folders.json')

  const data = readJsonFile<{
    [accountEmail: string]: Array<{
      id: string
      name: string
      icon?: string
      color?: string
      conditions?: Array<{ field: string; operator: string; value: string }>
      matchType?: string
      createdAt?: string
      updatedAt?: string
    }>
  }>(vfFilePath, {})

  for (const [accountEmail, folders] of Object.entries(data)) {
    if (!accountEmail || !Array.isArray(folders)) continue

    const accountId = getOrCreateAccountId(accountEmail)
    const now = Date.now()

    for (const folder of folders) {
      const newId = uuidv4()

      try {
        db.prepare(
          `INSERT OR IGNORE INTO virtual_folders
          (id, account_id, name, icon, color, match_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          newId,
          accountId,
          folder.name,
          folder.icon || null,
          folder.color || null,
          folder.matchType || 'all',
          folder.createdAt ? new Date(folder.createdAt).getTime() : now,
          folder.updatedAt ? new Date(folder.updatedAt).getTime() : now
        )

        // 조건 마이그레이션
        if (folder.conditions && folder.conditions.length > 0) {
          for (const condition of folder.conditions) {
            db.prepare(
              'INSERT INTO virtual_folder_conditions (id, virtual_folder_id, field, operator, value) VALUES (?, ?, ?, ?, ?)'
            ).run(uuidv4(), newId, condition.field, condition.operator, condition.value)
          }
        }
      } catch (err) {
        console.error(`[Migration] Failed to migrate virtual folder ${folder.name}:`, err)
      }
    }

    console.log(`[Migration] Migrated virtual folders for ${accountEmail}`)
  }
}

// =====================================================
// V4 마이그레이션: 이메일 템플릿
// =====================================================

function migrateEmailTemplates(db: Database.Database): void {
  console.log('[Migration] Migrating email templates...')

  const userDataPath = app.getPath('userData')
  const templatesFile = path.join(userDataPath, 'email-templates.json')

  const data = readJsonFile<{
    templates?: Array<{
      id?: string
      name: string
      subject?: string
      content: string
      createdAt?: string
      updatedAt?: string
    }>
  }>(templatesFile, {})

  if (data.templates && Array.isArray(data.templates)) {
    const now = Date.now()

    for (const template of data.templates) {
      try {
        db.prepare(
          `INSERT OR IGNORE INTO email_templates
          (id, name, subject, content, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          template.id || uuidv4(),
          template.name,
          template.subject || null,
          template.content,
          template.createdAt ? new Date(template.createdAt).getTime() : now,
          template.updatedAt ? new Date(template.updatedAt).getTime() : now
        )
      } catch (err) {
        console.error(`[Migration] Failed to migrate template ${template.name}:`, err)
      }
    }
  }

  console.log('[Migration] Email templates migration completed')
}

// =====================================================
// V4 마이그레이션: 오프라인 설정
// =====================================================

function migrateOfflineSettings(db: Database.Database): void {
  console.log('[Migration] Migrating offline settings...')

  const offlineFiles = findAccountFiles('offline')

  for (const { email, filePath } of offlineFiles) {
    const data = readJsonFile<{
      enabled?: boolean
      maxCacheSize?: number
      maxEmailsPerFolder?: number
      cachedFolders?: string[]
    }>(filePath, {})

    // 오프라인 설정은 전역이므로 첫 번째 파일에서만 마이그레이션
    if (offlineFiles.indexOf({ email, filePath }) === 0) {
      db.prepare(
        `UPDATE offline_settings SET enabled = ?, max_cache_size = ?, max_emails_per_folder = ? WHERE id = 1`
      ).run(
        data.enabled ? 1 : 0,
        data.maxCacheSize || 100 * 1024 * 1024,
        data.maxEmailsPerFolder || 100
      )
    }

    // 캐시된 폴더 목록 마이그레이션
    if (data.cachedFolders && Array.isArray(data.cachedFolders)) {
      const accountId = getOrCreateAccountId(email)
      const now = Date.now()

      for (const folderPath of data.cachedFolders) {
        try {
          db.prepare(
            `INSERT OR IGNORE INTO offline_cached_folders (id, account_id, folder_path, cached_at)
            VALUES (?, ?, ?, ?)`
          ).run(uuidv4(), accountId, folderPath, now)
        } catch (err) {
          console.error(`[Migration] Failed to migrate cached folder ${folderPath}:`, err)
        }
      }
    }

    console.log(`[Migration] Migrated offline settings for ${email}`)
  }
}

// =====================================================
// 메인 마이그레이션 함수
// =====================================================

/**
 * V3: JSON → SQLite 마이그레이션 실행 (연락처, 필터 등)
 */
export function runMigrationV3(): void {
  if (isMigrationV3Completed()) {
    console.log('[Migration V3] Already completed, skipping...')
    return
  }

  console.log('[Migration V3] Starting JSON to SQLite migration...')

  const db = getStorageDatabase().getDatabase()

  try {
    db.transaction(() => {
      migrateContacts(db)
      migrateMailFilters(db)
      migrateSignatures(db)
      migrateSpamSettings(db)
      migrateVipSenders(db)
      migrateTags(db)
      migrateVirtualFolders(db)
    })()

    markMigrationV3Completed()
    console.log('[Migration V3] JSON to SQLite migration completed successfully!')
  } catch (err) {
    console.error('[Migration V3] Migration failed:', err)
    throw err
  }
}

/**
 * V4: 추가 데이터 마이그레이션 (템플릿, 오프라인)
 * - 설정 파일 통합은 unified-config가 자동 처리
 */
export function runMigrationV4(): void {
  if (isMigrationV4Completed()) {
    console.log('[Migration V4] Already completed, skipping...')
    return
  }

  console.log('[Migration V4] Starting additional data migration...')

  const db = getStorageDatabase().getDatabase()

  try {
    db.transaction(() => {
      migrateEmailTemplates(db)
      migrateOfflineSettings(db)
    })()

    markMigrationV4Completed()
    console.log('[Migration V4] Additional data migration completed successfully!')
  } catch (err) {
    console.error('[Migration V4] Migration failed:', err)
    throw err
  }
}

/**
 * 전체 마이그레이션 실행
 */
export function runJsonToSqliteMigration(): void {
  runMigrationV3()
  runMigrationV4()
}

/**
 * 마이그레이션 후 JSON 파일 정리 (선택적)
 * - 마이그레이션 완료 후 호출하여 불필요한 JSON 파일 삭제
 * - 기존 파일은 json_backup 폴더로 이동
 */
export function cleanupMigratedJsonFiles(): void {
  if (!isMigrationCompleted()) {
    console.log('[Migration] Migration not completed, skipping cleanup')
    return
  }

  const userDataPath = app.getPath('userData')
  const backupPath = path.join(userDataPath, 'json_backup')

  // 백업 디렉토리 생성
  fs.mkdirSync(backupPath, { recursive: true })

  // SQLite로 마이그레이션된 파일들
  const filesToBackup = [
    // V3 마이그레이션 데이터
    ...findAccountFiles('contacts').map((f) => f.filePath),
    ...findAccountFiles('mail-filters').map((f) => f.filePath),
    ...findAccountFiles('signature-settings').map((f) => f.filePath),
    ...findAccountFiles('spam-settings').map((f) => f.filePath),
    ...findAccountFiles('vip-senders').map((f) => f.filePath),
    path.join(userDataPath, 'tags.json'),
    path.join(userDataPath, 'virtual-folders.json'),
    // V4 마이그레이션 데이터
    path.join(userDataPath, 'email-templates.json'),
    ...findAccountFiles('offline').map((f) => f.filePath),
    // 통합된 설정 파일들 (config.json, credentials.json으로 통합됨)
    path.join(userDataPath, 'global-app-settings.json'),
    ...findAccountFiles('app-settings').map((f) => f.filePath),
    ...findAccountFiles('ai-settings').map((f) => f.filePath),
    path.join(userDataPath, 'oauth-credentials.json'),
    path.join(userDataPath, 'cloud-storage.json')
  ]

  let backupCount = 0
  for (const filePath of filesToBackup) {
    if (fs.existsSync(filePath)) {
      const fileName = path.basename(filePath)
      const backupFilePath = path.join(backupPath, fileName)

      try {
        fs.renameSync(filePath, backupFilePath)
        console.log(`[Migration] Backed up ${fileName}`)
        backupCount++
      } catch (err) {
        console.error(`[Migration] Failed to backup ${fileName}:`, err)
      }
    }
  }

  console.log(`[Migration] Cleanup completed. ${backupCount} old JSON files moved to json_backup/`)
}

/**
 * 백업된 파일 영구 삭제
 * - cleanupMigratedJsonFiles 호출 후 앱이 정상 동작하면 호출
 */
export function deleteBackupFiles(): void {
  const userDataPath = app.getPath('userData')
  const backupPath = path.join(userDataPath, 'json_backup')

  if (fs.existsSync(backupPath)) {
    try {
      fs.rmSync(backupPath, { recursive: true, force: true })
      console.log('[Migration] Backup files permanently deleted')
    } catch (err) {
      console.error('[Migration] Failed to delete backup files:', err)
    }
  }
}
