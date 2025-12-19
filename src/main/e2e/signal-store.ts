/**
 * Signal Protocol Store Implementation
 * Manages storage for identity keys, pre-keys, signed pre-keys, and sessions
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import * as crypto from 'crypto'

// Types for Signal Protocol
export interface KeyPair {
  publicKey: Buffer
  privateKey: Buffer
}

export interface SignedPreKey {
  keyId: number
  keyPair: KeyPair
  signature: Buffer
  timestamp: number
}

export interface PreKey {
  keyId: number
  keyPair: KeyPair
}

export interface IdentityKeyPair {
  publicKey: Buffer
  privateKey: Buffer
  registrationId: number
}

export interface PreKeyBundle {
  registrationId: number
  identityKey: Buffer
  signedPreKey: {
    keyId: number
    publicKey: Buffer
    signature: Buffer
  }
  preKey?: {
    keyId: number
    publicKey: Buffer
  }
}

export interface SessionRecord {
  remoteIdentityKey: Buffer
  localIdentityKey: Buffer
  rootKey: Buffer
  chainKey: Buffer
  messageNumber: number
  previousCounter: number
  timestamp: number
}

// Storage paths
function getE2EStorePath(): string {
  const userDataPath = app.getPath('userData')
  const e2ePath = join(userDataPath, 'e2e')
  if (!existsSync(e2ePath)) {
    mkdirSync(e2ePath, { recursive: true })
  }
  return e2ePath
}

function getAccountStorePath(accountEmail: string): string {
  const e2ePath = getE2EStorePath()
  const sanitizedEmail = accountEmail.replace(/[^a-zA-Z0-9@._-]/g, '_')
  const accountPath = join(e2ePath, sanitizedEmail)
  if (!existsSync(accountPath)) {
    mkdirSync(accountPath, { recursive: true })
  }
  return accountPath
}

// Encryption key for local storage (derived from machine-specific data)
function getStorageKey(): Buffer {
  const machineId = app.getPath('userData')
  return crypto
    .createHash('sha256')
    .update(machineId + 'e2e-storage-key')
    .digest()
}

// Encrypt data before storing
function encryptData(data: string): string {
  const key = getStorageKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(data, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  const authTag = cipher.getAuthTag()
  return JSON.stringify({
    iv: iv.toString('base64'),
    data: encrypted,
    tag: authTag.toString('base64')
  })
}

// Decrypt stored data
function decryptData(encryptedStr: string): string {
  const key = getStorageKey()
  const { iv, data, tag } = JSON.parse(encryptedStr)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  let decrypted = decipher.update(data, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

/**
 * Signal Protocol Store Class
 * Implements storage for all Signal Protocol data
 */
export class SignalStore {
  private storagePath: string

  constructor(accountEmail: string) {
    this.storagePath = getAccountStorePath(accountEmail)
  }

  // ============ Identity Key Store ============

  /**
   * Get or create identity key pair
   */
  async getIdentityKeyPair(): Promise<IdentityKeyPair | null> {
    const filePath = join(this.storagePath, 'identity.enc')
    if (!existsSync(filePath)) {
      return null
    }
    try {
      const encrypted = readFileSync(filePath, 'utf8')
      const data = JSON.parse(decryptData(encrypted))
      return {
        publicKey: Buffer.from(data.publicKey, 'base64'),
        privateKey: Buffer.from(data.privateKey, 'base64'),
        registrationId: data.registrationId
      }
    } catch (error) {
      console.error('Failed to load identity key:', error)
      return null
    }
  }

  /**
   * Save identity key pair
   */
  async saveIdentityKeyPair(keyPair: IdentityKeyPair): Promise<void> {
    const filePath = join(this.storagePath, 'identity.enc')
    const data = {
      publicKey: keyPair.publicKey.toString('base64'),
      privateKey: keyPair.privateKey.toString('base64'),
      registrationId: keyPair.registrationId
    }
    writeFileSync(filePath, encryptData(JSON.stringify(data)), 'utf8')
  }

  /**
   * Get registration ID
   */
  async getRegistrationId(): Promise<number | null> {
    const identity = await this.getIdentityKeyPair()
    return identity?.registrationId ?? null
  }

  /**
   * Check if identity is trusted
   */
  async isTrustedIdentity(address: string, identityKey: Buffer): Promise<boolean> {
    const stored = await this.getRemoteIdentity(address)
    if (!stored) {
      // First time seeing this identity - trust on first use (TOFU)
      return true
    }
    return stored.equals(identityKey)
  }

