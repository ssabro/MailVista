import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Users,
  Folder
} from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Checkbox } from './ui/checkbox'
import { cn } from '@renderer/lib/utils'

interface Contact {
  id: string
  name: string
  email: string
  organization?: string
  phone?: string
  memo?: string
  groupIds: string[]
  createdAt: number
  updatedAt: number
}

interface ContactGroup {
  id: string
  name: string
  createdAt: number
}

interface SelectedContact {
  id: string
  name: string
  email: string
}

interface AddressBookDialogProps {
  open: boolean
  accountEmail: string
  onOpenChange: (open: boolean) => void
  initialTo?: SelectedContact[]
  initialCc?: SelectedContact[]
  initialBcc?: SelectedContact[]
  onConfirm: (to: SelectedContact[], cc: SelectedContact[], bcc: SelectedContact[]) => void
  onNavigateToAddressBook?: () => void
}

type RecipientType = 'to' | 'cc' | 'bcc'

export function AddressBookDialog({
  open,
  accountEmail,
  onOpenChange,
  initialTo = [],
  initialCc = [],
  initialBcc = [],
  onConfirm,
  onNavigateToAddressBook
}: AddressBookDialogProps) {
  const { t } = useTranslation()

  // Contact and group data
  const [contacts, setContacts] = React.useState<Contact[]>([])
  const [groups, setGroups] = React.useState<ContactGroup[]>([])
  const [loading, setLoading] = React.useState(true)

  // 선택된 그룹 (null = 전체)
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(null)

  // 검색어
  const [searchQuery, setSearchQuery] = React.useState('')

  // 페이지네이션
  const [currentPage, setCurrentPage] = React.useState(1)
  const itemsPerPage = 15

  // 선택된 수신자들
  const [toRecipients, setToRecipients] = React.useState<SelectedContact[]>(initialTo)
  const [ccRecipients, setCcRecipients] = React.useState<SelectedContact[]>(initialCc)
  const [bccRecipients, setBccRecipients] = React.useState<SelectedContact[]>(initialBcc)

  // 현재 활성화된 수신자 타입 (어디에 추가할지)
  const [activeRecipientType, setActiveRecipientType] = React.useState<RecipientType>('to')

  // 체크된 연락처들
  const [checkedContacts, setCheckedContacts] = React.useState<Set<string>>(new Set())

  // 데이터 로드
  React.useEffect(() => {
    if (open && accountEmail) {
      loadData()
      // 초기값 설정
      setToRecipients(initialTo)
      setCcRecipients(initialCc)
      setBccRecipients(initialBcc)
      setCheckedContacts(new Set())
      setSearchQuery('')
      setSelectedGroupId(null)
      setCurrentPage(1)
    }
  }, [open, accountEmail, initialTo, initialCc, initialBcc])

  const loadData = async () => {
    if (!accountEmail) return
    setLoading(true)
    try {
      const [contactsResult, groupsResult] = await Promise.all([
        window.electron.ipcRenderer.invoke('get-contacts', accountEmail),
        window.electron.ipcRenderer.invoke('get-contact-groups', accountEmail)
      ])

      // getContacts returns { contacts, total }
      if (contactsResult && contactsResult.contacts) {
        setContacts(contactsResult.contacts)
      }
      // getContactGroups returns ContactGroup[] directly
      if (Array.isArray(groupsResult)) {
        setGroups(groupsResult)
      }
    } catch (err) {
      console.error('Failed to load address book data:', err)
    } finally {
      setLoading(false)
    }
  }

  // 필터링된 연락처
  const filteredContacts = React.useMemo(() => {
    let result = contacts

    // 그룹 필터
    if (selectedGroupId) {
      result = result.filter((c) => c.groupIds.includes(selectedGroupId))
    }

    // 검색 필터
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query) ||
          (c.organization && c.organization.toLowerCase().includes(query))
      )
    }

    return result
  }, [contacts, selectedGroupId, searchQuery])

  // 페이지네이션
  const totalPages = Math.ceil(filteredContacts.length / itemsPerPage)
  const paginatedContacts = filteredContacts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  // 그룹별 연락처 수
  const getGroupContactCount = (groupId: string) => {
    return contacts.filter((c) => c.groupIds.includes(groupId)).length
  }

  // 체크박스 토글
  const toggleContactCheck = (contactId: string) => {
    setCheckedContacts((prev) => {
      const next = new Set(prev)
      if (next.has(contactId)) {
        next.delete(contactId)
      } else {
        next.add(contactId)
      }
      return next
    })
  }

  // 전체 선택/해제
  const toggleAllContacts = () => {
    if (checkedContacts.size === paginatedContacts.length) {
      setCheckedContacts(new Set())
    } else {
      setCheckedContacts(new Set(paginatedContacts.map((c) => c.id)))
    }
  }

  // 선택된 연락처를 수신자 목록에 추가
  const addSelectedToRecipients = () => {
    const selectedContacts = contacts.filter((c) => checkedContacts.has(c.id))
    const newRecipients: SelectedContact[] = selectedContacts.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email
    }))

    switch (activeRecipientType) {
      case 'to':
        setToRecipients((prev) => {
          const existingIds = new Set(prev.map((r) => r.email))
          return [...prev, ...newRecipients.filter((r) => !existingIds.has(r.email))]
        })
        break
      case 'cc':
        setCcRecipients((prev) => {
          const existingIds = new Set(prev.map((r) => r.email))
          return [...prev, ...newRecipients.filter((r) => !existingIds.has(r.email))]
        })
        break
      case 'bcc':
        setBccRecipients((prev) => {
          const existingIds = new Set(prev.map((r) => r.email))
          return [...prev, ...newRecipients.filter((r) => !existingIds.has(r.email))]
        })
        break
    }

    setCheckedContacts(new Set())
  }

  // 연락처 클릭 시 바로 추가
  const handleContactClick = (contact: Contact) => {
    const newRecipient: SelectedContact = {
      id: contact.id,
      name: contact.name,
      email: contact.email
    }

    switch (activeRecipientType) {
      case 'to':
        if (!toRecipients.some((r) => r.email === contact.email)) {
          setToRecipients((prev) => [...prev, newRecipient])
        }
        break
      case 'cc':
        if (!ccRecipients.some((r) => r.email === contact.email)) {
          setCcRecipients((prev) => [...prev, newRecipient])
        }
        break
      case 'bcc':
        if (!bccRecipients.some((r) => r.email === contact.email)) {
          setBccRecipients((prev) => [...prev, newRecipient])
        }
        break
    }
  }

  // 수신자 제거
  const removeRecipient = (type: RecipientType, email: string) => {
    switch (type) {
      case 'to':
        setToRecipients((prev) => prev.filter((r) => r.email !== email))
        break
      case 'cc':
        setCcRecipients((prev) => prev.filter((r) => r.email !== email))
        break
      case 'bcc':
        setBccRecipients((prev) => prev.filter((r) => r.email !== email))
        break
    }
  }

  // 확인 버튼 클릭
  const handleConfirm = () => {
    onConfirm(toRecipients, ccRecipients, bccRecipients)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[600px] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-center gap-4">
            <DialogTitle className="text-xl absolute left-6">
              {t('addressBook.mailAddressBook')}
            </DialogTitle>
            {/* Search - center */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder={t('addressBook.searchEmailAddress')}
                className="h-9 w-72 pl-9 pr-4 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: Group list */}
          <div className="w-52 border-r overflow-y-auto bg-muted/30">
            <div className="p-2">
              {/* All */}
              <button
                onClick={() => {
                  setSelectedGroupId(null)
                  setCurrentPage(1)
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-left',
                  selectedGroupId === null ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
              >
                <Users className="h-4 w-4" />
                <span className="flex-1">{t('addressBook.all')}</span>
                <span className="text-xs opacity-70">{contacts.length}</span>
              </button>

              {/* Group list */}
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => {
                    setSelectedGroupId(group.id)
                    setCurrentPage(1)
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-left',
                    selectedGroupId === group.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  <Folder className="h-4 w-4" />
                  <span className="flex-1 truncate">@{group.name}</span>
                  <span className="text-xs opacity-70">{getGroupContactCount(group.id)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Center: Contact list */}
          <div className="flex-1 flex flex-col border-r">
            {/* Select all */}
            <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20">
              <Checkbox
                checked={
                  paginatedContacts.length > 0 && checkedContacts.size === paginatedContacts.length
                }
                onCheckedChange={toggleAllContacts}
              />
              <span className="text-sm text-muted-foreground">{t('addressBook.all')}</span>
              {checkedContacts.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7 text-xs"
                  onClick={addSelectedToRecipients}
                >
                  {t('addressBook.addSelected')}
                </Button>
              )}
            </div>

            {/* Contact list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('addressBook.loading')}
                </div>
              ) : paginatedContacts.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('addressBook.noContacts')}
                </div>
              ) : (
                <div className="divide-y">
                  {paginatedContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50 cursor-pointer"
                      onClick={() => handleContactClick(contact)}
                    >
                      <Checkbox
                        checked={checkedContacts.has(contact.id)}
                        onCheckedChange={() => toggleContactCheck(contact.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">
                          {contact.name && <span className="font-medium">{contact.name} </span>}
                          <span className="text-muted-foreground">&lt;{contact.email}&gt;</span>
                        </div>
                        {contact.organization && (
                          <div className="text-xs text-muted-foreground truncate">
                            {contact.organization}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 py-2 border-t">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (currentPage <= 3) {
                    pageNum = i + 1
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = currentPage - 2 + i
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? 'default' : 'ghost'}
                      size="icon"
                      className="h-7 w-7 text-xs"
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  )
                })}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Right: Selected recipients */}
          <div className="w-64 flex flex-col bg-muted/10">
            {/* To */}
            <div
              className={cn(
                'flex-1 flex flex-col border-b cursor-pointer',
                activeRecipientType === 'to' && 'bg-blue-50'
              )}
              onClick={() => setActiveRecipientType('to')}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b bg-background">
                <span className="text-sm font-medium">{t('addressBook.recipients')}</span>
                <span className="text-sm text-primary">{toRecipients.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {toRecipients.map((recipient) => (
                  <div
                    key={recipient.email}
                    className="flex items-center justify-between gap-2 px-2 py-1 bg-background rounded text-xs"
                  >
                    <span className="truncate">
                      {recipient.name} &lt;{recipient.email}&gt;
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeRecipient('to', recipient.email)
                      }}
                      className="flex-shrink-0 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* CC */}
            <div
              className={cn(
                'flex-1 flex flex-col border-b cursor-pointer',
                activeRecipientType === 'cc' && 'bg-blue-50'
              )}
              onClick={() => setActiveRecipientType('cc')}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b bg-background">
                <span className="text-sm font-medium">{t('addressBook.cc')}</span>
                <span className="text-sm text-primary">{ccRecipients.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {ccRecipients.map((recipient) => (
                  <div
                    key={recipient.email}
                    className="flex items-center justify-between gap-2 px-2 py-1 bg-background rounded text-xs"
                  >
                    <span className="truncate">
                      {recipient.name} &lt;{recipient.email}&gt;
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeRecipient('cc', recipient.email)
                      }}
                      className="flex-shrink-0 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* BCC */}
            <div
              className={cn(
                'flex-1 flex flex-col cursor-pointer',
                activeRecipientType === 'bcc' && 'bg-blue-50'
              )}
              onClick={() => setActiveRecipientType('bcc')}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b bg-background">
                <span className="text-sm font-medium">{t('addressBook.bcc')}</span>
                <span className="text-sm text-primary">{bccRecipients.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {bccRecipients.map((recipient) => (
                  <div
                    key={recipient.email}
                    className="flex items-center justify-between gap-2 px-2 py-1 bg-background rounded text-xs"
                  >
                    <span className="truncate">
                      {recipient.name} &lt;{recipient.email}&gt;
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeRecipient('bcc', recipient.email)
                      }}
                      className="flex-shrink-0 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom info and buttons */}
        <div className="px-6 py-4 border-t bg-muted/20">
          <p className="text-xs text-muted-foreground mb-3">{t('addressBook.recipientHint')}</p>
          <div className="flex items-center justify-between">
            <div />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleConfirm}>{t('common.confirm')}</Button>
            </div>
            <button
              onClick={() => {
                onOpenChange(false)
                onNavigateToAddressBook?.()
              }}
              className="text-sm text-primary hover:underline"
            >
              {t('addressBook.manageAddressBook')} &gt;
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
