/**
 * E2E Encryption Module Index
 * Exports all E2E related functions and classes
 */

export { SignalStore } from './signal-store'
export type {
  KeyPair,
  SignedPreKey,
  PreKey,
  IdentityKeyPair,
  PreKeyBundle,
  SessionRecord
} from './signal-store'

export { KeyManager, configureKMS, getKMSConfig } from './key-manager'

export { SignalCrypto, isE2EEncrypted, hasE2EHeader, createE2EHeaders } from './signal-crypto'
export type { E2EMessage, EncryptedEmailPayload } from './signal-crypto'

export { runE2ETests } from './test'
