/**
 * 유니코드 정규화 및 문자열 처리 유틸리티
 *
 * 다국어 문자열의 일관된 처리를 위한 정규화 기능 제공
 * - NFC/NFD 정규화
 * - 한글 자모 결합/분리
 * - 다국어 비교 및 검색 지원
 */

import { Utf8String, asUtf8 } from './types'

// =====================================================
// 유니코드 정규화
// =====================================================

/**
 * 유니코드 정규화 형태
 * - NFC: Canonical Decomposition, followed by Canonical Composition (권장)
 * - NFD: Canonical Decomposition
 * - NFKC: Compatibility Decomposition, followed by Canonical Composition
 * - NFKD: Compatibility Decomposition
 */
export type NormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD'

/**
 * 문자열을 지정된 형태로 정규화
 *
 * @param str - 원본 문자열
 * @param form - 정규화 형태 (기본: NFC)
 * @returns 정규화된 문자열
 *
 * @example
 * // 한글 자모 결합
 * normalize('ㄱㅏ') // '가' (NFC)
 *
 * // 다른 유니코드 표현 통일
 * normalize('café') // 일관된 표현
 */
export function normalize(str: string, form: NormalizationForm = 'NFC'): Utf8String {
  if (!str) {
    return asUtf8(str)
  }
  return asUtf8(str.normalize(form))
}

/**
 * NFC 정규화 (가장 일반적인 형태)
 * 문자와 결합 문자를 하나의 문자로 결합
 */
export function normalizeNFC(str: string): Utf8String {
  return normalize(str, 'NFC')
}

/**
 * NFD 정규화
 * 문자를 기본 문자와 결합 문자로 분리
 */
export function normalizeNFD(str: string): Utf8String {
  return normalize(str, 'NFD')
}

/**
 * NFKC 정규화
 * 호환 문자를 표준 형태로 변환 후 결합
 */
export function normalizeNFKC(str: string): Utf8String {
  return normalize(str, 'NFKC')
}

// =====================================================
// 다국어 문자열 비교
// =====================================================

/**
 * 정규화된 문자열 비교
 *
 * @param a - 첫 번째 문자열
 * @param b - 두 번째 문자열
 * @param options - 비교 옵션
 * @returns 동일 여부
 */
export function equals(
  a: string,
  b: string,
  options: { ignoreCase?: boolean; normalize?: boolean } = {}
): boolean {
  const { ignoreCase = false, normalize: shouldNormalize = true } = options

  let strA = a
  let strB = b

  if (shouldNormalize) {
    strA = normalizeNFC(strA)
    strB = normalizeNFC(strB)
  }

  if (ignoreCase) {
    return strA.toLowerCase() === strB.toLowerCase()
  }

  return strA === strB
}

/**
 * 로케일 인식 문자열 비교 (정렬용)
 *
 * @param a - 첫 번째 문자열
 * @param b - 두 번째 문자열
 * @param locale - 로케일 (기본: 'ko')
 * @returns 비교 결과 (-1, 0, 1)
 */
export function compare(a: string, b: string, locale = 'ko'): number {
  const collator = new Intl.Collator(locale, {
    sensitivity: 'base',
    numeric: true,
  })
  return collator.compare(normalizeNFC(a), normalizeNFC(b))
}

/**
 * 대소문자 무시 포함 여부 검사
 */
export function containsIgnoreCase(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalizeNFC(haystack).toLowerCase()
  const normalizedNeedle = normalizeNFC(needle).toLowerCase()
  return normalizedHaystack.includes(normalizedNeedle)
}

// =====================================================
// 한글 특수 처리
// =====================================================

/** 한글 유니코드 범위 */
const HANGUL_SYLLABLES_START = 0xac00
const HANGUL_SYLLABLES_END = 0xd7a3
const HANGUL_JAMO_START = 0x1100
const HANGUL_JAMO_END = 0x11ff
const HANGUL_COMPAT_JAMO_START = 0x3130
const HANGUL_COMPAT_JAMO_END = 0x318f

