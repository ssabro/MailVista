import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Users,
  Star,
  Plus,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FolderPlus,
  MoreHorizontal,
  Edit2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  AlertTriangle
} from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Checkbox } from './ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from './ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { cn } from '@renderer/lib/utils'

interface Contact {
  id: string
  name: string
  email: string
  organization?: string
  phone?: string
  memo?: string
  groupIds: string[]
  starred: boolean
  createdAt: string
  updatedAt: string
}

interface ContactGroup {
  id: string
  name: string
  parentId?: string
  createdAt: string
}

interface ContactCounts {
  [groupId: string]: number
  total: number
  starred: number
  noGroup: number
}

// 가져오기 관련 인터페이스
interface ImportedContact {
  name: string
  email: string
  organization?: string
  phone?: string
  memo?: string
  groupName?: string
}

interface ImportValidationResult {
  valid: ImportedContact[]
  invalid: { row: number; data: Record<string, string>; error: string }[]
  duplicates: { row: number; data: ImportedContact; existingContact: Contact }[]
}

type SortField = 'name' | 'email' | 'organization' | 'createdAt'
type SortOrder = 'asc' | 'desc'

interface AddressBookProps {
  accountEmail: string
  onComposeToContact?: (email: string, name: string) => void
}

const ITEMS_PER_PAGE = 20

