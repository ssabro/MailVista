// Storage Service Entry Point
// Thunderbird 스타일 하이브리드 스토리지 시스템

// Database
export { StorageDatabase, getStorageDatabase } from './database'
export type { StorageStats } from './database'

// Schema
export { initializeSchema, runMigrations, updateEmailFtsAttachments } from './schema'

// Body Storage
export { BodyStorage, getBodyStorage } from './body-storage'

// Repositories
export { FolderRepository, getFolderRepository } from './folder-repository'
export type { FolderRecord, FolderInput, FolderUpdate, FolderStats } from './folder-repository'

export { EmailRepository, getEmailRepository } from './email-repository'
export type {
  EmailRecord,
  EmailInput,
  EmailBodyUpdate,
  AttachmentRecord,
  AttachmentInput,
  EmailWithFolderInfo,
  EmailStats
} from './email-repository'

// Sync Service
export { SyncQueue, getSyncQueue } from './sync/sync-queue'
export type { SyncQueueItem, QueueEmailInfo, QueueStatus } from './sync/sync-queue'

export { SyncWorker, getSyncWorker } from './sync/sync-worker'
export type {
  AccountConfig,
  FolderInfo,
  SyncProgress,
  ProgressCallback,
  ImapConnection,
  EmailHeader
} from './sync/sync-worker'

export { SyncService, getSyncService } from './sync/sync-service'
export type { SyncSettings, SyncStatus } from './sync/sync-service'

// Operation Queue (Local-First Architecture)
export { OperationQueueService, getOperationQueue } from './sync/operation-queue'
export type {
  OperationType,
  OperationStatus,
  OperationQueueItem,
  EnqueueOperationInput,
  OperationQueueStats
} from './sync/operation-queue'

// Operation Worker (Background IMAP sync)
export { OperationWorker, getOperationWorker } from './sync/operation-worker'
export type { ImapOperationFunctions, OperationWorkerStatus } from './sync/operation-worker'

// Search Service
export { SearchService, getSearchService } from './search-service'
export type { SearchOptions, SearchResult, SearchSuggestion } from './search-service'

// =====================================================
// 통합 저장소 Repositories (Version 3)
// =====================================================

// Account Helper
export {
  getOrCreateAccountId,
  getAccountId,
  getAccountEmail,
  getAllAccounts,
  updateAccountName
} from './account-helper'

// Contacts Repository
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
  searchContactsByEmail
} from './contacts-repository'
export type { Contact, ContactGroup } from './contacts-repository'

// Filters Repository
export {
  getMailFilters,
  getEnabledFilters,
  findDuplicateFilter,
  addMailFilter,
  updateMailFilter,
  deleteMailFilter,
  toggleMailFilter,
  getFiltersUsingFolder,
  updateFiltersTargetFolder,
  deleteFiltersUsingFolder
} from './filters-repository'
export type {
  MailFilter,
  FilterCondition,
  FilterConditionField,
  FilterConditionOperator,
  FilterAction
} from './filters-repository'

// Tags Repository
export {
  getTags,
  addTag,
  updateTag,
  deleteTag,
  assignTagToEmail,
  removeTagFromEmail,
  getEmailTags,
  getTagsForEmails,
  getEmailIdsByTag
} from './tags-repository'
export type { Tag } from './tags-repository'

// VIP Repository
export {
  getVipSenders,
  addVipSender,
  removeVipSender,
  removeVipSenderById,
  isVipSender,
  toggleVipSender,
  checkVipSenders
} from './vip-repository'
export type { VipSender } from './vip-repository'

// Spam Repository
export {
  getSpamSettings,
  updateSpamSettings,
  resetSpamSettings,
  addBlockedSender,
  removeBlockedSender,
  removeBlockedSenderById,
  addBlockedDomain,
  removeBlockedDomain,
  removeBlockedDomainById,
  isEmailBlocked,
  checkBlockedEmails
} from './spam-repository'
export type { SpamSettings, BlockedSender, BlockedDomain } from './spam-repository'

// Signatures Repository
export {
  getSignatureSettings,
  updateSignatureSettings,
  resetSignatureSettings,
  addSignature,
  updateSignature,
  deleteSignature,
  setDefaultSignature,
  getDefaultSignature
} from './signatures-repository'
export type { Signature, SignatureSettings } from './signatures-repository'

// Virtual Folders Repository
export {
  getVirtualFolders,
  getVirtualFolderById,
  addVirtualFolder,
  updateVirtualFolder,
  deleteVirtualFolder
} from './virtual-folders-repository'
export type { VirtualFolder, VirtualFolderCondition } from './virtual-folders-repository'

// JSON Migration
export {
  isMigrationCompleted,
  runJsonToSqliteMigration,
  cleanupMigratedJsonFiles
} from './json-migration'

// 초기화 함수
import { getStorageDatabase } from './database'
import { getSyncQueue } from './sync/sync-queue'
import { getOperationQueue } from './sync/operation-queue'
import { runJsonToSqliteMigration } from './json-migration'

export function initializeStorage(): void {
  // 데이터베이스 초기화 (싱글톤 생성)
  getStorageDatabase()

  // JSON → SQLite 마이그레이션 실행 (최초 1회)
  runJsonToSqliteMigration()

  // 앱 시작 시 처리 중이던 동기화 항목 리셋
  getSyncQueue().resetProcessing()

  // 앱 시작 시 처리 중이던 작업 큐 항목 리셋 (Local-First)
  getOperationQueue().resetProcessing()
}

// 종료 함수
export function shutdownStorage(): void {
  const db = getStorageDatabase()
  db.close()
}
