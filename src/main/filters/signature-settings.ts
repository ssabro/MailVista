/**
 * 서명 설정 관리
 * @deprecated SQLite로 마이그레이션됨. storage/signatures-repository.ts 사용
 */
export {
  type Signature,
  type SignatureSettings,
  defaultSignatureSettings,
  getSignatureSettings,
  updateSignatureSettings,
  resetSignatureSettings,
  addSignature,
  updateSignature,
  deleteSignature,
  setDefaultSignature,
  getDefaultSignature
} from '../storage/signatures-repository'
