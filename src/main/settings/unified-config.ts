/**
 * 통합 설정 관리
 * - config.json: 모든 앱 설정 (전역 + 계정별)
 * - credentials.json: 클라우드 스토리지 자격 증명
 */
import Store from 'electron-store'
import { safeStorage } from 'electron'

// electron-store는 ESM default export를 사용
const ElectronStore = (Store as unknown as { default: typeof Store }).default || Store

// =====================================================
// 타입 정의
// =====================================================

// 전역 앱 설정
export interface GlobalSettings {
  language: string
  languageSelected: boolean
  notifications: {
    enabled: boolean
    sound: boolean
    showPreview: boolean
  }
  startup: {
    launchAtLogin: boolean
    minimizeToTray: boolean
    startMinimized: boolean
  }
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error'
    retentionDays: number
  }
  security: {
    autoLock: boolean
    autoLockTime: number
    pinEnabled: boolean
    pinHash: string | null
  }
  updates: {
    autoCheck: boolean
    autoDownload: boolean
  }
}

// 계정별 앱 설정
export interface AccountAppSettings {
  emailsPerPage: number
  senderName: string
  saveSentMail: boolean
  delayedSend: {
    enabled: boolean
    delay: number
  }
  includeOriginalOnReply: boolean
  viewMode: 'list' | 'split'
  pollingInterval: number
  toolbar: {
    iconSize: 'small' | 'medium' | 'large'
    displayMode: 'icon' | 'text' | 'both'
    visibleButtons: {
      markRead: boolean
      markUnread: boolean
      delete: boolean
      spam: boolean
      reply: boolean
      forward: boolean
      move: boolean
      trello: boolean
    }
  }
  privacy: {
    blockExternalImages: boolean
    showAuthStatus: boolean
  }
}

// AI 설정
export type LLMProvider = 'openai' | 'anthropic' | 'google'
export type AIFeatureId = 'summary' | 'smartReply' | 'toneConversion' | 'translation' | 'emailQA'

export interface ProviderCredential {
  apiKey: string
  validated: boolean
  lastValidated?: number
}

export interface AIFeatureConfig {
  enabled: boolean
}

export interface AccountAISettings {
  credentials: {
    openai?: ProviderCredential
    anthropic?: ProviderCredential
    google?: ProviderCredential
  }
  activeProvider?: LLMProvider
  features: Record<AIFeatureId, AIFeatureConfig>
  cacheEnabled: boolean
  cacheDuration: number
}

// 계정별 설정 통합
export interface AccountSettings {
  app: AccountAppSettings
  ai: AccountAISettings
}

// Config Store 스키마
interface ConfigStoreSchema {
  global: GlobalSettings
  accounts: {
    [email: string]: AccountSettings
  }
}

// 클라우드 스토리지
export type CloudProvider = 'google-drive' | 'onedrive' | 'naver-cloud' | 'transfer-sh' | 'none'

export interface CloudCredentials {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  email?: string
}

export interface CloudStorageSettings {
  googleDrive?: {
    clientId: string
    clientSecret: string
  }
  oneDrive?: {
    clientId: string
    clientSecret: string
  }
  preferredProvider?: CloudProvider
  autoSelectByAccount?: boolean
  fileSizeThreshold: number
}

// Credentials Store 스키마
interface CredentialsStoreSchema {
  cloudStorage: {
    settings: CloudStorageSettings
    credentials: {
      [key in CloudProvider]?: CloudCredentials
    }
  }
}

// =====================================================
// 기본값
// =====================================================

const defaultGlobalSettings: GlobalSettings = {
  language: 'ko',
  languageSelected: false,
  notifications: {
    enabled: true,
    sound: true,
    showPreview: true
  },
  startup: {
    launchAtLogin: false,
    minimizeToTray: false,
    startMinimized: false
  },
  logging: {
    level: 'info',
    retentionDays: 30
  },
  security: {
    autoLock: false,
    autoLockTime: 5,
    pinEnabled: false,
    pinHash: null
  },
  updates: {
    autoCheck: true,
    autoDownload: false
  }
}

