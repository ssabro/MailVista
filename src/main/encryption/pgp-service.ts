/**
 * PGP Service Module
 * Provides OpenPGP encryption/decryption and key management
 */

import * as openpgp from 'openpgp'
import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs'
import * as crypto from 'crypto'

// Storage paths
function getStoragePath(accountEmail: string): string {
  const basePath = join(app.getPath('userData'), 'pgp', accountEmail.replace(/[^a-zA-Z0-9]/g, '_'))
  if (!existsSync(basePath)) {
    mkdirSync(basePath, { recursive: true })
  }
  return basePath
}

// Encryption key for local storage
function getStorageKey(): Buffer {
  const keyPath = join(app.getPath('userData'), 'pgp', '.storage_key')
  if (existsSync(keyPath)) {
    return Buffer.from(readFileSync(keyPath, 'utf8'), 'hex')
  }
  const key = crypto.randomBytes(32)
  mkdirSync(join(app.getPath('userData'), 'pgp'), { recursive: true })
  writeFileSync(keyPath, key.toString('hex'), 'utf8')
  return key
}

function encryptData(data: string): string {
  const key = getStorageKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(data, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag()
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted
}

function decryptData(data: string): string {
  const key = getStorageKey()
  const parts = data.split(':')
  const iv = Buffer.from(parts[0], 'hex')
  const tag = Buffer.from(parts[1], 'hex')
  const encrypted = parts[2]
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export interface PGPKeyPair {
  publicKey: string
  privateKey: string
  fingerprint: string
  keyId: string
  userId: string
  createdAt: number
}

export interface PGPPublicKey {
  publicKey: string
  fingerprint: string
  keyId: string
  userId: string
  email: string
  importedAt: number
}

/**
 * Generate a new PGP key pair
 */
export async function generatePGPKeyPair(
  accountEmail: string,
  name: string,
  passphrase: string
): Promise<{ success: boolean; keyPair?: PGPKeyPair; error?: string }> {
  try {
    const { privateKey, publicKey } = await openpgp.generateKey({
      type: 'rsa',
      rsaBits: 4096,
      userIDs: [{ name, email: accountEmail }],
      passphrase,
      format: 'armored'
    })

    // Read key to get fingerprint
    const pubKeyObj = await openpgp.readKey({ armoredKey: publicKey })
    const fingerprint = pubKeyObj.getFingerprint().toUpperCase()
    const keyId = pubKeyObj.getKeyID().toHex().toUpperCase()

    const keyPair: PGPKeyPair = {
      publicKey,
      privateKey,
      fingerprint,
      keyId,
      userId: `${name} <${accountEmail}>`,
      createdAt: Date.now()
    }

    // Save to storage
    const storagePath = getStoragePath(accountEmail)
    const keyData = encryptData(JSON.stringify(keyPair))
    writeFileSync(join(storagePath, 'keypair.enc'), keyData, 'utf8')

    console.log('[PGP] Key pair generated:', keyId)

    return { success: true, keyPair }
  } catch (error) {
    console.error('[PGP] Key generation failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Key generation failed'
    }
  }
}

/**
 * Load existing PGP key pair
 */
export async function loadPGPKeyPair(
  accountEmail: string
): Promise<{ success: boolean; keyPair?: PGPKeyPair; error?: string }> {
  try {
    const storagePath = getStoragePath(accountEmail)
    const keyPath = join(storagePath, 'keypair.enc')

    if (!existsSync(keyPath)) {
      return { success: false, error: 'No key pair found' }
    }

    const encryptedData = readFileSync(keyPath, 'utf8')
    const keyPair = JSON.parse(decryptData(encryptedData)) as PGPKeyPair

    return { success: true, keyPair }
  } catch (error) {
    console.error('[PGP] Failed to load key pair:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load key pair'
    }
  }
}

/**
 * Check if PGP is set up for account
 */
export async function isPGPSetup(accountEmail: string): Promise<boolean> {
  const storagePath = getStoragePath(accountEmail)
  return existsSync(join(storagePath, 'keypair.enc'))
}

/**
 * Export public key
 */
export async function exportPublicKey(
  accountEmail: string
): Promise<{ success: boolean; publicKey?: string; error?: string }> {
  const result = await loadPGPKeyPair(accountEmail)
  if (!result.success || !result.keyPair) {
    return { success: false, error: result.error || 'No key pair found' }
  }
  return { success: true, publicKey: result.keyPair.publicKey }
}

/**
 * Import a contact's public key
 */
export async function importPublicKey(
  accountEmail: string,
  contactEmail: string,
  armoredKey: string
): Promise<{ success: boolean; keyInfo?: PGPPublicKey; error?: string }> {
  try {
    // Validate the key
    const pubKey = await openpgp.readKey({ armoredKey })
    const fingerprint = pubKey.getFingerprint().toUpperCase()
    const keyId = pubKey.getKeyID().toHex().toUpperCase()
    const userId = pubKey.getUserIDs()[0] || contactEmail

    const keyInfo: PGPPublicKey = {
      publicKey: armoredKey,
      fingerprint,
      keyId,
      userId,
      email: contactEmail,
      importedAt: Date.now()
    }

    // Save to contacts
    const storagePath = getStoragePath(accountEmail)
    const contactsPath = join(storagePath, 'contacts')
    if (!existsSync(contactsPath)) {
      mkdirSync(contactsPath, { recursive: true })
    }

    const contactFile = join(contactsPath, `${contactEmail.replace(/[^a-zA-Z0-9]/g, '_')}.enc`)
    writeFileSync(contactFile, encryptData(JSON.stringify(keyInfo)), 'utf8')

    console.log('[PGP] Imported public key for:', contactEmail)

    return { success: true, keyInfo }
  } catch (error) {
    console.error('[PGP] Failed to import public key:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid PGP public key'
    }
  }
}

/**
 * Get contact's public key
 */
export async function getContactPublicKey(
  accountEmail: string,
  contactEmail: string
): Promise<{ success: boolean; keyInfo?: PGPPublicKey; error?: string }> {
  try {
    const storagePath = getStoragePath(accountEmail)
    const contactFile = join(
      storagePath,
      'contacts',
      `${contactEmail.replace(/[^a-zA-Z0-9]/g, '_')}.enc`
    )

    if (!existsSync(contactFile)) {
      return { success: false, error: 'No public key found for contact' }
    }

    const encryptedData = readFileSync(contactFile, 'utf8')
    const keyInfo = JSON.parse(decryptData(encryptedData)) as PGPPublicKey

    return { success: true, keyInfo }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load contact key'
    }
  }
}

/**
 * List all imported contacts
 */
export async function listPGPContacts(
  accountEmail: string
): Promise<{ success: boolean; contacts?: PGPPublicKey[]; error?: string }> {
  try {
    const storagePath = getStoragePath(accountEmail)
    const contactsPath = join(storagePath, 'contacts')

    if (!existsSync(contactsPath)) {
      return { success: true, contacts: [] }
    }

    const files = readdirSync(contactsPath).filter((f) => f.endsWith('.enc'))
    const contacts: PGPPublicKey[] = []

    for (const file of files) {
      try {
        const encryptedData = readFileSync(join(contactsPath, file), 'utf8')
        const keyInfo = JSON.parse(decryptData(encryptedData)) as PGPPublicKey
        contacts.push(keyInfo)
      } catch {
        // Skip corrupted files
      }
    }

    return { success: true, contacts }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list contacts'
    }
  }
}

