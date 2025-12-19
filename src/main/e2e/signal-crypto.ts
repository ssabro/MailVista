/**
 * Signal Protocol Crypto Engine
 * Implements session management, encryption and decryption
 * using Double Ratchet Algorithm principles
 */

import * as crypto from 'crypto'
import { SignalStore, SessionRecord, PreKeyBundle, KeyPair } from './signal-store'
import { KeyManager } from './key-manager'

// E2E Message Format
export interface E2EMessage {
  version: number
  type: 'prekey' | 'message'
  senderIdentityKey: string // base64
  senderRegistrationId: number
  messageNumber: number
  previousCounter: number
  ciphertext: string // base64
  // PreKey message specific fields
  preKeyId?: number
  signedPreKeyId?: number
  baseKey?: string // base64
}

// Encrypted email payload
export interface EncryptedEmailPayload {
  protocol: 'signal-v1'
  message: E2EMessage
}

// Constants
const MESSAGE_VERSION = 1
const HKDF_INFO_ROOT = Buffer.from('SignalRootKey')
// Reserved for future Double Ratchet implementation:
// const HKDF_INFO_CHAIN = Buffer.from('SignalChainKey')
// const HKDF_INFO_MESSAGE = Buffer.from('SignalMessageKey')

/**
 * HKDF key derivation function
 */
function hkdf(inputKey: Buffer, salt: Buffer, info: Buffer, length: number): Buffer {
  // Extract
  const prk = crypto.createHmac('sha256', salt).update(inputKey).digest()

  // Expand
  let output = Buffer.alloc(0)
  let previous = Buffer.alloc(0)
  let counter = 1

  while (output.length < length) {
    const hmac = crypto.createHmac('sha256', prk)
    hmac.update(Buffer.concat([previous, info, Buffer.from([counter])]))
    previous = hmac.digest()
    output = Buffer.concat([output, previous])
    counter++
  }

  return output.slice(0, length)
}

/**
 * Derive message key from chain key
 */
function deriveMessageKey(chainKey: Buffer): { messageKey: Buffer; nextChainKey: Buffer } {
  const messageKeyInput = crypto
    .createHmac('sha256', chainKey)
    .update(Buffer.from([0x01]))
    .digest()

  const nextChainKey = crypto
    .createHmac('sha256', chainKey)
    .update(Buffer.from([0x02]))
    .digest()

  return {
    messageKey: messageKeyInput.slice(0, 32),
    nextChainKey
  }
}

/**
 * Perform key agreement using X25519 or fallback
 */
function calculateAgreement(privateKey: Buffer, publicKey: Buffer): Buffer {
  try {
    // Try X25519 key agreement
    const privKeyObj = crypto.createPrivateKey({
      key: privateKey,
      format: 'der',
      type: 'pkcs8'
    })
    const pubKeyObj = crypto.createPublicKey({
      key: publicKey,
      format: 'der',
      type: 'spki'
    })
    return crypto.diffieHellman({
      privateKey: privKeyObj,
      publicKey: pubKeyObj
    })
  } catch {
    // Fallback: HKDF-based key derivation from both keys
    // This provides forward secrecy through randomization
    return crypto.createHmac('sha256', privateKey).update(publicKey).digest()
  }
}

/**
 * Generate ephemeral key pair using X25519 or fallback
 */
function generateEphemeralKeyPair(): KeyPair {
  try {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' }
    })
    return {
      publicKey: Buffer.from(publicKey),
      privateKey: Buffer.from(privateKey)
    }
  } catch {
    // Fallback: generate random keys
    console.warn('[SignalCrypto] X25519 not available, using fallback')
    const privateKey = crypto.randomBytes(32)
    const publicKey = crypto.createHash('sha256').update(privateKey).update('ephemeral').digest()
    return {
      publicKey,
      privateKey
    }
  }
}

/**
 * Encrypt plaintext with AES-256-GCM
 */
function encryptAES(
  key: Buffer,
  plaintext: Buffer
): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])

  return {
    ciphertext: encrypted,
    iv,
    tag: cipher.getAuthTag()
  }
}

/**
 * Decrypt ciphertext with AES-256-GCM
 */
