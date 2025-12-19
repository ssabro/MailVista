import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Mail,
  Send,
  FileText,
  Archive,
  Settings,
  Inbox,
  Trash2,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Folder,
  Clock,
  Plus,
  Pencil,
  Check,
  X
} from 'lucide-react'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Separator } from './ui/separator'
import { Badge } from './ui/badge'
import { cn } from '@renderer/lib/utils'
import { DeleteFolderDialog } from './DeleteFolderDialog'

interface SubFolder {
  name: string
  path: string
  unseen?: number
}

interface FolderItemProps {
  icon: React.ReactNode
  label: string
  count?: number
  isActive?: boolean
  onClick?: () => void
  onCountClick?: () => void // 안읽은 메일 수 클릭 핸들러
  // 드래그 앤 드롭
  folderPath?: string
  isDragOver?: boolean
  onDragOver?: (e: React.DragEvent, folder: string) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent, folder: string) => void
}

function FolderItem({
  icon,
  label,
  count,
  isActive,
  onClick,
  onCountClick,
  folderPath,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop
}: FolderItemProps) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onClick}
      onDragOver={folderPath && onDragOver ? (e) => onDragOver(e, folderPath) : undefined}
      onDragLeave={folderPath && onDragLeave ? onDragLeave : undefined}
      onDrop={folderPath && onDrop ? (e) => onDrop(e, folderPath) : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'hover:bg-muted text-muted-foreground hover:text-foreground',
        isDragOver && 'ring-2 ring-primary bg-primary/10'
      )}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <Badge
          variant={isActive ? 'secondary' : 'default'}
          className={cn(
            'h-5 min-w-[20px] justify-center px-1.5 text-xs cursor-pointer',
            isActive && 'bg-white/20 text-primary-foreground',
            onCountClick && 'hover:ring-2 hover:ring-offset-1 hover:ring-primary/50'
          )}
          onClick={(e) => {
            if (onCountClick) {
              e.stopPropagation()
              onCountClick()
            }
          }}
          title={onCountClick ? t('sidebar.unreadOnly') : undefined}
        >
          {count}
        </Badge>
      )}
    </button>
  )
}

interface ExpandableFolderProps {
  icon: React.ReactNode
  label: string
  count?: number
  isActive?: boolean
  activeFolder: string
  subFolders?: SubFolder[]
  onClick?: () => void
  onCountClick?: () => void // 안읽은 메일 수 클릭 핸들러
  onSubFolderClick?: (path: string) => void
  onSubFolderCountClick?: (path: string) => void // 하위 폴더 안읽은 메일 수 클릭
  // 드래그 앤 드롭
  folderPath?: string
  dragOverFolder?: string | null
  onDragOver?: (e: React.DragEvent, folder: string) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent, folder: string) => void
}

