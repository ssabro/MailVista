import { app, shell, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron'
import { stat } from 'fs/promises'
import { basename } from 'path'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  isValidEmail,
  isValidFolderPath,
  isValidUidArrayWithTemp,
  logValidationFailure,
  getAttachmentRiskLevel,
  getAttachmentRiskMessage,
  analyzeURL,
  parseAuthenticationHeaders,
  getAuthSummary
} from './security'
import {
  testMailConnection,
  saveAccount,
  getAccounts,
  getAccountWithPassword,
  deleteAccount,
  setDefaultAccount,
  hasAccounts,
  getFolders,
  getFolderInfo,
  getEmails,
  getEmailContent,
  sendEmail,
  setEmailFlags,
  deleteEmail,
  moveEmail,
  deleteBulkEmails,
  moveBulkEmails,
  searchEmails,
  searchEmailsDetailed,
  globalSearch,
  getAttachmentContent,
  DetailedSearchParams,
  createFolder,
  deleteFolder,
  getFolderEmailCount,
  renameFolder,
  getFilterRules,
  addFilterRule,
  deleteFilterRule,
  updateFilterRule,
  getAppSettings,
  updateAppSettings,
  resetAppSettings,
  getMailFilters,
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
  applySpamFilter,
  saveEmailAsEml,
  checkNewEmails,
  emptyFolder,
  clearAccountCache,
  clearAllCache,
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
  ImportedContact,
  getVipSenders,
  addVipSender,
  removeVipSender,
  isVipSender,
  toggleVipSender,
  MailFilter,
  SendEmailOptions,
  MailFilterRule,
  AppSettings,
  SignatureSettings,
  SpamSettings,
  Contact,
  getGlobalSettings,
  updateGlobalSettings,
  setPin,
  verifyPin,
  disablePin,
  isPinEnabled,
  destroyConnectionPool,
  GlobalAppSettings,
  // SQLite 저장소 관련
  searchEmailsLocal,
  searchEmailsDetailedLocal,
  hasLocalStorageData,
  setSqliteStorageEnabled
} from './mail-service'
import {
  saveTrelloCredentials,
  getTrelloCredentials,
  deleteTrelloCredentials,
  validateTrelloCredentials,
  getTrelloBoards,
  getTrelloLists,
  createTrelloCard,
  TrelloCredentials,
  TrelloCardOptions
} from './trello-service'
import { registerE2EHandlers } from './e2e-service'
import { registerEncryptionHandlers } from './encryption'
import { Notification } from 'electron'
import {
  getAISettings,
  updateAISettings,
  resetAISettings,
  setProviderCredential,
  deleteProviderCredential,
  setActiveProvider,
  toggleFeature,
  LLMProvider,
  AIFeatureId,
  AISettings
} from './llm-settings'
import {
  validateApiKey,
  summarizeEmail,
  generateSmartReply,
  convertTone,
  translateText,
  askAboutEmail,
  ToneType
} from './llm-service'
import {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate
} from './template-service'
import {
  getTags,
  createTag,
  updateTag,
  deleteTag,
  assignTagToEmail,
  removeTagFromEmail,
  getEmailTags,
  getBulkEmailTags,
  getEmailsByTag,
  getDefaultColors
} from './tag-service'
import {
  setMainWindow as setOfflineMainWindow,
  getOnlineStatus,
  setOnlineStatus,
  getOfflineSettings,
  updateOfflineSettings,
  cacheEmails,
  cacheEmailContent,
  getCachedEmails,
  getCachedEmailContent,
  cacheFolderList,
  getCachedFolderList,
  addPendingEmail,
  getPendingEmails,
  removePendingEmail,
  getCacheSize,
  clearCache,
  getCacheStatus
} from './offline-service'
import {
  getVirtualFolders,
  createVirtualFolder,
  updateVirtualFolder,
  deleteVirtualFolder,
  buildSearchQuery,
  matchesVirtualFolder,
  getDefaultIcons as getVirtualFolderIcons,
  getDefaultColors as getVirtualFolderColors
} from './virtual-folder-service'
import { logger, LogCategory, LogLevel, LogFilter } from './logger'
import {
  getCloudStorageSettings,
  updateCloudStorageSettings,
  detectCloudProvider,
  isCloudProviderConnected,
  startGoogleAuth,
  uploadLargeFile,
  uploadMultipleLargeFiles,
  removeCloudCredentials,
  getCloudCredentials,
  needsCloudUpload,
  formatFileSize,
  CloudProvider
} from './cloud-storage-service'
import {
  startGoogleOAuth,
  startGoogleOAuthWithEmbeddedCredentials,
  startMicrosoftOAuth,
  getOAuthTokens,
  deleteOAuthTokens,
  isOAuthAccount,
  getXOAuth2Token,
  getOAuthProvider,
  getOAuthServerConfig,
  saveOAuthConfig,
  getOAuthConfig,
  hasEmbeddedOAuthCredentials
} from './oauth-service'
import {
  initializeStorage,
  shutdownStorage,
  getStorageDatabase,
  getSearchService,
  getSyncService,
  SearchOptions,
  // Local-First Architecture
  getOperationQueue,
  getEmailRepository,
  getFolderRepository,
  getOperationWorker,
  getBodyStorage
} from './storage'
import { debugString } from './utils/encoding'
import { simpleParser } from 'mailparser'
import { initAutoUpdater, registerUpdateHandlers } from './auto-updater'

// 전역 mainWindow 참조 (Operation Worker에서 사용)
let mainWindow: BrowserWindow | null = null

// 시스템 트레이 참조
let tray: Tray | null = null

// 앱 종료 중 플래그 (트레이 최소화와 실제 종료 구분용)
let isAppQuitting = false

// 시스템 트레이 초기화
function initializeTray(): void {
  if (tray) return // 이미 초기화됨

  const trayIcon = nativeImage.createFromPath(icon)
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'MailVista 열기',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setToolTip('MailVista')
  tray.setContextMenu(contextMenu)

  // 트레이 아이콘 클릭 시 창 표시
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow.show()
      }
    }
  })
}

// 트레이로 최소화 설정 적용
function setupMinimizeToTray(window: BrowserWindow): void {
  const globalSettings = getGlobalSettings()

  // 초기 설정에서 트레이 활성화된 경우 트레이 초기화
  if (globalSettings.startup.minimizeToTray) {
    initializeTray()
  }

  // 닫기 버튼 클릭 시 트레이로 최소화 (항상 핸들러 등록, 설정은 동적으로 체크)
  window.on('close', (event) => {
    const settings = getGlobalSettings()
    if (settings.startup.minimizeToTray && !isAppQuitting) {
      event.preventDefault()
      window.hide()
    }
  })
}

