import { ImapFlow } from 'imapflow'
import type { MailboxLockObject, ListResponse } from 'imapflow'
import * as nodemailer from 'nodemailer'
import Store from 'electron-store'
import { safeStorage } from 'electron'
import { simpleParser } from 'mailparser'
import { logger, LogCategory } from './logger'

// SQLite 저장소 모듈 import
import { getStorageDatabase } from './storage/database'
import type { StorageStats } from './storage/database'
import { getFolderRepository } from './storage/folder-repository'
import type { FolderRecord } from './storage/folder-repository'
import { getEmailRepository } from './storage/email-repository'
import type { EmailRecord, EmailInput } from './storage/email-repository'
import { getSearchService } from './storage/search-service'
import type { SearchOptions } from './storage/search-service'
import { getBodyStorage } from './storage/body-storage'
import { v4 as uuidv4 } from 'uuid'

// 인코딩 유틸리티 모듈 import
import {
  convertImapListToFolders,
  type MailFolder as EncodingMailFolder,
} from './utils/encoding'

// 로컬에서 사용하는 모듈 함수 import
import { getSpamSettings, isEmailBlocked } from './filters'

// =====================================================
// 분리된 모듈 re-export (기존 import 호환성 유지)
// =====================================================

// Account 모듈 - 타입만 re-export
export type { AccountConfig, StoredAccount, ServerConfig } from './account'

// Settings 모듈
export {
  getAppSettings,
  updateAppSettings,
  resetAppSettings,
  getGlobalSettings,
  updateGlobalSettings,
  resetGlobalSettings,
  setPin,
  verifyPin,
  disablePin,
  isPinEnabled,
  clearAllData
} from './settings'
export type { AppSettings, GlobalAppSettings } from './settings'

// Filters 모듈
export {
  getMailFilters,
  findDuplicateFilter,
  addMailFilter,
  updateMailFilter,
  deleteMailFilter,
  toggleMailFilter,
  getFiltersUsingFolder,
  updateFiltersTargetFolder,
  deleteFiltersUsingFolder,
  getSignatureSettings,
  updateSignatureSettings,
  resetSignatureSettings,
  getDefaultSignature,
  getSpamSettings,
  updateSpamSettings,
  resetSpamSettings,
  isEmailBlocked
} from './filters'
export type {
  MailFilter,
  FilterCondition,
  FilterConditionField,
  FilterConditionOperator,
  FilterAction,
  Signature,
  SignatureSettings,
  SpamSettings,
  BlockedSender,
  BlockedDomain
} from './filters'

// Contacts 모듈
export {
  getContacts,
  addContact,
  updateContact,
  deleteContact,
  deleteContacts,
  toggleContactStar,
  moveContactsToGroup,
  getContactGroups,
  addContactGroup,
  updateContactGroup,
  deleteContactGroup,
  getContactCountByGroup,
  searchContactsByEmail,
  parseContactsFile,
  validateImportedContacts,
  importContacts,
  exportContacts,
  createContactImportTemplate,
  getVipSenders,
  addVipSender,
  removeVipSender,
  isVipSender,
  toggleVipSender
} from './contacts'
export type {
  Contact,
  ContactGroup,
  ImportedContact,
  ImportValidationResult,
  ImportResult,
  VipSender
} from './contacts'

// Mail 모듈 (types만 re-export, connection pool은 로컬 구현 사용)
export type {
  EmailAddress,
  AttachmentInfo
} from './mail'

// =====================================================

// electron-store는 ESM default export를 사용
const ElectronStore = (Store as unknown as { default: typeof Store }).default || Store

interface AccountConfig {
  email: string
  password: string
  name: string
  protocol: 'imap'
  incoming: {
    host: string
    port: number
    secure: boolean
  }
  outgoing: {
    host: string
    port: number
    secure: boolean
  }
}

interface StoredAccount {
  email: string
  encryptedPassword: string
  name: string
  protocol: 'imap'
  incoming: {
    host: string
    port: number
    secure: boolean
  }
  outgoing: {
    host: string
    port: number
    secure: boolean
  }
  isDefault?: boolean
}

const store = new ElectronStore<{ accounts: StoredAccount[] }>({
  name: 'accounts', // accounts.json 사용 (account-store.ts와 동일)
  defaults: {
    accounts: []
  }
})

// =====================================================
// SQLite 저장소 통합 헬퍼 함수들
// =====================================================

// SQLite 스토리지 활성화 여부 (앱 설정에서 제어)
let sqliteStorageEnabled = true

// 계정을 SQLite에 등록 또는 업데이트
async function ensureAccountInStorage(email: string, name: string): Promise<string> {
  const db = getStorageDatabase().getDatabase()

  // 기존 계정 확인
  const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email) as { id: string } | undefined

  if (existing) {
    // 이름 업데이트
    db.prepare('UPDATE accounts SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), existing.id)
    return existing.id
  }

  // 새 계정 생성
  const id = uuidv4()
  const now = Date.now()
  db.prepare('INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, email, name, now, now)

  return id
}

// 폴더를 SQLite에 등록 또는 업데이트
function ensureFolderInStorage(accountId: string, folderPath: string, folderName: string, uidValidity?: number): FolderRecord {
  const folderRepo = getFolderRepository()

  // 폴더의 특수 용도 감지
  let specialUse: string | undefined
  const pathLower = folderPath.toLowerCase()
  if (pathLower === 'inbox') {
    specialUse = 'inbox'
  } else if (pathLower.includes('sent') || pathLower.includes('보낸')) {
    specialUse = 'sent'
  } else if (pathLower.includes('draft') || pathLower.includes('임시')) {
    specialUse = 'drafts'
  } else if (pathLower.includes('trash') || pathLower.includes('휴지통') || pathLower.includes('deleted')) {
    specialUse = 'trash'
  } else if (pathLower.includes('spam') || pathLower.includes('junk') || pathLower.includes('스팸')) {
    specialUse = 'spam'
  }

  const folder = folderRepo.getOrCreate({
    accountId,
    name: folderName,
    path: folderPath,
    specialUse,
    uidValidity
  })

  // UIDVALIDITY 변경 확인 및 업데이트
  if (uidValidity && folder.uid_validity !== uidValidity) {
    folderRepo.updateUidValidity(folder.id, uidValidity)
  }

  return folder
}

// 이메일 헤더를 SQLite에 저장
export function saveEmailHeaderToStorage(folderId: string, header: EmailHeaderCache): EmailRecord | null {
  if (!sqliteStorageEnabled) return null

  const emailRepo = getEmailRepository()

  try {
    const input: EmailInput = {
      folderId,
      uid: header.uid,
      messageId: header.messageId,
      subject: header.subject,
      fromName: header.from[0]?.name,
      fromAddress: header.from[0]?.address,
      toAddresses: header.to.map(t => t.address),
      date: new Date(header.date).getTime(),
      flags: header.flags,
      hasAttachment: header.hasAttachment
    }

    return emailRepo.upsert(input)
  } catch (error) {
    console.error('[SQLite] Failed to save email header:', error)
    return null
  }
}

// 이메일 헤더 배치 저장
function batchSaveEmailHeadersToStorage(folderId: string, headers: EmailHeaderCache[]): void {
  if (!sqliteStorageEnabled || headers.length === 0) return

  const emailRepo = getEmailRepository()

  const inputs: EmailInput[] = headers.map(header => ({
    folderId,
    uid: header.uid,
    messageId: header.messageId,
    subject: header.subject,
    fromName: header.from[0]?.name,
    fromAddress: header.from[0]?.address,
    toAddresses: header.to.map(t => t.address),
    date: new Date(header.date).getTime(),
    flags: header.flags,
    hasAttachment: header.hasAttachment
  }))

  try {
    emailRepo.batchCreate(inputs)
    console.log(`[SQLite] Batch saved ${inputs.length} email headers`)
  } catch (error) {
    console.error('[SQLite] Failed to batch save headers:', error)
  }
}

// SQLite에서 이메일 헤더 조회
export function getEmailHeadersFromStorage(
  accountEmail: string,
  folderPath: string,
  options: { start?: number; limit?: number } = {}
): { emails: EmailHeader[]; total: number } | null {
  if (!sqliteStorageEnabled) return null

  const db = getStorageDatabase().getDatabase()
  const { start = 1, limit = 50 } = options
  const offset = Math.max(0, start - 1)

  try {
    // 계정 및 폴더 찾기
    const account = db.prepare('SELECT id FROM accounts WHERE email = ?').get(accountEmail) as { id: string } | undefined
    if (!account) return null

    const folder = db.prepare('SELECT id FROM folders WHERE account_id = ? AND path = ?').get(account.id, folderPath) as { id: string } | undefined
    if (!folder) return null

    // 이메일 개수
    const countResult = db.prepare('SELECT COUNT(*) as count FROM emails WHERE folder_id = ?').get(folder.id) as { count: number }
    const total = countResult.count

    // 이메일 조회
    const emails = db.prepare(`
      SELECT * FROM emails
      WHERE folder_id = ?
      ORDER BY date DESC
      LIMIT ? OFFSET ?
    `).all(folder.id, limit, offset) as EmailRecord[]

    // EmailRecord를 EmailHeader로 변환
    const headers: EmailHeader[] = emails.map(record => ({
      uid: record.uid,
      messageId: record.message_id || '',
      subject: record.subject || '(제목 없음)',
      from: record.from_address ? [{
        name: record.from_name || '',
        address: record.from_address
      }] : [],
      to: record.to_addresses ? JSON.parse(record.to_addresses).map((addr: string) => ({
        name: '',
        address: addr
      })) : [],
      date: record.date ? new Date(record.date) : new Date(),
      flags: record.flags ? JSON.parse(record.flags) : [],
      hasAttachment: record.has_attachment === 1
    }))

    return { emails: headers, total }
  } catch (error) {
    console.error('[SQLite] Failed to get email headers:', error)
    return null
  }
}

// SQLite에서 로컬 검색 수행
export async function searchEmailsLocal(
  accountEmail: string,
  query: string,
  options?: { folderPath?: string; start?: number; limit?: number }
): Promise<{ success: boolean; emails?: EmailHeader[]; total?: number; error?: string }> {
  if (!sqliteStorageEnabled) {
    return { success: false, error: 'SQLite storage is disabled' }
  }

  try {
    const searchService = getSearchService()
    const searchOptions: SearchOptions = {
      query,
      accountEmails: [accountEmail],
      limit: options?.limit || 50,
      offset: options?.start ? options.start - 1 : 0
    }

    if (options?.folderPath) {
      searchOptions.folderPaths = [options.folderPath]
    }

    const results = searchService.searchLocal(searchOptions)
    const total = searchService.getSearchCount(searchOptions)

    // SearchResult를 EmailHeader로 변환
    const emails: EmailHeader[] = results.map(result => ({
      uid: result.uid,
      messageId: result.emailId,
      subject: result.subject || '(제목 없음)',
      from: result.fromAddress ? [{
        name: result.fromName || '',
        address: result.fromAddress
      }] : [],
      to: result.toAddresses ? JSON.parse(result.toAddresses).map((addr: string) => ({
        name: '',
        address: addr
      })) : [],
      date: result.date ? new Date(result.date) : new Date(),
      flags: result.flags ? JSON.parse(result.flags) : [],
      hasAttachment: result.hasAttachment
    }))

    return { success: true, emails, total }
  } catch (error) {
    console.error('[SQLite] Local search error:', error)
    return { success: false, error: 'Local search failed' }
  }
}

// SQLite 상세 검색 (기존 DetailedSearchParams 형식 지원)
export async function searchEmailsDetailedLocal(
  accountEmail: string,
  params: DetailedSearchParams,
  options?: { start?: number; limit?: number }
): Promise<{ success: boolean; emails?: EmailHeader[]; total?: number; error?: string; source?: 'sqlite' | 'imap' }> {
  if (!sqliteStorageEnabled) {
    return { success: false, error: 'SQLite storage is disabled' }
  }

  try {
    const searchService = getSearchService()

    // 상세 검색용 쿼리 빌드 (기존 DetailedSearchParams 형식에 맞춤)
    const queryParts: string[] = []
    if (params.sender) queryParts.push(`from:${params.sender}`)
    if (params.recipient) queryParts.push(`to:${params.recipient}`)
    if (params.content && params.contentType === 'subject') {
      queryParts.push(`subject:${params.content}`)
    } else if (params.content && params.contentType === 'body') {
      queryParts.push(`body:${params.content}`)
    } else if (params.content) {
      queryParts.push(params.content)
    }

    const searchOptions: SearchOptions = {
      query: queryParts.join(' ') || '*',
      accountEmails: [accountEmail],
      limit: options?.limit || 50,
      offset: options?.start ? options.start - 1 : 0,
      hasAttachment: params.hasAttachment || undefined,
      dateFrom: params.startDate ? new Date(params.startDate).getTime() : undefined,
      dateTo: params.endDate ? new Date(params.endDate).getTime() : undefined
    }

    if (params.mailbox && params.mailbox !== 'all') {
      searchOptions.folderPaths = [params.mailbox]
    }

    // FTS 검색 또는 필터 검색 사용
    let results
    let total

    if (queryParts.length > 0) {
      results = searchService.searchLocal(searchOptions)
      total = searchService.getSearchCount(searchOptions)
    } else {
      // 쿼리 없이 필터만 있는 경우
      results = searchService.searchWithFilters(searchOptions)
      total = results.length
    }

    // SearchResult를 EmailHeader로 변환
    const emails: EmailHeader[] = results.map(result => ({
      uid: result.uid,
      messageId: result.emailId,
      subject: result.subject || '(제목 없음)',
      from: result.fromAddress ? [{
        name: result.fromName || '',
        address: result.fromAddress
      }] : [],
      to: result.toAddresses ? parseToAddresses(result.toAddresses) : [],
      date: result.date ? new Date(result.date) : new Date(),
      flags: result.flags ? JSON.parse(result.flags) : [],
      hasAttachment: result.hasAttachment,
      folder: result.folderPath
    }))

    return { success: true, emails, total, source: 'sqlite' }
  } catch (error) {
    console.error('[SQLite] Detailed local search error:', error)
    return { success: false, error: 'Detailed local search failed' }
  }
}

// SQLite 필터 검색 (안읽음, 중요, 첨부파일)
export async function searchEmailsByFilterLocal(
  accountEmail: string,
  filterType: EmailFilterType,
  options?: { start?: number; limit?: number }
): Promise<{ success: boolean; emails?: EmailHeader[]; total?: number; error?: string; source?: 'sqlite' | 'imap' }> {
  console.log(`[searchEmailsByFilterLocal] Called with account=${accountEmail}, filterType=${filterType}, options=`, options)

  if (!sqliteStorageEnabled) {
    console.log('[searchEmailsByFilterLocal] SQLite storage is disabled')
    return { success: false, error: 'SQLite storage is disabled' }
  }

  try {
    const searchService = getSearchService()

    const searchOptions: Omit<SearchOptions, 'query'> & { query?: string } = {
      accountEmails: [accountEmail],
      limit: options?.limit || 50,
      offset: options?.start ? options.start - 1 : 0
    }

    // 필터 타입에 따른 조건 설정
    switch (filterType) {
      case 'unread':
        searchOptions.isUnread = true
        break
      case 'starred':
        searchOptions.isFlagged = true
        break
      case 'attachment':
        searchOptions.hasAttachment = true
        break
    }

    console.log('[searchEmailsByFilterLocal] Calling searchWithFilters with:', searchOptions)
    const results = searchService.searchWithFilters(searchOptions)
    console.log(`[searchEmailsByFilterLocal] SQLite returned ${results.length} results`)
    const total = results.length

    // SearchResult를 EmailHeader로 변환
    const emails: EmailHeader[] = results.map(result => ({
      uid: result.uid,
      messageId: result.emailId,
      subject: result.subject || '(제목 없음)',
      from: result.fromAddress ? [{
        name: result.fromName || '',
        address: result.fromAddress
      }] : [],
      to: result.toAddresses ? parseToAddresses(result.toAddresses) : [],
      date: result.date ? new Date(result.date) : new Date(),
      flags: result.flags ? JSON.parse(result.flags) : [],
      hasAttachment: result.hasAttachment,
      folder: result.folderPath
    }))

    return { success: true, emails, total, source: 'sqlite' }
  } catch (error) {
    console.error('[SQLite] Filter local search error:', error)
    return { success: false, error: 'Filter local search failed' }
  }
}

// SQLite 저장소에 데이터가 있는지 확인
export function hasLocalStorageData(accountEmail: string): boolean {
  if (!sqliteStorageEnabled) return false

  try {
    const stats = getStorageDatabase().getStorageStats(accountEmail)
    return stats.totalEmails > 0
  } catch {
    return false
  }
}

// to_addresses JSON 파싱 헬퍼
function parseToAddresses(toAddresses: string): { name: string; address: string }[] {
  try {
    const parsed = JSON.parse(toAddresses)
    if (Array.isArray(parsed)) {
      return parsed.map((addr: string | { name?: string; address: string }) => {
        if (typeof addr === 'string') {
          return { name: '', address: addr }
        }
        return { name: addr.name || '', address: addr.address }
      })
    }
    return []
  } catch {
    return []
  }
}

// 스토리지 통계 조회
export function getStorageStats(accountEmail?: string): StorageStats {
  return getStorageDatabase().getStorageStats(accountEmail)
}

// 스토리지 캐시 초기화
export function clearStorageCache(accountEmail?: string): void {
  const storage = getStorageDatabase()
  if (accountEmail) {
    storage.clearAccountData(accountEmail)
  } else {
    storage.clearAllData()
  }
}

// SQLite 스토리지 활성화/비활성화
export function setSqliteStorageEnabled(enabled: boolean): void {
  sqliteStorageEnabled = enabled
  console.log(`[SQLite] Storage ${enabled ? 'enabled' : 'disabled'}`)
}

// SQLite 스토리지 초기화 (앱 시작 시 호출)
export function initializeSqliteStorage(): void {
  try {
    // 데이터베이스 연결 (싱글톤 초기화)
    getStorageDatabase()
    console.log('[SQLite] Storage initialized successfully')
  } catch (error) {
    console.error('[SQLite] Failed to initialize storage:', error)
    sqliteStorageEnabled = false
  }
}

// =====================================================
// 로컬 캐시 시스템 (UID 조정 기반 동기화)
// =====================================================

// 메일 헤더 캐시 인터페이스
interface EmailHeaderCache {
  uid: number
  messageId: string
  subject: string
  from: { name: string; address: string }[]
  to: { name: string; address: string }[]
  date: string // Date를 ISO string으로 저장
  flags: string[]
  hasAttachment: boolean
}

// 폴더 캐시 인터페이스
interface FolderCache {
  uidValidity: number // UIDVALIDITY가 변경되면 캐시 전체 무효화
  headers: EmailHeaderCache[]
  lastSync: number // 마지막 동기화 타임스탬프
  lastAccess: number // LRU를 위한 마지막 접근 타임스탬프
}

// LRU 캐시 설정
const LRU_MAX_FOLDERS_PER_ACCOUNT = 30 // 계정당 최대 캐시 폴더 수
const LRU_MAX_HEADERS_PER_FOLDER = 500 // 폴더당 최대 캐시 헤더 수

// =====================================================
// 검색 결과 캐시 (메모리 전용, 휘발성)
// =====================================================

interface SearchCacheEntry {
  results: number[] // UID 목록
  timestamp: number
  total: number
}

interface SearchCache {
  [key: string]: SearchCacheEntry // key = email:folder:query
}

const searchCache: SearchCache = {}
const SEARCH_CACHE_TTL = 2 * 60 * 1000 // 검색 캐시 유효 시간: 2분
const SEARCH_CACHE_MAX_ENTRIES = 50 // 최대 캐시 항목 수

// 검색 캐시 키 생성
function getSearchCacheKey(email: string, folderPath: string, query: string): string {
  return `${email}:${folderPath}:${query.toLowerCase()}`
}

// 검색 결과 캐시 조회
function getSearchCache(email: string, folderPath: string, query: string): SearchCacheEntry | null {
  const key = getSearchCacheKey(email, folderPath, query)
  const entry = searchCache[key]

  if (!entry) return null

  // TTL 확인
  if (Date.now() - entry.timestamp > SEARCH_CACHE_TTL) {
    delete searchCache[key]
    return null
  }

  console.log(`[SearchCache] Hit for "${query}" in ${folderPath}`)
  return entry
}

// 검색 결과 캐시 저장
function setSearchCache(email: string, folderPath: string, query: string, results: number[], total: number): void {
  const key = getSearchCacheKey(email, folderPath, query)

  // 캐시 크기 제한 적용 (LRU 방식)
  const keys = Object.keys(searchCache)
  if (keys.length >= SEARCH_CACHE_MAX_ENTRIES) {
    // 가장 오래된 항목 제거
    let oldestKey = keys[0]
    let oldestTime = searchCache[oldestKey].timestamp

    for (const k of keys) {
      if (searchCache[k].timestamp < oldestTime) {
        oldestTime = searchCache[k].timestamp
        oldestKey = k
      }
    }
    delete searchCache[oldestKey]
    console.log(`[SearchCache] Evicted oldest entry: ${oldestKey}`)
  }

  searchCache[key] = {
    results,
    timestamp: Date.now(),
    total
  }
  console.log(`[SearchCache] Cached ${results.length} UIDs for "${query}" in ${folderPath}`)
}

// 특정 폴더의 검색 캐시 무효화 (이메일 변경 시 호출)
export function invalidateSearchCache(email: string, folderPath?: string): void {
  const prefix = folderPath ? `${email}:${folderPath}:` : `${email}:`
  let count = 0

  for (const key of Object.keys(searchCache)) {
    if (key.startsWith(prefix)) {
      delete searchCache[key]
      count++
    }
  }

  if (count > 0) {
    console.log(`[SearchCache] Invalidated ${count} entries for ${folderPath || email}`)
  }
}

// 전체 캐시 데이터 구조
interface CacheData {
  [email: string]: {
    [folderPath: string]: FolderCache
  }
}

// 메모리 캐시 (빠른 접근용)
const memoryCache: CacheData = {}

// 캐시 버전 - 첨부파일 감지 로직 개선 시 버전 증가하여 캐시 무효화
// v3: 첨부파일 감지 로직 개선 (대소문자 무시, inline+filename, application/image/audio/video 타입)
const CACHE_VERSION = 3

// 영구 캐시 저장소
const cacheStore = new ElectronStore<{ emailCache: CacheData; cacheVersion?: number }>({
  name: 'email-cache',
  defaults: {
    emailCache: {},
    cacheVersion: CACHE_VERSION
  }
})

// 캐시 초기화 (앱 시작 시 파일에서 메모리로 로드)
function initCache(): void {
  const savedVersion = cacheStore.get('cacheVersion', 1)

  // 캐시 버전이 다르면 캐시 전체 무효화
  if (savedVersion !== CACHE_VERSION) {
    console.log(`[Cache] Version mismatch (saved: ${savedVersion}, current: ${CACHE_VERSION}). Clearing cache...`)
    cacheStore.set('emailCache', {})
    cacheStore.set('cacheVersion', CACHE_VERSION)
    console.log('[Cache] Cache cleared due to version upgrade')
    return
  }

  const savedCache = cacheStore.get('emailCache', {})
  Object.assign(memoryCache, savedCache)
  console.log('[Cache] Initialized from disk (version:', CACHE_VERSION, ')')
}

// 캐시 저장 (메모리 -> 파일, 디바운스 처리)
let saveTimeout: NodeJS.Timeout | null = null
function saveCache(): void {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    cacheStore.set('emailCache', memoryCache)
    console.log('[Cache] Saved to disk')
  }, 500) // 500ms 디바운스
}

