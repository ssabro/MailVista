import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, Star, ChevronDown, ChevronUp, Server, Mail } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Button } from './ui/button'
import { cn } from '@renderer/lib/utils'

interface ServerSettings {
  host: string
  port: number
  secure: boolean
}

interface AccountInfo {
  email: string
  name?: string
  isDefault?: boolean
  incoming?: ServerSettings
  outgoing?: ServerSettings
}

interface AccountManagerModalProps {
  isOpen: boolean
  accounts: AccountInfo[]
  onClose: () => void
  onDeleteAccount: (email: string) => void
  onSetDefaultAccount: (email: string) => void
  onAddAccount: () => void
}

export function AccountManagerModal({
  isOpen,
  accounts,
  onClose,
  onDeleteAccount,
  onSetDefaultAccount,
  onAddAccount
}: AccountManagerModalProps): React.ReactElement {
  const { t } = useTranslation()
  const [deleteConfirm, setDeleteConfirm] = React.useState<string | null>(null)
  const [expandedAccount, setExpandedAccount] = React.useState<string | null>(null)

  const handleDeleteClick = (email: string) => {
    // Cannot delete if only one account
    if (accounts.length <= 1) {
      alert(t('account.manager.minAccountRequired'))
      return
    }
    setDeleteConfirm(email)
  }

  const handleConfirmDelete = (email: string) => {
    onDeleteAccount(email)
    setDeleteConfirm(null)
    setExpandedAccount(null)
  }

  const handleSetDefault = (email: string) => {
    onSetDefaultAccount(email)
  }

  const toggleExpand = (email: string) => {
    setExpandedAccount(expandedAccount === email ? null : email)
  }

  // 모달이 닫힐 때 상태 초기화
  React.useEffect(() => {
    if (!isOpen) {
      setDeleteConfirm(null)
      setExpandedAccount(null)
    }
  }, [isOpen])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('account.manager.title')}</DialogTitle>
          <DialogDescription>{t('account.manager.description')}</DialogDescription>
        </DialogHeader>

        <div className="py-4 overflow-y-auto flex-1">
          {/* 계정 목록 */}
          <div className="space-y-2">
            {accounts.map((account) => (
              <div
                key={account.email}
                className={cn(
                  'border rounded-lg overflow-hidden',
                  account.isDefault && 'border-primary bg-primary/5'
                )}
              >
                {/* 계정 헤더 */}
                <div className="flex items-center gap-3 p-3">
                  {/* 펼치기/접기 버튼 */}
                  <button
                    onClick={() => toggleExpand(account.email)}
                    className="p-1 hover:bg-muted rounded transition-colors"
                  >
                    {expandedAccount === account.email ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>

                  {/* Account info */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => toggleExpand(account.email)}
                  >
                    <div className="flex items-center gap-2">
                      {account.name && <span className="font-medium truncate">{account.name}</span>}
                      {account.isDefault && (
                        <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                          {t('account.manager.default')}
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground truncate block">
                      {account.email}
                    </span>
                  </div>

                  {/* Set default account button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('h-8 w-8', account.isDefault && 'text-yellow-500')}
                    onClick={() => handleSetDefault(account.email)}
                    title={
                      account.isDefault
                        ? t('account.manager.defaultAccount')
                        : t('account.manager.setAsDefault')
                    }
                  >
                    <Star className={cn('h-4 w-4', account.isDefault && 'fill-yellow-400')} />
                  </Button>

                  {/* Delete button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-red-500"
                    onClick={() => handleDeleteClick(account.email)}
                    title={t('account.manager.deleteAccount')}
                    disabled={accounts.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Account details (expanded) */}
                {expandedAccount === account.email && (
                  <div className="px-4 pb-4 pt-2 border-t bg-muted/30">
                    <div className="space-y-3">
                      {/* Incoming server (IMAP) */}
                      <div className="flex items-start gap-2">
                        <Server className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            {t('account.setup.incomingServer')}
                          </div>
                          {account.incoming ? (
                            <div className="text-sm space-y-0.5">
                              <div>
                                <span className="text-muted-foreground">
                                  {t('account.manager.host')}:{' '}
                                </span>
                                <span className="font-mono">{account.incoming.host}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  {t('account.manager.port')}:{' '}
                                </span>
                                <span className="font-mono">{account.incoming.port}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  {t('account.manager.security')}:{' '}
                                </span>
                                <span
                                  className={cn(
                                    'text-xs px-1.5 py-0.5 rounded',
                                    account.incoming.secure
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-yellow-100 text-yellow-700'
                                  )}
                                >
                                  {account.incoming.secure
                                    ? 'SSL/TLS'
                                    : t('account.manager.noSecurity')}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {t('account.manager.noInfo')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Outgoing server (SMTP) */}
                      <div className="flex items-start gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            {t('account.setup.outgoingServer')}
                          </div>
                          {account.outgoing ? (
                            <div className="text-sm space-y-0.5">
                              <div>
                                <span className="text-muted-foreground">
                                  {t('account.manager.host')}:{' '}
                                </span>
                                <span className="font-mono">{account.outgoing.host}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  {t('account.manager.port')}:{' '}
                                </span>
                                <span className="font-mono">{account.outgoing.port}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  {t('account.manager.security')}:{' '}
                                </span>
                                <span
                                  className={cn(
                                    'text-xs px-1.5 py-0.5 rounded',
                                    account.outgoing.secure
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-yellow-100 text-yellow-700'
                                  )}
                                >
                                  {account.outgoing.secure
                                    ? 'SSL/TLS'
                                    : t('account.manager.noSecurity')}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {t('account.manager.noInfo')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Delete confirmation dialog */}
          {deleteConfirm && (
            <div className="mt-4 p-4 border border-red-200 bg-red-50 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800">
                    {t('account.manager.deleteConfirmTitle')}
                  </p>
                  <p className="text-sm text-red-600 mt-1">{deleteConfirm}</p>
                  <p className="text-xs text-red-500 mt-2">
                    {t('account.manager.deleteConfirmNote')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleConfirmDelete(deleteConfirm)}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Add account button */}
          <div className="mt-4 pt-4 border-t">
            <Button variant="outline" className="w-full" onClick={onAddAccount}>
              {t('account.manager.addNewAccount')}
            </Button>
          </div>
        </div>

        {/* Bottom button */}
        <div className="flex justify-end">
          <Button onClick={onClose}>{t('account.manager.close')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
