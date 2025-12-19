/**
 * Unified Encryption Service
 * Provides IPC handlers for PGP, S/MIME, and Signal Protocol encryption
 */

import { ipcMain } from 'electron'
import { logger, LogCategory } from '../logger'

// PGP Service
import {
  generatePGPKeyPair,
  loadPGPKeyPair,
  isPGPSetup,
  exportPublicKey as exportPGPPublicKey,
  importPublicKey as importPGPPublicKey,
  getContactPublicKey as getPGPContactKey,
  listPGPContacts,
  encryptPGP,
  decryptPGP,
  isPGPEncrypted,
  deletePGPKeys,
  deleteContactKey as deletePGPContactKey
} from './pgp-service'

// S/MIME Service
import {
  generateSMIMECertificate,
  loadSMIMECertificate,
  isSMIMESetup,
  exportCertificate as exportSMIMECertificate,
  importCertificate as importSMIMECertificate,
  importPKCS12,
  getContactCertificate as getSMIMEContactCert,
  listSMIMEContacts,
  encryptSMIME,
  decryptSMIME,
  isSMIMEEncrypted,
  deleteSMIMECertificate,
  deleteContactCertificate as deleteSMIMEContactCert
} from './smime-service'

// Re-export for convenience
export * from './pgp-service'
export * from './smime-service'

export type EncryptionMethod = 'none' | 'signal' | 'pgp' | 'smime'

// =====================================================
// 보안 검증 헬퍼
// =====================================================

const MAX_PASSPHRASE_LENGTH = 1024
const MIN_PASSPHRASE_LENGTH = 8

interface PassphraseValidationResult {
  valid: boolean
  error?: string
}

/**
 * 패스프레이즈 검증 (보안)
 */
function validatePassphrase(passphrase: string): PassphraseValidationResult {
  if (typeof passphrase !== 'string') {
    return { valid: false, error: '패스프레이즈는 문자열이어야 합니다.' }
  }

  if (passphrase.length > MAX_PASSPHRASE_LENGTH) {
    return {
      valid: false,
      error: `패스프레이즈는 ${MAX_PASSPHRASE_LENGTH}자를 초과할 수 없습니다.`
    }
  }

  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return { valid: false, error: `패스프레이즈는 최소 ${MIN_PASSPHRASE_LENGTH}자 이상이어야 합니다.` }
  }

  return { valid: true }
}

/**
 * Register all encryption-related IPC handlers
 */
