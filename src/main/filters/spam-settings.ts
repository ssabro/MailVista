/**
 * 스팸 설정 관리
 * @deprecated SQLite로 마이그레이션됨. storage/spam-repository.ts 사용
 */
export {
  type BlockedSender,
  type BlockedDomain,
  type SpamSettings,
  defaultSpamSettings,
  getSpamSettings,
  updateSpamSettings,
  resetSpamSettings,
  addBlockedSender,
  removeBlockedSender,
  removeBlockedSenderById,
  addBlockedDomain,
  removeBlockedDomain,
  removeBlockedDomainById,
  isEmailBlocked,
  checkBlockedEmails
} from '../storage/spam-repository'
