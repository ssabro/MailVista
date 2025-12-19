import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable
} from '@tanstack/react-table'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { cn } from '@renderer/lib/utils'
import {
  Plus,
  Pencil,
  Trash2,
  Filter,
  X,
  AlertCircle,
  Play,
  Loader2,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

type FilterConditionField = 'fromName' | 'fromAddress' | 'toName' | 'toAddress' | 'subject' | 'body'
type FilterConditionOperator = 'contains' | 'equals' | 'startsWith' | 'endsWith'
type FilterAction = 'move' | 'delete' | 'markRead' | 'markStarred'

interface FilterCondition {
  field: FilterConditionField
  operator: FilterConditionOperator
  value: string
}

interface MailFilter {
  id: string
  name: string
  enabled: boolean
  conditions: FilterCondition[]
  matchAll: boolean
  action: FilterAction
  targetFolder?: string
  createdAt: number
}

interface SubFolder {
  name: string
  path: string
}

interface FilterSettingsProps {
  accountEmail: string
  inboxSubFolders: SubFolder[]
  customFolders?: SubFolder[]
  onRunFilters?: () => Promise<{ success: boolean; processedCount: number; error?: string }>
}

type FieldLabelsType = Record<FilterConditionField, string>
type OperatorLabelsType = Record<FilterConditionOperator, string>
type ActionLabelsType = Record<FilterAction, string>

const defaultCondition: FilterCondition = {
  field: 'fromAddress',
  operator: 'equals',
  value: ''
}

export function FilterSettings({
  accountEmail,
  inboxSubFolders,
  customFolders = [],
  onRunFilters
}: FilterSettingsProps) {
  const { t } = useTranslation()

  const FIELD_LABELS: FieldLabelsType = {
    fromName: t('settings.filterSettings.field.fromName'),
    fromAddress: t('settings.filterSettings.field.fromAddress'),
    toName: t('settings.filterSettings.field.toName'),
    toAddress: t('settings.filterSettings.field.toAddress'),
    subject: t('settings.filterSettings.field.subject'),
    body: t('settings.filterSettings.field.body')
  }

  const OPERATOR_LABELS: OperatorLabelsType = {
    contains: t('settings.filterSettings.operator.contains'),
    equals: t('settings.filterSettings.operator.equals'),
    startsWith: t('settings.filterSettings.operator.startsWith'),
    endsWith: t('settings.filterSettings.operator.endsWith')
  }

  const ACTION_LABELS: ActionLabelsType = {
    move: t('settings.filterSettings.actionType.move'),
    delete: t('settings.filterSettings.actionType.delete'),
    markRead: t('settings.filterSettings.actionType.markRead'),
    markStarred: t('settings.filterSettings.actionType.markStarred')
  }

  const [filters, setFilters] = useState<MailFilter[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingFilter, setEditingFilter] = useState<MailFilter | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isRunningFilters, setIsRunningFilters] = useState(false)
  const [runResult, setRunResult] = useState<string | null>(null)

  // Table state
  const [searchQuery, setSearchQuery] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const pageSize = 10

  // Form state for creating/editing
  const [formName, setFormName] = useState('')
  const [formConditions, setFormConditions] = useState<FilterCondition[]>([{ ...defaultCondition }])
  const [formMatchAll, setFormMatchAll] = useState(true)
  const [formAction, setFormAction] = useState<FilterAction>('move')
  const [formTargetFolder, setFormTargetFolder] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  // 이동 가능한 폴더 목록 (받은메일함 하위 폴더 + 내 메일함)
  const targetFolders = [
    ...inboxSubFolders.map((f) => ({ name: f.name, path: f.path, group: 'inbox' as const })),
    ...customFolders.map((f) => ({ name: f.name, path: f.path, group: 'custom' as const }))
  ]

  useEffect(() => {
    loadFilters()
  }, [accountEmail])

  const loadFilters = async () => {
    if (!accountEmail) return
    setIsLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('get-mail-filters', accountEmail)
      setFilters(result || [])
    } catch (err) {
      console.error('Failed to load filters:', err)
      setError(t('settings.filterSettings.loadError'))
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setFormName('')
    setFormConditions([{ ...defaultCondition }])
    setFormMatchAll(true)
    setFormAction('move')
    setFormTargetFolder('')
  }

  const startCreating = () => {
    resetForm()
    setEditingFilter(null)
    setIsCreating(true)
    setError(null)
  }

  const startEditing = (filter: MailFilter) => {
    setFormName(filter.name)
    setFormConditions([...filter.conditions])
    setFormMatchAll(filter.matchAll)
    setFormAction(filter.action)
    setFormTargetFolder(filter.targetFolder || '')
    setEditingFilter(filter)
    setIsCreating(true)
    setError(null)
  }

  const cancelEditing = () => {
    setIsCreating(false)
    setEditingFilter(null)
    resetForm()
  }

  const addCondition = () => {
    setFormConditions([...formConditions, { ...defaultCondition }])
  }

  const removeCondition = (index: number) => {
    if (formConditions.length > 1) {
      setFormConditions(formConditions.filter((_, i) => i !== index))
    }
  }

  const updateCondition = (index: number, updates: Partial<FilterCondition>) => {
    setFormConditions(formConditions.map((c, i) => (i === index ? { ...c, ...updates } : c)))
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      setError(t('settings.filterSettings.filterNameRequired'))
      return
    }

    if (formConditions.some((c) => !c.value.trim())) {
      setError(t('settings.filterSettings.conditionValueRequired'))
      return
    }

    if (formAction === 'move' && !formTargetFolder) {
      setError(t('settings.filterSettings.targetFolderRequired'))
      return
    }

    setIsProcessing(true)
    setError(null)

    const filterData = {
      name: formName.trim(),
      enabled: true,
      conditions: formConditions,
      matchAll: formMatchAll,
      action: formAction,
      targetFolder: formAction === 'move' ? formTargetFolder : undefined
    }

    try {
      if (editingFilter) {
        const result = await window.electron.ipcRenderer.invoke(
          'update-mail-filter',
          accountEmail,
          editingFilter.id,
          filterData
        )
        if (result.success) {
          await loadFilters()
          cancelEditing()
        } else {
          setError(result.error || t('settings.filterSettings.updateFailed'))
        }
      } else {
        const result = await window.electron.ipcRenderer.invoke(
          'add-mail-filter',
          accountEmail,
          filterData
        )
        if (result.success) {
          await loadFilters()
          cancelEditing()
        } else if (result.isDuplicate) {
          // 중복 필터가 존재하는 경우
          setError(
            t('settings.filterSettings.duplicateFilter', {
              name: result.existingFilter?.name || ''
            })
          )
        } else {
          setError(result.error || t('settings.filterSettings.addFailed'))
        }
      }
    } catch (err) {
      setError(t('settings.filterSettings.saveFailed'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t('settings.filterSettings.deleteConfirm', { name }))) return

    setIsProcessing(true)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'delete-mail-filter',
        accountEmail,
        id
      )
      if (result.success) {
        await loadFilters()
      } else {
        setError(result.error || t('settings.filterSettings.deleteFailed'))
      }
    } catch (err) {
      setError(t('settings.filterSettings.deleteFailed'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleToggle = async (id: string) => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'toggle-mail-filter',
        accountEmail,
        id
      )
      if (result.success) {
        await loadFilters()
      } else {
        setError(result.error || t('settings.filterSettings.toggleFailed'))
      }
    } catch (err) {
      setError(t('settings.filterSettings.toggleFailed'))
    }
  }

  const handleRunFilters = async () => {
    if (!onRunFilters) return

    setIsRunningFilters(true)
    setRunResult(null)
    setError(null)

    try {
      const result = await onRunFilters()
      if (result.success) {
        setRunResult(t('settings.filterSettings.runComplete', { count: result.processedCount }))
      } else {
        setError(result.error || t('settings.filterSettings.runFailed'))
      }
    } catch (err) {
      setError(t('settings.filterSettings.runError'))
    } finally {
      setIsRunningFilters(false)
    }
  }

  const getFilterSummary = (filter: MailFilter) => {
    const conditionText = filter.conditions
      .map((c) => `${FIELD_LABELS[c.field]}: ${OPERATOR_LABELS[c.operator]} "${c.value}"`)
      .join(filter.matchAll ? ' & ' : ' | ')

    let actionText = ACTION_LABELS[filter.action]
    if (filter.action === 'move' && filter.targetFolder) {
      const folder = targetFolders.find((f) => f.path === filter.targetFolder)
      actionText = folder?.name.trim() || filter.targetFolder
    }

    return { conditionText, actionText }
  }

  // 날짜 포맷 함수
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // 테이블 컬럼 정의
  const columns = useMemo<ColumnDef<MailFilter>[]>(
    () => [
      {
        id: 'index',
        size: 50,
        header: () => <span>#</span>,
        cell: ({ row }) => {
          const pageIndex = table.getState().pagination.pageIndex
          return (
            <span className="text-muted-foreground">{pageIndex * pageSize + row.index + 1}</span>
          )
        },
        enableSorting: false
      },
      {
        accessorKey: 'enabled',
        size: 70,
        header: () => <span>{t('settings.filterSettings.enabled')}</span>,
        cell: ({ row }) => (
          <Switch
            checked={row.original.enabled}
            onCheckedChange={() => handleToggle(row.original.id)}
          />
        ),
        enableSorting: false
      },
      {
        accessorKey: 'name',
        size: 150,
        header: ({ column }) => (
          <div
            className="flex items-center cursor-pointer select-none hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('settings.filterSettings.filterName')}
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="h-3 w-3 ml-1" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="h-3 w-3 ml-1" />
            ) : (
              <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />
            )}
          </div>
        ),
        cell: ({ row }) => (
          <span className={cn('font-medium', !row.original.enabled && 'opacity-50')}>
            {row.original.name}
          </span>
        )
      },
      {
        id: 'condition',
        size: 250,
        header: () => <span>{t('settings.filterSettings.condition')}</span>,
        cell: ({ row }) => {
          const { conditionText } = getFilterSummary(row.original)
          return (
            <span
              className={cn(
                'text-sm text-muted-foreground truncate block max-w-[250px]',
                !row.original.enabled && 'opacity-50'
              )}
              title={conditionText}
            >
              {conditionText}
            </span>
          )
        },
        enableSorting: false
      },
      {
        id: 'action',
        size: 120,
        header: () => <span>{t('settings.filterSettings.action')}</span>,
        cell: ({ row }) => {
          const { actionText } = getFilterSummary(row.original)
          return (
            <span className={cn('text-sm', !row.original.enabled && 'opacity-50')}>
              {actionText}
            </span>
          )
        },
        enableSorting: false
      },
      {
        accessorKey: 'createdAt',
        size: 100,
        header: ({ column }) => (
          <div
            className="flex items-center cursor-pointer select-none hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('settings.filterSettings.createdAt')}
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="h-3 w-3 ml-1" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="h-3 w-3 ml-1" />
            ) : (
              <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />
            )}
          </div>
        ),
        cell: ({ row }) => (
          <span
            className={cn('text-sm text-muted-foreground', !row.original.enabled && 'opacity-50')}
          >
            {formatDate(row.original.createdAt)}
          </span>
        )
      },
      {
        id: 'actions',
        size: 80,
        header: () => null,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => startEditing(row.original)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => handleDelete(row.original.id, row.original.name)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        enableSorting: false
      }
    ],
    [t, targetFolders, FIELD_LABELS, OPERATOR_LABELS, ACTION_LABELS]
  )

  // 테이블 인스턴스
  const table = useReactTable({
    data: filters,
    columns,
    state: {
      sorting,
      globalFilter: searchQuery
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearchQuery,
    globalFilterFn: (row, _columnId, filterValue) => {
      const filter = row.original
      const searchLower = filterValue.toLowerCase()
      // 이름으로 검색
      if (filter.name.toLowerCase().includes(searchLower)) return true
      // 조건값으로 검색
      if (filter.conditions.some((c) => c.value.toLowerCase().includes(searchLower))) return true
      return false
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize
      }
    }
  })

  // 페이지네이션 정보
  const currentPage = table.getState().pagination.pageIndex + 1
  const totalPages = table.getPageCount()
  const pageNumbers: number[] = []
  const maxVisiblePages = 5
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2))
  const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)

  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1)
  }

  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i)
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <p className="text-muted-foreground">{t('settings.filterSettings.loadingFilters')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{t('settings.filterSettings.title')}</h2>
        {!isCreating && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunFilters}
              disabled={isRunningFilters || filters.filter((f) => f.enabled).length === 0}
            >
              {isRunningFilters ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {isRunningFilters
                ? t('settings.filterSettings.running')
                : t('settings.filterSettings.runFilters')}
            </Button>
            <Button size="sm" onClick={startCreating}>
              <Plus className="mr-2 h-4 w-4" />
              {t('settings.filterSettings.addFilter')}
            </Button>
          </div>
        )}
      </div>

      {/* 내용 */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-4">
          {/* 필터 실행 결과 메시지 */}
          {runResult && (
            <div className="flex items-center gap-2 rounded-md border border-green-500 bg-green-500/10 p-3 text-green-700 dark:text-green-400">
              <Play className="h-4 w-4" />
              <span className="text-sm">{runResult}</span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-6 w-6"
                onClick={() => setRunResult(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* 오류 메시지 */}
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-6 w-6"
                onClick={() => setError(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Create/Edit Form */}
          {isCreating && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {editingFilter
                    ? t('settings.filterSettings.editFilter')
                    : t('settings.filterSettings.newFilter')}
                </CardTitle>
                <CardDescription>{t('settings.filterSettings.filterDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filter Name */}
                <div className="space-y-2">
                  <Label>{t('settings.filterSettings.filterName')}</Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t('settings.filterSettings.filterNamePlaceholder')}
                    disabled={isProcessing}
                  />
                </div>

                {/* Conditions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{t('settings.filterSettings.condition')}</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {t('settings.filterSettings.conditionMatch')}
                      </span>
                      <Select
                        value={formMatchAll ? 'all' : 'any'}
                        onValueChange={(v) => setFormMatchAll(v === 'all')}
                      >
                        <SelectTrigger className="w-24 h-8">
                          <span>
                            {formMatchAll
                              ? t('settings.filterSettings.matchAll')
                              : t('settings.filterSettings.matchAny')}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            {t('settings.filterSettings.matchAll')}
                          </SelectItem>
                          <SelectItem value="any">
                            {t('settings.filterSettings.matchAny')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {formConditions.map((condition, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Select
                        value={condition.field}
                        onValueChange={(v) =>
                          updateCondition(index, { field: v as FilterConditionField })
                        }
                      >
                        <SelectTrigger className="w-36">
                          <span>{FIELD_LABELS[condition.field]}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fromName">
                            {t('settings.filterSettings.field.fromName')}
                          </SelectItem>
                          <SelectItem value="fromAddress">
                            {t('settings.filterSettings.field.fromAddress')}
                          </SelectItem>
                          <SelectItem value="toName">
                            {t('settings.filterSettings.field.toName')}
                          </SelectItem>
                          <SelectItem value="toAddress">
                            {t('settings.filterSettings.field.toAddress')}
                          </SelectItem>
                          <SelectItem value="subject">
                            {t('settings.filterSettings.field.subject')}
                          </SelectItem>
                          <SelectItem value="body">
                            {t('settings.filterSettings.field.body')}
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={condition.operator}
                        onValueChange={(v) =>
                          updateCondition(index, { operator: v as FilterConditionOperator })
                        }
                      >
                        <SelectTrigger className="w-24">
                          <span>{OPERATOR_LABELS[condition.operator]}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contains">
                            {t('settings.filterSettings.operator.contains')}
                          </SelectItem>
                          <SelectItem value="equals">
                            {t('settings.filterSettings.operator.equals')}
                          </SelectItem>
                          <SelectItem value="startsWith">
                            {t('settings.filterSettings.operator.startsWith')}
                          </SelectItem>
                          <SelectItem value="endsWith">
                            {t('settings.filterSettings.operator.endsWith')}
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <Input
                        value={condition.value}
                        onChange={(e) => updateCondition(index, { value: e.target.value })}
                        placeholder={t('settings.filterSettings.searchPlaceholder')}
                        className="flex-1"
                        disabled={isProcessing}
                      />

                      {formConditions.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => removeCondition(index)}
                          disabled={isProcessing}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addCondition}
                    disabled={isProcessing}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t('settings.filterSettings.addCondition')}
                  </Button>
                </div>

                {/* Action */}
                <div className="space-y-2">
                  <Label>{t('settings.filterSettings.action')}</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={formAction}
                      onValueChange={(v) => setFormAction(v as FilterAction)}
                    >
                      <SelectTrigger className="w-40">
                        <span>{ACTION_LABELS[formAction]}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="move">
                          {t('settings.filterSettings.actionType.move')}
                        </SelectItem>
                        <SelectItem value="delete">
                          {t('settings.filterSettings.actionType.delete')}
                        </SelectItem>
                        <SelectItem value="markRead">
                          {t('settings.filterSettings.actionType.markRead')}
                        </SelectItem>
                        <SelectItem value="markStarred">
                          {t('settings.filterSettings.actionType.markStarred')}
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {formAction === 'move' && (
                      <Select value={formTargetFolder} onValueChange={setFormTargetFolder}>
                        <SelectTrigger className="min-w-[200px] flex-1">
                          <span className="truncate">
                            {formTargetFolder
                              ? targetFolders.find((f) => f.path === formTargetFolder)?.name ||
                                formTargetFolder
                              : t('settings.filterSettings.selectFolder')}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {inboxSubFolders.length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                {t('settings.filterSettings.inboxFolder')}
                              </div>
                              {inboxSubFolders.map((folder) => (
                                <SelectItem key={folder.path} value={folder.path}>
                                  {folder.name}
                                </SelectItem>
                              ))}
                            </>
                          )}
                          {customFolders.length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                {t('settings.filterSettings.myFolders')}
                              </div>
                              {customFolders.map((folder) => (
                                <SelectItem key={folder.path} value={folder.path}>
                                  {folder.name}
                                </SelectItem>
                              ))}
                            </>
                          )}
                          {targetFolders.length === 0 && (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              {t('settings.filterSettings.noFoldersAvailable')}
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={cancelEditing} disabled={isProcessing}>
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={handleSave} disabled={isProcessing}>
                    {isProcessing
                      ? t('settings.filterSettings.saving')
                      : editingFilter
                        ? t('common.edit')
                        : t('common.add')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filter List */}
          {!isCreating && (
            <>
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('settings.filterSettings.searchFilters')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Table */}
              {filters.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                    <Filter className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">
                      {t('settings.filterSettings.noFilters')}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('settings.filterSettings.noFiltersDesc')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-md border">
                  <div className="overflow-auto">
                    <table className="w-full">
                      <thead className="border-b bg-muted/50">
                        <tr>
                          {table.getHeaderGroups().map((headerGroup) =>
                            headerGroup.headers.map((header) => (
                              <th
                                key={header.id}
                                className="h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground"
                                style={{
                                  width: header.column.getSize(),
                                  minWidth: header.column.getSize()
                                }}
                              >
                                {header.isPlaceholder
                                  ? null
                                  : flexRender(header.column.columnDef.header, header.getContext())}
                              </th>
                            ))
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {table.getRowModel().rows.length === 0 ? (
                          <tr>
                            <td colSpan={columns.length} className="h-24 text-center">
                              <div className="flex flex-col items-center justify-center text-muted-foreground">
                                <Search className="h-8 w-8 mb-2 opacity-50" />
                                <p>{t('settings.filterSettings.noSearchResults')}</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          table.getRowModel().rows.map((row) => (
                            <tr
                              key={row.id}
                              className="border-b transition-colors hover:bg-muted/50"
                            >
                              {row.getVisibleCells().map((cell) => (
                                <td
                                  key={cell.id}
                                  className="px-3 py-2 align-middle"
                                  style={{
                                    width: cell.column.getSize(),
                                    minWidth: cell.column.getSize()
                                  }}
                                >
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t px-4 py-3">
                      <div className="text-sm text-muted-foreground">
                        {t('settings.filterSettings.pageInfo', {
                          current: currentPage,
                          total: totalPages,
                          count: table.getFilteredRowModel().rows.length
                        })}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => table.setPageIndex(0)}
                          disabled={!table.getCanPreviousPage()}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <ChevronLeft className="h-4 w-4 -ml-2" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => table.previousPage()}
                          disabled={!table.getCanPreviousPage()}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        {pageNumbers.map((page) => (
                          <Button
                            key={page}
                            variant={page === currentPage ? 'outline' : 'ghost'}
                            size="icon"
                            className={cn(
                              'h-8 w-8 text-sm',
                              page === currentPage && 'border-primary text-primary'
                            )}
                            onClick={() => table.setPageIndex(page - 1)}
                          >
                            {page}
                          </Button>
                        ))}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => table.nextPage()}
                          disabled={!table.getCanNextPage()}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => table.setPageIndex(totalPages - 1)}
                          disabled={!table.getCanNextPage()}
                        >
                          <ChevronRight className="h-4 w-4" />
                          <ChevronRight className="h-4 w-4 -ml-2" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
