/**
 * Security utilities for input validation and sanitization
 */

import { logger, LogCategory } from './logger'

// 이메일 주소 정규식 (기본 검증용)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 폴더 경로 검증용 (path traversal 방지)
const UNSAFE_PATH_PATTERNS = [
  /\.\./, // Parent directory traversal
  /^\/etc/, // Unix system directories
  /^\/usr/,
  /^\/var/,
  /^C:\\Windows/i, // Windows system directories
  /^C:\\Program/i
]

/**
 * 이메일 주소 형식 검증
 */
export function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false
  if (email.length > 254) return false // RFC 5321
  return EMAIL_REGEX.test(email)
}

/**
 * 폴더 경로 검증 (path traversal 방지)
 */
export function isValidFolderPath(folderPath: unknown): folderPath is string {
  if (typeof folderPath !== 'string') return false
  if (folderPath.length === 0 || folderPath.length > 500) return false

  // Path traversal 공격 방지
  for (const pattern of UNSAFE_PATH_PATTERNS) {
    if (pattern.test(folderPath)) {
      logger.warn(LogCategory.SECURITY, 'Path traversal attempt detected', {
        pattern: pattern.toString(),
        path: folderPath
      })
      return false
    }
  }

  return true
}

/**
 * UID 검증 (양수 정수)
 */
export function isValidUid(uid: unknown): uid is number {
  if (typeof uid !== 'number') return false
  return Number.isInteger(uid) && uid > 0
}

/**
 * 문자열 검증 (기본)
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * 배열 내 모든 요소가 양수 정수인지 검증
 */
export function isValidUidArray(uids: unknown): uids is number[] {
  if (!Array.isArray(uids)) return false
  return uids.every((uid) => isValidUid(uid))
}

/**
 * 배열 내 모든 요소가 정수인지 검증 (음수 포함 - 로컬 임시 UID 허용)
 * 로컬에서 이동된 이메일은 음수 UID를 가짐 (서버와 충돌 방지)
 */
export function isValidUidArrayWithTemp(uids: unknown): uids is number[] {
  if (!Array.isArray(uids)) return false
  return uids.every((uid) => typeof uid === 'number' && Number.isInteger(uid) && uid !== 0)
}

/**
 * URL 프로토콜 검증
 */
export function isAllowedUrl(
  url: string,
  allowedProtocols: string[] = ['http:', 'https:', 'mailto:']
): boolean {
  try {
    const parsedUrl = new URL(url)
    return allowedProtocols.includes(parsedUrl.protocol)
  } catch {
    return false
  }
}

/**
 * 문자열 길이 제한 검증
 */
export function isWithinLengthLimit(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength
}

/**
 * IPC 요청 검증 실패 로깅
 */
export function logValidationFailure(
  handler: string,
  paramName: string,
  receivedValue: unknown
): void {
  logger.warn(LogCategory.SECURITY, 'IPC validation failed', {
    handler,
    paramName,
    receivedType: typeof receivedValue,
    receivedValue:
      typeof receivedValue === 'string'
        ? receivedValue.substring(0, 100) + (receivedValue.length > 100 ? '...' : '')
        : String(receivedValue)
  })
}

/**
 * 입력값 새니타이즈 (기본 XSS 방지)
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// ============================================
// 첨부파일 보안 (Attachment Security)
// ============================================

/** 위험한 파일 확장자 (코드 실행 가능) */
const DANGEROUS_EXTENSIONS = new Set([
  // 실행 파일
  '.exe',
  '.com',
  '.bat',
  '.cmd',
  '.msi',
  '.scr',
  '.pif',
  '.dll',
  // 스크립트
  '.js',
  '.jse',
  '.vbs',
  '.vbe',
  '.wsf',
  '.wsh',
  '.ps1',
  '.psm1',
  // Java
  '.jar',
  '.jnlp',
  // Office 매크로
  '.docm',
  '.xlsm',
  '.pptm',
  '.dotm',
  '.xltm',
  '.potm',
  // 기타 위험
  '.hta',
  '.cpl',
  '.msc',
  '.scf',
  '.lnk',
  '.inf',
  '.reg',
  // 디스크 이미지 (실행파일 포함 가능)
  '.iso',
  '.img'
])