export function registerEncryptionHandlers(): void {
  // ============ PGP Handlers ============

  /**
   * Generate PGP key pair
   */
  ipcMain.handle(
    'pgp-generate-keys',
    async (_event, accountEmail: string, name: string, passphrase: string) => {
      // 패스프레이즈 검증
      const validation = validatePassphrase(passphrase)
      if (!validation.valid) {
        logger.warn(LogCategory.ENCRYPTION, 'Invalid passphrase', { error: validation.error })
        return { success: false, error: validation.error }
      }

      return await generatePGPKeyPair(accountEmail, name, passphrase)
    }
  )

  /**
   * Check if PGP is set up
   */
  ipcMain.handle('pgp-is-setup', async (_event, accountEmail: string) => {
    return await isPGPSetup(accountEmail)
  })

  /**
   * Load PGP key pair info
   */
  ipcMain.handle('pgp-load-keys', async (_event, accountEmail: string) => {
    const result = await loadPGPKeyPair(accountEmail)
    if (result.success && result.keyPair) {
      // Don't return private key to renderer
      return {
        success: true,
        keyInfo: {
          fingerprint: result.keyPair.fingerprint,
          keyId: result.keyPair.keyId,
          userId: result.keyPair.userId,
          createdAt: result.keyPair.createdAt
        }
      }
    }
    return result
  })

  /**
   * Export PGP public key
   */
  ipcMain.handle('pgp-export-public-key', async (_event, accountEmail: string) => {
    return await exportPGPPublicKey(accountEmail)
  })

  /**
   * Import contact's PGP public key
   */
  ipcMain.handle(
    'pgp-import-public-key',
    async (_event, accountEmail: string, contactEmail: string, armoredKey: string) => {
      return await importPGPPublicKey(accountEmail, contactEmail, armoredKey)
    }
  )

  /**
   * Get contact's PGP key
   */
  ipcMain.handle(
    'pgp-get-contact-key',
    async (_event, accountEmail: string, contactEmail: string) => {
      return await getPGPContactKey(accountEmail, contactEmail)
    }
  )

  /**
   * List PGP contacts
   */
  ipcMain.handle('pgp-list-contacts', async (_event, accountEmail: string) => {
    return await listPGPContacts(accountEmail)
  })

  /**
   * Encrypt with PGP
   */
  ipcMain.handle(
    'pgp-encrypt',
    async (
      _event,
      accountEmail: string,
      recipientEmails: string[],
      plaintext: string,
      sign: boolean,
      passphrase?: string
    ) => {
      return await encryptPGP(accountEmail, recipientEmails, plaintext, sign, passphrase)
    }
  )

  /**
   * Decrypt PGP message
   */
  ipcMain.handle(
    'pgp-decrypt',
    async (_event, accountEmail: string, encryptedMessage: string, passphrase: string) => {
      return await decryptPGP(accountEmail, encryptedMessage, passphrase)
    }
  )

  /**
   * Check if PGP encrypted
   */
  ipcMain.handle('pgp-is-encrypted', async (_event, content: string) => {
    return isPGPEncrypted(content)
  })

  /**
   * Delete PGP keys
   */
  ipcMain.handle('pgp-delete-keys', async (_event, accountEmail: string) => {
    return await deletePGPKeys(accountEmail)
  })

  /**
   * Delete PGP contact key
   */
  ipcMain.handle(
    'pgp-delete-contact-key',
    async (_event, accountEmail: string, contactEmail: string) => {
      return await deletePGPContactKey(accountEmail, contactEmail)
    }
  )

  // ============ S/MIME Handlers ============

  /**
   * Generate S/MIME certificate
   */
  ipcMain.handle(
    'smime-generate-cert',
    async (
      _event,
      accountEmail: string,
      name: string,
      passphrase: string,
      validityDays?: number
    ) => {
      return await generateSMIMECertificate(accountEmail, name, passphrase, validityDays)
    }
  )

  /**
   * Check if S/MIME is set up
   */
  ipcMain.handle('smime-is-setup', async (_event, accountEmail: string) => {
    return await isSMIMESetup(accountEmail)
  })

  /**
   * Load S/MIME certificate info
   */
  ipcMain.handle('smime-load-cert', async (_event, accountEmail: string) => {
    const result = await loadSMIMECertificate(accountEmail)
    if (result.success && result.certificate) {
      // Don't return private key to renderer
      return {
        success: true,
        certInfo: {
          fingerprint: result.certificate.fingerprint,
          subject: result.certificate.subject,
          issuer: result.certificate.issuer,
          validFrom: result.certificate.validFrom,
          validTo: result.certificate.validTo,
          email: result.certificate.email,
          createdAt: result.certificate.createdAt
        }
      }
    }
    return result
  })

  /**
   * Export S/MIME certificate
   */
  ipcMain.handle('smime-export-cert', async (_event, accountEmail: string) => {
    return await exportSMIMECertificate(accountEmail)
  })

  /**
   * Import contact's S/MIME certificate
   */
  ipcMain.handle(
    'smime-import-cert',
    async (_event, accountEmail: string, contactEmail: string, certPem: string) => {
      return await importSMIMECertificate(accountEmail, contactEmail, certPem)
    }
  )

  /**
   * Import PKCS#12 (PFX) file
   */
  ipcMain.handle(
    'smime-import-pkcs12',
    async (
      _event,
      accountEmail: string,
      pfxBase64: string,
      pfxPassword: string,
      newPassphrase: string
    ) => {
      return await importPKCS12(accountEmail, pfxBase64, pfxPassword, newPassphrase)
    }
  )

  /**
   * Get contact's S/MIME certificate
   */
  ipcMain.handle(
    'smime-get-contact-cert',
    async (_event, accountEmail: string, contactEmail: string) => {
      return await getSMIMEContactCert(accountEmail, contactEmail)
    }
  )

  /**
   * List S/MIME contacts
   */
  ipcMain.handle('smime-list-contacts', async (_event, accountEmail: string) => {
    return await listSMIMEContacts(accountEmail)
  })

  /**
   * Encrypt with S/MIME
   */
  ipcMain.handle(
    'smime-encrypt',
    async (
      _event,
      accountEmail: string,
      recipientEmails: string[],
      content: string,
      sign: boolean,
      passphrase?: string
    ) => {
      return await encryptSMIME(accountEmail, recipientEmails, content, sign, passphrase)
    }
  )

  /**
   * Decrypt S/MIME message
   */
  ipcMain.handle(
    'smime-decrypt',
    async (_event, accountEmail: string, encryptedMessage: string, passphrase: string) => {
      return await decryptSMIME(accountEmail, encryptedMessage, passphrase)
    }
  )

  /**
   * Check if S/MIME encrypted
   */
  ipcMain.handle('smime-is-encrypted', async (_event, content: string) => {
    return isSMIMEEncrypted(content)
  })

  /**
   * Delete S/MIME certificate
   */
  ipcMain.handle('smime-delete-cert', async (_event, accountEmail: string) => {
    return await deleteSMIMECertificate(accountEmail)
  })

  /**
   * Delete S/MIME contact certificate
   */
  ipcMain.handle(
    'smime-delete-contact-cert',
    async (_event, accountEmail: string, contactEmail: string) => {
      return await deleteSMIMEContactCert(accountEmail, contactEmail)
    }
  )

  // ============ Unified Detection Handler ============

  /**
   * Detect encryption type of a message
   */
  ipcMain.handle('detect-encryption-type', async (_event, content: string) => {
    if (isPGPEncrypted(content)) {
      return 'pgp'
    }
    if (isSMIMEEncrypted(content)) {
      return 'smime'
    }
    // Check Signal Protocol (from e2e module)
    if (content.includes('E2E:') || content.includes('"protocol":"signal-v1"')) {
      return 'signal'
    }
    return 'none'
  })

  /**
   * Get available encryption methods for account
   */
  ipcMain.handle('get-available-encryption', async (_event, accountEmail: string) => {
    const available: EncryptionMethod[] = ['none']

    // Signal Protocol is always potentially available (checked via e2e-is-registered)
    available.push('signal')

    // Check PGP
    if (await isPGPSetup(accountEmail)) {
      available.push('pgp')
    }

    // Check S/MIME
    if (await isSMIMESetup(accountEmail)) {
      available.push('smime')
    }

    return available
  })

  /**
   * Check if contact has encryption keys
   */
  ipcMain.handle(
    'check-contact-encryption',
    async (_event, accountEmail: string, contactEmail: string) => {
      const result: { pgp: boolean; smime: boolean; signal: boolean } = {
        pgp: false,
        smime: false,
        signal: false
      }

      // Check PGP
      const pgpResult = await getPGPContactKey(accountEmail, contactEmail)
      result.pgp = pgpResult.success

      // Check S/MIME
      const smimeResult = await getSMIMEContactCert(accountEmail, contactEmail)
      result.smime = smimeResult.success

      // Signal would need separate check from e2e-service

      return result
    }
  )

  logger.info(LogCategory.ENCRYPTION, 'PGP and S/MIME encryption handlers registered')
}
