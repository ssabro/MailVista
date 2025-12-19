/**
 * AI/LLM 설정 관리
 * @deprecated 이 파일은 하위 호환성을 위해 유지됩니다. settings/unified-config.ts를 사용하세요.
 */
export {
  type LLMProvider,
  type AIFeatureId,
  type ProviderCredential,
  type AIFeatureConfig,
  type AccountAISettings as AISettings,
  defaultAccountAISettings as defaultAISettings,
  getAISettings,
  updateAISettings,
  resetAISettings,
  setProviderCredential,
  deleteProviderCredential,
  setActiveProvider,
  toggleFeature,
  markProviderValidated,
  getProviderApiKey,
  hasValidProvider,
  getActiveProviderKey
} from './settings/unified-config'
