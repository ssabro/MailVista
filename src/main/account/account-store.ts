/**
 * 계정 저장소 - 계정 CRUD 및 비밀번호 관리
 */
import Store from 'electron-store'
import { safeStorage } from 'electron'
import type {
  AccountConfig,
  StoredAccount,
  SaveAccountResult,
  DeleteAccountResult,
  SetDefaultResult
} from './types'

// electron-store는 ESM default export를 사용
const ElectronStore = (Store as unknown as { default: typeof Store }).default || Store

const store = new ElectronStore<{ accounts: StoredAccount[] }>({
  name: 'accounts',
  defaults: {
    accounts: []
  }
})

/**
 * 계정 저장 (신규 또는 업데이트)
 */
export function saveAccount(config: AccountConfig): SaveAccountResult {
  try {
    // 암호화 가용성 확인 - 불가능하면 저장 거부
    if (!safeStorage.isEncryptionAvailable()) {
      return {
        success: false,
        error:
          'ENCRYPTION_UNAVAILABLE: 시스템에서 암호화를 사용할 수 없습니다. 보안상의 이유로 계정을 저장할 수 없습니다.'
      }
    }

    // 비밀번호 암호화
    const encrypted = safeStorage.encryptString(config.password)
    const encryptedPassword = encrypted.toString('base64')

    const storedAccount: StoredAccount = {
      email: config.email,
      encryptedPassword,
      name: config.name,
      protocol: config.protocol,
      incoming: config.incoming,
      outgoing: config.outgoing
    }

    const accounts = store.get('accounts', [])
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

/**
 * 모든 계정 조회 (암호화된 상태)
 */
export function getAccounts(): StoredAccount[] {
  const accounts = store.get('accounts', [])
  // 방어 코드: 배열이 아닌 경우 빈 배열 반환
  return Array.isArray(accounts) ? accounts : []
}

/**
 * 비밀번호 복호화하여 계정 정보 조회
 */
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

/**
 * 계정 삭제
 */
export function deleteAccount(email: string): DeleteAccountResult {
  const accounts = store.get('accounts', [])
  // 방어 코드: 배열이 아닌 경우 빈 배열로 처리
  const accountsArray = Array.isArray(accounts) ? accounts : []
  const filtered = accountsArray.filter((a) => a.email !== email)
  store.set('accounts', filtered)
  return { success: true }
}

/**
 * 기본 계정 설정
 */
export function setDefaultAccount(email: string): SetDefaultResult {
  try {
    const accounts = store.get('accounts', [])
    // 방어 코드: 배열이 아닌 경우 빈 배열로 처리
    const accountsArray = Array.isArray(accounts) ? accounts : []
    const updated = accountsArray.map((a) => ({
      ...a,
      isDefault: a.email === email
    }))
    store.set('accounts', updated)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to set default account'
    }
  }
}

/**
 * 계정 존재 여부 확인
 */
export function hasAccounts(): boolean {
  const accounts = store.get('accounts', [])
  // 방어 코드: 배열이 아닌 경우 false 반환
  return Array.isArray(accounts) && accounts.length > 0
}

/**
 * 기본 계정 조회
 */
export function getDefaultAccount(): StoredAccount | null {
  const accounts = store.get('accounts', [])
  // 방어 코드: 배열이 아닌 경우 null 반환
  if (!Array.isArray(accounts)) return null
  return accounts.find((a) => a.isDefault) || accounts[0] || null
}

/**
 * 모든 계정 삭제 (앱 초기화용)
 */
export function clearAllAccounts(): { success: boolean; error?: string } {
  try {
    // store.clear()는 defaults를 복원하지 않으므로 빈 배열로 설정
    store.set('accounts', [])
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to clear all accounts'
    }
  }
}