/**
 * 한글 음절인지 확인
 */
export function isHangulSyllable(char: string): boolean {
  const code = char.charCodeAt(0)
  return code >= HANGUL_SYLLABLES_START && code <= HANGUL_SYLLABLES_END
}

/**
 * 한글 자모인지 확인
 */
export function isHangulJamo(char: string): boolean {
  const code = char.charCodeAt(0)
  return (
    (code >= HANGUL_JAMO_START && code <= HANGUL_JAMO_END) ||
    (code >= HANGUL_COMPAT_JAMO_START && code <= HANGUL_COMPAT_JAMO_END)
  )
}

/**
 * 문자열에 한글이 포함되어 있는지 확인
 */
export function containsHangul(str: string): boolean {
  for (const char of str) {
    if (isHangulSyllable(char) || isHangulJamo(char)) {
      return true
    }
  }
  return false
}

/**
 * 한글 초성 추출
 */
export function extractChosung(str: string): string {
  const CHOSUNG = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
    'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
  ]

  let result = ''

  for (const char of str) {
    const code = char.charCodeAt(0)

    if (code >= HANGUL_SYLLABLES_START && code <= HANGUL_SYLLABLES_END) {
      const index = Math.floor((code - HANGUL_SYLLABLES_START) / (21 * 28))
      result += CHOSUNG[index]
    } else {
      result += char
    }
  }

  return result
}

/**
 * 한글 초성 검색 (검색어가 대상의 초성과 일치하는지)
 *
 * @example
 * matchChosung('받은편지함', 'ㅂㅇㅍㅈㅎ') // true
 * matchChosung('받은편지함', 'ㅂㅇ') // true (부분 일치)
 */
export function matchChosung(target: string, query: string): boolean {
  const targetChosung = extractChosung(target)
  return targetChosung.includes(query)
}

// =====================================================
// 일본어/중국어 처리
// =====================================================

/** CJK 통합 한자 범위 */
const CJK_UNIFIED_START = 0x4e00
const CJK_UNIFIED_END = 0x9fff

/** 히라가나 범위 */
const HIRAGANA_START = 0x3040
const HIRAGANA_END = 0x309f

/** 가타카나 범위 */
const KATAKANA_START = 0x30a0
const KATAKANA_END = 0x30ff

/**
 * CJK 한자인지 확인
 */
export function isCJKUnified(char: string): boolean {
  const code = char.charCodeAt(0)
  return code >= CJK_UNIFIED_START && code <= CJK_UNIFIED_END
}

/**
 * 일본어 문자인지 확인 (히라가나 또는 가타카나)
 */
export function isJapanese(char: string): boolean {
  const code = char.charCodeAt(0)
  return (
    (code >= HIRAGANA_START && code <= HIRAGANA_END) ||
    (code >= KATAKANA_START && code <= KATAKANA_END)
  )
}

/**
 * 문자열에 CJK 문자가 포함되어 있는지 확인
 */
export function containsCJK(str: string): boolean {
  for (const char of str) {
    if (isCJKUnified(char) || isJapanese(char) || isHangulSyllable(char)) {
      return true
    }
  }
  return false
}

/**
 * 문자열에 이모지가 포함되어 있는지 확인
 */
export function hasEmoji(str: string): boolean {
  for (const char of str) {
    const code = char.codePointAt(0) || 0
    // Misc Symbols and Pictographs, Emoticons, etc.
    if (code >= 0x1f300 && code <= 0x1f9ff) return true
    // Misc symbols
    if (code >= 0x2600 && code <= 0x26ff) return true
    // Dingbats
    if (code >= 0x2700 && code <= 0x27bf) return true
    // Supplemental Symbols and Pictographs
    if (code >= 0x1fa00 && code <= 0x1faff) return true
    // Regional indicator symbols (flags)
    if (code >= 0x1f1e0 && code <= 0x1f1ff) return true
  }
  return false
}