function createWindow(): BrowserWindow {
  // Create the browser window.
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'MailVista',
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  window.on('ready-to-show', () => {
    window.show()
    // 개발 모드에서는 개발자 도구 자동 열기
    if (is.dev) {
      window.webContents.openDevTools()
    }
  })

  // 오프라인 서비스에 메인 윈도우 설정
  setOfflineMainWindow(window)

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

// 전역 오류 핸들러 - 처리되지 않은 예외로 인한 앱 크래시 방지
process.on('uncaughtException', (error) => {
  logger.error(LogCategory.ERROR, 'Uncaught exception', {
    message: error.message,
    stack: error.stack,
    name: error.name
  })
  // ECONNRESET 등 네트워크 오류는 무시하고 계속 실행
  if (
    error.message.includes('ECONNRESET') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('ENOTFOUND') ||
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('socket hang up')
  ) {
    console.error('[Network Error - Recovered]', error.message)
    return
  }
  console.error('[Uncaught Exception]', error)
})

process.on('unhandledRejection', (reason, promise) => {
  const errorMessage = reason instanceof Error ? reason.message : String(reason)
  logger.error(LogCategory.ERROR, 'Unhandled rejection', {
    reason: errorMessage,
    promise: String(promise)
  })
  // 네트워크 오류는 무시
  if (
    errorMessage.includes('ECONNRESET') ||
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('ENOTFOUND') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('socket hang up')
  ) {
    console.error('[Network Error - Recovered]', errorMessage)
    return
  }
  console.error('[Unhandled Rejection]', reason)
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  logger.info(LogCategory.APP, 'Application starting', {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version
  })

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // E2E Encryption handlers
  registerE2EHandlers()

  // PGP and S/MIME encryption handlers
  registerEncryptionHandlers()

  // Auto-update handlers
  registerUpdateHandlers()

  // Account management IPC handlers
  ipcMain.handle('test-mail-connection', async (_event, config) => {
    return await testMailConnection(config)
  })

  ipcMain.handle('save-account', async (_event, config) => {
    return saveAccount(config)
  })

  ipcMain.handle('get-accounts', async () => {
    return getAccounts()
  })

  ipcMain.handle('get-account-with-password', async (_event, email: string) => {
    return getAccountWithPassword(email)
  })

  ipcMain.handle('delete-account', async (_event, email: string) => {
    if (!isValidEmail(email)) {
      logValidationFailure('delete-account', 'email', email)
      return { success: false, error: 'Invalid email format' }
    }
    return deleteAccount(email)
  })

  ipcMain.handle('set-default-account', async (_event, email: string) => {
    if (!isValidEmail(email)) {
      logValidationFailure('set-default-account', 'email', email)
      return { success: false, error: 'Invalid email format' }
    }
    return setDefaultAccount(email)
  })

  ipcMain.handle('has-accounts', async () => {
    return hasAccounts()
  })

  // Email fetching IPC handlers
  ipcMain.handle('get-folders', async (_event, email: string) => {
    return await getFolders(email)
  })

  // Local-First: 로컬 DB에서 폴더 목록 조회
  ipcMain.handle('get-folders-local', async (_event, email: string) => {
    try {
      const folderRepository = getFolderRepository()
      const accountId = folderRepository.getAccountIdByEmail(email)

      if (!accountId) {
        console.log(`[get-folders-local] Account not found for ${email}`)
        return { success: false, folders: [], error: 'Account not found' }
      }

      const folderRecords = folderRepository.getByAccountId(accountId)

      if (folderRecords.length === 0) {
        console.log(`[get-folders-local] No folders in local DB for ${email}`)
        return { success: false, folders: [], error: 'No folders in local DB' }
      }

      // FolderRecord를 프론트엔드 폴더 형식으로 변환
      const folders = folderRecords.map((record) => ({
        name: record.name,
        path: record.path,
        delimiter: record.delimiter || '/',
        specialUse: record.special_use,
        children: [] as {
          name: string
          path: string
          delimiter: string
          specialUse: string | null
          children: unknown[]
        }[]
      }))

      // 계층 구조로 변환 (delimiter 기반)
      const rootFolders: typeof folders = []
      const folderMap = new Map<string, (typeof folders)[0]>()

      // 먼저 모든 폴더를 맵에 등록
      for (const folder of folders) {
        folderMap.set(folder.path, folder)
      }

      // 계층 구조 구성
      for (const folder of folders) {
        const delimiter = folder.delimiter
        const parts = folder.path.split(delimiter)

        if (parts.length === 1) {
          // 루트 레벨 폴더
          rootFolders.push(folder)
        } else {
          // 부모 경로 찾기
          const parentPath = parts.slice(0, -1).join(delimiter)
          const parent = folderMap.get(parentPath)
          if (parent) {
            parent.children.push(folder)
          } else {
            // 부모가 없으면 루트로
            rootFolders.push(folder)
          }
        }
      }

      console.log(`[get-folders-local] Returning ${folderRecords.length} folders from local DB`)
      return { success: true, folders: rootFolders }
    } catch (error) {
      console.error('[get-folders-local] Error:', error)
      return { success: false, folders: [], error: String(error) }
    }
  })

  ipcMain.handle('get-folder-info', async (_event, email: string, folderPath: string) => {
    return await getFolderInfo(email, folderPath)
  })

  // Local-First: 로컬 DB에서 폴더 정보 조회
  ipcMain.handle('get-folder-info-local', async (_event, email: string, folderPath: string) => {
    try {
      const emailRepository = getEmailRepository()
      const folderRepository = getFolderRepository()

      // 폴더 ID 조회 (이메일 주소로 조회)
      const folder = folderRepository.getByEmailAndPath(email, folderPath)
      if (!folder) {
        console.log(`[get-folder-info-local] Folder not found: ${folderPath} for ${email}`)
        return { success: false, error: 'Folder not found', total: 0, unseen: 0 }
      }

      // 로컬 DB에서 개수 계산
      const total = emailRepository.getCountExcludeDeleted(folder.id)
      const unseen = emailRepository.getUnreadCountExcludeDeleted(folder.id)

      console.log(`[get-folder-info-local] ${folderPath}: total=${total}, unseen=${unseen}`)
      return { success: true, total, unseen }
    } catch (error) {
      console.error('[get-folder-info-local] Error:', error)
      return { success: false, error: String(error), total: 0, unseen: 0 }
    }
  })

  ipcMain.handle(
    'get-emails',
    async (
      _event,
      email: string,
      folderPath: string,
      options?: { start?: number; limit?: number; unreadOnly?: boolean }
    ) => {
      return await getEmails(email, folderPath, options)
    }
  )

  // Local-First: 로컬 DB에서 메일 목록 조회
  ipcMain.handle(
    'get-emails-local',
    async (
      _event,
      email: string,
      folderPath: string,
      options?: { start?: number; limit?: number; unreadOnly?: boolean }
    ) => {
      try {
        const { start = 1, limit = 20, unreadOnly = false } = options || {}
        const offset = start - 1 // start는 1부터, offset은 0부터

        const emailRepository = getEmailRepository()
        const folderRepository = getFolderRepository()

        // 폴더 ID 조회 (이메일 주소로 조회)
        const folder = folderRepository.getByEmailAndPath(email, folderPath)
        if (!folder) {
          console.log(`[get-emails-local] Folder not found: ${folderPath} for ${email}`)
          return { success: false, error: 'Folder not found', emails: [], total: 0 }
        }

        // 로컬 DB에서 메일 조회 (안읽은 메일만 필터링 옵션)
        const emailRecords = emailRepository.getByFolderIdExcludeDeleted(folder.id, {
          offset,
          limit,
          orderBy: 'date',
          unreadOnly
        })
        // 안읽은 메일만 보기일 때는 안읽은 메일 개수, 아니면 전체 개수
        const total = unreadOnly
          ? emailRepository.getUnreadCountExcludeDeleted(folder.id)
          : emailRepository.getCountExcludeDeleted(folder.id)

        // EmailRecord를 EmailHeader 형식으로 변환
        const emails = emailRecords.map((record) => ({
          uid: record.uid,
          messageId: record.message_id,
          subject: record.subject,
          from: record.from_address
            ? [{ name: record.from_name || '', address: record.from_address }]
            : [],
          to: JSON.parse(record.to_addresses || '[]'),
          cc: JSON.parse(record.cc_addresses || '[]'),
          date: record.date,
          flags: JSON.parse(record.flags || '[]'),
          hasAttachment: record.has_attachment === 1,
          size: record.size || 0
        }))

        // 디버깅: 첫 번째 이메일의 flags 확인
        if (emails.length > 0 && unreadOnly) {
          console.log(
            `[get-emails-local] unreadOnly=${unreadOnly}, first email flags:`,
            emails[0].flags
          )
          console.log(`[get-emails-local] first email raw flags from DB:`, emailRecords[0].flags)
        }
        console.log(
          `[get-emails-local] Returning ${emails.length} emails from local DB (total: ${total})`
        )
        return { success: true, emails, total }
      } catch (error) {
        console.error('[get-emails-local] Error:', error)
        return { success: false, error: String(error), emails: [], total: 0 }
      }
    }
  )

  ipcMain.handle(
    'get-email-content',
    async (_event, email: string, folderPath: string, uid: number) => {
      return await getEmailContent(email, folderPath, uid)
    }
  )

  // Local-First: 로컬 캐시에서 이메일 본문 조회
  ipcMain.handle(
    'get-email-content-local',
    async (_event, email: string, folderPath: string, uid: number) => {
      try {
        const emailRepository = getEmailRepository()
        const folderRepository = getFolderRepository()
        const bodyStorage = getBodyStorage()

        // 폴더 ID 조회 (이메일 주소로 조회)
        const folder = folderRepository.getByEmailAndPath(email, folderPath)
        if (!folder) {
          console.log(`[get-email-content-local] Folder not found: ${folderPath} for ${email}`)
          return { success: false, error: 'Folder not found' }
        }

        // 이메일 레코드 조회
        const emailRecord = emailRepository.getByUid(folder.id, uid)
        if (!emailRecord) {
          console.log(`[get-email-content-local] Email not found: uid=${uid}`)
          return { success: false, error: 'Email not found' }
        }

        // body_path가 없으면 캐시되지 않은 것
        if (!emailRecord.body_path) {
          console.log(`[get-email-content-local] Body not cached for uid=${uid}`)
          return { success: false, error: 'Body not cached' }
        }

        // 로컬 캐시에서 본문 가져오기
        const emlBuffer = await bodyStorage.getBodyBufferByPath(emailRecord.body_path)
        if (!emlBuffer) {
          console.log(`[get-email-content-local] Body file not found: ${emailRecord.body_path}`)
          return { success: false, error: 'Body file not found' }
        }

        // EML 파싱
        const parsed = await simpleParser(emlBuffer)

        // AddressObject에서 value 배열 추출하는 헬퍼
        const getAddresses = (addr: unknown): { name?: string; address?: string }[] => {
          if (!addr) return []
          if (Array.isArray(addr)) {
            return addr.flatMap(
              (a) => (a as { value?: { name?: string; address?: string }[] }).value || []
            )
          }
          return (addr as { value?: { name?: string; address?: string }[] }).value || []
        }

        // EmailFull 형식으로 변환
        const emailFull = {
          id: emailRecord.id,
          uid: emailRecord.uid,
          messageId: parsed.messageId || emailRecord.message_id,
          subject: parsed.subject || emailRecord.subject || '',
          from: getAddresses(parsed.from),
          to: getAddresses(parsed.to),
          cc: getAddresses(parsed.cc),
          bcc: getAddresses(parsed.bcc),
          date: parsed.date?.toISOString() || new Date(emailRecord.date || 0).toISOString(),
          flags: JSON.parse(emailRecord.flags || '[]'),
          text: parsed.text || '',
          html: parsed.html || '',
          attachments: (parsed.attachments || []).map((att) => ({
            filename: att.filename || 'attachment',
            contentType: att.contentType || 'application/octet-stream',
            size: att.size || 0,
            contentId: att.contentId || undefined,
            content: att.content ? att.content.toString('base64') : ''
          }))
        }

        console.log(`[get-email-content-local] Loaded from cache: uid=${uid}`)
        return { success: true, email: emailFull }
      } catch (error) {
        console.error('[get-email-content-local] Error:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  // Email actions IPC handlers
  ipcMain.handle('send-email', async (_event, email: string, options: SendEmailOptions) => {
    return await sendEmail(email, options)
  })

  // ============================================
  // Local-First Email Operations
  // 로컬 DB 즉시 업데이트 후 백그라운드 IMAP 동기화
  // ============================================

  ipcMain.handle(
    'set-email-flags',
    async (
      _event,
      email: string,
      folderPath: string,
      uid: number,
      flags: string[],
      add: boolean
    ) => {
      try {
        const folderRepo = getFolderRepository()
        const emailRepo = getEmailRepository()
        const operationQueue = getOperationQueue()

        // 폴더 조회
        const folder = folderRepo.getByEmailAndPath(email, folderPath)
        if (!folder) {
          // 폴더가 로컬 DB에 없으면 기존 방식 사용 (fallback)
          return await setEmailFlags(email, folderPath, uid, flags, add)
        }

        // 원본 플래그 저장 (롤백용)
        const emailRecord = emailRepo.getByUid(folder.id, uid)
        const originalFlags = emailRecord?.flags ? JSON.parse(emailRecord.flags) : []

        // 로컬 DB 즉시 업데이트
        for (const flag of flags) {
          if (add) {
            emailRepo.addFlagByUid(folder.id, uid, flag)
          } else {
            emailRepo.removeFlagByUid(folder.id, uid, flag)
          }
        }

        // 읽음/안읽음 플래그 처리 시 unread_count 업데이트
        if (flags.includes('\\Seen')) {
          folderRepo.incrementUnreadCount(folder.id, add ? -1 : 1)
        }

        // 작업 큐에 추가
        operationQueue.enqueue({
          accountEmail: email,
          operationType: add ? 'flag_add' : 'flag_remove',
          folderPath: folderPath,
          uids: [uid],
          flags: flags,
          originalData: { originalFlags }
        })

        return { success: true, queued: true }
      } catch (error) {
        logger.error(LogCategory.ERROR, 'Local-First flag operation failed', {
          error: error instanceof Error ? error.message : String(error)
        })
        // 실패 시 기존 방식 fallback
        return await setEmailFlags(email, folderPath, uid, flags, add)
      }
    }
  )

  ipcMain.handle(
    'delete-email',
    async (_event, email: string, folderPath: string, uid: number, permanent?: boolean) => {
      try {
        const folderRepo = getFolderRepository()
        const emailRepo = getEmailRepository()
        const operationQueue = getOperationQueue()

        // 폴더 조회
        const folder = folderRepo.getByEmailAndPath(email, folderPath)
        if (!folder) {
          // 폴더가 로컬 DB에 없으면 기존 방식 사용 (fallback)
          return await deleteEmail(email, folderPath, uid, permanent)
        }

        // 로컬 DB 즉시 삭제 표시
        emailRepo.markAsDeleted(folder.id, [uid])

        // 폴더 카운트 업데이트
        folderRepo.recalculateCounts(folder.id)

        // 작업 큐에 추가
        operationQueue.enqueue({
          accountEmail: email,
          operationType: permanent ? 'delete_permanent' : 'delete_trash',
          folderPath: folderPath,
          uids: [uid]
        })

        return { success: true, queued: true }
      } catch (error) {
        logger.error(LogCategory.ERROR, 'Local-First delete operation failed', {
          error: error instanceof Error ? error.message : String(error)
        })
        // 실패 시 기존 방식 fallback
        return await deleteEmail(email, folderPath, uid, permanent)
      }
    }
  )

  ipcMain.handle(
    'move-email',
    async (_event, email: string, fromFolder: string, toFolder: string, uid: number) => {
      try {
        const folderRepo = getFolderRepository()
        const emailRepo = getEmailRepository()
        const operationQueue = getOperationQueue()

        // 폴더 조회
        const fromFolderRecord = folderRepo.getByEmailAndPath(email, fromFolder)
        const toFolderRecord = folderRepo.getByEmailAndPath(email, toFolder)

        if (!fromFolderRecord || !toFolderRecord) {
          // 폴더가 로컬 DB에 없으면 기존 방식 사용 (fallback)
          return await moveEmail(email, fromFolder, toFolder, uid)
        }

        // 원본 이메일 정보 저장 (롤백용)
        const originalEmail = emailRepo.getByUid(fromFolderRecord.id, uid)
        const originalData = originalEmail
          ? {
              emailId: originalEmail.id,
              originalFolderId: fromFolderRecord.id,
              originalUid: uid
            }
          : undefined

        // 로컬 DB 즉시 이동
        emailRepo.moveToFolder(fromFolderRecord.id, toFolderRecord.id, [uid])

        // 양쪽 폴더 카운트 업데이트
        folderRepo.recalculateCounts(fromFolderRecord.id)
        folderRepo.recalculateCounts(toFolderRecord.id)

        // 작업 큐에 추가
        operationQueue.enqueue({
          accountEmail: email,
          operationType: 'move',
          folderPath: fromFolder,
          targetFolder: toFolder,
          uids: [uid],
          originalData: originalData
        })

        return { success: true, queued: true }
      } catch (error) {
        logger.error(LogCategory.ERROR, 'Local-First move operation failed', {
          error: error instanceof Error ? error.message : String(error)
        })
        // 실패 시 기존 방식 fallback
        return await moveEmail(email, fromFolder, toFolder, uid)
      }
    }
  )

  // 벌크 삭제 (성능 최적화) - Local-First
  ipcMain.handle(
    'delete-bulk-emails',
    async (_event, email: string, folderPath: string, uids: number[], permanent?: boolean) => {
      // 입력값 검증
      if (!isValidEmail(email)) {
        logValidationFailure('delete-bulk-emails', 'email', email)
        return { success: false, error: 'Invalid email format' }
      }
      if (!isValidFolderPath(folderPath)) {
        logValidationFailure('delete-bulk-emails', 'folderPath', folderPath)
        return { success: false, error: 'Invalid folder path' }
      }
      // 음수 UID 허용 (로컬에서 이동된 이메일의 임시 UID)
      if (!isValidUidArrayWithTemp(uids)) {
        logValidationFailure('delete-bulk-emails', 'uids', uids)
        return { success: false, error: 'Invalid UIDs' }
      }

      try {
        const folderRepo = getFolderRepository()
        const emailRepo = getEmailRepository()
        const operationQueue = getOperationQueue()

        // 폴더 조회
        const folder = folderRepo.getByEmailAndPath(email, folderPath)
        if (!folder) {
          // 폴더가 로컬 DB에 없으면 기존 방식 사용 (fallback)
          // 음수 UID는 로컬 전용이므로 양수 UID만 서버로 전송
          const serverUids = uids.filter((uid) => uid > 0)
          if (serverUids.length === 0) {
            return { success: true, count: 0 }
          }
          return await deleteBulkEmails(email, folderPath, serverUids, permanent)
        }

        // UID를 양수(서버)와 음수(로컬 임시)로 분리
        const serverUids = uids.filter((uid) => uid > 0)
        const localTempUids = uids.filter((uid) => uid < 0)

        // 서버 UID: 삭제 표시 후 큐에 추가
        if (serverUids.length > 0) {
          emailRepo.markAsDeleted(folder.id, serverUids)

          // 작업 큐에 추가 (서버 UID만)
          operationQueue.enqueue({
            accountEmail: email,
            operationType: permanent ? 'delete_permanent' : 'delete_trash',
            folderPath: folderPath,
            uids: serverUids
          })
        }

        // 로컬 임시 UID: 로컬 DB에서 직접 삭제 (서버에 없으므로 큐 불필요)
        if (localTempUids.length > 0) {
          // 임시 UID를 가진 이메일은 아직 서버에 없으므로 로컬에서만 삭제
          emailRepo.markAsDeleted(folder.id, localTempUids)
          console.log(`[delete-bulk-emails] Deleted ${localTempUids.length} local temp emails (negative UIDs)`)
        }

        // 폴더 카운트 업데이트
        folderRepo.recalculateCounts(folder.id)

        return { success: true, queued: serverUids.length > 0, count: uids.length }
      } catch (error) {
        logger.error(LogCategory.ERROR, 'Local-First bulk delete operation failed', {
          error: error instanceof Error ? error.message : String(error)
        })
        // 실패 시 기존 방식 fallback (양수 UID만)
        const serverUids = uids.filter((uid) => uid > 0)
        if (serverUids.length === 0) {
          return { success: false, error: error instanceof Error ? error.message : String(error) }
        }
        return await deleteBulkEmails(email, folderPath, serverUids, permanent)
      }
    }
  )

  // 벌크 이동 (성능 최적화) - Local-First
  ipcMain.handle(
    'move-bulk-emails',
    async (_event, email: string, fromFolder: string, toFolder: string, uids: number[]) => {
      // 디버그: IPC로 수신한 폴더 경로 값 확인
      console.log(`[move-bulk-emails] Received - fromFolder: "${fromFolder}", toFolder: "${toFolder}"`)
      console.log('[move-bulk-emails] toFolder debug:', debugString(toFolder))

      try {
        const folderRepo = getFolderRepository()
        const emailRepo = getEmailRepository()
        const operationQueue = getOperationQueue()

        // 폴더 조회
        const fromFolderRecord = folderRepo.getByEmailAndPath(email, fromFolder)
        const toFolderRecord = folderRepo.getByEmailAndPath(email, toFolder)
        console.log(`[move-bulk-emails] Folder lookup - from: ${fromFolderRecord?.id || 'null'}, to: ${toFolderRecord?.id || 'null'}`)

        // SQLite에 저장된 폴더 목록도 확인
        if (!toFolderRecord) {
          const accountId = folderRepo.getAccountIdByEmail(email)
          if (accountId) {
            const allFolders = folderRepo.getByAccountId(accountId)
            console.log(`[move-bulk-emails] Available folders in DB:`, allFolders.map(f => ({ name: f.name, path: f.path })))
          }
        }

        if (!fromFolderRecord || !toFolderRecord) {
          // 폴더가 로컬 DB에 없으면 기존 방식 사용 (fallback)
          console.log(`[move-bulk-emails] Falling back to direct IMAP move`)
          return await moveBulkEmails(email, fromFolder, toFolder, uids)
        }

        // 원본 이메일 정보들 저장 (롤백용)
        const originalEmails = emailRepo.getByUids(fromFolderRecord.id, uids)
        const originalData = {
          emailIds: originalEmails.map((e) => e.id),
          originalFolderId: fromFolderRecord.id,
          originalUids: originalEmails.map((e) => e.uid)
        }

        // 로컬 DB 즉시 이동
        emailRepo.moveToFolder(fromFolderRecord.id, toFolderRecord.id, uids)

        // 양쪽 폴더 카운트 업데이트
        folderRepo.recalculateCounts(fromFolderRecord.id)
        folderRepo.recalculateCounts(toFolderRecord.id)

        // 작업 큐에 추가
        operationQueue.enqueue({
          accountEmail: email,
          operationType: 'move',
          folderPath: fromFolder,
          targetFolder: toFolder,
          uids: uids,
          originalData: originalData
        })

        return { success: true, queued: true, count: uids.length }
      } catch (error) {
        logger.error(LogCategory.ERROR, 'Local-First bulk move operation failed', {
          error: error instanceof Error ? error.message : String(error)
        })
        // 실패 시 기존 방식 fallback
        return await moveBulkEmails(email, fromFolder, toFolder, uids)
      }
    }
  )

  ipcMain.handle(
    'search-emails',
    async (
      _event,
      email: string,
      folderPath: string,
      query: string,
      options?: { start?: number; limit?: number }
    ) => {
      return await searchEmails(email, folderPath, query, options)
    }
  )

  // 상세 검색
  ipcMain.handle(
    'search-emails-detailed',
    async (
      _event,
      email: string,
      params: DetailedSearchParams,
      options?: { start?: number; limit?: number }
    ) => {
      return await searchEmailsDetailed(email, params, options)
    }
  )

  // 전역 검색 (모든 폴더/계정)
  ipcMain.handle(
    'global-search',
    async (
      _event,
      query: string,
      options?: {
        accounts?: string[]
        folders?: string[]
        limit?: number
        includeTrash?: boolean
        includeSpam?: boolean
      }
    ) => {
      return await globalSearch(query, options)
    }
  )

  ipcMain.handle(
    'get-attachment-content',
    async (_event, email: string, folderPath: string, uid: number, partId: string) => {
      return await getAttachmentContent(email, folderPath, uid, partId)
    }
  )

  ipcMain.handle(
    'create-folder',
    async (_event, email: string, folderName: string, parentFolder?: string) => {
      return await createFolder(email, folderName, parentFolder)
    }
  )

  ipcMain.handle(
    'delete-folder',
    async (_event, email: string, folderPath: string, moveEmailsTo?: string) => {
      return await deleteFolder(email, folderPath, moveEmailsTo)
    }
  )

  ipcMain.handle(
    'get-folder-email-count',
    async (_event, email: string, folderPath: string) => {
      return await getFolderEmailCount(email, folderPath)
    }
  )

  ipcMain.handle(
    'rename-folder',
    async (_event, email: string, oldPath: string, newPath: string) => {
      return await renameFolder(email, oldPath, newPath)
    }
  )

  // Filter rules IPC handlers
  ipcMain.handle('get-filter-rules', async (_event, email?: string) => {
    return getFilterRules(email)
  })

  ipcMain.handle(
    'add-filter-rule',
    async (_event, rule: Omit<MailFilterRule, 'id' | 'createdAt'>) => {
      return addFilterRule(rule)
    }
  )

  ipcMain.handle('delete-filter-rule', async (_event, ruleId: string) => {
    return deleteFilterRule(ruleId)
  })

  ipcMain.handle(
    'update-filter-rule',
    async (_event, ruleId: string, updates: Partial<MailFilterRule>) => {
      return updateFilterRule(ruleId, updates)
    }
  )

  // App settings IPC handlers (계정별 분리)
  ipcMain.handle('get-app-settings', async (_event, accountEmail: string) => {
    return getAppSettings(accountEmail)
  })

  ipcMain.handle(
    'update-app-settings',
    async (_event, accountEmail: string, updates: Partial<AppSettings>) => {
      return updateAppSettings(accountEmail, updates)
    }
  )

  ipcMain.handle('reset-app-settings', async (_event, accountEmail: string) => {
    return resetAppSettings(accountEmail)
  })

  // 외부 URL 열기 (보안: http/https만 허용)
  ipcMain.handle('open-external', async (_event, url: string) => {
    try {
      // URL 검증: http/https 프로토콜만 허용
      const parsedUrl = new URL(url)
      const allowedProtocols = ['http:', 'https:', 'mailto:']

      if (!allowedProtocols.includes(parsedUrl.protocol)) {
        logger.warn(LogCategory.SECURITY, 'Blocked unsafe URL protocol', {
          url,
          protocol: parsedUrl.protocol
        })
        return {
          success: false,
          error: `Unsafe protocol: ${parsedUrl.protocol}. Only http, https, and mailto are allowed.`
        }
      }

      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      console.error('[Main] Failed to open external URL:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // Mail filter IPC handlers (계정별 분리)
  ipcMain.handle('get-mail-filters', async (_event, accountEmail: string) => {
    console.log('[IPC:get-mail-filters] accountEmail:', accountEmail)
    const result = getMailFilters(accountEmail)
    console.log('[IPC:get-mail-filters] result count:', result.length)
    return result
  })

  ipcMain.handle(
    'add-mail-filter',
    async (_event, accountEmail: string, filter: Omit<MailFilter, 'id' | 'createdAt'>) => {
      console.log('[IPC:add-mail-filter] === START ===')
      console.log('[IPC:add-mail-filter] accountEmail:', accountEmail)
      console.log('[IPC:add-mail-filter] filter:', JSON.stringify(filter, null, 2))
      const result = addMailFilter(accountEmail, filter)
      console.log('[IPC:add-mail-filter] result:', JSON.stringify(result, null, 2))
      console.log('[IPC:add-mail-filter] === END ===')
      return result
    }
  )

  ipcMain.handle(
    'update-mail-filter',
    async (
      _event,
      accountEmail: string,
      id: string,
      updates: Partial<Omit<MailFilter, 'id' | 'createdAt'>>
    ) => {
      return updateMailFilter(accountEmail, id, updates)
    }
  )

  ipcMain.handle('delete-mail-filter', async (_event, accountEmail: string, id: string) => {
    return deleteMailFilter(accountEmail, id)
  })

  ipcMain.handle('toggle-mail-filter', async (_event, accountEmail: string, id: string) => {
    return toggleMailFilter(accountEmail, id)
  })

  ipcMain.handle(
    'get-filters-using-folder',
    async (_event, accountEmail: string, folderPath: string) => {
      return getFiltersUsingFolder(accountEmail, folderPath)
    }
  )

  ipcMain.handle(
    'update-filters-target-folder',
    async (_event, accountEmail: string, oldPath: string, newPath: string) => {
      return updateFiltersTargetFolder(accountEmail, oldPath, newPath)
    }
  )

  ipcMain.handle(
    'delete-filters-using-folder',
    async (_event, accountEmail: string, folderPath: string) => {
      return deleteFiltersUsingFolder(accountEmail, folderPath)
    }
  )

  // 서명 설정 관련 (계정별 분리)
  ipcMain.handle('get-signature-settings', async (_event, accountEmail: string) => {
    return getSignatureSettings(accountEmail)
  })

  ipcMain.handle(
    'update-signature-settings',
    async (_event, accountEmail: string, updates: Partial<SignatureSettings>) => {
      return updateSignatureSettings(accountEmail, updates)
    }
  )

  ipcMain.handle('reset-signature-settings', async (_event, accountEmail: string) => {
    return resetSignatureSettings(accountEmail)
  })

  ipcMain.handle('get-default-signature', async (_event, accountEmail: string) => {
    return getDefaultSignature(accountEmail)
  })

  // 스팸 설정 관련 (계정별 분리)
  ipcMain.handle('get-spam-settings', async (_event, accountEmail: string) => {
    return getSpamSettings(accountEmail)
  })

  ipcMain.handle(
    'update-spam-settings',
    async (_event, accountEmail: string, updates: Partial<SpamSettings>) => {
      return updateSpamSettings(accountEmail, updates)
    }
  )

  ipcMain.handle('reset-spam-settings', async (_event, accountEmail: string) => {
    return resetSpamSettings(accountEmail)
  })

  ipcMain.handle('apply-spam-filter', async (_event, accountEmail: string) => {
    return applySpamFilter(accountEmail)
  })

  // EML 파일로 저장
  ipcMain.handle(
    'save-email-as-eml',
    async (_event, email: string, folderPath: string, uid: number, subject: string) => {
      return await saveEmailAsEml(email, folderPath, uid, subject)
    }
  )

  // 새 메일 체크 (폴링용)
  ipcMain.handle('check-new-emails', async (_event, email: string, folderPath?: string) => {
    return await checkNewEmails(email, folderPath)
  })

  // 폴더 비우기 (휴지통, 스팸메일함 등)
  ipcMain.handle('empty-folder', async (_event, email: string, folderPath: string) => {
    if (!isValidEmail(email)) {
      logValidationFailure('empty-folder', 'email', email)
      return { success: false, error: 'Invalid email format' }
    }
    if (!isValidFolderPath(folderPath)) {
      logValidationFailure('empty-folder', 'folderPath', folderPath)
      return { success: false, error: 'Invalid folder path' }
    }
    return await emptyFolder(email, folderPath)
  })

  // 캐시 관리
  ipcMain.handle('clear-account-cache', async (_event, email: string) => {
    clearAccountCache(email)
    return { success: true }
  })

  ipcMain.handle('clear-all-cache', async () => {
    clearAllCache()
    return { success: true }
  })

  // 주소록 - 연락처 관리 (계정별 분리)
  ipcMain.handle(
    'get-contacts',
    async (
      _event,
      accountEmail: string,
      options?: {
        groupId?: string
        starred?: boolean
        search?: string
        sortBy?: 'name' | 'email' | 'organization' | 'createdAt'
        sortOrder?: 'asc' | 'desc'
        start?: number
        limit?: number
      }
    ) => {
      return getContacts(accountEmail, options)
    }
  )

  ipcMain.handle(
    'add-contact',
    async (
      _event,
      accountEmail: string,
      contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>
    ) => {
      return addContact(accountEmail, contact)
    }
  )

  ipcMain.handle(
    'update-contact',
    async (
      _event,
      accountEmail: string,
      id: string,
      updates: Partial<Omit<Contact, 'id' | 'createdAt'>>
    ) => {
      return updateContact(accountEmail, id, updates)
    }
  )

  ipcMain.handle('delete-contact', async (_event, accountEmail: string, id: string) => {
    return deleteContact(accountEmail, id)
  })

  ipcMain.handle('delete-contacts', async (_event, accountEmail: string, ids: string[]) => {
    return deleteContacts(accountEmail, ids)
  })

  ipcMain.handle('toggle-contact-star', async (_event, accountEmail: string, id: string) => {
    return toggleContactStar(accountEmail, id)
  })

  ipcMain.handle(
    'move-contacts-to-group',
    async (_event, accountEmail: string, contactIds: string[], groupId: string | null) => {
      return moveContactsToGroup(accountEmail, contactIds, groupId)
    }
  )

  // 주소록 - 그룹 관리 (계정별 분리)
  ipcMain.handle('get-contact-groups', async (_event, accountEmail: string) => {
    return getContactGroups(accountEmail)
  })

  ipcMain.handle(
    'add-contact-group',
    async (_event, accountEmail: string, name: string, parentId?: string) => {
      return addContactGroup(accountEmail, name, parentId)
    }
  )

  ipcMain.handle(
    'update-contact-group',
    async (_event, accountEmail: string, id: string, name: string) => {
      return updateContactGroup(accountEmail, id, name)
    }
  )

  ipcMain.handle('delete-contact-group', async (_event, accountEmail: string, id: string) => {
    return deleteContactGroup(accountEmail, id)
  })

  ipcMain.handle('get-contact-count-by-group', async (_event, accountEmail: string) => {
    return getContactCountByGroup(accountEmail)
  })

  ipcMain.handle(
    'search-contacts-by-email',
    async (_event, accountEmail: string, query: string, limit?: number) => {
      return searchContactsByEmail(accountEmail, query, limit)
    }
  )

  // 연락처 가져오기/내보내기
  ipcMain.handle('parse-contacts-file', async (_event, filePath: string) => {
    return parseContactsFile(filePath)
  })

  ipcMain.handle(
    'validate-imported-contacts',
    async (_event, accountEmail: string, contacts: ImportedContact[]) => {
      return validateImportedContacts(accountEmail, contacts)
    }
  )

  ipcMain.handle(
    'import-contacts',
    async (
      _event,
      accountEmail: string,
      contacts: ImportedContact[],
      duplicateAction: 'skip' | 'update' | 'add_all'
    ) => {
      return importContacts(accountEmail, contacts, duplicateAction)
    }
  )

  ipcMain.handle(
    'export-contacts',
    async (
      _event,
      accountEmail: string,
      format: 'xlsx' | 'csv',
      options?: { groupId?: string; starred?: boolean }
    ) => {
      const result = await exportContacts(accountEmail, format, options)
      if (result.success && result.data && result.filename) {
        // 파일 저장 다이얼로그
        const { dialog } = await import('electron')
        const { canceled, filePath } = await dialog.showSaveDialog({
          defaultPath: result.filename,
          filters: [
            format === 'xlsx'
              ? { name: 'Excel 파일', extensions: ['xlsx'] }
              : { name: 'CSV 파일', extensions: ['csv'] }
          ]
        })

        if (!canceled && filePath) {
          const fs = await import('fs')
          fs.writeFileSync(filePath, result.data)
          return { success: true, filePath }
        }
        return { success: false, error: '저장이 취소되었습니다.' }
      }
      return result
    }
  )

  ipcMain.handle('create-contact-import-template', async (_event, format: 'xlsx' | 'csv') => {
    const result = await createContactImportTemplate(format)
    if (result.success && result.data && result.filename) {
      // 파일 저장 다이얼로그
      const { dialog } = await import('electron')
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: result.filename,
        filters: [
          format === 'xlsx'
            ? { name: 'Excel 파일', extensions: ['xlsx'] }
            : { name: 'CSV 파일', extensions: ['csv'] }
        ]
      })

      if (!canceled && filePath) {
        const fs = await import('fs')
        fs.writeFileSync(filePath, result.data)
        return { success: true, filePath }
      }
      return { success: false, error: '저장이 취소되었습니다.' }
    }
    return result
  })

  ipcMain.handle('select-contacts-file', async () => {
    const { dialog } = await import('electron')
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '연락처 파일', extensions: ['xlsx', 'xls', 'csv'] }]
    })

    if (!canceled && filePaths.length > 0) {
      return { success: true, filePath: filePaths[0] }
    }
    return { success: false }
  })

  // =====================================================
  // 로그 관리
  // =====================================================

  // 최근 로그 조회 (메모리)
  ipcMain.handle('get-recent-logs', async (_event, filter?: LogFilter) => {
    return logger.getRecentLogs(filter)
  })

  // 로그 파일에서 로그 읽기
  ipcMain.handle('read-log-file', async (_event, date?: string) => {
    return logger.readLogFile(date)
  })

  // 로그 파일 목록 조회
  ipcMain.handle('get-log-files', async () => {
    return logger.getLogFiles()
  })

  // 로그 폴더 열기
  ipcMain.handle('open-log-folder', async () => {
    const { shell } = await import('electron')
    const logDir = logger.getLogDirectory()
    await shell.openPath(logDir)
    return { success: true, path: logDir }
  })

  // 로그 내보내기
  ipcMain.handle(
    'export-logs',
    async (_event, options?: { startDate?: string; endDate?: string }) => {
      const { dialog } = await import('electron')
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: `mailvista-logs-${new Date().toISOString().split('T')[0]}.txt`,
        filters: [{ name: '텍스트 파일', extensions: ['txt'] }]
      })

      if (!canceled && filePath) {
        const success = await logger.exportLogs(filePath, options)
        return { success, filePath: success ? filePath : undefined }
      }
      return { success: false }
    }
  )

  // 로그 삭제
  ipcMain.handle('clear-logs', async () => {
    logger.clearLogs()
    return { success: true }
  })

  // 로그 레벨 설정
  ipcMain.handle('set-log-level', async (_event, level: LogLevel) => {
    logger.setLogLevel(level)
    return { success: true }
  })

  // 로그 디렉토리 경로 조회
  ipcMain.handle('get-log-directory', async () => {
    return logger.getLogDirectory()
  })

  // 로그 디렉토리 열기
  ipcMain.handle('open-log-directory', async () => {
    const { shell } = await import('electron')
    shell.openPath(logger.getLogDirectory())
    return { success: true }
  })

  // =====================================================
  // 대용량 첨부파일 (클라우드 스토리지)
  // =====================================================

  // 클라우드 스토리지 설정 조회
  ipcMain.handle('get-cloud-storage-settings', async () => {
    return getCloudStorageSettings()
  })

  // 클라우드 스토리지 설정 업데이트
  ipcMain.handle('update-cloud-storage-settings', async (_event, updates) => {
    return updateCloudStorageSettings(updates)
  })

  // 이메일 계정에 맞는 클라우드 서비스 감지
  ipcMain.handle('detect-cloud-provider', async (_event, email: string) => {
    return detectCloudProvider(email)
  })

  // 클라우드 서비스 연결 상태 확인
  ipcMain.handle('is-cloud-provider-connected', async (_event, provider: CloudProvider) => {
    return isCloudProviderConnected(provider)
  })

  // 클라우드 서비스 자격증명 조회
  ipcMain.handle('get-cloud-credentials', async (_event, provider: CloudProvider) => {
    const creds = getCloudCredentials(provider)
    // 민감한 정보는 제외하고 반환
    if (creds) {
      return { connected: true, email: creds.email }
    }
    return { connected: false }
  })

  // Google Drive 연결
  ipcMain.handle('connect-google-drive', async (_event, clientId: string, clientSecret: string) => {
    try {
      const success = await startGoogleAuth(clientId, clientSecret)
      return { success }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed'
      }
    }
  })

  // 클라우드 서비스 연결 해제
  ipcMain.handle('disconnect-cloud-provider', async (_event, provider: CloudProvider) => {
    removeCloudCredentials(provider)
    return { success: true }
  })

  // 대용량 파일 업로드 필요 여부 확인
  ipcMain.handle('needs-cloud-upload', async (_event, fileSizeBytes: number) => {
    return needsCloudUpload(fileSizeBytes)
  })

  // 파일 크기 포맷
  ipcMain.handle('format-file-size', async (_event, bytes: number) => {
    return formatFileSize(bytes)
  })

  // 대용량 파일 업로드
  ipcMain.handle(
    'upload-large-file',
    async (_event, filePath: string, accountEmail: string, fileName?: string) => {
      return uploadLargeFile(filePath, accountEmail, fileName)
    }
  )

  // 여러 대용량 파일 업로드
  ipcMain.handle(
    'upload-multiple-large-files',
    async (_event, files: { path: string; name?: string }[], accountEmail: string) => {
      return uploadMultipleLargeFiles(files, accountEmail)
    }
  )

  // =====================================================
  // OAuth 인증 핸들러
  // =====================================================

  // Google OAuth 시작 (클라이언트 정보 직접 제공)
  ipcMain.handle('oauth-google-start', async (_event, clientId: string, clientSecret: string) => {
    return startGoogleOAuth(clientId, clientSecret)
  })

  // Google OAuth 시작 (내장 자격 증명 사용)
  ipcMain.handle('oauth-google-start-embedded', async () => {
    return startGoogleOAuthWithEmbeddedCredentials()
  })

  // 내장 OAuth 자격 증명 존재 여부 확인
  ipcMain.handle(
    'oauth-has-embedded-credentials',
    async (_event, provider: 'google' | 'microsoft') => {
      return hasEmbeddedOAuthCredentials(provider)
    }
  )

  // Microsoft OAuth 시작
  ipcMain.handle(
    'oauth-microsoft-start',
    async (_event, clientId: string, clientSecret: string) => {
      return startMicrosoftOAuth(clientId, clientSecret)
    }
  )

  // OAuth 토큰 조회
  ipcMain.handle('oauth-get-tokens', async (_event, email: string) => {
    return getOAuthTokens(email)
  })

  // OAuth 토큰 삭제
  ipcMain.handle('oauth-delete-tokens', async (_event, email: string) => {
    deleteOAuthTokens(email)
    return { success: true }
  })

  // OAuth 계정 여부 확인
  ipcMain.handle('oauth-is-account', async (_event, email: string) => {
    return isOAuthAccount(email)
  })

  // XOAUTH2 토큰 생성
  ipcMain.handle('oauth-get-xoauth2-token', async (_event, email: string) => {
    return getXOAuth2Token(email)
  })

  // OAuth 제공자 조회
  ipcMain.handle('oauth-get-provider', async (_event, email: string) => {
    return getOAuthProvider(email)
  })

  // OAuth 서버 설정 조회
  ipcMain.handle('oauth-get-server-config', async (_event, provider: 'google' | 'microsoft') => {
    return getOAuthServerConfig(provider)
  })

  // OAuth 설정 저장
  ipcMain.handle(
    'oauth-save-config',
    async (
      _event,
      provider: 'google' | 'microsoft',
      config: { clientId: string; clientSecret: string }
    ) => {
      saveOAuthConfig(provider, config)
      return { success: true }
    }
  )

  // OAuth 설정 조회
  ipcMain.handle('oauth-get-config', async (_event, provider: 'google' | 'microsoft') => {
    return getOAuthConfig(provider)
  })

  // VIP 발신자 관리 (계정별 분리)
  ipcMain.handle('get-vip-senders', async (_event, accountEmail: string) => {
    return getVipSenders(accountEmail)
  })

  ipcMain.handle(
    'add-vip-sender',
    async (_event, accountEmail: string, email: string, name: string) => {
      return addVipSender(accountEmail, email, name)
    }
  )

  ipcMain.handle('remove-vip-sender', async (_event, accountEmail: string, email: string) => {
    return removeVipSender(accountEmail, email)
  })

  ipcMain.handle('is-vip-sender', async (_event, accountEmail: string, email: string) => {
    return isVipSender(accountEmail, email)
  })

  ipcMain.handle(
    'toggle-vip-sender',
    async (_event, accountEmail: string, email: string, name: string) => {
      return toggleVipSender(accountEmail, email, name)
    }
  )

  // 데스크탑 알림 표시
  ipcMain.handle(
    'show-notification',
    async (
      _event,
      title: string,
      body: string,
      options?: { silent?: boolean; onClick?: string }
    ) => {
      const settings = getGlobalSettings()

      // 알림이 비활성화된 경우
      if (!settings.notifications.enabled) {
        return false
      }

      if (Notification.isSupported()) {
        const notification = new Notification({
          title,
          // showPreview 설정에 따라 본문 표시 여부 결정
          body: settings.notifications.showPreview ? body : '',
          icon: icon,
          // sound 설정에 따라 소리 재생 여부 결정
          silent: options?.silent ?? !settings.notifications.sound
        })

        // 알림 클릭 시 창 포커스
        notification.on('click', () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
          }
        })

        notification.show()
        return true
      }
      return false
    }
  )

  // Trello Integration IPC handlers
  ipcMain.handle(
    'trello-save-credentials',
    async (_event, accountEmail: string, credentials: TrelloCredentials) => {
      return saveTrelloCredentials(accountEmail, credentials)
    }
  )

  ipcMain.handle('trello-get-credentials', async (_event, accountEmail: string) => {
    return getTrelloCredentials(accountEmail)
  })

  ipcMain.handle('trello-delete-credentials', async (_event, accountEmail: string) => {
    return deleteTrelloCredentials(accountEmail)
  })

  ipcMain.handle('trello-validate-credentials', async (_event, apiKey: string, token: string) => {
    return await validateTrelloCredentials(apiKey, token)
  })

  ipcMain.handle('trello-get-boards', async (_event, apiKey: string, token: string) => {
    return await getTrelloBoards(apiKey, token)
  })

  ipcMain.handle(
    'trello-get-lists',
    async (_event, apiKey: string, token: string, boardId: string) => {
      return await getTrelloLists(apiKey, token, boardId)
    }
  )

  ipcMain.handle(
    'trello-create-card',
    async (_event, apiKey: string, token: string, options: TrelloCardOptions) => {
      return await createTrelloCard(apiKey, token, options)
    }
  )

  // LLM/AI Integration IPC handlers
  ipcMain.handle('llm-get-settings', async (_event, accountEmail: string) => {
    return getAISettings(accountEmail)
  })

  ipcMain.handle(
    'llm-update-settings',
    async (_event, accountEmail: string, updates: Partial<AISettings>) => {
      return updateAISettings(accountEmail, updates)
    }
  )

  ipcMain.handle('llm-reset-settings', async (_event, accountEmail: string) => {
    return resetAISettings(accountEmail)
  })

  ipcMain.handle(
    'llm-set-provider-credential',
    async (_event, accountEmail: string, provider: LLMProvider, apiKey: string) => {
      return setProviderCredential(accountEmail, provider, apiKey)
    }
  )

  ipcMain.handle(
    'llm-delete-provider-credential',
    async (_event, accountEmail: string, provider: LLMProvider) => {
      return deleteProviderCredential(accountEmail, provider)
    }
  )

  ipcMain.handle(
    'llm-set-active-provider',
    async (_event, accountEmail: string, provider: LLMProvider) => {
      return setActiveProvider(accountEmail, provider)
    }
  )

  ipcMain.handle(
    'llm-toggle-feature',
    async (_event, accountEmail: string, featureId: AIFeatureId, enabled: boolean) => {
      return toggleFeature(accountEmail, featureId, enabled)
    }
  )

  ipcMain.handle('llm-validate-api-key', async (_event, provider: LLMProvider, apiKey: string) => {
    return await validateApiKey(provider, apiKey)
  })

  ipcMain.handle(
    'llm-summarize',
    async (_event, accountEmail: string, emailContent: string, language?: string) => {
      return await summarizeEmail(accountEmail, emailContent, language)
    }
  )

  ipcMain.handle(
    'llm-generate-reply',
    async (_event, accountEmail: string, emailContent: string, instructions: string) => {
      return await generateSmartReply(accountEmail, emailContent, instructions)
    }
  )

  ipcMain.handle(
    'llm-convert-tone',
    async (_event, accountEmail: string, text: string, targetTone: ToneType) => {
      return await convertTone(accountEmail, text, targetTone)
    }
  )

  ipcMain.handle(
    'llm-translate',
    async (_event, accountEmail: string, text: string, targetLanguage: string) => {
      return await translateText(accountEmail, text, targetLanguage)
    }
  )

  ipcMain.handle(
    'llm-ask',
    async (_event, accountEmail: string, emailContent: string, question: string) => {
      return await askAboutEmail(accountEmail, emailContent, question)
    }
  )

  // ============================================
  // Security Handlers (첨부파일 위험도, URL 분석, 인증)
  // ============================================

  // 첨부파일 위험도 확인
  ipcMain.handle('check-attachment-risk', (_event, filename: string) => {
    return {
      level: getAttachmentRiskLevel(filename),
      message: getAttachmentRiskMessage(filename)
    }
  })

  // URL 보안 분석 (피싱/호모그래프 탐지)
  ipcMain.handle('analyze-url-security', (_event, url: string) => {
    return analyzeURL(url)
  })

  // 이메일 인증 상태 조회 (Authentication-Results 헤더)
  ipcMain.handle(
    'get-email-auth-status',
    async (_event, accountEmail: string, uid: number, folderPath: string) => {
      const unknownResult = {
        spf: 'unknown' as const,
        dkim: 'unknown' as const,
        dmarc: 'unknown' as const,
        fromDomain: '',
        summary: { status: 'unknown' as const, icon: 'shield-question' }
      }

      try {
        // EML 파일에서 원본 헤더 가져오기 (BodyStorage 사용)
        const bodyStorage = getBodyStorage()
        const safeFolder = folderPath.replace(/[/\\:*?"<>|]/g, '_')
        const emlBuffer = await bodyStorage.getBodyBuffer(accountEmail, safeFolder, uid)

        if (!emlBuffer) {
          return unknownResult
        }

        // mailparser로 파싱하여 헤더 추출
        const parsed = await simpleParser(emlBuffer)

        // Authentication-Results 헤더 추출
        const headers = parsed.headers
        const authResultsHeader = headers.get('authentication-results')?.toString() || null
        const fromHeader = headers.get('from')?.toString() || parsed.from?.text || null

        const authResult = parseAuthenticationHeaders(authResultsHeader, fromHeader)
        const summary = getAuthSummary(authResult)

        return {
          ...authResult,
          summary
        }
      } catch (error) {
        console.error('[Security] Failed to get email auth status:', error)
        return unknownResult
      }
    }
  )

  // ============================================
  // Email Template Handlers
  // ============================================

  ipcMain.handle('template-get-all', async () => {
    return getTemplates()
  })

  ipcMain.handle('template-get', async (_event, id: string) => {
    return getTemplate(id)
  })

  ipcMain.handle(
    'template-create',
    async (_event, name: string, subject: string, content: string) => {
      return createTemplate(name, subject, content)
    }
  )

  ipcMain.handle(
    'template-update',
    async (_event, id: string, updates: { name?: string; subject?: string; content?: string }) => {
      return updateTemplate(id, updates)
    }
  )

  ipcMain.handle('template-delete', async (_event, id: string) => {
    return deleteTemplate(id)
  })

  // Global app settings (language, etc.)
  ipcMain.handle('get-global-settings', async () => {
    return getGlobalSettings()
  })

  ipcMain.handle(
    'save-global-settings',
    async (
      _event,
      updates: {
        language?: string
        languageSelected?: boolean
      }
    ) => {
      return updateGlobalSettings(updates)
    }
  )

  ipcMain.handle('update-global-settings', async (_event, updates: Partial<GlobalAppSettings>) => {
    const result = updateGlobalSettings(updates)

    // 설정 변경 시 실제 시스템 기능 적용
    if (result.success && result.settings) {
      // 로그인 시 시작 설정
      if (updates.startup?.launchAtLogin !== undefined) {
        try {
          app.setLoginItemSettings({
            openAtLogin: updates.startup.launchAtLogin,
            openAsHidden: result.settings.startup.startMinimized
          })
          logger.info(LogCategory.APP, 'Login item settings updated', {
            openAtLogin: updates.startup.launchAtLogin
          })
        } catch (error) {
          logger.error(LogCategory.ERROR, 'Failed to set login item settings', {
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      // 최소화 상태로 시작 설정 (로그인 설정 업데이트 시 함께 반영)
      if (updates.startup?.startMinimized !== undefined && result.settings.startup.launchAtLogin) {
        try {
          app.setLoginItemSettings({
            openAtLogin: result.settings.startup.launchAtLogin,
            openAsHidden: updates.startup.startMinimized
          })
        } catch (error) {
          logger.error(LogCategory.ERROR, 'Failed to update startMinimized setting', {
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      // 로그 레벨 변경
      if (updates.logging?.level) {
        logger.setLogLevel(updates.logging.level)
        logger.info(LogCategory.APP, 'Log level changed', { level: updates.logging.level })
      }

      // 트레이로 최소화 설정
      if (updates.startup?.minimizeToTray !== undefined) {
        if (updates.startup.minimizeToTray) {
          initializeTray()
          logger.info(LogCategory.APP, 'Minimize to tray enabled')
        } else {
          // 트레이 제거
          if (tray) {
            tray.destroy()
            tray = null
            logger.info(LogCategory.APP, 'Minimize to tray disabled')
          }
        }
      }
    }

    return result
  })

  // 현재 로그인 설정 상태 조회
  ipcMain.handle('get-login-item-settings', () => {
    try {
      const settings = app.getLoginItemSettings()
      return {
        success: true,
        settings: {
          openAtLogin: settings.openAtLogin,
          openAsHidden: settings.openAsHidden,
          wasOpenedAtLogin: settings.wasOpenedAtLogin,
          wasOpenedAsHidden: settings.wasOpenedAsHidden
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // ============ PIN 관련 핸들러 ============

  // PIN 설정
  ipcMain.handle('set-pin', async (_event, pin: string) => {
    return setPin(pin)
  })

  // PIN 검증
  ipcMain.handle('verify-pin', async (_event, pin: string) => {
    return verifyPin(pin)
  })

  // PIN 비활성화
  ipcMain.handle('disable-pin', async () => {
    return disablePin()
  })

  // PIN 활성화 여부 확인
  ipcMain.handle('is-pin-enabled', async () => {
    return isPinEnabled()
  })

  ipcMain.handle('clear-cache', async () => {
    // 캐시 디렉토리 삭제 또는 초기화
    try {
      const { app } = require('electron')
      const path = require('path')
      const fs = require('fs')
      const cacheDir = path.join(app.getPath('userData'), 'cache')
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true })
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // ============ Additional SQLite Storage Handlers ============
  ipcMain.handle('storage-set-enabled', async (_event, enabled: boolean) => {
    try {
      setSqliteStorageEnabled(enabled)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(
    'search-emails-local',
    async (
      _event,
      accountEmail: string,
      query: string,
      options?: { folderPath?: string; start?: number; limit?: number }
    ) => {
      return searchEmailsLocal(accountEmail, query, options)
    }
  )

  // SQLite 상세 검색
  ipcMain.handle(
    'search-emails-detailed-local',
    async (
      _event,
      accountEmail: string,
      params: DetailedSearchParams,
      options?: { start?: number; limit?: number }
    ) => {
      return searchEmailsDetailedLocal(accountEmail, params, options)
    }
  )

  // SQLite 저장소 데이터 존재 확인
  ipcMain.handle('has-local-storage-data', async (_event, accountEmail: string) => {
    return hasLocalStorageData(accountEmail)
  })

  // ============ Tag Service Handlers ============
  ipcMain.handle('tag-get-all', async (_event, accountEmail: string) => {
    return getTags(accountEmail)
  })

  ipcMain.handle(
    'tag-create',
    async (_event, accountEmail: string, name: string, color: string) => {
      return createTag(accountEmail, name, color)
    }
  )

  ipcMain.handle(
    'tag-update',
    async (
      _event,
      accountEmail: string,
      tagId: string,
      updates: { name?: string; color?: string }
    ) => {
      return updateTag(accountEmail, tagId, updates)
    }
  )

  ipcMain.handle('tag-delete', async (_event, accountEmail: string, tagId: string) => {
    return deleteTag(accountEmail, tagId)
  })

  ipcMain.handle(
    'tag-assign',
    async (_event, accountEmail: string, folderPath: string, uid: number, tagId: string) => {
      return assignTagToEmail(accountEmail, folderPath, uid, tagId)
    }
  )

  ipcMain.handle(
    'tag-remove',
    async (_event, accountEmail: string, folderPath: string, uid: number, tagId: string) => {
      return removeTagFromEmail(accountEmail, folderPath, uid, tagId)
    }
  )

  ipcMain.handle(
    'tag-get-email-tags',
    async (_event, accountEmail: string, folderPath: string, uid: number) => {
      return getEmailTags(accountEmail, folderPath, uid)
    }
  )

  ipcMain.handle(
    'tag-get-bulk-email-tags',
    async (_event, accountEmail: string, emails: { folderPath: string; uid: number }[]) => {
      return getBulkEmailTags(accountEmail, emails)
    }
  )

  ipcMain.handle('tag-get-emails-by-tag', async (_event, accountEmail: string, tagId: string) => {
    return getEmailsByTag(accountEmail, tagId)
  })

  ipcMain.handle('tag-get-default-colors', async () => {
    return getDefaultColors()
  })

  // ============ Offline Service Handlers ============
  ipcMain.handle('offline-get-status', async () => {
    return getOnlineStatus()
  })

  ipcMain.handle('offline-set-status', async (_event, status: boolean) => {
    setOnlineStatus(status)
    return { success: true }
  })

  ipcMain.handle('offline-get-settings', async () => {
    return getOfflineSettings()
  })

  ipcMain.handle('offline-update-settings', async (_event, updates) => {
    return updateOfflineSettings(updates)
  })

  ipcMain.handle(
    'offline-cache-emails',
    async (_event, accountEmail: string, folderPath: string, emails: any[], total: number) => {
      cacheEmails(accountEmail, folderPath, emails, total)
      return { success: true }
    }
  )

  ipcMain.handle(
    'offline-cache-email-content',
    async (_event, accountEmail: string, folderPath: string, uid: number, content: any) => {
      cacheEmailContent(accountEmail, folderPath, uid, content)
      return { success: true }
    }
  )

  ipcMain.handle(
    'offline-get-cached-emails',
    async (_event, accountEmail: string, folderPath: string) => {
      return getCachedEmails(accountEmail, folderPath)
    }
  )

  ipcMain.handle(
    'offline-get-cached-email-content',
    async (_event, accountEmail: string, folderPath: string, uid: number) => {
      return getCachedEmailContent(accountEmail, folderPath, uid)
    }
  )

  ipcMain.handle('offline-cache-folders', async (_event, accountEmail: string, folders: any[]) => {
    cacheFolderList(accountEmail, folders)
    return { success: true }
  })

  ipcMain.handle('offline-get-cached-folders', async (_event, accountEmail: string) => {
    return getCachedFolderList(accountEmail)
  })

  ipcMain.handle('offline-add-pending-email', async (_event, email: any) => {
    const id = addPendingEmail(email)
    return { success: true, id }
  })

  ipcMain.handle('offline-get-pending-emails', async () => {
    return getPendingEmails()
  })

  ipcMain.handle('offline-remove-pending-email', async (_event, id: string) => {
    removePendingEmail(id)
    return { success: true }
  })

  ipcMain.handle('offline-get-cache-size', async (_event, accountEmail?: string) => {
    return getCacheSize(accountEmail)
  })

  ipcMain.handle('offline-clear-cache', async (_event, accountEmail?: string) => {
    return clearCache(accountEmail)
  })

  ipcMain.handle('offline-get-cache-status', async (_event, accountEmail: string) => {
    return getCacheStatus(accountEmail)
  })

  // ============ Virtual Folder Handlers ============
  ipcMain.handle('virtual-folder-get-all', async (_event, accountEmail: string) => {
    return getVirtualFolders(accountEmail)
  })

  ipcMain.handle('virtual-folder-create', async (_event, accountEmail: string, data: any) => {
    return createVirtualFolder(accountEmail, data)
  })

  ipcMain.handle(
    'virtual-folder-update',
    async (_event, accountEmail: string, folderId: string, updates: any) => {
      return updateVirtualFolder(accountEmail, folderId, updates)
    }
  )

  ipcMain.handle(
    'virtual-folder-delete',
    async (_event, accountEmail: string, folderId: string) => {
      return deleteVirtualFolder(accountEmail, folderId)
    }
  )

  ipcMain.handle('virtual-folder-build-query', async (_event, folder: any) => {
    return buildSearchQuery(folder)
  })

  ipcMain.handle('virtual-folder-match', async (_event, email: any, folder: any) => {
    return matchesVirtualFolder(email, folder)
  })

  ipcMain.handle('virtual-folder-get-icons', async () => {
    return getVirtualFolderIcons()
  })

  ipcMain.handle('virtual-folder-get-colors', async () => {
    return getVirtualFolderColors()
  })

  // 파일 선택 다이얼로그
  ipcMain.handle('select-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '모든 파일', extensions: ['*'] }]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false }
    }

    const files = await Promise.all(
      result.filePaths.map(async (filePath) => {
        const fileStats = await stat(filePath)
        const fileName = basename(filePath)
        // MIME 타입 추론 (간단한 버전)
        const ext = fileName.split('.').pop()?.toLowerCase() || ''
        const mimeTypes: Record<string, string> = {
          pdf: 'application/pdf',
          doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xls: 'application/vnd.ms-excel',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ppt: 'application/vnd.ms-powerpoint',
          pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          txt: 'text/plain',
          html: 'text/html',
          htm: 'text/html',
          css: 'text/css',
          js: 'application/javascript',
          json: 'application/json',
          xml: 'application/xml',
          zip: 'application/zip',
          rar: 'application/x-rar-compressed',
          '7z': 'application/x-7z-compressed',
          tar: 'application/x-tar',
          gz: 'application/gzip',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          gif: 'image/gif',
          bmp: 'image/bmp',
          svg: 'image/svg+xml',
          webp: 'image/webp',
          ico: 'image/x-icon',
          mp3: 'audio/mpeg',
          wav: 'audio/wav',
          ogg: 'audio/ogg',
          mp4: 'video/mp4',
          avi: 'video/x-msvideo',
          mov: 'video/quicktime',
          wmv: 'video/x-ms-wmv',
          webm: 'video/webm'
        }
        return {
          name: fileName,
          path: filePath,
          size: fileStats.size,
          type: mimeTypes[ext] || 'application/octet-stream'
        }
      })
    )

    return { success: true, files }
  })

  // =====================================================
  // SQLite 스토리지 서비스 (하이브리드 스토리지)
  // =====================================================

  // 스토리지 초기화
  try {
    initializeStorage()
    logger.info(LogCategory.APP, 'SQLite storage initialized')
  } catch (error) {
    logger.error(LogCategory.ERROR, 'Failed to initialize SQLite storage', {
      error: error instanceof Error ? error.message : String(error)
    })
  }

  // =====================================================
  // Operation Worker (Local-First Background Sync)
  // =====================================================
  const operationWorker = getOperationWorker()

  // IMAP 작업 함수 설정
  operationWorker.setImapFunctions({
    setEmailFlags,
    deleteEmail,
    moveEmail,
    deleteBulkEmails,
    moveBulkEmails
  })

  // 워커 시작 (5초 간격)
  operationWorker.start(5000)
  logger.info(LogCategory.APP, 'Operation worker started')

  // Operation Queue 상태 조회
  ipcMain.handle('operation-queue-get-stats', async () => {
    try {
      const stats = getOperationQueue().getStats()
      return { success: true, stats }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // Operation Worker 상태 조회
  ipcMain.handle('operation-worker-get-status', async () => {
    try {
      const status = operationWorker.getStatus()
      return { success: true, status }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 실패한 작업 정리 (즉시)
  ipcMain.handle('operation-queue-clear-failed', async () => {
    try {
      const queue = getOperationQueue()
      // olderThanMs = 0 으로 설정하여 모든 실패한 작업 삭제
      const count = queue.cleanupFailed(0)
      logger.info(LogCategory.SYNC, `Cleared ${count} failed operations from queue`)
      return { success: true, clearedCount: count }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 실패한 작업 목록 조회
  ipcMain.handle('operation-queue-get-failed', async () => {
    try {
      const queue = getOperationQueue()
      const failed = queue.getFailedOperations()
      return { success: true, operations: failed }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 스토리지 통계 조회
  ipcMain.handle('storage-get-stats', async (_event, accountEmail?: string) => {
    try {
      const db = getStorageDatabase()
      return { success: true, stats: db.getStorageStats(accountEmail) }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 로컬 FTS 검색
  ipcMain.handle('storage-search', async (_event, options: SearchOptions) => {
    try {
      const searchService = getSearchService()
      const results = searchService.searchLocal(options)
      const count = searchService.getSearchCount(options)
      return { success: true, results, total: count }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 검색 제안 (자동완성)
  ipcMain.handle('storage-search-suggestions', async (_event, prefix: string, limit?: number) => {
    try {
      const searchService = getSearchService()
      const suggestions = searchService.getSuggestions(prefix, limit)
      return { success: true, suggestions }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 동기화 상태 조회
  ipcMain.handle('storage-get-sync-status', async () => {
    try {
      const syncService = getSyncService()
      return { success: true, status: syncService.getStatus() }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 동기화 설정 조회
  ipcMain.handle('storage-get-sync-settings', async () => {
    try {
      const syncService = getSyncService()
      return { success: true, settings: syncService.getSettings() }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 동기화 설정 업데이트
  ipcMain.handle(
    'storage-update-sync-settings',
    async (
      _event,
      settings: {
        autoSync?: boolean
        syncIntervalMs?: number
        maxConcurrentDownloads?: number
        bandwidthLimitKBps?: number
      }
    ) => {
      try {
        const syncService = getSyncService()
        syncService.updateSettings(settings)
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  // 동기화 일시정지
  ipcMain.handle('storage-pause-sync', async () => {
    try {
      const syncService = getSyncService()
      syncService.pause()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 동기화 재개
  ipcMain.handle('storage-resume-sync', async () => {
    try {
      const syncService = getSyncService()
      syncService.resume()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 동기화 중지
  ipcMain.handle('storage-stop-sync', async () => {
    try {
      const syncService = getSyncService()
      await syncService.stop()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 스토리지 캐시 정리
  ipcMain.handle('storage-clear-cache', async (_event, accountEmail?: string) => {
    try {
      const db = getStorageDatabase()
      if (accountEmail) {
        db.clearAccountData(accountEmail)
      } else {
        db.clearAllData()
      }
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 데이터베이스 최적화 (VACUUM)
  ipcMain.handle('storage-vacuum', async () => {
    try {
      const db = getStorageDatabase()
      db.vacuum()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  mainWindow = createWindow()

  // Operation Worker에 mainWindow 설정
  operationWorker.setMainWindow(mainWindow)

  // 시작 시 글로벌 설정 적용
  const initialSettings = getGlobalSettings()

  // 로그 레벨 적용
  if (initialSettings.logging?.level) {
    logger.setLogLevel(initialSettings.logging.level)
  }

  // 트레이로 최소화 설정 적용
  setupMinimizeToTray(mainWindow)

  // 최소화 상태로 시작
  if (initialSettings.startup?.startMinimized) {
    mainWindow.hide()
    if (initialSettings.startup?.minimizeToTray) {
      initializeTray()
    }
  }

  // 자동 업데이트 초기화
  initAutoUpdater(mainWindow)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
      operationWorker.setMainWindow(mainWindow)
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isAppQuitting = true
})

// 앱 종료 전 연결 풀 및 스토리지 정리
app.on('will-quit', () => {
  logger.info(LogCategory.APP, 'Application shutting down')

  // Operation Worker 중지
  try {
    getOperationWorker().stop()
    logger.info(LogCategory.APP, 'Operation worker stopped')
  } catch (error) {
    logger.error(LogCategory.ERROR, 'Error stopping operation worker', {
      error: error instanceof Error ? error.message : String(error)
    })
  }

  destroyConnectionPool()
  try {
    shutdownStorage()
    logger.info(LogCategory.APP, 'SQLite storage closed')
  } catch (error) {
    logger.error(LogCategory.ERROR, 'Error closing SQLite storage', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
