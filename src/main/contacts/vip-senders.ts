/**
 * VIP (중요 발신자) 관리
 * @deprecated SQLite로 마이그레이션됨. storage/vip-repository.ts 사용
 */
export {
  type VipSender,
  getVipSenders,
  addVipSender,
  removeVipSender,
  isVipSender,
  toggleVipSender,
  checkVipSenders
} from '../storage/vip-repository'
