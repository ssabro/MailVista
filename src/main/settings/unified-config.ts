/**
 * 통합 설정 관리
 * - config.json: 모든 앱 설정 (전역 + 계정별)
 * - credentials.json: OAuth 및 클라우드 스토리지 자격 증명
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

// OAuth 토큰
export interface OAuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scope: string
  email?: string
}

export type OAuthProvider = 'google' | 'microsoft'

export interface OAuthConfig {
  clientId: string
  clientSecret: string
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
  oauth: {
    tokens: {
      [email: string]: {
        provider: OAuthProvider
        tokens: OAuthTokens
      }
    }
    configs: {
      google?: OAuthConfig
      microsoft?: OAuthConfig
    }
  }
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
        oauth: {
          tokens: {},
          configs: {}
        },
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

function encryptString(str: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(str).toString('base64')
  }
  return Buffer.from(str).toString('base64')
}

function decryptString(encrypted: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const buffer = Buffer.from(encrypted, 'base64')
      return safeStorage.decryptString(buffer)
    } catch {
      return Buffer.from(encrypted, 'base64').toString()
    }
  }
  return Buffer.from(encrypted, 'base64').toString()
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
// OAuth 함수
// =====================================================

export function saveOAuthConfig(provider: OAuthProvider, config: OAuthConfig): void {
  const store = getCredentialsStore()
  const oauth = store.get('oauth')
  oauth.configs[provider] = config
  store.set('oauth', oauth)
}

export function getOAuthConfig(provider: OAuthProvider): OAuthConfig | undefined {
  const oauth = getCredentialsStore().get('oauth')
  return oauth.configs[provider]
}

export function saveOAuthTokens(email: string, provider: OAuthProvider, tokens: OAuthTokens): void {
  const store = getCredentialsStore()
  const oauth = store.get('oauth')
  oauth.tokens[email] = { provider, tokens }
  store.set('oauth', oauth)
}

export function getOAuthTokens(
  email: string
): { provider: OAuthProvider; tokens: OAuthTokens } | undefined {
  const oauth = getCredentialsStore().get('oauth')
  return oauth.tokens[email]
}

export function deleteOAuthTokens(email: string): void {
  const store = getCredentialsStore()
  const oauth = store.get('oauth')
  delete oauth.tokens[email]
  store.set('oauth', oauth)
}

export function isOAuthAccount(email: string): boolean {
  const oauth = getCredentialsStore().get('oauth')
  return !!oauth.tokens[email]
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
  return credentials[provider]
}

export function saveCloudCredentials(provider: CloudProvider, credentials: CloudCredentials): void {
  const store = getCredentialsStore()
  const current = store.get('cloudStorage.credentials')
  store.set('cloudStorage.credentials', { ...current, [provider]: credentials })
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

export function removeAccountCredentials(accountEmail: string): void {
  deleteOAuthTokens(accountEmail)
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
