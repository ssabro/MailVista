/**
 * IMAP 폴더 어댑터
 *
 * IMAP 폴더명의 인코딩을 일관되게 처리하는 추상화 계층
 * - IMAP 서버에서 받은 폴더명 디코딩
 * - IMAP 서버로 전송할 폴더명 인코딩
 * - SQLite 저장용 정규화된 경로 관리
 */

import {
  FolderIdentifier,
  asUtf8,
  asImapUtf7,
  toString,
} from './types'
import {
  encodeImapUtf7,
  decodeImapUtf7,
  looksLikeImapUtf7,
  ensureDecoded,
} from './imap-utf7'
import { normalizeNFC } from './unicode-normalizer'
import { debugString, toSafeString } from './debug-formatter'

// =====================================================
// 폴더 식별자 생성
// =====================================================

/**
 * ImapFlow ListResponse에서 FolderIdentifier 생성
 *
 * @param item - ImapFlow의 list() 결과 항목
 * @returns 정규화된 폴더 식별자
 */
export function createFolderIdentifier(item: {
  name: string
  path: string
  delimiter: string
  specialUse?: string
}): FolderIdentifier {
  // IMAP에서 받은 값이 인코딩되어 있을 수 있으므로 디코딩 시도
  const decodedName = ensureDecoded(item.name)
  const decodedPath = ensureDecoded(item.path)

  // NFC 정규화 적용
  const normalizedName = normalizeNFC(toString(decodedName))
  const normalizedPath = normalizeNFC(toString(decodedPath))

  return {
    displayName: normalizedName,
    wireName: encodeImapUtf7(normalizedPath),
    path: normalizedPath,
    delimiter: item.delimiter,
    specialUse: item.specialUse,
  }
}

/**
 * UTF-8 폴더 경로에서 FolderIdentifier 생성
 *
 * @param path - UTF-8 폴더 경로 (예: "받은편지함" 또는 "INBOX")
 * @param delimiter - 폴더 구분자 (기본: "/")
 * @param specialUse - 특수 용도 (inbox, sent, drafts 등)
 */
export function createFolderIdentifierFromPath(
  path: string,
  delimiter = '/',
  specialUse?: string
): FolderIdentifier {
  // 이미 인코딩되어 있을 수 있으므로 디코딩 시도
  const decoded = ensureDecoded(path)
  const normalized = normalizeNFC(toString(decoded))

  // 이름은 경로의 마지막 세그먼트
  const parts = normalized.split(delimiter)
  const name = parts[parts.length - 1] || normalized

  return {
    displayName: asUtf8(name),
    wireName: encodeImapUtf7(asUtf8(normalized)),
    path: asUtf8(normalized),
    delimiter,
    specialUse,
  }
}

// =====================================================
// 폴더 경로 변환
// =====================================================

/**
 * IMAP 서버 통신용 경로 반환
 * ImapFlow의 mailbox 파라미터에 사용
 */
export function toWirePath(folder: FolderIdentifier): string {
  return toString(folder.wireName)
}

/**
 * SQLite 저장용 경로 반환
 * 데이터베이스 조회/저장에 사용
 */
export function toStoragePath(folder: FolderIdentifier): string {
  return toString(folder.path)
}

/**
 * UI 표시용 이름 반환
 */
export function toDisplayName(folder: FolderIdentifier): string {
  return toString(folder.displayName)
}

/**
 * 문자열 경로를 IMAP 통신용으로 변환
 * (FolderIdentifier 없이 직접 변환)
 */
export function pathToWire(path: string): string {
  const decoded = ensureDecoded(path)
  const normalized = normalizeNFC(toString(decoded))
  return toString(encodeImapUtf7(asUtf8(normalized)))
}

/**
 * IMAP에서 받은 경로를 저장용으로 변환
 */
export function wireToStorage(wirePath: string): string {
  const decoded = decodeImapUtf7(asImapUtf7(wirePath))
  return toString(normalizeNFC(toString(decoded)))
}

// =====================================================
// 폴더 목록 변환
// =====================================================

/**
 * MailFolder 인터페이스 (기존 코드와 호환)
 */
export interface MailFolder {
  name: string
  path: string
  delimiter: string
  flags?: string[]
  specialUse?: string
  children?: MailFolder[]
}

/**
 * ImapFlow list() 결과를 MailFolder 배열로 변환
 * 모든 인코딩 처리를 자동으로 수행
 */
