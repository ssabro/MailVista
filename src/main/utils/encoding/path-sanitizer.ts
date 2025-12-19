/**
 * 파일 시스템 경로 안전화 유틸리티
 * OS별 파일 시스템 제약을 고려한 안전한 경로/파일명 생성
 */

import { FsSafeString, Utf8String, asFsSafe, asUtf8 } from './types'

// =====================================================
// OS별 금지 문자 정의
// =====================================================

/** Windows에서 파일명에 사용할 수 없는 문자 */
const WINDOWS_FORBIDDEN_CHARS = /[<>:"/\\|?*\x00-\x1f]/g

/** macOS/Linux에서 파일명에 사용할 수 없는 문자 */
const UNIX_FORBIDDEN_CHARS = /[/\x00]/g

/** Windows 예약어 (파일명으로 사용 불가) */
const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
])

/** 최대 파일명 길이 (대부분의 파일시스템) */
const MAX_FILENAME_LENGTH = 255

/** 최대 경로 길이 (Windows) */
const MAX_PATH_LENGTH_WINDOWS = 260

/** 최대 경로 길이 (Unix-like) */
const MAX_PATH_LENGTH_UNIX = 4096

// =====================================================
// 파일명 안전화
// =====================================================

export interface SanitizeOptions {
  /** 대체 문자 (기본: '_') */
  replacement?: string
  /** Windows 호환성 유지 (기본: true) */
  windowsCompat?: boolean
  /** 최대 길이 (기본: 255) */
  maxLength?: number
  /** 빈 문자열일 때 기본값 */
  defaultName?: string
}

/**
 * 파일명을 파일 시스템에서 안전하게 사용할 수 있도록 정제
 *
 * @param filename - 원본 파일명
 * @param options - 정제 옵션
 * @returns 안전한 파일명
 *
 * @example
 * sanitizeFilename('report:2024.pdf') // 'report_2024.pdf'
 * sanitizeFilename('CON.txt') // '_CON.txt'
 * sanitizeFilename('한글파일.txt') // '한글파일.txt'
 */
export function sanitizeFilename(
  filename: string,
  options: SanitizeOptions = {}
): FsSafeString {
  const {
    replacement = '_',
    windowsCompat = true,
    maxLength = MAX_FILENAME_LENGTH,
    defaultName = 'unnamed',
  } = options

  if (!filename || filename.trim() === '') {
    return asFsSafe(defaultName)
  }

  let sanitized = filename

  // 금지 문자 대체
  const forbiddenPattern = windowsCompat ? WINDOWS_FORBIDDEN_CHARS : UNIX_FORBIDDEN_CHARS
  sanitized = sanitized.replace(forbiddenPattern, replacement)

  // 앞뒤 공백 및 점 제거 (Windows 제약)
  if (windowsCompat) {
    sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '')
  }

  // Windows 예약어 처리
  if (windowsCompat) {
    const baseName = sanitized.split('.')[0].toUpperCase()
    if (WINDOWS_RESERVED_NAMES.has(baseName)) {
      sanitized = replacement + sanitized
    }
  }

  // 연속된 대체 문자 정리
  const escapedReplacement = replacement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  sanitized = sanitized.replace(new RegExp(`${escapedReplacement}+`, 'g'), replacement)

  // 길이 제한 (UTF-8 바이트 기준)
  sanitized = truncateToByteLength(sanitized, maxLength)

  // 빈 문자열 처리
  if (!sanitized || sanitized === replacement) {
    return asFsSafe(defaultName)
  }

  return asFsSafe(sanitized)
}

/**
 * 폴더명을 파일 시스템에서 안전하게 사용할 수 있도록 정제
 * (파일명과 동일하지만 확장자 처리가 다름)
 */
export function sanitizeFoldername(
  foldername: string,
  options: SanitizeOptions = {}
): FsSafeString {
  return sanitizeFilename(foldername, {
    ...options,
    defaultName: options.defaultName || 'folder',
  })
}

// =====================================================
// 경로 안전화
// =====================================================

/**
 * 전체 경로를 안전하게 정제
 *
 * @param path - 원본 경로
 * @param options - 정제 옵션
 * @returns 안전한 경로
 */
export function sanitizePath(
  path: string,
  options: SanitizeOptions = {}
): FsSafeString {
  const { windowsCompat = true } = options

  // 경로 구분자 정규화
  let normalized = path.replace(/\\/g, '/')

  // 각 경로 세그먼트 정제
  const segments = normalized.split('/').filter(Boolean)
  const sanitizedSegments = segments.map((segment) =>
    sanitizeFilename(segment, options) as string
  )

  // 다시 조합
  let result = sanitizedSegments.join('/')

  // 경로 길이 제한
  const maxPathLength = windowsCompat ? MAX_PATH_LENGTH_WINDOWS : MAX_PATH_LENGTH_UNIX
  if (Buffer.byteLength(result, 'utf8') > maxPathLength) {
    // 경로가 너무 길면 잘라내기
    result = truncateToByteLength(result, maxPathLength)
  }

  return asFsSafe(result)
}