  /**
   * Save remote identity
   */
  async saveRemoteIdentity(address: string, identityKey: Buffer): Promise<void> {
    const dirPath = join(this.storagePath, 'identities')
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
    }
    const sanitized = address.replace(/[^a-zA-Z0-9@._-]/g, '_')
    const filePath = join(dirPath, `${sanitized}.enc`)
    const data = { identityKey: identityKey.toString('base64') }
    writeFileSync(filePath, encryptData(JSON.stringify(data)), 'utf8')
  }

  /**
   * Get remote identity
   */
  async getRemoteIdentity(address: string): Promise<Buffer | null> {
    const sanitized = address.replace(/[^a-zA-Z0-9@._-]/g, '_')
    const filePath = join(this.storagePath, 'identities', `${sanitized}.enc`)
    if (!existsSync(filePath)) {
      return null
    }
    try {
      const encrypted = readFileSync(filePath, 'utf8')
      const data = JSON.parse(decryptData(encrypted))
      return Buffer.from(data.identityKey, 'base64')
    } catch {
      return null
    }
  }

  // ============ Pre Key Store ============

  /**
   * Store pre key
   */
  async storePreKey(keyId: number, keyPair: KeyPair): Promise<void> {
    const dirPath = join(this.storagePath, 'prekeys')
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
    }
    const filePath = join(dirPath, `${keyId}.enc`)
    const data = {
      keyId,
      publicKey: keyPair.publicKey.toString('base64'),
      privateKey: keyPair.privateKey.toString('base64')
    }
    writeFileSync(filePath, encryptData(JSON.stringify(data)), 'utf8')
  }

  /**
   * Load pre key
   */
  async loadPreKey(keyId: number): Promise<PreKey | null> {
    const filePath = join(this.storagePath, 'prekeys', `${keyId}.enc`)
    if (!existsSync(filePath)) {
      return null
    }
    try {
      const encrypted = readFileSync(filePath, 'utf8')
      const data = JSON.parse(decryptData(encrypted))
      return {
        keyId: data.keyId,
        keyPair: {
          publicKey: Buffer.from(data.publicKey, 'base64'),
          privateKey: Buffer.from(data.privateKey, 'base64')
        }
      }
    } catch {
      return null
    }
  }

  /**
   * Remove pre key (after use)
   */
  async removePreKey(keyId: number): Promise<void> {
    const filePath = join(this.storagePath, 'prekeys', `${keyId}.enc`)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  }

  /**
   * Get all pre key IDs
   */
  async getAllPreKeyIds(): Promise<number[]> {
    const dirPath = join(this.storagePath, 'prekeys')
    if (!existsSync(dirPath)) {
      return []
    }
    const { readdirSync } = require('fs')
    const files = readdirSync(dirPath) as string[]
    return files
      .filter((f: string) => f.endsWith('.enc'))
      .map((f: string) => parseInt(f.replace('.enc', ''), 10))
      .filter((id: number) => !isNaN(id))
  }

  // ============ Signed Pre Key Store ============

  /**
   * Store signed pre key
   */
  async storeSignedPreKey(signedPreKey: SignedPreKey): Promise<void> {
    const dirPath = join(this.storagePath, 'signed_prekeys')
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
    }
    const filePath = join(dirPath, `${signedPreKey.keyId}.enc`)
    const data = {
      keyId: signedPreKey.keyId,
      publicKey: signedPreKey.keyPair.publicKey.toString('base64'),
      privateKey: signedPreKey.keyPair.privateKey.toString('base64'),
      signature: signedPreKey.signature.toString('base64'),
      timestamp: signedPreKey.timestamp
    }
    writeFileSync(filePath, encryptData(JSON.stringify(data)), 'utf8')
  }

  /**
   * Load signed pre key
   */
  async loadSignedPreKey(keyId: number): Promise<SignedPreKey | null> {
    const filePath = join(this.storagePath, 'signed_prekeys', `${keyId}.enc`)
    if (!existsSync(filePath)) {
      return null
    }
    try {
      const encrypted = readFileSync(filePath, 'utf8')
      const data = JSON.parse(decryptData(encrypted))
      return {
        keyId: data.keyId,
        keyPair: {
          publicKey: Buffer.from(data.publicKey, 'base64'),
          privateKey: Buffer.from(data.privateKey, 'base64')
        },
        signature: Buffer.from(data.signature, 'base64'),
        timestamp: data.timestamp
      }
    } catch {
      return null
    }
  }

  /**
   * Get current signed pre key ID
   */
  async getCurrentSignedPreKeyId(): Promise<number | null> {
    const metaPath = join(this.storagePath, 'signed_prekey_meta.json')
    if (!existsSync(metaPath)) {
      return null
    }
    try {
      const data = JSON.parse(readFileSync(metaPath, 'utf8'))
      return data.currentKeyId
    } catch {
      return null
    }
  }

  /**
   * Set current signed pre key ID
   */
  async setCurrentSignedPreKeyId(keyId: number): Promise<void> {
    const metaPath = join(this.storagePath, 'signed_prekey_meta.json')
    writeFileSync(metaPath, JSON.stringify({ currentKeyId: keyId }), 'utf8')
  }

  // ============ Session Store ============

  /**
   * Store session
   */
  async storeSession(address: string, session: SessionRecord): Promise<void> {
    const dirPath = join(this.storagePath, 'sessions')
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
    }
    const sanitized = address.replace(/[^a-zA-Z0-9@._-]/g, '_')
    const filePath = join(dirPath, `${sanitized}.enc`)
    const data = {
      remoteIdentityKey: session.remoteIdentityKey.toString('base64'),
      localIdentityKey: session.localIdentityKey.toString('base64'),
      rootKey: session.rootKey.toString('base64'),
      chainKey: session.chainKey.toString('base64'),
      messageNumber: session.messageNumber,
      previousCounter: session.previousCounter,
      timestamp: session.timestamp
    }
    writeFileSync(filePath, encryptData(JSON.stringify(data)), 'utf8')
  }

  /**
   * Load session
   */
  async loadSession(address: string): Promise<SessionRecord | null> {
    const sanitized = address.replace(/[^a-zA-Z0-9@._-]/g, '_')
    const filePath = join(this.storagePath, 'sessions', `${sanitized}.enc`)
    if (!existsSync(filePath)) {
      return null
    }
    try {
      const encrypted = readFileSync(filePath, 'utf8')
      const data = JSON.parse(decryptData(encrypted))
      return {
        remoteIdentityKey: Buffer.from(data.remoteIdentityKey, 'base64'),
        localIdentityKey: Buffer.from(data.localIdentityKey, 'base64'),
        rootKey: Buffer.from(data.rootKey, 'base64'),
        chainKey: Buffer.from(data.chainKey, 'base64'),
        messageNumber: data.messageNumber,
        previousCounter: data.previousCounter,
        timestamp: data.timestamp
      }
    } catch {
      return null
    }
  }

  /**
   * Delete session
   */
  async deleteSession(address: string): Promise<void> {
    const sanitized = address.replace(/[^a-zA-Z0-9@._-]/g, '_')
    const filePath = join(this.storagePath, 'sessions', `${sanitized}.enc`)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  }

  /**
   * Check if session exists
   */
  async hasSession(address: string): Promise<boolean> {
    const sanitized = address.replace(/[^a-zA-Z0-9@._-]/g, '_')
    const filePath = join(this.storagePath, 'sessions', `${sanitized}.enc`)
    return existsSync(filePath)
  }

  // ============ Utility Methods ============

  /**
   * Check if user is registered (has identity keys)
   */
  async isRegistered(): Promise<boolean> {
    const identity = await this.getIdentityKeyPair()
    return identity !== null
  }

  /**
   * Delete all stored data for this account
   */
  async clearAll(): Promise<void> {
    const { rmSync } = require('fs')
    if (existsSync(this.storagePath)) {
      rmSync(this.storagePath, { recursive: true, force: true })
    }
  }

  /**
   * Export public keys for sharing
   */
  async exportPublicKeys(): Promise<{
    identityKey: string
    signedPreKey: { keyId: number; publicKey: string; signature: string }
    preKeys: { keyId: number; publicKey: string }[]
  } | null> {
    const identity = await this.getIdentityKeyPair()
    if (!identity) return null

    const signedPreKeyId = await this.getCurrentSignedPreKeyId()
    if (!signedPreKeyId) return null

    const signedPreKey = await this.loadSignedPreKey(signedPreKeyId)
    if (!signedPreKey) return null

    const preKeyIds = await this.getAllPreKeyIds()
    const preKeys: { keyId: number; publicKey: string }[] = []
    for (const keyId of preKeyIds.slice(0, 100)) {
      const pk = await this.loadPreKey(keyId)
      if (pk) {
        preKeys.push({
          keyId: pk.keyId,
          publicKey: pk.keyPair.publicKey.toString('base64')
        })
      }
    }

    return {
      identityKey: identity.publicKey.toString('base64'),
      signedPreKey: {
        keyId: signedPreKey.keyId,
        publicKey: signedPreKey.keyPair.publicKey.toString('base64'),
        signature: signedPreKey.signature.toString('base64')
      },
      preKeys
    }
  }
}
