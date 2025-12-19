import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Plus, Pencil, Trash2, Folder, Inbox, Send, Check, X, AlertCircle } from 'lucide-react'

interface SubFolder {
  name: string
  path: string
}

interface MailboxSettingsProps {
  inboxSubFolders: SubFolder[]
  sentSubFolders: SubFolder[]
  onCreateSubFolder: (
    parentKey: string,
    folderName: string
  ) => Promise<{ success: boolean; error?: string }>
  onRenameSubFolder: (
    oldPath: string,
    newName: string
  ) => Promise<{ success: boolean; error?: string }>
  onDeleteSubFolder: (
    folderPath: string,
    confirmDeleteFilters?: boolean
  ) => Promise<{ success: boolean; error?: string; filtersCount?: number }>
}

export function MailboxSettings({
  inboxSubFolders,
  sentSubFolders,
  onCreateSubFolder,
  onRenameSubFolder,
  onDeleteSubFolder
}: MailboxSettingsProps) {
  const { t } = useTranslation()
  const [isAddingInbox, setIsAddingInbox] = useState(false)
  const [isAddingSent, setIsAddingSent] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFolder, setEditingFolder] = useState<{ path: string; name: string } | null>(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddFolder = async (parentKey: 'inbox' | 'sent') => {
    if (!newFolderName.trim()) return

    setIsProcessing(true)
    setError(null)

    const result = await onCreateSubFolder(parentKey, newFolderName.trim())

    if (result.success) {
      setNewFolderName('')
      setIsAddingInbox(false)
      setIsAddingSent(false)
    } else {
      setError(result.error || t('mailboxSettings.createFailed'))
    }

    setIsProcessing(false)
  }

  const handleRenameFolder = async () => {
    if (!editingFolder || !editFolderName.trim()) return

    setIsProcessing(true)
    setError(null)

    const result = await onRenameSubFolder(editingFolder.path, editFolderName.trim())

    if (result.success) {
      setEditingFolder(null)
      setEditFolderName('')
    } else {
      setError(result.error || t('mailboxSettings.renameFailed'))
    }

    setIsProcessing(false)
  }

  const handleDeleteFolder = async (path: string, name: string) => {
    setIsProcessing(true)
    setError(null)

    // 먼저 관련 필터가 있는지 확인 (confirmDeleteFilters = false)
    const checkResult = await onDeleteSubFolder(path, false)

    if (checkResult.filtersCount && checkResult.filtersCount > 0) {
      // 관련 필터가 있으면 경고 팝업 표시
      const confirmDelete = confirm(
        t('mailboxSettings.deleteConfirmWithFilters', { name, count: checkResult.filtersCount })
      )

      if (confirmDelete) {
        // 사용자가 확인하면 필터도 함께 삭제 (confirmDeleteFilters = true)
        const deleteResult = await onDeleteSubFolder(path, true)
        if (!deleteResult.success) {
          setError(deleteResult.error || t('mailboxSettings.deleteFailed'))
        }
      }
    } else if (!checkResult.success && checkResult.filtersCount === undefined) {
      // 필터 확인 결과가 아닌 실제 에러
      setError(checkResult.error || t('mailboxSettings.deleteFailed'))
    } else {
      // 관련 필터가 없는 경우 기존 확인 메시지
      if (confirm(t('mailboxSettings.deleteConfirm', { name }))) {
        const result = await onDeleteSubFolder(path, true)
        if (!result.success) {
          setError(result.error || t('mailboxSettings.deleteFailed'))
        }
      }
    }

    setIsProcessing(false)
  }

  const startEditing = (path: string, name: string) => {
    setEditingFolder({ path, name })
    setEditFolderName(name)
    setError(null)
  }

  const cancelEditing = () => {
    setEditingFolder(null)
    setEditFolderName('')
  }

  const cancelAdding = () => {
    setIsAddingInbox(false)
    setIsAddingSent(false)
    setNewFolderName('')
    setError(null)
  }

  const renderFolderList = (folders: SubFolder[], parentKey: 'inbox' | 'sent') => {
    const isAdding = parentKey === 'inbox' ? isAddingInbox : isAddingSent

    return (
      <div className="space-y-2">
        {folders.length === 0 && !isAdding && (
          <p className="text-sm text-muted-foreground py-2">{t('mailboxSettings.noSubfolders')}</p>
        )}

        {folders.map((folder) => (
          <div
            key={folder.path}
            className="flex items-center gap-2 rounded-md border bg-background p-3"
          >
            <Folder className="h-4 w-4 text-muted-foreground" />

            {editingFolder?.path === folder.path ? (
              <>
                <Input
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  className="h-8 flex-1"
                  disabled={isProcessing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameFolder()
                    if (e.key === 'Escape') cancelEditing()
                  }}
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleRenameFolder}
                  disabled={isProcessing || !editFolderName.trim()}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={cancelEditing}
                  disabled={isProcessing}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{folder.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => startEditing(folder.path, folder.name)}
                  disabled={isProcessing}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => handleDeleteFolder(folder.path, folder.name)}
                  disabled={isProcessing}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ))}

        {isAdding && (
          <div className="flex items-center gap-2 rounded-md border border-primary bg-background p-3">
            <Folder className="h-4 w-4 text-muted-foreground" />
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t('mailboxSettings.newFolderPlaceholder')}
              className="h-8 flex-1"
              disabled={isProcessing}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddFolder(parentKey)
                if (e.key === 'Escape') cancelAdding()
              }}
              autoFocus
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleAddFolder(parentKey)}
              disabled={isProcessing || !newFolderName.trim()}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={cancelAdding}
              disabled={isProcessing}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {!isAdding && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              setError(null)
              if (parentKey === 'inbox') {
                setIsAddingInbox(true)
                setIsAddingSent(false)
              } else {
                setIsAddingSent(true)
                setIsAddingInbox(false)
              }
            }}
            disabled={isProcessing}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('mailboxSettings.addFolder')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{t('mailboxSettings.title')}</h2>
      </div>

      {/* 내용 */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-4">
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

          {/* 받은메일함 하위 폴더 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Inbox className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{t('mailboxSettings.inbox.title')}</CardTitle>
              </div>
              <CardDescription>{t('mailboxSettings.inbox.desc')}</CardDescription>
            </CardHeader>
            <CardContent>{renderFolderList(inboxSubFolders, 'inbox')}</CardContent>
          </Card>

          {/* 보낸메일함 하위 폴더 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{t('mailboxSettings.sent.title')}</CardTitle>
              </div>
              <CardDescription>{t('mailboxSettings.sent.desc')}</CardDescription>
            </CardHeader>
            <CardContent>{renderFolderList(sentSubFolders, 'sent')}</CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
