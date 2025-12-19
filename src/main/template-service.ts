/**
 * 이메일 템플릿 서비스
 * @deprecated SQLite로 마이그레이션됨. storage/templates-repository.ts 사용
 */
export {
  type EmailTemplate,
  getTemplates,
  getTemplate,
  createTemplate,
  updateEmailTemplate as updateTemplate,
  deleteTemplate,
  reorderTemplates
} from './storage/templates-repository'