export function convertImapListToFolders(
  list: Array<{
    name: string
    path: string
    delimiter: string
    flags?: Set<string> | string[]
    specialUse?: string
  }>
): MailFolder[] {
  const folderMap = new Map<string, MailFolder>()
  const rootFolders: MailFolder[] = []

  // 입력 검증
  if (!list || !Array.isArray(list)) {
    return rootFolders
  }

  // 모든 폴더를 FolderIdentifier로 변환하고 맵에 저장
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (!item || !item.name || !item.path || !item.delimiter) {
      continue
    }

    const identifier = createFolderIdentifier({
      name: item.name,
      path: item.path,
      delimiter: item.delimiter,
      specialUse: item.specialUse,
    })

    const folder: MailFolder = {
      name: toDisplayName(identifier),
      path: toStoragePath(identifier),
      delimiter: identifier.delimiter,
      flags: item.flags
        ? Array.isArray(item.flags)
          ? item.flags
          : Array.from(item.flags)
        : [],
      specialUse: identifier.specialUse,
      children: [],
    }

    folderMap.set(folder.path, folder)
  }

  // 계층 구조 구성
  const folderValues = Array.from(folderMap.values())
  for (let i = 0; i < folderValues.length; i++) {
    const folder = folderValues[i]
    const delimiter = folder.delimiter
    const parentPath = folder.path.includes(delimiter)
      ? folder.path.substring(0, folder.path.lastIndexOf(delimiter))
      : ''

    if (parentPath && folderMap.has(parentPath)) {
      const parent = folderMap.get(parentPath)!
      parent.children = parent.children || []
      parent.children.push(folder)
    } else {
      rootFolders.push(folder)
    }
  }

  // 자식 폴더 정렬
  const sortFolders = (folders: MailFolder[]): void => {
    folders.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    for (const folder of folders) {
      if (folder.children && folder.children.length > 0) {
        sortFolders(folder.children)
      }
    }
  }

  sortFolders(rootFolders)
  return rootFolders
}

// =====================================================
// 폴더 경로 비교 및 검색
// =====================================================

/**
 * 두 폴더 경로가 동일한지 비교
 * (인코딩 차이 무시)
 */
export function isSamePath(path1: string, path2: string): boolean {
  const normalized1 = normalizeNFC(toString(ensureDecoded(path1)))
  const normalized2 = normalizeNFC(toString(ensureDecoded(path2)))
  return normalized1 === normalized2
}

/**
 * 폴더 경로로 FolderIdentifier 찾기
 */
export function findFolderByPath(
  folders: FolderIdentifier[],
  path: string
): FolderIdentifier | undefined {
  const targetPath = normalizeNFC(toString(ensureDecoded(path)))
  return folders.find((f) => toString(f.path) === targetPath)
}

/**
 * 폴더 목록에서 경로로 검색 (MailFolder 버전)
 */
export function findMailFolderByPath(
  folders: MailFolder[],
  path: string,
  recursive = true
): MailFolder | undefined {
  const targetPath = normalizeNFC(toString(ensureDecoded(path)))

  for (const folder of folders) {
    if (folder.path === targetPath) {
      return folder
    }

    if (recursive && folder.children) {
      const found = findMailFolderByPath(folder.children, path, true)
      if (found) {
        return found
      }
    }
  }

  return undefined
}

// =====================================================
// 특수 폴더 감지
// =====================================================

const SPECIAL_USE_PATTERNS: Record<string, RegExp[]> = {
  inbox: [/^inbox$/i],
  sent: [/sent/i, /보낸/i, /送信/i, /已发送/i],
  drafts: [/draft/i, /임시/i, /下書き/i, /草稿/i],
  trash: [/trash/i, /deleted/i, /휴지통/i, /ゴミ箱/i, /垃圾/i],
  spam: [/spam/i, /junk/i, /스팸/i, /迷惑/i, /垃圾邮件/i],
  archive: [/archive/i, /보관/i, /アーカイブ/i, /归档/i],
}

/**
 * 폴더 경로에서 특수 용도 감지
 */
export function detectSpecialUse(path: string): string | undefined {
  const lowerPath = path.toLowerCase()

  for (const [use, patterns] of Object.entries(SPECIAL_USE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(lowerPath)) {
        return use
      }
    }
  }

  return undefined
}

/**
 * 특수 폴더인지 확인
 */
export function isSpecialFolder(path: string): boolean {
  return detectSpecialUse(path) !== undefined
}

