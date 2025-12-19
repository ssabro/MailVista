/**
 * 주소록 저장소 관리 (연락처 및 그룹 CRUD)
 * @deprecated SQLite로 마이그레이션됨. storage/contacts-repository.ts 사용
 */

// 타입은 types.ts에서 export (중복 방지), 함수만 re-export
export {
  getContacts,
  addContact,
  updateContact,
  deleteContact,
  deleteContacts,
  toggleContactStar,
  moveContactsToGroup,
  getContactGroups,
  addContactGroup,
  updateContactGroup,
  deleteContactGroup,
  getContactCountByGroup,
  searchContactsByEmail
} from '../storage/contacts-repository'
