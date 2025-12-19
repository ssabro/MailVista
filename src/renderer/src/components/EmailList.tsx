import * as React from 'react'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { List, type RowComponentProps } from 'react-window'
import {
  Star,
  Paperclip,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Mail,
  MailOpen,
  RefreshCw,
  Loader2,
  X,
  Plus,
  ShieldBan,
  ShieldCheck,
  Trash2,
  RotateCcw,
  Eraser,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Trello,
  Reply,
  Forward,
  FolderInput,
  MailCheck,
  MailX
} from 'lucide-react'
import { SenderPopup } from './SenderPopup'
import { TrelloCardModal } from './TrelloCardModal'
import {
  ColumnDef,
  SortingState,
  RowSelectionState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable
} from '@tanstack/react-table'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem } from './ui/select'
import { cn } from '@renderer/lib/utils'

interface EmailAddress {
  name: string
  address: string
}

interface EmailHeader {
  uid: number
  messageId: string
  subject: string
  from: EmailAddress[]
  to: EmailAddress[]
  date: Date
  flags: string[]
  hasAttachment: boolean
}

interface MoveFolder {
  name: string
  path: string
}

type FolderType = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'other'

// 상세 검색 파라미터
export interface DetailedSearchParams {
  sender: string
  recipientType: 'to' | 'to_cc' | 'to_cc_bcc'
  recipient: string
  contentType: 'all' | 'subject' | 'body'
  content: string
  mailbox: string
  periodType: 'all' | '1week' | '1month' | '3months' | '6months' | '1year' | 'custom'
  startDate: string
  endDate: string
  hasAttachment: boolean
  includeTrashSpam: boolean
}

interface EmailListProps {
  accountEmail: string
  folderName?: string
  folderType?: FolderType
  emails?: EmailHeader[]
  totalCount?: number
  isLoading?: boolean
  isSwitchingAccount?: boolean
  currentPage?: number
  emailsPerPage?: number
  /** 분할 보기 모드에서 헤더와 툴바를 숨김 */
  compactMode?: boolean
  onPageChange?: (page: number) => void
  onEmailSelect?: (email: EmailHeader) => void
  onRefresh?: () => void
  onDelete?: (uids: number[]) => Promise<void>
  onPermanentDelete?: (uids: number[]) => Promise<void>
  onMarkRead?: (uids: number[], read: boolean) => Promise<void>
  onToggleStar?: (uid: number, starred: boolean) => Promise<void>
  onReply?: (email: EmailHeader) => void
  onForward?: (emails: EmailHeader[]) => void
  onDetailedSearch?: (params: DetailedSearchParams) => void
  availableFolders?: { name: string; path: string }[]
  // 이동 관련
  moveFolders?: MoveFolder[]
  onMove?: (uids: number[], targetFolder: string) => Promise<void>
  onMoveAndCreateRule?: (uids: number[], targetFolder: string) => Promise<void>
  onCreateMoveFolder?: (folderName: string) => Promise<{ success: boolean; path?: string }>
  // 스팸 등록/해제
  onMarkSpam?: (senderEmails: string[], uids: number[]) => Promise<void>
  onUnmarkSpam?: (senderEmails: string[], uids: number[]) => Promise<void>
  // 복원 (휴지통에서 받은메일함으로)
  onRestore?: (uids: number[]) => Promise<void>
  // 폴더 비우기
  onEmptyFolder?: () => Promise<void>
  // 발신자 팝업 관련
  checkSenderVip?: (email: string) => Promise<boolean>
  onToggleSenderVip?: (email: string, isVip: boolean) => void
  onComposeToSender?: (email: string, name: string) => void
  onAddSenderToContacts?: (data: {
    name: string
    email: string
    groupId: string
    isVip: boolean
  }) => void
  onBlockSender?: (email: string) => void
  onViewConversation?: (email: string) => void
  onSearchBySender?: (email: string) => void
  onSearchByRecipient?: (email: string) => void
  onAutoClassifySender?: (email: string) => void
  onDeleteAllFromSender?: (email: string) => void
  onHighlightSender?: (email: string) => void
  // 상세 검색 다이얼로그 외부 제어 (분할 보기 모드용)
  detailedSearchOpen?: boolean
  onDetailedSearchOpenChange?: (open: boolean) => void
  // 외부 검색 필터 제어 (분할 보기 모드용)
  externalFilter?: string
  onExternalFilterChange?: (filter: string) => void
  // Trello 카드 생성을 위한 이메일 본문 조회 함수
  onGetEmailContent?: (
    uid: number
  ) => Promise<{ subject: string; body: string; from: string; date: string } | null>
}