// 폴더 캐시 가져오기 (LRU 접근 시간 업데이트)
function getFolderCache(email: string, folderPath: string): FolderCache | null {
  const cache = memoryCache[email]?.[folderPath]
  if (cache) {
    cache.lastAccess = Date.now()
  }
  return cache || null
}

// LRU 정책에 따라 가장 오래된 폴더 캐시 제거
function evictLRUFolders(email: string): void {
  const accountCache = memoryCache[email]
  if (!accountCache) return

  const folders = Object.keys(accountCache)
  if (folders.length <= LRU_MAX_FOLDERS_PER_ACCOUNT) return

  // lastAccess 기준으로 정렬 (오래된 것부터)
  const sortedFolders = folders
    .map(path => ({ path, lastAccess: accountCache[path].lastAccess || 0 }))
    .sort((a, b) => a.lastAccess - b.lastAccess)

  // 초과하는 폴더 제거
  const toRemove = sortedFolders.slice(0, folders.length - LRU_MAX_FOLDERS_PER_ACCOUNT)
  for (const { path } of toRemove) {
    console.log(`[Cache LRU] Evicting folder ${path} for ${email}`)
    delete accountCache[path]
  }
}

// 폴더 캐시 설정 (LRU 크기 제한 적용)
function setFolderCache(email: string, folderPath: string, cache: FolderCache): void {
  if (!memoryCache[email]) {
    memoryCache[email] = {}
  }

  // lastAccess 설정 (없으면)
  if (!cache.lastAccess) {
    cache.lastAccess = Date.now()
  }

  // 헤더 수 제한 (최신 헤더 유지)
  if (cache.headers.length > LRU_MAX_HEADERS_PER_FOLDER) {
    // 날짜순으로 정렬하여 최신 헤더만 유지
    cache.headers.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    cache.headers = cache.headers.slice(0, LRU_MAX_HEADERS_PER_FOLDER)
    console.log(`[Cache LRU] Trimmed headers for ${folderPath} to ${LRU_MAX_HEADERS_PER_FOLDER}`)
  }

  memoryCache[email][folderPath] = cache

  // LRU 폴더 제한 적용
  evictLRUFolders(email)

  saveCache()
}

// 캐시에서 UID 목록 가져오기
function getCachedUids(email: string, folderPath: string): number[] {
  const cache = getFolderCache(email, folderPath)
  if (!cache) return []
  return cache.headers.map((h) => h.uid)
}

// UID 조정: 서버에 없는 메일을 캐시에서 삭제
function reconcileCache(email: string, folderPath: string, serverUids: Set<number>): number {
  const cache = getFolderCache(email, folderPath)
  if (!cache) return 0

  const originalCount = cache.headers.length
  cache.headers = cache.headers.filter((h) => serverUids.has(h.uid))
  const deletedCount = originalCount - cache.headers.length

  if (deletedCount > 0) {
    setFolderCache(email, folderPath, cache)
    console.log(`[Cache] Reconciled ${folderPath}: removed ${deletedCount} stale entries`)
  }

  return deletedCount
}

// 캐시에 헤더 추가/업데이트 (기존 UID는 업데이트, 새 UID는 추가)
function upsertHeadersToCache(
  email: string,
  folderPath: string,
  headers: EmailHeaderCache[],
  uidValidity: number
): void {
  let cache = getFolderCache(email, folderPath)

  // UIDVALIDITY가 변경되었거나 캐시가 없으면 새로 생성
  if (!cache || cache.uidValidity !== uidValidity) {
    cache = {
      uidValidity,
      headers: [],
      lastSync: Date.now(),
      lastAccess: Date.now()
    }
  }

  // UID 기준으로 기존 헤더 맵 생성
  const headerMap = new Map<number, EmailHeaderCache>()
  for (const h of cache.headers) {
    headerMap.set(h.uid, h)
  }

  // 새 헤더 추가/업데이트
  for (const h of headers) {
    headerMap.set(h.uid, h)
  }

  cache.headers = Array.from(headerMap.values())
  cache.lastSync = Date.now()
  setFolderCache(email, folderPath, cache)

  // SQLite 저장소에도 저장
  if (sqliteStorageEnabled && headers.length > 0) {
    try {
      // 계정 조회 (StoredAccount에서 이름 가져오기)
      const storedAccounts = store.get('accounts', [])
      const accountsArray = Array.isArray(storedAccounts) ? storedAccounts : []
      const storedAccount = accountsArray.find(a => a.email === email)
      const accountName = storedAccount?.name || email

      // 계정 및 폴더 확보
      ensureAccountInStorage(email, accountName).then(accountId => {
        const folderName = folderPath.split('/').pop() || folderPath
        const folder = ensureFolderInStorage(accountId, folderPath, folderName, uidValidity)
        batchSaveEmailHeadersToStorage(folder.id, headers)
      }).catch(err => {
        console.error('[SQLite] Failed to save headers to storage:', err)
      })
    } catch (err) {
      console.error('[SQLite] Error in upsertHeadersToCache:', err)
    }
  }
}

// 캐시에서 페이지네이션된 헤더 가져오기 (최신순)
function getHeadersFromCache(
  email: string,
  folderPath: string,
  start: number,
  limit: number
): EmailHeaderCache[] | null {
  const cache = getFolderCache(email, folderPath)
  if (!cache || cache.headers.length === 0) return null

  // UID 기준 내림차순 정렬 (최신 메일이 먼저)
  const sorted = [...cache.headers].sort((a, b) => b.uid - a.uid)
  return sorted.slice(start - 1, start - 1 + limit)
}

// 캐시에서 특정 UID 제거
function removeFromCache(email: string, folderPath: string, uid: number): void {
  const cache = getFolderCache(email, folderPath)
  if (cache) {
    cache.headers = cache.headers.filter((h) => h.uid !== uid)
    setFolderCache(email, folderPath, cache)
  }
}

// 캐시에서 다중 UID 제거 (벌크 작업용)
function removeMultipleFromCache(email: string, folderPath: string, uids: number[]): void {
  const cache = getFolderCache(email, folderPath)
  if (cache) {
    const uidSet = new Set(uids)
    cache.headers = cache.headers.filter((h) => !uidSet.has(h.uid))
    setFolderCache(email, folderPath, cache)
  }
}

// 폴더 캐시 삭제
function invalidateFolderCache(email: string, folderPath: string): void {
  if (memoryCache[email]) {
    delete memoryCache[email][folderPath]
    saveCache()
    console.log(`[Cache] Invalidated folder cache: ${email}/${folderPath}`)
  }
}

// 다중 UID 플래그 업데이트 (성능 최적화)
function updateFlagsForMultipleUids(
  email: string,
  folderPath: string,
  updates: { uid: number; flags: string[] }[]
): void {
  const cache = getFolderCache(email, folderPath)
  if (!cache) return

  const updateMap = new Map(updates.map((u) => [u.uid, u.flags]))
  let changed = false

  for (const header of cache.headers) {
    if (updateMap.has(header.uid)) {
      header.flags = updateMap.get(header.uid)!
      changed = true
    }
  }

  if (changed) {
    setFolderCache(email, folderPath, cache)
    console.log(`[Cache] Updated flags for ${updates.length} emails`)
  }
}

// 계정 캐시 전체 삭제
export function clearAccountCache(email: string): void {
  if (memoryCache[email]) {
    delete memoryCache[email]
    saveCache()
    console.log(`[Cache] Cleared all cache for account: ${email}`)
  }
}

// 전체 캐시 삭제
export function clearAllCache(): void {
  Object.keys(memoryCache).forEach((key) => delete memoryCache[key])
  saveCache()
  console.log('[Cache] Cleared all cache')
}

// 앱 시작 시 캐시 초기화
initCache()

