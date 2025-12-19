import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Check, Loader2 } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Checkbox } from './ui/checkbox'

interface Folder {
  path: string
  name: string
  delimiter: string
  flags: string[]
  children?: Folder[]
}

interface AutoClassifyDialogProps {
  isOpen: boolean
  accountEmail: string
  senderEmail: string
  folders: Folder[]
  onClose: () => void
  onConfirm: (data: {
    senderAddress: string
    targetFolder: string
    newFolderName?: string
    moveExistingEmails: boolean
  }) => Promise<void>
  onCreateFolder?: (folderName: string) => Promise<{ success: boolean; path?: string }>
}

export function AutoClassifyDialog({
  isOpen,
  accountEmail: _accountEmail,
  senderEmail,
  folders,
  onClose,
  onConfirm,
  onCreateFolder
}: AutoClassifyDialogProps): React.ReactElement | null {
  const { t } = useTranslation()
  const [senderAddress, setSenderAddress] = React.useState(senderEmail)
  const [selectionMode, setSelectionMode] = React.useState<'existing' | 'new'>('existing')
  const [selectedFolder, setSelectedFolder] = React.useState('INBOX')
  const [newFolderName, setNewFolderName] = React.useState('')
  const [moveExistingEmails, setMoveExistingEmails] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false)
  const [dropdownPosition, setDropdownPosition] = React.useState({ top: 0, left: 0, width: 0 })
  const triggerButtonRef = React.useRef<HTMLButtonElement>(null)

  // 폴더 이름을 번역된 이름으로 변환
  const translateFolderName = React.useCallback(
    (folderName: string): string => {
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
        SPAMBOX: t('sidebar.spam'),
        내게쓴메일함: t('sidebar.self'),
        TOME: t('sidebar.self'),
        ARCHIVING: t('sidebar.scheduled'),
        예약메일함: t('sidebar.scheduled')
      }
      return folderNames[folderName] || folderName
    },
    [t]
  )

  // 폴더 목록 평탄화 (하위 폴더 포함)
  const flattenFolders = React.useCallback(
    (folderList: Folder[], prefix = ''): { path: string; displayName: string }[] => {
      const result: { path: string; displayName: string }[] = []
      for (const folder of folderList) {
        const translatedName = translateFolderName(folder.name)
        const displayName = prefix ? `${prefix} / ${translatedName}` : translatedName
        result.push({ path: folder.path, displayName })
        if (folder.children && folder.children.length > 0) {
          result.push(...flattenFolders(folder.children, displayName))
        }
      }
      return result
    },
    [translateFolderName]
  )

  const flatFolders = React.useMemo(() => flattenFolders(folders), [folders, flattenFolders])

  // 다이얼로그가 열릴 때 상태 초기화
  React.useEffect(() => {
    if (isOpen) {
      console.log('[AutoClassifyDialog] Dialog opened', {
        senderEmail,
        foldersCount: folders.length,
        flatFoldersCount: flatFolders.length
      })
      setSenderAddress(senderEmail)
      setSelectionMode('existing')
      setSelectedFolder('INBOX')
      setNewFolderName('')
      setMoveExistingEmails(false)
      setIsSubmitting(false)
      setIsDropdownOpen(false)
    }
  }, [isOpen, senderEmail, folders.length, flatFolders.length])

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

  // 드롭다운 열기
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
    console.log('[AutoClassifyDialog] handleConfirm called', {
      senderAddress,
      selectionMode,
      selectedFolder,
      newFolderName,
      moveExistingEmails
    })

    if (!senderAddress.trim()) {
      console.log('[AutoClassifyDialog] Sender address is empty, aborting')
      return
    }

    setIsSubmitting(true)
    try {
      let targetFolder = selectedFolder

      // 새 폴더 생성 모드인 경우
      if (selectionMode === 'new' && newFolderName.trim()) {
        console.log('[AutoClassifyDialog] Creating new folder:', newFolderName.trim())
        if (onCreateFolder) {
          const result = await onCreateFolder(newFolderName.trim())
          console.log('[AutoClassifyDialog] Create folder result:', result)
          if (result.success && result.path) {
            targetFolder = result.path
            console.log('[AutoClassifyDialog] New folder created, path:', targetFolder)
          } else {
            console.error('[AutoClassifyDialog] Failed to create folder')
            setIsSubmitting(false)
            return
          }
        } else {
          console.error('[AutoClassifyDialog] onCreateFolder is not defined')
        }
      }

      const confirmData = {
        senderAddress: senderAddress.trim(),
        targetFolder,
        newFolderName: selectionMode === 'new' ? newFolderName.trim() : undefined,
        moveExistingEmails
      }
      console.log('[AutoClassifyDialog] Calling onConfirm with:', confirmData)

      await onConfirm(confirmData)
      console.log('[AutoClassifyDialog] onConfirm completed successfully')
    } catch (error) {
      console.error('[AutoClassifyDialog] Error in handleConfirm:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSelectFolder = (folderPath: string) => {
    setSelectedFolder(folderPath)
    setIsDropdownOpen(false)
  }

  const getSelectedFolderName = () => {
    const folder = flatFolders.find((f) => f.path === selectedFolder)
    return folder?.displayName || selectedFolder
  }

  const isConfirmDisabled = () => {
    if (!senderAddress.trim()) return true
    if (selectionMode === 'new' && !newFolderName.trim()) return true
    return isSubmitting
  }

  if (!isOpen) return null

  return (
    <>
      {/* 오버레이 */}
      <div className="fixed inset-0 z-50 bg-black/80" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 border bg-background p-6 shadow-lg rounded-lg">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold">{t('autoClassify.title')}</h2>
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
        <div className="space-y-5">
          {/* 보낸사람 주소 */}
          <div className="space-y-2">
            <Label htmlFor="senderAddress">{t('autoClassify.senderAddress')}</Label>
            <Input
              id="senderAddress"
              type="email"
              value={senderAddress}
              onChange={(e) => setSenderAddress(e.target.value)}
              placeholder={t('autoClassify.senderAddressPlaceholder')}
            />
          </div>

          {/* 설명 */}
          <p className="text-sm text-muted-foreground">{t('autoClassify.description')}</p>

          {/* 이동할 메일함 선택 */}
          <div className="space-y-3">
            {/* 기존 폴더 선택 */}
            <div className="flex items-center gap-3">
              <div className="flex items-center">
                <input
                  type="radio"
                  id="existingFolder"
                  name="folderSelection"
                  checked={selectionMode === 'existing'}
                  onChange={() => setSelectionMode('existing')}
                  className="h-4 w-4 text-primary"
                />
              </div>
              <Label htmlFor="existingFolder" className="text-sm font-normal whitespace-nowrap">
                {t('autoClassify.selectExistingFolder')}
              </Label>
              <button
                ref={triggerButtonRef}
                type="button"
                onClick={openDropdown}
                disabled={selectionMode !== 'existing'}
                className={cn(
                  'flex h-9 flex-1 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring',
                  selectionMode !== 'existing' && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span className="truncate">{getSelectedFolderName()}</span>
                <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
              </button>
            </div>

            {/* 새 폴더 생성 */}
            <div className="flex items-center gap-3">
              <div className="flex items-center">
                <input
                  type="radio"
                  id="newFolder"
                  name="folderSelection"
                  checked={selectionMode === 'new'}
                  onChange={() => setSelectionMode('new')}
                  className="h-4 w-4 text-primary"
                />
              </div>
              <Label htmlFor="newFolder" className="text-sm font-normal whitespace-nowrap">
                {t('autoClassify.createNewFolder')}
              </Label>
              <Input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={t('autoClassify.newFolderPlaceholder')}
                disabled={selectionMode !== 'new'}
                className={cn('flex-1', selectionMode !== 'new' && 'opacity-50')}
              />
            </div>
          </div>

          {/* 기존 메일도 이동하기 */}
          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="moveExisting"
              checked={moveExistingEmails}
              onCheckedChange={(checked) => setMoveExistingEmails(checked === true)}
            />
            <Label htmlFor="moveExisting" className="text-sm font-normal cursor-pointer">
              {t('autoClassify.moveExistingEmails')}
            </Label>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={isConfirmDisabled()}>
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
