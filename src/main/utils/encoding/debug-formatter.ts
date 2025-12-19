/**
 * 디버그용 문자열 포매터
 *
 * 콘솔 인코딩 문제를 피하기 위한 안전한 로그 출력 유틸리티
 * - 비ASCII 문자를 hex/escape 시퀀스로 표시
 * - 구조화된 로그 형식 제공
 * - 인코딩 상태 시각화
 */

// =====================================================
// 안전한 문자열 출력
// =====================================================

/**
 * 문자열을 콘솔에서 안전하게 출력할 수 있는 형태로 변환
 *
 * @param str - 원본 문자열
 * @param options - 포맷 옵션
 * @returns 안전한 출력 문자열
 */
export function toSafeString(
  str: string,
  options: {
    /** 최대 길이 */
    maxLength?: number
    /** 비ASCII 문자 escape 방식 */
    escapeMode?: 'hex' | 'unicode' | 'mixed'
    /** 제어 문자 표시 */
    showControlChars?: boolean
  } = {}
): string {
  const { maxLength = 200, escapeMode = 'mixed', showControlChars = true } = options

  if (!str) {
    return '<empty>'
  }

  let result = ''
  const chars = Array.from(str) // 서로게이트 페어 지원

  for (const char of chars) {
    const code = char.codePointAt(0) || 0

    // 제어 문자 (0x00-0x1F, 0x7F)
    if (code < 0x20 || code === 0x7f) {
      if (showControlChars) {
        result += `\\x${code.toString(16).padStart(2, '0')}`
      }
      continue
    }

    // ASCII printable (0x20-0x7E)
    if (code >= 0x20 && code <= 0x7e) {
      result += char
      continue
    }

    // 비ASCII 문자
    switch (escapeMode) {
      case 'hex':
        result += toHexEscape(char)
        break
      case 'unicode':
        result += toUnicodeEscape(char)
        break
      case 'mixed':
      default:
        // 일반적인 다국어 문자는 그대로, 특수 문자는 escape
        if (isCommonMultilingualChar(code)) {
          result += char
        } else {
          result += toUnicodeEscape(char)
        }
        break
    }

    // 길이 제한
    if (result.length >= maxLength) {
      result = result.substring(0, maxLength - 3) + '...'
      break
    }
  }

  return result
}

/**
 * 문자를 hex escape 형태로 변환
 */
function toHexEscape(char: string): string {
  const bytes = Buffer.from(char, 'utf8')
  return Array.from(bytes)
    .map((b) => `\\x${b.toString(16).padStart(2, '0')}`)
    .join('')
}

/**
 * 문자를 unicode escape 형태로 변환
 */
function toUnicodeEscape(char: string): string {
  const code = char.codePointAt(0) || 0
  if (code > 0xffff) {
    return `\\u{${code.toString(16)}}`
  }
  return `\\u${code.toString(16).padStart(4, '0')}`
}

/**
 * 일반적인 다국어 문자인지 확인 (콘솔에서 깨지지 않을 가능성이 높은 문자)
 */
function isCommonMultilingualChar(code: number): boolean {
  // 한글 음절
  if (code >= 0xac00 && code <= 0xd7af) return true
  // 한글 자모
  if (code >= 0x1100 && code <= 0x11ff) return true
  if (code >= 0x3130 && code <= 0x318f) return true
  // CJK 통합 한자
  if (code >= 0x4e00 && code <= 0x9fff) return true
  // 히라가나/가타카나
  if (code >= 0x3040 && code <= 0x30ff) return true
  // 라틴 확장
  if (code >= 0x00c0 && code <= 0x024f) return true

  return false
}

// =====================================================
// Hex 덤프 출력
// =====================================================

/**
 * 문자열의 hex 덤프 생성
 */
export function hexDump(str: string): string {
  const buffer = Buffer.from(str, 'utf8')
  return buffer.toString('hex')
}

/**
 * 상세 hex 덤프 (바이트별 분리)
 */
export function hexDumpDetailed(str: string): string {
  const buffer = Buffer.from(str, 'utf8')
  const bytes = Array.from(buffer)
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')
}

/**
 * 문자별 hex 덤프
 */
export function charHexDump(str: string): Array<{ char: string; hex: string; code: number }> {
  return Array.from(str).map((char) => ({
    char,
    hex: Buffer.from(char, 'utf8').toString('hex'),
    code: char.codePointAt(0) || 0,
  }))
}

// =====================================================
// 구조화된 로그 출력
// =====================================================

export interface DebugStringInfo {
  /** 원본 문자열 (안전하게 변환됨) */
  value: string
  /** 원본 길이 */
  length: number
  /** UTF-8 바이트 길이 */
  byteLength: number
  /** Hex 덤프 */
  hex: string
  /** 비ASCII 문자 포함 여부 */
  hasNonAscii: boolean
  /** IMAP UTF-7 인코딩 여부 추정 */
  looksEncoded: boolean
}

/**
 * 디버깅용 문자열 정보 생성
 */
export function debugString(str: string): DebugStringInfo {
  return {
    value: toSafeString(str),
    length: str.length,
    byteLength: Buffer.byteLength(str, 'utf8'),
    hex: hexDump(str),
    hasNonAscii: /[^\x00-\x7f]/.test(str),
    looksEncoded: /&[A-Za-z0-9+,]+-/.test(str),
  }
}

/**
 * 여러 문자열을 비교하기 위한 디버그 정보
 */
