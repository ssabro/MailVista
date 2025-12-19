/**
 * 인코딩 유틸리티 통합 모듈
 *
 * 다국어 문자열 처리를 위한 중앙화된 인코딩/디코딩 유틸리티
 *
 * @example
 * import {
 *   // 타입
 *   Utf8String,
 *   ImapUtf7String,
 *   FolderIdentifier,
 *
 *   // IMAP UTF-7
 *   encodeImapUtf7,
 *   decodeImapUtf7,
 *
 *   // 폴더 어댑터
 *   createFolderIdentifier,
 *   convertImapListToFolders,
 *
 *   // 유니코드
 *   normalizeNFC,
 *   containsHangul,
 *
 *   // 디버깅
 *   debugString,
 *   toSafeString,
 * } from './utils/encoding'
 */

// =====================================================
// 타입 정의
// =====================================================
export {
  // Branded Types
  type Utf8String,
  type ImapUtf7String,
  type FsSafeString,
  type RawString,

  // 타입 변환 헬퍼
  asUtf8,
  asImapUtf7,
  asFsSafe,
  toString,

  // 인터페이스
  type FolderIdentifier,
  type EncodedHeader,
  type EncodingResult,

  // 테스트 상수
  ENCODING_TEST_STRINGS,
} from './types'

// =====================================================
// IMAP Modified UTF-7 인코딩/디코딩
// =====================================================
export {
  // 핵심 함수
  encodeImapUtf7,
  decodeImapUtf7,

  // 안전한 버전 (에러 처리 포함)
  safeEncodeImapUtf7,
  safeDecodeImapUtf7,

  // 유틸리티
  hasNonAscii,
  verifyRoundTrip,
  looksLikeImapUtf7,
  ensureDecoded,
  analyzeString as analyzeImapString,
} from './imap-utf7'

// =====================================================
// 파일 시스템 경로 안전화
// =====================================================
export {
  // 파일명/경로 정제
  sanitizeFilename,
  sanitizeFoldername,
  sanitizePath,

  // Path Traversal 방지
  isPathSafe,
  safePath,

  // 유틸리티
  extractSafeFilename,
  isFilenameValid,
  emailIdToFilename,
  folderPathToDirectoryName,
  createAsciiAlternative,

  // 옵션 타입
  type SanitizeOptions,
} from './path-sanitizer'

// =====================================================
// 유니코드 정규화
// =====================================================
export {
  // 정규화
  normalize,
  normalizeNFC,
  normalizeNFD,
  normalizeNFKC,

  // 문자열 비교
  equals as unicodeEquals,
  compare as unicodeCompare,
  containsIgnoreCase,

  // 한글 처리
  isHangulSyllable,
  isHangulJamo,
  containsHangul,
  extractChosung,
  matchChosung,

  // CJK 처리
  isCJKUnified,
  isJapanese,
  containsCJK,

  // 문자열 분석
  detectScript,
  analyzeString as analyzeUnicodeString,

  // 변환
  toHalfWidth,
  toFullWidth,
  normalizeForSearch,

  // 타입
  type NormalizationForm,
  type CharacterScript,
  type StringAnalysis,
} from './unicode-normalizer'

// =====================================================
// 디버그 포매터
// =====================================================
export {
  // 안전한 문자열 출력
  toSafeString,

  // Hex 덤프
  hexDump,
  hexDumpDetailed,
  charHexDump,

  // 디버그 정보
  debugString,
  compareStrings,

  // 구조화된 로그
  formatLogMessage,
  toJsonLog,
  safeLog,
  logString,
  logCompare,

  // 시각화
  visualizeEncoding,

  // 타입
  type DebugStringInfo,
  type LogLevel,
  type LogMessage,
} from './debug-formatter'

// =====================================================
// IMAP 폴더 어댑터
// =====================================================
export {
  // FolderIdentifier 생성
  createFolderIdentifier,
  createFolderIdentifierFromPath,

  // 경로 변환
  toWirePath,
  toStoragePath,
  toDisplayName,
  pathToWire,
  wireToStorage,

  // 폴더 목록 변환
  convertImapListToFolders,

  // 검색 및 비교
  isSamePath,
  findFolderByPath,
  findMailFolderByPath,

  // 특수 폴더
  detectSpecialUse,
  isSpecialFolder,

  // 디버깅
  debugFolder,
  traceFolderConversion,

  // 캐시
  FolderPathCache,
  getPathCache,

  // 타입 (기존 코드 호환)
  type MailFolder,
} from './imap-folder-adapter'

// =====================================================
// 편의 함수
// =====================================================

import { ensureDecoded as _ensureDecoded } from './imap-utf7'
import { normalizeNFC as _normalizeNFC } from './unicode-normalizer'
import { toString as _toString, asUtf8 as _asUtf8 } from './types'

/**
 * 외부에서 받은 문자열을 애플리케이션 내부 표준 형태로 정규화
 *
 * 1. IMAP UTF-7 디코딩 (필요시)
 * 2. NFC 유니코드 정규화
 *
 * @param input - 외부에서 받은 문자열
 * @returns 정규화된 UTF-8 문자열
 */
export function normalizeInput(input: string): string {
  const decoded = _ensureDecoded(input)
  const normalized = _normalizeNFC(_toString(decoded))
  return normalized
}

/**
 * 내부 문자열을 IMAP 서버 전송용으로 변환
 *
 * @param internal - 내부 UTF-8 문자열
 * @returns IMAP Modified UTF-7 인코딩된 문자열
 */
export function prepareForImap(internal: string): string {
  const { encodeImapUtf7: encode } = require('./imap-utf7')
  return _toString(encode(_asUtf8(internal)))
}

/**
 * IMAP에서 받은 문자열을 내부용으로 변환
 *
 * @param imap - IMAP에서 받은 문자열
 * @returns 정규화된 UTF-8 문자열
 */
export function processFromImap(imap: string): string {
  return normalizeInput(imap)
}