/**
 * Encrypt message with PGP
 */
export async function encryptPGP(
  accountEmail: string,
  recipientEmails: string[],
  plaintext: string,
  sign: boolean = true,
  passphrase?: string
): Promise<{ success: boolean; encrypted?: string; error?: string }> {
  try {
    // Get recipient public keys
    const recipientKeys: openpgp.Key[] = []
    for (const email of recipientEmails) {
      const result = await getContactPublicKey(accountEmail, email)
      if (!result.success || !result.keyInfo) {
        return { success: false, error: `No PGP key found for ${email}` }
      }
      const key = await openpgp.readKey({ armoredKey: result.keyInfo.publicKey })
      recipientKeys.push(key)
    }

    // Also add own public key so we can read sent messages
    const ownKeyPair = await loadPGPKeyPair(accountEmail)
    if (ownKeyPair.success && ownKeyPair.keyPair) {
      const ownPubKey = await openpgp.readKey({ armoredKey: ownKeyPair.keyPair.publicKey })
      recipientKeys.push(ownPubKey)
    }

    // Create message
    const message = await openpgp.createMessage({ text: plaintext })

    // Sign if requested and passphrase provided
    let signingKey: openpgp.PrivateKey | undefined
    if (sign && passphrase && ownKeyPair.success && ownKeyPair.keyPair) {
      signingKey = await openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({ armoredKey: ownKeyPair.keyPair.privateKey }),
        passphrase
      })
    }

    // Encrypt
    const encrypted = await openpgp.encrypt({
      message,
      encryptionKeys: recipientKeys,
      signingKeys: signingKey,
      format: 'armored'
    })

    return { success: true, encrypted: encrypted as string }
  } catch (error) {
    console.error('[PGP] Encryption failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Encryption failed'
    }
  }
}

/**
 * Decrypt PGP message
 */
export async function decryptPGP(
  accountEmail: string,
  encryptedMessage: string,
  passphrase: string
): Promise<{ success: boolean; decrypted?: string; signedBy?: string; error?: string }> {
  try {
    // Load private key
    const keyPairResult = await loadPGPKeyPair(accountEmail)
    if (!keyPairResult.success || !keyPairResult.keyPair) {
      return { success: false, error: 'No PGP key pair found' }
    }

    // Decrypt private key with passphrase
    const privateKey = await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({ armoredKey: keyPairResult.keyPair.privateKey }),
      passphrase
    })

    // Read the message
    const message = await openpgp.readMessage({ armoredMessage: encryptedMessage })

    // Decrypt
    const { data: decrypted, signatures } = await openpgp.decrypt({
      message,
      decryptionKeys: privateKey
    })

    let signedBy: string | undefined
    if (signatures.length > 0) {
      try {
        const sigKeyId = signatures[0].keyID.toHex().toUpperCase()
        signedBy = sigKeyId
      } catch {
        // Signature verification failed
      }
    }

    return { success: true, decrypted: decrypted as string, signedBy }
  } catch (error) {
    console.error('[PGP] Decryption failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Decryption failed'
    }
  }
}

/**
 * Check if message is PGP encrypted
 */
export function isPGPEncrypted(content: string): boolean {
  return content.includes('-----BEGIN PGP MESSAGE-----')
}

/**
 * Delete PGP keys for account
 */
export async function deletePGPKeys(
  accountEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const storagePath = getStoragePath(accountEmail)
    const keyPath = join(storagePath, 'keypair.enc')

    if (existsSync(keyPath)) {
      unlinkSync(keyPath)
    }

    console.log('[PGP] Keys deleted for:', accountEmail)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete keys'
    }
  }
}

/**
 * Delete contact's public key
 */
export async function deleteContactKey(
  accountEmail: string,
  contactEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const storagePath = getStoragePath(accountEmail)
    const contactFile = join(
      storagePath,
      'contacts',
      `${contactEmail.replace(/[^a-zA-Z0-9]/g, '_')}.enc`
    )

    if (existsSync(contactFile)) {
      unlinkSync(contactFile)
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete contact key'
    }
  }
}