// =====================================================
// Path Traversal 방지
// =====================================================

/**
 * 경로가 기본 디렉토리를 벗어나지 않는지 검증
 *
 * @param basePath - 기본 디렉토리 경로
 * @param targetPath - 검증할 대상 경로
 * @returns 안전 여부
 */
export function isPathSafe(basePath: string, targetPath: string): boolean {
  const path = require('path')

  const normalizedBase = path.resolve(basePath)
  const normalizedTarget = path.resolve(basePath, targetPath)

  return normalizedTarget.startsWith(normalizedBase)
}

/**
 * 안전한 경로 조합 (Path Traversal 방지)
 *
 * @param basePath - 기본 디렉토리
 * @param relativePath - 상대 경로
 * @returns 안전한 절대 경로 또는 null (위험한 경우)
 */
export function safePath(
  basePath: string,
  relativePath: string
): FsSafeString | null {
  const path = require('path')

  // 위험한 패턴 제거
  const cleaned = relativePath
    .replace(/\.\./g, '')
    .replace(/^[/\\]+/, '')

  const fullPath = path.join(basePath, cleaned)

  // Path Traversal 검증
  if (!isPathSafe(basePath, cleaned)) {
    return null
  }

  return asFsSafe(fullPath)
}

// =====================================================
// 유틸리티 함수
// =====================================================

/**
 * UTF-8 바이트 길이 기준으로 문자열 자르기
 */
function truncateToByteLength(str: string, maxBytes: number): string {
  const buf = Buffer.from(str, 'utf8')
  if (buf.length <= maxBytes) {
    return str
  }

  // 바이트 단위로 자르되, UTF-8 문자 경계 존중
  let truncated = buf.slice(0, maxBytes)

  // 잘린 UTF-8 시퀀스 처리
  while (truncated.length > 0) {
    try {
      return truncated.toString('utf8')
    } catch {
      truncated = truncated.slice(0, -1)
    }
  }

  return ''
}

/**
 * 경로에서 파일명 추출 및 정제
 */
export function extractSafeFilename(path: string): FsSafeString {
  const pathModule = require('path')
  const filename = pathModule.basename(path)
  return sanitizeFilename(filename)
}

/**
 * 파일명이 안전한지 검증
 */
export function isFilenameValid(filename: string, windowsCompat = true): boolean {
  if (!filename || filename.trim() === '') {
    return false
  }

  // 금지 문자 검사 (g 플래그 없이 검사해야 함)
  const forbiddenPattern = windowsCompat
    ? /[<>:"/\\|?*\x00-\x1f]/
    : /[/\x00]/
  if (forbiddenPattern.test(filename)) {
    return false
  }

  // Windows 예약어 검사
  if (windowsCompat) {
    const baseName = filename.split('.')[0].toUpperCase()
    if (WINDOWS_RESERVED_NAMES.has(baseName)) {
      return false
    }
  }

  // 길이 검사
  if (Buffer.byteLength(filename, 'utf8') > MAX_FILENAME_LENGTH) {
    return false
  }

  return true
}

/**
 * 이메일 ID를 안전한 파일명으로 변환
 */
export function emailIdToFilename(
  messageId: string,
  extension = '.eml'
): FsSafeString {
  // Message-ID에서 < > 제거하고 정제
  let cleaned = messageId.replace(/^<|>$/g, '')

  // 안전하지 않은 문자 해시화
  if (!isFilenameValid(cleaned)) {
    const crypto = require('crypto')
    cleaned = crypto.createHash('sha256').update(messageId).digest('hex').substring(0, 32)
  }

  return sanitizeFilename(cleaned + extension)
}

/**
 * 폴더 경로를 안전한 디렉토리 이름으로 변환
 */
export function folderPathToDirectoryName(
  folderPath: string,
  delimiter = '/'
): FsSafeString {
  // 구분자를 OS 안전 문자로 대체
  const safePath = folderPath.replace(new RegExp(`\\${delimiter}`, 'g'), '_')
  return sanitizeFoldername(safePath)
}

// =====================================================
// 다국어 파일명 지원
// =====================================================

/**
 * 다국어 파일명을 ASCII로 변환 (호환성용)
 * 원본 유니코드 문자를 유지하면서 ASCII 대체 이름도 제공
 */
export function createAsciiAlternative(filename: string): {
  original: Utf8String
  ascii: FsSafeString
  hasNonAscii: boolean
} {
  const hasNonAscii = /[^\x00-\x7F]/.test(filename)

  if (!hasNonAscii) {
    return {
      original: asUtf8(filename),
      ascii: sanitizeFilename(filename),
      hasNonAscii: false,
    }
  }

  // Non-ASCII 문자를 hex로 변환
  const asciiVersion = Array.from(filename)
    .map((char) => {
      const code = char.charCodeAt(0)
      if (code > 127) {
        return `_${code.toString(16)}_`
      }
      return char
    })
    .join('')

  return {
    original: asUtf8(filename),
    ascii: sanitizeFilename(asciiVersion),
    hasNonAscii: true,
  }
}
