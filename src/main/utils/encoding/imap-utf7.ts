/**
 * IMAP Modified UTF-7 인코딩/디코딩
 * RFC 3501 Section 5.1.3에 따른 구현
 *
 * IMAP Modified UTF-7은 표준 UTF-7과 다름:
 * - '&' 대신 '&'를 시프트 문자로 사용
 * - '/' 대신 ','를 Base64 패딩에 사용
 * - '+' 대신 '&'를 사용하고 '-'로 종료
 * - '&' 리터럴은 '&-'로 표현
 */

import { Utf8String, ImapUtf7String, asUtf8, asImapUtf7, EncodingResult } from './types'

// =====================================================
// IMAP Modified UTF-7 디코딩
// =====================================================

/**
 * IMAP Modified UTF-7 문자열을 UTF-8로 디코딩
 *
 * @param encoded - IMAP Modified UTF-7로 인코딩된 문자열
 * @returns 디코딩된 UTF-8 문자열
 *
 * @example
 * decodeImapUtf7('&wqTYhA-') // '잡다'
 * decodeImapUtf7('INBOX') // 'INBOX'
 * decodeImapUtf7('&-') // '&'
 */
export function decodeImapUtf7(encoded: ImapUtf7String | string): Utf8String {
  const str = encoded as string

  // 빈 문자열 또는 '&'가 없으면 그대로 반환
  if (!str || !str.includes('&')) {
    return asUtf8(str)
  }

  let result = ''
  let i = 0

  while (i < str.length) {
    const char = str[i]

    if (char === '&') {
      // '&-'는 리터럴 '&'
      if (str[i + 1] === '-') {
        result += '&'
        i += 2
        continue
      }

      // 인코딩된 시퀀스 찾기
      const endIndex = str.indexOf('-', i + 1)
      if (endIndex === -1) {
        // 잘못된 형식 - 그대로 추가
        result += char
        i++
        continue
      }

      // Base64 시퀀스 추출 및 디코딩
      const base64Encoded = str.substring(i + 1, endIndex)

      try {
        const decoded = decodeModifiedBase64(base64Encoded)
        result += decoded
      } catch {
        // 디코딩 실패 - 원본 그대로 추가
        result += str.substring(i, endIndex + 1)
      }

      i = endIndex + 1
    } else {
      result += char
      i++
    }
  }

  return asUtf8(result)
}

/**
 * IMAP Modified Base64 디코딩 (내부 함수)
 * IMAP은 '/'를 ','로 대체한 Modified Base64 사용
 */
function decodeModifiedBase64(encoded: string): string {
  // IMAP Modified Base64: ',' → '/'
  const standardBase64 = encoded.replace(/,/g, '/')

  // 패딩 추가 (Base64는 4의 배수여야 함)
  const paddingNeeded = (4 - (standardBase64.length % 4)) % 4
  const padded = standardBase64 + '='.repeat(paddingNeeded)

  // Base64 디코딩
  const buffer = Buffer.from(padded, 'base64')

  // UTF-16BE로 디코딩 (IMAP UTF-7은 UTF-16BE 사용)
  let result = ''
  for (let i = 0; i < buffer.length; i += 2) {
    if (i + 1 < buffer.length) {
      const code = (buffer[i] << 8) | buffer[i + 1]
      result += String.fromCharCode(code)
    }
  }

  return result
}

/**
 * 안전한 IMAP UTF-7 디코딩 (에러 처리 포함)
 */
export function safeDecodeImapUtf7(encoded: string): EncodingResult<Utf8String> {
  try {
    const decoded = decodeImapUtf7(asImapUtf7(encoded))
    return { success: true, value: decoded, original: encoded }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown decoding error',
      original: encoded,
    }
  }
}

// =====================================================
// IMAP Modified UTF-7 인코딩
// =====================================================

/**
 * UTF-8 문자열을 IMAP Modified UTF-7로 인코딩
 *
 * @param decoded - UTF-8 문자열
 * @returns IMAP Modified UTF-7로 인코딩된 문자열
 *
 * @example
 * encodeImapUtf7('잡다') // '&wqTYhA-'
 * encodeImapUtf7('INBOX') // 'INBOX'
 * encodeImapUtf7('&') // '&-'
 */
