/**
 * E2E Encryption Service
 * Provides IPC handlers for E2E encryption operations
 */

import { ipcMain } from 'electron'
import { SignalCrypto, isE2EEncrypted, hasE2EHeader, createE2EHeaders, runE2ETests } from './e2e'
import { logger, LogCategory } from './logger'

// Cache for SignalCrypto instances per account
const cryptoInstances: Map<string, SignalCrypto> = new Map()

/**
 * Get or create SignalCrypto instance for an account
 */
function getCrypto(accountEmail: string): SignalCrypto {
  let crypto = cryptoInstances.get(accountEmail)
  if (!crypto) {
    crypto = new SignalCrypto(accountEmail)
    cryptoInstances.set(accountEmail, crypto)
  }
  return crypto
}

/**
 * Register all E2E IPC handlers
 */
export function registerE2EHandlers(): void {
  // ============ User Registration & Key Management ============

  /**
   * Register user for E2E encryption
   * Generates identity keys, signed pre-key, and one-time pre-keys
   */
  ipcMain.handle('e2e-register', async (_event, accountEmail: string) => {
    try {
      const crypto = getCrypto(accountEmail)
      const keyManager = crypto.getKeyManager()
      const result = await keyManager.registerUser()

      if (result.success && result.publicKeyBundle) {
        // Return the public key bundle for sharing
        return {
          success: true,
          keyBundle: {
            registrationId: result.publicKeyBundle.registrationId,
            identityKey: result.publicKeyBundle.identityKey.toString('base64'),
            signedPreKey: {
              keyId: result.publicKeyBundle.signedPreKey.keyId,
              publicKey: result.publicKeyBundle.signedPreKey.publicKey.toString('base64'),
              signature: result.publicKeyBundle.signedPreKey.signature.toString('base64')
            },
            preKey: result.publicKeyBundle.preKey
              ? {
                  keyId: result.publicKeyBundle.preKey.keyId,
                  publicKey: result.publicKeyBundle.preKey.publicKey.toString('base64')
                }
              : undefined
          }
        }
      }

      return result
    } catch (error) {
      logger.error(LogCategory.E2E, 'E2E registration failed', {
        error: error instanceof Error ? error.message : 'Registration failed'
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed'
      }
    }
  })

  /**
   * Check if user is registered for E2E
   */
  ipcMain.handle('e2e-is-registered', async (_event, accountEmail: string) => {
    try {
      const crypto = getCrypto(accountEmail)
      const keyManager = crypto.getKeyManager()
      return await keyManager.isRegistered()
    } catch {
      return false
    }
  })

  /**
   * Export own public key bundle for sharing
   */
  ipcMain.handle('e2e-export-key-bundle', async (_event, accountEmail: string) => {
    try {
      const crypto = getCrypto(accountEmail)
      const keyManager = crypto.getKeyManager()
      const bundle = await keyManager.exportPublicKeyBundle()

      if (!bundle) {
        return { success: false, error: 'Not registered or keys not available' }
      }

      return {
        success: true,
        keyBundle: {
          registrationId: bundle.registrationId,
          identityKey: bundle.identityKey.toString('base64'),
          signedPreKey: {
            keyId: bundle.signedPreKey.keyId,
            publicKey: bundle.signedPreKey.publicKey.toString('base64'),
            signature: bundle.signedPreKey.signature.toString('base64')
          },
          preKey: bundle.preKey
            ? {
                keyId: bundle.preKey.keyId,
                publicKey: bundle.preKey.publicKey.toString('base64')
              }
            : undefined
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Export failed'
      }
    }
  })

  /**
   * Import a contact's key bundle
   */
  ipcMain.handle(
    'e2e-import-key-bundle',
    async (
      _event,
      accountEmail: string,
      contactEmail: string,
      bundleData: {
        registrationId: number
        identityKey: string
        signedPreKey: {
          keyId: number
          publicKey: string
          signature: string
        }
        preKey?: {
          keyId: number
          publicKey: string
        }
      }
    ) => {
      try {
        const crypto = getCrypto(accountEmail)
        const keyManager = crypto.getKeyManager()
        return await keyManager.importKeyBundle(contactEmail, bundleData)
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Import failed'
        }
      }
    }
  )

  /**
   * Refresh one-time pre-keys
   */
  ipcMain.handle('e2e-refresh-otpks', async (_event, accountEmail: string) => {
    try {
      const crypto = getCrypto(accountEmail)
      const keyManager = crypto.getKeyManager()
      return await keyManager.refreshOTPKs()
    } catch (error) {
      return {
        success: false,
        newKeyCount: 0,
        error: error instanceof Error ? error.message : 'Refresh failed'
      }
    }
  })

  // ============ Encryption & Decryption ============

  /**
   * Encrypt email content for a recipient
   */
  ipcMain.handle(
    'e2e-encrypt',
    async (_event, accountEmail: string, recipientEmail: string, plaintext: string) => {
      try {
        const crypto = getCrypto(accountEmail)
        return await crypto.encryptEmail(recipientEmail, plaintext)
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Encryption failed'
        }
      }
    }
  )

  /**
   * Decrypt email content from a sender
   */
  ipcMain.handle(
    'e2e-decrypt',
    async (_event, accountEmail: string, senderEmail: string, encryptedPayload: string) => {
      try {
        const crypto = getCrypto(accountEmail)
        return await crypto.decryptEmail(senderEmail, encryptedPayload)
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Decryption failed'
        }
      }
    }
  )

  // ============ Session Management ============

  /**
   * Check if session exists with recipient
   */
  ipcMain.handle(
    'e2e-has-session',
    async (_event, accountEmail: string, recipientEmail: string) => {
      try {
        const crypto = getCrypto(accountEmail)
        return await crypto.hasSession(recipientEmail)
      } catch {
        return false
      }
    }
  )

  /**
   * Delete session with recipient
   */
  ipcMain.handle(
    'e2e-delete-session',
    async (_event, accountEmail: string, recipientEmail: string) => {
      try {
        const crypto = getCrypto(accountEmail)
        await crypto.deleteSession(recipientEmail)
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Session deletion failed'
        }
      }
    }
  )

  /**
   * Fetch key bundle for recipient
   */
  ipcMain.handle(
    'e2e-fetch-key-bundle',
    async (_event, accountEmail: string, recipientEmail: string) => {
      try {
        const crypto = getCrypto(accountEmail)
        const keyManager = crypto.getKeyManager()
        const result = await keyManager.fetchKeyBundle(recipientEmail)

        if (result.success && result.bundle) {
          return {
            success: true,
            keyBundle: {
              registrationId: result.bundle.registrationId,
              identityKey: result.bundle.identityKey.toString('base64'),
              signedPreKey: {
                keyId: result.bundle.signedPreKey.keyId,
                publicKey: result.bundle.signedPreKey.publicKey.toString('base64'),
                signature: result.bundle.signedPreKey.signature.toString('base64')
              },
              preKey: result.bundle.preKey
                ? {
                    keyId: result.bundle.preKey.keyId,
                    publicKey: result.bundle.preKey.publicKey.toString('base64')
                  }
                : undefined
            }
          }
        }

        return result
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Fetch failed'
        }
      }
    }
  )

  // ============ Utility Functions ============

  /**
   * Check if email body is E2E encrypted
   */
  ipcMain.handle('e2e-is-encrypted', async (_event, emailBody: string) => {
    return isE2EEncrypted(emailBody)
  })

  /**
   * Check if email has E2E header
   */
  ipcMain.handle('e2e-has-header', async (_event, headers: Record<string, string>) => {
    return hasE2EHeader(headers)
  })

  /**
   * Get E2E headers for email
   */
  ipcMain.handle('e2e-get-headers', async () => {
    return createE2EHeaders()
  })

  /**
   * Get identity key fingerprint for verification
   */
  ipcMain.handle(
    'e2e-get-fingerprint',
    async (_event, accountEmail: string, contactEmail?: string) => {
      try {
        const crypto = getCrypto(accountEmail)
        const store = crypto.getKeyManager().getStore()

        if (contactEmail) {
          // Get remote identity fingerprint
          const remoteKey = await store.getRemoteIdentity(contactEmail)
          if (!remoteKey) {
            return { success: false, error: 'No key found for contact' }
          }
          const fingerprint = formatFingerprint(remoteKey)
          return { success: true, fingerprint }
        } else {
          // Get own identity fingerprint
          const identity = await store.getIdentityKeyPair()
          if (!identity) {
            return { success: false, error: 'Not registered' }
          }
          const fingerprint = formatFingerprint(identity.publicKey)
          return { success: true, fingerprint }
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get fingerprint'
        }
      }
    }
  )

  /**
   * Clear all E2E data for account
   */
  ipcMain.handle('e2e-clear-all', async (_event, accountEmail: string) => {
    try {
      const crypto = getCrypto(accountEmail)
      const store = crypto.getKeyManager().getStore()
      await store.clearAll()
      cryptoInstances.delete(accountEmail)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Clear failed'
      }
    }
  })

  /**
   * Run E2E tests
   */
  ipcMain.handle('e2e-run-tests', async () => {
    try {
      const results = await runE2ETests()
      return {
        success: true,
        ...results
      }
    } catch (error) {
      return {
        success: false,
        passed: 0,
        failed: 0,
        results: [],
        error: error instanceof Error ? error.message : 'Test failed'
      }
    }
  })

  logger.info(LogCategory.E2E, 'E2E encryption handlers registered')
}

/**
 * Format key as fingerprint for verification
 */
function formatFingerprint(key: Buffer): string {
  const crypto = require('crypto')
  const hash = crypto.createHash('sha256').update(key).digest('hex')
  // Format as 8 groups of 4 characters
  return (
    hash
      .slice(0, 32)
      .toUpperCase()
      .match(/.{1,4}/g)
      ?.join(' ') || hash.slice(0, 32).toUpperCase()
  )
}
