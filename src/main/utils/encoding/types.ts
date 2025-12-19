/**
 * 인코딩 관련 타입 정의
 * Branded Types를 사용하여 컴파일 타임에 인코딩 상태를 명시적으로 추적
 */

// =====================================================
// Branded Types - 인코딩 상태 명시
// =====================================================

/**
 * UTF-8로 디코딩된 문자열 (애플리케이션 내부 표준)
 * 모든 내부 처리, SQLite 저장, UI 표시에 사용
 */
export type Utf8String = string & { readonly __brand: 'utf8' }

/**
 * IMAP Modified UTF-7로 인코딩된 문자열 (RFC 3501)
 * IMAP 서버와의 통신에만 사용
 */
export type ImapUtf7String = string & { readonly __brand: 'imap-utf7' }

/**
 * 파일 시스템 안전 문자열
 * OS별 파일 시스템에서 안전하게 사용 가능
 */
export type FsSafeString = string & { readonly __brand: 'fs-safe' }

/**
 * 원시 문자열 (인코딩 상태 불명)
 * 외부에서 받은 검증되지 않은 문자열
 */
export type RawString = string

// =====================================================
// 타입 가드 및 변환 헬퍼
// =====================================================

/**
 * 일반 문자열을 Utf8String으로 마킹 (검증 후 사용)
 */
export function asUtf8(str: string): Utf8String {
  return str as Utf8String
}

/**
 * 일반 문자열을 ImapUtf7String으로 마킹 (검증 후 사용)
 */
export function asImapUtf7(str: string): ImapUtf7String {
  return str as ImapUtf7String
}

/**
 * 일반 문자열을 FsSafeString으로 마킹 (검증 후 사용)
 */
export function asFsSafe(str: string): FsSafeString {
  return str as FsSafeString
}

/**
 * Branded type에서 일반 string으로 변환
 * 외부 라이브러리와의 상호작용에 사용
 */
export function toString(str: Utf8String | ImapUtf7String | FsSafeString): string {
  return str as string
}

// =====================================================
// 폴더 식별자 인터페이스
// =====================================================

/**
 * IMAP 폴더의 다양한 인코딩 표현을 담는 구조체
 * 각 사용처에 맞는 올바른 인코딩 값을 제공
 */
export interface FolderIdentifier {
  /** UI 표시용 (UTF-8): "잡다", "받은편지함" */
  displayName: Utf8String

  /** IMAP 통신용 (Modified UTF-7): "&wqTYhA-" */
  wireName: ImapUtf7String

  /** 내부 저장/조회용 (UTF-8): "잡다" */
  path: Utf8String

  /** 폴더 구분자 */
  delimiter: string

  /** 특수 용도 (inbox, sent, drafts 등) */
  specialUse?: string
}

/**
 * 이메일 헤더의 인코딩된 문자열 (RFC 2047)
 * Subject, From 등의 헤더에서 사용
 */
export interface EncodedHeader {
  /** 원본 인코딩된 문자열 */
  raw: string

  /** 디코딩된 UTF-8 문자열 */
  decoded: Utf8String

  /** 사용된 인코딩 (utf-8, euc-kr, iso-2022-jp 등) */
  charset?: string
}

// =====================================================
// 인코딩 결과 타입
// =====================================================

export interface EncodingResult<T> {
  success: boolean
  value?: T
  error?: string
  /** 원본 입력값 (디버깅용) */
  original?: string
}

// =====================================================
// 다국어 테스트용 문자열 상수
// =====================================================

export const ENCODING_TEST_STRINGS = {
  korean: ['받은편지함', '보낸편지함', '잡다', '임시보관함', '휴지통', '한글 폴더', '테스트'],
  japanese: ['受信トレイ', '送信済み', 'フォルダ名', 'テスト'],
  chinese: ['收件箱', '已发送', '文件夹', '测试'],
  arabic: ['البريد الوارد', 'المرسلة'],
  russian: ['Входящие', 'Отправленные', 'Тест'],
  mixed: ['Inbox-받은편지함', 'Test フォルダ 测试', 'Почта-메일'],
  special: ['Folder & Name', 'Test+Plus', 'With/Slash', 'Has Space', 'Under_Score'],
  emoji: ['📧 Mail', '🎉 Fun', '📁 Folder'],
  edge: ['', ' ', '  ', 'a', '가', '&', '&-', '&&'],
} as const