export function encodeImapUtf7(decoded: Utf8String | string): ImapUtf7String {
  const str = decoded as string

  if (!str) {
    return asImapUtf7(str)
  }

  let result = ''
  let nonAsciiBuffer = ''

  const flushNonAscii = (): void => {
    if (nonAsciiBuffer.length > 0) {
      const encoded = encodeModifiedBase64(nonAsciiBuffer)
      result += '&' + encoded + '-'
      nonAsciiBuffer = ''
    }
  }

  for (let i = 0; i < str.length; i++) {
    const char = str[i]
    const code = char.charCodeAt(0)

    // ASCII printable 범위 (0x20-0x7E) 체크
    if (code >= 0x20 && code <= 0x7e) {
      flushNonAscii()

      if (char === '&') {
        // '&' 리터럴은 '&-'로 인코딩
        result += '&-'
      } else {
        result += char
      }
    } else {
      // Non-ASCII 문자는 버퍼에 추가
      nonAsciiBuffer += char
    }
  }

  // 남은 non-ASCII 버퍼 처리
  flushNonAscii()

  return asImapUtf7(result)
}

/**
 * IMAP Modified Base64 인코딩 (내부 함수)
 */
function encodeModifiedBase64(str: string): string {
  // UTF-16BE로 변환
  const buffer = Buffer.alloc(str.length * 2)
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    buffer[i * 2] = (code >> 8) & 0xff
    buffer[i * 2 + 1] = code & 0xff
  }

  // Base64 인코딩
  let base64 = buffer.toString('base64')

  // 패딩 제거 및 '/' → ','로 변환 (IMAP Modified Base64)
  base64 = base64.replace(/=+$/, '').replace(/\//g, ',')

  return base64
}

/**
 * 안전한 IMAP UTF-7 인코딩 (에러 처리 포함)
 */
export function safeEncodeImapUtf7(decoded: string): EncodingResult<ImapUtf7String> {
  try {
    const encoded = encodeImapUtf7(asUtf8(decoded))
    return { success: true, value: encoded, original: decoded }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown encoding error',
      original: decoded,
    }
  }
}

// =====================================================
// 유틸리티 함수
// =====================================================

/**
 * 문자열에 non-ASCII 문자가 포함되어 있는지 확인
 */
export function hasNonAscii(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code < 0x20 || code > 0x7e) {
      return true
    }
  }
  return false
}

/**
 * 인코딩 왕복 테스트 (encode → decode가 원본과 일치하는지)
 */
export function verifyRoundTrip(original: string): boolean {
  try {
    const encoded = encodeImapUtf7(asUtf8(original))
    const decoded = decodeImapUtf7(encoded)
    return decoded === original
  } catch {
    return false
  }
}

/**
 * IMAP UTF-7로 인코딩된 문자열인지 추측
 * (휴리스틱 - 100% 정확하지 않음)
 */
export function looksLikeImapUtf7(str: string): boolean {
  // '&'로 시작하고 '-'로 끝나는 시퀀스가 있으면 인코딩된 것으로 추측
  return /&[A-Za-z0-9+,]+-/.test(str)
}

/**
 * 문자열이 이미 인코딩되어 있으면 디코딩, 아니면 그대로 반환
 * (안전한 디코딩 - 이미 디코딩된 문자열에 적용해도 안전)
 */
export function ensureDecoded(str: string): Utf8String {
  if (looksLikeImapUtf7(str)) {
    return decodeImapUtf7(asImapUtf7(str))
  }
  return asUtf8(str)
}

/**
 * 디버그용: 문자열의 인코딩 상태 분석
 */
export function analyzeString(str: string): {
  original: string
  length: number
  hasNonAscii: boolean
  looksEncoded: boolean
  hexDump: string
  decoded?: string
  encoded?: string
} {
  const result: ReturnType<typeof analyzeString> = {
    original: str,
    length: str.length,
    hasNonAscii: hasNonAscii(str),
    looksEncoded: looksLikeImapUtf7(str),
    hexDump: Buffer.from(str, 'utf8').toString('hex'),
  }

  if (result.looksEncoded) {
    try {
      result.decoded = decodeImapUtf7(asImapUtf7(str)) as string
    } catch {
      // 디코딩 실패
    }
  }

  if (result.hasNonAscii) {
    try {
      result.encoded = encodeImapUtf7(asUtf8(str)) as string
    } catch {
      // 인코딩 실패
    }
  }

  return result
}