/** 중간 위험 확장자 (Active Content 포함 가능) */
const MEDIUM_RISK_EXTENSIONS = new Set(['.pdf', '.doc', '.xls', '.ppt', '.rtf'])

export type AttachmentRiskLevel = 'safe' | 'medium' | 'dangerous'

/**
 * 첨부파일 위험도 평가
 */
export function getAttachmentRiskLevel(filename: string): AttachmentRiskLevel {
  if (!filename) return 'safe'

  const lowerFilename = filename.toLowerCase()
  const lastDotIndex = lowerFilename.lastIndexOf('.')
  if (lastDotIndex === -1) return 'safe'

  const ext = lowerFilename.substring(lastDotIndex)

  // 이중 확장자 체크 (예: document.pdf.exe)
  const parts = lowerFilename.split('.')
  if (parts.length > 2) {
    const secondLastExt = '.' + parts[parts.length - 2]
    // 마지막이 위험 확장자이고, 그 앞이 문서 확장자면 매우 위험
    if (
      DANGEROUS_EXTENSIONS.has(ext) &&
      (MEDIUM_RISK_EXTENSIONS.has(secondLastExt) || secondLastExt === '.txt')
    ) {
      return 'dangerous'
    }
  }

  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return 'dangerous'
  }
  if (MEDIUM_RISK_EXTENSIONS.has(ext)) {
    return 'medium'
  }
  return 'safe'
}

/**
 * 첨부파일 위험 메시지 반환
 */
export function getAttachmentRiskMessage(filename: string, lang: string = 'ko'): string | null {
  const level = getAttachmentRiskLevel(filename)
  const lowerFilename = filename.toLowerCase()
  const ext = lowerFilename.substring(lowerFilename.lastIndexOf('.'))

  const messages = {
    ko: {
      dangerous: `이 파일 유형(${ext})은 실행 코드를 포함할 수 있어 컴퓨터에 해를 끼칠 수 있습니다.`,
      medium: `이 파일 유형(${ext})은 활성 콘텐츠를 포함할 수 있습니다. 신뢰할 수 있는 발신자인 경우에만 여세요.`
    },
    en: {
      dangerous: `This file type (${ext}) can contain executable code and may harm your computer.`,
      medium: `This file type (${ext}) can contain active content. Only open if you trust the sender.`
    },
    ja: {
      dangerous: `このファイルタイプ（${ext}）は実行可能なコードを含む可能性があり、コンピュータに害を及ぼす可能性があります。`,
      medium: `このファイルタイプ（${ext}）にはアクティブコンテンツが含まれている可能性があります。送信者を信頼できる場合にのみ開いてください。`
    },
    zh: {
      dangerous: `此文件类型（${ext}）可能包含可执行代码，可能会损害您的计算机。`,
      medium: `此文件类型（${ext}）可能包含活动内容。仅在信任发件人时才打开。`
    }
  }

  const langMessages = messages[lang as keyof typeof messages] || messages.en

  if (level === 'dangerous') return langMessages.dangerous
  if (level === 'medium') return langMessages.medium
  return null
}

// ============================================
// URL 보안 분석 (Phishing/Homograph Detection)
// ============================================

/** 호모그래프 공격에 사용되는 유사 문자 매핑 */
const HOMOGLYPH_MAP: Record<string, string> = {
  // Cyrillic
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  х: 'x',
  у: 'y',
  А: 'A',
  Е: 'E',
  О: 'O',
  Р: 'P',
  С: 'C',
  Х: 'X',
  // Greek
  α: 'a',
  ε: 'e',
  ο: 'o',
  ρ: 'p',
  χ: 'x',
  γ: 'y',
  // Numbers that look like letters
  '0': 'o',
  '1': 'l',
  // Special characters
  ı: 'i',
  ɑ: 'a',
  ɡ: 'g'
}

