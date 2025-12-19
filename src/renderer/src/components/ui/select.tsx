import * as React from 'react'
import { cn } from '@renderer/lib/utils'
import { ChevronDown } from 'lucide-react'

interface SelectContextValue {
  value: string
  onValueChange: (value: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  registerItem: (value: string, label: string) => void
  getLabel: (value: string) => string | undefined
  triggerRef: React.RefObject<HTMLButtonElement | null>
  selectItem: (value: string) => void
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

interface SelectProps {
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
}

function Select({ value = '', onValueChange, children }: SelectProps) {
  const [open, setOpen] = React.useState(false)
  const [labels, setLabels] = React.useState<Map<string, string>>(new Map())
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  const registerItem = React.useCallback((itemValue: string, label: string) => {
    setLabels((prev) => {
      if (prev.get(itemValue) === label) return prev
      const next = new Map(prev)
      next.set(itemValue, label)
      return next
    })
  }, [])

  const getLabel = React.useCallback(
    (itemValue: string) => {
      return labels.get(itemValue)
    },
    [labels]
  )

  const selectItem = React.useCallback(
    (itemValue: string) => {
      onValueChange?.(itemValue)
      setOpen(false)
    },
    [onValueChange]
  )

  return (
    <SelectContext.Provider
      value={{
        value,
        onValueChange: onValueChange || (() => {}),
        open,
        setOpen,
        registerItem,
        getLabel,
        triggerRef,
        selectItem
      }}
    >
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  )
}

interface SelectTriggerProps {
  className?: string
  children: React.ReactNode
}

function SelectTrigger({ className, children }: SelectTriggerProps) {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error('SelectTrigger must be used within Select')

  return (
    <button
      ref={context.triggerRef}
      type="button"
      onClick={() => context.setOpen(!context.open)}
      className={cn(
        'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  )
}

interface SelectValueProps {
  placeholder?: string
}

function SelectValue({ placeholder }: SelectValueProps) {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error('SelectValue must be used within Select')

  const label = context.getLabel(context.value)
  return <span>{label || context.value || placeholder}</span>
}

interface SelectContentProps {
  children: React.ReactNode
  className?: string
}

function SelectContent({ children, className }: SelectContentProps) {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error('SelectContent must be used within Select')
  const contentRef = React.useRef<HTMLDivElement>(null)

  // 외부 클릭 감지하여 닫기
  React.useEffect(() => {
    if (!context.open) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(e.target as Node) &&
        context.triggerRef.current &&
        !context.triggerRef.current.contains(e.target as Node)
      ) {
        context.setOpen(false)
      }
    }

    // 약간의 지연 후 이벤트 리스너 추가 (클릭으로 열릴 때 바로 닫히는 것 방지)
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [context.open, context.triggerRef])

  // 항상 children을 렌더링하여 라벨 등록이 되도록 함 (숨김 상태로)
  // 이렇게 해야 SelectValue에서 올바른 라벨을 표시할 수 있음
  return (
    <>
      {/* 라벨 등록용 숨김 렌더링 */}
      <div style={{ display: 'none' }}>{children}</div>

      {/* 실제 드롭다운 (열려있을 때만 표시) - 인라인 렌더링 */}
      {context.open && (
        <div
          ref={contentRef}
          className={cn(
            'absolute left-0 top-full mt-1 w-full z-50 max-h-60 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </>
  )
}

interface SelectItemProps {
  value: string
  children: React.ReactNode
}

function SelectItem({ value, children }: SelectItemProps) {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error('SelectItem must be used within Select')

  // 컴포넌트 마운트 시 label 등록
  React.useEffect(() => {
    const label = typeof children === 'string' ? children : String(children)
    context.registerItem(value, label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, children])

  const isSelected = context.value === value

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    context.selectItem(value)
  }

  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={handleClick}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
        isSelected && 'bg-accent text-accent-foreground'
      )}
    >
      {children}
    </div>
  )
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
