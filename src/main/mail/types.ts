/**
 * 이메일 관련 공유 타입 정의
 */

// 이메일 주소 정보
export interface EmailAddress {
  name: string
  address: string
}

// 이메일 헤더 (목록 표시용)
export interface EmailHeader {
  uid: number
  messageId: string
  subject: string
  from: EmailAddress[]
  to: EmailAddress[]
  date: Date
  flags: string[]
  hasAttachment: boolean
  folder?: string // 검색 결과에서 이메일이 속한 폴더
}

// 이메일 전체 내용 (상세 보기용)
export interface EmailFull extends EmailHeader {
  cc?: EmailAddress[]
  bcc?: EmailAddress[]
  html?: string
  text?: string
  attachments: AttachmentInfo[]
}

// 첨부파일 정보
export interface AttachmentInfo {
  filename: string
  contentType: string
  size: number
  contentId?: string
  partId?: string
  encoding?: string
}

// 메일 폴더 정보
export interface MailFolder {
  name: string
  path: string
  delimiter: string
  flags: string[]
  specialUse?: string
  children?: MailFolder[]
  totalMessages?: number
  unseenMessages?: number
}

// 폴더 상세 정보
export interface FolderInfo {
  exists: number
  unseen: number
  uidValidity?: number
  uidNext?: number
}

// 이메일 헤더 캐시용
export interface EmailHeaderCache {
  uid: number
  messageId: string
  subject: string
  from: EmailAddress[]
  to: EmailAddress[]
  date: Date
  flags: string[]
  hasAttachment: boolean
  size?: number
}

// 폴더 캐시용
export interface FolderCache {
  folders: MailFolder[]
  timestamp: number
}

// 캐시 데이터 구조
export interface CacheData {
  folderCache: Record<string, FolderCache>
  emailCache: Record<string, Record<string, EmailHeaderCache[]>>
  emailTotals: Record<string, Record<string, number>>
  emailContentCache: Record<string, EmailFull>
}

// 검색 캐시
export interface SearchCacheEntry {
  emails: EmailHeader[]
  total: number
  timestamp: number
}

export interface SearchCache {
  [key: string]: SearchCacheEntry
}

// 작업 결과 타입
export interface OperationResult<T = void> {
  success: boolean
  error?: string
  data?: T
}

// 이메일 목록 조회 옵션
export interface GetEmailsOptions {
  start?: number
  limit?: number
  searchQuery?: string
  unreadOnly?: boolean
}

// 이메일 목록 조회 결과
export interface GetEmailsResult {
  success: boolean
  emails?: EmailHeader[]
  total?: number
  hasMore?: boolean
  error?: string
}

// 이메일 상세 조회 결과
export interface GetEmailContentResult {
  success: boolean
  email?: EmailFull
  error?: string
}
