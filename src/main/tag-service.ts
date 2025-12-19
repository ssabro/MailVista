/**
 * 태그 서비스
 * @deprecated SQLite로 마이그레이션됨. storage/tags-repository.ts 사용
 */
import {
  getTags as repoGetTags,
  addTag,
  updateTag as repoUpdateTag,
  deleteTag as repoDeleteTag,
  assignTagToEmail as repoAssignTagToEmail,
  removeTagFromEmail as repoRemoveTagFromEmail,
  getEmailTags as repoGetEmailTags,
  getTagsForEmails,
  getEmailIdsByTag
} from './storage/tags-repository'
import type { Tag as RepoTag } from './storage/tags-repository'

// 기본 태그 색상
const DEFAULT_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6b7280' // gray
]

// 태그 인터페이스 (기존 API 호환 - createdAt을 number로)
export interface Tag {
  id: string
  name: string
  color: string
  createdAt: number
}

// Repository 태그를 기존 형식으로 변환
function convertTag(repoTag: RepoTag): Tag {
  return {
    id: repoTag.id,
    name: repoTag.name,
    color: repoTag.color,
    createdAt: new Date(repoTag.createdAt).getTime()
  }
}

// 이메일 키 생성 헬퍼
function makeEmailId(folderPath: string, uid: number): string {
  return `${folderPath}:${uid}`
}

// 이메일 키 파싱 헬퍼
function parseEmailId(emailId: string): { folderPath: string; uid: number } | null {
  const lastColonIndex = emailId.lastIndexOf(':')
  if (lastColonIndex === -1) return null

  const folderPath = emailId.substring(0, lastColonIndex)
  const uid = parseInt(emailId.substring(lastColonIndex + 1), 10)

  if (isNaN(uid)) return null

  return { folderPath, uid }
}

// 모든 태그 조회
export function getTags(accountEmail: string): Tag[] {
  return repoGetTags(accountEmail).map(convertTag)
}

// 태그 생성 (기존 API 호환)
export function createTag(
  accountEmail: string,
  name: string,
  color: string
): { success: boolean; tag?: Tag; error?: string } {
  const result = addTag(accountEmail, name, color)
  if (result.success && result.tag) {
    return { success: true, tag: convertTag(result.tag) }
  }
  return { success: result.success, error: result.error }
}

// 태그 수정
export function updateTag(
  accountEmail: string,
  tagId: string,
  updates: { name?: string; color?: string }
): { success: boolean; error?: string } {
  const result = repoUpdateTag(accountEmail, tagId, updates)
  return { success: result.success, error: result.error }
}

// 태그 삭제
export function deleteTag(
  accountEmail: string,
  tagId: string
): { success: boolean; error?: string } {
  return repoDeleteTag(accountEmail, tagId)
}

// 이메일에 태그 할당
export function assignTagToEmail(
  accountEmail: string,
  folderPath: string,
  uid: number,
  tagId: string
): { success: boolean; error?: string } {
  const emailId = makeEmailId(folderPath, uid)
  return repoAssignTagToEmail(accountEmail, emailId, tagId)
}

// 이메일에서 태그 제거
export function removeTagFromEmail(
  _accountEmail: string,
  folderPath: string,
  uid: number,
  tagId: string
): { success: boolean; error?: string } {
  const emailId = makeEmailId(folderPath, uid)
  const result = repoRemoveTagFromEmail(emailId, tagId)
  return { success: result.success }
}

// 이메일의 태그 목록 조회 (태그 ID 배열 반환 - 기존 API 호환)
export function getEmailTags(_accountEmail: string, folderPath: string, uid: number): string[] {
  const emailId = makeEmailId(folderPath, uid)
  const tags = repoGetEmailTags(emailId)
  return tags.map((t) => t.id)
}

// 여러 이메일의 태그 목록 일괄 조회 (기존 API 호환)
export function getBulkEmailTags(
  _accountEmail: string,
  emails: { folderPath: string; uid: number }[]
): { [key: string]: string[] } {
  const emailIds = emails.map((e) => makeEmailId(e.folderPath, e.uid))
  const tagsMap = getTagsForEmails(emailIds)

  const result: { [key: string]: string[] } = {}
  for (const email of emails) {
    const emailId = makeEmailId(email.folderPath, email.uid)
    const key = `${email.folderPath}:${email.uid}`
    const tags = tagsMap.get(emailId) || []
    result[key] = tags.map((t) => t.id)
  }

  return result
}

// 특정 태그가 있는 이메일 목록 조회 (기존 API 호환)
export function getEmailsByTag(
  _accountEmail: string,
  tagId: string
): { folderPath: string; uid: number }[] {
  const emailIds = getEmailIdsByTag(tagId)
  const results: { folderPath: string; uid: number }[] = []

  for (const emailId of emailIds) {
    const parsed = parseEmailId(emailId)
    if (parsed) {
      results.push(parsed)
    }
  }

  return results
}

// 기본 색상 목록 반환
export function getDefaultColors(): string[] {
  return DEFAULT_COLORS
}