/** 피싱 대상이 되는 주요 도메인 */
const IMPERSONATION_TARGETS = [
  'google',
  'gmail',
  'microsoft',
  'outlook',
  'office365',
  'apple',
  'icloud',
  'amazon',
  'paypal',
  'ebay',
  'facebook',
  'instagram',
  'twitter',
  'linkedin',
  'netflix',
  'dropbox',
  'github',
  'coinbase',
  'bank',
  'secure',
  'login',
  'account',
  'verify'
]

export interface URLSecurityAnalysis {
  url: string
  domain: string
  isPunycode: boolean
  decodedDomain: string | null
  riskLevel: 'safe' | 'suspicious' | 'dangerous'
  warnings: string[]
}

/**
 * 호모그래프 문자를 일반 ASCII로 정규화
 */
function normalizeHomoglyphs(str: string): string {
  let result = ''
  for (const char of str) {
    result += HOMOGLYPH_MAP[char] || char
  }
  return result
}

/**
 * Punycode 도메인 디코딩
 */
function decodePunycodeDomain(domain: string): string | null {
  if (!domain.includes('xn--')) return null

  try {
    // Node.js URL API가 자동으로 Punycode 디코딩
    const url = new URL(`http://${domain}`)
    // hostname이 원본과 다르면 디코딩된 것
    if (url.hostname !== domain) {
      return url.hostname
    }
    return null
  } catch {
    return null
  }
}

/**
 * 의심스러운 도메인 패턴 탐지
 */
function detectSuspiciousPatterns(domain: string): string[] {
  const warnings: string[] = []
  const lowerDomain = domain.toLowerCase()

  // 과도한 서브도메인 (피싱에서 흔함)
  const subdomains = lowerDomain.split('.')
  if (subdomains.length > 4) {
    warnings.push('과도한 서브도메인 사용')
  }

  // 숫자로 위장한 도메인 (예: g00gle, amaz0n)
  const normalizedDomain = normalizeHomoglyphs(lowerDomain)
  for (const target of IMPERSONATION_TARGETS) {
    // 원본 도메인에 타겟이 없지만 정규화된 도메인에 있는 경우
    if (!lowerDomain.includes(target) && normalizedDomain.includes(target)) {
      warnings.push(`'${target}' 사칭 가능성`)
    }
  }

  // 하이픈이 많은 도메인
  const hyphenCount = (lowerDomain.match(/-/g) || []).length
  if (hyphenCount > 3) {
    warnings.push('비정상적으로 많은 하이픈')
  }

  // 숫자로 시작하거나 끝나는 비정상적 패턴
  if (/^\d+[a-z]/.test(lowerDomain) || /[a-z]\d+\./.test(lowerDomain)) {
    warnings.push('숫자와 문자 혼합 패턴')
  }

  return warnings
}

/**
 * URL 보안 분석 수행
 */
