import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Check, Loader2, Trash2, FolderInput } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Button } from './ui/button'
import { Label } from './ui/label'

interface SubFolder {
  name: string
  path: string
  unseen?: number
}

interface DeleteFolderDialogProps {
  isOpen: boolean
  folderName: string
  folderPath: string
  emailCount: number
  hasFilters: boolean
  filtersCount: number
  availableFolders: SubFolder[]
  onClose: () => void
  onConfirm: (data: {
    confirmFiltersDelete: boolean
    confirmEmailsDelete: boolean
    moveEmailsTo?: string
  }) => Promise<void>
}

export function DeleteFolderDialog({
  isOpen,
  folderName,
  folderPath,
  emailCount,
  hasFilters,
  filtersCount,
  availableFolders,
  onClose,
  onConfirm
}: DeleteFolderDialogProps): React.ReactElement | null {
  const { t } = useTranslation()
  const [actionMode, setActionMode] = React.useState<'move' | 'delete'>('move')
  const [selectedFolder, setSelectedFolder] = React.useState('INBOX')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false)
  const [dropdownPosition, setDropdownPosition] = React.useState({ top: 0, left: 0, width: 0 })
  const triggerButtonRef = React.useRef<HTMLButtonElement>(null)

  // 폴더 이름을 번역된 이름으로 변환
  const translateFolderName = React.useCallback(
    (name: string): string => {
      const folderNames: Record<string, string> = {
        INBOX: t('sidebar.inbox'),
        Sent: t('sidebar.sent'),
        보낸편지함: t('sidebar.sent'),
        'Sent Messages': t('sidebar.sent'),
        Drafts: t('sidebar.drafts'),
        임시보관함: t('sidebar.drafts'),
        Trash: t('sidebar.trash'),
        휴지통: t('sidebar.trash'),
        'Deleted Messages': t('sidebar.trash'),
        Junk: t('sidebar.spam'),
        스팸메일함: t('sidebar.spam'),
        Spam: t('sidebar.spam'),
        SPAMBOX: t('sidebar.spam')
      }
      return folderNames[name] || name
    },
    [t]
  )

  // 폴더 목록 필터링 (삭제할 폴더 제외)
  const filteredFolders = React.useMemo(() => {
    // 기본 폴더 추가 (INBOX)
    const defaultFolders: { path: string; displayName: string }[] = [
      { path: 'INBOX', displayName: translateFolderName('INBOX') }
    ]

    // 사용 가능한 폴더에서 삭제할 폴더 제외
    const customFolderList = availableFolders
      .filter((folder) => {
        // 삭제할 폴더와 그 하위 폴더 제외
        if (folder.path === folderPath || folder.path.startsWith(folderPath + '/')) {
          return false
        }
        // INBOX는 이미 추가됨
        if (folder.path === 'INBOX') {
          return false
        }
        return true
      })
      .map((folder) => ({
        path: folder.path,
        displayName: translateFolderName(folder.name)
      }))

    return [...defaultFolders, ...customFolderList]
  }, [availableFolders, folderPath, translateFolderName])

  const flatFolders = filteredFolders

  // 다이얼로그가 열릴 때 상태 초기화
  React.useEffect(() => {
    if (isOpen) {
      console.log('[DeleteFolderDialog] Dialog opened', {
        folderName,
        folderPath,
        emailCount,
        hasFilters,
        filtersCount
      })
      setActionMode('move')
      setSelectedFolder('INBOX')
      setIsSubmitting(false)
      setIsDropdownOpen(false)
    }
  }, [isOpen, folderName, folderPath, emailCount, hasFilters, filtersCount])

  // 드롭다운 위치 계산
  const updateDropdownPosition = React.useCallback(() => {
    if (triggerButtonRef.current) {
      const rect = triggerButtonRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const dropdownHeight = Math.min(flatFolders.length * 36 + 16, 240)

      let top = rect.bottom + 4
      if (top + dropdownHeight > viewportHeight - 10) {
        top = rect.top - dropdownHeight - 4
      }

      setDropdownPosition({
        top,
        left: rect.left,
        width: rect.width
      })
    }
  }, [flatFolders.length])

  const openDropdown = () => {
    updateDropdownPosition()
    setIsDropdownOpen(true)
  }

  // ESC 키로 닫기
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isDropdownOpen) {
          setIsDropdownOpen(false)
        } else {
          onClose()
        }
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, isDropdownOpen, onClose])

  const handleConfirm = async () => {
    console.log('[DeleteFolderDialog] handleConfirm called', {
      actionMode,
      selectedFolder,
      hasFilters,
      emailCount
    })

    setIsSubmitting(true)
    try {
      const confirmData = {
        confirmFiltersDelete: hasFilters,
        confirmEmailsDelete: actionMode === 'delete',
        moveEmailsTo: actionMode === 'move' ? selectedFolder : undefined
      }
      console.log('[DeleteFolderDialog] Calling onConfirm with:', confirmData)

      await onConfirm(confirmData)
      console.log('[DeleteFolderDialog] onConfirm completed successfully')
    } catch (error) {
      console.error('[DeleteFolderDialog] Error in handleConfirm:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSelectFolder = (path: string) => {
    setSelectedFolder(path)
    setIsDropdownOpen(false)
  }

  const getSelectedFolderName = () => {
    const folder = flatFolders.find((f) => f.path === selectedFolder)
    return folder?.displayName || translateFolderName(selectedFolder)
  }

  if (!isOpen) return null

  return (
    <>
      {/* 오버레이 */}
      <div className="fixed inset-0 z-50 bg-black/80" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 border bg-background p-6 shadow-lg rounded-lg">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold">{t('sidebar.deleteFolder')}</h2>
        </div>

        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 15 15"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
              fill="currentColor"
              fillRule="evenodd"
              clipRule="evenodd"
            ></path>
          </svg>
        </button>

        {/* Content */}
        <div className="space-y-4">
          {/* 폴더 정보 */}
          <div className="p-3 bg-muted rounded-md">
            <p className="font-medium">{folderName}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t('sidebar.hasEmailsInFolder', { count: emailCount })}
            </p>
            {hasFilters && (
              <p className="text-sm text-orange-600 mt-1">
                {t('sidebar.hasRelatedFilters', { count: filtersCount })}
              </p>
            )}
          </div>

          {/* 메일 처리 옵션 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              {t('sidebar.deleteFolderWithEmailsOptions')}
            </Label>

            {/* 이동 옵션 */}
            <div className="flex items-center gap-3">
              <div className="flex items-center">
                <input
                  type="radio"
                  id="moveEmails"
                  name="emailAction"
                  checked={actionMode === 'move'}
                  onChange={() => setActionMode('move')}
                  className="h-4 w-4 text-primary"
                />
              </div>
              <Label htmlFor="moveEmails" className="text-sm font-normal flex items-center gap-2">
                <FolderInput className="h-4 w-4" />
                {t('sidebar.deleteFolderMoveToInbox')}
              </Label>
            </div>

            {/* 폴더 선택 드롭다운 */}
            {actionMode === 'move' && (
              <div className="ml-6">
                <button
                  ref={triggerButtonRef}
                  type="button"
                  onClick={openDropdown}
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <span className="truncate">{getSelectedFolderName()}</span>
                  <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                </button>
              </div>
            )}

            {/* 삭제 옵션 */}
            <div className="flex items-center gap-3">
              <div className="flex items-center">
                <input
                  type="radio"
                  id="deleteEmails"
                  name="emailAction"
                  checked={actionMode === 'delete'}
                  onChange={() => setActionMode('delete')}
                  className="h-4 w-4 text-primary"
                />
              </div>
              <Label
                htmlFor="deleteEmails"
                className="text-sm font-normal flex items-center gap-2 text-red-600"
              >
                <Trash2 className="h-4 w-4" />
                {t('sidebar.deleteFolderDeleteAll')}
              </Label>
            </div>
          </div>

          {/* 경고 메시지 */}
          {actionMode === 'delete' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700">
                {emailCount}개의 메일이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
              </p>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
            variant={actionMode === 'delete' ? 'destructive' : 'default'}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('common.processing')}
              </>
            ) : (
              t('common.confirm')
            )}
          </Button>
        </div>
      </div>

      {/* Dropdown - Portal to body */}
      {isDropdownOpen &&
        ReactDOM.createPortal(
          <>
            {/* Dropdown backdrop */}
            <div
              className="fixed inset-0"
              style={{ zIndex: 9998 }}
              onClick={() => setIsDropdownOpen(false)}
            />
            {/* Dropdown list */}
            <div
              style={{
                position: 'fixed',
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
                zIndex: 9999
              }}
              className="max-h-60 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            >
              {flatFolders.map((folder) => (
                <div
                  key={folder.path}
                  onClick={() => handleSelectFolder(folder.path)}
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                    selectedFolder === folder.path && 'bg-accent text-accent-foreground'
                  )}
                >
                  {selectedFolder === folder.path && (
                    <Check className="h-4 w-4 mr-2 flex-shrink-0" />
                  )}
                  {selectedFolder !== folder.path && <span className="w-4 mr-2 flex-shrink-0" />}
                  <span className="truncate">{folder.displayName}</span>
                </div>
              ))}

              {flatFolders.length === 0 && (
                <div className="py-2 px-3 text-sm text-muted-foreground text-center">
                  {t('autoClassify.noFolders')}
                </div>
              )}
            </div>
          </>,
          document.body
        )}
    </>
  )
}
