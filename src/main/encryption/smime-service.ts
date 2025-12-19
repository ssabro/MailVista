/**
 * S/MIME Service Module
 * Provides S/MIME encryption/decryption and certificate management
 */

import * as forge from 'node-forge'
import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs'
import * as crypto from 'crypto'

// Storage paths
function getStoragePath(accountEmail: string): string {
  const basePath = join(
    app.getPath('userData'),
    'smime',
    accountEmail.replace(/[^a-zA-Z0-9]/g, '_')
  )
  if (!existsSync(basePath)) {
    mkdirSync(basePath, { recursive: true })
  }
  return basePath
}

// Encryption key for local storage
function getStorageKey(): Buffer {
  const keyPath = join(app.getPath('userData'), 'smime', '.storage_key')
  if (existsSync(keyPath)) {
    return Buffer.from(readFileSync(keyPath, 'utf8'), 'hex')
  }
  const key = crypto.randomBytes(32)
  mkdirSync(join(app.getPath('userData'), 'smime'), { recursive: true })
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

export interface SMIMECertificate {
  certificate: string // PEM format
  privateKey: string // PEM format (encrypted)
  fingerprint: string
  subject: string
  issuer: string
  validFrom: string
  validTo: string
  email: string
  createdAt: number
}

export interface SMIMEPublicCert {
  certificate: string
  fingerprint: string
  subject: string
  issuer: string
  validFrom: string
  validTo: string
  email: string
  importedAt: number
}

/**
 * Generate a self-signed S/MIME certificate
 */
export async function generateSMIMECertificate(
  accountEmail: string,
  name: string,
  passphrase: string,
  validityDays: number = 365
): Promise<{ success: boolean; certificate?: SMIMECertificate; error?: string }> {
  try {
    // Generate RSA key pair
    const keys = forge.pki.rsa.generateKeyPair(2048)

    // Create certificate
    const cert = forge.pki.createCertificate()
    cert.publicKey = keys.publicKey
    cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8))

    const now = new Date()
    cert.validity.notBefore = now
    cert.validity.notAfter = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000)

    const attrs = [
      { name: 'commonName', value: name },
      { name: 'emailAddress', value: accountEmail },
      { name: 'organizationName', value: 'Self-Signed' }
    ]
    cert.setSubject(attrs)
    cert.setIssuer(attrs)

    // Extensions for S/MIME
    cert.setExtensions([
      {
        name: 'basicConstraints',
        cA: false
      },
      {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true,
        dataEncipherment: true
      },
      {
        name: 'extKeyUsage',
        emailProtection: true
      },
      {
        name: 'subjectAltName',
        altNames: [
          {
            type: 1, // email
            value: accountEmail
          }
        ]
      }
    ])

    // Self-sign
    cert.sign(keys.privateKey, forge.md.sha256.create())

    // Convert to PEM
    const certPem = forge.pki.certificateToPem(cert)
    const privateKeyPem = forge.pki.encryptRsaPrivateKey(keys.privateKey, passphrase)

    // Calculate fingerprint
    const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
    const fingerprint = forge.md.sha256.create().update(certDer).digest().toHex().toUpperCase()

    const certificate: SMIMECertificate = {
      certificate: certPem,
      privateKey: privateKeyPem,
      fingerprint,
      subject: name,
      issuer: name,
      validFrom: cert.validity.notBefore.toISOString(),
      validTo: cert.validity.notAfter.toISOString(),
      email: accountEmail,
      createdAt: Date.now()
    }

    // Save to storage
    const storagePath = getStoragePath(accountEmail)
    const certData = encryptData(JSON.stringify(certificate))
    writeFileSync(join(storagePath, 'certificate.enc'), certData, 'utf8')

    console.log('[S/MIME] Certificate generated:', fingerprint.slice(0, 16))

    return { success: true, certificate }
  } catch (error) {
    console.error('[S/MIME] Certificate generation failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Certificate generation failed'
    }
  }
}

/**
 * Load existing S/MIME certificate
 */