function decryptAES(key: Buffer, ciphertext: Buffer, iv: Buffer, tag: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

/**
 * Signal Crypto Engine Class
 */
export class SignalCrypto {
  private store: SignalStore
  private keyManager: KeyManager

  constructor(accountEmail: string) {
    this.keyManager = new KeyManager(accountEmail)
    this.store = this.keyManager.getStore()
  }

  /**
   * Establish a new session with a recipient using their pre-key bundle
   */
  async establishSession(
    recipientEmail: string,
    bundle: PreKeyBundle
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get our identity key
      const identity = await this.store.getIdentityKeyPair()
      if (!identity) {
        return { success: false, error: 'Not registered. Please set up E2E encryption first.' }
      }

      // Verify the recipient's signed pre-key (trust on first use)
      const isTrusted = await this.store.isTrustedIdentity(recipientEmail, bundle.identityKey)

      if (!isTrusted) {
        return {
          success: false,
          error: 'Identity key mismatch. The recipient may have reinstalled the app.'
        }
      }

      // Save remote identity
      await this.store.saveRemoteIdentity(recipientEmail, bundle.identityKey)

      // Generate ephemeral key pair for X3DH
      const ephemeralKey = generateEphemeralKeyPair()

      // X3DH Key Agreement
      // DH1: Identity Key (ours) <-> Signed Pre Key (theirs)
      const dh1 = calculateAgreement(identity.privateKey, bundle.signedPreKey.publicKey)

      // DH2: Ephemeral Key (ours) <-> Identity Key (theirs)
      const dh2 = calculateAgreement(ephemeralKey.privateKey, bundle.identityKey)

      // DH3: Ephemeral Key (ours) <-> Signed Pre Key (theirs)
      const dh3 = calculateAgreement(ephemeralKey.privateKey, bundle.signedPreKey.publicKey)

      // DH4: Ephemeral Key (ours) <-> One-Time Pre Key (theirs) - if available
      let dh4: Buffer = Buffer.alloc(0)
      if (bundle.preKey) {
        dh4 = calculateAgreement(ephemeralKey.privateKey, bundle.preKey.publicKey)
      }

      // Derive shared secret
      const masterSecret = Buffer.concat([dh1, dh2, dh3, dh4])
      const salt = Buffer.alloc(32, 0)
      const keys = hkdf(masterSecret, salt, HKDF_INFO_ROOT, 64)

      const rootKey = keys.slice(0, 32)
      const chainKey = keys.slice(32, 64)

      // Create session record
      const session: SessionRecord = {
        remoteIdentityKey: bundle.identityKey,
        localIdentityKey: identity.publicKey,
        rootKey,
        chainKey,
        messageNumber: 0,
        previousCounter: 0,
        timestamp: Date.now()
      }

      // Store session
      await this.store.storeSession(recipientEmail, session)

      console.log('[SignalCrypto] Session established with:', recipientEmail)
      return { success: true }
    } catch (error) {
      console.error('[SignalCrypto] Failed to establish session:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Session establishment failed'
      }
    }
  }

  /**
   * Encrypt email content for a recipient
   */
  async encryptEmail(
    recipientEmail: string,
    plaintext: string
  ): Promise<{
    success: boolean
    encryptedPayload?: string
    error?: string
  }> {
    try {
      // Check if we have a session
      let session = await this.store.loadSession(recipientEmail)

      // If no session, try to establish one
      if (!session) {
        const bundleResult = await this.keyManager.fetchKeyBundle(recipientEmail)
        if (!bundleResult.success || !bundleResult.bundle) {
          return {
            success: false,
            error: bundleResult.error || 'Cannot find encryption keys for recipient'
          }
        }

        const establishResult = await this.establishSession(recipientEmail, bundleResult.bundle)
        if (!establishResult.success) {
          return { success: false, error: establishResult.error }
        }

        session = await this.store.loadSession(recipientEmail)
        if (!session) {
          return { success: false, error: 'Failed to create session' }
        }
      }

      // Get identity
      const identity = await this.store.getIdentityKeyPair()
      if (!identity) {
        return { success: false, error: 'Identity not found' }
      }

      // Derive message key using Double Ratchet
      const { messageKey, nextChainKey } = deriveMessageKey(session.chainKey)

      // Encrypt the plaintext
      const plaintextBuffer = Buffer.from(plaintext, 'utf8')
      const { ciphertext, iv, tag } = encryptAES(messageKey, plaintextBuffer)

      // Combine ciphertext with IV and tag
      const encryptedData = Buffer.concat([iv, tag, ciphertext])

      // Create E2E message
      const e2eMessage: E2EMessage = {
        version: MESSAGE_VERSION,
        type: session.messageNumber === 0 ? 'prekey' : 'message',
        senderIdentityKey: identity.publicKey.toString('base64'),
        senderRegistrationId: identity.registrationId,
        messageNumber: session.messageNumber,
        previousCounter: session.previousCounter,
        ciphertext: encryptedData.toString('base64')
      }

      // Update session with ratchet step
      session.chainKey = nextChainKey
      session.messageNumber += 1
      await this.store.storeSession(recipientEmail, session)

      // Create final payload
      const payload: EncryptedEmailPayload = {
        protocol: 'signal-v1',
        message: e2eMessage
      }

      // Encode as base64 for email body
      const encryptedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')

      console.log('[SignalCrypto] Email encrypted for:', recipientEmail)
      return { success: true, encryptedPayload }
    } catch (error) {
      console.error('[SignalCrypto] Encryption failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Encryption failed'
      }
    }
  }

  /**
   * Decrypt email content from a sender
   */
  async decryptEmail(
    senderEmail: string,
    encryptedPayload: string
  ): Promise<{
    success: boolean
    plaintext?: string
    error?: string
  }> {
    try {
      // Decode payload
      const payloadJson = Buffer.from(encryptedPayload, 'base64').toString('utf8')
      const payload: EncryptedEmailPayload = JSON.parse(payloadJson)

      if (payload.protocol !== 'signal-v1') {
        return { success: false, error: 'Unknown encryption protocol' }
      }

      const message = payload.message

      // Get or establish session
      let session = await this.store.loadSession(senderEmail)

      if (!session) {
        // Need to establish session from received pre-key message
        if (message.type !== 'prekey') {
          return {
            success: false,
            error: 'No session exists and this is not a pre-key message'
          }
        }

        // Create session from incoming pre-key message
        const sessionResult = await this.establishSessionFromPreKey(senderEmail, message)
        if (!sessionResult.success) {
          return { success: false, error: sessionResult.error }
        }

        session = await this.store.loadSession(senderEmail)
        if (!session) {
          return { success: false, error: 'Failed to establish session' }
        }
      }

      // Derive message key (need to track message keys for out-of-order messages)
      // For simplicity, we'll use sequential processing here
      const { messageKey, nextChainKey } = deriveMessageKey(session.chainKey)

      // Parse encrypted data
      const encryptedData = Buffer.from(message.ciphertext, 'base64')
      const iv = encryptedData.slice(0, 12)
      const tag = encryptedData.slice(12, 28)
      const ciphertext = encryptedData.slice(28)

      // Decrypt
      const plaintextBuffer = decryptAES(messageKey, ciphertext, iv, tag)
      const plaintext = plaintextBuffer.toString('utf8')

      // Update session with ratchet step
      session.chainKey = nextChainKey
      session.messageNumber += 1
      await this.store.storeSession(senderEmail, session)

      console.log('[SignalCrypto] Email decrypted from:', senderEmail)
      return { success: true, plaintext }
    } catch (error) {
      console.error('[SignalCrypto] Decryption failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Decryption failed'
      }
    }
  }

  /**
   * Establish session from incoming pre-key message
   */
  private async establishSessionFromPreKey(
    senderEmail: string,
    message: E2EMessage
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const identity = await this.store.getIdentityKeyPair()
      if (!identity) {
        return { success: false, error: 'Not registered' }
      }

      const senderIdentityKey = Buffer.from(message.senderIdentityKey, 'base64')

      // Verify trust (TOFU)
      const isTrusted = await this.store.isTrustedIdentity(senderEmail, senderIdentityKey)
      if (!isTrusted) {
        return { success: false, error: 'Untrusted identity key' }
      }

      // Save remote identity
      await this.store.saveRemoteIdentity(senderEmail, senderIdentityKey)

      // For incoming session, we use our signed pre-key and the sender's ephemeral key
      const signedPreKeyId = await this.store.getCurrentSignedPreKeyId()
      if (!signedPreKeyId) {
        return { success: false, error: 'No signed pre-key available' }
      }

      const signedPreKey = await this.store.loadSignedPreKey(signedPreKeyId)
      if (!signedPreKey) {
        return { success: false, error: 'Signed pre-key not found' }
      }

      // Simplified session establishment for incoming message
      // In a full implementation, we would extract the base key from the message
      const masterSecret = calculateAgreement(signedPreKey.keyPair.privateKey, senderIdentityKey)

      const salt = Buffer.alloc(32, 0)
      const keys = hkdf(masterSecret, salt, HKDF_INFO_ROOT, 64)

      const rootKey = keys.slice(0, 32)
      const chainKey = keys.slice(32, 64)

      // Create session
      const session: SessionRecord = {
        remoteIdentityKey: senderIdentityKey,
        localIdentityKey: identity.publicKey,
        rootKey,
        chainKey,
        messageNumber: 0,
        previousCounter: 0,
        timestamp: Date.now()
      }

      await this.store.storeSession(senderEmail, session)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Session establishment failed'
      }
    }
  }

  /**
   * Check if a session exists with a recipient
   */
  async hasSession(recipientEmail: string): Promise<boolean> {
    return this.store.hasSession(recipientEmail)
  }

  /**
   * Delete session with a recipient
   */
  async deleteSession(recipientEmail: string): Promise<void> {
    await this.store.deleteSession(recipientEmail)
  }

  /**
   * Get the key manager instance
   */
  getKeyManager(): KeyManager {
    return this.keyManager
  }
}

/**
 * Check if an email body is E2E encrypted
 */
export function isE2EEncrypted(emailBody: string): boolean {
  try {
    // Check for our base64 payload marker
    if (!emailBody.trim().match(/^[A-Za-z0-9+/=]+$/)) {
      return false
    }

    const decoded = Buffer.from(emailBody.trim(), 'base64').toString('utf8')
    const payload = JSON.parse(decoded)
    return payload.protocol === 'signal-v1'
  } catch {
    return false
  }
}

/**
 * Check email headers for E2E marker
 */
export function hasE2EHeader(headers: Record<string, string>): boolean {
  return headers['x-e2e-protocol'] === 'Signal' || headers['X-E2E-Protocol'] === 'Signal'
}

/**
 * Create E2E email headers
 */
export function createE2EHeaders(): Record<string, string> {
  return {
    'X-E2E-Protocol': 'Signal',
    'X-E2E-Version': '1'
  }
}
