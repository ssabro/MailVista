/**
 * 메일 필터 관리 (자동 분류)
 * @deprecated SQLite로 마이그레이션됨. storage/filters-repository.ts 사용
 */
export {
  type FilterConditionField,
  type FilterConditionOperator,
  type FilterAction,
  type FilterCondition,
  type MailFilter,
  getMailFilters,
  getEnabledFilters,
  findDuplicateFilter,
  addMailFilter,
  updateMailFilter,
  deleteMailFilter,
  toggleMailFilter,
  getFiltersUsingFolder,
  updateFiltersTargetFolder,
  deleteFiltersUsingFolder
} from '../storage/filters-repository'