export function analyzeURL(url: string): URLSecurityAnalysis {
  const result: URLSecurityAnalysis = {
    url,
    domain: '',
    isPunycode: false,
    decodedDomain: null,
    riskLevel: 'safe',
    warnings: []
  }

  try {
    const parsed = new URL(url)
    result.domain = parsed.hostname

    // IP 주소 URL 체크
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(result.domain)) {
      result.warnings.push('IP 주소 직접 사용 (도메인 아님)')
      result.riskLevel = 'suspicious'
    }

    // Punycode 체크 (xn-- 접두사)
    if (result.domain.includes('xn--')) {
      result.isPunycode = true
      result.decodedDomain = decodePunycodeDomain(result.domain)
      if (result.decodedDomain) {
        result.warnings.push(`국제화 도메인 (IDN): ${result.decodedDomain}`)
      }
      result.riskLevel = 'suspicious'
    }

    // 호모그래프 공격 탐지
    const normalizedDomain = normalizeHomoglyphs(result.domain)
    if (normalizedDomain !== result.domain.toLowerCase()) {
      for (const target of IMPERSONATION_TARGETS) {
        if (normalizedDomain.includes(target)) {
          result.warnings.push(`유사 문자를 사용한 '${target}' 사칭 가능성`)
          result.riskLevel = 'dangerous'
          break
        }
      }
    }

    // 의심스러운 패턴 탐지
    const patternWarnings = detectSuspiciousPatterns(result.domain)
    result.warnings.push(...patternWarnings)
    if (patternWarnings.length > 0 && result.riskLevel === 'safe') {
      result.riskLevel = 'suspicious'
    }

    // 비표준 포트 체크
    if (parsed.port && !['80', '443', ''].includes(parsed.port)) {
      result.warnings.push(`비표준 포트 사용: ${parsed.port}`)
      if (result.riskLevel === 'safe') {
        result.riskLevel = 'suspicious'
      }
    }
  } catch {
    result.warnings.push('유효하지 않은 URL 형식')
    result.riskLevel = 'dangerous'
  }

  return result
}

// ============================================
// 이메일 인증 헤더 파싱 (SPF/DKIM/DMARC)
// ============================================

export type AuthStatus = 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'unknown'

export interface AuthenticationResult {
  spf: AuthStatus
  dkim: AuthStatus
  dmarc: AuthStatus
  fromDomain: string
}

/**
 * Authentication-Results 헤더에서 인증 결과 파싱
 */
export function parseAuthenticationHeaders(
  authResultsHeader: string | null,
  fromHeader: string | null
): AuthenticationResult {
  const result: AuthenticationResult = {
    spf: 'unknown',
    dkim: 'unknown',
    dmarc: 'unknown',
    fromDomain: ''
  }

  // From 헤더에서 도메인 추출
  if (fromHeader) {
    const domainMatch = fromHeader.match(/@([a-zA-Z0-9.-]+)/i)
    if (domainMatch) {
      result.fromDomain = domainMatch[1].toLowerCase()
    }
  }

  if (!authResultsHeader) {
    return result
  }

  const header = authResultsHeader.toLowerCase()

  // SPF 결과 파싱
  const spfMatch = header.match(/spf=(pass|fail|softfail|neutral|none)/i)
  if (spfMatch) {
    result.spf = spfMatch[1] as AuthStatus
  }

  // DKIM 결과 파싱
  const dkimMatch = header.match(/dkim=(pass|fail|none)/i)
  if (dkimMatch) {
    result.dkim = dkimMatch[1] as AuthStatus
  }

  // DMARC 결과 파싱
  const dmarcMatch = header.match(/dmarc=(pass|fail|none)/i)
  if (dmarcMatch) {
    result.dmarc = dmarcMatch[1] as AuthStatus
  }

  return result
}

/**
 * 전체 인증 상태 요약 (UI 표시용)
 */
export function getAuthSummary(auth: AuthenticationResult): {
  status: 'verified' | 'partial' | 'failed' | 'unknown'
  icon: 'shield-check' | 'shield-alert' | 'shield-question'
} {
  // SPF와 DKIM 모두 pass면 verified
  if (auth.spf === 'pass' && auth.dkim === 'pass') {
    return { status: 'verified', icon: 'shield-check' }
  }

  // 하나라도 fail이면 failed
  if (auth.spf === 'fail' || auth.dkim === 'fail' || auth.dmarc === 'fail') {
    return { status: 'failed', icon: 'shield-alert' }
  }

  // 하나라도 pass면 partial
  if (auth.spf === 'pass' || auth.dkim === 'pass') {
    return { status: 'partial', icon: 'shield-alert' }
  }

  return { status: 'unknown', icon: 'shield-question' }
}