function formatDate(date: Date): string {
  const emailDate = new Date(date)

  // 년-월-일 시:분:초 형식으로 표시
  const year = emailDate.getFullYear()
  const month = String(emailDate.getMonth() + 1).padStart(2, '0')
  const day = String(emailDate.getDate()).padStart(2, '0')
  const hour = String(emailDate.getHours()).padStart(2, '0')
  const minute = String(emailDate.getMinutes()).padStart(2, '0')
  const second = String(emailDate.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

export const EmailList = React.memo(function EmailList({
  accountEmail,
  folderName = 'Inbox',
  folderType = 'inbox',
  emails = [],
  totalCount = 0,
  isLoading = false,
  isSwitchingAccount = false,
  currentPage = 1,
  emailsPerPage = 50,
  compactMode = false,
  onPageChange,
  onEmailSelect,
  onRefresh,
  onDelete,
  onPermanentDelete,
  onMarkRead,
  onToggleStar,
  onReply,
  onForward,
  onDetailedSearch,
  availableFolders = [],
  moveFolders = [],
  onMove,
  onMoveAndCreateRule,
  onCreateMoveFolder,
  onMarkSpam,
  onUnmarkSpam,
  onRestore,
  onEmptyFolder,
  // 발신자 팝업 관련
  checkSenderVip,
  onToggleSenderVip,
  onComposeToSender,
  onAddSenderToContacts,
  onBlockSender,
  onViewConversation,
  onSearchBySender,
  onSearchByRecipient,
  onAutoClassifySender,
  onDeleteAllFromSender,
  onHighlightSender,
  // 상세 검색 다이얼로그 외부 제어
  detailedSearchOpen,
  onDetailedSearchOpenChange,
  // 외부 검색 필터 제어
  externalFilter,
  onExternalFilterChange,
  // Trello 연동
  onGetEmailContent
}: EmailListProps): React.ReactElement {
  const { t } = useTranslation()
  const [isProcessing, setIsProcessing] = useState(false)
  const [isMovePopoverOpen, setIsMovePopoverOpen] = useState(false)
  const [selectedMoveFolder, setSelectedMoveFolder] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)

  // 컨텍스트 메뉴 상태
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    email: EmailHeader | null
  }>({ visible: false, x: 0, y: 0, email: null })
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // 가상화 리스트를 위한 컨테이너 ref
  const listContainerRef = useRef<HTMLDivElement>(null)
  const [listHeight, setListHeight] = useState(400)

  // Trello 모달 상태
  const [trelloModalOpen, setTrelloModalOpen] = useState(false)
  const [trelloEmailData, setTrelloEmailData] = useState<{
    subject: string
    body: string
    from: string
    date: string
  } | null>(null)

  // 발신자 팝업 상태
  const [senderPopupOpen, setSenderPopupOpen] = useState(false)
  const [senderPopupPosition, setSenderPopupPosition] = useState({ top: 0, left: 0 })
  const [selectedSender, setSelectedSender] = useState<{ email: string; name: string } | null>(null)
  const [selectedSenderVip, setSelectedSenderVip] = useState(false)

  // 상세 검색 다이얼로그 상태 (외부 제어가 있으면 사용, 없으면 내부 상태 사용)
  const [internalDetailedSearchOpen, setInternalDetailedSearchOpen] = useState(false)
  const isDetailedSearchOpen = detailedSearchOpen ?? internalDetailedSearchOpen
  const setIsDetailedSearchOpen = onDetailedSearchOpenChange ?? setInternalDetailedSearchOpen

  // 컨텍스트 메뉴 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu({ visible: false, x: 0, y: 0, email: null })
      }
    }

    if (contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
    return undefined
  }, [contextMenu.visible])

  // 가상화 리스트 높이 측정
  useEffect(() => {
    if (!listContainerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setListHeight(entry.contentRect.height)
      }
    })

    resizeObserver.observe(listContainerRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  const [detailedSearch, setDetailedSearch] = useState<DetailedSearchParams>({
    sender: '',
    recipientType: 'to_cc',
    recipient: '',
    contentType: 'all',
    content: '',
    mailbox: 'all',
    periodType: 'all',
    startDate: '',
    endDate: '',
    hasAttachment: false,
    includeTrashSpam: false
  })

  // TanStack Table 상태
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [internalGlobalFilter, setInternalGlobalFilter] = useState('')

  // 외부 필터가 제공되면 외부 값 사용, 아니면 내부 상태 사용
  const globalFilter = externalFilter ?? internalGlobalFilter
  const setGlobalFilter = onExternalFilterChange ?? setInternalGlobalFilter

  // 선택된 이메일 UID 배열 계산
  const selectedEmails = useMemo(() => {
    return Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((key) => parseInt(key, 10))
  }, [rowSelection])

  // 이메일 목록이 변경되면 존재하지 않는 UID의 선택 상태 정리
  useEffect(() => {
    const currentUids = new Set(emails.map((e) => String(e.uid)))
    const selectedUids = Object.keys(rowSelection).filter((key) => rowSelection[key])

    // 선택된 UID 중 현재 목록에 없는 것이 있는지 확인
    const invalidUids = selectedUids.filter((uid) => !currentUids.has(uid))

    if (invalidUids.length > 0) {
      console.log('[EmailList] Cleaning up invalid selection UIDs:', invalidUids)
      // 유효하지 않은 선택 제거
      setRowSelection((prev) => {
        const newSelection = { ...prev }
        invalidUids.forEach((uid) => delete newSelection[uid])
        return newSelection
      })
    }
  }, [emails, rowSelection])

  // 별표 토글 핸들러
  const handleToggleStarInternal = useCallback(
    async (uid: number, starred: boolean): Promise<void> => {
      if (!onToggleStar) return
      try {
        await onToggleStar(uid, starred)
      } catch (e) {
        console.error('Failed to toggle star:', e)
      }
    },
    [onToggleStar]
  )

  // 발신자 클릭 핸들러
  const handleSenderClick = useCallback(
    async (e: React.MouseEvent, email: string, name: string) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect()
      setSenderPopupPosition({
        top: rect.bottom + 8,
        left: rect.left
      })
      setSelectedSender({ email, name })

      // VIP 여부 확인
      if (checkSenderVip) {
        const isVip = await checkSenderVip(email)
        setSelectedSenderVip(isVip)
      }

      setSenderPopupOpen(true)
    },
    [checkSenderVip]
  )

  // TanStack Table 컬럼 정의
  const columns = useMemo<ColumnDef<EmailHeader>[]>(
    () => [
      {
        id: 'select',
        size: 32,
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllRowsSelected()}
            onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4"
          />
        ),
        enableSorting: false
      },
      {
        id: 'star',
        size: 32,
        header: () => null,
        cell: ({ row }) => {
          const isStarred = row.original.flags.includes('\\Flagged')
          return (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleToggleStarInternal(row.original.uid, !isStarred)
              }}
              className="p-0.5"
            >
              <Star
                className={cn(
                  'h-4 w-4',
                  isStarred
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-muted-foreground hover:text-yellow-400'
                )}
              />
            </button>
          )
        },
        enableSorting: false
      },
      {
        id: 'readStatus',
        size: 32,
        header: () => null,
        cell: ({ row }) => {
          const isRead = row.original.flags.includes('\\Seen')
          return (
            <div className="p-0.5">
              {isRead ? (
                <MailOpen className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Mail className="h-4 w-4 text-blue-500" />
              )}
            </div>
          )
        },
        enableSorting: false
      },
      {
        id: 'sender',
        accessorFn: (row) => row.from[0]?.name || row.from[0]?.address || 'Unknown',
        size: 200,
        header: ({ column }) => (
          <div
            className="flex items-center cursor-pointer select-none hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('email.from')}
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="h-3 w-3 ml-1" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="h-3 w-3 ml-1" />
            ) : (
              <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />
            )}
          </div>
        ),
        cell: ({ getValue, row }) => {
          const senderName = row.original.from[0]?.name || ''
          const senderEmail = row.original.from[0]?.address || ''
          return (
            <button
              className="truncate text-sm text-left hover:text-primary hover:underline w-full"
              onClick={(e) => {
                e.stopPropagation()
                handleSenderClick(e, senderEmail, senderName || senderEmail)
              }}
            >
              {getValue() as string}
            </button>
          )
        },
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.from[0]?.name || rowA.original.from[0]?.address || ''
          const b = rowB.original.from[0]?.name || rowB.original.from[0]?.address || ''
          return a.localeCompare(b, 'ko')
        }
      },
      {
        id: 'subject',
        accessorKey: 'subject',
        header: ({ column }) => (
          <div
            className="flex items-center cursor-pointer select-none hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('email.subject')}
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="h-3 w-3 ml-1" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="h-3 w-3 ml-1" />
            ) : (
              <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />
            )}
          </div>
        ),
        cell: ({ row }) => {
          const isRead = row.original.flags.includes('\\Seen')
          return (
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn('truncate text-sm', !isRead && 'font-medium')}>
                {row.original.subject}
              </span>
            </div>
          )
        },
        sortingFn: (rowA, rowB) => {
          return rowA.original.subject.localeCompare(rowB.original.subject, 'ko')
        }
      },
      {
        id: 'attachment',
        accessorKey: 'hasAttachment',
        size: 36,
        header: () => (
          <div className="flex items-center justify-center" title={t('email.attachment')}>
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        ),
        cell: ({ row }) => (
          <div
            className="flex items-center justify-center"
            title={row.original.hasAttachment ? t('email.hasAttachment') : ''}
          >
            {row.original.hasAttachment && <Paperclip className="h-4 w-4 text-blue-500" />}
          </div>
        ),
        enableSorting: false
      },
      {
        id: 'date',
        accessorKey: 'date',
        size: 160,
        header: ({ column }) => (
          <div
            className="flex items-center cursor-pointer select-none hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('email.date')}
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="h-3 w-3 ml-1" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="h-3 w-3 ml-1" />
            ) : (
              <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />
            )}
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDate(row.original.date)}
          </div>
        ),
        sortingFn: (rowA, rowB) => {
          return new Date(rowA.original.date).getTime() - new Date(rowB.original.date).getTime()
        }
      }
    ],
    [t, handleSenderClick, handleToggleStarInternal]
  )

  // 전역 필터 함수 (보낸사람, 제목에서 검색)
  const globalFilterFn = React.useCallback(
    (row: { original: EmailHeader }, _columnId: string, filterValue: string) => {
      if (!filterValue) return true
      const search = filterValue.toLowerCase()
      const email = row.original
      const sender = (email.from[0]?.name || email.from[0]?.address || '').toLowerCase()
      const subject = email.subject.toLowerCase()
      return sender.includes(search) || subject.includes(search)
    },
    []
  )

  // TanStack Table 인스턴스
  const table = useReactTable({
    data: emails,
    columns,
    state: {
      sorting,
      rowSelection,
      globalFilter
    },
    enableRowSelection: true,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => String(row.uid)
  })

  const handleEmailClick = (email: EmailHeader): void => {
    onEmailSelect?.(email)
  }

  // 선택 초기화 함수
  const clearSelection = (): void => {
    setRowSelection({})
  }

  const handleDelete = async (): Promise<void> => {
    if (selectedEmails.length === 0 || !onDelete) return
    setIsProcessing(true)
    try {
      await onDelete(selectedEmails)
      clearSelection()
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePermanentDelete = async (): Promise<void> => {
    if (selectedEmails.length === 0 || !onPermanentDelete) return
    if (!confirm(t('email.permanentDeleteConfirm', { count: selectedEmails.length }))) return
    setIsProcessing(true)
    try {
      await onPermanentDelete(selectedEmails)
      clearSelection()
    } finally {
      setIsProcessing(false)
    }
  }

  const handleMarkRead = async (read: boolean): Promise<void> => {
    if (selectedEmails.length === 0 || !onMarkRead) return
    setIsProcessing(true)
    try {
      await onMarkRead(selectedEmails, read)
      clearSelection()
    } finally {
      setIsProcessing(false)
    }
  }

  // 이동 관련 핸들러
  const handleMove = async (): Promise<void> => {
    if (!selectedMoveFolder || selectedEmails.length === 0 || !onMove) return
    setIsProcessing(true)
    try {
      await onMove(selectedEmails, selectedMoveFolder)
      clearSelection()
      setIsMovePopoverOpen(false)
      setSelectedMoveFolder(null)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleMoveAndCreateRule = async (): Promise<void> => {
    if (!selectedMoveFolder || selectedEmails.length === 0 || !onMoveAndCreateRule) return
    setIsProcessing(true)
    try {
      await onMoveAndCreateRule(selectedEmails, selectedMoveFolder)
      clearSelection()
      setIsMovePopoverOpen(false)
      setSelectedMoveFolder(null)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCreateFolder = async (): Promise<void> => {
    if (!newFolderName.trim() || !onCreateMoveFolder) return
    setIsCreatingFolder(true)
    try {
      const result = await onCreateMoveFolder(newFolderName.trim())
      if (result.success && result.path) {
        setSelectedMoveFolder(result.path)
        setNewFolderName('')
      }
    } finally {
      setIsCreatingFolder(false)
    }
  }

  // 스팸 등록 핸들러
  const handleMarkSpam = async (): Promise<void> => {
    if (selectedEmails.length === 0 || !onMarkSpam) return

    // 선택된 이메일들의 발신자 주소 추출
    const selectedEmailObjects = emails.filter((e) => selectedEmails.includes(e.uid))
    const senderEmails = [
      ...new Set(selectedEmailObjects.flatMap((e) => e.from.map((f) => f.address)))
    ]

    if (senderEmails.length === 0) return

    setIsProcessing(true)
    try {
      // 발신자 차단 및 메일 스팸함으로 이동
      await onMarkSpam(senderEmails, selectedEmails)
      clearSelection()
    } finally {
      setIsProcessing(false)
    }
  }

  // 스팸 해제 핸들러 (스팸메일함에서 받은메일함으로 이동 + 차단 해제)
  const handleUnmarkSpam = async (): Promise<void> => {
    if (selectedEmails.length === 0 || !onUnmarkSpam) return

    // 선택된 이메일들의 발신자 주소 추출
    const selectedEmailObjects = emails.filter((e) => selectedEmails.includes(e.uid))
    const senderEmails = [
      ...new Set(selectedEmailObjects.flatMap((e) => e.from.map((f) => f.address)))
    ]

    setIsProcessing(true)
    try {
      await onUnmarkSpam(senderEmails, selectedEmails)
      clearSelection()
    } finally {
      setIsProcessing(false)
    }
  }

  // 복원 핸들러 (휴지통에서 받은메일함으로 이동)
  const handleRestore = async (): Promise<void> => {
    if (selectedEmails.length === 0 || !onRestore) return

    setIsProcessing(true)
    try {
      await onRestore(selectedEmails)
      clearSelection()
    } finally {
      setIsProcessing(false)
    }
  }

  // 컨텍스트 메뉴 핸들러
  const handleContextMenu = useCallback((e: React.MouseEvent, email: EmailHeader): void => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      email
    })
  }, [])

  const closeContextMenu = useCallback((): void => {
    setContextMenu({ visible: false, x: 0, y: 0, email: null })
  }, [])

  // Trello 카드 생성 핸들러
  const handleCreateTrelloCard = useCallback(
    async (email: EmailHeader): Promise<void> => {
      closeContextMenu()

      if (onGetEmailContent) {
        // 이메일 본문 조회
        const content = await onGetEmailContent(email.uid)
        if (content) {
          setTrelloEmailData(content)
        } else {
          // 본문 조회 실패 시 헤더 정보만 사용
          setTrelloEmailData({
            subject: email.subject,
            body: '',
            from: email.from[0]?.name
              ? `${email.from[0].name} <${email.from[0].address}>`
              : email.from[0]?.address || '',
            date: formatDate(email.date)
          })
        }
      } else {
        // onGetEmailContent가 없으면 헤더 정보만 사용
        setTrelloEmailData({
          subject: email.subject,
          body: '',
          from: email.from[0]?.name
            ? `${email.from[0].name} <${email.from[0].address}>`
            : email.from[0]?.address || '',
          date: formatDate(email.date)
        })
      }

      setTrelloModalOpen(true)
    },
    [onGetEmailContent, closeContextMenu]
  )

  // 컨텍스트 메뉴 액션들
  const contextMenuActions = useMemo(() => {
    if (!contextMenu.email) return null

    const email = contextMenu.email
    const isRead = email.flags.includes('\\Seen')
    const isStarred = email.flags.includes('\\Flagged')

    return {
      email,
      isRead,
      isStarred
    }
  }, [contextMenu.email])

  // 폴더 비우기 핸들러
  // 폴더 비우기 핸들러
  const handleEmptyFolder = async (): Promise<void> => {
    if (!onEmptyFolder) return
    const folderLabel = folderType === 'spam' ? t('sidebar.spam') : t('sidebar.trash')
    if (!confirm(t('email.emptyFolderConfirm', { folder: folderLabel }))) return

    setIsProcessing(true)
    try {
      await onEmptyFolder()
      clearSelection()
    } finally {
      setIsProcessing(false)
    }
  }

  // 상세 검색 핸들러
  // 상세 검색 핸들러
  const handleDetailedSearch = (): void => {
    // 검색 조건이 입력되었는지 확인
    const hasCondition =
      detailedSearch.sender.trim() ||
      detailedSearch.recipient.trim() ||
      detailedSearch.content.trim() ||
      detailedSearch.startDate ||
      detailedSearch.endDate ||
      detailedSearch.hasAttachment ||
      detailedSearch.includeTrashSpam ||
      detailedSearch.mailbox !== 'all' ||
      detailedSearch.periodType !== 'all'

    if (!hasCondition) {
      // TODO: 토스트 메시지 등으로 사용자에게 알림 (현재는 alert 사용)
      alert(t('search.emptySearchWarning'))
      return
    }

    onDetailedSearch?.(detailedSearch)
    setIsDetailedSearchOpen(false)
  }

  // 상세 검색 초기화
  // 상세 검색 초기화
  const resetDetailedSearch = (): void => {
    setDetailedSearch({
      sender: '',
      recipientType: 'to_cc',
      recipient: '',
      contentType: 'all',
      content: '',
      mailbox: 'all',
      periodType: 'all',
      startDate: '',
      endDate: '',
      hasAttachment: false,
      includeTrashSpam: false
    })
  }

  // 페이지네이션 계산
  const totalPages = Math.ceil(totalCount / emailsPerPage)
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

  return (
    <div className="flex flex-1 flex-col bg-background">
      {/* Header with title and search */}
      {!compactMode && (
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{folderName}</h1>
            <span className="text-primary font-medium">
              {selectedEmails.length > 0 ? selectedEmails.length : 0}
            </span>
            <span className="text-muted-foreground">
              /{' '}
              {globalFilter
                ? `${table.getFilteredRowModel().rows.length} (${totalCount})`
                : totalCount}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 ml-2"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder={t('common.searchPlaceholder')}
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className={cn(
                  'w-[200px] h-9 px-3 pr-16 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
                  globalFilter && 'border-primary'
                )}
              />
              {globalFilter ? (
                <button
                  type="button"
                  onClick={() => setGlobalFilter('')}
                  className="absolute right-8 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              ) : null}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
                <Search className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1"
              onClick={() => setIsDetailedSearchOpen(true)}
            >
              {t('search.detailed')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* 상세 검색 다이얼로그 */}
      <Dialog open={isDetailedSearchOpen} onOpenChange={setIsDetailedSearchOpen} modal={false}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('search.detailed')}</DialogTitle>
            <DialogDescription>
              {t('search.detailedDesc', 'Enter search criteria to filter emails.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* 보낸사람 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('email.from')}</label>
              <input
                type="text"
                value={detailedSearch.sender}
                onChange={(e) => setDetailedSearch({ ...detailedSearch, sender: e.target.value })}
                placeholder={t('search.senderPlaceholder')}
                className="w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            {/* 받는사람 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('email.to')}</label>
              <div className="flex gap-2">
                <Select
                  value={detailedSearch.recipientType}
                  onValueChange={(value) =>
                    setDetailedSearch({
                      ...detailedSearch,
                      recipientType: value as 'to' | 'to_cc' | 'to_cc_bcc'
                    })
                  }
                >
                  <SelectTrigger className="w-[160px]">
                    <span>
                      {detailedSearch.recipientType === 'to' && t('email.to')}
                      {detailedSearch.recipientType === 'to_cc' &&
                        `${t('email.to')} + ${t('compose.cc')}`}
                      {detailedSearch.recipientType === 'to_cc_bcc' && t('search.periodAll')}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="to">{t('email.to')}</SelectItem>
                    <SelectItem value="to_cc">
                      {t('email.to')} + {t('compose.cc')}
                    </SelectItem>
                    <SelectItem value="to_cc_bcc">{t('search.periodAll')}</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  type="text"
                  value={detailedSearch.recipient}
                  onChange={(e) =>
                    setDetailedSearch({ ...detailedSearch, recipient: e.target.value })
                  }
                  placeholder={t('search.recipientPlaceholder')}
                  className="flex-1 h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>

            {/* 내용 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('search.contentPlaceholder')}</label>
              <div className="flex gap-2">
                <Select
                  value={detailedSearch.contentType}
                  onValueChange={(value) =>
                    setDetailedSearch({
                      ...detailedSearch,
                      contentType: value as 'all' | 'subject' | 'body'
                    })
                  }
                >
                  <SelectTrigger className="w-[160px]">
                    <span>
                      {detailedSearch.contentType === 'all' && t('search.periodAll')}
                      {detailedSearch.contentType === 'subject' && t('email.subject')}
                      {detailedSearch.contentType === 'body' && t('compose.body')}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('search.periodAll')}</SelectItem>
                    <SelectItem value="subject">{t('email.subject')}</SelectItem>
                    <SelectItem value="body">{t('compose.body')}</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  type="text"
                  value={detailedSearch.content}
                  onChange={(e) =>
                    setDetailedSearch({ ...detailedSearch, content: e.target.value })
                  }
                  placeholder={t('search.contentPlaceholder')}
                  className="flex-1 h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>

            {/* 메일함 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('search.mailbox')}</label>
              <Select
                value={detailedSearch.mailbox}
                onValueChange={(value) => setDetailedSearch({ ...detailedSearch, mailbox: value })}
              >
                <SelectTrigger className="w-full">
                  <span>
                    {detailedSearch.mailbox === 'all'
                      ? t('search.periodAll')
                      : availableFolders.find((f) => f.path === detailedSearch.mailbox)?.name ||
                        detailedSearch.mailbox}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('search.periodAll')}</SelectItem>
                  {availableFolders.map((folder) => (
                    <SelectItem key={folder.path} value={folder.path}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 기간 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('search.period')}</label>
              <div className="flex gap-2">
                <Select
                  value={detailedSearch.periodType}
                  onValueChange={(value) => {
                    setDetailedSearch({
                      ...detailedSearch,
                      periodType: value as DetailedSearchParams['periodType']
                    })
                    if (value !== 'custom') {
                      setDetailedSearch((prev) => ({ ...prev, startDate: '', endDate: '' }))
                    }
                  }}
                >
                  <SelectTrigger className="w-[100px]">
                    <span>
                      {detailedSearch.periodType === 'all' && t('search.periodAll')}
                      {detailedSearch.periodType === '1week' && t('search.period1Week')}
                      {detailedSearch.periodType === '1month' && t('search.period1Month')}
                      {detailedSearch.periodType === '3months' && t('search.period3Months')}
                      {detailedSearch.periodType === '6months' && t('search.period6Months')}
                      {detailedSearch.periodType === '1year' && t('search.period1Year')}
                      {detailedSearch.periodType === 'custom' && t('search.periodCustom')}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('search.periodAll')}</SelectItem>
                    <SelectItem value="1week">{t('search.period1Week')}</SelectItem>
                    <SelectItem value="1month">{t('search.period1Month')}</SelectItem>
                    <SelectItem value="3months">{t('search.period3Months')}</SelectItem>
                    <SelectItem value="6months">{t('search.period6Months')}</SelectItem>
                    <SelectItem value="1year">{t('search.period1Year')}</SelectItem>
                    <SelectItem value="custom">{t('search.periodCustom')}</SelectItem>
                  </SelectContent>
                </Select>
                {detailedSearch.periodType === 'custom' && (
                  <div className="flex items-center gap-2 flex-1">
                    <div className="relative flex-1">
                      <input
                        type="date"
                        value={detailedSearch.startDate}
                        onChange={(e) =>
                          setDetailedSearch({ ...detailedSearch, startDate: e.target.value })
                        }
                        className="w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                    <span className="text-muted-foreground">~</span>
                    <div className="relative flex-1">
                      <input
                        type="date"
                        value={detailedSearch.endDate}
                        onChange={(e) =>
                          setDetailedSearch({ ...detailedSearch, endDate: e.target.value })
                        }
                        className="w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 체크박스 옵션 */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={detailedSearch.hasAttachment}
                  onCheckedChange={(checked) =>
                    setDetailedSearch({ ...detailedSearch, hasAttachment: !!checked })
                  }
                />
                <span className="text-sm">{t('search.hasAttachment')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={detailedSearch.includeTrashSpam}
                  onCheckedChange={(checked) =>
                    setDetailedSearch({ ...detailedSearch, includeTrashSpam: !!checked })
                  }
                />
                <span className="text-sm">{t('search.includeTrashSpam')}</span>
              </label>
            </div>

            {/* 버튼 */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetDetailedSearch}>
                {t('common.reset')}
              </Button>
              <Button onClick={handleDetailedSearch}>
                <Search className="h-4 w-4 mr-1" />
                {t('common.search')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toolbar */}
      {!compactMode && (
        <div className="flex items-center gap-1 px-4 py-2 border-b bg-muted/30 text-sm">
          {/* 스팸메일함: 읽음, 영구삭제, 스팸해제, 비우기 */}
          {folderType === 'spam' ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleMarkRead(true)}
                disabled={selectedEmails.length === 0 || isProcessing}
              >
                {t('email.markAsRead')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 flex items-center gap-1"
                onClick={handlePermanentDelete}
                disabled={selectedEmails.length === 0 || isProcessing}
              >
                <Trash2 className="h-3 w-3" />
                {t('email.permanentDelete')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs flex items-center gap-1"
                onClick={handleUnmarkSpam}
                disabled={selectedEmails.length === 0 || isProcessing}
              >
                <ShieldCheck className="h-3 w-3" />
                {t('email.unmarkSpam')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs flex items-center gap-1 text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                onClick={handleEmptyFolder}
                disabled={totalCount === 0 || isProcessing}
              >
                <Eraser className="h-3 w-3" />
                {t('email.emptyTrash')}
              </Button>
            </>
          ) : folderType === 'trash' ? (
            /* 휴지통: 읽음, 영구삭제, 복원, 비우기 */
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleMarkRead(true)}
                disabled={selectedEmails.length === 0 || isProcessing}
              >
                {t('email.markAsRead')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 flex items-center gap-1"
                onClick={handlePermanentDelete}
                disabled={selectedEmails.length === 0 || isProcessing}
              >
                <Trash2 className="h-3 w-3" />
                {t('email.permanentDelete')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs flex items-center gap-1"
                onClick={handleRestore}
                disabled={selectedEmails.length === 0 || isProcessing}
              >
                <RotateCcw className="h-3 w-3" />
                {t('email.restore')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs flex items-center gap-1 text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                onClick={handleEmptyFolder}
                disabled={totalCount === 0 || isProcessing}
              >
                <Eraser className="h-3 w-3" />
                {t('email.emptyTrash')}
              </Button>
            </>
          ) : (
            /* 일반 폴더: 기존 메뉴 */
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleMarkRead(true)}
                disabled={selectedEmails.length === 0 || isProcessing}
              >
                {t('email.markAsRead')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleMarkRead(false)}
                disabled={selectedEmails.length === 0 || isProcessing}
              >
                {t('email.markAsUnread')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={handleDelete}
                disabled={selectedEmails.length === 0 || isProcessing}
              >
                {t('common.delete')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs flex items-center gap-1"
                onClick={handleMarkSpam}
                disabled={selectedEmails.length === 0 || isProcessing}
              >
                <ShieldBan className="h-3 w-3" />
                {t('email.markAsSpam')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  if (selectedEmails.length === 1) {
                    const email = emails.find((e) => e.uid === selectedEmails[0])
                    if (email) onReply?.(email)
                  }
                }}
                disabled={selectedEmails.length !== 1 || isProcessing}
              >
                {t('compose.replyTitle')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  const selectedEmailObjects = emails.filter((e) => selectedEmails.includes(e.uid))
                  if (selectedEmailObjects.length > 0) onForward?.(selectedEmailObjects)
                }}
                disabled={selectedEmails.length === 0 || isProcessing}
              >
                {t('compose.forwardTitle')}
              </Button>
              <Popover open={isMovePopoverOpen} onOpenChange={setIsMovePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs flex items-center gap-1"
                    disabled={selectedEmails.length === 0 || isProcessing}
                  >
                    {t('email.move')}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                  <div className="p-2 border-b">
                    <p className="text-sm font-medium">{t('email.selectMoveFolder')}</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {moveFolders.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        {t('email.noSubFolders')}
                      </div>
                    ) : (
                      moveFolders.map((folder) => (
                        <div
                          key={folder.path}
                          onClick={() => setSelectedMoveFolder(folder.path)}
                          className={cn(
                            'px-3 py-2 text-sm cursor-pointer hover:bg-muted/50',
                            selectedMoveFolder === folder.path && 'bg-primary/10 text-primary'
                          )}
                        >
                          {folder.name}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-2 border-t">
                    <div className="flex items-center gap-1 mb-2">
                      <input
                        type="text"
                        placeholder={t('email.newFolderName')}
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        className="flex-1 h-7 px-2 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleCreateFolder()
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={handleCreateFolder}
                        disabled={!newFolderName.trim() || isCreatingFolder}
                      >
                        {isCreatingFolder ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1 h-7 text-xs"
                        onClick={handleMove}
                        disabled={!selectedMoveFolder || isProcessing}
                      >
                        {t('email.move')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-7 text-xs"
                        onClick={handleMoveAndCreateRule}
                        disabled={!selectedMoveFolder || isProcessing}
                      >
                        {t('email.continueMove')}
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}
          <div className="flex-1" />
          {isProcessing && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">{t('email.processing')}</span>
            </div>
          )}
        </div>
      )}

      {/* TanStack Table */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Column Headers */}
        <div className="border-b bg-muted/50">
          {table.getHeaderGroups().map((headerGroup) => (
            <div key={headerGroup.id} className="flex items-center gap-2 px-3 py-2">
              {headerGroup.headers.map((header) => (
                <div
                  key={header.id}
                  style={{
                    width: header.column.columnDef.size,
                    minWidth: header.column.columnDef.size
                  }}
                  className={cn(
                    'text-xs font-medium text-muted-foreground',
                    header.id === 'subject' && 'flex-1',
                    (header.id === 'select' || header.id === 'star') &&
                      'flex items-center justify-center'
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Email list - Virtualized */}
        <div className="flex-1 overflow-hidden" ref={listContainerRef}>
          {isSwitchingAccount ? (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <span className="text-muted-foreground text-center">
                {t('email.switchingAccount')}
              </span>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">{t('email.loadingEmails')}</span>
            </div>
          ) : table.getRowModel().rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Mail className="h-12 w-12 mb-4" />
              <p>{t('email.noEmails')}</p>
            </div>
          ) : (
            <List
              style={{ height: listHeight, width: '100%' }}
              rowCount={table.getRowModel().rows.length}
              rowHeight={44}
              overscanCount={5}
              rowProps={{
                rows: table.getRowModel().rows,
                selectedEmails,
                handleContextMenu,
                handleEmailClick
              }}
              rowComponent={({
                index,
                style,
                rows,
                selectedEmails: selEmails,
                handleContextMenu: ctxMenu,
                handleEmailClick: emailClick
              }: RowComponentProps<{
                rows: ReturnType<typeof table.getRowModel>['rows']
                selectedEmails: number[]
                handleContextMenu: (e: React.MouseEvent, email: EmailHeader) => void
                handleEmailClick: (email: EmailHeader) => void
              }>) => {
                const row = rows[index]
                const isRead = row.original.flags.includes('\\Seen')
                return (
                  <div
                    style={style}
                    key={row.id}
                    draggable
                    onDragStart={(e) => {
                      const uidsToMove =
                        selEmails.length > 0 && selEmails.includes(row.original.uid)
                          ? selEmails
                          : [row.original.uid]
                      e.dataTransfer.setData('application/x-email-uids', JSON.stringify(uidsToMove))
                      e.dataTransfer.effectAllowed = 'move'
                      const dragGhost = document.createElement('div')
                      dragGhost.className =
                        'bg-primary text-primary-foreground px-3 py-1 rounded text-sm shadow-lg'
                      dragGhost.textContent = `${uidsToMove.length}개 메일 이동`
                      dragGhost.style.position = 'absolute'
                      dragGhost.style.top = '-1000px'
                      document.body.appendChild(dragGhost)
                      e.dataTransfer.setDragImage(dragGhost, 0, 0)
                      setTimeout(() => document.body.removeChild(dragGhost), 0)
                    }}
                    onContextMenu={(e) => ctxMenu(e, row.original)}
                    className={cn(
                      'flex items-center gap-2 px-3 border-b hover:bg-muted/50 group',
                      !isRead && 'bg-blue-50/50',
                      row.getIsSelected() && 'bg-primary/5'
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <div
                        key={cell.id}
                        style={{
                          width: cell.column.columnDef.size,
                          minWidth: cell.column.columnDef.size
                        }}
                        className={cn(
                          cell.column.id === 'subject' && 'flex-1 min-w-0 cursor-pointer',
                          (cell.column.id === 'select' || cell.column.id === 'star') &&
                            'flex items-center justify-center'
                        )}
                        onClick={
                          cell.column.id === 'subject' ? () => emailClick(row.original) : undefined
                        }
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                )
              }}
            />
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 0 && (
        <div className="flex items-center justify-center gap-1 py-3 border-t">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange?.(1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            <ChevronLeft className="h-4 w-4 -ml-2" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange?.(currentPage - 1)}
            disabled={currentPage === 1}
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
              onClick={() => onPageChange?.(page)}
            >
              {page}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange?.(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange?.(totalPages)}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
            <ChevronRight className="h-4 w-4 -ml-2" />
          </Button>
        </div>
      )}

      {/* Sender Popup */}
      {selectedSender && (
        <SenderPopup
          accountEmail={accountEmail}
          isOpen={senderPopupOpen}
          senderName={selectedSender.name}
          senderEmail={selectedSender.email}
          isVip={selectedSenderVip}
          anchorPosition={senderPopupPosition}
          onClose={() => setSenderPopupOpen(false)}
          onToggleVip={(isVip) => {
            setSelectedSenderVip(isVip)
            onToggleSenderVip?.(selectedSender.email, isVip)
          }}
          onCompose={() => {
            onComposeToSender?.(selectedSender.email, selectedSender.name)
            setSenderPopupOpen(false)
          }}
          onAddToContacts={(data) => {
            onAddSenderToContacts?.(data)
          }}
          onBlock={() => {
            onBlockSender?.(selectedSender.email)
            setSenderPopupOpen(false)
          }}
          onViewConversation={() => {
            onViewConversation?.(selectedSender.email)
            setSenderPopupOpen(false)
          }}
          onSearchBySender={() => {
            onSearchBySender?.(selectedSender.email)
            setSenderPopupOpen(false)
          }}
          onSearchByRecipient={() => {
            onSearchByRecipient?.(selectedSender.email)
            setSenderPopupOpen(false)
          }}
          onAutoClassify={() => {
            onAutoClassifySender?.(selectedSender.email)
            setSenderPopupOpen(false)
          }}
          onDeleteAllFromSender={() => {
            onDeleteAllFromSender?.(selectedSender.email)
            setSenderPopupOpen(false)
          }}
          onHighlightSender={() => {
            onHighlightSender?.(selectedSender.email)
            setSenderPopupOpen(false)
          }}
        />
      )}

      {/* Context Menu */}
      {contextMenu.visible && contextMenuActions && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[180px] bg-popover border rounded-md shadow-lg py-1"
          style={{
            left: contextMenu.x,
            top: contextMenu.y
          }}
        >
          {/* 읽음/안읽음 표시 */}
          <button
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
            onClick={async () => {
              if (onMarkRead) {
                await onMarkRead([contextMenuActions.email.uid], !contextMenuActions.isRead)
              }
              closeContextMenu()
            }}
          >
            {contextMenuActions.isRead ? (
              <>
                <MailX className="h-4 w-4" />
                {t('contextMenu.markAsUnread')}
              </>
            ) : (
              <>
                <MailCheck className="h-4 w-4" />
                {t('contextMenu.markAsRead')}
              </>
            )}
          </button>

          {/* 별표 토글 */}
          <button
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
            onClick={() => {
              handleToggleStarInternal(contextMenuActions.email.uid, !contextMenuActions.isStarred)
              closeContextMenu()
            }}
          >
            <Star
              className={cn(
                'h-4 w-4',
                contextMenuActions.isStarred && 'fill-yellow-400 text-yellow-400'
              )}
            />
            {contextMenuActions.isStarred ? t('contextMenu.removeStar') : t('contextMenu.addStar')}
          </button>

          <div className="h-px bg-border my-1" />

          {/* 답장 */}
          {onReply && (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
              onClick={() => {
                onReply(contextMenuActions.email)
                closeContextMenu()
              }}
            >
              <Reply className="h-4 w-4" />
              {t('compose.replyTitle')}
            </button>
          )}

          {/* 전달 */}
          {onForward && (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
              onClick={() => {
                onForward([contextMenuActions.email])
                closeContextMenu()
              }}
            >
              <Forward className="h-4 w-4" />
              {t('compose.forwardTitle')}
            </button>
          )}

          <div className="h-px bg-border my-1" />

          {/* Trello 카드 생성 */}
          <button
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
            onClick={() => handleCreateTrelloCard(contextMenuActions.email)}
          >
            <Trello className="h-4 w-4" />
            {t('contextMenu.createTrelloCard')}
          </button>

          <div className="h-px bg-border my-1" />

          {/* 이동 */}
          {onMove && moveFolders.length > 0 && (
            <div className="relative group">
              <button className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2 justify-between">
                <span className="flex items-center gap-2">
                  <FolderInput className="h-4 w-4" />
                  {t('email.move')}
                </span>
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="absolute left-full top-0 hidden group-hover:block min-w-[150px] bg-popover border rounded-md shadow-lg py-1 ml-1">
                {moveFolders.map((folder) => (
                  <button
                    key={folder.path}
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted"
                    onClick={async () => {
                      await onMove([contextMenuActions.email.uid], folder.path)
                      closeContextMenu()
                    }}
                  >
                    {folder.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 스팸 등록 */}
          {onMarkSpam && folderType !== 'spam' && (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
              onClick={async () => {
                const senderEmail = contextMenuActions.email.from[0]?.address
                if (senderEmail) {
                  await onMarkSpam([senderEmail], [contextMenuActions.email.uid])
                }
                closeContextMenu()
              }}
            >
              <ShieldBan className="h-4 w-4" />
              {t('email.markAsSpam')}
            </button>
          )}

          {/* 삭제 */}
          {onDelete && folderType !== 'trash' && (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2 text-red-500"
              onClick={async () => {
                await onDelete([contextMenuActions.email.uid])
                closeContextMenu()
              }}
            >
              <Trash2 className="h-4 w-4" />
              {t('email.delete')}
            </button>
          )}

          {/* 영구 삭제 (휴지통/스팸) */}
          {onPermanentDelete && (folderType === 'trash' || folderType === 'spam') && (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2 text-red-500"
              onClick={async () => {
                if (confirm(t('email.permanentDeleteSingleConfirm'))) {
                  await onPermanentDelete([contextMenuActions.email.uid])
                }
                closeContextMenu()
              }}
            >
              <Trash2 className="h-4 w-4" />
              {t('email.permanentDelete')}
            </button>
          )}

          {/* 복원 (휴지통) */}
          {onRestore && folderType === 'trash' && (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
              onClick={async () => {
                await onRestore([contextMenuActions.email.uid])
                closeContextMenu()
              }}
            >
              <RotateCcw className="h-4 w-4" />
              {t('email.restore')}
            </button>
          )}
        </div>
      )}

      {/* Trello Card Modal */}
      <TrelloCardModal
        isOpen={trelloModalOpen}
        onClose={() => {
          setTrelloModalOpen(false)
          setTrelloEmailData(null)
        }}
        accountEmail={accountEmail}
        emailData={trelloEmailData}
      />
    </div>
  )
})
