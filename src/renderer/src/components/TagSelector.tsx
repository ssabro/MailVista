import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Tag, Check, Plus } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

interface TagData {
  id: string
  name: string
  color: string
}

interface TagSelectorProps {
  accountEmail: string
  folderPath: string
  uid: number
  assignedTagIds: string[]
  onTagsChange?: (tagIds: string[]) => void
  disabled?: boolean
  variant?: 'icon' | 'badge' | 'full'
  className?: string
}

export function TagSelector({
  accountEmail,
  folderPath,
  uid,
  assignedTagIds,
  onTagsChange,
  disabled = false,
  variant = 'icon',
  className
}: TagSelectorProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [tags, setTags] = useState<TagData[]>([])
  const [localAssignedTags, setLocalAssignedTags] = useState<string[]>(assignedTagIds)
  const [isLoading, setIsLoading] = useState(false)

  // 태그 목록 로드
  useEffect(() => {
    const loadTags = async () => {
      if (!accountEmail) return
      try {
        const result = await window.electron.ipcRenderer.invoke('tag-get-all', accountEmail)
        setTags(result)
      } catch (err) {
        console.error('Failed to load tags:', err)
      }
    }
    loadTags()
  }, [accountEmail])

  // 외부에서 assignedTagIds가 변경되면 동기화
  useEffect(() => {
    setLocalAssignedTags(assignedTagIds)
  }, [assignedTagIds])

  // 태그 토글
  const handleToggleTag = async (tagId: string) => {
    if (isLoading) return

    setIsLoading(true)
    try {
      const isAssigned = localAssignedTags.includes(tagId)

      if (isAssigned) {
        // 태그 제거
        const result = await window.electron.ipcRenderer.invoke(
          'tag-remove',
          accountEmail,
          folderPath,
          uid,
          tagId
        )
        if (result.success) {
          const newTags = localAssignedTags.filter((id) => id !== tagId)
          setLocalAssignedTags(newTags)
          onTagsChange?.(newTags)
        }
      } else {
        // 태그 할당
        const result = await window.electron.ipcRenderer.invoke(
          'tag-assign',
          accountEmail,
          folderPath,
          uid,
          tagId
        )
        if (result.success) {
          const newTags = [...localAssignedTags, tagId]
          setLocalAssignedTags(newTags)
          onTagsChange?.(newTags)
        }
      }
    } catch (err) {
      console.error('Failed to toggle tag:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // 할당된 태그 정보 가져오기
  const assignedTags = tags.filter((tag) => localAssignedTags.includes(tag.id))

  // 트리거 버튼 렌더링
  const renderTrigger = () => {
    if (variant === 'badge' && assignedTags.length > 0) {
      return (
        <div className={cn('flex items-center gap-1 flex-wrap', className)}>
          {assignedTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
          <Button variant="ghost" size="icon" className="h-5 w-5" disabled={disabled}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      )
    }

    if (variant === 'full') {
      return (
        <Button variant="outline" size="sm" className={cn('gap-2', className)} disabled={disabled}>
          <Tag className="h-4 w-4" />
          {assignedTags.length > 0 ? (
            <span className="flex items-center gap-1">
              {assignedTags.slice(0, 2).map((tag) => (
                <span
                  key={tag.id}
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
              ))}
              {assignedTags.length > 2 && (
                <span className="text-xs text-muted-foreground">+{assignedTags.length - 2}</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{t('tagSelector.addTag')}</span>
          )}
        </Button>
      )
    }

    // Default: icon variant
    return (
      <Button variant="ghost" size="icon" className={cn('h-7 w-7', className)} disabled={disabled}>
        <Tag
          className={cn(
            'h-4 w-4',
            assignedTags.length > 0 ? 'text-primary' : 'text-muted-foreground'
          )}
        />
      </Button>
    )
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {renderTrigger()}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="p-2 border-b">
          <p className="text-sm font-medium">{t('tagSelector.title')}</p>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {tags.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">
              {t('tagSelector.noTags')}
            </div>
          ) : (
            <div className="p-1">
              {tags.map((tag) => {
                const isAssigned = localAssignedTags.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm',
                      'hover:bg-muted/50 transition-colors',
                      isAssigned && 'bg-muted/30'
                    )}
                    onClick={() => handleToggleTag(tag.id)}
                    disabled={isLoading}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1 text-left">{tag.name}</span>
                    {isAssigned && <Check className="h-4 w-4 text-primary" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// 태그 배지 표시용 컴포넌트 (읽기 전용)
interface TagBadgesProps {
  tags: TagData[]
  maxDisplay?: number
  className?: string
}

export function TagBadges({ tags, maxDisplay = 3, className }: TagBadgesProps) {
  if (tags.length === 0) return null

  const displayTags = tags.slice(0, maxDisplay)
  const remainingCount = tags.length - maxDisplay

  return (
    <div className={cn('flex items-center gap-1 flex-wrap', className)}>
      {displayTags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
          style={{ backgroundColor: tag.color }}
          title={tag.name}
        >
          {tag.name}
        </span>
      ))}
      {remainingCount > 0 && (
        <span className="text-[10px] text-muted-foreground">+{remainingCount}</span>
      )}
    </div>
  )
}
