import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Star, Mail, UserPlus, Copy, Ban, ChevronRight, X, AlertCircle } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { AddToContactDialog } from './AddToContactDialog'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'
import { Button } from './ui/button'

interface AddToContactData {
  name: string
  email: string
  groupId: string
  isVip: boolean
}

interface SenderPopupProps {
  accountEmail: string
  senderName: string
  senderEmail: string
  isVip?: boolean
  isOpen: boolean
  anchorPosition?: { top: number; left: number }
  onClose: () => void
  onToggleVip?: (isVip: boolean) => void
  onCompose?: () => void
  onAddToContacts?: (data: AddToContactData) => void
  onCopyEmail?: () => void
  onBlock?: () => void
  onViewConversation?: () => void
  onSearchBySender?: () => void
  onSearchByRecipient?: () => void
  onAutoClassify?: () => void
  onDeleteAllFromSender?: () => void
  onHighlightSender?: () => void
}

export function SenderPopup({
  accountEmail,
  senderName,
  senderEmail,
  isVip = false,
  isOpen,
  anchorPosition,
  onClose,
  onToggleVip,
  onCompose,
  onAddToContacts,
  onCopyEmail,
  onBlock,
  onViewConversation,
  onSearchBySender,
  onSearchByRecipient,
  onAutoClassify,
  onDeleteAllFromSender,
  onHighlightSender
}: SenderPopupProps): React.ReactElement | null {
  const { t } = useTranslation()
  const popupRef = React.useRef<HTMLDivElement>(null)
  const [vipStatus, setVipStatus] = React.useState(isVip)
  const [copySuccess, setCopySuccess] = React.useState(false)
  const [isAddToContactOpen, setIsAddToContactOpen] = React.useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false)
  const [adjustedPosition, setAdjustedPosition] = React.useState<{
    top: number
    left: number
  } | null>(null)

  // 팝업 위치 조정 (화면 경계 고려)
  React.useLayoutEffect(() => {
    if (isOpen && popupRef.current && anchorPosition) {
      const popup = popupRef.current
      const rect = popup.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth
      const margin = 10

      let top = anchorPosition.top
      let left = anchorPosition.left

      // 하단 공간 부족 시 위로 조정
      if (top + rect.height > viewportHeight - margin) {
        top = viewportHeight - rect.height - margin
      }

      // 오른쪽 공간 부족 시 왼쪽으로 조정
      if (left + rect.width > viewportWidth - margin) {
        left = viewportWidth - rect.width - margin
      }

      // 상단/왼쪽 경계 확인
      if (top < margin) top = margin
      if (left < margin) left = margin

      setAdjustedPosition({ top, left })
    }
  }, [isOpen, anchorPosition])

  // 팝업이 닫힐 때 조정된 위치 초기화
  React.useEffect(() => {
    if (!isOpen) {
      setAdjustedPosition(null)
    }
  }, [isOpen])

  // 외부 클릭 시 닫기 (다이얼로그가 열려있지 않을 때만)
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        !isDeleteConfirmOpen &&
        !isAddToContactOpen
      ) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose, isDeleteConfirmOpen, isAddToContactOpen])

  // ESC 키로 닫기 (다이얼로그가 열려있지 않을 때만)
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleteConfirmOpen && !isAddToContactOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose, isDeleteConfirmOpen, isAddToContactOpen])

  React.useEffect(() => {
    setVipStatus(isVip)
  }, [isVip])

  // 팝업이 닫힐 때 다이얼로그 상태 초기화
  React.useEffect(() => {
    if (!isOpen) {
      setIsAddToContactOpen(false)
      setIsDeleteConfirmOpen(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleToggleVip = () => {
    const newStatus = !vipStatus
    setVipStatus(newStatus)
    onToggleVip?.(newStatus)
  }

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(senderEmail)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
      onCopyEmail?.()
    } catch (err) {
      console.error('Failed to copy email:', err)
    }
  }

  const handleAddToContactsClick = () => {
    setIsAddToContactOpen(true)
  }

  const handleAddToContactConfirm = (data: AddToContactData) => {
    setIsAddToContactOpen(false)
    onAddToContacts?.(data)
    onClose()
  }

  const handleDeleteAllClick = () => {
    console.log('handleDeleteAllClick called')
    setIsDeleteConfirmOpen(true)
  }

  const handleDeleteAllConfirm = () => {
    console.log('handleDeleteAllConfirm called')
    console.log('onDeleteAllFromSender:', onDeleteAllFromSender)
    setIsDeleteConfirmOpen(false)
    if (onDeleteAllFromSender) {
      console.log('Calling onDeleteAllFromSender')
      onDeleteAllFromSender()
    } else {
      console.log('onDeleteAllFromSender is undefined')
    }
    onClose()
  }

  const iconButtonClass =
    'flex flex-col items-center justify-center p-2 rounded-lg hover:bg-muted transition-colors min-w-[56px]'
  const menuItemClass =
    'flex items-center justify-between w-full px-4 py-2.5 text-sm hover:bg-muted transition-colors'

  // 다이얼로그가 열려있을 때는 팝업 닫기 방지
  const handleBackdropClick = () => {
    if (!isDeleteConfirmOpen && !isAddToContactOpen) {
      onClose()
    }
  }

  // 사용할 위치: 조정된 위치가 있으면 사용, 없으면 원래 위치
  const finalPosition = adjustedPosition ?? anchorPosition

  return (
    <div className="fixed inset-0 z-50" onClick={handleBackdropClick}>
      <div
        ref={popupRef}
        className="absolute bg-background border rounded-lg shadow-lg w-90 overflow-hidden transition-opacity duration-100"
        style={{
          top: finalPosition?.top ?? 100,
          left: finalPosition?.left ?? 100,
          // 위치 조정 중에는 투명하게 처리하여 깜빡임 방지
          opacity: adjustedPosition ? 1 : 0
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="p-4 border-b">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base truncate">{senderName}</h3>
              <p className="text-sm text-muted-foreground truncate">{senderEmail}</p>
            </div>
            <button className="p-1 hover:bg-muted rounded transition-colors" onClick={onClose}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* 아이콘 버튼들 */}
        <div className="flex items-center justify-around px-2 py-3 border-b">
          <button className={iconButtonClass} onClick={handleToggleVip}>
            <Star
              className={cn(
                'h-5 w-5 mb-1',
                vipStatus ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
              )}
            />
            <span className="text-xs">{t('senderPopup.vip')}</span>
          </button>
          <button className={iconButtonClass} onClick={onCompose}>
            <Mail className="h-5 w-5 mb-1 text-muted-foreground" />
            <span className="text-xs">{t('senderPopup.compose')}</span>
          </button>
          <button className={iconButtonClass} onClick={handleAddToContactsClick}>
            <UserPlus className="h-5 w-5 mb-1 text-muted-foreground" />
            <span className="text-xs">{t('senderPopup.addToContacts')}</span>
          </button>
          <button className={iconButtonClass} onClick={handleCopyEmail}>
            <Copy
              className={cn(
                'h-5 w-5 mb-1',
                copySuccess ? 'text-green-500' : 'text-muted-foreground'
              )}
            />
            <span className="text-xs">
              {copySuccess ? t('senderPopup.copied') : t('senderPopup.copyEmail')}
            </span>
          </button>
          <button className={iconButtonClass} onClick={onBlock}>
            <Ban className="h-5 w-5 mb-1 text-muted-foreground" />
            <span className="text-xs">{t('senderPopup.block')}</span>
          </button>
        </div>

        {/* 메뉴 항목들 - 순서 차별화 */}
        <div className="py-1">
          <button className={menuItemClass} onClick={onViewConversation}>
            <span>{t('senderPopup.viewConversation')}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button className={menuItemClass} onClick={onHighlightSender}>
            <span>{t('senderPopup.highlightSender')}</span>
          </button>
          <button className={menuItemClass} onClick={onSearchBySender}>
            <span>{t('senderPopup.searchBySender')}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button className={menuItemClass} onClick={onSearchByRecipient}>
            <span>{t('senderPopup.searchByRecipient')}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button className={menuItemClass} onClick={onAutoClassify}>
            <span>{t('senderPopup.autoClassify')}</span>
          </button>
          <button className={menuItemClass} onClick={handleDeleteAllClick}>
            <span>{t('senderPopup.deleteAllFromSender')}</span>
          </button>
        </div>
      </div>

      {/* 주소록 추가 다이얼로그 */}
      <AddToContactDialog
        isOpen={isAddToContactOpen}
        accountEmail={accountEmail}
        senderName={senderName}
        senderEmail={senderEmail}
        onClose={() => setIsAddToContactOpen(false)}
        onConfirm={handleAddToContactConfirm}
      />

      {/* 메일 모두 삭제 확인 다이얼로그 */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogTitle className="sr-only">{t('senderPopup.deleteAllConfirmTitle')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('senderPopup.deleteAllConfirmDesc')}
          </DialogDescription>
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <p className="text-sm text-foreground mb-2">{t('senderPopup.deleteAllConfirmMsg')}</p>
            <p className="text-sm text-muted-foreground">{t('senderPopup.deleteAllConfirmNote')}</p>
          </div>
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                console.log('Cancel button clicked')
                setIsDeleteConfirmOpen(false)
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                console.log('Confirm button clicked')
                handleDeleteAllConfirm()
              }}
            >
              {t('common.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