export function AddressBook({ accountEmail, onComposeToContact }: AddressBookProps) {
  const { t } = useTranslation()

  // Contact and group state
  const [contacts, setContacts] = useState<Contact[]>([])
  const [groups, setGroups] = useState<ContactGroup[]>([])
  const [counts, setCounts] = useState<ContactCounts>({ total: 0, starred: 0, noGroup: 0 })
  const [totalContacts, setTotalContacts] = useState(0)

  // 필터 및 정렬 상태
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [showStarred, setShowStarred] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  // 페이지네이션
  const [currentPage, setCurrentPage] = useState(1)

  // 선택 상태
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 다이얼로그 상태
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false)
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [editingGroup, setEditingGroup] = useState<ContactGroup | null>(null)

  // 가져오기 다이얼로그 상태
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [importStep, setImportStep] = useState<'select' | 'preview' | 'result'>('select')
  const [, setImportFilePath] = useState<string | null>(null)
  const [importedContacts, setImportedContacts] = useState<ImportedContact[]>([])
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null)
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'update'>('skip')
  const [importResult, setImportResult] = useState<{
    imported: number
    skipped: number
    failed: number
  } | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  // 폼 상태
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    organization: '',
    phone: '',
    memo: '',
    groupIds: [] as string[],
    starred: false
  })
  const [groupForm, setGroupForm] = useState({ name: '' })

  // 로딩 상태
  const [isLoading, setIsLoading] = useState(false)

  // 연락처 목록 로드
  const loadContacts = useCallback(async () => {
    if (!accountEmail) return
    setIsLoading(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('get-contacts', accountEmail, {
        groupId: selectedGroupId || undefined,
        starred: showStarred ? true : undefined,
        search: searchQuery || undefined,
        sortBy: sortField,
        sortOrder: sortOrder,
        start: (currentPage - 1) * ITEMS_PER_PAGE,
        limit: ITEMS_PER_PAGE
      })
      setContacts(result.contacts)
      setTotalContacts(result.total)
    } catch (error) {
      console.error('Failed to load contacts:', error)
    } finally {
      setIsLoading(false)
    }
  }, [accountEmail, selectedGroupId, showStarred, searchQuery, sortField, sortOrder, currentPage])

  // 그룹 목록 로드
  const loadGroups = useCallback(async () => {
    if (!accountEmail) return
    try {
      const groupList = await window.electron.ipcRenderer.invoke('get-contact-groups', accountEmail)
      setGroups(groupList)
    } catch (error) {
      console.error('Failed to load groups:', error)
    }
  }, [accountEmail])

  // 연락처 수 로드
  const loadCounts = useCallback(async () => {
    if (!accountEmail) return
    try {
      const countData = await window.electron.ipcRenderer.invoke(
        'get-contact-count-by-group',
        accountEmail
      )
      setCounts(countData)
    } catch (error) {
      console.error('Failed to load counts:', error)
    }
  }, [accountEmail])

  // 초기 로드
  useEffect(() => {
    loadGroups()
    loadCounts()
  }, [loadGroups, loadCounts])

  // 필터 변경 시 연락처 로드
  useEffect(() => {
    loadContacts()
  }, [loadContacts])

  // 필터 변경 시 페이지 초기화
  useEffect(() => {
    setCurrentPage(1)
    setSelectedIds(new Set())
  }, [selectedGroupId, showStarred, searchQuery, sortField, sortOrder])

  // 전체 선택/해제
  const handleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)))
    }
  }

  // 개별 선택
  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  // 정렬 변경
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  // 연락처 추가/수정
  const handleSaveContact = async () => {
    try {
      if (editingContact) {
        await window.electron.ipcRenderer.invoke(
          'update-contact',
          accountEmail,
          editingContact.id,
          contactForm
        )
      } else {
        await window.electron.ipcRenderer.invoke('add-contact', accountEmail, contactForm)
      }
      setIsContactDialogOpen(false)
      setEditingContact(null)
      resetContactForm()
      loadContacts()
      loadCounts()
    } catch (error) {
      console.error('Failed to save contact:', error)
    }
  }

  // Delete contacts
  const handleDeleteContacts = async (ids: string[]) => {
    if (ids.length === 0) return
    if (!confirm(t('addressBook.deleteContactConfirm', { count: ids.length }))) return

    try {
      await window.electron.ipcRenderer.invoke('delete-contacts', accountEmail, ids)
      setSelectedIds(new Set())
      loadContacts()
      loadCounts()
    } catch (error) {
      console.error('Failed to delete contacts:', error)
    }
  }

  // 즐겨찾기 토글
  const handleToggleStar = async (id: string) => {
    try {
      await window.electron.ipcRenderer.invoke('toggle-contact-star', accountEmail, id)
      loadContacts()
      loadCounts()
    } catch (error) {
      console.error('Failed to toggle star:', error)
    }
  }

  // 그룹 추가/수정
  const handleSaveGroup = async () => {
    try {
      if (editingGroup) {
        await window.electron.ipcRenderer.invoke(
          'update-contact-group',
          accountEmail,
          editingGroup.id,
          groupForm.name
        )
      } else {
        await window.electron.ipcRenderer.invoke('add-contact-group', accountEmail, groupForm.name)
      }
      setIsGroupDialogOpen(false)
      setEditingGroup(null)
      setGroupForm({ name: '' })
      loadGroups()
      loadCounts()
    } catch (error) {
      console.error('Failed to save group:', error)
    }
  }

  // Delete group
  const handleDeleteGroup = async (id: string) => {
    if (!confirm(t('addressBook.deleteGroupConfirm'))) return

    try {
      await window.electron.ipcRenderer.invoke('delete-contact-group', accountEmail, id)
      if (selectedGroupId === id) {
        setSelectedGroupId(null)
      }
      loadGroups()
      loadCounts()
    } catch (error) {
      console.error('Failed to delete group:', error)
    }
  }

  // 연락처 폼 초기화
  const resetContactForm = () => {
    setContactForm({
      name: '',
      email: '',
      organization: '',
      phone: '',
      memo: '',
      groupIds: [],
      starred: false
    })
  }

  // 연락처 수정 다이얼로그 열기
  const openEditContact = (contact: Contact) => {
    setEditingContact(contact)
    setContactForm({
      name: contact.name,
      email: contact.email,
      organization: contact.organization || '',
      phone: contact.phone || '',
      memo: contact.memo || '',
      groupIds: contact.groupIds,
      starred: contact.starred
    })
    setIsContactDialogOpen(true)
  }

  // 새 연락처 다이얼로그 열기
  const openNewContact = () => {
    setEditingContact(null)
    resetContactForm()
    if (selectedGroupId) {
      setContactForm((prev) => ({ ...prev, groupIds: [selectedGroupId] }))
    }
    setIsContactDialogOpen(true)
  }

  // 그룹 수정 다이얼로그 열기
  const openEditGroup = (group: ContactGroup) => {
    setEditingGroup(group)
    setGroupForm({ name: group.name })
    setIsGroupDialogOpen(true)
  }

  // 새 그룹 다이얼로그 열기
  const openNewGroup = () => {
    setEditingGroup(null)
    setGroupForm({ name: '' })
    setIsGroupDialogOpen(true)
  }

  // 가져오기 다이얼로그 열기
  const openImportDialog = () => {
    setImportStep('select')
    setImportFilePath(null)
    setImportedContacts([])
    setValidationResult(null)
    setImportResult(null)
    setImportError(null)
    setDuplicateAction('skip')
    setIsImportDialogOpen(true)
  }

  // 파일 선택
  const handleSelectFile = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('select-contacts-file')
      if (result.success && result.filePath) {
        setImportFilePath(result.filePath)
        setImportError(null)

        // 파일 파싱
        const parseResult = await window.electron.ipcRenderer.invoke(
          'parse-contacts-file',
          result.filePath
        )
        if (parseResult.success && parseResult.contacts) {
          setImportedContacts(parseResult.contacts)

          // 유효성 검사
          const validation = await window.electron.ipcRenderer.invoke(
            'validate-imported-contacts',
            accountEmail,
            parseResult.contacts
          )
          setValidationResult(validation)
          setImportStep('preview')
        } else {
          setImportError(parseResult.error || t('addressBook.import.parseError'))
        }
      }
    } catch (error) {
      console.error('파일 선택 오류:', error)
      setImportError(t('addressBook.import.fileSelectError'))
    }
  }

  // 템플릿 다운로드
  const handleDownloadTemplate = async (format: 'xlsx' | 'csv') => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'create-contact-import-template',
        format
      )
      if (!result.success) {
        alert(result.error || t('addressBook.import.templateError'))
      }
    } catch (error) {
      console.error('템플릿 다운로드 오류:', error)
    }
  }

  // 가져오기 실행
  const handleImport = async () => {
    if (!validationResult) return

    setIsImporting(true)
    try {
      // 유효한 연락처 + 중복 처리에 따른 연락처 결합
      const contactsToImport = [
        ...validationResult.valid,
        ...(duplicateAction === 'update' ? validationResult.duplicates.map((d) => d.data) : [])
      ]

      const result = await window.electron.ipcRenderer.invoke(
        'import-contacts',
        accountEmail,
        contactsToImport,
        duplicateAction
      )

      setImportResult({
        imported: result.imported,
        skipped:
          result.skipped + (duplicateAction === 'skip' ? validationResult.duplicates.length : 0),
        failed: result.failed + validationResult.invalid.length
      })
      setImportStep('result')

      // 연락처 목록 새로고침
      loadContacts()
      loadGroups()
    } catch (error) {
      console.error('가져오기 오류:', error)
      setImportError(t('addressBook.import.importError'))
    } finally {
      setIsImporting(false)
    }
  }

  // 내보내기
  const handleExport = async (format: 'xlsx' | 'csv') => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'export-contacts',
        accountEmail,
        format,
        {
          groupId: selectedGroupId || undefined,
          starred: showStarred ? true : undefined
        }
      )
      if (!result.success) {
        alert(result.error || t('addressBook.export.error'))
      }
    } catch (error) {
      console.error('내보내기 오류:', error)
    }
  }

  // 페이지네이션 계산
  const totalPages = Math.ceil(totalContacts / ITEMS_PER_PAGE)
  const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalContacts)

  // 정렬 아이콘 렌더링
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    )
  }

  return (
    <div className="flex h-full bg-muted/30">
      {/* Sidebar */}
      <div className="w-[260px] min-w-[260px] flex-shrink-0 bg-card border-r flex flex-col">
        {/* Add contact button */}
        <div className="p-3 space-y-2">
          <Button onClick={openNewContact} className="w-full gap-2" size="sm">
            <Plus className="h-4 w-4" />
            {t('addressBook.addContact')}
          </Button>
          <div className="flex gap-2">
            <Button onClick={openImportDialog} variant="outline" className="flex-1 gap-1" size="sm">
              <Upload className="h-3.5 w-3.5" />
              {t('addressBook.import.button')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex-1 gap-1" size="sm">
                  <Download className="h-3.5 w-3.5" />
                  {t('addressBook.export.button')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => handleExport('xlsx')}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('csv')}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  CSV (.csv)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Group list */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            {/* All contacts */}
            <button
              onClick={() => {
                setSelectedGroupId(null)
                setShowStarred(false)
              }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm',
                !selectedGroupId && !showStarred ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100'
              )}
            >
              <Users className="h-4 w-4" />
              <span className="flex-1 text-left">{t('addressBook.allContacts')}</span>
              <span className="text-xs text-muted-foreground">{counts.total}</span>
            </button>

            {/* Starred */}
            <button
              onClick={() => {
                setSelectedGroupId(null)
                setShowStarred(true)
              }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm',
                showStarred ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100'
              )}
            >
              <Star className="h-4 w-4" />
              <span className="flex-1 text-left">{t('addressBook.starred')}</span>
              <span className="text-xs text-muted-foreground">{counts.starred}</span>
            </button>

            {/* Group header */}
            <div className="flex items-center justify-between mt-4 mb-2 px-3">
              <span className="text-xs font-medium text-muted-foreground">
                {t('addressBook.myGroups')}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={openNewGroup}>
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* 그룹 리스트 */}
            {groups
              .filter((g) => !g.parentId)
              .map((group) => (
                <div key={group.id} className="group">
                  <button
                    onClick={() => {
                      setSelectedGroupId(group.id)
                      setShowStarred(false)
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm',
                      selectedGroupId === group.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'hover:bg-gray-100'
                    )}
                  >
                    <span className="flex-1 text-left truncate">{group.name}</span>
                    <span className="text-xs text-muted-foreground">{counts[group.id] || 0}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditGroup(group)}>
                          <Edit2 className="h-4 w-4 mr-2" />
                          {t('addressBook.rename')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => handleDeleteGroup(group.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </button>
                  {/* 하위 그룹 */}
                  {groups
                    .filter((g) => g.parentId === group.id)
                    .map((subGroup) => (
                      <button
                        key={subGroup.id}
                        onClick={() => {
                          setSelectedGroupId(subGroup.id)
                          setShowStarred(false)
                        }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 pl-8 rounded-md text-sm',
                          selectedGroupId === subGroup.id
                            ? 'bg-blue-50 text-blue-700'
                            : 'hover:bg-gray-100'
                        )}
                      >
                        <span className="flex-1 text-left truncate">{subGroup.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {counts[subGroup.id] || 0}
                        </span>
                      </button>
                    ))}
                </div>
              ))}

            {/* No group */}
            <button
              onClick={() => {
                setSelectedGroupId('__no_group__')
                setShowStarred(false)
              }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm mt-2',
                selectedGroupId === '__no_group__'
                  ? 'bg-blue-50 text-blue-700'
                  : 'hover:bg-gray-100'
              )}
            >
              <span className="flex-1 text-left text-muted-foreground">
                {t('addressBook.noGroup')}
              </span>
              <span className="text-xs text-muted-foreground">{counts.noGroup}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="h-12 border-b bg-card flex items-center justify-between px-4 gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={contacts.length > 0 && selectedIds.size === contacts.length}
              onCheckedChange={handleSelectAll}
            />
            {selectedIds.size > 0 && (
              <>
                <span className="text-sm text-muted-foreground">
                  {t('addressBook.selected', { count: selectedIds.size })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => handleDeleteContacts(Array.from(selectedIds))}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {t('common.delete')}
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('addressBook.searchContacts')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
          </div>
        </div>

        {/* Contact table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="text-left border-b">
                <th className="w-10 px-3 py-2"></th>
                <th className="w-10 px-2 py-2"></th>
                <th className="px-3 py-2">
                  <button
                    className="flex items-center text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => handleSort('name')}
                  >
                    {t('addressBook.name')} {renderSortIcon('name')}
                  </button>
                </th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">
                  {t('addressBook.phone')}
                </th>
                <th className="px-3 py-2">
                  <button
                    className="flex items-center text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => handleSort('email')}
                  >
                    {t('addressBook.email')} {renderSortIcon('email')}
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button
                    className="flex items-center text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => handleSort('organization')}
                  >
                    {t('addressBook.organization')} {renderSortIcon('organization')}
                  </button>
                </th>
                <th className="w-16 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t('addressBook.loading')}
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t('addressBook.noContacts')}
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className="border-b hover:bg-muted/50 cursor-pointer"
                    onClick={() => openEditContact(contact)}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(contact.id)}
                        onCheckedChange={() => handleSelect(contact.id)}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleToggleStar(contact.id)} className="p-0.5">
                        <Star
                          className={cn(
                            'h-4 w-4',
                            contact.starred
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-muted-foreground hover:text-yellow-400'
                          )}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-2 font-medium">{contact.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{contact.phone || '-'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{contact.email}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {contact.organization || '-'}
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditContact(contact)}>
                            <Edit2 className="h-4 w-4 mr-2" />
                            {t('common.edit')}
                          </DropdownMenuItem>
                          {onComposeToContact && (
                            <DropdownMenuItem
                              onClick={() => onComposeToContact(contact.email, contact.name)}
                            >
                              {t('addressBook.sendMail')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleDeleteContacts([contact.id])}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {totalContacts > 0 && (
          <div className="h-12 border-t bg-card flex items-center justify-between px-4">
            <span className="text-sm text-muted-foreground">
              {startItem}-{endItem} / {totalContacts}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm px-2">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Contact Dialog */}
      <Dialog open={isContactDialogOpen} onOpenChange={setIsContactDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingContact ? t('addressBook.editContact') : t('addressBook.addContact')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('addressBook.name')} *</Label>
              <Input
                id="name"
                value={contactForm.name}
                onChange={(e) => setContactForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t('addressBook.enterName')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('addressBook.email')} *</Label>
              <Input
                id="email"
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization">{t('addressBook.organization')}</Label>
              <Input
                id="organization"
                value={contactForm.organization}
                onChange={(e) =>
                  setContactForm((prev) => ({ ...prev, organization: e.target.value }))
                }
                placeholder={t('addressBook.companyOrOrg')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t('addressBook.phone')}</Label>
              <Input
                id="phone"
                type="tel"
                value={contactForm.phone}
                onChange={(e) => setContactForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="010-0000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memo">{t('addressBook.memo')}</Label>
              <Textarea
                id="memo"
                value={contactForm.memo}
                onChange={(e) => setContactForm((prev) => ({ ...prev, memo: e.target.value }))}
                placeholder={t('addressBook.enterMemo')}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('addressBook.groups')}</Label>
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('addressBook.noGroups')}</p>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="truncate">
                        {contactForm.groupIds.length === 0
                          ? t('addressBook.selectGroup')
                          : contactForm.groupIds.length === 1
                            ? groups.find((g) => g.id === contactForm.groupIds[0])?.name ||
                              t('addressBook.groupsSelected', { count: 1 })
                            : t('addressBook.groupsSelected', {
                                count: contactForm.groupIds.length
                              })}
                      </span>
                      <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56 max-h-60 overflow-y-auto">
                    {groups.map((group) => (
                      <DropdownMenuItem
                        key={group.id}
                        onSelect={(e) => {
                          e.preventDefault()
                          setContactForm((prev) => ({
                            ...prev,
                            groupIds: prev.groupIds.includes(group.id)
                              ? prev.groupIds.filter((id) => id !== group.id)
                              : [...prev.groupIds, group.id]
                          }))
                        }}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <Checkbox
                            checked={contactForm.groupIds.includes(group.id)}
                            className="pointer-events-none"
                          />
                          <span className="truncate">{group.name}</span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {contactForm.groupIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {contactForm.groupIds.map((gid) => {
                    const group = groups.find((g) => g.id === gid)
                    return group ? (
                      <span
                        key={gid}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full"
                      >
                        {group.name}
                        <button
                          type="button"
                          onClick={() =>
                            setContactForm((prev) => ({
                              ...prev,
                              groupIds: prev.groupIds.filter((id) => id !== gid)
                            }))
                          }
                          className="hover:bg-blue-200 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ) : null
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsContactDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSaveContact}
              disabled={!contactForm.name.trim() || !contactForm.email.trim()}
            >
              {editingContact ? t('common.save') : t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Group Dialog */}
      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? t('addressBook.renameGroup') : t('addressBook.newGroup')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="groupName">{t('addressBook.groupName')}</Label>
              <Input
                id="groupName"
                value={groupForm.name}
                onChange={(e) => setGroupForm({ name: e.target.value })}
                placeholder={t('addressBook.enterGroupName')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGroupDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveGroup} disabled={!groupForm.name.trim()}>
              {editingGroup ? t('common.save') : t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('addressBook.import.title')}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto py-4">
            {importStep === 'select' && (
              <div className="space-y-6">
                {/* 파일 선택 영역 */}
                <div
                  onClick={handleSelectFile}
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
                >
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-sm font-medium">{t('addressBook.import.selectFile')}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('addressBook.import.supportedFormats')}
                  </p>
                </div>

                {importError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm">{importError}</span>
                  </div>
                )}

                {/* 템플릿 다운로드 */}
                <div className="border rounded-lg p-4">
                  <h4 className="text-sm font-medium mb-2">
                    {t('addressBook.import.downloadTemplate')}
                  </h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    {t('addressBook.import.templateDesc')}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadTemplate('xlsx')}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Excel (.xlsx)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadTemplate('csv')}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      CSV (.csv)
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {importStep === 'preview' && validationResult && (
              <div className="space-y-4">
                {/* 요약 정보 */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <CheckCircle className="h-6 w-6 mx-auto text-green-600 mb-1" />
                    <div className="text-xl font-bold text-green-700">
                      {validationResult.valid.length}
                    </div>
                    <div className="text-xs text-green-600">
                      {t('addressBook.import.validContacts')}
                    </div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3 text-center">
                    <AlertTriangle className="h-6 w-6 mx-auto text-yellow-600 mb-1" />
                    <div className="text-xl font-bold text-yellow-700">
                      {validationResult.duplicates.length}
                    </div>
                    <div className="text-xs text-yellow-600">
                      {t('addressBook.import.duplicates')}
                    </div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <AlertCircle className="h-6 w-6 mx-auto text-red-600 mb-1" />
                    <div className="text-xl font-bold text-red-700">
                      {validationResult.invalid.length}
                    </div>
                    <div className="text-xs text-red-600">
                      {t('addressBook.import.invalidContacts')}
                    </div>
                  </div>
                </div>

                {/* 중복 처리 옵션 */}
                {validationResult.duplicates.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <h4 className="text-sm font-medium mb-3">
                      {t('addressBook.import.duplicateAction')}
                    </h4>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="duplicateAction"
                          checked={duplicateAction === 'skip'}
                          onChange={() => setDuplicateAction('skip')}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">{t('addressBook.import.skipDuplicates')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="duplicateAction"
                          checked={duplicateAction === 'update'}
                          onChange={() => setDuplicateAction('update')}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">{t('addressBook.import.updateDuplicates')}</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* 미리보기 테이블 */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted px-4 py-2 text-sm font-medium">
                    {t('addressBook.import.preview')} ({importedContacts.length}{' '}
                    {t('addressBook.import.rows')})
                  </div>
                  <div className="max-h-48 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">{t('addressBook.name')}</th>
                          <th className="px-3 py-2 text-left">{t('addressBook.email')}</th>
                          <th className="px-3 py-2 text-left">{t('addressBook.organization')}</th>
                          <th className="px-3 py-2 text-left w-20">
                            {t('addressBook.import.status')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {importedContacts.slice(0, 50).map((contact, idx) => {
                          const isInvalid = validationResult.invalid.some((i) => i.row === idx + 2)
                          const isDuplicate = validationResult.duplicates.some(
                            (d) => d.row === idx + 2
                          )
                          return (
                            <tr key={idx} className="border-t">
                              <td className="px-3 py-2">{contact.name}</td>
                              <td className="px-3 py-2">{contact.email}</td>
                              <td className="px-3 py-2">{contact.organization || '-'}</td>
                              <td className="px-3 py-2">
                                {isInvalid && (
                                  <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">
                                    {t('addressBook.import.invalid')}
                                  </span>
                                )}
                                {isDuplicate && (
                                  <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded">
                                    {t('addressBook.import.duplicate')}
                                  </span>
                                )}
                                {!isInvalid && !isDuplicate && (
                                  <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                                    {t('addressBook.import.valid')}
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 오류 목록 */}
                {validationResult.invalid.length > 0 && (
                  <div className="border border-red-200 rounded-lg overflow-hidden">
                    <div className="bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
                      {t('addressBook.import.errorList')}
                    </div>
                    <div className="max-h-32 overflow-auto p-3 space-y-1">
                      {validationResult.invalid.map((item, idx) => (
                        <div key={idx} className="text-xs text-red-600">
                          {t('addressBook.import.row')} {item.row}: {item.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {importStep === 'result' && importResult && (
              <div className="text-center py-8">
                <CheckCircle className="h-16 w-16 mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-semibold mb-4">{t('addressBook.import.complete')}</h3>
                <div className="space-y-2 text-sm">
                  <p className="text-green-600">
                    {t('addressBook.import.importedCount', { count: importResult.imported })}
                  </p>
                  {importResult.skipped > 0 && (
                    <p className="text-yellow-600">
                      {t('addressBook.import.skippedCount', { count: importResult.skipped })}
                    </p>
                  )}
                  {importResult.failed > 0 && (
                    <p className="text-red-600">
                      {t('addressBook.import.failedCount', { count: importResult.failed })}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {importStep === 'select' && (
              <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
            )}
            {importStep === 'preview' && (
              <>
                <Button variant="outline" onClick={() => setImportStep('select')}>
                  {t('common.back')}
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={
                    isImporting ||
                    (validationResult?.valid.length === 0 &&
                      validationResult?.duplicates.length === 0)
                  }
                >
                  {isImporting
                    ? t('addressBook.import.importing')
                    : t('addressBook.import.startImport')}
                </Button>
              </>
            )}
            {importStep === 'result' && (
              <Button onClick={() => setIsImportDialogOpen(false)}>{t('common.confirm')}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