const defaultAccountAppSettings: AccountAppSettings = {
  emailsPerPage: 20,
  senderName: '',
  saveSentMail: true,
  delayedSend: {
    enabled: false,
    delay: 10
  },
  includeOriginalOnReply: true,
  viewMode: 'list',
  pollingInterval: 30,
  toolbar: {
    iconSize: 'small',
    displayMode: 'both',
    visibleButtons: {
      markRead: true,
      markUnread: true,
      delete: true,
      spam: true,
      reply: true,
      forward: true,
      move: true,
      trello: true
    }
  },
  privacy: {
    blockExternalImages: true, // 기본: 외부 이미지 차단
    showAuthStatus: true // 기본: 인증 상태 표시
  }
}

const defaultAccountAISettings: AccountAISettings = {
  credentials: {},
  activeProvider: undefined,
  features: {
    summary: { enabled: false },
    smartReply: { enabled: false },
    toneConversion: { enabled: false },
    translation: { enabled: false },
    emailQA: { enabled: false }
  },
  cacheEnabled: true,
  cacheDuration: 3600000
}

const defaultAccountSettings: AccountSettings = {
  app: defaultAccountAppSettings,
  ai: defaultAccountAISettings
}

// =====================================================
// 스토어 초기화
// =====================================================

let configStore: InstanceType<typeof ElectronStore<ConfigStoreSchema>> | null = null
let credentialsStore: InstanceType<typeof ElectronStore<CredentialsStoreSchema>> | null = null

function getConfigStore() {
  if (!configStore) {
    configStore = new ElectronStore<ConfigStoreSchema>({
      name: 'config',
      defaults: {
        global: defaultGlobalSettings,
        accounts: {}
      }
    })
  }
  return configStore
}

function getCredentialsStore() {
  if (!credentialsStore) {
    credentialsStore = new ElectronStore<CredentialsStoreSchema>({
      name: 'credentials',
      defaults: {
        cloudStorage: {
          settings: {
            autoSelectByAccount: true,
            fileSizeThreshold: 10
          },
          credentials: {}
        }
      }
    })
  }
  return credentialsStore
}

// =====================================================
// 암호화 헬퍼
// =====================================================

// 암호화 가용성 확인
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

function encryptString(str: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'ENCRYPTION_UNAVAILABLE: 시스템에서 암호화를 사용할 수 없습니다. 자격 증명을 안전하게 저장할 수 없습니다.'
    )
  }
  return safeStorage.encryptString(str).toString('base64')
}

function decryptString(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'ENCRYPTION_UNAVAILABLE: 시스템에서 암호화를 사용할 수 없습니다. 자격 증명을 복호화할 수 없습니다.'
    )
  }
  try {
    const buffer = Buffer.from(encrypted, 'base64')
    return safeStorage.decryptString(buffer)
  } catch {
    // 기존 암호화되지 않은 데이터 마이그레이션을 위한 폴백 (deprecated)
    console.warn(
      '[보안 경고] 암호화되지 않은 자격 증명이 감지되었습니다. 계정을 다시 추가하여 암호화를 적용해주세요.'
    )
    return Buffer.from(encrypted, 'base64').toString()
  }
}

// 클라우드 자격 증명 암호화/복호화 헬퍼
function encryptCloudCredentials(credentials: CloudCredentials): CloudCredentials {
  const encrypted: CloudCredentials = {
    ...credentials,
    accessToken: encryptString(credentials.accessToken)
  }
  if (credentials.refreshToken) {
    encrypted.refreshToken = encryptString(credentials.refreshToken)
  }
  return encrypted
}

function decryptCloudCredentials(credentials: CloudCredentials): CloudCredentials {
  try {
    const decrypted: CloudCredentials = {
      ...credentials,
      accessToken: decryptString(credentials.accessToken)
    }
    if (credentials.refreshToken) {
      decrypted.refreshToken = decryptString(credentials.refreshToken)
    }
    return decrypted
  } catch {
    // 복호화 실패 시 (기존 평문 데이터) 원본 반환
    return credentials
  }
}

// 암호화 여부 확인 (이미 암호화된 데이터인지 판단)
function isEncrypted(str: string): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  try {
    const buffer = Buffer.from(str, 'base64')
    safeStorage.decryptString(buffer)
    return true
  } catch {
    return false
  }
}