export async function testMailConnection(config: {
  type: 'imap' | 'smtp'
  host: string
  port: number
  secure: boolean
  user: string
  password: string
}): Promise<{ success: boolean; error?: string }> {
  if (config.type === 'imap') {
    const imapConfig = {
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password
      },
      tls: {
        rejectUnauthorized: false
      },
      logger: false as const,
      emitLogs: false
    }

    const client = new ImapFlow(imapConfig)

    try {
      await client.connect()
      await client.logout()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Connection failed' }
    }
  } else if (config.type === 'smtp') {
    // 포트에 따라 secure 설정 자동 결정
    // 465: 암묵적 SSL/TLS (secure: true)
    // 587, 25: STARTTLS 사용 (secure: false)
    const useSecure = config.port === 465

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: useSecure,
      auth: {
        user: config.user,
        pass: config.password
      },
      connectionTimeout: 10000,
      tls: {
        rejectUnauthorized: false
      },
      // 포트 587에서는 STARTTLS 필요
      requireTLS: config.port === 587
    })

    return new Promise((resolve) => {
      transporter.verify((err) => {
        if (err) {
          resolve({ success: false, error: err.message })
        } else {
          resolve({ success: true })
        }
        transporter.close()
      })
    })
  } else {
    return { success: false, error: 'Unknown protocol' }
  }
}

export function saveAccount(config: AccountConfig): { success: boolean; error?: string } {
  try {
    // 비밀번호 암호화
    let encryptedPassword: string
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(config.password)
      encryptedPassword = encrypted.toString('base64')
    } else {
      // 암호화 불가능한 경우 base64로만 인코딩 (보안 취약)
      encryptedPassword = Buffer.from(config.password).toString('base64')
    }

    const storedAccount: StoredAccount = {
      email: config.email,
      encryptedPassword,
      name: config.name,
      protocol: config.protocol,
      incoming: config.incoming,
      outgoing: config.outgoing
    }

    const storedAccounts = store.get('accounts', [])
    // 방어 코드: 배열이 아닌 경우 빈 배열로 처리
    const accounts = Array.isArray(storedAccounts) ? storedAccounts : []
    // 이미 존재하는 계정이면 업데이트
    const existingIndex = accounts.findIndex((a) => a.email === config.email)
    if (existingIndex >= 0) {
      accounts[existingIndex] = storedAccount
    } else {
      accounts.push(storedAccount)
    }
    store.set('accounts', accounts)

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save account' }
  }
}

export function getAccounts(): StoredAccount[] {
  const accounts = store.get('accounts', [])
  // 방어 코드: 배열이 아닌 경우 빈 배열 반환
  return Array.isArray(accounts) ? accounts : []
}

export function getAccountWithPassword(email: string): AccountConfig | null {
  const accounts = store.get('accounts', [])
  // 방어 코드: 배열이 아닌 경우 null 반환
  if (!Array.isArray(accounts)) return null
  const account = accounts.find((a) => a.email === email)

  if (!account) return null

  let password: string
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = Buffer.from(account.encryptedPassword, 'base64')
      password = safeStorage.decryptString(encrypted)
    } else {
      password = Buffer.from(account.encryptedPassword, 'base64').toString()
    }
  } catch {
    password = ''
  }

  return {
    ...account,
    password
  }
}

/**
 * 비동기 버전 - 비밀번호를 포함한 계정 정보 조회
 */
export async function getAccountWithPasswordAsync(email: string): Promise<AccountConfig | null> {
  return getAccountWithPassword(email)
}

export function deleteAccount(email: string): { success: boolean } {
  const storedAccounts = store.get('accounts', [])
  // 방어 코드: 배열이 아닌 경우 빈 배열로 처리
  const accounts = Array.isArray(storedAccounts) ? storedAccounts : []
  const filtered = accounts.filter((a) => a.email !== email)
  store.set('accounts', filtered)
  return { success: true }
}

export function setDefaultAccount(email: string): { success: boolean; error?: string } {
  try {
    const storedAccounts = store.get('accounts', [])
    // 방어 코드: 배열이 아닌 경우 빈 배열로 처리
    const accounts = Array.isArray(storedAccounts) ? storedAccounts : []
    const updated = accounts.map((a) => ({
      ...a,
      isDefault: a.email === email
    }))
    store.set('accounts', updated)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to set default account' }
  }
}

export function hasAccounts(): boolean {
  const accounts = store.get('accounts', [])
  // 방어 코드: 배열이 아닌 경우 false 반환
  return Array.isArray(accounts) && accounts.length > 0
}

// 이메일 관련 인터페이스
export interface EmailHeader {
  uid: number
  messageId: string
  subject: string
  from: { name: string; address: string }[]
  to: { name: string; address: string }[]
  date: Date
  flags: string[]
  hasAttachment: boolean
  folder?: string // 검색 결과에서 이메일이 속한 폴더
}

export interface EmailFull extends EmailHeader {
  cc?: { name: string; address: string }[]
  bcc?: { name: string; address: string }[]
  html?: string
  text?: string
  attachments: {
    filename: string
    contentType: string
    size: number
    contentId?: string
    partId?: string
    encoding?: string
  }[]
}

export interface MailFolder {
  name: string
  path: string
  delimiter: string
  flags: string[]
  specialUse?: string
  children?: MailFolder[]
  totalMessages?: number
  unseenMessages?: number
}

// =====================================================
// IMAP 연결 풀 시스템
// =====================================================

interface PooledConnection {
  client: ImapFlow
  inUse: boolean
  lastUsed: number
  account: string
  currentMailbox?: string
  mailboxLock?: MailboxLockObject
}

class ImapConnectionPool {
  private pools: Map<string, PooledConnection[]> = new Map()
  private maxConnectionsPerAccount = 3
  private idleTimeout = 5 * 60 * 1000 // 5분
  private cleanupInterval: NodeJS.Timeout | null = null
  private pendingAcquires: Map<string, Array<{
    resolve: (conn: PooledConnection) => void
    reject: (err: Error) => void
  }>> = new Map()
  // 생성 중인 연결 수를 추적 (경쟁 조건 방지)
  private pendingCreations: Map<string, number> = new Map()

  constructor() {
    // 주기적으로 유휴 연결 정리 (1분마다)
    this.cleanupInterval = setInterval(() => this.cleanupIdleConnections(), 60000)
  }

  // 연결 획득 (기존 유휴 연결 사용 또는 새 연결 생성)
  async acquire(account: AccountConfig): Promise<PooledConnection> {
    const key = account.email
    let pool = this.pools.get(key)

    if (!pool) {
      pool = []
      this.pools.set(key, pool)
    }

    // 1. 사용 가능한 유휴 연결 찾기
    const idleConn = pool.find(c => !c.inUse)
    if (idleConn) {
      // 연결이 유효한지 확인
      if (!this.isConnectionValid(idleConn)) {
        console.log(`[Pool] Removing invalid connection for ${key}`)
        this.remove(idleConn)
        // 재귀적으로 다시 연결 획득 시도
        return this.acquire(account)
      }
      idleConn.inUse = true
      idleConn.lastUsed = Date.now()
      console.log(`[Pool] Reusing connection for ${key} (${pool.filter(c => c.inUse).length}/${pool.length} in use)`)
      return idleConn
    }

    // 2. 풀에 여유가 있으면 새 연결 생성 (생성 중인 연결도 고려)
    const pendingCount = this.pendingCreations.get(key) || 0
    const totalConnections = pool.length + pendingCount

    if (totalConnections < this.maxConnectionsPerAccount) {
      // 생성 중인 연결 수 증가
      this.pendingCreations.set(key, pendingCount + 1)
      console.log(`[Pool] Creating new connection for ${key} (${totalConnections + 1}/${this.maxConnectionsPerAccount})`)

      try {
        const newConn = await this.createConnection(account)
        pool.push(newConn)
        return newConn
      } catch (err) {
        // 생성 실패 시 대기 중인 요청에 연결 할당 시도
        const pending = this.pendingAcquires.get(key)
        if (pending && pending.length > 0) {
          const waiter = pending.shift()!
          waiter.reject(err as Error)
        }
        throw err
      } finally {
        // 생성 중인 연결 수 감소
        const current = this.pendingCreations.get(key) || 1
        this.pendingCreations.set(key, Math.max(0, current - 1))
      }
    }

    // 3. 풀이 가득 찬 경우 대기
    console.log(`[Pool] Pool full for ${key} (${pool.length} + ${pendingCount} pending), waiting for available connection...`)
    return new Promise((resolve, reject) => {
      let pending = this.pendingAcquires.get(key)
      if (!pending) {
        pending = []
        this.pendingAcquires.set(key, pending)
      }

      // 30초 타임아웃
      const timeout = setTimeout(() => {
        const idx = pending!.findIndex(p => p.resolve === resolve)
        if (idx !== -1) {
          pending!.splice(idx, 1)
          reject(new Error('Connection pool acquire timeout'))
        }
      }, 30000)

      pending.push({
        resolve: (conn) => {
          clearTimeout(timeout)
          resolve(conn)
        },
        reject
      })
    })
  }

  // 연결 반환
  release(conn: PooledConnection): void {
    // mailbox lock 해제
    if (conn.mailboxLock) {
      try {
        conn.mailboxLock.release()
      } catch {
        // 무시
      }
      conn.mailboxLock = undefined
      conn.currentMailbox = undefined
    }

    conn.inUse = false
    conn.lastUsed = Date.now()

    // 대기 중인 요청이 있으면 즉시 할당
    const pending = this.pendingAcquires.get(conn.account)
    if (pending && pending.length > 0) {
      const waiter = pending.shift()!
      conn.inUse = true
      waiter.resolve(conn)
      console.log(`[Pool] Connection assigned to waiting request for ${conn.account}`)
    } else {
      console.log(`[Pool] Connection released for ${conn.account}`)
    }
  }

  // 연결 제거 (에러 발생 시)
  remove(conn: PooledConnection): void {
    const pool = this.pools.get(conn.account)
    if (pool) {
      const idx = pool.indexOf(conn)
      if (idx !== -1) {
        pool.splice(idx, 1)
        console.log(`[Pool] Connection removed for ${conn.account} (${pool.length} remaining)`)
      }
    }

    // mailbox lock 해제
    if (conn.mailboxLock) {
      try {
        conn.mailboxLock.release()
      } catch {
        // 무시
      }
      conn.mailboxLock = undefined
      conn.currentMailbox = undefined
    }

    try {
      conn.client.logout().catch(() => {})
    } catch {
      // 연결이 이미 종료된 경우 무시
    }
  }

  // 새 연결 생성
  private async createConnection(account: AccountConfig): Promise<PooledConnection> {
    const imapConfig = {
      host: account.incoming.host,
      port: account.incoming.port,
      secure: account.incoming.secure,
      auth: {
        user: account.email,
        pass: account.password
      },
      tls: {
        rejectUnauthorized: false
      },
      logger: false as const,
      emitLogs: false
    }

    console.log(`[Pool] Creating IMAP connection for ${account.email}`)
    const client = new ImapFlow(imapConfig)

    const pooledConn: PooledConnection = {
      client,
      inUse: true,
      lastUsed: Date.now(),
      account: account.email
    }

    // 연결이 끊어지면 풀에서 제거
    client.on('close', () => {
      console.log(`[Pool] Connection closed for ${account.email}`)
      this.remove(pooledConn)
    })

    // 런타임 에러 처리 (ECONNRESET 등)
    client.on('error', (err: Error) => {
      console.error(`[Pool] Connection error for ${account.email}:`, err.message)
      // 연결 오류 시 풀에서 제거
      this.remove(pooledConn)
    })

    // 연결 시도
    await client.connect()
    return pooledConn
  }

  // 연결이 유효한지 확인
  private isConnectionValid(conn: PooledConnection): boolean {
    try {
      // ImapFlow 연결 상태 확인
      return conn.client.usable === true
    } catch {
      return false
    }
  }

  // 유휴 연결 정리
  private cleanupIdleConnections(): void {
    const now = Date.now()

    for (const [key, pool] of this.pools) {
      const toRemove: PooledConnection[] = []

      for (const conn of pool) {
        // 사용 중이지 않고 유휴 시간 초과된 연결 제거
        if (!conn.inUse && (now - conn.lastUsed) > this.idleTimeout) {
          toRemove.push(conn)
        }
      }

      for (const conn of toRemove) {
        console.log(`[Pool] Removing idle connection for ${key}`)
        this.remove(conn)
      }
    }
  }

  // 특정 계정의 모든 연결 종료
  closeAll(email?: string): void {
    if (email) {
      const pool = this.pools.get(email)
      if (pool) {
        for (const conn of pool) {
          // mailbox lock 해제
          if (conn.mailboxLock) {
            try {
              conn.mailboxLock.release()
            } catch {
              // 무시
            }
          }
          try {
            conn.client.logout().catch(() => {})
          } catch {
            // 무시
          }
        }
        this.pools.delete(email)
        console.log(`[Pool] Closed all connections for ${email}`)
      }
    } else {
      for (const [key, pool] of this.pools) {
        for (const conn of pool) {
          // mailbox lock 해제
          if (conn.mailboxLock) {
            try {
              conn.mailboxLock.release()
            } catch {
              // 무시
            }
          }
          try {
            conn.client.logout().catch(() => {})
          } catch {
            // 무시
          }
        }
        console.log(`[Pool] Closed all connections for ${key}`)
      }
      this.pools.clear()
    }
  }

  // 정리
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.closeAll()
  }
}

// 전역 연결 풀 인스턴스
const connectionPool = new ImapConnectionPool()

// 연결 풀 정리 (앱 종료 시 호출)
export function cleanupConnectionPool(email?: string): void {
  connectionPool.closeAll(email)
}

// 연결 풀 완전 종료 (앱 종료 시 호출)
export function destroyConnectionPool(): void {
  connectionPool.destroy()
}

// IMAP 연결 생성 헬퍼 (기존 코드 호환용 - 연결 풀을 사용하지 않는 경우)
async function createImapConnection(account: AccountConfig): Promise<ImapFlow> {
  const config = {
    host: account.incoming.host,
    port: account.incoming.port,
    secure: account.incoming.secure,
    auth: {
      user: account.email,
      pass: account.password
    },
    tls: {
      rejectUnauthorized: false
    },
    logger: false as const,
    emitLogs: false
  }

  const client = new ImapFlow(config)
  await client.connect()
  return client
}

// ImapFlow 폴더 목록을 MailFolder 형식으로 변환하는 헬퍼 함수
// 인코딩 모듈의 convertImapListToFolders 사용
function convertListToFolders(list: ListResponse[]): MailFolder[] {
  const folders = convertImapListToFolders(list)
  // 타입 호환성: flags가 undefined일 경우 빈 배열로 변환
  const ensureFlags = (folder: EncodingMailFolder): MailFolder => ({
    ...folder,
    flags: folder.flags || [],
    children: folder.children?.map(ensureFlags)
  })
  return folders.map(ensureFlags)
}