export async function loadSMIMECertificate(
  accountEmail: string
): Promise<{ success: boolean; certificate?: SMIMECertificate; error?: string }> {
  try {
    const storagePath = getStoragePath(accountEmail)
    const certPath = join(storagePath, 'certificate.enc')

    if (!existsSync(certPath)) {
      return { success: false, error: 'No certificate found' }
    }

    const encryptedData = readFileSync(certPath, 'utf8')
    const certificate = JSON.parse(decryptData(encryptedData)) as SMIMECertificate

    return { success: true, certificate }
  } catch (error) {
    console.error('[S/MIME] Failed to load certificate:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load certificate'
    }
  }
}

/**
 * Check if S/MIME is set up for account
 */
export async function isSMIMESetup(accountEmail: string): Promise<boolean> {
  const storagePath = getStoragePath(accountEmail)
  return existsSync(join(storagePath, 'certificate.enc'))
}

/**
 * Export public certificate
 */
export async function exportCertificate(
  accountEmail: string
): Promise<{ success: boolean; certificate?: string; error?: string }> {
  const result = await loadSMIMECertificate(accountEmail)
  if (!result.success || !result.certificate) {
    return { success: false, error: result.error || 'No certificate found' }
  }
  return { success: true, certificate: result.certificate.certificate }
}

/**
 * Import a contact's certificate
 */
export async function importCertificate(
  accountEmail: string,
  contactEmail: string,
  certPem: string
): Promise<{ success: boolean; certInfo?: SMIMEPublicCert; error?: string }> {
  try {
    // Validate and parse the certificate
    const cert = forge.pki.certificateFromPem(certPem)

    // Calculate fingerprint
    const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
    const fingerprint = forge.md.sha256.create().update(certDer).digest().toHex().toUpperCase()

    // Get subject info
    const subjectCn = cert.subject.getField('CN')
    const issuerCn = cert.issuer.getField('CN')

    const certInfo: SMIMEPublicCert = {
      certificate: certPem,
      fingerprint,
      subject: subjectCn ? subjectCn.value : 'Unknown',
      issuer: issuerCn ? issuerCn.value : 'Unknown',
      validFrom: cert.validity.notBefore.toISOString(),
      validTo: cert.validity.notAfter.toISOString(),
      email: contactEmail,
      importedAt: Date.now()
    }

    // Check validity
    const now = new Date()
    if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
      return { success: false, error: 'Certificate has expired or is not yet valid' }
    }

    // Save to contacts
    const storagePath = getStoragePath(accountEmail)
    const contactsPath = join(storagePath, 'contacts')
    if (!existsSync(contactsPath)) {
      mkdirSync(contactsPath, { recursive: true })
    }

    const contactFile = join(contactsPath, `${contactEmail.replace(/[^a-zA-Z0-9]/g, '_')}.enc`)
    writeFileSync(contactFile, encryptData(JSON.stringify(certInfo)), 'utf8')

    console.log('[S/MIME] Imported certificate for:', contactEmail)

    return { success: true, certInfo }
  } catch (error) {
    console.error('[S/MIME] Failed to import certificate:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid certificate'
    }
  }
}

/**
 * Import PKCS#12 (PFX) file
 */
