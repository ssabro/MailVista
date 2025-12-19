/**
 * 인코딩 유틸리티 테스트
 *
 * 실행: npx ts-node src/main/utils/encoding/encoding.test.ts
 */

import {
  // 타입
  asUtf8,
  asImapUtf7,
  ENCODING_TEST_STRINGS,

  // IMAP UTF-7
  encodeImapUtf7,
  decodeImapUtf7,
  verifyRoundTrip,
  looksLikeImapUtf7,
  ensureDecoded,

  // 유니코드
  normalizeNFC,
  containsHangul,
  containsCJK,
  detectScript,
  extractChosung,
  matchChosung,

  // 폴더 어댑터
  createFolderIdentifier,
  convertImapListToFolders,
  isSamePath,
  pathToWire,
  wireToStorage,

  // 파일 시스템
  sanitizeFilename,
  isFilenameValid,

  // 디버그
  toSafeString,
  hexDump,
  debugString,
} from './index'

// =====================================================
// 테스트 유틸리티
// =====================================================

let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`✓ ${name}`)
    passed++
  } catch (error) {
    console.error(`✗ ${name}`)
    console.error(`  Error: ${error instanceof Error ? error.message : error}`)
    failed++
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message || 'Assertion failed'}\n` +
        `  Expected: ${JSON.stringify(expected)}\n` +
        `  Actual: ${JSON.stringify(actual)}`
    )
  }
}

function assertTrue(value: boolean, message?: string): void {
  if (!value) {
    throw new Error(message || 'Expected true but got false')
  }
}

function assertFalse(value: boolean, message?: string): void {
  if (value) {
    throw new Error(message || 'Expected false but got true')
  }
}

// =====================================================
// IMAP UTF-7 테스트
// =====================================================

console.log('\n=== IMAP UTF-7 인코딩/디코딩 테스트 ===\n')

test('ASCII 문자열은 변환되지 않아야 함', () => {
  const input = 'INBOX'
  const encoded = encodeImapUtf7(asUtf8(input))
  assertEqual(encoded as string, 'INBOX')
})

test('한글 폴더명 인코딩', () => {
  const input = '받은편지함'
  const encoded = encodeImapUtf7(asUtf8(input))
  assertTrue((encoded as string).startsWith('&'))
  assertTrue((encoded as string).endsWith('-'))
})

test('한글 폴더명 디코딩', () => {
  // '잡다'를 IMAP UTF-7로 인코딩 후 디코딩
  const original = '잡다'
  const encoded = encodeImapUtf7(asUtf8(original))
  const decoded = decodeImapUtf7(encoded)
  assertEqual(decoded as string, original)
})

test('& 리터럴 인코딩', () => {
  const input = 'A & B'
  const encoded = encodeImapUtf7(asUtf8(input))
  assertEqual(encoded as string, 'A &- B')
})

test('& 리터럴 디코딩', () => {
  const encoded = 'A &- B'
  const decoded = decodeImapUtf7(asImapUtf7(encoded))
  assertEqual(decoded as string, 'A & B')
})

test('한글 왕복 변환 (encode → decode)', () => {
  const testStrings = ['받은편지함', '보낸편지함', '잡다', '임시보관함', '휴지통', '한글 폴더']
  for (const str of testStrings) {
    assertTrue(verifyRoundTrip(str), `Round trip failed for: ${str}`)
  }
})

test('일본어 왕복 변환', () => {
  const testStrings = ['受信トレイ', '送信済み', 'フォルダ名']
  for (const str of testStrings) {
    assertTrue(verifyRoundTrip(str), `Round trip failed for: ${str}`)
  }
})

test('중국어 왕복 변환', () => {
  const testStrings = ['收件箱', '已发送', '文件夹']
  for (const str of testStrings) {
    assertTrue(verifyRoundTrip(str), `Round trip failed for: ${str}`)
  }
})

test('혼합 문자열 왕복 변환', () => {
  const testStrings = ['Inbox-받은편지함', 'Test フォルダ 测试']
  for (const str of testStrings) {
    assertTrue(verifyRoundTrip(str), `Round trip failed for: ${str}`)
  }
})

test('looksLikeImapUtf7 감지', () => {
  const encoded = encodeImapUtf7(asUtf8('잡다'))
  assertTrue(looksLikeImapUtf7(encoded as string))
  assertTrue(looksLikeImapUtf7('INBOX/' + encoded))
  assertFalse(looksLikeImapUtf7('INBOX'))
  assertFalse(looksLikeImapUtf7('받은편지함'))
})

test('ensureDecoded - 인코딩된 문자열', () => {
  const original = '잡다'
  const encoded = encodeImapUtf7(asUtf8(original))
  const result = ensureDecoded(encoded as string)
  assertEqual(result as string, original)
})

test('ensureDecoded - 이미 디코딩된 문자열', () => {
  const decoded = '잡다'
  const result = ensureDecoded(decoded)
  assertEqual(result as string, '잡다')
})

// =====================================================
// 유니코드 정규화 테스트
// =====================================================

console.log('\n=== 유니코드 정규화 테스트 ===\n')

test('NFC 정규화', () => {
  // NFD 형태의 한글 (자모 분리)
  const nfd = '가'.normalize('NFD')
  const nfc = normalizeNFC(nfd)
  assertEqual(nfc as string, '가')
})

test('한글 감지', () => {
  assertTrue(containsHangul('안녕하세요'))
  assertTrue(containsHangul('Hello 안녕'))
  assertFalse(containsHangul('Hello World'))
  assertFalse(containsHangul('こんにちは'))
})

test('CJK 감지', () => {
  assertTrue(containsCJK('한글'))
  assertTrue(containsCJK('日本語'))
  assertTrue(containsCJK('中文'))
  assertFalse(containsCJK('Hello'))
})

test('스크립트 감지 - 한글', () => {
  assertEqual(detectScript('안녕하세요'), 'hangul')
})

test('스크립트 감지 - 일본어', () => {
  assertEqual(detectScript('こんにちは'), 'japanese')
})

test('스크립트 감지 - 혼합', () => {
  assertEqual(detectScript('Hello안녕'), 'mixed')
})

test('초성 추출', () => {
  assertEqual(extractChosung('받은편지함'), 'ㅂㅇㅍㅈㅎ')
  assertEqual(extractChosung('한글'), 'ㅎㄱ')
})

test('초성 검색', () => {
  assertTrue(matchChosung('받은편지함', 'ㅂㅇㅍㅈㅎ'))
  assertTrue(matchChosung('받은편지함', 'ㅂㅇ'))
  assertFalse(matchChosung('받은편지함', 'ㅎㄱ'))
})

// =====================================================
// 폴더 어댑터 테스트
// =====================================================

console.log('\n=== 폴더 어댑터 테스트 ===\n')

test('FolderIdentifier 생성 - ASCII', () => {
  const folder = createFolderIdentifier({
    name: 'INBOX',
    path: 'INBOX',
    delimiter: '/',
  })

  assertEqual(folder.displayName as string, 'INBOX')
  assertEqual(folder.path as string, 'INBOX')
  assertEqual(folder.wireName as string, 'INBOX')
})

test('FolderIdentifier 생성 - 한글', () => {
  const folder = createFolderIdentifier({
    name: '잡다',
    path: '잡다',
    delimiter: '/',
  })

  assertEqual(folder.displayName as string, '잡다')
  assertEqual(folder.path as string, '잡다')
  // wireName은 IMAP UTF-7로 인코딩됨
  assertTrue((folder.wireName as string).includes('&'))
})

test('FolderIdentifier 생성 - 인코딩된 입력', () => {
  const original = '잡다'
  const encoded = encodeImapUtf7(asUtf8(original))

  const folder = createFolderIdentifier({
    name: encoded as string,
    path: encoded as string,
    delimiter: '/',
  })

  // 입력이 인코딩되어 있어도 디코딩됨
  assertEqual(folder.displayName as string, original)
  assertEqual(folder.path as string, original)
})

test('폴더 경로 비교 - isSamePath', () => {
  assertTrue(isSamePath('잡다', '잡다'))
  assertTrue(isSamePath('INBOX', 'INBOX'))
  // 인코딩 차이 무시
  const encoded = encodeImapUtf7(asUtf8('잡다'))
  assertTrue(isSamePath('잡다', encoded as string))
  assertFalse(isSamePath('잡다', '임시'))
})

test('경로 변환 - pathToWire', () => {
  const wire = pathToWire('잡다')
  assertTrue(wire.includes('&'))
})

test('경로 변환 - wireToStorage', () => {
  const original = '잡다'
  const wire = pathToWire(original)
  const storage = wireToStorage(wire)
  assertEqual(storage, original)
})

test('convertImapListToFolders', () => {
  const koreanFolder = '잡다'
  const koreanFolderEncoded = encodeImapUtf7(asUtf8(koreanFolder))

  const list = [
    { name: 'INBOX', path: 'INBOX', delimiter: '/', specialUse: '\\Inbox' },
    { name: koreanFolderEncoded as string, path: koreanFolderEncoded as string, delimiter: '/' },
    { name: 'Sent', path: 'Sent', delimiter: '/', specialUse: '\\Sent' },
  ]

  const folders = convertImapListToFolders(list)

  assertEqual(folders.length, 3)

  const jabdaFolder = folders.find((f) => f.name === koreanFolder)
  assertTrue(jabdaFolder !== undefined, '잡다 폴더가 있어야 함')
  assertEqual(jabdaFolder!.path, koreanFolder)
})

// =====================================================
// 파일 시스템 안전화 테스트
// =====================================================

console.log('\n=== 파일 시스템 안전화 테스트 ===\n')

test('sanitizeFilename - 기본', () => {
  assertEqual(sanitizeFilename('test.txt') as string, 'test.txt')
})

test('sanitizeFilename - 금지 문자 대체', () => {
  assertEqual(sanitizeFilename('test:file.txt') as string, 'test_file.txt')
  assertEqual(sanitizeFilename('test<>file.txt') as string, 'test_file.txt')
})

test('sanitizeFilename - Windows 예약어', () => {
  const result = sanitizeFilename('CON.txt')
  assertFalse((result as string).startsWith('CON'))
})

test('sanitizeFilename - 한글 파일명', () => {
  assertEqual(sanitizeFilename('한글파일.txt') as string, '한글파일.txt')
})

test('isFilenameValid - 유효한 파일명', () => {
  assertTrue(isFilenameValid('test.txt'))
  assertTrue(isFilenameValid('한글파일.txt'))
})

test('isFilenameValid - 유효하지 않은 파일명', () => {
  assertFalse(isFilenameValid('test:file.txt'))
  assertFalse(isFilenameValid('test<file.txt'))
})

// =====================================================
// 디버그 포매터 테스트
// =====================================================

console.log('\n=== 디버그 포매터 테스트 ===\n')

test('toSafeString - ASCII', () => {
  assertEqual(toSafeString('Hello'), 'Hello')
})

test('toSafeString - 한글', () => {
  const result = toSafeString('안녕')
  // 한글은 그대로 유지 (mixed mode)
  assertTrue(result.includes('안') || result.includes('\\u'))
})

test('hexDump', () => {
  const hex = hexDump('A')
  assertEqual(hex, '41')
})

test('hexDump - 한글', () => {
  const hex = hexDump('가')
  assertEqual(hex, 'eab080') // UTF-8 인코딩
})

test('debugString', () => {
  const info = debugString('잡다')
  assertTrue(info.length > 0)
  assertTrue(info.byteLength > 0)
  assertTrue(info.hasNonAscii)
  assertEqual(info.hex, 'ec9ea1eb8ba4')
})

// =====================================================
// 모든 테스트 문자열 왕복 테스트
// =====================================================

console.log('\n=== 전체 테스트 문자열 왕복 테스트 ===\n')

for (const [category, strings] of Object.entries(ENCODING_TEST_STRINGS)) {
  for (const str of strings) {
    if (str === '') continue // 빈 문자열 스킵

    test(`${category}: "${toSafeString(str)}" 왕복 변환`, () => {
      assertTrue(verifyRoundTrip(str), `Round trip failed for: ${str}`)
    })
  }
}

// =====================================================
// 결과 출력
// =====================================================

console.log('\n' + '='.repeat(50))
console.log(`테스트 결과: ${passed} passed, ${failed} failed`)
console.log('='.repeat(50))

if (failed > 0) {
  process.exit(1)
}
