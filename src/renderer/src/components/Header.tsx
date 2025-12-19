import { useTranslation } from 'react-i18next'
import { Mail, Users, ChevronDown, RefreshCw, Plus, Settings, Check } from 'lucide-react'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu'
import { cn } from '@renderer/lib/utils'

type AppView = 'mail' | 'contacts'

interface AccountInfo {
  email: string
  name?: string
  unreadCount?: number
}

interface HeaderProps {
  accountEmail?: string
  accounts?: AccountInfo[]
  isSyncing?: boolean
  lastSyncTime?: Date | null
  onManualSync?: () => void
  currentView?: AppView
  onViewChange?: (view: AppView) => void
  onAccountChange?: (email: string) => void
  onOpenAccountManager?: () => void
  onAddAccount?: () => void
  onOpenSettings?: () => void
}

export function Header({
  accountEmail = 'user@example.com',
  accounts = [],
  isSyncing = false,
  lastSyncTime = null,
  onManualSync,
  currentView = 'mail',
  onViewChange,
  onAccountChange,
  onOpenAccountManager,
  onAddAccount,
  onOpenSettings
}: HeaderProps) {
  const { t, i18n } = useTranslation()

  const formatLastSync = (date: Date | null) => {
    if (!date) return ''
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)

    if (diffSec < 60) return t('header.justNow')
    if (diffMin < 60) return t('header.minutesAgo', { count: diffMin })
    return date.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-4">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          <span className="text-xl font-bold text-primary">Mail</span>
          <span className="text-xl font-bold text-gray-700">Vista</span>
        </div>
      </div>

      {/* Center icons - 메일, 주소록 */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-9 w-9',
            currentView === 'mail' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
          title={t('header.mail')}
          onClick={() => onViewChange?.('mail')}
        >
          <Mail className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-9 w-9',
            currentView === 'contacts'
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
          title={t('header.addressBook')}
          onClick={() => onViewChange?.('contacts')}
        >
          <Users className="h-5 w-5" />
        </Button>
      </div>

      {/* Right section - 동기화 상태 및 계정 정보 */}
      <div className="flex items-center gap-3">
        {/* 동기화 상태 */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onManualSync}
            disabled={isSyncing}
            title={isSyncing ? t('header.syncing') : t('common.refresh')}
          >
            <RefreshCw
              className={`h-4 w-4 ${isSyncing ? 'animate-spin text-primary' : 'text-muted-foreground'}`}
            />
          </Button>
          {lastSyncTime && !isSyncing && (
            <span className="text-xs text-muted-foreground">{formatLastSync(lastSyncTime)}</span>
          )}
          {isSyncing && <span className="text-xs text-primary">{t('header.syncing')}</span>}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* 계정 선택 드롭다운 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted transition-colors">
              <span className="text-sm text-muted-foreground max-w-[200px] truncate">
                {accountEmail}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {/* 계정 목록 */}
            {accounts.map((account) => (
              <DropdownMenuItem
                key={account.email}
                className="flex items-center justify-between cursor-pointer"
                onClick={() => onAccountChange?.(account.email)}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {account.email === accountEmail && (
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                  )}
                  {account.email !== accountEmail && <div className="w-4 flex-shrink-0" />}
                  <div className="flex flex-col min-w-0">
                    {account.name && (
                      <span className="text-sm font-medium truncate">{account.name}</span>
                    )}
                    <span className="text-sm text-muted-foreground truncate">{account.email}</span>
                  </div>
                </div>
                {account.unreadCount !== undefined && account.unreadCount > 0 && (
                  <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                    {account.unreadCount}
                  </span>
                )}
              </DropdownMenuItem>
            ))}

            {accounts.length > 0 && <DropdownMenuSeparator />}

            {/* 계정 추가 */}
            <DropdownMenuItem
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => onAddAccount?.()}
            >
              <Plus className="h-4 w-4" />
              <span>{t('account.addAccount')}</span>
            </DropdownMenuItem>

            {/* 계정 관리 */}
            <DropdownMenuItem
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => onOpenAccountManager?.()}
            >
              <Settings className="h-4 w-4" />
              <span>{t('account.manageAccounts')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 설정 버튼 */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onOpenSettings}
          title={t('settings.title')}
        >
          <Settings className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </Button>
      </div>
    </header>
  )
}
