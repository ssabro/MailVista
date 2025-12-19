/**
 * 주소록 관련 타입 정의
 */

// 연락처 및 그룹 타입은 repository에서 import 후 re-export
import type {
  Contact as ContactType,
  ContactGroup as ContactGroupType
} from '../storage/contacts-repository'

export type Contact = ContactType
export type ContactGroup = ContactGroupType

// 계정별 주소록 저장소 타입
export interface ContactStoreData {
  contacts: ContactType[]
  groups: ContactGroupType[]
}

// 가져온 연락처 데이터 인터페이스
export interface ImportedContact {
  name: string
  email: string
  organization?: string
  phone?: string
  memo?: string
  groupName?: string
}

// 가져오기 검증 결과
export interface ImportValidationResult {
  valid: ImportedContact[]
  invalid: { row: number; data: Record<string, string>; error: string }[]
  duplicates: { row: number; data: ImportedContact; existingContact: ContactType }[]
}

// 가져오기 결과
export interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  failed: number
  errors?: string[]
}