export function compareStrings(
  strings: Record<string, string>
): Record<string, DebugStringInfo & { equals: string[] }> {
  const result: Record<string, DebugStringInfo & { equals: string[] }> = {}

  const entries = Object.entries(strings)

  for (const [key, value] of entries) {
    const info = debugString(value)

    // 동일한 값을 가진 다른 키 찾기
    const equals = entries.filter(([k, v]) => k !== key && v === value).map(([k]) => k)

    result[key] = { ...info, equals }
  }

  return result
}

// =====================================================
// 로그 메시지 포매터
// =====================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogMessage {
  level: LogLevel
  message: string
  data?: Record<string, unknown>
  timestamp: string
}

/**
 * 구조화된 로그 메시지 생성
 */
export function formatLogMessage(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>
): LogMessage {
  return {
    level,
    message,
    data: data ? sanitizeLogData(data) : undefined,
    timestamp: new Date().toISOString(),
  }
}

/**
 * 로그 데이터 내의 문자열을 안전하게 변환
 */
function sanitizeLogData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      result[key] = toSafeString(value)
      // 비ASCII가 포함된 경우 hex도 추가
      if (/[^\x00-\x7f]/.test(value)) {
        result[`${key}_hex`] = hexDump(value)
      }
    } else if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        result[key] = value.map((v) =>
          typeof v === 'string' ? toSafeString(v) : v
        )
      } else {
        result[key] = sanitizeLogData(value as Record<string, unknown>)
      }
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * JSON 형태의 로그 문자열 생성
 */
export function toJsonLog(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>
): string {
  const logMessage = formatLogMessage(level, message, data)
  return JSON.stringify(logMessage)
}

// =====================================================
// 콘솔 출력 헬퍼
// =====================================================

/**
 * 안전한 콘솔 로그 출력
 */
export function safeLog(message: string, data?: Record<string, unknown>): void {
  if (data) {
    console.log(`[${new Date().toISOString()}] ${message}`, sanitizeLogData(data))
  } else {
    console.log(`[${new Date().toISOString()}] ${message}`)
  }
}

/**
 * 문자열 디버깅 출력
 */
export function logString(label: string, str: string): void {
  const info = debugString(str)
  console.log(`[STRING DEBUG] ${label}:`)
  console.log(`  value: "${info.value}"`)
  console.log(`  length: ${info.length}, bytes: ${info.byteLength}`)
  console.log(`  hex: ${info.hex}`)
  console.log(`  hasNonAscii: ${info.hasNonAscii}, looksEncoded: ${info.looksEncoded}`)
}

/**
 * 두 문자열 비교 디버깅 출력
 */
export function logCompare(label1: string, str1: string, label2: string, str2: string): void {
  console.log('[STRING COMPARE]')
  logString(label1, str1)
  logString(label2, str2)
  console.log(`  equal: ${str1 === str2}`)
  if (str1 !== str2) {
    console.log(`  firstDiff: ${findFirstDifference(str1, str2)}`)
  }
}

/**
 * 두 문자열에서 처음으로 다른 위치 찾기
 */
function findFirstDifference(a: string, b: string): string {
  const maxLen = Math.max(a.length, b.length)
  for (let i = 0; i < maxLen; i++) {
    if (a[i] !== b[i]) {
      const aChar = a[i] ?? '<end>'
      const bChar = b[i] ?? '<end>'
      const aHex = a[i] ? hexDump(a[i]) : 'N/A'
      const bHex = b[i] ? hexDump(b[i]) : 'N/A'
      return `index ${i}: "${aChar}"(${aHex}) vs "${bChar}"(${bHex})`
    }
  }
  return 'no difference found'
}

// =====================================================
// 인코딩 시각화
// =====================================================

/**
 * 문자열의 인코딩 상태를 시각적으로 표시
 */
export function visualizeEncoding(str: string): string {
  const lines: string[] = []

  lines.push(`Input: "${toSafeString(str)}"`)
  lines.push(`Length: ${str.length} chars, ${Buffer.byteLength(str, 'utf8')} bytes`)
  lines.push('')
  lines.push('Character breakdown:')
  lines.push('─'.repeat(60))

  const chars = Array.from(str)
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]
    const code = char.codePointAt(0) || 0
    const hex = Buffer.from(char, 'utf8').toString('hex')
    const category = getCharCategory(code)

    lines.push(
      `[${i.toString().padStart(3)}] ` +
        `"${toSafeString(char, { escapeMode: 'unicode' })}" ` +
        `U+${code.toString(16).toUpperCase().padStart(4, '0')} ` +
        `(${hex}) ` +
        `[${category}]`
    )
  }

  return lines.join('\n')
}

/**
 * 문자 카테고리 분류
 */
function getCharCategory(code: number): string {
  if (code < 0x20) return 'CTRL'
  if (code < 0x7f) return 'ASCII'
  if (code === 0x7f) return 'DEL'
  if (code < 0x100) return 'Latin-1'
  if (code >= 0xac00 && code <= 0xd7af) return 'Hangul'
  if (code >= 0x3040 && code <= 0x309f) return 'Hiragana'
  if (code >= 0x30a0 && code <= 0x30ff) return 'Katakana'
  if (code >= 0x4e00 && code <= 0x9fff) return 'CJK'
  if (code >= 0x1f300 && code <= 0x1f9ff) return 'Emoji'
  return 'Other'
}