// =====================================================
// 전역 설정 함수
// =====================================================

export function getGlobalSettings(): GlobalSettings {
  return getConfigStore().get('global', defaultGlobalSettings)
}

export function updateGlobalSettings(updates: Partial<GlobalSettings>): {
  success: boolean
  settings?: GlobalSettings
  error?: string
} {
  try {
    const store = getConfigStore()
    const current = getGlobalSettings()
    // Deep merge for nested objects
    const updated = deepMerge(current, updates) as GlobalSettings
    store.set('global', updated)
    console.log('[Settings] Global settings saved:', JSON.stringify(updated, null, 2))
    return { success: true, settings: updated }
  } catch (err) {
    console.error('[Settings] Failed to save global settings:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update global settings'
    }
  }
}

// Deep merge utility for nested objects
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target }
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key]
      const targetValue = target[key]
      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        ;(result as Record<string, unknown>)[key] = deepMerge(
          targetValue as object,
          sourceValue as object
        )
      } else if (sourceValue !== undefined) {
        ;(result as Record<string, unknown>)[key] = sourceValue
      }
    }
  }
  return result
}

export function resetGlobalSettings(): { success: boolean; settings?: GlobalSettings } {
  const store = getConfigStore()
  store.set('global', defaultGlobalSettings)
  return { success: true, settings: defaultGlobalSettings }
}

// =====================================================
// 계정별 앱 설정 함수
// =====================================================

function getAccountSettings(accountEmail: string): AccountSettings {
  const accounts = getConfigStore().get('accounts', {})
  return accounts[accountEmail] || { ...defaultAccountSettings }
}

function setAccountSettings(accountEmail: string, settings: AccountSettings): void {
  const store = getConfigStore()
  const accounts = store.get('accounts', {})
  accounts[accountEmail] = settings
  store.set('accounts', accounts)
}

export function getAppSettings(accountEmail: string): AccountAppSettings {
  return getAccountSettings(accountEmail).app
}