// =====================================================
// 디버깅 유틸리티
// =====================================================

/**
 * FolderIdentifier 디버그 정보
 */
export function debugFolder(folder: FolderIdentifier): string {
  const lines: string[] = []
  lines.push('FolderIdentifier:')
  lines.push(`  displayName: "${toSafeString(toString(folder.displayName))}"`)
  lines.push(`  wireName: "${toSafeString(toString(folder.wireName))}"`)
  lines.push(`  path: "${toSafeString(toString(folder.path))}"`)
  lines.push(`  delimiter: "${folder.delimiter}"`)
  lines.push(`  specialUse: ${folder.specialUse || 'none'}`)
  lines.push(`  path.hex: ${debugString(toString(folder.path)).hex}`)
  lines.push(`  wireName.hex: ${debugString(toString(folder.wireName)).hex}`)
  return lines.join('\n')
}

/**
 * 폴더 경로 변환 과정 추적
 */
export function traceFolderConversion(input: string): {
  input: string
  inputHex: string
  looksEncoded: boolean
  decoded: string
  decodedHex: string
  normalized: string
  normalizedHex: string
  reencoded: string
  reencodedHex: string
  roundTripSuccess: boolean
} {
  const inputHex = debugString(input).hex
  const looksEncoded = looksLikeImapUtf7(input)
  const decoded = toString(ensureDecoded(input))
  const decodedHex = debugString(decoded).hex
  const normalized = normalizeNFC(decoded)
  const normalizedHex = debugString(normalized).hex
  const reencoded = toString(encodeImapUtf7(asUtf8(normalized)))
  const reencodedHex = debugString(reencoded).hex

  // 왕복 검증
  const roundTripDecoded = toString(decodeImapUtf7(asImapUtf7(reencoded)))
  const roundTripSuccess = roundTripDecoded === normalized

  return {
    input,
    inputHex,
    looksEncoded,
    decoded,
    decodedHex,
    normalized,
    normalizedHex,
    reencoded,
    reencodedHex,
    roundTripSuccess,
  }
}

// =====================================================
// 폴더 경로 캐시
// =====================================================

/**
 * 폴더 경로 캐시
 * wire ↔ storage 변환 결과를 캐시하여 성능 향상
 */
export class FolderPathCache {
  private wireToStorageCache = new Map<string, string>()
  private storageToWireCache = new Map<string, string>()
  private maxSize: number

  constructor(maxSize = 1000) {
    this.maxSize = maxSize
  }

  /**
   * wire path를 storage path로 변환 (캐시 사용)
   */
  wireToStorage(wirePath: string): string {
    if (this.wireToStorageCache.has(wirePath)) {
      return this.wireToStorageCache.get(wirePath)!
    }

    const storagePath = wireToStorage(wirePath)

    // 캐시 크기 제한
    if (this.wireToStorageCache.size >= this.maxSize) {
      const firstKey = this.wireToStorageCache.keys().next().value
      if (firstKey) this.wireToStorageCache.delete(firstKey)
    }

    this.wireToStorageCache.set(wirePath, storagePath)
    this.storageToWireCache.set(storagePath, wirePath)

    return storagePath
  }

  /**
   * storage path를 wire path로 변환 (캐시 사용)
   */
  storageToWire(storagePath: string): string {
    if (this.storageToWireCache.has(storagePath)) {
      return this.storageToWireCache.get(storagePath)!
    }

    const wirePath = pathToWire(storagePath)

    // 캐시 크기 제한
    if (this.storageToWireCache.size >= this.maxSize) {
      const firstKey = this.storageToWireCache.keys().next().value
      if (firstKey) this.storageToWireCache.delete(firstKey)
    }

    this.storageToWireCache.set(storagePath, wirePath)
    this.wireToStorageCache.set(wirePath, storagePath)

    return wirePath
  }

  /**
   * 캐시 클리어
   */
  clear(): void {
    this.wireToStorageCache.clear()
    this.storageToWireCache.clear()
  }

  /**
   * 캐시 상태
   */
  getStats(): { wireToStorage: number; storageToWire: number } {
    return {
      wireToStorage: this.wireToStorageCache.size,
      storageToWire: this.storageToWireCache.size,
    }
  }
}

// 전역 캐시 인스턴스
let globalPathCache: FolderPathCache | null = null

export function getPathCache(): FolderPathCache {
  if (!globalPathCache) {
    globalPathCache = new FolderPathCache()
  }
  return globalPathCache
}
