import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Plus, Pencil, Trash2, Tag, X, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'

interface TagData {
  id: string
  name: string
  color: string
  createdAt: number
}

interface TagSettingsProps {
  accountEmail: string
}

const DEFAULT_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6b7280' // gray
]

export function TagSettings({ accountEmail }: TagSettingsProps) {
  const { t } = useTranslation()
  const [tags, setTags] = useState<TagData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 태그 추가 다이얼로그
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(DEFAULT_COLORS[0])

  // 태그 수정 다이얼로그
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<TagData | null>(null)
  const [editTagName, setEditTagName] = useState('')
  const [editTagColor, setEditTagColor] = useState('')

  // 삭제 확인 다이얼로그
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deletingTag, setDeletingTag] = useState<TagData | null>(null)

  const [isProcessing, setIsProcessing] = useState(false)

  // 태그 목록 로드
  const loadTags = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('tag-get-all', accountEmail)
      setTags(result)
    } catch (err) {
      setError(t('tagSettings.loadError'))
      console.error('Failed to load tags:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (accountEmail) {
      loadTags()
    }
  }, [accountEmail])

  // 태그 추가
  const handleAddTag = async () => {
    if (!newTagName.trim()) return

    setIsProcessing(true)
    setError(null)

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'tag-create',
        accountEmail,
        newTagName.trim(),
        newTagColor
      )

      if (result.success) {
        setIsAddDialogOpen(false)
        setNewTagName('')
        setNewTagColor(DEFAULT_COLORS[0])
        await loadTags()
      } else {
        setError(result.error || t('tagSettings.createError'))
      }
    } catch (err) {
      setError(t('tagSettings.createError'))
      console.error('Failed to create tag:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  // 태그 수정
  const handleEditTag = async () => {
    if (!editingTag || !editTagName.trim()) return

    setIsProcessing(true)
    setError(null)

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'tag-update',
        accountEmail,
        editingTag.id,
        {
          name: editTagName.trim(),
          color: editTagColor
        }
      )

      if (result.success) {
        setIsEditDialogOpen(false)
        setEditingTag(null)
        await loadTags()
      } else {
        setError(result.error || t('tagSettings.updateError'))
      }
    } catch (err) {
      setError(t('tagSettings.updateError'))
      console.error('Failed to update tag:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  // 태그 삭제
  const handleDeleteTag = async () => {
    if (!deletingTag) return

    setIsProcessing(true)
    setError(null)

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'tag-delete',
        accountEmail,
        deletingTag.id
      )

      if (result.success) {
        setIsDeleteDialogOpen(false)
        setDeletingTag(null)
        await loadTags()
      } else {
        setError(result.error || t('tagSettings.deleteError'))
      }
    } catch (err) {
      setError(t('tagSettings.deleteError'))
      console.error('Failed to delete tag:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  // 수정 다이얼로그 열기
  const openEditDialog = (tag: TagData) => {
    setEditingTag(tag)
    setEditTagName(tag.name)
    setEditTagColor(tag.color)
    setIsEditDialogOpen(true)
  }

  // 삭제 다이얼로그 열기
  const openDeleteDialog = (tag: TagData) => {
    setDeletingTag(tag)
    setIsDeleteDialogOpen(true)
  }

  // 색상 선택 컴포넌트
  const ColorPicker = ({
    selectedColor,
    onColorChange
  }: {
    selectedColor: string
    onColorChange: (color: string) => void
  }) => (
    <div className="flex flex-wrap gap-2">
      {DEFAULT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`w-8 h-8 rounded-full border-2 transition-all ${
            selectedColor === color ? 'border-foreground scale-110' : 'border-transparent'
          }`}
          style={{ backgroundColor: color }}
          onClick={() => onColorChange(color)}
        />
      ))}
    </div>
  )

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{t('tagSettings.title')}</h2>
        <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('tagSettings.addTag')}
        </Button>
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

          {/* 태그 카드 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{t('tagSettings.manageTitle')}</CardTitle>
              </div>
              <CardDescription>{t('tagSettings.manageDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {tags.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">{t('tagSettings.noTags')}</p>
                ) : (
                  tags.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center gap-3 rounded-md border bg-background p-3"
                    >
                      <div
                        className="h-4 w-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="flex-1 text-sm font-medium">{tag.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(tag)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => openDeleteDialog(tag)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* 사용 안내 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('tagSettings.usageTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>{t('tagSettings.usageTip1')}</li>
                <li>{t('tagSettings.usageTip2')}</li>
                <li>{t('tagSettings.usageTip3')}</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 태그 추가 다이얼로그 */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tagSettings.addDialogTitle')}</DialogTitle>
            <DialogDescription>{t('tagSettings.addDialogDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('tagSettings.tagName')}</label>
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder={t('tagSettings.tagNamePlaceholder')}
                disabled={isProcessing}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('tagSettings.tagColor')}</label>
              <ColorPicker selectedColor={newTagColor} onColorChange={setNewTagColor} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddDialogOpen(false)}
              disabled={isProcessing}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleAddTag} disabled={isProcessing || !newTagName.trim()}>
              {isProcessing ? t('common.processing') : t('tagSettings.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 태그 수정 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tagSettings.editDialogTitle')}</DialogTitle>
            <DialogDescription>{t('tagSettings.editDialogDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('tagSettings.tagName')}</label>
              <Input
                value={editTagName}
                onChange={(e) => setEditTagName(e.target.value)}
                placeholder={t('tagSettings.tagNamePlaceholder')}
                disabled={isProcessing}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('tagSettings.tagColor')}</label>
              <ColorPicker selectedColor={editTagColor} onColorChange={setEditTagColor} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isProcessing}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleEditTag} disabled={isProcessing || !editTagName.trim()}>
              {isProcessing ? t('common.processing') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tagSettings.deleteDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('tagSettings.deleteDialogDesc', { name: deletingTag?.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isProcessing}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteTag} disabled={isProcessing}>
              {isProcessing ? t('common.processing') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
