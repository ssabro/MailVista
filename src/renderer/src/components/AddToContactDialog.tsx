import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Star, ChevronDown, Check } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Button } from './ui/button'

interface ContactGroup {
  id: string
  name: string
  parentId?: string
  createdAt: string
}

interface AddToContactDialogProps {
  isOpen: boolean
  accountEmail: string
  senderName: string
  senderEmail: string
  onClose: () => void
  onConfirm: (data: { name: string; email: string; groupId: string; isVip: boolean }) => void
}

export function AddToContactDialog({
  isOpen,
  accountEmail,
  senderName,
  senderEmail,
  onClose,
  onConfirm
}: AddToContactDialogProps): React.ReactElement | null {
  const { t } = useTranslation()
  const [name, setName] = React.useState(senderName)
  const [selectedGroupId, setSelectedGroupId] = React.useState<string>('all')
  const [isVip, setIsVip] = React.useState(false)
  const [groups, setGroups] = React.useState<ContactGroup[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false)
  const [dropdownPosition, setDropdownPosition] = React.useState({ top: 0, left: 0, width: 0 })
  const triggerButtonRef = React.useRef<HTMLButtonElement>(null)

  // 그룹 목록 로드
  const loadGroups = React.useCallback(async () => {
    if (!accountEmail) return
    try {
      const result = await window.electron.ipcRenderer.invoke('get-contact-groups', accountEmail)
      if (Array.isArray(result)) {
        setGroups(result)
      }
    } catch (error) {
      console.error('Failed to load contact groups:', error)
    }
  }, [accountEmail])

  // 다이얼로그가 열릴 때 상태 초기화
  React.useEffect(() => {
    if (isOpen && accountEmail) {
      setName(senderName || senderEmail.split('@')[0])
      setSelectedGroupId('all')
      setIsVip(false)
      setIsDropdownOpen(false)
      loadGroups()
    }
  }, [isOpen, accountEmail, senderName, senderEmail, loadGroups])

  // 드롭다운 위치 계산
  const updateDropdownPosition = React.useCallback(() => {
    if (triggerButtonRef.current) {
      const rect = triggerButtonRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      })
    }
  }, [])

  // 드롭다운 열기
  const openDropdown = () => {
    updateDropdownPosition()
    setIsDropdownOpen(true)
  }

  // ESC 키로 다이얼로그 닫기
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

  const handleConfirm = () => {
    onConfirm({
      name: name.trim() || senderEmail.split('@')[0],
      email: senderEmail,
      groupId: selectedGroupId === 'all' ? '' : selectedGroupId,
      isVip
    })
  }

  const handleSelectGroup = (groupId: string) => {
    setSelectedGroupId(groupId)
    setIsDropdownOpen(false)
  }

  const getSelectedGroupName = () => {
    if (selectedGroupId === 'all') return t('addressBook.allContacts2')
    return groups.find((g) => g.id === selectedGroupId)?.name || t('addressBook.selectGroup2')
  }

  if (!isOpen) return null

  return (
    <>
      {/* 오버레이 */}
      <div className="fixed inset-0 z-50 bg-black/80" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 border bg-background p-6 shadow-lg rounded-lg">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold">{t('addressBook.addToContacts')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('addressBook.addToContactsDesc')}</p>
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

        {/* Table form */}
        <div className="border rounded-md">
          {/* Header */}
          <div className="grid grid-cols-[50px_180px_1fr_160px] bg-muted/50 border-b text-sm font-medium">
            <div className="px-3 py-2 text-center border-r">{t('addressBook.vip')}</div>
            <div className="px-3 py-2 border-r">{t('addressBook.name')}</div>
            <div className="px-3 py-2 border-r">{t('addressBook.email')}</div>
            <div className="px-3 py-2">{t('addressBook.groups')}</div>
          </div>

          {/* Content */}
          <div className="grid grid-cols-[50px_180px_1fr_160px] text-sm">
            {/* VIP */}
            <div className="px-3 py-2 flex items-center justify-center border-r">
              <button
                type="button"
                onClick={() => setIsVip(!isVip)}
                className="p-1 rounded hover:bg-muted transition-colors"
              >
                <Star
                  className={cn(
                    'h-5 w-5',
                    isVip ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
                  )}
                />
              </button>
            </div>

            {/* Name input */}
            <div className="px-2 py-1.5 border-r">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-8 px-2 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={t('addressBook.enterName')}
              />
            </div>

            {/* 이메일 (읽기 전용) */}
            <div className="px-3 py-2 border-r text-muted-foreground truncate flex items-center">
              {senderEmail}
            </div>

            {/* 그룹 선택 버튼 */}
            <div className="px-2 py-1.5">
              <button
                ref={triggerButtonRef}
                type="button"
                onClick={openDropdown}
                className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <span className="truncate">{getSelectedGroupName()}</span>
                <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
              </button>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-center gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={handleConfirm}>
            {t('common.confirm')}
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
              {/* All contacts option */}
              <div
                onClick={() => handleSelectGroup('all')}
                className={cn(
                  'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                  selectedGroupId === 'all' && 'bg-accent text-accent-foreground'
                )}
              >
                {selectedGroupId === 'all' && <Check className="h-4 w-4 mr-2 flex-shrink-0" />}
                {selectedGroupId !== 'all' && <span className="w-4 mr-2 flex-shrink-0" />}
                {t('addressBook.allContacts2')}
              </div>

              {/* Group list */}
              {groups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => handleSelectGroup(group.id)}
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                    selectedGroupId === group.id && 'bg-accent text-accent-foreground'
                  )}
                >
                  {selectedGroupId === group.id && <Check className="h-4 w-4 mr-2 flex-shrink-0" />}
                  {selectedGroupId !== group.id && <span className="w-4 mr-2 flex-shrink-0" />}
                  {group.name}
                </div>
              ))}

              {/* No groups */}
              {groups.length === 0 && (
                <div className="py-2 px-3 text-sm text-muted-foreground text-center">
                  {t('addressBook.noGroups')}
                </div>
              )}
            </div>
          </>,
          document.body
        )}
    </>
  )
}