export async function importPKCS12(
  accountEmail: string,
  pfxBase64: string,
  pfxPassword: string,
  newPassphrase: string
): Promise<{ success: boolean; certificate?: SMIMECertificate; error?: string }> {
  try {
    const pfxDer = forge.util.decode64(pfxBase64)
    const pfxAsn1 = forge.asn1.fromDer(pfxDer)
    const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, pfxPassword)

    // Extract certificate and key
    let certificate: forge.pki.Certificate | null = null
    let privateKey: forge.pki.PrivateKey | null = null

    for (const bag of pfx.getBags({ bagType: forge.pki.oids.certBag }).certBag || []) {
      if (bag.cert) {
        certificate = bag.cert
        break
      }
    }

    for (const bag of pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
      .pkcs8ShroudedKeyBag || []) {
      if (bag.key) {
        privateKey = bag.key
        break
      }
    }

    if (!certificate || !privateKey) {
      return { success: false, error: 'Could not extract certificate or key from PKCS#12' }
    }

    // Convert to PEM
    const certPem = forge.pki.certificateToPem(certificate)
    const privateKeyPem = forge.pki.encryptRsaPrivateKey(privateKey, newPassphrase)

    // Calculate fingerprint
    const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes()
    const fingerprint = forge.md.sha256.create().update(certDer).digest().toHex().toUpperCase()

    const subjectCn = certificate.subject.getField('CN')
    const emailField =
      certificate.subject.getField('E') || certificate.subject.getField('emailAddress')

    const certData: SMIMECertificate = {
      certificate: certPem,
      privateKey: privateKeyPem,
      fingerprint,
      subject: subjectCn ? subjectCn.value : 'Unknown',
      issuer: certificate.issuer.getField('CN')?.value || 'Unknown',
      validFrom: certificate.validity.notBefore.toISOString(),
      validTo: certificate.validity.notAfter.toISOString(),
      email: emailField ? emailField.value : accountEmail,
      createdAt: Date.now()
    }

    // Save to storage
    const storagePath = getStoragePath(accountEmail)
    const encryptedData = encryptData(JSON.stringify(certData))
    writeFileSync(join(storagePath, 'certificate.enc'), encryptedData, 'utf8')

    console.log('[S/MIME] PKCS#12 imported:', fingerprint.slice(0, 16))

    return { success: true, certificate: certData }
  } catch (error) {
    console.error('[S/MIME] PKCS#12 import failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import PKCS#12'
    }
  }
}

/**
 * Get contact's certificate
 */
export async function getContactCertificate(
  accountEmail: string,
  contactEmail: string
): Promise<{ success: boolean; certInfo?: SMIMEPublicCert; error?: string }> {
  try {
    const storagePath = getStoragePath(accountEmail)
    const contactFile = join(
      storagePath,
      'contacts',
      `${contactEmail.replace(/[^a-zA-Z0-9]/g, '_')}.enc`
    )

    if (!existsSync(contactFile)) {
      return { success: false, error: 'No certificate found for contact' }
    }

    const encryptedData = readFileSync(contactFile, 'utf8')
    const certInfo = JSON.parse(decryptData(encryptedData)) as SMIMEPublicCert

    return { success: true, certInfo }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load contact certificate'
    }
  }
}

/**
 * List all imported contacts
 */
