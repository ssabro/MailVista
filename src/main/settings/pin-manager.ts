/**
 * PIN 코드 관리
 */
import * as crypto from 'crypto'
import { getGlobalSettings, updateGlobalSettings } from './global-settings'

/**
 * PIN을 해시화 (SHA-256)
 */
function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex')
}

/**
 * PIN 설정
 */
export function setPin(pin: string): { success: boolean; error?: string } {
  try {
    // PIN이 6자리 숫자인지 검증
    if (!/^\d{6}$/.test(pin)) {
      return { success: false, error: 'PIN must be 6 digits' }
    }

    const hashedPin = hashPin(pin)
    const result = updateGlobalSettings({
      security: {
        ...getGlobalSettings().security,
        pinEnabled: true,
        pinHash: hashedPin
      }
    })

    return { success: result.success, error: result.error }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to set PIN'
    }
  }
}

/**
 * PIN 검증
 */
export function verifyPin(pin: string): { success: boolean; valid: boolean; error?: string } {
  try {
    const settings = getGlobalSettings()

    if (!settings.security.pinEnabled || !settings.security.pinHash) {
      return { success: false, valid: false, error: 'PIN is not enabled' }
    }

    const hashedInput = hashPin(pin)
    const valid = hashedInput === settings.security.pinHash

    return { success: true, valid }
  } catch (err) {
    return {
      success: false,
      valid: false,
      error: err instanceof Error ? err.message : 'Failed to verify PIN'
    }
  }
}

/**
 * PIN 비활성화
 */
export function disablePin(): { success: boolean; error?: string } {
  try {
    const result = updateGlobalSettings({
      security: {
        ...getGlobalSettings().security,
        pinEnabled: false,
        pinHash: null
      }
    })

    return { success: result.success, error: result.error }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to disable PIN'
    }
  }
}

/**
 * PIN이 활성화되어 있는지 확인
 */
export function isPinEnabled(): boolean {
  const settings = getGlobalSettings()
  return settings.security.pinEnabled && settings.security.pinHash !== null
}
