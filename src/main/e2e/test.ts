/**
 * E2E Encryption Test Module
 * Tests Signal Protocol based A-to-B encrypted communication
 */

import { SignalCrypto, isE2EEncrypted } from './signal-crypto'
import { KeyManager, configureKMS } from './key-manager'
import { SignalStore } from './signal-store'

// Test accounts
const ALICE_EMAIL = 'alice@test.local'
const BOB_EMAIL = 'bob@test.local'

/**
 * Run E2E encryption tests
 */
export async function runE2ETests(): Promise<{
  passed: number
  failed: number
  results: { name: string; passed: boolean; error?: string }[]
}> {
  const results: { name: string; passed: boolean; error?: string }[] = []
  let passed = 0
  let failed = 0

  // Configure KMS for testing (disabled)
  configureKMS({ enabled: false })

  console.log('\n========================================')
  console.log('   E2E Encryption Test Suite')
  console.log('========================================\n')

  // Test 1: Key Generation
  try {
    console.log('[Test 1] Key Generation...')
    const aliceKeyManager = new KeyManager(ALICE_EMAIL)
    const bobKeyManager = new KeyManager(BOB_EMAIL)

    // Clear any existing keys
    await aliceKeyManager.getStore().clearAll()
    await bobKeyManager.getStore().clearAll()

    // Register Alice
    const aliceResult = await aliceKeyManager.registerUser()
    if (!aliceResult.success) {
      throw new Error(`Alice registration failed: ${aliceResult.error}`)
    }

    // Register Bob
    const bobResult = await bobKeyManager.registerUser()
    if (!bobResult.success) {
      throw new Error(`Bob registration failed: ${bobResult.error}`)
    }

    console.log('  ✓ Alice registered successfully')
    console.log('  ✓ Bob registered successfully')
    results.push({ name: 'Key Generation', passed: true })
    passed++
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`  ✗ Failed: ${message}`)
    results.push({ name: 'Key Generation', passed: false, error: message })
    failed++
  }

  // Test 2: Key Export/Import
  try {
    console.log('\n[Test 2] Key Export/Import...')
    const aliceKeyManager = new KeyManager(ALICE_EMAIL)
    const bobKeyManager = new KeyManager(BOB_EMAIL)

    // Export Alice's key bundle
    const aliceBundle = await aliceKeyManager.exportPublicKeyBundle()
    if (!aliceBundle) {
      throw new Error('Failed to export Alice key bundle')
    }

    // Export Bob's key bundle
    const bobBundle = await bobKeyManager.exportPublicKeyBundle()
    if (!bobBundle) {
      throw new Error('Failed to export Bob key bundle')
    }

    // Import Bob's key bundle to Alice
    const aliceImportResult = await aliceKeyManager.importKeyBundle(BOB_EMAIL, {
      registrationId: bobBundle.registrationId,
      identityKey: bobBundle.identityKey.toString('base64'),
      signedPreKey: {
        keyId: bobBundle.signedPreKey.keyId,
        publicKey: bobBundle.signedPreKey.publicKey.toString('base64'),
        signature: bobBundle.signedPreKey.signature.toString('base64')
      },
      preKey: bobBundle.preKey
        ? {
            keyId: bobBundle.preKey.keyId,
            publicKey: bobBundle.preKey.publicKey.toString('base64')
          }
        : undefined
    })

    if (!aliceImportResult.success) {
      throw new Error(`Alice import failed: ${aliceImportResult.error}`)
    }

    // Import Alice's key bundle to Bob
    const bobImportResult = await bobKeyManager.importKeyBundle(ALICE_EMAIL, {
      registrationId: aliceBundle.registrationId,
      identityKey: aliceBundle.identityKey.toString('base64'),
      signedPreKey: {
        keyId: aliceBundle.signedPreKey.keyId,
        publicKey: aliceBundle.signedPreKey.publicKey.toString('base64'),
        signature: aliceBundle.signedPreKey.signature.toString('base64')
      },
      preKey: aliceBundle.preKey
        ? {
            keyId: aliceBundle.preKey.keyId,
            publicKey: aliceBundle.preKey.publicKey.toString('base64')
          }
        : undefined
    })

    if (!bobImportResult.success) {
      throw new Error(`Bob import failed: ${bobImportResult.error}`)
    }

    console.log('  ✓ Alice exported key bundle')
    console.log('  ✓ Bob exported key bundle')
    console.log("  ✓ Alice imported Bob's keys")
    console.log("  ✓ Bob imported Alice's keys")
    results.push({ name: 'Key Export/Import', passed: true })
    passed++
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`  ✗ Failed: ${message}`)
    results.push({ name: 'Key Export/Import', passed: false, error: message })
    failed++
  }

  // Test 3: Session Establishment
  try {
    console.log('\n[Test 3] Session Establishment...')
    const aliceCrypto = new SignalCrypto(ALICE_EMAIL)

    // Fetch Bob's key bundle (from local store since KMS is disabled)
    const bobKeyManager = new KeyManager(BOB_EMAIL)
    const bobBundle = await bobKeyManager.exportPublicKeyBundle()
    if (!bobBundle) {
      throw new Error('Failed to get Bob key bundle')
    }

    // Alice establishes session with Bob
    const sessionResult = await aliceCrypto.establishSession(BOB_EMAIL, bobBundle)
    if (!sessionResult.success) {
      throw new Error(`Session establishment failed: ${sessionResult.error}`)
    }

    // Check session exists
    const hasSession = await aliceCrypto.hasSession(BOB_EMAIL)
    if (!hasSession) {
      throw new Error('Session not created')
    }

    console.log('  ✓ Alice established session with Bob')
    results.push({ name: 'Session Establishment', passed: true })
    passed++
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`  ✗ Failed: ${message}`)
    results.push({ name: 'Session Establishment', passed: false, error: message })
    failed++
  }

  // Test 4: Encryption
  try {
    console.log('\n[Test 4] Message Encryption...')
    const aliceCrypto = new SignalCrypto(ALICE_EMAIL)

    const plaintext = JSON.stringify({
      html: '<p>Hello Bob! This is a secret message.</p>',
      text: 'Hello Bob! This is a secret message.'
    })

    const encryptResult = await aliceCrypto.encryptEmail(BOB_EMAIL, plaintext)
    if (!encryptResult.success || !encryptResult.encryptedPayload) {
      throw new Error(`Encryption failed: ${encryptResult.error}`)
    }

    // Verify it's recognized as E2E encrypted
    const isEncrypted = isE2EEncrypted(encryptResult.encryptedPayload)
    if (!isEncrypted) {
      throw new Error('Encrypted content not recognized as E2E')
    }

    console.log('  ✓ Message encrypted successfully')
    console.log(`  ✓ Payload length: ${encryptResult.encryptedPayload.length} bytes`)
    console.log('  ✓ Recognized as E2E encrypted')
    results.push({ name: 'Message Encryption', passed: true })
    passed++
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`  ✗ Failed: ${message}`)
    results.push({ name: 'Message Encryption', passed: false, error: message })
    failed++
  }

  // Test 5: Full A-to-B Communication
  try {
    console.log('\n[Test 5] Full A-to-B Communication...')
    const aliceCrypto = new SignalCrypto(ALICE_EMAIL)
    const bobCrypto = new SignalCrypto(BOB_EMAIL)

    // Alice needs a session to Bob (already established in Test 3)
    // Bob needs a session to Alice for decryption

    // Get Alice's key bundle for Bob
    const aliceKeyManager = new KeyManager(ALICE_EMAIL)
    const aliceBundle = await aliceKeyManager.exportPublicKeyBundle()
    if (!aliceBundle) {
      throw new Error('Failed to get Alice key bundle')
    }

    // Bob establishes session with Alice
    await bobCrypto.establishSession(ALICE_EMAIL, aliceBundle)

    // Alice encrypts a message for Bob
    const originalMessage = JSON.stringify({
      html: '<p><strong>Top Secret:</strong> The treasure is buried at coordinates 42.3601, -71.0589</p>',
      text: 'Top Secret: The treasure is buried at coordinates 42.3601, -71.0589'
    })

    const encryptResult = await aliceCrypto.encryptEmail(BOB_EMAIL, originalMessage)
    if (!encryptResult.success || !encryptResult.encryptedPayload) {
      throw new Error(`Alice encryption failed: ${encryptResult.error}`)
    }

    console.log('  ✓ Alice encrypted message for Bob')

    // Bob decrypts the message from Alice
    const decryptResult = await bobCrypto.decryptEmail(ALICE_EMAIL, encryptResult.encryptedPayload)
    if (!decryptResult.success || !decryptResult.plaintext) {
      throw new Error(`Bob decryption failed: ${decryptResult.error}`)
    }

    console.log('  ✓ Bob decrypted message from Alice')

    // Verify content matches
    if (decryptResult.plaintext !== originalMessage) {
      throw new Error('Decrypted message does not match original')
    }

    console.log('  ✓ Message content verified')

    // Parse and display
    const parsed = JSON.parse(decryptResult.plaintext)
    console.log(`  ✓ Decrypted text: "${parsed.text.substring(0, 50)}..."`)

    results.push({ name: 'Full A-to-B Communication', passed: true })
    passed++
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`  ✗ Failed: ${message}`)
    results.push({ name: 'Full A-to-B Communication', passed: false, error: message })
    failed++
  }

  // Test 6: Fingerprint Verification
  try {
    console.log('\n[Test 6] Fingerprint Verification...')
    const aliceStore = new SignalStore(ALICE_EMAIL)

    // Get Alice's own fingerprint
    const aliceIdentity = await aliceStore.getIdentityKeyPair()
    if (!aliceIdentity) {
      throw new Error('Alice identity not found')
    }

    const crypto = require('crypto')
    const fingerprint = crypto
      .createHash('sha256')
      .update(aliceIdentity.publicKey)
      .digest('hex')
      .slice(0, 32)
      .toUpperCase()
      .match(/.{1,4}/g)
      ?.join(' ')

    console.log(`  ✓ Alice fingerprint: ${fingerprint}`)

    // Get Bob's fingerprint (as seen by Alice)
    const bobRemoteKey = await aliceStore.getRemoteIdentity(BOB_EMAIL)
    if (bobRemoteKey) {
      const bobFingerprint = crypto
        .createHash('sha256')
        .update(bobRemoteKey)
        .digest('hex')
        .slice(0, 32)
        .toUpperCase()
        .match(/.{1,4}/g)
        ?.join(' ')
      console.log(`  ✓ Bob fingerprint (as seen by Alice): ${bobFingerprint}`)
    }

    results.push({ name: 'Fingerprint Verification', passed: true })
    passed++
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`  ✗ Failed: ${message}`)
    results.push({ name: 'Fingerprint Verification', passed: false, error: message })
    failed++
  }

  // Cleanup
  try {
    console.log('\n[Cleanup] Removing test data...')
    const aliceStore = new SignalStore(ALICE_EMAIL)
    const bobStore = new SignalStore(BOB_EMAIL)
    await aliceStore.clearAll()
    await bobStore.clearAll()
    console.log('  ✓ Test data cleaned up')
  } catch (error) {
    console.log('  ⚠ Cleanup warning:', error)
  }

  // Summary
  console.log('\n========================================')
  console.log('   Test Summary')
  console.log('========================================')
  console.log(`   Passed: ${passed}`)
  console.log(`   Failed: ${failed}`)
  console.log(`   Total:  ${passed + failed}`)
  console.log('========================================\n')

  return { passed, failed, results }
}

// Export for IPC handler
export { runE2ETests as testE2E }