export async function listSMIMEContacts(
  accountEmail: string
): Promise<{ success: boolean; contacts?: SMIMEPublicCert[]; error?: string }> {
  try {
    const storagePath = getStoragePath(accountEmail)
    const contactsPath = join(storagePath, 'contacts')

    if (!existsSync(contactsPath)) {
      return { success: true, contacts: [] }
    }

    const files = readdirSync(contactsPath).filter((f) => f.endsWith('.enc'))
    const contacts: SMIMEPublicCert[] = []

    for (const file of files) {
      try {
        const encryptedData = readFileSync(join(contactsPath, file), 'utf8')
        const certInfo = JSON.parse(decryptData(encryptedData)) as SMIMEPublicCert
        contacts.push(certInfo)
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
 * Encrypt message with S/MIME
 */
export async function encryptSMIME(
  accountEmail: string,
  recipientEmails: string[],
  content: string,
  sign: boolean = true,
  passphrase?: string
): Promise<{ success: boolean; encrypted?: string; error?: string }> {
  try {
    // Get recipient certificates
    const recipientCerts: forge.pki.Certificate[] = []
    for (const email of recipientEmails) {
      const result = await getContactCertificate(accountEmail, email)
      if (!result.success || !result.certInfo) {
        return { success: false, error: `No S/MIME certificate found for ${email}` }
      }
      const cert = forge.pki.certificateFromPem(result.certInfo.certificate)
      recipientCerts.push(cert)
    }

    // Also add own certificate
    const ownCert = await loadSMIMECertificate(accountEmail)
    if (ownCert.success && ownCert.certificate) {
      recipientCerts.push(forge.pki.certificateFromPem(ownCert.certificate.certificate))
    }

    // Create PKCS#7 enveloped data
    const p7 = forge.pkcs7.createEnvelopedData()
    for (const cert of recipientCerts) {
      p7.addRecipient(cert)
    }

    p7.content = forge.util.createBuffer(content, 'utf8')
    p7.encrypt()

    // Convert to PEM
    const encrypted = forge.pkcs7.messageToPem(p7)

    // Sign if requested
    if (sign && passphrase && ownCert.success && ownCert.certificate) {
      const signerCert = forge.pki.certificateFromPem(ownCert.certificate.certificate)
      const signerKey = forge.pki.decryptRsaPrivateKey(ownCert.certificate.privateKey, passphrase)

      const signed = forge.pkcs7.createSignedData()
      signed.content = forge.util.createBuffer(encrypted, 'utf8')
      signed.addCertificate(signerCert)
      signed.addSigner({
        key: signerKey,
        certificate: signerCert,
        digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
          {
            type: forge.pki.oids.contentType,
            value: forge.pki.oids.data
          },
          {
            type: forge.pki.oids.messageDigest
          },
          {
            type: forge.pki.oids.signingTime,
            value: new Date()
          }
        ]
      })
      signed.sign()

      return { success: true, encrypted: forge.pkcs7.messageToPem(signed) }
    }

    return { success: true, encrypted }
  } catch (error) {
    console.error('[S/MIME] Encryption failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Encryption failed'
    }
  }
}

/**
 * Decrypt S/MIME message
 */
export async function decryptSMIME(
  accountEmail: string,
  encryptedMessage: string,
  passphrase: string
): Promise<{ success: boolean; decrypted?: string; signedBy?: string; error?: string }> {
  try {
    // Load certificate and key
    const certResult = await loadSMIMECertificate(accountEmail)
    if (!certResult.success || !certResult.certificate) {
      return { success: false, error: 'No S/MIME certificate found' }
    }

    const cert = forge.pki.certificateFromPem(certResult.certificate.certificate)
    const privateKey = forge.pki.decryptRsaPrivateKey(certResult.certificate.privateKey, passphrase)

    if (!privateKey) {
      return { success: false, error: 'Invalid passphrase' }
    }

    // Parse PKCS#7 message
    const p7 = forge.pkcs7.messageFromPem(encryptedMessage)

    let content = encryptedMessage
    let signedBy: string | undefined

    // Check if signed
    if (p7.type === forge.pki.oids.signedData) {
      // Verify signature (optional)
      if (p7.certificates && p7.certificates.length > 0) {
        const signerCert = p7.certificates[0] as forge.pki.Certificate
        signedBy = signerCert.subject.getField('CN')?.value || 'Unknown'
      }
      content = (p7.content as forge.util.ByteStringBuffer).toString()

      // Parse inner envelope
      const innerP7 = forge.pkcs7.messageFromPem(content)
      if (innerP7.type === forge.pki.oids.envelopedData) {
        innerP7.decrypt(innerP7.findRecipient(cert), privateKey)
        return {
          success: true,
          decrypted: (innerP7.content as forge.util.ByteStringBuffer).toString(),
          signedBy
        }
      }
    }

    // Direct enveloped data
    if (p7.type === forge.pki.oids.envelopedData) {
      p7.decrypt(p7.findRecipient(cert), privateKey)
      return {
        success: true,
        decrypted: (p7.content as forge.util.ByteStringBuffer).toString(),
        signedBy
      }
    }

    return { success: false, error: 'Unknown PKCS#7 message type' }
  } catch (error) {
    console.error('[S/MIME] Decryption failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Decryption failed'
    }
  }
}

/**
 * Check if message is S/MIME encrypted
 */
export function isSMIMEEncrypted(content: string): boolean {
  return (
    content.includes('-----BEGIN PKCS7-----') ||
    content.includes('-----BEGIN CMS-----') ||
    content.includes('application/pkcs7-mime')
  )
}

/**
 * Delete S/MIME certificate for account
 */
export async function deleteSMIMECertificate(
  accountEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const storagePath = getStoragePath(accountEmail)
    const certPath = join(storagePath, 'certificate.enc')

    if (existsSync(certPath)) {
      unlinkSync(certPath)
    }

    console.log('[S/MIME] Certificate deleted for:', accountEmail)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete certificate'
    }
  }
}

/**
 * Delete contact's certificate
 */
export async function deleteContactCertificate(
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
      error: error instanceof Error ? error.message : 'Failed to delete contact certificate'
    }
  }
}