// 폴더 목록 가져오기
export async function getFolders(
  email: string
): Promise<{ success: boolean; folders?: MailFolder[]; error?: string }> {
  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  let client: ImapFlow | null = null

  try {
    client = await createImapConnection(account)
    const list = await client.list()
    const folders = convertListToFolders(list)
    await client.logout()

    // SQLite에 폴더 저장 (Local-First 아키텍처)
    try {
      const accountId = await ensureAccountInStorage(email, account.name || email)
      console.log(`[getFolders] Syncing ${folders.length} folders to SQLite for account ${email}`)

      // 모든 폴더를 재귀적으로 SQLite에 저장
      const syncFoldersRecursively = (folderList: MailFolder[]): void => {
        for (const folder of folderList) {
          ensureFolderInStorage(accountId, folder.path, folder.name)
          if (folder.children && folder.children.length > 0) {
            syncFoldersRecursively(folder.children)
          }
        }
      }
      syncFoldersRecursively(folders)
      console.log(`[getFolders] Folders synced to SQLite successfully`)
    } catch (syncErr) {
      console.error('[getFolders] Failed to sync folders to SQLite:', syncErr)
      // SQLite 동기화 실패해도 IMAP 결과는 반환
    }

    return { success: true, folders }
  } catch (err) {
    if (client) {
      try {
        await client.logout()
      } catch {
        // 무시
      }
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// 폴더 정보 가져오기 (메시지 수 등) - 연결 풀 사용
export async function getFolderInfo(
  email: string,
  folderPath: string
): Promise<{ success: boolean; total?: number; unseen?: number; error?: string }> {
  // 컨테이너 폴더 체크 (선택 불가능한 폴더)
  const containerFolders = ['[Gmail]', '[Google Mail]']
  if (containerFolders.some((cf) => folderPath.toLowerCase() === cf.toLowerCase())) {
    return { success: true, total: 0, unseen: 0 }
  }

  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  let conn: PooledConnection | null = null

  try {
    conn = await connectionPool.acquire(account)
    const client = conn.client

    // 폴더 열기
    const lock = await client.getMailboxLock(folderPath)
    conn.mailboxLock = lock
    conn.currentMailbox = folderPath

    try {
      const total = client.mailbox ? client.mailbox.exists : 0

      // 읽지 않은 메시지 수 검색
      let unseen = 0
      try {
        const unseenResult = await client.search({ seen: false })
        unseen = unseenResult ? unseenResult.length : 0
      } catch {
        // 검색 실패 시 0으로 설정
        unseen = 0
      }

      return { success: true, total, unseen }
    } finally {
      lock.release()
      conn.mailboxLock = undefined
      conn.currentMailbox = undefined
      connectionPool.release(conn)
    }
  } catch (err) {
    if (conn) connectionPool.remove(conn)
    return { success: false, error: err instanceof Error ? err.message : 'Connection failed' }
  }
}

// ImapFlow bodyStructure에서 첨부파일 확인
function checkImapFlowAttachment(bodyStructure: any): boolean {
  if (!bodyStructure) return false

  // disposition이 attachment인 경우
  if (bodyStructure.disposition === 'attachment') return true

  // Content-Type이 첨부파일 유형인 경우
  const type = bodyStructure.type?.toLowerCase() || ''
  if (type.startsWith('application/') || type.startsWith('image/') ||
      type.startsWith('audio/') || type.startsWith('video/')) {
    if (bodyStructure.disposition !== 'inline') return true
  }

  // multipart인 경우 하위 파트 확인
  if (bodyStructure.childNodes) {
    for (const child of bodyStructure.childNodes) {
      if (checkImapFlowAttachment(child)) return true
    }
  }

  return false
}

// UID 조정 기반 이메일 목록 가져오기 (서버 상태 기준 동기화)
export async function getEmails(
  email: string,
  folderPath: string,
  options: { start?: number; limit?: number; unreadOnly?: boolean } = {}
): Promise<{ success: boolean; emails?: EmailHeader[]; total?: number; error?: string }> {
  // 컨테이너 폴더 체크 (선택 불가능한 폴더)
  const containerFolders = ['[Gmail]', '[Google Mail]']
  if (containerFolders.some((cf) => folderPath.toLowerCase() === cf.toLowerCase())) {
    console.log(`[getEmails] Skipping container folder: ${folderPath}`)
    return { success: true, emails: [], total: 0 }
  }

  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  const { start = 1, limit = 50, unreadOnly = false } = options

  console.log(`[getEmails] folder=${folderPath}, start=${start}, limit=${limit}, unreadOnly=${unreadOnly}`)

  let client: ImapFlow | null = null

  try {
    client = await createImapConnection(account)

    // 폴더 열기
    const lock = await client.getMailboxLock(folderPath)

    try {
      const totalAll = client.mailbox ? client.mailbox.exists : 0
      const uidValidity = client.mailbox ? Number(client.mailbox.uidValidity) : 0

      // 읽지 않은 메시지 수 계산
      let totalUnseen = 0
      try {
        const unseenResult = await client.search({ seen: false })
        totalUnseen = unseenResult ? unseenResult.length : 0
      } catch {
        totalUnseen = 0
      }

      const total = unreadOnly ? totalUnseen : totalAll

      console.log(`[getEmails] Server info - total=${total}, totalAll=${totalAll}, unseen=${totalUnseen}, uidValidity=${uidValidity}`)

      // 빈 폴더 처리
      if (total === 0) {
        if (!unreadOnly) {
          invalidateFolderCache(email, folderPath)
        }
        return { success: true, emails: [], total: 0 }
      }

      // 기존 캐시 확인
      const existingCache = getFolderCache(email, folderPath)
      if (existingCache && existingCache.uidValidity !== uidValidity) {
        console.log(`[getEmails] UIDVALIDITY changed, invalidating cache`)
        invalidateFolderCache(email, folderPath)
      }

      // 1단계: 서버의 UID 목록 가져오기
      const searchCriteria = unreadOnly ? { seen: false } : { all: true }
      const searchResult = await client.search(searchCriteria)
      const serverUids = searchResult || []

      // UID 유효성 검증
      const validServerUids = serverUids.filter((uid: number) => uid > 0 && Number.isInteger(uid))
      const serverUidSet = new Set<number>(validServerUids)
      console.log(`[getEmails] Server has ${validServerUids.length} valid UIDs (original: ${serverUids.length})`)

      // 2단계: 캐시와 비교하여 삭제된 메일 정리
      reconcileCache(email, folderPath, serverUidSet)

      // 캐시된 UID 목록
      const cachedUids = new Set(getCachedUids(email, folderPath))
      console.log(`[getEmails] Cache has ${cachedUids.size} UIDs after reconciliation`)

      // 3단계: 새로 가져와야 할 UID 식별
      const uidsToFetch = validServerUids.filter((uid) => !cachedUids.has(uid))

      // 유효한 UID가 없고 메일이 있는 경우 (시퀀스 기반 폴백)
      if (validServerUids.length === 0 && total > 0) {
        console.log('[getEmails] No valid UIDs found, falling back to sequence fetch')

        const seqStart = Math.max(1, total - (start - 1) - limit + 1)
        const seqEnd = Math.max(1, total - (start - 1))
        const seqRange = `${seqStart}:${seqEnd}`

        console.log(`[getEmails] Fetching sequence range: ${seqRange}`)

        const fetchedHeaders: EmailHeaderCache[] = []

        try {
          for await (const msg of client.fetch(seqRange, {
            envelope: true,
            flags: true,
            bodyStructure: true,
            uid: true
          }, { uid: false })) {
            const envelope = msg.envelope
            const effectiveUid = msg.uid > 0 ? msg.uid : -(msg.seq || 0)

            const hasAttachment = checkImapFlowAttachment(msg.bodyStructure)

            fetchedHeaders.push({
              uid: effectiveUid,
              messageId: envelope?.messageId || '',
              subject: envelope?.subject || '(제목 없음)',
              from: envelope?.from?.map(a => ({ name: a.name || '', address: a.address || '' })) || [],
              to: envelope?.to?.map(a => ({ name: a.name || '', address: a.address || '' })) || [],
              date: envelope?.date?.toISOString() || new Date().toISOString(),
              flags: Array.from(msg.flags || []),
              hasAttachment
            })
          }
        } catch (fetchErr) {
          console.error('Sequence fetch error:', fetchErr)
        }

        fetchedHeaders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        return { success: true, emails: fetchedHeaders.map(h => ({ ...h, date: new Date(h.date) })), total }
      }

      // 페이지에 표시될 UID 계산
      const sortedServerUids = [...validServerUids].sort((a, b) => b - a)
      const pageUids = sortedServerUids.slice(start - 1, start - 1 + limit)
      const uidsToSyncFlags = pageUids.filter((uid) => cachedUids.has(uid))

      console.log(`[getEmails] Need to fetch ${uidsToFetch.length} new UIDs, sync flags for ${uidsToSyncFlags.length} UIDs`)

      // 1. 새 메일 가져오기
      if (uidsToFetch.length > 0) {
        const fetchedHeaders: EmailHeaderCache[] = []
        console.log(`[getEmails] Fetching new UIDs:`, uidsToFetch)

        try {
          for await (const msg of client.fetch(uidsToFetch, {
            envelope: true,
            flags: true,
            bodyStructure: true,
            uid: true
          })) {
            const envelope = msg.envelope
            if (!envelope) continue

            const hasAttachment = checkImapFlowAttachment(msg.bodyStructure)
            const effectiveUid = msg.uid > 0 ? msg.uid : 0

            if (effectiveUid > 0) {
              fetchedHeaders.push({
                uid: effectiveUid,
                messageId: envelope.messageId || '',
                subject: envelope.subject || '(제목 없음)',
                from: envelope.from?.map(a => ({ name: a.name || '', address: a.address || '' })) || [],
                to: envelope.to?.map(a => ({ name: a.name || '', address: a.address || '' })) || [],
                date: envelope.date?.toISOString() || new Date().toISOString(),
                flags: Array.from(msg.flags || []),
                hasAttachment
              })
            }
          }
        } catch (fetchErr) {
          console.error('Fetch error:', fetchErr)
        }

        if (fetchedHeaders.length > 0) {
          upsertHeadersToCache(email, folderPath, fetchedHeaders, uidValidity)
          console.log(`[getEmails] Updated cache with ${fetchedHeaders.length} headers`)
        }
      }

      // 2. 기존 메일 플래그 업데이트
      if (uidsToSyncFlags.length > 0) {
        const flagUpdates: { uid: number; flags: string[] }[] = []

        try {
          for await (const msg of client.fetch(uidsToSyncFlags, { flags: true, uid: true })) {
            flagUpdates.push({ uid: msg.uid, flags: Array.from(msg.flags || []) })
          }
        } catch (flagErr) {
          console.error('Flag sync error:', flagErr)
        }

        if (flagUpdates.length > 0) {
          updateFlagsForMultipleUids(email, folderPath, flagUpdates)
        }
      }

      // 캐시에서 요청된 페이지 반환
      const cachedHeaders = getHeadersFromCache(email, folderPath, start, limit) || []
      const emails: EmailHeader[] = cachedHeaders.map((h) => ({
        ...h,
        date: new Date(h.date)
      }))

      console.log(`[getEmails] Returning ${emails.length} emails (total: ${total})`)
      return { success: true, emails, total }

    } finally {
      lock.release()
    }

  } catch (err) {
    console.error('[getEmails] Error:', err)
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    if (client) {
      try {
        await client.logout()
      } catch {
        // 무시
      }
    }
  }
}

// 단일 이메일 전체 내용 가져오기 - 연결 풀 사용
export async function getEmailContent(
  email: string,
  folderPath: string,
  uid: number
): Promise<{ success: boolean; email?: EmailFull; error?: string }> {
  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  let conn: PooledConnection | null = null

  try {
    conn = await connectionPool.acquire(account)
    const client = conn.client

    // 폴더 열기
    const lock = await client.getMailboxLock(folderPath)
    conn.mailboxLock = lock
    conn.currentMailbox = folderPath

    try {
      // 전체 이메일 소스 가져오기
      const downloadResult = await client.download(String(uid), undefined, { uid: true })
      if (!downloadResult || !downloadResult.content) {
        return { success: false, error: 'Failed to download message' }
      }

      // 메타데이터 가져오기 (플래그 등)
      let flags: string[] = []
      for await (const msg of client.fetch(String(uid), { flags: true, uid: true })) {
        flags = Array.from(msg.flags || [])
      }

      // 스트림을 버퍼로 변환
      const chunks: Buffer[] = []
      for await (const chunk of downloadResult.content) {
        chunks.push(Buffer.from(chunk))
      }
      const rawEmail = Buffer.concat(chunks)

      // 로컬 캐시에 저장 (실패해도 메일 조회는 계속)
      try {
        const folderRepository = getFolderRepository()
        const emailRepository = getEmailRepository()
        const bodyStorage = getBodyStorage()

        const folder = folderRepository.getByEmailAndPath(email, folderPath)
        if (folder) {
          const emailRecord = emailRepository.getByUid(folder.id, uid)
          if (emailRecord && !emailRecord.body_path) {
            // 본문이 아직 캐시되지 않은 경우에만 저장
            const bodyPath = await bodyStorage.saveBodyBuffer(
              folder.account_id,
              folder.id,
              uid,
              rawEmail
            )
            emailRepository.updateBody(emailRecord.id, {
              bodyPath,
              bodyText: '', // 전문 검색용 텍스트는 필요시 별도 추출
              cachedAt: Date.now()
            })
            logger.info(LogCategory.CACHE, 'Email body saved locally (user read)', {
              accountEmail: email,
              uid,
              bodyPath,
              size: rawEmail.length
            })
          }
        }
      } catch (cacheErr) {
        // 캐싱 실패 시 로그만 남기고 계속 진행
        logger.warn(LogCategory.CACHE, 'Failed to cache email body locally', {
          uid,
          email,
          error: cacheErr instanceof Error ? cacheErr.message : 'Unknown error'
        })
      }

      // simpleParser로 전체 이메일 파싱
      const parsedEmail = await simpleParser(rawEmail)

      // MIME 인코딩된 파일명 디코딩 헬퍼
      const decodeFilename = (name: string): string => {
        if (!name || !name.includes('=?')) return name
        try {
          return require('libmime').decodeWords(name)
        } catch {
          return name
        }
      }

      // 첨부파일 추출 (인라인 이미지 제외)
      const attachments = (parsedEmail.attachments || [])
        .filter((att) => {
          const isInline = att.contentDisposition === 'inline'
          const hasContentId = !!att.contentId
          const isImage = att.contentType?.startsWith('image/')

          // inline + Content-ID가 있는 이미지는 본문 삽입용이므로 제외
          if (isInline && hasContentId && isImage) {
            return false
          }

          return true
        })
        .map((att, index) => ({
          filename: decodeFilename(att.filename || 'unnamed'),
          contentType: att.contentType || 'application/octet-stream',
          size: att.size || 0,
          contentId: att.contentId?.replace(/[<>]/g, ''),
          partId: String(index + 1), // ImapFlow에서는 partId가 다르게 작동
          encoding: (att as unknown as { encoding?: string }).encoding
        }))

      const emailFull: EmailFull = {
        uid,
        messageId: parsedEmail.messageId || '',
        subject: parsedEmail.subject || '(제목 없음)',
        from: parsedEmail.from?.value.map((a) => ({
          name: a.name || '',
          address: a.address || ''
        })) || [],
        to: parsedEmail.to
          ? (Array.isArray(parsedEmail.to) ? parsedEmail.to : [parsedEmail.to]).flatMap(
              (t) => t.value.map((a) => ({ name: a.name || '', address: a.address || '' }))
            )
          : [],
        cc: parsedEmail.cc
          ? (Array.isArray(parsedEmail.cc) ? parsedEmail.cc : [parsedEmail.cc]).flatMap(
              (c) => c.value.map((a) => ({ name: a.name || '', address: a.address || '' }))
            )
          : [],
        date: parsedEmail.date || new Date(),
        flags,
        hasAttachment: attachments.length > 0,
        html: parsedEmail.html || undefined,
        text: parsedEmail.text || undefined,
        attachments
      }

      return { success: true, email: emailFull }
    } finally {
      lock.release()
      conn.mailboxLock = undefined
      conn.currentMailbox = undefined
      connectionPool.release(conn)
    }
  } catch (err) {
    if (conn) connectionPool.remove(conn)
    return { success: false, error: err instanceof Error ? err.message : 'Connection failed' }
  }
}

// 첨부파일 다운로드 - 연결 풀 사용
export async function getAttachmentContent(
  email: string,
  folderPath: string,
  uid: number,
  partId: string
): Promise<{
  success: boolean
  content?: Buffer
  filename?: string
  contentType?: string
  error?: string
}> {
  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  let conn: PooledConnection | null = null

  try {
    conn = await connectionPool.acquire(account)
    const client = conn.client

    // 폴더 열기
    const lock = await client.getMailboxLock(folderPath)
    conn.mailboxLock = lock
    conn.currentMailbox = folderPath

    try {
      // 전체 이메일을 다운로드하고 파싱하여 첨부파일 추출
      // ImapFlow에서는 partId 기반 다운로드가 제한적이므로 전체 메시지 다운로드 방식 사용
      const downloadResult = await client.download(String(uid), undefined, { uid: true })
      if (!downloadResult || !downloadResult.content) {
        return { success: false, error: 'Failed to download message' }
      }

      // 스트림을 버퍼로 변환
      const chunks: Buffer[] = []
      for await (const chunk of downloadResult.content) {
        chunks.push(Buffer.from(chunk))
      }
      const rawEmail = Buffer.concat(chunks)

      // simpleParser로 전체 이메일 파싱
      const parsedEmail = await simpleParser(rawEmail)

      // MIME 인코딩된 파일명 디코딩 헬퍼
      const decodeFilename = (name: string): string => {
        if (!name || !name.includes('=?')) return name
        try {
          return require('libmime').decodeWords(name)
        } catch {
          return name
        }
      }

      // partId를 인덱스로 해석 (getEmailContent에서 인덱스 기반으로 partId를 생성함)
      const attachmentIndex = parseInt(partId, 10) - 1

      if (parsedEmail.attachments && parsedEmail.attachments[attachmentIndex]) {
        const att = parsedEmail.attachments[attachmentIndex]
        return {
          success: true,
          content: att.content,
          filename: decodeFilename(att.filename || 'unnamed'),
          contentType: att.contentType
        }
      }

      return { success: false, error: 'Attachment not found' }
    } finally {
      lock.release()
      conn.mailboxLock = undefined
      conn.currentMailbox = undefined
      connectionPool.release(conn)
    }
  } catch (err) {
    if (conn) connectionPool.remove(conn)
    return { success: false, error: err instanceof Error ? err.message : 'Connection failed' }
  }
}

// 이메일 발송 인터페이스
export interface SendEmailOptions {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text?: string
  html?: string
  attachments?: {
    filename: string
    path?: string
    content?: Buffer | string
    contentType?: string
  }[]
  headers?: Record<string, string>
}

// 이메일 발송
export async function sendEmail(
  email: string,
  options: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  console.log('[sendEmail] Starting email send for:', email)
  console.log(
    '[sendEmail] Options:',
    JSON.stringify({
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      hasText: !!options.text,
      hasHtml: !!options.html,
      attachmentsCount: options.attachments?.length || 0
    })
  )

  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    console.error('[sendEmail] Account not found:', email)
    return { success: false, error: 'Account not found' }
  }

  console.log('[sendEmail] SMTP config:', {
    host: account.outgoing.host,
    port: account.outgoing.port,
    secure: account.outgoing.secure
  })

  return new Promise((resolve) => {
    // 포트에 따라 secure 설정 자동 결정
    // 465: 암묵적 SSL/TLS (secure: true)
    // 587, 25: STARTTLS 사용 (secure: false)
    const useSecure = account.outgoing.port === 465

    const transporter = nodemailer.createTransport({
      host: account.outgoing.host,
      port: account.outgoing.port,
      secure: useSecure,
      auth: {
        user: account.email,
        pass: account.password
      },
      tls: {
        rejectUnauthorized: false
      },
      // 포트 587에서는 STARTTLS 필요
      requireTLS: account.outgoing.port === 587,
      connectionTimeout: 30000, // 30초 연결 타임아웃
      greetingTimeout: 30000, // 30초 greeting 타임아웃
      socketTimeout: 60000 // 60초 소켓 타임아웃
    })

    // SMTP 연결 에러 핸들링
    transporter.on('error', (err) => {
      console.error('[sendEmail] Transporter error:', err)
    })

    const mailOptions: nodemailer.SendMailOptions = {
      from: account.name ? `"${account.name}" <${account.email}>` : account.email,
      to: options.to.join(', '),
      subject: options.subject || '(제목 없음)'
    }

    if (options.cc && options.cc.length > 0) {
      mailOptions.cc = options.cc.join(', ')
    }

    if (options.bcc && options.bcc.length > 0) {
      mailOptions.bcc = options.bcc.join(', ')
    }

    // 본문 설정 (html 또는 text, 둘 다 없으면 빈 문자열)
    if (options.html) {
      mailOptions.html = options.html
    } else {
      mailOptions.text = options.text || ''
    }

    if (options.attachments && options.attachments.length > 0) {
      mailOptions.attachments = options.attachments
    }

    if (options.headers) {
      mailOptions.headers = options.headers
    }

    console.log('[sendEmail] Sending mail with options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      cc: mailOptions.cc,
      bcc: mailOptions.bcc
    })

    transporter.sendMail(mailOptions, (err, info) => {
      transporter.close()
      if (err) {
        console.error('[sendEmail] Send failed:', err.message)
        resolve({ success: false, error: err.message })
        return
      }

      console.log('[sendEmail] Send successful, messageId:', info.messageId)

      // 먼저 성공 응답을 반환 (UI가 멈추지 않도록)
      resolve({ success: true, messageId: info.messageId })

      // 보낸 메일을 보낸메일함에 저장 (IMAP APPEND) - 백그라운드로 처리
      appendToSentFolder(account, mailOptions, info.messageId)
        .then(() => {
          console.log('[sendEmail] Appended to sent folder')
        })
        .catch((appendErr) => {
          // 보낸메일함 저장 실패는 경고만 (발송은 이미 성공)
          console.warn('[sendEmail] Failed to append to sent folder:', appendErr)
        })
    })
  })
}

// 보낸메일함 폴더 찾기 (ImapFlow client를 받아서 처리)
async function findSentFolderImapFlow(client: ImapFlow): Promise<string | null> {
  const sentFolderCandidates = [
    'Sent',
    'Sent Messages',
    'Sent Items',
    '보낸편지함',
    'INBOX.Sent'
  ]

  try {
    const list = await client.list()

    // specialUse 플래그로 보낸메일함 찾기
    for (const mailbox of list) {
      if (mailbox.specialUse === '\\Sent') {
        return mailbox.path
      }
    }

    // 이름으로 보낸메일함 찾기
    for (const mailbox of list) {
      const folderName = mailbox.name || mailbox.path.split(mailbox.delimiter || '/').pop() || ''
      if (sentFolderCandidates.some(c => c.toLowerCase() === folderName.toLowerCase())) {
        return mailbox.path
      }
    }

    return null
  } catch (err) {
    logger.error(LogCategory.MAIL, 'findSentFolderImapFlow failed', { error: err })
    return null
  }
}

// 보낸메일함에 이메일 저장 (IMAP APPEND)
async function appendToSentFolder(
  account: AccountConfig,
  mailOptions: nodemailer.SendMailOptions,
  _messageId: string
): Promise<void> {
  let client: ImapFlow | null = null
  try {
    client = await createImapConnection(account)

    // 보낸메일함 폴더 찾기
    let sentFolder = await findSentFolderImapFlow(client)
    if (!sentFolder) {
      sentFolder = 'Sent' // 기본값
    }

    // nodemailer를 사용하여 RFC 2822 형식의 이메일 메시지 생성
    const composer = nodemailer.createTransport({
      streamTransport: true,
      newline: 'windows' // IMAP은 CRLF를 선호
    })

    const info = await new Promise<{ message: Buffer }>((resolve, reject) => {
      composer.sendMail(mailOptions, (err, info) => {
        if (err) reject(err)
        else resolve(info as { message: Buffer })
      })
    })

    const rawMessage = info.message

    // IMAP APPEND로 보낸메일함에 저장
    try {
      await client.append(sentFolder, rawMessage, ['\\Seen'], new Date())
      // 보낸메일함 캐시 무효화
      invalidateFolderCache(account.email, sentFolder)
    } catch (appendErr) {
      // 첫 번째 폴더가 실패하면 'Sent'로 재시도
      if (sentFolder !== 'Sent') {
        console.warn(`[appendToSentFolder] Failed to append to ${sentFolder}, trying 'Sent'`)
        await client.append('Sent', rawMessage, ['\\Seen'], new Date())
        invalidateFolderCache(account.email, 'Sent')
      } else {
        throw appendErr
      }
    }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// 이메일 플래그 설정 (읽음/안읽음, 별표 등)
export async function setEmailFlags(
  email: string,
  folderPath: string,
  uid: number,
  flags: string[],
  add: boolean
): Promise<{ success: boolean; error?: string }> {
  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  let client: ImapFlow | null = null
  try {
    client = await createImapConnection(account)
    // ImapFlow handles UTF-7 encoding automatically - pass UTF-8 folder path directly
    const lock = await client.getMailboxLock(folderPath)

    try {
      if (add) {
        await client.messageFlagsAdd({ uid: uid }, flags, { uid: true })
      } else {
        await client.messageFlagsRemove({ uid: uid }, flags, { uid: true })
      }

      // 캐시 플래그 업데이트
      const cache = getFolderCache(email, folderPath)
      if (cache) {
        const header = cache.headers.find((h) => h.uid === uid)
        if (header) {
          if (add) {
            header.flags = [...new Set([...header.flags, ...flags])]
          } else {
            header.flags = header.flags.filter((f) => !flags.includes(f))
          }
          setFolderCache(email, folderPath, cache)
        }
      }

      return { success: true }
    } finally {
      lock.release()
    }
  } catch (err) {
    logger.error(LogCategory.MAIL, 'setEmailFlags failed', { error: err })
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// 가능한 휴지통 폴더 이름 목록
const TRASH_FOLDER_NAMES = [
  'Trash',
  '휴지통',
  'Deleted Messages',
  'Deleted Items',
  'Deleted',
  '&1zTJwNG1-' // 휴지통의 UTF-7 인코딩
]

// 휴지통 폴더 찾기 (ImapFlow client를 받아서 처리)
async function findTrashFolderImapFlow(client: ImapFlow): Promise<string | null> {
  try {
    const list = await client.list()

    // specialUse 플래그로 휴지통 찾기
    for (const mailbox of list) {
      if (mailbox.specialUse === '\\Trash') {
        return mailbox.path
      }
    }

    // 이름으로 휴지통 찾기
    for (const mailbox of list) {
      const folderName = mailbox.name || mailbox.path.split(mailbox.delimiter || '/').pop() || ''
      if (TRASH_FOLDER_NAMES.includes(folderName)) {
        return mailbox.path
      }
    }

    return null
  } catch (err) {
    logger.error(LogCategory.MAIL, 'findTrashFolderImapFlow failed', { error: err })
    return null
  }
}

// 이메일 삭제 (휴지통으로 이동 또는 영구 삭제)
export async function deleteEmail(
  email: string,
  folderPath: string,
  uid: number,
  permanent: boolean = false
): Promise<{ success: boolean; error?: string }> {
  console.log(`[deleteEmail] Called with account=${email}, folder="${folderPath}", uid=${uid}, permanent=${permanent}`)

  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  let client: ImapFlow | null = null
  try {
    client = await createImapConnection(account)
    // ImapFlow handles UTF-7 encoding automatically - pass UTF-8 folder path directly
    const lock = await client.getMailboxLock(folderPath)

    try {
      if (permanent) {
        // 영구 삭제: messageDelete가 \Deleted 플래그 추가 + EXPUNGE를 처리
        await client.messageDelete({ uid: uid }, { uid: true })
        console.log(`[deleteEmail] Permanent delete successful for UID ${uid}`)
      } else {
        // 휴지통으로 이동
        const trashFolder = await findTrashFolderImapFlow(client)
        console.log(`[deleteEmail] Found trash folder: ${trashFolder}`)

        if (!trashFolder) {
          return { success: false, error: 'Trash folder not found' }
        }

        // messageMove는 MOVE 명령 사용 (지원 시), 아니면 COPY + DELETE
        await client.messageMove({ uid: uid }, trashFolder, { uid: true })
        console.log(`[deleteEmail] Successfully moved UID ${uid} to trash`)
      }

      // 캐시에서 제거
      removeFromCache(email, folderPath, uid)
      return { success: true }
    } finally {
      lock.release()
    }
  } catch (err) {
    console.error(`[deleteEmail] IMAP error:`, err)
    logger.error(LogCategory.MAIL, 'deleteEmail failed', { error: err, uid, folderPath })
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// 이메일 이동 (ImapFlow의 messageMove 사용 - MOVE 명령 또는 COPY+DELETE)
export async function moveEmail(
  email: string,
  fromFolder: string,
  toFolder: string,
  uid: number
): Promise<{ success: boolean; error?: string }> {
  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  // ImapFlow handles UTF-7 encoding automatically - pass UTF-8 folder paths directly
  console.log(`[moveEmail] Starting: uid=${uid}, from=${fromFolder}, to=${toFolder}`)

  let client: ImapFlow | null = null
  try {
    client = await createImapConnection(account)
    const lock = await client.getMailboxLock(fromFolder)

    try {
      console.log(`[moveEmail] Mailbox opened, uidvalidity=${client.mailbox ? client.mailbox.uidValidity : 'unknown'}`)

      // messageMove는 MOVE 확장 지원 시 사용, 아니면 COPY + DELETE
      await client.messageMove({ uid: uid }, toFolder, { uid: true })

      console.log(`[moveEmail] Move completed successfully`)

      // 캐시 업데이트: 원본 폴더에서 제거, 대상 폴더는 다음 조회 시 동기화됨
      removeFromCache(email, fromFolder, uid)
      invalidateFolderCache(email, toFolder)

      return { success: true }
    } finally {
      lock.release()
    }
  } catch (err) {
    console.error(`[moveEmail] IMAP error:`, err)
    logger.error(LogCategory.MAIL, 'moveEmail failed', { error: err, uid, fromFolder, toFolder })
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// 이메일 벌크 삭제 (휴지통으로 이동 또는 영구 삭제) - 성능 최적화
export async function deleteBulkEmails(
  email: string,
  folderPath: string,
  uids: number[],
  permanent: boolean = false
): Promise<{ success: boolean; deletedCount: number; failedUids: number[]; error?: string }> {
  console.log(`[deleteBulkEmails] Called with account=${email}, folder="${folderPath}", uids=[${uids.join(',')}], permanent=${permanent}`)

  if (uids.length === 0) {
    return { success: true, deletedCount: 0, failedUids: [] }
  }

  // Gmail의 "All Mail" 폴더는 직접 삭제 불가 (가상 폴더이므로 실제 폴더에서 삭제해야 함)
  const gmailAllMailPatterns = [
    /^\[Gmail\]\/All Mail$/i,
    /^\[Gmail\]\/전체보관함$/,
    /^\[Gmail\]\/모든 메일$/,
    /^\[Google Mail\]\/All Mail$/i,
    /^\[Google Mail\]\/전체보관함$/,
    /^\[Google Mail\]\/모든 메일$/
  ]
  if (gmailAllMailPatterns.some((pattern) => pattern.test(folderPath))) {
    console.log(`[deleteBulkEmails] Skipping Gmail All Mail folder: ${folderPath}`)
    return {
      success: false,
      deletedCount: 0,
      failedUids: uids,
      error: 'Cannot delete directly from Gmail All Mail folder. Delete from the original folder instead.'
    }
  }

  // 단일 이메일은 기존 함수 사용
  if (uids.length === 1) {
    const result = await deleteEmail(email, folderPath, uids[0], permanent)
    return {
      success: result.success,
      deletedCount: result.success ? 1 : 0,
      failedUids: result.success ? [] : [uids[0]],
      error: result.error
    }
  }

  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, deletedCount: 0, failedUids: uids, error: 'Account not found' }
  }

  console.log(`[deleteBulkEmails] Starting bulk delete: ${uids.length} emails, permanent=${permanent}`)

  let client: ImapFlow | null = null
  try {
    client = await createImapConnection(account)
    // ImapFlow handles UTF-7 encoding automatically - pass UTF-8 folder path directly
    const lock = await client.getMailboxLock(folderPath)

    try {
      if (permanent) {
        // 영구 삭제: messageDelete가 배치로 처리
        const uidSet = uids.join(',')
        await client.messageDelete(uidSet, { uid: true })
        console.log(`[deleteBulkEmails] Permanent delete successful for ${uids.length} emails`)
      } else {
        // 휴지통으로 이동
        const trashFolder = await findTrashFolderImapFlow(client)
        console.log(`[deleteBulkEmails] Found trash folder: ${trashFolder}`)

        if (!trashFolder) {
          return { success: false, deletedCount: 0, failedUids: uids, error: 'Trash folder not found' }
        }

        // messageMove는 배치 처리 지원
        const uidSet = uids.join(',')
        await client.messageMove(uidSet, trashFolder, { uid: true })
        console.log(`[deleteBulkEmails] Successfully moved ${uids.length} emails to trash`)
        invalidateFolderCache(email, trashFolder)
      }

      // 캐시에서 다중 UID 제거
      removeMultipleFromCache(email, folderPath, uids)
      return { success: true, deletedCount: uids.length, failedUids: [] }
    } finally {
      lock.release()
    }
  } catch (err) {
    console.error(`[deleteBulkEmails] IMAP error:`, err)
    logger.error(LogCategory.MAIL, 'deleteBulkEmails failed', { error: err, uids })
    return { success: false, deletedCount: 0, failedUids: uids, error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// 이메일 벌크 이동 - 성능 최적화
export async function moveBulkEmails(
  email: string,
  fromFolder: string,
  toFolder: string,
  uids: number[]
): Promise<{ success: boolean; movedCount: number; failedUids: number[]; error?: string }> {
  if (uids.length === 0) {
    return { success: true, movedCount: 0, failedUids: [] }
  }

  // 단일 이메일은 기존 함수 사용
  if (uids.length === 1) {
    const result = await moveEmail(email, fromFolder, toFolder, uids[0])
    return {
      success: result.success,
      movedCount: result.success ? 1 : 0,
      failedUids: result.success ? [] : [uids[0]],
      error: result.error
    }
  }

  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, movedCount: 0, failedUids: uids, error: 'Account not found' }
  }

  // ImapFlow handles UTF-7 encoding automatically - pass UTF-8 folder paths directly
  console.log(`[moveBulkEmails] Starting: ${uids.length} emails from ${fromFolder} to ${toFolder}`)

  let client: ImapFlow | null = null
  try {
    client = await createImapConnection(account)
    const lock = await client.getMailboxLock(fromFolder)

    try {
      console.log(`[moveBulkEmails] Mailbox opened, uidvalidity=${client.mailbox ? client.mailbox.uidValidity : 'unknown'}`)

      // messageMove는 배치 처리 지원
      const uidSet = uids.join(',')
      await client.messageMove(uidSet, toFolder, { uid: true })

      console.log(`[moveBulkEmails] Move completed successfully: ${uids.length} emails`)

      // 캐시 업데이트
      removeMultipleFromCache(email, fromFolder, uids)
      invalidateFolderCache(email, toFolder)

      return { success: true, movedCount: uids.length, failedUids: [] }
    } finally {
      lock.release()
    }
  } catch (err) {
    console.error(`[moveBulkEmails] IMAP error:`, err)
    logger.error(LogCategory.MAIL, 'moveBulkEmails failed', { error: err, uids })
    return { success: false, movedCount: 0, failedUids: uids, error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// UID 목록으로 이메일 헤더 조회 (검색 캐시 히트 시 사용)
async function fetchEmailHeadersByUids(
  account: AccountConfig,
  folderPath: string,
  uids: number[],
  total: number
): Promise<{ success: boolean; emails?: EmailHeader[]; total?: number; error?: string }> {
  let client: ImapFlow | null = null
  try {
    client = await createImapConnection(account)
    // ImapFlow handles UTF-7 encoding automatically - pass UTF-8 folder path directly
    const lock = await client.getMailboxLock(folderPath)

    const emails: EmailHeader[] = []

    try {
      const uidSet = uids.join(',')

      for await (const msg of client.fetch(uidSet, {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true
      }, { uid: true })) {
        try {
          const envelope = msg.envelope
          const hasAttachment = checkImapFlowAttachment(msg.bodyStructure)

          emails.push({
            uid: msg.uid,
            messageId: envelope?.messageId || '',
            subject: envelope?.subject || '',
            from: envelope?.from?.map(addr => ({
              name: addr.name || '',
              address: addr.address || ''
            })) || [],
            to: envelope?.to?.map(addr => ({
              name: addr.name || '',
              address: addr.address || ''
            })) || [],
            date: envelope?.date ? new Date(envelope.date) : new Date(),
            flags: Array.from(msg.flags || []),
            hasAttachment
          })
        } catch (e) {
          console.error('Failed to parse email header:', e)
        }
      }

      // UID 기준 내림차순 정렬 유지
      emails.sort((a, b) => b.uid - a.uid)
      return { success: true, emails, total }
    } finally {
      lock.release()
    }
  } catch (err) {
    logger.error(LogCategory.MAIL, 'fetchEmailHeadersByUids failed', { error: err })
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// 이메일 검색 - 검색 결과 캐싱 적용
export async function searchEmails(
  email: string,
  folderPath: string,
  query: string,
  options?: { start?: number; limit?: number }
): Promise<{ success: boolean; emails?: EmailHeader[]; total?: number; error?: string }> {
  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  const start = options?.start || 1
  const limit = options?.limit || 50

  // 캐시 확인
  const cached = getSearchCache(email, folderPath, query)
  if (cached) {
    // 캐시된 UID 목록에서 페이지네이션된 결과 추출
    const pageResults = cached.results.slice(start - 1, start - 1 + limit)

    if (pageResults.length === 0) {
      return { success: true, emails: [], total: cached.total }
    }

    // 캐시된 UID로 헤더 조회
    return fetchEmailHeadersByUids(account, folderPath, pageResults, cached.total)
  }

  let client: ImapFlow | null = null
  try {
    client = await createImapConnection(account)
    // ImapFlow handles UTF-7 encoding automatically - pass UTF-8 folder path directly
    const lock = await client.getMailboxLock(folderPath)

    try {
      // 폴더가 비어있는지 확인
      if (!client.mailbox || client.mailbox.exists === 0) {
        return { success: true, emails: [], total: 0 }
      }

      // ImapFlow 검색 쿼리 구성 (제목, 보낸사람, 본문에서 검색)
      const searchResult = await client.search({
        or: [
          { subject: query },
          { from: query },
          { body: query }
        ]
      })

      const results = searchResult || []

      if (results.length === 0) {
        // 빈 결과도 캐시 (불필요한 재검색 방지)
        setSearchCache(email, folderPath, query, [], 0)
        return { success: true, emails: [], total: 0 }
      }

      // 결과를 역순으로 정렬 (최신 먼저)
      const validResults = results.filter((uid) => uid > 0 && Number.isInteger(uid))
      validResults.sort((a, b) => b - a)

      const total = validResults.length

      // 검색 결과(UID 목록) 캐시 저장
      setSearchCache(email, folderPath, query, validResults, total)

      const pageResults = validResults.slice(start - 1, start - 1 + limit)

      if (pageResults.length === 0) {
        return { success: true, emails: [], total }
      }

      // 헤더 조회
      const emails: EmailHeader[] = []
      const uidSet = pageResults.join(',')

      for await (const msg of client.fetch(uidSet, {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true
      }, { uid: true })) {
        try {
          const envelope = msg.envelope
          const hasAttachment = checkImapFlowAttachment(msg.bodyStructure)

          emails.push({
            uid: msg.uid,
            messageId: envelope?.messageId?.replace(/[<>]/g, '') || '',
            subject: envelope?.subject || '(제목 없음)',
            from: envelope?.from?.map(addr => ({
              name: addr.name || '',
              address: addr.address || ''
            })) || [],
            to: envelope?.to?.map(addr => ({
              name: addr.name || '',
              address: addr.address || ''
            })) || [],
            date: envelope?.date ? new Date(envelope.date) : new Date(),
            flags: Array.from(msg.flags || []),
            hasAttachment
          })
        } catch (parseError) {
          console.error('Failed to parse email header:', parseError)
        }
      }

      // UID 기준 정렬 (최신 먼저)
      emails.sort((a, b) => b.uid - a.uid)
      return { success: true, emails, total }
    } finally {
      lock.release()
    }
  } catch (err) {
    logger.error(LogCategory.MAIL, 'searchEmails failed', { error: err, query })
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

export interface DetailedSearchParams {
  sender: string
  recipientType: 'to' | 'to_cc' | 'to_cc_bcc'
  recipient: string
  contentType: 'all' | 'subject' | 'body'
  content: string
  mailbox: string
  periodType: 'all' | '1week' | '1month' | '3months' | '6months' | '1year' | 'custom'
  startDate: string
  endDate: string
  hasAttachment: boolean
  includeTrashSpam: boolean
}

// 단일 폴더 검색을 위한 헬퍼 함수 (ImapFlow 버전)
async function searchSingleFolderImapFlow(
  client: ImapFlow,
  folderPath: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  searchQuery: any,
  hasAttachmentFilter: boolean
): Promise<EmailHeader[]> {
  const emails: EmailHeader[] = []

  try {
    const lock = await client.getMailboxLock(folderPath)
    try {
      // 폴더가 비어있는지 확인
      if (!client.mailbox || client.mailbox.exists === 0) {
        return []
      }

      const searchResult = await client.search(searchQuery)
      const results = searchResult || []

      if (results.length === 0) {
        return []
      }

      const validResults = results.filter((uid) => uid > 0 && Number.isInteger(uid))
      if (validResults.length === 0) {
        return []
      }

      const uidSet = validResults.join(',')

      for await (const msg of client.fetch(uidSet, {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true
      }, { uid: true })) {
        try {
          const envelope = msg.envelope
          const hasAttachment = checkImapFlowAttachment(msg.bodyStructure)

          if (hasAttachmentFilter && !hasAttachment) {
            continue
          }

          emails.push({
            uid: msg.uid,
            messageId: envelope?.messageId?.replace(/[<>]/g, '') || '',
            subject: envelope?.subject || '(제목 없음)',
            from: envelope?.from?.map(addr => ({
              name: addr.name || '',
              address: addr.address || ''
            })) || [],
            to: envelope?.to?.map(addr => ({
              name: addr.name || '',
              address: addr.address || ''
            })) || [],
            date: envelope?.date ? new Date(envelope.date) : new Date(),
            flags: Array.from(msg.flags || []),
            hasAttachment,
            folder: folderPath
          })
        } catch (parseError) {
          console.error('Failed to parse email header:', parseError)
        }
      }

      return emails
    } finally {
      lock.release()
    }
  } catch (err) {
    // 폴더 열기 실패 시 빈 배열 반환 (계속 진행)
    return []
  }
}

// ImapFlow용 폴더 경로 추출 헬퍼
function extractFolderPathsFromList(list: ListResponse[]): string[] {
  return list.map(mailbox => mailbox.path)
}

// DetailedSearchParams를 ImapFlow 검색 쿼리로 변환하는 헬퍼
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildImapFlowSearchQuery(params: DetailedSearchParams): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: any[] = []

  // 1. 보낸사람
  if (params.sender) {
    conditions.push({ from: params.sender })
  }

  // 2. 받는사람
  if (params.recipient) {
    if (params.recipientType === 'to') {
      conditions.push({ to: params.recipient })
    } else if (params.recipientType === 'to_cc') {
      conditions.push({ or: [{ to: params.recipient }, { cc: params.recipient }] })
    } else {
      conditions.push({
        or: [{ to: params.recipient }, { cc: params.recipient }, { bcc: params.recipient }]
      })
    }
  }

  // 3. 내용 (제목/본문)
  if (params.content) {
    if (params.contentType === 'subject') {
      conditions.push({ subject: params.content })
    } else if (params.contentType === 'body') {
      conditions.push({ body: params.content })
    } else {
      conditions.push({ or: [{ subject: params.content }, { body: params.content }] })
    }
  }

  // 4. 기간
  if (params.periodType !== 'all') {
    const now = new Date()
    let sinceDate: Date | null = null
    let beforeDate: Date | null = null

    if (params.periodType === 'custom' && params.startDate && params.endDate) {
      sinceDate = new Date(params.startDate)
      beforeDate = new Date(params.endDate)
      beforeDate.setDate(beforeDate.getDate() + 1)
    } else {
      switch (params.periodType) {
        case '1week':
          sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case '1month':
          sinceDate = new Date(now.setMonth(now.getMonth() - 1))
          break
        case '3months':
          sinceDate = new Date(now.setMonth(now.getMonth() - 3))
          break
        case '6months':
          sinceDate = new Date(now.setMonth(now.getMonth() - 6))
          break
        case '1year':
          sinceDate = new Date(now.setFullYear(now.getFullYear() - 1))
          break
      }
    }

    if (sinceDate) {
      conditions.push({ since: sinceDate })
    }
    if (beforeDate) {
      conditions.push({ before: beforeDate })
    }
  }

  // 조건이 없으면 전체 검색
  if (conditions.length === 0) {
    return { all: true }
  }

  // 조건이 하나면 그대로, 여러 개면 AND 조합
  if (conditions.length === 1) {
    return conditions[0]
  }

  // 모든 조건을 AND로 조합
  return conditions.reduce((acc, cond) => ({ ...acc, ...cond }), {})
}

export async function searchEmailsDetailed(
  email: string,
  params: DetailedSearchParams,
  options?: { start?: number; limit?: number }
): Promise<{ success: boolean; emails?: EmailHeader[]; total?: number; error?: string }> {
  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  const start = options?.start || 1
  const limit = options?.limit || 50

  let client: ImapFlow | null = null
  try {
    client = await createImapConnection(account)
    const searchQuery = buildImapFlowSearchQuery(params)

    // mailbox가 'all'인 경우 모든 폴더 검색
    if (params.mailbox === 'all') {
      // 폴더 목록 가져오기
      const list = await client.list()
      const allFolders = extractFolderPathsFromList(list)

      // 각 폴더 검색
      const allEmails: EmailHeader[] = []
      for (const folder of allFolders) {
        // Trash, Spam 폴더는 includeTrashSpam 옵션에 따라 제외
        const lowerFolder = folder.toLowerCase()
        if (
          !params.includeTrashSpam &&
          (lowerFolder.includes('trash') ||
            lowerFolder.includes('spam') ||
            lowerFolder.includes('junk') ||
            lowerFolder.includes('deleted'))
        ) {
          continue
        }

        const folderEmails = await searchSingleFolderImapFlow(
          client,
          folder,
          searchQuery,
          params.hasAttachment
        )
        allEmails.push(...folderEmails)
      }

      // Gmail 특수 폴더 패턴 (삭제 작업이 제대로 동작하지 않는 폴더)
      const gmailSpecialFolderPatterns = [
        /^\[Gmail\]\//i,
        /^\[Google Mail\]\//i
      ]
      const isGmailSpecialFolder = (folder: string): boolean => {
        return gmailSpecialFolderPatterns.some(pattern => pattern.test(folder))
      }

      // messageId 기반 중복 제거 (Gmail 라벨 등으로 인해 여러 폴더에 동일 이메일 존재 가능)
      // 일반 폴더(INBOX 등)를 Gmail 특수 폴더([Gmail]/All Mail 등)보다 우선
      const emailsByMessageId = new Map<string, typeof allEmails[0]>()
      for (const email of allEmails) {
        const key = email.messageId || `${email.folder}:${email.uid}`
        const existing = emailsByMessageId.get(key)

        if (!existing) {
          // 첫 번째 발견
          emailsByMessageId.set(key, email)
        } else {
          // 이미 존재하는 경우: 일반 폴더를 우선
          const existingIsSpecial = isGmailSpecialFolder(existing.folder || '')
          const currentIsSpecial = isGmailSpecialFolder(email.folder || '')

          // 기존이 특수 폴더이고 현재가 일반 폴더면 교체
          if (existingIsSpecial && !currentIsSpecial) {
            emailsByMessageId.set(key, email)
          }
        }
      }
      const dedupedEmails = Array.from(emailsByMessageId.values())

      // 날짜순 정렬 (최신 먼저)
      dedupedEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      // 페이지네이션 적용
      const total = dedupedEmails.length
      const pagedEmails = dedupedEmails.slice(start - 1, start - 1 + limit)
      return { success: true, emails: pagedEmails, total }
    }

    // 특정 폴더 검색
    const targetFolder = params.mailbox
    const emails = await searchSingleFolderImapFlow(
      client,
      targetFolder,
      searchQuery,
      params.hasAttachment
    )

    // UID 기준 정렬 (최신 먼저)
    emails.sort((a, b) => b.uid - a.uid)

    const total = emails.length
    const pagedEmails = emails.slice(start - 1, start - 1 + limit)
    return { success: true, emails: pagedEmails, total }
  } catch (err) {
    logger.error(LogCategory.MAIL, 'searchEmailsDetailed failed', { error: err })
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// 제외할 폴더 패턴 (휴지통, 스팸, 임시보관함, 보낸메일함)
const EXCLUDED_FOLDER_PATTERNS = [
  'TRASH', 'DELETED', '휴지통',
  'SPAM', 'JUNK', '스팸', 'SPAMBOX',
  'DRAFTS', 'DRAFT', '임시보관함', 'DRAFTBOX',
  'SENT', '보낸편지함', '보낸메일함'
]

function shouldExcludeFolder(folderPath: string): boolean {
  const upperPath = folderPath.toUpperCase()
  return EXCLUDED_FOLDER_PATTERNS.some(pattern => upperPath.includes(pattern))
}

// 특수 필터 검색 (안읽음, 중요, 첨부) - 모든 폴더 검색
export type EmailFilterType = 'unread' | 'starred' | 'attachment'

// 폴더 정보를 포함한 이메일 헤더 (내부 사용)
interface EmailHeaderWithFolder extends EmailHeader {
  folder: string
}

export async function searchEmailsByFilter(
  email: string,
  filterType: EmailFilterType,
  options?: { start?: number; limit?: number }
): Promise<{ success: boolean; emails?: EmailHeader[]; total?: number; error?: string }> {
  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  const start = options?.start || 1
  const limit = options?.limit || 50

  let client: ImapFlow | null = null

  try {
    client = await createImapConnection(account)
    const allEmails: EmailHeaderWithFolder[] = []

    // 폴더 목록 가져오기
    const mailboxList = await client.list()
    const allFolders = extractFolderPathsFromList(mailboxList)

    // 제외할 폴더를 필터링
    const foldersToSearch = allFolders.filter(f => !shouldExcludeFolder(f))

    if (foldersToSearch.length === 0) {
      return { success: true, emails: [], total: 0 }
    }

    // ImapFlow 검색 조건 구성
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let searchQuery: any

    switch (filterType) {
      case 'unread':
        searchQuery = { seen: false }
        break
      case 'starred':
        searchQuery = { flagged: true }
        break
      case 'attachment':
        // IMAP에서 직접 첨부파일 검색은 불가능하므로 모든 메일을 가져와서 필터링
        searchQuery = { all: true }
        break
      default:
        searchQuery = { all: true }
    }

    // 각 폴더에서 순차적으로 검색
    for (const folderPath of foldersToSearch) {
      try {
        const lock = await client.getMailboxLock(folderPath)
        try {
          // 메일함이 비어있으면 스킵
          if (!client.mailbox || client.mailbox.exists === 0) {
            continue
          }

          const searchResult = await client.search(searchQuery, { uid: true })
          const results = searchResult || []

          if (results.length === 0) {
            continue
          }

          // 유효한 UID만 필터링
          const validResults = results.filter((uid) => uid > 0 && Number.isInteger(uid))

          if (validResults.length === 0) {
            continue
          }

          // 메시지 헤더 가져오기
          for await (const msg of client.fetch(validResults, {
            uid: true,
            flags: true,
            envelope: true,
            bodyStructure: true
          })) {
            try {
              const hasAttachment = checkImapFlowAttachment(msg.bodyStructure)

              // 첨부파일 필터인 경우 첨부파일이 있는 메일만 추가
              if (filterType === 'attachment' && !hasAttachment) {
                continue
              }

              const envelope = msg.envelope
              const from = envelope?.from?.[0]
              const to = envelope?.to || []

              allEmails.push({
                uid: msg.uid,
                messageId: envelope?.messageId?.replace(/[<>]/g, '') || '',
                subject: envelope?.subject || '(제목 없음)',
                from: from ? [{ name: from.name || '', address: from.address || '' }] : [],
                to: to.map(addr => ({ name: addr.name || '', address: addr.address || '' })),
                date: envelope?.date || new Date(),
                flags: msg.flags ? Array.from(msg.flags) : [],
                hasAttachment,
                folder: folderPath
              })
            } catch (parseError) {
              console.error('Failed to parse email header:', parseError)
            }
          }
        } finally {
          lock.release()
        }
      } catch (folderErr) {
        // 폴더 열기 실패 시 다음 폴더로 계속
        console.debug(`Failed to open folder ${folderPath}:`, folderErr)
        continue
      }
    }

    // Gmail 특수 폴더 패턴 (삭제 작업이 제대로 동작하지 않는 폴더)
    const gmailSpecialFolderPatterns = [
      /^\[Gmail\]\//i,
      /^\[Google Mail\]\//i
    ]
    const isGmailSpecialFolder = (folder: string): boolean => {
      return gmailSpecialFolderPatterns.some(pattern => pattern.test(folder))
    }

    // messageId 기반 중복 제거 (Gmail 라벨 등으로 인해 여러 폴더에 동일 이메일 존재 가능)
    // 일반 폴더(INBOX 등)를 Gmail 특수 폴더([Gmail]/All Mail 등)보다 우선
    const emailsByMessageId = new Map<string, typeof allEmails[0]>()
    for (const email of allEmails) {
      const key = email.messageId || `${email.folder}:${email.uid}`
      const existing = emailsByMessageId.get(key)

      if (!existing) {
        emailsByMessageId.set(key, email)
      } else {
        const existingIsSpecial = isGmailSpecialFolder(existing.folder || '')
        const currentIsSpecial = isGmailSpecialFolder(email.folder || '')

        if (existingIsSpecial && !currentIsSpecial) {
          emailsByMessageId.set(key, email)
        }
      }
    }
    const dedupedEmails = Array.from(emailsByMessageId.values())

    // 날짜 기준 정렬 (최신 먼저)
    dedupedEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const total = dedupedEmails.length

    // 페이지네이션 적용
    const pagedEmails = dedupedEmails.slice(start - 1, start - 1 + limit)

    // folder 필드 포함하여 반환 (필터 검색에서 폴더 정보 필요)
    const resultEmails: EmailHeader[] = pagedEmails.map(e => ({
      uid: e.uid,
      messageId: e.messageId,
      subject: e.subject,
      from: e.from,
      to: e.to,
      date: e.date,
      flags: e.flags,
      hasAttachment: e.hasAttachment,
      folder: e.folder
    }))

    return { success: true, emails: resultEmails, total }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// 필터별 메일 수 조회 (사이드바 표시용) - 모든 폴더 검색
export async function getFilterCounts(
  email: string
): Promise<{
  success: boolean
  unread?: number
  starred?: number
  attachment?: number
  error?: string
}> {
  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  let client: ImapFlow | null = null

  try {
    client = await createImapConnection(account)

    // 폴더 목록 가져오기
    const mailboxList = await client.list()
    const allFolders = extractFolderPathsFromList(mailboxList)

    // 제외할 폴더를 필터링
    const foldersToSearch = allFolders.filter(f => !shouldExcludeFolder(f))

    if (foldersToSearch.length === 0) {
      return { success: true, unread: 0, starred: 0, attachment: 0 }
    }

    let totalUnread = 0
    let totalStarred = 0

    for (const folderPath of foldersToSearch) {
      try {
        const lock = await client.getMailboxLock(folderPath)
        try {
          // 안읽음 수 조회
          const unreadResult = await client.search({ seen: false }, { uid: true })
          if (unreadResult && Array.isArray(unreadResult)) {
            totalUnread += unreadResult.length
          }

          // 중요 메일 수 조회
          const starredResult = await client.search({ flagged: true }, { uid: true })
          if (starredResult && Array.isArray(starredResult)) {
            totalStarred += starredResult.length
          }
        } finally {
          lock.release()
        }
      } catch {
        // 폴더 열기 실패 시 다음 폴더로 계속
        continue
      }
    }

    return { success: true, unread: totalUnread, starred: totalStarred, attachment: 0 }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// 폴더 생성
export async function createFolder(
  email: string,
  folderName: string,
  parentFolder?: string
): Promise<{ success: boolean; error?: string; path?: string }> {
  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  let client: ImapFlow | null = null

  try {
    client = await createImapConnection(account)

    // 서버의 delimiter를 확인하기 위해 폴더 목록 조회
    const mailboxList = await client.list()

    // 서버의 기본 delimiter 찾기
    let delimiter = '/'
    const inboxFolder = mailboxList.find(m => m.path.toUpperCase() === 'INBOX')
    if (inboxFolder) {
      delimiter = inboxFolder.delimiter
    } else if (mailboxList.length > 0) {
      delimiter = mailboxList[0].delimiter
    }

    console.log('[createFolder] Server delimiter:', delimiter)
    console.log('[createFolder] Parent folder:', parentFolder)
    console.log('[createFolder] Folder name:', folderName)

    // 폴더 경로 구성 (부모 폴더가 있으면 부모{delimiter}자식 형태로)
    const fullPath = parentFolder ? `${parentFolder}${delimiter}${folderName}` : folderName
    console.log('[createFolder] Full path:', fullPath)

    await client.mailboxCreate(fullPath)
    console.log('[createFolder] Success, path:', fullPath)

    return { success: true, path: fullPath }
  } catch (err) {
    console.error('[createFolder] Error:', err instanceof Error ? err.message : err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// 폴더의 메일 개수 조회
export async function getFolderEmailCount(
  email: string,
  folderPath: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const folderRepo = getFolderRepository()
    const folder = folderRepo.getByEmailAndPath(email, folderPath)

    if (!folder) {
      return { success: true, count: 0 }
    }

    const emailRepo = getEmailRepository()
    const count = emailRepo.getCountExcludeDeleted(folder.id)

    return { success: true, count }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// 폴더 삭제
export async function deleteFolder(
  email: string,
  folderPath: string,
  moveEmailsTo?: string // 메일 이동 대상 폴더 (없으면 메일도 함께 삭제)
): Promise<{ success: boolean; error?: string; movedCount?: number; deletedCount?: number }> {
  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  let client: ImapFlow | null = null
  let movedCount = 0
  let deletedCount = 0

  try {
    client = await createImapConnection(account)

    // 폴더에 메일이 있고 이동 대상이 지정된 경우 메일 먼저 이동
    if (moveEmailsTo) {
      try {
        // 폴더 선택
        const mailbox = await client.mailboxOpen(folderPath)
        if (mailbox.exists && mailbox.exists > 0) {
          movedCount = mailbox.exists
          // 모든 메일을 대상 폴더로 이동
          await client.messageMove('1:*', moveEmailsTo)
          console.log(`[deleteFolder] Moved ${movedCount} emails from ${folderPath} to ${moveEmailsTo}`)
        }
      } catch (moveErr) {
        console.error(`[deleteFolder] Failed to move emails:`, moveErr)
        // 이동 실패 시 계속 진행 (폴더 삭제 시 메일도 삭제됨)
      }
    }

    // IMAP에서 폴더 삭제
    await client.mailboxDelete(folderPath)
    console.log(`[deleteFolder] Deleted folder from IMAP: ${folderPath}`)

    // SQLite에서 폴더와 메일 레코드 삭제
    try {
      const folderRepo = getFolderRepository()
      const folder = folderRepo.getByEmailAndPath(email, folderPath)

      if (folder) {
        // 이메일 레코드 삭제 (CASCADE로 자동 처리될 수 있지만 명시적으로 처리)
        const emailRepo = getEmailRepository()
        deletedCount = emailRepo.deleteByFolderId(folder.id)
        console.log(`[deleteFolder] Deleted ${deletedCount} email records from SQLite`)

        // 폴더 레코드 삭제
        folderRepo.delete(folder.id)
        console.log(`[deleteFolder] Deleted folder record from SQLite: ${folder.id}`)
      }
    } catch (dbErr) {
      console.error(`[deleteFolder] Failed to delete from SQLite:`, dbErr)
      // SQLite 삭제 실패해도 IMAP 삭제는 성공했으므로 성공으로 처리
    }

    return { success: true, movedCount, deletedCount }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// 폴더 이름 변경
export async function renameFolder(
  email: string,
  oldPath: string,
  newPath: string
): Promise<{ success: boolean; error?: string }> {
  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  let client: ImapFlow | null = null

  try {
    client = await createImapConnection(account)
    await client.mailboxRename(oldPath, newPath)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// ========== 메일 자동분류 규칙 ==========

export interface MailFilterRule {
  id: string
  accountEmail: string
  enabled: boolean
  condition: {
    type: 'from' | 'to' | 'subject' | 'any'
    value: string // 이메일 주소 또는 검색어
  }
  action: {
    type: 'move'
    targetFolder: string
  }
  createdAt: string
}

// 자동분류 규칙 저장소
const filterRuleStore = new ElectronStore<{ filterRules: MailFilterRule[] }>({
  name: 'mail-filter-rules',
  defaults: {
    filterRules: []
  }
})

// 규칙 목록 가져오기
export function getFilterRules(accountEmail?: string): MailFilterRule[] {
  const rules = filterRuleStore.get('filterRules', [])
  if (accountEmail) {
    return rules.filter((r) => r.accountEmail === accountEmail)
  }
  return rules
}

// 규칙 추가
export function addFilterRule(rule: Omit<MailFilterRule, 'id' | 'createdAt'>): {
  success: boolean
  rule?: MailFilterRule
  error?: string
} {
  try {
    const rules = filterRuleStore.get('filterRules', [])
    const newRule: MailFilterRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString()
    }
    rules.push(newRule)
    filterRuleStore.set('filterRules', rules)
    return { success: true, rule: newRule }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to add rule' }
  }
}

// 규칙 삭제
export function deleteFilterRule(ruleId: string): { success: boolean; error?: string } {
  try {
    const rules = filterRuleStore.get('filterRules', [])
    const filtered = rules.filter((r) => r.id !== ruleId)
    filterRuleStore.set('filterRules', filtered)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete rule' }
  }
}

// 규칙 업데이트
export function updateFilterRule(
  ruleId: string,
  updates: Partial<MailFilterRule>
): { success: boolean; error?: string } {
  try {
    const rules = filterRuleStore.get('filterRules', [])
    const index = rules.findIndex((r) => r.id === ruleId)
    if (index === -1) {
      return { success: false, error: 'Rule not found' }
    }
    rules[index] = { ...rules[index], ...updates, id: ruleId }
    filterRuleStore.set('filterRules', rules)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update rule' }
  }
}

// 이메일에 규칙 적용 (자동 이동)
export async function applyFilterRules(
  email: string,
  folderPath: string,
  emailHeader: {
    uid: number
    from: { address: string }[]
    to: { address: string }[]
    subject: string
  }
): Promise<{ moved: boolean; targetFolder?: string; error?: string }> {
  const rules = getFilterRules(email)
  const enabledRules = rules.filter((r) => r.enabled)

  for (const rule of enabledRules) {
    let matches = false
    const searchValue = rule.condition.value.toLowerCase()

    switch (rule.condition.type) {
      case 'from':
        matches = emailHeader.from.some((f) => f.address.toLowerCase().includes(searchValue))
        break
      case 'to':
        matches = emailHeader.to.some((t) => t.address.toLowerCase().includes(searchValue))
        break
      case 'subject':
        matches = emailHeader.subject.toLowerCase().includes(searchValue)
        break
      case 'any':
        matches =
          emailHeader.from.some((f) => f.address.toLowerCase().includes(searchValue)) ||
          emailHeader.to.some((t) => t.address.toLowerCase().includes(searchValue)) ||
          emailHeader.subject.toLowerCase().includes(searchValue)
        break
    }

    if (matches && rule.action.type === 'move') {
      // 이미 대상 폴더에 있으면 이동하지 않음
      if (folderPath === rule.action.targetFolder) {
        continue
      }

      const result = await moveEmail(email, folderPath, rule.action.targetFolder, emailHeader.uid)
      if (result.success) {
        return { moved: true, targetFolder: rule.action.targetFolder }
      } else {
        return { moved: false, error: result.error }
      }
    }
  }

  return { moved: false }
}

// =====================================================
// 설정, 필터, 스팸 설정은 분리된 모듈에서 re-export됨
// (./settings, ./filters 모듈 참조)
// =====================================================

// 스팸 필터 적용 - INBOX의 새 메일 중 차단된 발신자의 메일을 스팸 폴더로 이동
export async function applySpamFilter(
  accountEmail: string
): Promise<{ success: boolean; movedCount: number; error?: string }> {
  const settings = getSpamSettings(accountEmail)
  if (!settings.enabled) {
    return { success: true, movedCount: 0 }
  }

  if (settings.blockedSenders.length === 0 && settings.blockedDomains.length === 0) {
    return { success: true, movedCount: 0 }
  }

  const account = await getAccountWithPasswordAsync(accountEmail)
  if (!account) {
    return { success: false, movedCount: 0, error: 'Account not found' }
  }

  let client: ImapFlow | null = null

  try {
    client = await createImapConnection(account)

    // 스팸 폴더 찾기
    const spamFolder = await findSpamFolderImapFlow(client)
    if (!spamFolder) {
      return { success: false, movedCount: 0, error: 'Spam folder not found' }
    }

    // INBOX 열기
    const lock = await client.getMailboxLock('INBOX')

    try {
      // 읽지 않은 메일 검색
      const searchResult = await client.search({ seen: false }, { uid: true })
      const uids = searchResult || []

      if (uids.length === 0) {
        return { success: true, movedCount: 0 }
      }

      // 각 메일의 발신자 확인
      const emailsToMove: number[] = []

      for await (const msg of client.fetch(uids, {
        uid: true,
        envelope: true
      })) {
        const from = msg.envelope?.from?.[0]
        if (from?.address) {
          const senderEmail = from.address.toLowerCase()
          if (isEmailBlocked(accountEmail, senderEmail)) {
            emailsToMove.push(msg.uid)
            console.log(`[applySpamFilter] Blocked sender detected: ${senderEmail}, uid: ${msg.uid}`)
          }
        }
      }

      if (emailsToMove.length === 0) {
        return { success: true, movedCount: 0 }
      }

      console.log(`[applySpamFilter] Moving ${emailsToMove.length} emails to spam folder`)

      // 스팸 폴더로 이동
      await client.messageMove(emailsToMove, spamFolder, { uid: true })

      // 캐시 무효화
      invalidateFolderCache(accountEmail, 'INBOX')
      invalidateFolderCache(accountEmail, spamFolder)

      return { success: true, movedCount: emailsToMove.length }
    } finally {
      lock.release()
    }
  } catch (err) {
    return { success: false, movedCount: 0, error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// 스팸 폴더 찾기 헬퍼 (ImapFlow용)
async function findSpamFolderImapFlow(client: ImapFlow): Promise<string | null> {
  const mailboxList = await client.list()
  const spamNames = ['Junk', '스팸메일함', 'Spam', 'Junk E-mail', 'Bulk Mail', 'SPAMBOX', '[Gmail]/스팸', '[Gmail]/Spam']

  // specialUse로 먼저 찾기
  for (const mailbox of mailboxList) {
    if (mailbox.specialUse === '\\Junk') {
      return mailbox.path
    }
  }

  // 이름으로 찾기
  for (const mailbox of mailboxList) {
    if (spamNames.some(s => s.toLowerCase() === mailbox.path.toLowerCase() || s.toLowerCase() === mailbox.name.toLowerCase())) {
      return mailbox.path
    }
  }

  return null
}

// EML 파일로 저장
export async function saveEmailAsEml(
  email: string,
  folderPath: string,
  uid: number,
  subject: string
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  const { dialog } = await import('electron')
  const fs = await import('fs/promises')

  try {
    const account = await getAccountWithPasswordAsync(email)
    if (!account) {
      return { success: false, error: 'Account not found' }
    }

    // 파일 저장 대화상자 열기
    const sanitizedSubject = subject.replace(/[\\/:*?"<>|]/g, '_').substring(0, 100)
    const defaultFileName = `${sanitizedSubject}.eml`

    const result = await dialog.showSaveDialog({
      title: '이메일 저장',
      defaultPath: defaultFileName,
      filters: [{ name: 'EML 파일', extensions: ['eml'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Cancelled by user' }
    }

    // IMAP에서 원본 메일 데이터 가져오기
    const rawEmail = await getRawEmail(account, folderPath, uid)
    if (!rawEmail) {
      return { success: false, error: 'Failed to fetch email content' }
    }

    // 파일로 저장
    await fs.writeFile(result.filePath, rawEmail, 'utf8')

    return { success: true, filePath: result.filePath }
  } catch (err) {
    console.error('Failed to save email as EML:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save email' }
  }
}

// IMAP에서 원본 메일 데이터 가져오기
async function getRawEmail(
  account: AccountConfig,
  folderPath: string,
  uid: number
): Promise<string | null> {
  let client: ImapFlow | null = null

  try {
    client = await createImapConnection(account)
    const lock = await client.getMailboxLock(folderPath)

    try {
      // 원본 메일 데이터 다운로드
      const downloadResult = await client.download(String(uid), undefined, { uid: true })
      if (!downloadResult || !downloadResult.content) {
        return null
      }

      // 스트림을 문자열로 변환
      const chunks: Buffer[] = []
      for await (const chunk of downloadResult.content) {
        chunks.push(Buffer.from(chunk))
      }
      return Buffer.concat(chunks).toString('utf8')
    } finally {
      lock.release()
    }
  } catch {
    return null
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// 새 메일 체크 (폴링용)
export interface NewEmailInfo {
  uid: number
  from: string
  subject: string
  date: Date
}

export interface NewEmailsResult {
  success: boolean
  newCount: number
  emails: NewEmailInfo[]
  error?: string
}

// 계정별로 이미 알림을 보낸 메일 UID를 추적
const notifiedEmailUids: Map<string, Set<number>> = new Map()

export async function checkNewEmails(
  accountEmail: string,
  folderPath: string = 'INBOX'
): Promise<NewEmailsResult> {
  const account = await getAccountWithPasswordAsync(accountEmail)
  if (!account) {
    return { success: false, newCount: 0, emails: [], error: 'Account not found' }
  }

  let client: ImapFlow | null = null

  try {
    client = await createImapConnection(account)
    const lock = await client.getMailboxLock(folderPath)

    try {
      // UNSEEN (읽지 않은) 메일 검색
      const searchResult = await client.search({ seen: false }, { uid: true })
      const uids = searchResult || []

      if (uids.length === 0) {
        return { success: true, newCount: 0, emails: [] }
      }

      const newEmails: NewEmailInfo[] = []

      // 메시지 헤더 가져오기
      for await (const msg of client.fetch(uids, {
        uid: true,
        envelope: true
      })) {
        const envelope = msg.envelope
        const from = envelope?.from?.[0]

        // 보낸사람 이름만 추출
        const senderName = from?.name || from?.address || 'Unknown'

        // 제목
        const subject = envelope?.subject || '(제목 없음)'

        newEmails.push({
          uid: msg.uid,
          from: senderName,
          subject,
          date: envelope?.date || new Date()
        })
      }

      // 이미 알림을 보낸 UID 목록 가져오기
      const accountKey = `${accountEmail}:${folderPath}`
      if (!notifiedEmailUids.has(accountKey)) {
        notifiedEmailUids.set(accountKey, new Set())
      }
      const notifiedSet = notifiedEmailUids.get(accountKey)!

      // 최근 5분 이내에 도착한 메일만 알림 대상으로 (앱 재시작 시 오래된 메일 알림 방지)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      const recentEmails = newEmails.filter((email) => email.date >= fiveMinutesAgo)

      // 아직 알림을 보내지 않은 새 메일만 필터링
      const trulyNewEmails = recentEmails.filter((email) => !notifiedSet.has(email.uid))

      // 새 메일 UID를 알림 목록에 추가
      for (const email of trulyNewEmails) {
        notifiedSet.add(email.uid)
      }

      // 알림 목록이 너무 커지면 오래된 UID 정리 (최근 500개만 유지)
      if (notifiedSet.size > 500) {
        const uidsArray = Array.from(notifiedSet).sort((a, b) => b - a)
        notifiedEmailUids.set(accountKey, new Set(uidsArray.slice(0, 500)))
      }

      return {
        success: true,
        newCount: trulyNewEmails.length,
        emails: trulyNewEmails.sort((a, b) => b.uid - a.uid)
      }
    } finally {
      lock.release()
    }
  } catch (err) {
    return { success: false, newCount: 0, emails: [], error: err instanceof Error ? err.message : 'Unknown error' }
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }
}

// 폴더 비우기 (휴지통, 스팸메일함 등의 모든 메일 영구 삭제)
export async function emptyFolder(
  email: string,
  folderPath: string
): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  const account = await getAccountWithPasswordAsync(email)
  if (!account) {
    return { success: false, error: 'Account not found' }
  }

  let client: ImapFlow | null = null

  let imapDeletedCount = 0

  try {
    client = await createImapConnection(account)
    const lock = await client.getMailboxLock(folderPath)

    try {
      // 메일함이 비어있는지 확인
      const total = client.mailbox ? client.mailbox.exists : 0

      if (total > 0) {
        // 모든 메일 검색
        const searchResult = await client.search({ all: true }, { uid: true })
        const uids = searchResult || []

        // IMAP에서 메일이 있으면 삭제
        if (uids.length > 0) {
          await client.messageDelete(uids, { uid: true })
          imapDeletedCount = uids.length
        }
      }

      // 캐시 무효화
      invalidateFolderCache(email, folderPath)
    } finally {
      lock.release()
    }
  } catch (err) {
    logger.error(LogCategory.MAIL_DELETE, 'IMAP empty folder failed', {
      folderPath,
      error: err instanceof Error ? err.message : String(err)
    })
    // IMAP 오류가 발생해도 SQLite는 정리 시도
  } finally {
    if (client) {
      await client.logout().catch(() => {})
    }
  }

  // SQLite에서도 이메일 삭제 (IMAP 결과와 관계없이 항상 실행)
  let sqliteDeletedCount = 0
  try {
    const folderRepo = getFolderRepository()
    const emailRepo = getEmailRepository()
    const folder = folderRepo.getByEmailAndPath(email, folderPath)

    logger.info(LogCategory.MAIL_DELETE, 'Empty folder - SQLite lookup', {
      email,
      folderPath,
      folderFound: !!folder,
      folderId: folder?.id,
      imapDeletedCount
    })

    if (folder) {
      // 해당 폴더의 모든 이메일을 삭제된 것으로 표시 (UID 상관없이 전체)
      sqliteDeletedCount = emailRepo.markAllAsDeletedInFolder(folder.id)
      // 폴더 카운트 재계산
      folderRepo.recalculateCounts(folder.id)
      logger.info(LogCategory.MAIL_DELETE, 'Emptied folder in SQLite', {
        folderPath,
        sqliteDeletedCount
      })
    } else {
      // 폴더를 찾지 못한 경우 - 가능한 폴더 목록 로그
      const accountId = folderRepo.getAccountIdByEmail(email)
      if (accountId) {
        const allFolders = folderRepo.getByAccountId(accountId)
        logger.warn(LogCategory.MAIL_DELETE, 'Folder not found in SQLite for empty operation', {
          requestedPath: folderPath,
          availablePaths: allFolders.map(f => f.path)
        })
      }
    }
  } catch (dbErr) {
    logger.error(LogCategory.DATABASE, 'Failed to empty folder in SQLite', {
      error: dbErr instanceof Error ? dbErr.message : String(dbErr)
    })
  }

  return { success: true, deletedCount: Math.max(imapDeletedCount, sqliteDeletedCount) }
}

// =====================================================
// 주소록, VIP 관련은 분리된 모듈에서 re-export됨
// (./contacts 모듈 참조)
// =====================================================

// ========== 전역 검색 ==========

interface GlobalSearchResult {
  accountEmail: string
  folderPath: string
  folderName: string
  uid: number
  messageId: string
  subject: string
  from: { name?: string; address: string }[]
  to: { name?: string; address: string }[]
  date: Date
  flags: string[]
  hasAttachment: boolean
}

interface GlobalSearchOptions {
  accounts?: string[] // 검색할 계정 목록 (비어있으면 모든 계정)
  folders?: string[] // 검색할 폴더 목록 (비어있으면 주요 폴더)
  limit?: number // 총 결과 제한
  includeTrash?: boolean // 휴지통 포함
  includeSpam?: boolean // 스팸 포함
}

// 전역 검색 (모든 폴더/계정에서 검색)
export async function globalSearch(
  query: string,
  options?: GlobalSearchOptions
): Promise<{ success: boolean; results?: GlobalSearchResult[]; total?: number; error?: string }> {
  const allAccounts = getAccounts()
  if (allAccounts.length === 0) {
    return { success: false, error: 'No accounts found' }
  }

  const accountsToSearch = options?.accounts?.length
    ? allAccounts.filter((a) => options.accounts!.includes(a.email))
    : allAccounts

  const results: GlobalSearchResult[] = []
  const limit = options?.limit || 100

  // 제외할 폴더 목록
  const excludeFolders: string[] = []
  if (!options?.includeTrash) {
    excludeFolders.push('Trash', 'Deleted', 'TRASH', '휴지통', 'Deleted Items', 'Deleted Messages')
  }
  if (!options?.includeSpam) {
    excludeFolders.push('Spam', 'Junk', 'SPAM', '스팸', 'Junk E-mail', 'Bulk Mail')
  }

  for (const account of accountsToSearch) {
    if (results.length >= limit) break

    const accountConfig = await getAccountWithPasswordAsync(account.email)
    if (!accountConfig) continue

    try {
      // 폴더 목록 가져오기
      const foldersResult = await getFolders(account.email)
      if (!foldersResult.success || !foldersResult.folders) continue

      // 검색할 폴더 필터링
      let foldersToSearch = foldersResult.folders.filter((f) => {
        const folderName = f.name.toUpperCase()
        return !excludeFolders.some((ef) => folderName.includes(ef.toUpperCase()))
      })

      // 특정 폴더만 검색하도록 지정된 경우
      if (options?.folders?.length) {
        foldersToSearch = foldersToSearch.filter((f) =>
          options.folders!.some(
            (of) => f.path.toLowerCase().includes(of.toLowerCase()) || f.name.toLowerCase().includes(of.toLowerCase())
          )
        )
      }

      // 각 폴더에서 검색
      for (const folder of foldersToSearch) {
        if (results.length >= limit) break

        const remainingLimit = limit - results.length
        const searchResult = await searchEmails(account.email, folder.path, query, {
          start: 1,
          limit: remainingLimit
        })

        if (searchResult.success && searchResult.emails) {
          for (const email of searchResult.emails) {
            results.push({
              accountEmail: account.email,
              folderPath: folder.path,
              folderName: folder.name,
              uid: email.uid,
              messageId: email.messageId,
              subject: email.subject,
              from: email.from,
              to: email.to,
              date: email.date,
              flags: email.flags,
              hasAttachment: email.hasAttachment
            })
          }
        }
      }
    } catch (err) {
      console.error(`Global search error for ${account.email}:`, err)
    }
  }

  // 날짜순 정렬 (최신 먼저)
  results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return {
    success: true,
    results: results.slice(0, limit),
    total: results.length
  }
}