export function updateAppSettings(
  accountEmail: string,
  updates: Partial<AccountAppSettings>
): { success: boolean; settings?: AccountAppSettings; error?: string } {
  try {
    const settings = getAccountSettings(accountEmail)
    // Deep merge for nested objects (toolbar, delayedSend)
    settings.app = deepMerge(settings.app, updates) as AccountAppSettings
    setAccountSettings(accountEmail, settings)
    console.log(
      `[Settings] App settings saved for ${accountEmail}:`,
      JSON.stringify(settings.app, null, 2)
    )
    return { success: true, settings: settings.app }
  } catch (err) {
    console.error(`[Settings] Failed to save app settings for ${accountEmail}:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update settings'
    }
  }
}

export function resetAppSettings(accountEmail: string): {
  success: boolean
  settings?: AccountAppSettings
} {
  const settings = getAccountSettings(accountEmail)
  settings.app = { ...defaultAccountAppSettings }
  setAccountSettings(accountEmail, settings)
  return { success: true, settings: settings.app }
}

// =====================================================
// AI 설정 함수
// =====================================================

export function getAISettings(accountEmail: string): AccountAISettings {
  const settings = getAccountSettings(accountEmail)

  // Decrypt API keys for return
  const decryptedSettings: AccountAISettings = {
    ...settings.ai,
    credentials: {}
  }

  if (settings.ai.credentials.openai) {
    decryptedSettings.credentials.openai = {
      ...settings.ai.credentials.openai,
      apiKey: decryptString(settings.ai.credentials.openai.apiKey)
    }
  }
  if (settings.ai.credentials.anthropic) {
    decryptedSettings.credentials.anthropic = {
      ...settings.ai.credentials.anthropic,
      apiKey: decryptString(settings.ai.credentials.anthropic.apiKey)
    }
  }
  if (settings.ai.credentials.google) {
    decryptedSettings.credentials.google = {
      ...settings.ai.credentials.google,
      apiKey: decryptString(settings.ai.credentials.google.apiKey)
    }
  }

  return decryptedSettings
}

export function updateAISettings(
  accountEmail: string,
  updates: Partial<AccountAISettings>
): { success: boolean; settings?: AccountAISettings; error?: string } {
  try {
    const settings = getAccountSettings(accountEmail)

    // Encrypt API keys if credentials are being updated
    const encryptedUpdates = { ...updates }
    if (updates.credentials) {
      encryptedUpdates.credentials = {}
      if (updates.credentials.openai) {
        encryptedUpdates.credentials.openai = {
          ...updates.credentials.openai,
          apiKey: encryptString(updates.credentials.openai.apiKey)
        }
      }
      if (updates.credentials.anthropic) {
        encryptedUpdates.credentials.anthropic = {
          ...updates.credentials.anthropic,
          apiKey: encryptString(updates.credentials.anthropic.apiKey)
        }
      }
      if (updates.credentials.google) {
        encryptedUpdates.credentials.google = {
          ...updates.credentials.google,
          apiKey: encryptString(updates.credentials.google.apiKey)
        }
      }
    }

    settings.ai = {
      ...settings.ai,
      ...encryptedUpdates,
      credentials: {
        ...settings.ai.credentials,
        ...encryptedUpdates.credentials
      },
      features: {
        ...settings.ai.features,
        ...updates.features
      }
    }

    setAccountSettings(accountEmail, settings)
    return { success: true, settings: getAISettings(accountEmail) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export function resetAISettings(accountEmail: string): {
  success: boolean
  settings?: AccountAISettings
} {
  const settings = getAccountSettings(accountEmail)
  settings.ai = { ...defaultAccountAISettings }
  setAccountSettings(accountEmail, settings)
  return { success: true, settings: defaultAccountAISettings }
}

export function setProviderCredential(
  accountEmail: string,
  provider: LLMProvider,
  apiKey: string,
  validated: boolean = false
): { success: boolean; error?: string } {
  try {
    const settings = getAccountSettings(accountEmail)

    const credential: ProviderCredential = {
      apiKey: encryptString(apiKey),
      validated,
      lastValidated: validated ? Date.now() : undefined
    }

    settings.ai.credentials[provider] = credential

    if (!settings.ai.activeProvider) {
      settings.ai.activeProvider = provider
    }

    setAccountSettings(accountEmail, settings)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export function deleteProviderCredential(
  accountEmail: string,
  provider: LLMProvider
): { success: boolean; error?: string } {
  try {
    const settings = getAccountSettings(accountEmail)

    delete settings.ai.credentials[provider]

    if (settings.ai.activeProvider === provider) {
      settings.ai.activeProvider = undefined
    }

    setAccountSettings(accountEmail, settings)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export function setActiveProvider(
  accountEmail: string,
  provider: LLMProvider
): { success: boolean; error?: string } {
  try {
    const settings = getAccountSettings(accountEmail)

    if (!settings.ai.credentials[provider]) {
      return { success: false, error: 'Provider credentials not found' }
    }

    settings.ai.activeProvider = provider
    setAccountSettings(accountEmail, settings)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export function toggleFeature(
  accountEmail: string,
  featureId: AIFeatureId,
  enabled: boolean
): { success: boolean; error?: string } {
  try {
    const settings = getAccountSettings(accountEmail)
    settings.ai.features[featureId] = { ...settings.ai.features[featureId], enabled }
    setAccountSettings(accountEmail, settings)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export function markProviderValidated(
  accountEmail: string,
  provider: LLMProvider,
  validated: boolean
): { success: boolean; error?: string } {
  try {
    const settings = getAccountSettings(accountEmail)
    const credential = settings.ai.credentials[provider]

    if (!credential) {
      return { success: false, error: 'Provider credentials not found' }
    }

    credential.validated = validated
    if (validated) {
      credential.lastValidated = Date.now()
    }

    setAccountSettings(accountEmail, settings)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export function getProviderApiKey(accountEmail: string, provider: LLMProvider): string | null {
  const settings = getAISettings(accountEmail)
  return settings.credentials[provider]?.apiKey || null
}

export function hasValidProvider(accountEmail: string): boolean {
  const settings = getAISettings(accountEmail)
  return Object.values(settings.credentials).some((cred) => cred?.validated)
}

export function getActiveProviderKey(
  accountEmail: string
): { provider: LLMProvider; apiKey: string } | null {
  const settings = getAISettings(accountEmail)
  if (!settings.activeProvider) return null

  const apiKey = settings.credentials[settings.activeProvider]?.apiKey
  if (!apiKey) return null

  return { provider: settings.activeProvider, apiKey }
}

// =====================================================
// 클라우드 스토리지 함수
// =====================================================

export function getCloudStorageSettings(): CloudStorageSettings {
  return getCredentialsStore().get('cloudStorage.settings')
}

export function updateCloudStorageSettings(
  updates: Partial<CloudStorageSettings>
): CloudStorageSettings {
  const store = getCredentialsStore()
  const current = store.get('cloudStorage.settings')
  const updated = { ...current, ...updates }
  store.set('cloudStorage.settings', updated)
  return updated
}

export function getCloudCredentials(provider: CloudProvider): CloudCredentials | undefined {
  const credentials = getCredentialsStore().get('cloudStorage.credentials')
  const stored = credentials[provider]
  if (!stored) return undefined

  // 자격 증명 복호화 후 반환
  const decrypted = decryptCloudCredentials(stored)

  // 기존 평문 데이터인 경우 암호화하여 다시 저장
  if (!isEncrypted(stored.accessToken)) {
    const store = getCredentialsStore()
    const current = store.get('cloudStorage.credentials')
    store.set('cloudStorage.credentials', { ...current, [provider]: encryptCloudCredentials(stored) })
  }

  return decrypted
}

export function saveCloudCredentials(provider: CloudProvider, credentials: CloudCredentials): void {
  const store = getCredentialsStore()
  const current = store.get('cloudStorage.credentials')
  // 자격 증명 암호화 후 저장
  const encrypted = encryptCloudCredentials(credentials)
  store.set('cloudStorage.credentials', { ...current, [provider]: encrypted })
}

export function removeCloudCredentials(provider: CloudProvider): void {
  const store = getCredentialsStore()
  const current = store.get('cloudStorage.credentials')
  delete current[provider]
  store.set('cloudStorage.credentials', current)
}

export function isCloudProviderConnected(provider: CloudProvider): boolean {
  if (provider === 'transfer-sh') return true
  const credentials = getCloudCredentials(provider)
  if (!credentials) return false
  if (credentials.expiresAt && Date.now() > credentials.expiresAt) {
    return false
  }
  return true
}

// =====================================================
// 계정 삭제 시 정리
// =====================================================

export function removeAccountSettings(accountEmail: string): void {
  const store = getConfigStore()
  const accounts = store.get('accounts', {})
  delete accounts[accountEmail]
  store.set('accounts', accounts)
}

export function removeAccountCredentials(_accountEmail: string): void {
  // 계정별 자격 증명 정리 (향후 확장용)
}

// =====================================================
// 앱 초기화 (모든 데이터 삭제)
// =====================================================

export function clearAllData(): { success: boolean; error?: string } {
  try {
    // config 스토어 초기화 - defaults로 재설정
    const config = getConfigStore()
    config.set('global', defaultGlobalSettings)
    config.set('accounts', {})

    // credentials 스토어 초기화 - defaults로 재설정
    const credentials = getCredentialsStore()
    credentials.set('cloudStorage', {
      settings: {
        autoSelectByAccount: true,
        fileSizeThreshold: 10
      },
      credentials: {}
    })

    console.log('[Settings] All data cleared successfully')
    return { success: true }
  } catch (err) {
    console.error('[Settings] Failed to clear all data:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to clear all data'
    }
  }
}

// =====================================================
// 기존 설정 마이그레이션
// =====================================================

export function migrateFromOldStores(): void {
  // 이 함수는 json-migration.ts에서 호출됨
  // 기존 분산된 JSON 파일들을 통합 스토어로 마이그레이션
}

// =====================================================
// Export defaults for external use
// =====================================================

export {
  defaultGlobalSettings,
  defaultAccountAppSettings,
  defaultAccountAISettings,
  defaultAccountSettings
}
