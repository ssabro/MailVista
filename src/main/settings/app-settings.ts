/**
 * 계정별 앱 설정 관리
 * @deprecated 이 파일은 하위 호환성을 위해 유지됩니다. unified-config.ts를 사용하세요.
 */
export {
  type AccountAppSettings as AppSettings,
  getAppSettings,
  updateAppSettings,
  resetAppSettings,
  defaultAccountAppSettings as defaultAppSettings
} from './unified-config'
