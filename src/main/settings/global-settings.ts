/**
 * 전역 앱 설정 관리 (언어, 알림, 보안 등)
 * @deprecated 이 파일은 하위 호환성을 위해 유지됩니다. unified-config.ts를 사용하세요.
 */
export {
  type GlobalSettings as GlobalAppSettings,
  getGlobalSettings,
  updateGlobalSettings,
  resetGlobalSettings,
  defaultGlobalSettings
} from './unified-config'