function ExpandableFolder({
  icon,
  label,
  count,
  isActive,
  activeFolder,
  subFolders = [],
  onClick,
  onCountClick,
  onSubFolderClick,
  onSubFolderCountClick,
  folderPath,
  dragOverFolder,
  onDragOver,
  onDragLeave,
  onDrop
}: ExpandableFolderProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = React.useState(false)
  const hasSubFolders = subFolders.length > 0

  // 하위 폴더가 있으면 자동 확장
  React.useEffect(() => {
    if (hasSubFolders) {
      setIsExpanded(true)
    }
  }, [hasSubFolders])

  // 하위 폴더가 없을 때는 FolderItem과 같은 스타일로 표시
  if (!hasSubFolders) {
    return (
      <button
        onClick={onClick}
        onDragOver={folderPath && onDragOver ? (e) => onDragOver(e, folderPath) : undefined}
        onDragLeave={folderPath && onDragLeave ? onDragLeave : undefined}
        onDrop={folderPath && onDrop ? (e) => onDrop(e, folderPath) : undefined}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-muted text-muted-foreground hover:text-foreground',
          dragOverFolder === folderPath && 'ring-2 ring-primary bg-primary/10'
        )}
      >
        {icon}
        <span className="flex-1 text-left">{label}</span>
        {count !== undefined && count > 0 && (
          <Badge
            variant={isActive ? 'secondary' : 'default'}
            className={cn(
              'h-5 min-w-[20px] justify-center px-1.5 text-xs cursor-pointer',
              isActive && 'bg-white/20 text-primary-foreground',
              onCountClick && 'hover:ring-2 hover:ring-offset-1 hover:ring-primary/50'
            )}
            onClick={(e) => {
              if (onCountClick) {
                e.stopPropagation()
                onCountClick()
              }
            }}
            title={onCountClick ? t('sidebar.unreadOnly') : undefined}
          >
            {count}
          </Badge>
        )}
      </button>
    )
  }

  return (
    <div>
      <div className="flex items-center">
        <button onClick={() => setIsExpanded(!isExpanded)} className="p-1 hover:bg-muted rounded">
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={onClick}
          onDragOver={folderPath && onDragOver ? (e) => onDragOver(e, folderPath) : undefined}
          onDragLeave={folderPath && onDragLeave ? onDragLeave : undefined}
          onDrop={folderPath && onDrop ? (e) => onDrop(e, folderPath) : undefined}
          className={cn(
            'flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted text-muted-foreground hover:text-foreground',
            dragOverFolder === folderPath && 'ring-2 ring-primary bg-primary/10'
          )}
        >
          {icon}
          <span className="flex-1 text-left">{label}</span>
          {count !== undefined && count > 0 && (
            <Badge
              variant={isActive ? 'secondary' : 'default'}
              className={cn(
                'h-5 min-w-[20px] justify-center px-1.5 text-xs cursor-pointer',
                isActive && 'bg-white/20 text-primary-foreground',
                onCountClick && 'hover:ring-2 hover:ring-offset-1 hover:ring-primary/50'
              )}
              onClick={(e) => {
                if (onCountClick) {
                  e.stopPropagation()
                  onCountClick()
                }
              }}
              title={onCountClick ? t('sidebar.unreadOnly') : undefined}
            >
              {count}
            </Badge>
          )}
        </button>
      </div>
      {isExpanded && (
        <div className="ml-5 border-l pl-2 mt-1">
          {subFolders.map((subFolder) => (
            <button
              key={subFolder.path}
              onClick={() => onSubFolderClick?.(subFolder.path)}
              onDragOver={onDragOver ? (e) => onDragOver(e, subFolder.path) : undefined}
              onDragLeave={onDragLeave}
              onDrop={onDrop ? (e) => onDrop(e, subFolder.path) : undefined}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                activeFolder === subFolder.path
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground',
                dragOverFolder === subFolder.path && 'ring-2 ring-primary bg-primary/10'
              )}
            >
              <Folder className="h-3 w-3 flex-shrink-0" />
              <span className="text-left truncate flex-1">{subFolder.name}</span>
              {subFolder.unseen !== undefined && subFolder.unseen > 0 && (
                <Badge
                  variant={activeFolder === subFolder.path ? 'secondary' : 'default'}
                  className={cn(
                    'h-4 min-w-[16px] justify-center px-1 text-[10px] cursor-pointer',
                    activeFolder === subFolder.path && 'bg-white/20 text-primary-foreground',
                    onSubFolderCountClick &&
                      'hover:ring-2 hover:ring-offset-1 hover:ring-primary/50'
                  )}
                  onClick={(e) => {
                    if (onSubFolderCountClick) {
                      e.stopPropagation()
                      onSubFolderCountClick(subFolder.path)
                    }
                  }}
                  title={onSubFolderCountClick ? t('sidebar.unreadOnly') : undefined}
                >
                  {subFolder.unseen}
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface FolderCounts {
  [key: string]: { total: number; unseen: number }
}

interface SidebarProps {
  onCompose?: () => void
  onComposeToSelf?: () => void
  onFolderSelect?: (folder: string) => void
  onUnreadCountClick?: (folder: string) => void // 안읽은 메일 수 클릭 핸들러
  folderCounts?: FolderCounts
  inboxSubFolders?: SubFolder[]
  sentSubFolders?: SubFolder[]
  customFolders?: SubFolder[]
  onCreateCustomFolder?: (folderName: string) => Promise<{ success: boolean; error?: string }>
  onRenameCustomFolder?: (
    oldPath: string,
    newName: string
  ) => Promise<{ success: boolean; error?: string }>
  onDeleteCustomFolder?: (
    folderPath: string,
    options?: {
      confirmFiltersDelete?: boolean
      confirmEmailsDelete?: boolean
      moveEmailsTo?: string
    }
  ) => Promise<{
    success: boolean
    error?: string
    hasFilters?: boolean
    filtersCount?: number
    hasEmails?: boolean
    emailsCount?: number
  }>
  onSettingsSelect?: (settingsKey: string) => void
  // 드래그 앤 드롭 이동
  onDropEmails?: (uids: number[], targetFolder: string) => Promise<void>
}

export const Sidebar = React.memo(function Sidebar({
  onCompose,
  onComposeToSelf,
  onFolderSelect,
  onUnreadCountClick,
  folderCounts = {},
  inboxSubFolders = [],
  sentSubFolders = [],
  customFolders = [],
  onCreateCustomFolder,
  onRenameCustomFolder,
  onDeleteCustomFolder,
  onSettingsSelect,
  onDropEmails
}: SidebarProps) {
  const { t } = useTranslation()
  const [activeFolder, setActiveFolder] = React.useState('inbox')
  const [dragOverFolder, setDragOverFolder] = React.useState<string | null>(null)

  // 드래그 앤 드롭 핸들러
  const handleDragOver = (e: React.DragEvent, folder: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('application/x-email-uids')) {
      e.dataTransfer.dropEffect = 'move'
      setDragOverFolder(folder)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolder(null)
  }

  const handleDrop = async (e: React.DragEvent, folder: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolder(null)

    const data = e.dataTransfer.getData('application/x-email-uids')
    if (data && onDropEmails) {
      try {
        const uids = JSON.parse(data) as number[]
        if (uids.length > 0) {
          await onDropEmails(uids, folder)
        }
      } catch (error) {
        console.error('Failed to parse dropped email data:', error)
      }
    }
  }

  const handleFolderClick = (folder: string) => {
    setActiveFolder(folder)
    onFolderSelect?.(folder)
  }

  return (
    <div className="flex h-full w-[260px] min-w-[260px] flex-shrink-0 flex-col border-r bg-card">
      {/* Compose buttons */}
      <div className="p-3 space-y-2">
        <Button className="w-full gap-2" size="sm" onClick={onCompose}>
          <Mail className="h-4 w-4" />
          {t('sidebar.compose')}
        </Button>
        <Button variant="outline" className="w-full gap-2" size="sm" onClick={onComposeToSelf}>
          <Send className="h-4 w-4" />
          {t('sidebar.composeToSelf')}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* Main folders with expandable subfolders */}
          <ExpandableFolder
            icon={<Inbox className="h-4 w-4" />}
            label={t('sidebar.inbox')}
            count={folderCounts.inbox?.unseen || 0}
            isActive={activeFolder === 'inbox'}
            activeFolder={activeFolder}
            subFolders={inboxSubFolders}
            onClick={() => handleFolderClick('inbox')}
            onCountClick={() => onUnreadCountClick?.('inbox')}
            onSubFolderClick={(path) => handleFolderClick(path)}
            onSubFolderCountClick={(path) => onUnreadCountClick?.(path)}
            folderPath="inbox"
            dragOverFolder={dragOverFolder}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />

          <ExpandableFolder
            icon={<Send className="h-4 w-4" />}
            label={t('sidebar.sent')}
            isActive={activeFolder === 'sent'}
            activeFolder={activeFolder}
            subFolders={sentSubFolders}
            onClick={() => handleFolderClick('sent')}
            onSubFolderClick={(path) => handleFolderClick(path)}
            onSubFolderCountClick={(path) => onUnreadCountClick?.(path)}
            folderPath="sent"
            dragOverFolder={dragOverFolder}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />

          <FolderItem
            icon={<FileText className="h-4 w-4" />}
            label={t('sidebar.drafts')}
            count={folderCounts.drafts?.unseen || 0}
            isActive={activeFolder === 'drafts'}
            onClick={() => handleFolderClick('drafts')}
            onCountClick={() => onUnreadCountClick?.('drafts')}
            folderPath="drafts"
            isDragOver={dragOverFolder === 'drafts'}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
          <FolderItem
            icon={<Clock className="h-4 w-4" />}
            label={t('sidebar.scheduled')}
            count={folderCounts.scheduled?.total || 0}
            isActive={activeFolder === 'scheduled'}
            onClick={() => handleFolderClick('scheduled')}
          />
          <FolderItem
            icon={<Archive className="h-4 w-4" />}
            label={t('sidebar.self')}
            count={folderCounts.self?.unseen || 0}
            isActive={activeFolder === 'self'}
            onClick={() => handleFolderClick('self')}
            onCountClick={() => onUnreadCountClick?.('self')}
            folderPath="self"
            isDragOver={dragOverFolder === 'self'}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />

          {/* 내 메일함 (사용자 정의 폴더) */}
          <Separator className="my-2" />
          <CustomFoldersSection
            customFolders={customFolders}
            activeFolder={activeFolder}
            onFolderClick={handleFolderClick}
            onUnreadCountClick={onUnreadCountClick}
            onCreateFolder={onCreateCustomFolder}
            onRenameFolder={onRenameCustomFolder}
            onDeleteFolder={onDeleteCustomFolder}
            dragOverFolder={dragOverFolder}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />

          <Separator className="my-2" />

          <FolderItem
            icon={<AlertCircle className="h-4 w-4" />}
            label={t('sidebar.spam')}
            count={folderCounts.spam?.total || 0}
            isActive={activeFolder === 'spam'}
            onClick={() => handleFolderClick('spam')}
            folderPath="spam"
            isDragOver={dragOverFolder === 'spam'}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
          <FolderItem
            icon={<Trash2 className="h-4 w-4" />}
            label={t('sidebar.trash')}
            count={folderCounts.trash?.total || 0}
            isActive={activeFolder === 'trash'}
            onClick={() => handleFolderClick('trash')}
            folderPath="trash"
            isDragOver={dragOverFolder === 'trash'}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />

          <Separator className="my-2" />

          {/* 환경설정 (서브메뉴 포함) */}
          <SettingsMenu
            activeFolder={activeFolder}
            onSettingsClick={(settingsKey) => {
              setActiveFolder(settingsKey)
              onSettingsSelect?.(settingsKey)
            }}
          />
        </div>
      </ScrollArea>
    </div>
  )
})

// 내 메일함 (사용자 정의 폴더) 컴포넌트
interface CustomFoldersSectionProps {
  customFolders: SubFolder[]
  activeFolder: string
  onFolderClick: (folder: string) => void
  onUnreadCountClick?: (folder: string) => void
  onCreateFolder?: (folderName: string) => Promise<{ success: boolean; error?: string }>
  onRenameFolder?: (
    oldPath: string,
    newName: string
  ) => Promise<{ success: boolean; error?: string }>
  onDeleteFolder?: (
    folderPath: string,
    options?: {
      confirmFiltersDelete?: boolean
      confirmEmailsDelete?: boolean
      moveEmailsTo?: string
    }
  ) => Promise<{
    success: boolean
    error?: string
    hasFilters?: boolean
    filtersCount?: number
    hasEmails?: boolean
    emailsCount?: number
  }>
  // 드래그 앤 드롭
  dragOverFolder?: string | null
  onDragOver?: (e: React.DragEvent, folder: string) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent, folder: string) => void
}

function CustomFoldersSection({
  customFolders,
  activeFolder,
  onFolderClick,
  onUnreadCountClick,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  dragOverFolder,
  onDragOver,
  onDragLeave,
  onDrop
}: CustomFoldersSectionProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = React.useState(true)
  const [showNewFolderInput, setShowNewFolderInput] = React.useState(false)
  const [newFolderName, setNewFolderName] = React.useState('')
  const [editingFolder, setEditingFolder] = React.useState<{ path: string; name: string } | null>(
    null
  )
  const [editFolderName, setEditFolderName] = React.useState('')
  const [isProcessing, setIsProcessing] = React.useState(false)
  const [folderError, setFolderError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const editInputRef = React.useRef<HTMLInputElement>(null)

  // 삭제 다이얼로그 상태
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [deleteFolderInfo, setDeleteFolderInfo] = React.useState<{
    folderPath: string
    folderName: string
    emailCount: number
    hasFilters: boolean
    filtersCount: number
  } | null>(null)

  React.useEffect(() => {
    if (showNewFolderInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showNewFolderInput])

  React.useEffect(() => {
    if (editingFolder && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingFolder])

  const isDuplicateName = (name: string, excludePath?: string) => {
    return customFolders.some((f) => f.name === name && f.path !== excludePath)
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return

    const trimmedName = newFolderName.trim()

    if (isDuplicateName(trimmedName)) {
      setFolderError(t('sidebar.duplicateFolderName'))
      return
    }

    setShowNewFolderInput(false)
    setNewFolderName('')
    setIsProcessing(true)
    setFolderError(null)

    try {
      const result = await onCreateFolder?.(trimmedName)
      if (!result?.success) {
        setShowNewFolderInput(true)
        setNewFolderName(trimmedName)
        setFolderError(result?.error || t('sidebar.folderCreateFailed'))
      }
    } catch (error) {
      console.error('Failed to create folder:', error)
      setShowNewFolderInput(true)
      setNewFolderName(trimmedName)
      setFolderError(t('sidebar.folderCreateFailed'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRenameFolder = async () => {
    if (!editingFolder || !editFolderName.trim()) return

    const trimmedName = editFolderName.trim()

    if (trimmedName === editingFolder.name) {
      setEditingFolder(null)
      setEditFolderName('')
      return
    }

    if (isDuplicateName(trimmedName, editingFolder.path)) {
      setFolderError(t('sidebar.duplicateFolderName'))
      return
    }

    setIsProcessing(true)
    setFolderError(null)

    try {
      const result = await onRenameFolder?.(editingFolder.path, trimmedName)
      if (result?.success) {
        setEditingFolder(null)
        setEditFolderName('')
      } else {
        setFolderError(result?.error || t('sidebar.folderRenameFailed'))
      }
    } catch (error) {
      console.error('Failed to rename folder:', error)
      setFolderError(t('sidebar.folderRenameFailed'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeleteFolder = async (folderPath: string, folderName: string) => {
    console.log('[handleDeleteFolder] Starting delete for:', folderPath, folderName)

    // 기본 삭제 확인
    const confirmDelete = confirm(t('sidebar.deleteFolderConfirm', { name: folderName }))
    if (!confirmDelete) return

    setIsProcessing(true)
    try {
      // 먼저 필터와 메일 정보 확인
      const result = await onDeleteFolder?.(folderPath)
      console.log('[handleDeleteFolder] Initial check result:', result)

      const hasFilters = result?.hasFilters && result.filtersCount && result.filtersCount > 0
      const hasEmails = result?.hasEmails && result.emailsCount && result.emailsCount > 0

      // 필터나 메일이 있으면 다이얼로그 표시
      if (hasFilters || hasEmails) {
        console.log('[handleDeleteFolder] Opening delete dialog')
        setDeleteFolderInfo({
          folderPath,
          folderName,
          emailCount: result?.emailsCount || 0,
          hasFilters: !!hasFilters,
          filtersCount: result?.filtersCount || 0
        })
        setDeleteDialogOpen(true)
        setIsProcessing(false)
        return
      }

      // 필터와 메일이 없으면 바로 삭제
      console.log('[handleDeleteFolder] No filters/emails, deleting directly')
      const finalResult = await onDeleteFolder?.(folderPath, {
        confirmFiltersDelete: false,
        confirmEmailsDelete: false
      })

      if (!finalResult?.success) {
        console.error('Failed to delete folder:', finalResult?.error)
        alert(finalResult?.error || t('sidebar.folderDeleteFailed'))
      }
    } catch (error) {
      console.error('Failed to delete folder:', error)
      alert(t('sidebar.folderDeleteFailed'))
    } finally {
      setIsProcessing(false)
    }
  }

  // 삭제 다이얼로그 확인 핸들러
  const handleDeleteDialogConfirm = async (data: {
    confirmFiltersDelete: boolean
    confirmEmailsDelete: boolean
    moveEmailsTo?: string
  }) => {
    if (!deleteFolderInfo) return

    console.log('[handleDeleteDialogConfirm] Confirming delete:', data)
    setIsProcessing(true)
    try {
      const finalResult = await onDeleteFolder?.(deleteFolderInfo.folderPath, {
        confirmFiltersDelete: data.confirmFiltersDelete,
        confirmEmailsDelete: data.confirmEmailsDelete,
        moveEmailsTo: data.moveEmailsTo
      })

      console.log('[handleDeleteDialogConfirm] Delete result:', finalResult)

      if (!finalResult?.success) {
        console.error('Failed to delete folder:', finalResult?.error)
        alert(finalResult?.error || t('sidebar.folderDeleteFailed'))
      }

      // 다이얼로그 닫기
      setDeleteDialogOpen(false)
      setDeleteFolderInfo(null)
    } catch (error) {
      console.error('Failed to delete folder:', error)
      alert(t('sidebar.folderDeleteFailed'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateFolder()
    } else if (e.key === 'Escape') {
      setShowNewFolderInput(false)
      setNewFolderName('')
      setFolderError(null)
    }
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameFolder()
    } else if (e.key === 'Escape') {
      setEditingFolder(null)
      setEditFolderName('')
      setFolderError(null)
    }
  }

  return (
    <div>
      <div className="flex items-center group">
        <button onClick={() => setIsExpanded(!isExpanded)} className="p-1 hover:bg-muted rounded">
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
            'hover:bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          <Folder className="h-4 w-4" />
          <span className="flex-1 text-left">{t('sidebar.myFolders')}</span>
        </button>
        <button
          onClick={() => {
            setShowNewFolderInput(true)
            setIsExpanded(true)
            setFolderError(null)
          }}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-muted rounded transition-opacity"
          title={t('sidebar.newFolder')}
        >
          <Plus className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
      {isExpanded && (
        <div className="ml-5 border-l pl-2 mt-1">
          {/* 새 폴더 입력 */}
          {showNewFolderInput && (
            <div className="py-0.5">
              <div className="flex items-center gap-1">
                <Folder className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={newFolderName}
                  onChange={(e) => {
                    setNewFolderName(e.target.value)
                    setFolderError(null)
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={t('sidebar.folderName')}
                  disabled={isProcessing}
                  className={cn(
                    'flex-1 h-6 px-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary',
                    folderError && 'border-red-500'
                  )}
                />
                <button
                  onClick={handleCreateFolder}
                  disabled={isProcessing || !newFolderName.trim()}
                  className="p-0.5 hover:bg-muted rounded disabled:opacity-50"
                >
                  <Check className="h-3 w-3 text-primary" />
                </button>
                <button
                  onClick={() => {
                    setShowNewFolderInput(false)
                    setNewFolderName('')
                    setFolderError(null)
                  }}
                  className="p-0.5 hover:bg-muted rounded"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
              {folderError && !editingFolder && (
                <p className="text-xs text-red-500 mt-1 ml-4">{folderError}</p>
              )}
            </div>
          )}

          {/* 폴더 목록 */}
          {customFolders.map((folder) => (
            <div key={folder.path} className="group/subfolder">
              {editingFolder?.path === folder.path ? (
                <div className="flex items-center gap-1 py-0.5">
                  <Folder className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editFolderName}
                    onChange={(e) => {
                      setEditFolderName(e.target.value)
                      setFolderError(null)
                    }}
                    onKeyDown={handleEditKeyDown}
                    disabled={isProcessing}
                    className={cn(
                      'flex-1 h-6 px-1 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary',
                      folderError && 'border-red-500'
                    )}
                  />
                  <button
                    onClick={handleRenameFolder}
                    disabled={isProcessing || !editFolderName.trim()}
                    className="p-0.5 hover:bg-muted rounded disabled:opacity-50"
                  >
                    <Check className="h-3 w-3 text-primary" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingFolder(null)
                      setEditFolderName('')
                      setFolderError(null)
                    }}
                    className="p-0.5 hover:bg-muted rounded"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center">
                  <button
                    onClick={() => onFolderClick(folder.path)}
                    onDragOver={onDragOver ? (e) => onDragOver(e, folder.path) : undefined}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop ? (e) => onDrop(e, folder.path) : undefined}
                    className={cn(
                      'flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors min-w-0',
                      activeFolder === folder.path
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground',
                      dragOverFolder === folder.path && 'ring-2 ring-primary bg-primary/10'
                    )}
                  >
                    <Folder className="h-3 w-3 flex-shrink-0" />
                    <span className="text-left truncate flex-1">{folder.name}</span>
                    {folder.unseen !== undefined && folder.unseen > 0 && (
                      <Badge
                        variant={activeFolder === folder.path ? 'secondary' : 'default'}
                        className={cn(
                          'h-4 min-w-[16px] justify-center px-1 text-[10px] cursor-pointer',
                          activeFolder === folder.path && 'bg-white/20 text-primary-foreground',
                          onUnreadCountClick &&
                            'hover:ring-2 hover:ring-offset-1 hover:ring-primary/50'
                        )}
                        onClick={(e) => {
                          if (onUnreadCountClick) {
                            e.stopPropagation()
                            onUnreadCountClick(folder.path)
                          }
                        }}
                        title={onUnreadCountClick ? t('sidebar.unreadOnly') : undefined}
                      >
                        {folder.unseen}
                      </Badge>
                    )}
                  </button>
                  <div className="flex items-center opacity-0 group-hover/subfolder:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => {
                        setEditingFolder({ path: folder.path, name: folder.name })
                        setEditFolderName(folder.name)
                        setFolderError(null)
                      }}
                      className="p-1 hover:bg-muted rounded"
                      title={t('sidebar.renameFolder')}
                    >
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleDeleteFolder(folder.path, folder.name)}
                      className="p-1 hover:bg-red-100 rounded"
                      title={t('sidebar.deleteFolder')}
                    >
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </button>
                  </div>
                </div>
              )}
              {editingFolder?.path === folder.path && folderError && (
                <p className="text-xs text-red-500 mt-1 ml-4">{folderError}</p>
              )}
            </div>
          ))}

          {/* 폴더가 없을 때 */}
          {customFolders.length === 0 && !showNewFolderInput && (
            <p className="text-xs text-muted-foreground py-2 px-2">{t('sidebar.noFolders')}</p>
          )}
        </div>
      )}

      {/* 삭제 확인 다이얼로그 */}
      <DeleteFolderDialog
        isOpen={deleteDialogOpen}
        folderName={deleteFolderInfo?.folderName || ''}
        folderPath={deleteFolderInfo?.folderPath || ''}
        emailCount={deleteFolderInfo?.emailCount || 0}
        hasFilters={deleteFolderInfo?.hasFilters || false}
        filtersCount={deleteFolderInfo?.filtersCount || 0}
        availableFolders={customFolders}
        onClose={() => {
          setDeleteDialogOpen(false)
          setDeleteFolderInfo(null)
        }}
        onConfirm={handleDeleteDialogConfirm}
      />
    </div>
  )
}

// 환경설정 메뉴 컴포넌트
interface SettingsMenuProps {
  activeFolder: string
  onSettingsClick: (settingsKey: string) => void
}

function SettingsMenu({ activeFolder, onSettingsClick }: SettingsMenuProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = React.useState(false)

  const settingsItems = [
    { key: 'settings-general', labelKey: 'settings.general' },
    { key: 'settings-ai', labelKey: 'ai.title' },
    { key: 'settings-filter', labelKey: 'settings.filter' },
    { key: 'settings-signature', labelKey: 'settings.signature' },
    { key: 'settings-template', labelKey: 'template.title' },
    { key: 'settings-spam', labelKey: 'settings.spam' },
    { key: 'settings-e2e', labelKey: 'settings.e2e' }
  ]

  const isSettingsActive = activeFolder.startsWith('settings')

  return (
    <div>
      <div className="flex items-center">
        <button onClick={() => setIsExpanded(!isExpanded)} className="p-1 hover:bg-muted rounded">
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={() => {
            setIsExpanded(!isExpanded)
          }}
          className={cn(
            'flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
            isSettingsActive
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          <Settings className="h-4 w-4" />
          <span className="flex-1 text-left">{t('sidebar.settings')}</span>
        </button>
      </div>
      {isExpanded && (
        <div className="ml-5 border-l pl-2 mt-1">
          {settingsItems.map((item) => (
            <button
              key={item.key}
              onClick={() => onSettingsClick(item.key)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                activeFolder === item.key
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="text-left">{t(item.labelKey)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
