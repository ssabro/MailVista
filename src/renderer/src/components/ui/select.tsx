import * as React from 'react'
import * as ReactDOM from 'react-dom'
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
  const labelsRef = React.useRef<Map<string, string>>(new Map())
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  const registerItem = React.useCallback((itemValue: string, label: string) => {
    labelsRef.current.set(itemValue, label)
  }, [])

  const getLabel = React.useCallback((itemValue: string) => {
    return labelsRef.current.get(itemValue)
  }, [])

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
  const [position, setPosition] = React.useState({ top: 0, left: 0, width: 0 })

  // 트리거 위치 계산
  React.useEffect(() => {
    if (context.open && context.triggerRef.current) {
      const rect = context.triggerRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      })
    }
  }, [context.open, context.triggerRef])

  if (!context.open) return null

  return ReactDOM.createPortal(
    <>
      {/* 백드롭 - 클릭하면 닫힘 */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99998
        }}
        onClick={(e) => {
          e.stopPropagation()
          context.setOpen(false)
        }}
      />
      {/* 드롭다운 컨텐츠 */}
      <div
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          width: position.width,
          zIndex: 99999
        }}
        className={cn(
          'max-h-60 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body
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
  }, [value, children, context])

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