// =====================================================
// 문자열 분석 및 분류
// =====================================================

export type CharacterScript =
  | 'latin'
  | 'hangul'
  | 'japanese'
  | 'chinese'
  | 'cyrillic'
  | 'arabic'
  | 'mixed'
  | 'other'

/**
 * 문자열의 주요 스크립트 감지
 */
export function detectScript(str: string): CharacterScript {
  if (!str) return 'other'

  const scripts: Record<CharacterScript, number> = {
    latin: 0,
    hangul: 0,
    japanese: 0,
    chinese: 0,
    cyrillic: 0,
    arabic: 0,
    mixed: 0,
    other: 0,
  }

  for (const char of str) {
    const code = char.charCodeAt(0)

    if (/[a-zA-Z]/.test(char)) {
      scripts.latin++
    } else if (isHangulSyllable(char) || isHangulJamo(char)) {
      scripts.hangul++
    } else if (isJapanese(char)) {
      scripts.japanese++
    } else if (isCJKUnified(char)) {
      scripts.chinese++
    } else if (code >= 0x0400 && code <= 0x04ff) {
      scripts.cyrillic++
    } else if (code >= 0x0600 && code <= 0x06ff) {
      scripts.arabic++
    }
  }

  // 가장 많은 스크립트 반환
  const entries = Object.entries(scripts) as [CharacterScript, number][]
  const sorted = entries.filter(([k]) => k !== 'mixed' && k !== 'other').sort((a, b) => b[1] - a[1])

  if (sorted.length === 0 || sorted[0][1] === 0) {
    return 'other'
  }

  // 여러 스크립트가 섞여 있으면 'mixed'
  if (sorted.length > 1 && sorted[1][1] > 0 && sorted[0][1] < str.length * 0.8) {
    return 'mixed'
  }

  return sorted[0][0]
}

/**
 * 문자열 분석 결과
 */
export interface StringAnalysis {
  length: number
  charCount: number
  byteLength: number
  script: CharacterScript
  hasHangul: boolean
  hasCJK: boolean
  hasEmoji: boolean
  isNormalized: boolean
  normalizationForm: NormalizationForm | null
}

/**
 * 문자열 상세 분석
 */
export function analyzeString(str: string): StringAnalysis {
  const normalized = normalizeNFC(str)

  return {
    length: str.length,
    charCount: Array.from(str).length, // 서로게이트 페어 고려
    byteLength: Buffer.byteLength(str, 'utf8'),
    script: detectScript(str),
    hasHangul: containsHangul(str),
    hasCJK: containsCJK(str),
    hasEmoji: hasEmoji(str),
    isNormalized: str === normalized,
    normalizationForm: str === normalized ? 'NFC' : null,
  }
}

// =====================================================
// 문자열 변환 유틸리티
// =====================================================

/**
 * 전각 문자를 반각으로 변환
 */
export function toHalfWidth(str: string): Utf8String {
  return asUtf8(
    str.replace(/[\uff01-\uff5e]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0)
    )
  )
}

/**
 * 반각 문자를 전각으로 변환
 */
export function toFullWidth(str: string): Utf8String {
  return asUtf8(
    str.replace(/[!-~]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) + 0xfee0)
    )
  )
}

/**
 * 검색용 문자열 정규화
 * - NFC 정규화
 * - 소문자 변환
 * - 전각→반각 변환
 * - 연속 공백 정리
 */
export function normalizeForSearch(str: string): Utf8String {
  let result = str

  // NFC 정규화
  result = normalizeNFC(result)

  // 전각→반각
  result = toHalfWidth(result)

  // 소문자 변환
  result = result.toLowerCase()

  // 연속 공백 정리
  result = result.replace(/\s+/g, ' ').trim()

  return asUtf8(result)
}
