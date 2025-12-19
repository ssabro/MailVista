import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, Search, ChevronDown, X } from 'lucide-react'
import { Button } from './components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from './components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger } from './components/ui/select'
import { Checkbox } from './components/ui/checkbox'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { EmailList, DetailedSearchParams } from './components/EmailList'
import { ComposeEmail } from './components/ComposeEmail'
import { EmailView } from './components/EmailView'
import { AccountSetup } from './components/AccountSetup'
import { BasicSettings } from './components/BasicSettings'
import { FilterSettings } from './components/FilterSettings'
import { SignatureSettings } from './components/SignatureSettings'
import { SpamSettings } from './components/SpamSettings'
import { EncryptionSettings } from './components/EncryptionSettings'
import { LLMSettings } from './components/LLMSettings'
import { TemplateSettings } from './components/TemplateSettings'
import { AddressBook } from './components/AddressBook'
import { AccountManagerModal } from './components/AccountManagerModal'
import { LanguageSelector } from './components/LanguageSelector'
import { AutoClassifyDialog } from './components/AutoClassifyDialog'
import { GlobalSettings } from './components/GlobalSettings'
import { SyncStatusBar } from './components/SyncStatus'
import { LockScreen } from './components/LockScreen'
import { PinScreen } from './components/PinScreen'

type AppView = 'mail' | 'contacts'
type ViewType = 'list' | 'compose' | 'view'
type SettingsView =
  | 'settings-general'
  | 'settings-ai'
  | 'settings-filter'
  | 'settings-signature'
  | 'settings-template'
  | 'settings-spam'
  | 'settings-e2e'
  | null
type ComposeMode = 'compose' | 'reply' | 'replyAll' | 'forward' | 'toSelf'

interface ComposeData {
  to: string
  cc: string
  subject: string
  content: string
  mode: ComposeMode
}
type AppState = 'loading' | 'setup' | 'main'

interface EmailAddress {
  name: string
  address: string
}

interface EmailHeader {
  uid: number
  messageId: string
  subject: string
  from: EmailAddress[]
  to: EmailAddress[]
  date: Date
  flags: string[]
  hasAttachment: boolean
  folder?: string // 필터 검색에서 이메일이 속한 폴더
}

interface EmailFull extends EmailHeader {
  cc?: EmailAddress[]
  html?: string
  text?: string
  attachments: {
    filename: string
    contentType: string
    size: number
    contentId?: string
    partId?: string
    encoding?: string
  }[]
}

interface MailFolder {
  name: string
  path: string
  delimiter: string
  flags: string[]
  specialUse?: string
  children?: MailFolder[]
}

interface FolderInfo {
  path: string
  total: number
  unseen: number
}

interface AccountConfig {
  email: string
  password: string
  name: string
  protocol: 'imap'
  incoming: {
    host: string
    port: number
    secure: boolean
  }
  outgoing: {
    host: string
    port: number
    secure: boolean
  }
}

// 폴더 매핑 (IMAP 폴더명 -> 앱 폴더 키)
const FOLDER_MAP: Record<string, string> = {
  INBOX: 'inbox',
  Sent: 'sent',
  보낸편지함: 'sent',
  'Sent Messages': 'sent',
  Drafts: 'drafts',
  임시보관함: 'drafts',
  DRAFTBOX: 'drafts',
  Trash: 'trash',
  휴지통: 'trash',
  'Deleted Messages': 'trash',
  Junk: 'spam',
  스팸메일함: 'spam',
  스팸함: 'spam',
  Spam: 'spam',
  SPAMBOX: 'spam',
  내게쓴메일함: 'self',
  TOME: 'self',
  ARCHIVING: 'scheduled',
  예약메일함: 'scheduled'
}

// 역매핑 (앱 폴더 키 -> 기본 IMAP 폴더명)
const REVERSE_FOLDER_MAP: Record<string, string[]> = {
  inbox: ['INBOX'],
  sent: ['Sent', '보낸편지함', 'Sent Messages', 'Sent Items'],
  drafts: ['Drafts', '임시보관함', 'DRAFTBOX'],
  trash: ['Trash', '휴지통', 'Deleted Messages', 'Deleted Items', '[Gmail]/휴지통', '[Gmail]/Trash'],
  spam: ['Junk', '스팸메일함', '스팸함', 'Spam', 'SPAMBOX', '[Gmail]/스팸', '[Gmail]/Spam'],
  self: ['내게쓴메일함', 'TOME'],
  scheduled: ['ARCHIVING', '예약메일함']
}

type FolderType = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'other'

// 폴더 경로로 폴더 타입 결정
function getFolderType(folderPath: string): FolderType {
  const folderName = folderPath.split('/').pop() || folderPath
  const mappedType = FOLDER_MAP[folderName]

  if (mappedType === 'inbox') return 'inbox'
  if (mappedType === 'sent') return 'sent'
  if (mappedType === 'drafts') return 'drafts'
  if (mappedType === 'trash') return 'trash'
  if (mappedType === 'spam') return 'spam'

  return 'other'
}

function App(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [showLanguageSelector, setShowLanguageSelector] = React.useState(false)
  const [appState, setAppState] = React.useState<AppState>('loading')
  const [appView, setAppView] = React.useState<AppView>('mail')
  const [currentView, setCurrentView] = React.useState<ViewType>('list')
  const [selectedEmail, setSelectedEmail] = React.useState<EmailFull | null>(null)
  const [currentFolder, setCurrentFolder] = React.useState('INBOX')
  const [currentAccount, setCurrentAccount] = React.useState<string>('')
  const [composeData, setComposeData] = React.useState<ComposeData | null>(null)
  const [settingsView, setSettingsView] = React.useState<SettingsView>(null)
  const [emailsPerPage, setEmailsPerPage] = React.useState(20)
  const [viewMode, setViewMode] = React.useState<'list' | 'split'>('list')
  const [splitPanelWidth, setSplitPanelWidth] = React.useState(400)
  const [isResizing, setIsResizing] = React.useState(false)
  const splitContainerRef = React.useRef<HTMLDivElement>(null)
  const [splitDetailedSearchOpen, setSplitDetailedSearchOpen] = React.useState(false)
  const [splitGlobalFilter, setSplitGlobalFilter] = React.useState('')
  const [viewDetailedSearchOpen, setViewDetailedSearchOpen] = React.useState(false)
  const [viewDetailedSearch, setViewDetailedSearch] = React.useState<DetailedSearchParams>({
    sender: '',
    recipientType: 'to',
    recipient: '',
    contentType: 'all',
    content: '',
    mailbox: 'all',
    periodType: 'all',
    startDate: '',
    endDate: '',
    hasAttachment: false,
    includeTrashSpam: false
  })

  // 분할 보기 리사이즈 핸들러
  const handleResizeStart = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  React.useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!splitContainerRef.current) return
      const containerRect = splitContainerRef.current.getBoundingClientRect()
      const newWidth = e.clientX - containerRect.left
      // 최소 250px, 최대 컨테이너의 60%
      const minWidth = 250
      const maxWidth = containerRect.width * 0.6
      setSplitPanelWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  // 멀티계정 상태
  const [accounts, setAccounts] = React.useState<AccountConfig[]>([])
  const [accountUnreadCounts, setAccountUnreadCounts] = React.useState<Record<string, number>>({})
  const [isAccountManagerOpen, setIsAccountManagerOpen] = React.useState(false)
  const [isAddingAccount, setIsAddingAccount] = React.useState(false)

  // 자동 분류 다이얼로그 상태
  const [isAutoClassifyDialogOpen, setIsAutoClassifyDialogOpen] = React.useState(false)
  const [autoClassifySenderEmail, setAutoClassifySenderEmail] = React.useState('')

  // 글로벌 설정 다이얼로그 상태
  const [isGlobalSettingsOpen, setIsGlobalSettingsOpen] = React.useState(false)

  // 잠금 화면 상태
  const [isLocked, setIsLocked] = React.useState(false)
  const [isPinEnabledForLock, setIsPinEnabledForLock] = React.useState(false) // 잠금 해제 시 PIN 필요 여부
  const lastActivityRef = React.useRef<number>(Date.now())

  // PIN 인증 상태
  const [isPinVerified, setIsPinVerified] = React.useState(false)
  const [isPinRequired, setIsPinRequired] = React.useState(false)

  // 이메일 데이터 상태
  const [folders, setFolders] = React.useState<MailFolder[]>([])
  const [folderInfos, setFolderInfos] = React.useState<Record<string, FolderInfo>>({})
  const [emails, setEmails] = React.useState<EmailHeader[]>([])
  const [totalEmails, setTotalEmails] = React.useState(0)
  const [isLoadingEmails, setIsLoadingEmails] = React.useState(false)
  const [isSwitchingAccount, setIsSwitchingAccount] = React.useState(false)
  const [currentPage, setCurrentPage] = React.useState(1)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [isSearching, setIsSearching] = React.useState(false)
  const [detailedSearchParams, setDetailedSearchParams] =
    React.useState<DetailedSearchParams | null>(null)
  const [selectedEmailIndex, setSelectedEmailIndex] = React.useState(-1)
  const [showUnreadOnly, setShowUnreadOnly] = React.useState(false) // 안읽은 메일만 필터링
  const [isLoadingContent, setIsLoadingContent] = React.useState(false) // 이메일 본문 로딩 중

  // 안읽은 메일만 필터링된 목록
  // Note: showUnreadOnly일 때 서버에서 이미 필터링되어 반환되므로 클라이언트 추가 필터링 불필요
  const filteredEmails = React.useMemo(() => {
    return emails
  }, [emails])

  // 새 메일 폴링 상태
  const [isSyncing, setIsSyncing] = React.useState(false)
  const [lastSyncTime, setLastSyncTime] = React.useState<Date | null>(null)
  const [isInitialized, setIsInitialized] = React.useState(false) // 초기화 완료 여부
  const [pollingInterval, setPollingInterval] = React.useState(30000) // 동기화 주기 (ms), 기본값 30초

  // 계정 목록 로드 함수
  const loadAccounts = async () => {
    try {
      const accountList = await window.electron.ipcRenderer.invoke('get-accounts')
      if (accountList && accountList.length > 0) {
        setAccounts(accountList)

        // 각 계정의 INBOX 읽지 않은 메일 수 병렬로 가져오기 (Local-First)
        const unreadCountPromises = accountList.map(async (account) => {
          try {
            // 먼저 로컬 DB에서 조회
            let infoResult = await window.electron.ipcRenderer.invoke(
              'get-folder-info-local',
              account.email,
              'INBOX'
            )
            // 로컬에 데이터가 없으면 서버에서 가져오기
            if (!infoResult.success || (infoResult.total === 0 && infoResult.unseen === 0)) {
              infoResult = await window.electron.ipcRenderer.invoke(
                'get-folder-info',
                account.email,
                'INBOX'
              )
            }
            return {
              email: account.email,
              unseen: infoResult.success ? infoResult.unseen || 0 : 0
            }
          } catch (e) {
            console.error(`Failed to get unread count for ${account.email}:`, e)
            return { email: account.email, unseen: 0 }
          }
        })

        const unreadResults = await Promise.all(unreadCountPromises)
        const unreadCounts: Record<string, number> = {}
        for (const result of unreadResults) {
          unreadCounts[result.email] = result.unseen
        }
        setAccountUnreadCounts(unreadCounts)

        return accountList
      }
      return []
    } catch (error) {
      console.error('Failed to load accounts:', error)
      return []
    }
  }

  // 앱 시작 시 언어 설정 및 계정 확인
  React.useEffect(() => {
    const initApp = async () => {
      try {
        // 글로벌 설정 확인 (언어 등)
        const globalSettings = await window.electron.ipcRenderer.invoke('get-global-settings')

        // 저장된 언어 설정 적용
        if (globalSettings?.language) {
          await i18n.changeLanguage(globalSettings.language)
        }

        // PIN 코드 확인
        const pinEnabled = await window.electron.ipcRenderer.invoke('is-pin-enabled')
        if (pinEnabled) {
          setIsPinRequired(true)
          setAppState('loading') // PIN 인증 전까지 로딩 상태 유지
          return
        }

        // 언어 선택이 아직 안 됐으면 언어 선택 모달 표시
        if (!globalSettings?.languageSelected) {
          setShowLanguageSelector(true)
          setAppState('loading') // 언어 선택 중에는 로딩 상태 유지
          return
        }

        // 계정 확인
        const hasAccounts = await window.electron.ipcRenderer.invoke('has-accounts')
        if (hasAccounts) {
          const accountList = await loadAccounts()
          if (accountList && accountList.length > 0) {
            // 기본 계정이 있으면 그것을, 없으면 첫 번째 계정 선택
            const defaultAccount = accountList.find((a: AccountConfig) => (a as any).isDefault)
            const selectedAccount = defaultAccount?.email || accountList[0].email
            setCurrentAccount(selectedAccount)
            setAppState('main')
          } else {
            setAppState('setup')
          }
        } else {
          setAppState('setup')
        }
      } catch (error) {
        console.error('Failed to initialize app:', error)
        setAppState('setup')
      }
    }

    initApp()
  }, [])

  // 언어 선택 완료 핸들러
  const handleLanguageSelected = async () => {
    setShowLanguageSelector(false)

    // 계정 확인 후 적절한 상태로 전환
    try {
      const hasAccounts = await window.electron.ipcRenderer.invoke('has-accounts')
      if (hasAccounts) {
        const accountList = await loadAccounts()
        if (accountList && accountList.length > 0) {
          const defaultAccount = accountList.find((a: AccountConfig) => (a as any).isDefault)
          const selectedAccount = defaultAccount?.email || accountList[0].email
          setCurrentAccount(selectedAccount)
          setAppState('main')
        } else {
          setAppState('setup')
        }
      } else {
        setAppState('setup')
      }
    } catch (error) {
      console.error('Failed to check accounts:', error)
      setAppState('setup')
    }
  }

  // 계정이 설정되면 해당 계정의 설정 로드
  React.useEffect(() => {
    const loadAccountSettings = async () => {
      if (!currentAccount) return
      try {
        const settings = await window.electron.ipcRenderer.invoke(
          'get-app-settings',
          currentAccount
        )
        if (settings) {
          setEmailsPerPage(settings.emailsPerPage || 20)
          setViewMode(settings.viewMode || 'list')
          // pollingInterval은 초 단위로 저장되어 있으므로 ms로 변환
          const intervalMs = (settings.pollingInterval ?? 30) * 1000
          setPollingInterval(intervalMs)
        }
      } catch (error) {
        console.error('Failed to load account settings:', error)
      }
    }

    loadAccountSettings()
  }, [currentAccount])

  // 백그라운드 동기화 간격 설정 (설정 변경 시 백엔드에 전달)
  React.useEffect(() => {
    if (appState !== 'main' || pollingInterval === 0) return

    // 백엔드 동기화 매니저에 간격 설정 전달
    window.electron.ipcRenderer
      .invoke('set-background-sync-interval', pollingInterval)
      .catch((error) => {
        console.error('Failed to set background sync interval:', error)
      })
  }, [appState, pollingInterval])

  // 자동 잠금 기능 (사용자 비활성 시)
  React.useEffect(() => {
    if (appState !== 'main') return

    let autoLockEnabled = false
    let autoLockTime = 5 // 기본값 5분
    let pinEnabled = false // PIN 잠금 활성화 여부

    // 글로벌 설정 로드
    const loadSecuritySettings = async () => {
      try {
        const globalSettings = await window.electron.ipcRenderer.invoke('get-global-settings')
        autoLockEnabled = globalSettings?.security?.autoLock ?? false
        autoLockTime = globalSettings?.security?.autoLockTime ?? 5
        // PIN 활성화 여부 확인
        pinEnabled = await window.electron.ipcRenderer.invoke('is-pin-enabled')
      } catch (error) {
        console.error('Failed to load security settings:', error)
      }
    }
    loadSecuritySettings()

    // 사용자 활동 감지
    const updateActivity = () => {
      lastActivityRef.current = Date.now()
    }

    // 활동 이벤트 리스너
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach((event) => window.addEventListener(event, updateActivity))

    // 비활성 체크 인터벌 (1분마다)
    const checkInterval = setInterval(async () => {
      if (!autoLockEnabled || isLocked) return

      const inactiveTime = (Date.now() - lastActivityRef.current) / 1000 / 60 // 분 단위
      if (inactiveTime >= autoLockTime) {
        // PIN 활성화 상태를 다시 확인 (설정 변경 반영)
        try {
          const currentPinEnabled = await window.electron.ipcRenderer.invoke('is-pin-enabled')
          setIsPinEnabledForLock(currentPinEnabled)
        } catch {
          setIsPinEnabledForLock(pinEnabled)
        }
        setIsLocked(true)
      }
    }, 60000) // 1분마다 체크

    return () => {
      events.forEach((event) => window.removeEventListener(event, updateActivity))
      clearInterval(checkInterval)
    }
  }, [appState, isLocked])

  // 잠금 해제 핸들러
  const handleUnlock = React.useCallback(() => {
    setIsLocked(false)
    setIsPinEnabledForLock(false)
    lastActivityRef.current = Date.now()
  }, [])

  // PIN 인증 완료 핸들러
  const handlePinVerified = React.useCallback(async () => {
    setIsPinVerified(true)
    setIsPinRequired(false)

    // PIN 인증 후 앱 초기화 계속 진행
    try {
      const globalSettings = await window.electron.ipcRenderer.invoke('get-global-settings')

      // 언어 선택이 아직 안 됐으면 언어 선택 모달 표시
      if (!globalSettings?.languageSelected) {
        setShowLanguageSelector(true)
        return
      }

      // 계정 확인
      const hasAccounts = await window.electron.ipcRenderer.invoke('has-accounts')
      if (hasAccounts) {
        const accountList = await loadAccounts()
        if (accountList && accountList.length > 0) {
          const defaultAccount = accountList.find((a: AccountConfig) => (a as any).isDefault)
          const selectedAccount = defaultAccount?.email || accountList[0].email
          setCurrentAccount(selectedAccount)
          setAppState('main')
        } else {
          setAppState('setup')
        }
      } else {
        setAppState('setup')
      }
    } catch (error) {
      console.error('Failed to initialize app after PIN verification:', error)
      setAppState('setup')
    }
  }, [])

  // 계정이 설정되면 폴더 목록 가져오기
  React.useEffect(() => {
    if (appState === 'main' && currentAccount) {
      const initSync = async () => {
        console.log('[initSync] App started, syncing folders...')
        setIsInitialized(false) // 초기화 시작
        loadedFoldersRef.current.clear()
        isFirstLoadRef.current = true
        await loadFolders()
        console.log('[initSync] Initialization complete')
        setIsInitialized(true) // 초기화 완료
      }
      initSync()
    }
  }, [appState, currentAccount])

  // 백그라운드에서 새 메일 수신 시 알림 처리 (모든 계정)
  React.useEffect(() => {
    if (appState !== 'main') return

    const handleNewMailReceived = async (
      _event: unknown,
      data: {
        accountEmail: string
        newCount: number
        emails: { uid: number; from: string; subject: string; date: Date }[]
      }
    ) => {
      console.log('[handleNewMailReceived] New mail received:', data)

      if (data.newCount > 0 && data.emails.length > 0) {
        const firstEmail = data.emails[0]
        // 제목이 너무 길면 30자로 자르기
        const truncatedSubject =
          firstEmail.subject.length > 30
            ? firstEmail.subject.substring(0, 30) + '...'
            : firstEmail.subject

        // 계정 이름 추출 (이메일 주소에서 @ 앞부분 또는 전체)
        const accountName = data.accountEmail.split('@')[0]

        // 현재 활성 계정인지 확인
        const isActiveAccount = data.accountEmail === currentAccount

        // 알림 본문 구성 (비활성 계정이면 계정 정보 포함)
        let notificationTitle: string
        let notificationBody: string

        if (isActiveAccount) {
          // 현재 활성 계정 - 기존 형식
          notificationTitle = t('notification.newMailTitle', { count: data.newCount })
          notificationBody =
            data.newCount === 1
              ? t('notification.newMailBodySingle', {
                  from: firstEmail.from,
                  subject: truncatedSubject
                })
              : t('notification.newMailBodyMulti', {
                  from: firstEmail.from,
                  count: data.newCount - 1
                })
        } else {
          // 비활성 계정 - 계정 정보 포함
          notificationTitle = t('notification.newMailTitleWithAccount', {
            count: data.newCount,
            account: accountName
          })
          notificationBody =
            data.newCount === 1
              ? t('notification.newMailBodySingleWithAccount', {
                  account: data.accountEmail,
                  from: firstEmail.from,
                  subject: truncatedSubject
                })
              : t('notification.newMailBodyMultiWithAccount', {
                  account: data.accountEmail,
                  from: firstEmail.from,
                  count: data.newCount - 1
                })
        }

        // 데스크탑 알림 표시
        await window.electron.ipcRenderer.invoke('show-notification', notificationTitle, notificationBody)

        // 현재 활성 계정의 INBOX를 보고 있으면 목록 새로고침
        if (isActiveAccount && currentFolder === 'INBOX' && currentPage === 1) {
          const emailResult = await window.electron.ipcRenderer.invoke(
            'get-emails-local',
            currentAccount,
            'INBOX',
            { start: 1, limit: emailsPerPage }
          )
          if (emailResult.success) {
            setEmails(emailResult.emails || [])
            setTotalEmails(emailResult.total || 0)
          }
        }

        // 해당 계정의 읽지 않은 메일 수 업데이트
        setAccountUnreadCounts((prev) => ({
          ...prev,
          [data.accountEmail]: (prev[data.accountEmail] || 0) + data.newCount
        }))

        setLastSyncTime(new Date())
      }
    }

    // 이벤트 리스너 등록
    window.electron.ipcRenderer.on('new-mail-received', handleNewMailReceived)

    // 정리 함수
    return () => {
      window.electron.ipcRenderer.removeAllListeners('new-mail-received')
    }
  }, [appState, currentAccount, currentFolder, currentPage, emailsPerPage, t])

  // 백엔드에서 데이터 변경 시 UI 업데이트 (Push 방식)
  React.useEffect(() => {
    if (appState !== 'main' || !currentAccount) return

    // 폴더 카운트 업데이트 이벤트 핸들러
    const handleFolderCountsUpdated = async (
      _event: unknown,
      data: { accountEmail: string; folderPath?: string }
    ) => {
      // 현재 계정의 이벤트만 처리
      if (data.accountEmail !== currentAccount) return

      console.log('[handleFolderCountsUpdated] Updating folder counts...', data)

      // 로컬 DB에서 모든 폴더 카운트 조회
      const result = await window.electron.ipcRenderer.invoke(
        'get-all-folder-counts-local',
        currentAccount
      )

      if (result.success && result.counts) {
        const newInfos: Record<string, { path: string; total: number; unseen: number }> = {}
        for (const [path, counts] of Object.entries(
          result.counts as Record<string, { total: number; unseen: number }>
        )) {
          newInfos[path] = {
            path,
            total: counts.total || 0,
            unseen: counts.unseen || 0
          }
        }
        setFolderInfos(newInfos)

        // 캐시 업데이트
        folderInfoCacheRef.current = {
          account: currentAccount,
          timestamp: Date.now(),
          infos: newInfos
        }

        // INBOX 읽지 않은 메일 수 업데이트
        if (newInfos['INBOX']) {
          setAccountUnreadCounts((prev) => ({
            ...prev,
            [currentAccount]: newInfos['INBOX'].unseen || 0
          }))
        }
      }
    }

    // 이메일 목록 업데이트 이벤트 핸들러
    const handleEmailsUpdated = async (
      _event: unknown,
      data: { accountEmail: string; folderPath: string; changeType: string }
    ) => {
      // 현재 계정의 이벤트만 처리
      if (data.accountEmail !== currentAccount) return

      console.log('[handleEmailsUpdated] Emails updated', data)

      // 현재 보고 있는 폴더가 변경된 경우에만 이메일 목록 새로고침
      if (data.folderPath === currentFolder) {
        // 이메일 목록 새로고침
        const emailResult = await window.electron.ipcRenderer.invoke(
          'get-emails-local',
          currentAccount,
          currentFolder,
          { start: (currentPage - 1) * emailsPerPage + 1, limit: emailsPerPage }
        )

        if (emailResult.success) {
          setEmails(emailResult.emails || [])
          setTotalEmails(emailResult.total || 0)
        }
      }
    }

    // 이벤트 리스너 등록
    window.electron.ipcRenderer.on('folder-counts-updated', handleFolderCountsUpdated)
    window.electron.ipcRenderer.on('emails-updated', handleEmailsUpdated)

    // 정리 함수
    return () => {
      window.electron.ipcRenderer.removeAllListeners('folder-counts-updated')
      window.electron.ipcRenderer.removeAllListeners('emails-updated')
    }
  }, [appState, currentAccount, currentFolder, currentPage, emailsPerPage])

  // 수동 동기화 핸들러 (전체 메일함 동기화)
  const handleManualSync = async () => {
    if (isSyncing || !currentAccount) return
    setIsSyncing(true)

    try {
      console.log('[handleManualSync] Starting full sync...')

      // 1. 로드된 폴더 상태 초기화
      loadedFoldersRef.current.clear()
      isFirstLoadRef.current = true

      // 2. 폴더 정보 새로고침
      console.log('[handleManualSync] Refreshing folders...')
      await loadFolders()

      // 3. 현재 폴더 이메일 새로고침
      console.log('[handleManualSync] Refreshing emails for current folder...')
      await loadEmails()

      setLastSyncTime(new Date())
      console.log('[handleManualSync] Full sync completed')
    } catch (error) {
      console.error('Failed to manual sync:', error)
    } finally {
      setIsSyncing(false)
    }
  }

  // 폴더 변경 시 이메일 목록 가져오기
  const prevFolderRef = React.useRef<string | null>(null)
  const prevAccountRef = React.useRef<string | null>(null)
  const isFirstLoadRef = React.useRef<boolean>(true) // 앱 시작 후 첫 번째 로드 여부
  const loadedFoldersRef = React.useRef<Set<string>>(new Set()) // 이미 로드된 폴더 목록
  const loadEmailsRequestIdRef = React.useRef<number>(0) // 이메일 로드 요청 ID (race condition 방지)
  const skipNextEmailLoadRef = React.useRef<boolean>(false) // 다음 이메일 로드 스킵 여부 (계정 전환 시)
  const isLoadingFoldersRef = React.useRef<boolean>(false) // 폴더 로드 중 여부 (중복 호출 방지)
  const skipNextFolderLoadRef = React.useRef<boolean>(false) // 다음 폴더 로드 스킵 여부 (계정 전환 시)

  // 폴더 정보 캐시 (TTL: 60초)
  const FOLDER_INFO_CACHE_TTL = 60000
  const folderInfoCacheRef = React.useRef<{
    account: string
    timestamp: number
    infos: Record<string, FolderInfo>
  } | null>(null)

  // 계정 변경 시 로드 상태 초기화
  React.useEffect(() => {
    if (prevAccountRef.current !== null && prevAccountRef.current !== currentAccount) {
      console.log(
        `[App] Account changed from ${prevAccountRef.current} to ${currentAccount}, resetting load state`
      )
      isFirstLoadRef.current = true
      loadedFoldersRef.current.clear()
      prevFolderRef.current = null
    }
    prevAccountRef.current = currentAccount
  }, [currentAccount])

  React.useEffect(() => {
    // 초기화가 완료된 후에만 이메일 로드
    if (appState === 'main' && currentAccount && isInitialized) {
      // 계정 전환 시 이미 handleAccountChange에서 로드했으면 스킵
      if (skipNextEmailLoadRef.current) {
        console.log(`[App] Skipping email load - already loaded in handleAccountChange`)
        skipNextEmailLoadRef.current = false
        return
      }

      // 상세 검색 모드
      if (detailedSearchParams) {
        console.log(`[App] Loading detailed search results`)
        loadEmails()
        return
      }

      // 폴더 모드
      if (!currentFolder) return

      prevFolderRef.current = currentFolder
      isFirstLoadRef.current = false
      loadedFoldersRef.current.add(currentFolder)

      console.log(`[App] Loading emails - folder: ${currentFolder}`)
      loadEmails()
    }
  }, [
    currentFolder,
    currentPage,
    currentAccount,
    appState,
    isSearching,
    isInitialized,
    detailedSearchParams,
    emailsPerPage,
    showUnreadOnly
  ])

  // 상세 검색 핸들러
  const handleDetailedSearch = (params: DetailedSearchParams) => {
    console.log('[handleDetailedSearch] Called with params:', params)
    setDetailedSearchParams(params)
    setSearchQuery('')
    setIsSearching(false)
    setCurrentPage(1)
  }

  const loadFolders = async (forceRefresh = false) => {
    // 계정 전환 시 handleAccountChange에서 이미 로드했으면 스킵
    if (skipNextFolderLoadRef.current) {
      console.log('[loadFolders] Skipping - already loaded in handleAccountChange')
      skipNextFolderLoadRef.current = false
      return
    }

    // 중복 호출 방지
    if (isLoadingFoldersRef.current) {
      console.log('[loadFolders] Skipping - already loading')
      return
    }

    // 캐시 확인 (강제 새로고침이 아닌 경우)
    if (!forceRefresh && folderInfoCacheRef.current) {
      const cache = folderInfoCacheRef.current
      const now = Date.now()
      if (cache.account === currentAccount && now - cache.timestamp < FOLDER_INFO_CACHE_TTL) {
        console.log('[loadFolders] Using cached folder info')
        setFolderInfos(cache.infos)
        if (cache.infos['INBOX']) {
          setAccountUnreadCounts((prev) => ({
            ...prev,
            [currentAccount]: cache.infos['INBOX'].unseen || 0
          }))
        }
        return
      }
    }

    isLoadingFoldersRef.current = true
    try {
      // Local-First: 먼저 로컬 DB에서 폴더 목록 가져오기
      const localResult = await window.electron.ipcRenderer.invoke(
        'get-folders-local',
        currentAccount
      )
      let hasLocalData = false

      if (localResult.success && localResult.folders && localResult.folders.length > 0) {
        console.log('[loadFolders] Using local DB folders first')
        setFolders(localResult.folders)
        hasLocalData = true

        // 로컬 폴더 정보로 먼저 UI 업데이트 - 모든 폴더 카운트를 한 번에 조회
        const allCountsResult = await window.electron.ipcRenderer.invoke(
          'get-all-folder-counts-local',
          currentAccount
        )

        const localInfos: Record<string, FolderInfo> = {}
        if (allCountsResult.success && allCountsResult.counts) {
          for (const [path, counts] of Object.entries(
            allCountsResult.counts as Record<string, { total: number; unseen: number }>
          )) {
            localInfos[path] = {
              path,
              total: counts.total || 0,
              unseen: counts.unseen || 0
            }
          }
        }
        setFolderInfos(localInfos)

        // 캐시 업데이트
        folderInfoCacheRef.current = {
          account: currentAccount,
          timestamp: Date.now(),
          infos: localInfos
        }

        if (localInfos['INBOX']) {
          setAccountUnreadCounts((prev) => ({
            ...prev,
            [currentAccount]: localInfos['INBOX'].unseen || 0
          }))
        }

        // 로컬 데이터가 있으면 초기화 완료로 표시 (loadEmails 실행 가능)
        if (!isInitialized) {
          console.log('[loadFolders] Local data available, marking as initialized')
          setIsInitialized(true)
        }
      }

      // 백그라운드에서 서버 동기화 (로컬 데이터가 있으면 비동기로, 없으면 동기로)
      const syncFromServer = async () => {
        try {
          const result = await window.electron.ipcRenderer.invoke('get-folders', currentAccount)
          console.log('[loadFolders] Synced folders from server')
          if (result.success && result.folders) {
            setFolders(result.folders)

            // 폴더 정보는 항상 로컬 DB에서 가져오기 (서버 정보가 아닌 로컬 기준)
            const allCountsResult = await window.electron.ipcRenderer.invoke(
              'get-all-folder-counts-local',
              currentAccount
            )

            const infos: Record<string, FolderInfo> = {}
            if (allCountsResult.success && allCountsResult.counts) {
              for (const [path, counts] of Object.entries(
                allCountsResult.counts as Record<string, { total: number; unseen: number }>
              )) {
                infos[path] = {
                  path,
                  total: counts.total || 0,
                  unseen: counts.unseen || 0
                }
              }
            }
            setFolderInfos(infos)

            // 캐시 업데이트
            folderInfoCacheRef.current = {
              account: currentAccount,
              timestamp: Date.now(),
              infos
            }

            if (infos['INBOX']) {
              setAccountUnreadCounts((prev) => ({
                ...prev,
                [currentAccount]: infos['INBOX'].unseen || 0
              }))
            }
          }
        } catch (error) {
          console.error('[loadFolders] Server sync error:', error)
        }
      }

      if (hasLocalData) {
        // 로컬 데이터가 있으면 백그라운드에서 서버 동기화
        syncFromServer()
      } else {
        // 로컬 데이터가 없으면 서버에서 동기적으로 가져오기
        console.log('[loadFolders] No local data, fetching from server')
        await syncFromServer()
      }
    } catch (error) {
      console.error('Failed to load folders:', error)
    } finally {
      isLoadingFoldersRef.current = false
    }
  }

  const flattenFolders = (folders: MailFolder[]): MailFolder[] => {
    const result: MailFolder[] = []
    for (const folder of folders) {
      result.push(folder)
      if (folder.children) {
        result.push(...flattenFolders(folder.children))
      }
    }
    return result
  }

  const loadEmails = async () => {
    // 요청 ID 증가 - 새로운 요청이 시작됨을 표시
    const requestId = ++loadEmailsRequestIdRef.current

    setIsLoadingEmails(true)
    try {
      const start = (currentPage - 1) * emailsPerPage + 1
      console.log(
        '[loadEmails] Loading emails for folder:',
        currentFolder,
        'start:',
        start,
        'limit:',
        emailsPerPage,
        'requestId:',
        requestId
      )

      // 상세 검색
      if (detailedSearchParams) {
        // SQLite 로컬 검색 먼저 시도
        let result = await window.electron.ipcRenderer.invoke(
          'search-emails-detailed-local',
          currentAccount,
          detailedSearchParams,
          { start, limit: emailsPerPage }
        )

        // SQLite 실패하면 IMAP으로 폴백
        if (!result.success || (result.emails?.length === 0 && result.total === 0)) {
          console.log('[loadEmails] SQLite detailed search failed, falling back to IMAP')
          result = await window.electron.ipcRenderer.invoke(
            'search-emails-detailed',
            currentAccount,
            detailedSearchParams,
            { start, limit: emailsPerPage }
          )
        } else {
          console.log('[loadEmails] Using SQLite detailed search results')
        }

        // 요청 ID가 변경되었으면 결과 무시
        if (requestId !== loadEmailsRequestIdRef.current) {
          console.log('[loadEmails] Request cancelled (stale), requestId:', requestId)
          return
        }
        console.log('[loadEmails] Detailed search result:', result)
        if (result.success) {
          setEmails(result.emails || [])
          setTotalEmails(result.total || 0)
        } else {
          console.error('Failed to search emails detailed:', result.error)
          setEmails([])
          setTotalEmails(0)
        }
      }
      // 검색 중이면 검색 API 사용
      else if (isSearching && searchQuery.trim()) {
        // SQLite 로컬 검색 먼저 시도
        let result = await window.electron.ipcRenderer.invoke(
          'search-emails-local',
          currentAccount,
          searchQuery.trim(),
          { folderPath: currentFolder, start, limit: emailsPerPage }
        )

        // SQLite 실패하면 IMAP으로 폴백
        if (!result.success || (result.emails?.length === 0 && result.total === 0)) {
          console.log('[loadEmails] SQLite search failed, falling back to IMAP')
          result = await window.electron.ipcRenderer.invoke(
            'search-emails',
            currentAccount,
            currentFolder,
            searchQuery.trim(),
            { start, limit: emailsPerPage }
          )
        } else {
          console.log('[loadEmails] Using SQLite search results')
        }

        // 요청 ID가 변경되었으면 결과 무시
        if (requestId !== loadEmailsRequestIdRef.current) {
          console.log('[loadEmails] Request cancelled (stale), requestId:', requestId)
          return
        }
        console.log('[loadEmails] Search result:', result)
        if (result.success) {
          setEmails(result.emails || [])
          setTotalEmails(result.total || 0)
        } else {
          console.error('Failed to search emails:', result.error)
          setEmails([])
          setTotalEmails(0)
        }
      } else if (currentFolder === 'ALL_MAIL') {
        // 전체메일함: 모든 폴더에서 메일 조회
        const result = await window.electron.ipcRenderer.invoke(
          'get-all-emails-local',
          currentAccount,
          { start, limit: emailsPerPage, unreadOnly: showUnreadOnly }
        )

        // 요청 ID가 변경되었으면 결과 무시
        if (requestId !== loadEmailsRequestIdRef.current) {
          console.log('[loadEmails] Request cancelled (stale), requestId:', requestId)
          return
        }

        console.log('[loadEmails] All mail result:', result)
        if (result.success) {
          setEmails(result.emails || [])
          setTotalEmails(result.total || 0)
        } else {
          console.error('Failed to load all emails:', result.error)
          setEmails([])
          setTotalEmails(0)
        }
      } else {
        // Local-First: 먼저 로컬 DB에서 조회 (안읽은 메일만 필터링 옵션 포함)
        let result = await window.electron.ipcRenderer.invoke(
          'get-emails-local',
          currentAccount,
          currentFolder,
          { start, limit: emailsPerPage, unreadOnly: showUnreadOnly }
        )

        // 요청 ID가 변경되었으면 결과 무시
        if (requestId !== loadEmailsRequestIdRef.current) {
          console.log('[loadEmails] Request cancelled (stale), requestId:', requestId)
          return
        }

        // 로컬 DB에 데이터가 없거나 실패하면 서버에서 가져오기 (폴백)
        const shouldFallback = !result.success || result.emails.length === 0
        if (shouldFallback) {
          console.log(
            `[loadEmails] Local DB empty or failed, falling back to IMAP (unreadOnly=${showUnreadOnly})`
          )
          result = await window.electron.ipcRenderer.invoke(
            'get-emails',
            currentAccount,
            currentFolder,
            { start, limit: emailsPerPage, unreadOnly: showUnreadOnly }
          )

          // 요청 ID가 변경되었으면 결과 무시
          if (requestId !== loadEmailsRequestIdRef.current) {
            console.log(
              '[loadEmails] Request cancelled (stale after fallback), requestId:',
              requestId
            )
            return
          }
        } else {
          console.log('[loadEmails] Using local DB results')
        }

        console.log('[loadEmails] Get emails result:', result)
        if (result.success) {
          setEmails(result.emails || [])
          setTotalEmails(result.total || 0)
        } else {
          console.error('Failed to load emails:', result.error)
          setEmails([])
          setTotalEmails(0)
        }
      }
    } catch (error) {
      // 요청 ID가 변경되었으면 에러도 무시
      if (requestId !== loadEmailsRequestIdRef.current) {
        console.log('[loadEmails] Request cancelled (stale error), requestId:', requestId)
        return
      }
      console.error('Failed to load emails:', error)
      setEmails([])
      setTotalEmails(0)
    } finally {
      // 현재 요청이 최신 요청인 경우에만 로딩 상태 해제
      if (requestId === loadEmailsRequestIdRef.current) {
        setIsLoadingEmails(false)
      }
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setIsSearching(false)
    setCurrentPage(1)
  }

  const handleAccountSetupComplete = async (account: AccountConfig) => {
    // 새 계정 추가 모드에서 완료된 경우
    if (isAddingAccount) {
      setIsAddingAccount(false)
      await loadAccounts()
      // 새로 추가된 계정으로 전환
      setCurrentAccount(account.email)
    } else {
      // 첫 계정 설정
      setCurrentAccount(account.email)
      setAppState('main')
      await loadAccounts()
    }
  }

  // 계정 전환 핸들러
  const handleAccountChange = async (email: string) => {
    if (email === currentAccount) return

    console.log(`[handleAccountChange] Switching from ${currentAccount} to ${email}`)

    // 계정 전환 중 표시
    setIsSwitchingAccount(true)

    // 상태 초기화
    setCurrentFolder('INBOX')
    setCurrentPage(1)
    setEmails([])
    setFolders([])
    setFolderInfos({})
    setDetailedSearchParams(null)
    setSearchQuery('')
    setIsSearching(false)
    setSelectedEmail(null)
    setCurrentView('list')
    setSettingsView(null)
    setIsInitialized(false)
    loadedFoldersRef.current.clear()
    isFirstLoadRef.current = true

    // 계정 전환
    setCurrentAccount(email)

    // 새 계정의 폴더와 이메일 직접 로드
    try {
      console.log(`[handleAccountChange] Loading folders for ${email}`)
      const startTime = Date.now()

      // Local-First: 먼저 로컬 DB에서 폴더 조회
      let result = await window.electron.ipcRenderer.invoke('get-folders-local', email)
      // 로컬에 없으면 서버에서 가져오기 (폴백)
      if (!result.success || result.folders.length === 0) {
        console.log(`[handleAccountChange] Local folders empty, falling back to IMAP`)
        result = await window.electron.ipcRenderer.invoke('get-folders', email)
      } else {
        console.log(`[handleAccountChange] Using local folders`)
      }
      if (result.success && result.folders) {
        setFolders(result.folders)
        console.log(`[handleAccountChange] Folders loaded in ${Date.now() - startTime}ms`)

        // 병렬로 처리: 폴더 정보 + 이메일 로드
        // 1. 폴더 정보 조회 (Local-First) - 모든 폴더 카운트를 한 번에 조회
        const folderCountsPromise = window.electron.ipcRenderer.invoke(
          'get-all-folder-counts-local',
          email
        )

        // 2. 이메일 로드 (Local-First) - SQLite에서 조회
        console.log(`[handleAccountChange] Loading emails from local DB for ${email}, folder: INBOX`)
        const emailPromise = window.electron.ipcRenderer.invoke('get-emails-local', email, 'INBOX', {
          start: 1,
          limit: emailsPerPage
        })

        // 모든 병렬 작업 완료 대기
        const [allCountsResult, emailResult] = await Promise.all([folderCountsPromise, emailPromise])

        // 폴더 정보 설정
        const infos: Record<string, FolderInfo> = {}
        if (allCountsResult.success && allCountsResult.counts) {
          for (const [path, counts] of Object.entries(
            allCountsResult.counts as Record<string, { total: number; unseen: number }>
          )) {
            infos[path] = {
              path,
              total: counts.total || 0,
              unseen: counts.unseen || 0
            }
          }
        }
        setFolderInfos(infos)

        // 캐시 업데이트 및 중복 로드 방지 플래그 설정
        folderInfoCacheRef.current = {
          account: email,
          timestamp: Date.now(),
          infos
        }
        skipNextFolderLoadRef.current = true
        console.log(`[handleAccountChange] Folder infos loaded in ${Date.now() - startTime}ms`)

        // 새 계정의 읽지 않은 메일 수 업데이트
        if (infos['INBOX']) {
          setAccountUnreadCounts((prev) => ({
            ...prev,
            [email]: infos['INBOX'].unseen || 0
          }))
        }

        // 이메일 설정
        if (emailResult.success) {
          setEmails(emailResult.emails || [])
          setTotalEmails(emailResult.total || 0)
          console.log(`[handleAccountChange] Loaded ${emailResult.emails?.length || 0} emails`)
        }

        // useEffect에서 중복 로드 방지
        skipNextEmailLoadRef.current = true
        console.log(`[handleAccountChange] Total time: ${Date.now() - startTime}ms`)
      }

      // 초기화 완료 표시
      console.log(`[handleAccountChange] Initialization complete for ${email}`)
      setIsInitialized(true)
    } catch (error) {
      console.error('[handleAccountChange] Failed to load folders:', error)
      setIsInitialized(true) // 에러가 있어도 초기화 완료로 표시
    } finally {
      // 계정 전환 완료
      setIsSwitchingAccount(false)
    }
  }

  // 계정 삭제 핸들러
  const handleDeleteAccount = async (email: string) => {
    try {
      const result = await window.electron.ipcRenderer.invoke('delete-account', email)
      if (result.success) {
        const updatedAccounts = await loadAccounts()

        // 삭제된 계정이 현재 계정이면 다른 계정으로 전환
        if (email === currentAccount && updatedAccounts.length > 0) {
          handleAccountChange(updatedAccounts[0].email)
        } else if (updatedAccounts.length === 0) {
          // 모든 계정이 삭제되면 설정 화면으로
          setAppState('setup')
        }
      } else {
        console.error('Failed to delete account:', result.error)
        alert(t('common.accountDeleteFailed'))
      }
    } catch (error) {
      console.error('Failed to delete account:', error)
      alert(t('common.accountDeleteError'))
    }
  }

  // 기본 계정 설정 핸들러
  const handleSetDefaultAccount = async (email: string) => {
    try {
      const result = await window.electron.ipcRenderer.invoke('set-default-account', email)
      if (result.success) {
        await loadAccounts()
      } else {
        console.error('Failed to set default account:', result.error)
      }
    } catch (error) {
      console.error('Failed to set default account:', error)
    }
  }

  // 계정 추가 핸들러
  const handleAddAccount = () => {
    setIsAccountManagerOpen(false)
    setIsAddingAccount(true)
  }

  // 계정 추가 취소 핸들러
  const handleCancelAddAccount = () => {
    setIsAddingAccount(false)
  }

  const handleEmailSelect = async (email: EmailHeader) => {
    // 현재 이메일의 인덱스 찾기 (가상 폴더에서는 UID + folder로 비교해야 함)
    const index = emails.findIndex(
      (e) => e.uid === email.uid && (!email.folder || e.folder === email.folder)
    )
    setSelectedEmailIndex(index)

    // 필터 모드에서는 이메일의 폴더 정보 사용, 아니면 currentFolder 사용
    const targetFolder = email.folder || currentFolder

    // 즉시 UI 전환 및 로딩 상태 설정 (낙관적 업데이트)
    setIsLoadingContent(true)

    // 헤더 정보 기반으로 부분 데이터 먼저 표시 (빠른 피드백)
    const partialEmail: EmailFull = {
      uid: email.uid,
      messageId: email.messageId,
      subject: email.subject,
      from: email.from,
      to: email.to,
      cc: [],
      date: email.date,
      flags: email.flags,
      text: '', // 본문은 로딩 중
      html: undefined,
      attachments: [],
      hasAttachment: email.hasAttachment,
      folder: email.folder // 실제 폴더 경로 보존 (가상 폴더에서 필요)
    }
    setSelectedEmail(partialEmail)

    // 목록만 보기 모드에서는 즉시 뷰 전환
    if (viewMode === 'list') {
      setCurrentView('view')
    }

    // 읽지 않은 메일인 경우 즉시 UI 업데이트 (낙관적 업데이트)
    const wasUnread = !email.flags.includes('\\Seen')
    if (wasUnread) {
      setEmails((prev) =>
        prev.map((e) =>
          e.uid === email.uid && (!email.folder || e.folder === email.folder)
            ? { ...e, flags: [...new Set([...e.flags, '\\Seen'])] }
            : e
        )
      )
      setFolderInfos((prev) => {
        const current = prev[currentFolder]
        if (current && current.unseen > 0) {
          return {
            ...prev,
            [currentFolder]: { ...current, unseen: current.unseen - 1 }
          }
        }
        return prev
      })
    }

    try {
      // Local-First: 먼저 로컬 캐시에서 조회 (비동기)
      let result = await window.electron.ipcRenderer.invoke(
        'get-email-content-local',
        currentAccount,
        targetFolder,
        email.uid
      )
      // 로컬에 없으면 서버에서 가져오기
      if (!result.success) {
        result = await window.electron.ipcRenderer.invoke(
          'get-email-content',
          currentAccount,
          targetFolder,
          email.uid
        )
      }

      if (result.success && result.email) {
        setSelectedEmail(result.email)
      }

      // 읽음 처리는 백그라운드에서 실행 (UI 블로킹 없음)
      if (wasUnread) {
        window.electron.ipcRenderer.invoke(
          'set-email-flags',
          currentAccount,
          targetFolder,
          email.uid,
          ['\\Seen'],
          true
        ).catch((err) => console.error('Failed to mark as read:', err))
      }
    } catch (error) {
      console.error('Failed to load email content:', error)
    } finally {
      setIsLoadingContent(false)
    }
  }

  const handleFolderSelect = (folderKey: string) => {
    // Prevent unnecessary re-renders if the same folder is selected with no active searches
    if (folderKey === currentFolder && !detailedSearchParams && !showUnreadOnly) return

    // 폴더 변경 시 검색 및 필터 초기화
    setDetailedSearchParams(null)
    setSearchQuery('')
    setShowUnreadOnly(false)
    // folderKey는 앱에서 사용하는 키 (inbox, sent 등) 또는 IMAP 폴더 경로
    let folderPath = 'INBOX'
    console.log('[handleFolderSelect] folderKey:', folderKey)

    // 먼저 폴더 목록에서 해당 경로가 존재하는지 확인 (사용자 정의 폴더 등)
    const allFolders = flattenFolders(folders)
    const directPathMatch = allFolders.find((f) => f.path === folderKey)

    if (directPathMatch) {
      // 폴더 경로가 직접 매치되면 그대로 사용
      folderPath = folderKey
      console.log('[handleFolderSelect] Direct path match found:', folderPath)
    } else if (folderKey.includes('/') || folderKey.includes('.') || folderKey === 'INBOX') {
      // 폴더 경로인 경우 (슬래시나 점이 포함된 경우) 직접 사용
      folderPath = folderKey
    } else if (folderKey === 'inbox') {
      folderPath = 'INBOX'
    } else if (folderKey === 'allMail') {
      // 전체메일함 특수 처리
      folderPath = 'ALL_MAIL'
    } else {
      // 폴더 목록에서 해당 폴더 찾기
      console.log(
        '[handleFolderSelect] allFolders:',
        allFolders.map((f) => ({ name: f.name, path: f.path }))
      )

      let found = false
      for (const folder of allFolders) {
        const mappedKey = FOLDER_MAP[folder.name] || FOLDER_MAP[folder.path]
        if (mappedKey === folderKey) {
          folderPath = folder.path
          found = true
          console.log('[handleFolderSelect] Found folder:', folder.path, 'for key:', folderKey)
          break
        }
      }

      // 폴더를 찾지 못한 경우, 직접 이름으로 매칭 시도
      if (!found) {
        console.log(
          '[handleFolderSelect] Folder not found by mapping, trying direct name match for:',
          folderKey
        )
        console.log(
          '[handleFolderSelect] Available folder names:',
          allFolders.map((f) => f.name)
        )
        console.log(
          '[handleFolderSelect] Available folder paths:',
          allFolders.map((f) => f.path)
        )

        // spam -> Junk, 스팸메일함, Spam 등
        // trash -> Trash, 휴지통 등
        const directMatches: Record<string, string[]> = {
          spam: [
            'Junk',
            '스팸메일함',
            'Spam',
            'Junk E-mail',
            'Bulk Mail',
            'SPAMBOX',
            '&wqTTONO4ksU-'
          ],
          trash: ['Trash', '휴지통', 'Deleted Messages', 'Deleted Items', '&1zTJwNG1-'],
          sent: ['Sent', '보낸편지함', 'Sent Messages', 'Sent Items', '&vPSwuNO4ksU-'],
          drafts: ['Drafts', '임시보관함', 'DRAFTBOX', '&x4TC18mrwqQ-'],
          self: ['내게쓴메일함', 'TOME', '&zO7A5rO4ksU-'],
          scheduled: ['ARCHIVING', '예약메일함']
        }

        const possibleNames = directMatches[folderKey] || []
        for (const name of possibleNames) {
          const matchedFolder = allFolders.find(
            (f) =>
              f.name === name ||
              f.path === name ||
              f.path.endsWith(`/${name}`) ||
              f.name.toLowerCase() === name.toLowerCase() ||
              f.path.toLowerCase() === name.toLowerCase()
          )
          if (matchedFolder) {
            folderPath = matchedFolder.path
            console.log('[handleFolderSelect] Direct match found:', matchedFolder.path)
            break
          }
        }

        // 여전히 찾지 못하면 specialUse 플래그로 찾기
        if (folderPath === 'INBOX') {
          const specialUseMap: Record<string, string> = {
            spam: '\\Junk',
            trash: '\\Trash',
            sent: '\\Sent',
            drafts: '\\Drafts'
          }
          const specialUse = specialUseMap[folderKey]
          if (specialUse) {
            const specialFolder = allFolders.find((f) => f.specialUse === specialUse)
            if (specialFolder) {
              folderPath = specialFolder.path
              console.log('[handleFolderSelect] Found by specialUse:', specialFolder.path)
            }
          }
        }
      }
    }

    console.log('[handleFolderSelect] Setting currentFolder to:', folderPath)
    setCurrentFolder(folderPath)
    setCurrentPage(1)
    setCurrentView('list')
    // 검색 상태 초기화
    clearSearch()
  }

  // 안읽은 메일 수 클릭 핸들러 - 해당 폴더의 안읽은 메일만 표시
  const handleUnreadCountClick = (folder: string) => {
    // 먼저 폴더 선택 (검색 및 필터 초기화됨)
    handleFolderSelect(folder)
    // 안읽은 메일만 필터링 활성화
    setShowUnreadOnly(true)
  }

  const formatOriginalEmail = (email: EmailFull): string => {
    const senderName = email.from[0]?.name || email.from[0]?.address || 'Unknown'
    const senderEmail = email.from[0]?.address || ''
    const date = new Date(email.date).toLocaleString('ko-KR')

    // HTML 콘텐츠가 있으면 HTML로, 없으면 텍스트를 HTML로 변환
    const hasHtml = email.html && email.html.trim().length > 0
    const originalContent = hasHtml ? email.html : (email.text || '').replace(/\n/g, '<br>')

    // HTML 형식으로 원본 메시지 헤더 포맷
    const header = `
      <br><br>
      <div style="border-top: 1px solid #ccc; padding-top: 10px; margin-top: 10px;">
        <p style="color: #666; margin: 0 0 10px 0;"><strong>-------- ${t('email.originalMessage')} --------</strong></p>
        <p style="color: #666; margin: 2px 0;"><strong>${t('email.from')}:</strong> ${senderName} &lt;${senderEmail}&gt;</p>
        <p style="color: #666; margin: 2px 0;"><strong>${t('email.date')}:</strong> ${date}</p>
        <p style="color: #666; margin: 2px 0 10px 0;"><strong>${t('email.subject')}:</strong> ${email.subject}</p>
      </div>
    `

    return `${header}<div>${originalContent}</div>`
  }

  const handleReply = () => {
    if (!selectedEmail) return

    const senderEmail = selectedEmail.from[0]?.address || ''
    const originalSubject = selectedEmail.subject
    const replySubject = originalSubject.startsWith('Re:')
      ? originalSubject
      : `Re: ${originalSubject}`

    setComposeData({
      to: senderEmail,
      cc: '',
      subject: replySubject,
      content: formatOriginalEmail(selectedEmail),
      mode: 'reply'
    })
    setCurrentView('compose')
  }

  const handleReplyAll = () => {
    if (!selectedEmail) return

    const senderEmails = selectedEmail.from.map((addr) => addr.address)
    const toEmails = selectedEmail.to.map((addr) => addr.address)
    const ccEmails = selectedEmail.cc?.map((addr) => addr.address) || []

    // 현재 계정 이메일 주소 제외
    const allRecipients = [...toEmails, ...ccEmails].filter((email) => email !== currentAccount)

    const uniqueRecipients = [...new Set(allRecipients)]
    const ccString = uniqueRecipients.filter((email) => !senderEmails.includes(email)).join(', ')

    const originalSubject = selectedEmail.subject
    const replySubject = originalSubject.startsWith('Re:')
      ? originalSubject
      : `Re: ${originalSubject}`

    setComposeData({
      to: senderEmails.join(', '), // 원본 발신자에게 답장
      cc: ccString, // 원본 수신자 및 참조자에게 참조
      subject: replySubject,
      content: formatOriginalEmail(selectedEmail),
      mode: 'replyAll'
    })
    setCurrentView('compose')
  }

  const handleForward = () => {
    if (!selectedEmail) return

    const originalSubject = selectedEmail.subject
    const fwdSubject = originalSubject.startsWith('Fwd:')
      ? originalSubject
      : `Fwd: ${originalSubject}`

    setComposeData({
      to: '',
      cc: '',
      subject: fwdSubject,
      content: formatOriginalEmail(selectedEmail),
      mode: 'forward'
    })
    setCurrentView('compose')
  }

  const handleNewCompose = () => {
    setComposeData(null)
    setSettingsView(null) // 설정 화면에서 메일 쓰기 시 설정 뷰 초기화
    setCurrentView('compose')
  }

  // 나에게 쓰기
  const handleComposeToSelf = () => {
    setComposeData({
      mode: 'toSelf',
      to: '',
      cc: '',
      subject: '',
      content: ''
    })
    setSettingsView(null)
    setCurrentView('compose')
  }

  // 이메일 목록에서 답장 (헤더만 있는 경우)
  const handleListReply = async (emailHeader: EmailHeader) => {
    try {
      // 전체 이메일 내용 가져오기 (Local-First)
      let result = await window.electron.ipcRenderer.invoke(
        'get-email-content-local',
        currentAccount,
        currentFolder,
        emailHeader.uid
      )
      if (!result.success) {
        result = await window.electron.ipcRenderer.invoke(
          'get-email-content',
          currentAccount,
          currentFolder,
          emailHeader.uid
        )
      }
      if (result.success && result.email) {
        const email = result.email
        const senderEmail = email.from[0]?.address || ''
        const originalSubject = email.subject
        const replySubject = originalSubject.startsWith('Re:')
          ? originalSubject
          : `Re: ${originalSubject}`

        setComposeData({
          to: senderEmail,
          cc: '',
          subject: replySubject,
          content: formatOriginalEmail(email),
          mode: 'reply'
        })
        setCurrentView('compose')
      }
    } catch (error) {
      console.error('Failed to load email for reply:', error)
    }
  }

  // 이메일 목록에서 전달 (헤더만 있는 경우)
  const handleListForward = async (emailHeaders: EmailHeader[]) => {
    if (emailHeaders.length === 0) return

    try {
      // 첫 번째 이메일의 전체 내용 가져오기 (Local-First)
      let result = await window.electron.ipcRenderer.invoke(
        'get-email-content-local',
        currentAccount,
        currentFolder,
        emailHeaders[0].uid
      )
      if (!result.success) {
        result = await window.electron.ipcRenderer.invoke(
          'get-email-content',
          currentAccount,
          currentFolder,
          emailHeaders[0].uid
        )
      }
      if (result.success && result.email) {
        const email = result.email
        const originalSubject = email.subject
        const fwdSubject = originalSubject.startsWith('Fwd:')
          ? originalSubject
          : `Fwd: ${originalSubject}`

        setComposeData({
          to: '',
          cc: '',
          subject: fwdSubject,
          content: formatOriginalEmail(email),
          mode: 'forward'
        })
        setCurrentView('compose')
      }
    } catch (error) {
      console.error('Failed to load email for forward:', error)
    }
  }

  // 이메일 본문 조회 (Trello 연동용)
  const handleGetEmailContent = async (
    uid: number
  ): Promise<{
    subject: string
    body: string
    from: string
    date: string
  } | null> => {
    try {
      // Local-First: 먼저 로컬 캐시에서 조회
      let result = await window.electron.ipcRenderer.invoke(
        'get-email-content-local',
        currentAccount,
        currentFolder,
        uid
      )
      if (!result.success) {
        result = await window.electron.ipcRenderer.invoke(
          'get-email-content',
          currentAccount,
          currentFolder,
          uid
        )
      }
      if (result.success && result.email) {
        const email = result.email
        // HTML이 있으면 HTML에서 텍스트 추출, 없으면 텍스트 사용
        let body = email.text || ''
        if (email.html) {
          // HTML에서 간단히 텍스트 추출 (태그 제거)
          body = email.html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        }
        const senderName = email.from?.[0]?.name || ''
        const senderEmail = email.from?.[0]?.address || ''
        const fromString = senderName ? `${senderName} <${senderEmail}>` : senderEmail

        return {
          subject: email.subject || '',
          body,
          from: fromString,
          date: new Date(email.date).toLocaleString('ko-KR')
        }
      }
      return null
    } catch (error) {
      console.error('Failed to get email content:', error)
      return null
    }
  }

  const getFolderName = (folderPath: string): string => {
    const folderNames: Record<string, string> = {
      INBOX: t('sidebar.inbox'),
      ALL_MAIL: t('sidebar.allMail'),
      Sent: t('sidebar.sent'),
      보낸편지함: t('sidebar.sent'),
      'Sent Messages': t('sidebar.sent'),
      Drafts: t('sidebar.drafts'),
      임시보관함: t('sidebar.drafts'),
      Trash: t('sidebar.trash'),
      휴지통: t('sidebar.trash'),
      'Deleted Messages': t('sidebar.trash'),
      Junk: t('sidebar.spam'),
      스팸메일함: t('sidebar.spam'),
      Spam: t('sidebar.spam'),
      SPAMBOX: t('sidebar.spam'),
      내게쓴메일함: t('sidebar.self'),
      TOME: t('sidebar.self'),
      ARCHIVING: t('sidebar.scheduled'),
      예약메일함: t('sidebar.scheduled')
    }
    return folderNames[folderPath] || folderPath
  }

  // 사이드바용 폴더 카운트 계산
  const getFolderCounts = () => {
    const counts: Record<string, { total: number; unseen: number }> = {
      inbox: { total: 0, unseen: 0 },
      allMail: { total: 0, unseen: 0 },
      sent: { total: 0, unseen: 0 },
      drafts: { total: 0, unseen: 0 },
      trash: { total: 0, unseen: 0 },
      spam: { total: 0, unseen: 0 },
      self: { total: 0, unseen: 0 },
      scheduled: { total: 0, unseen: 0 }
    }

    // 전체 메일 수 계산 (모든 폴더 합계)
    let allMailTotal = 0
    let allMailUnseen = 0

    for (const [path, info] of Object.entries(folderInfos)) {
      const folder = flattenFolders(folders).find((f) => f.path === path)
      if (folder) {
        const key = FOLDER_MAP[folder.name] || FOLDER_MAP[path]
        if (key && counts[key]) {
          counts[key] = { total: info.total, unseen: info.unseen }
        }
      }
      // 전체 메일 수에 합산
      allMailTotal += info.total || 0
      allMailUnseen += info.unseen || 0
    }

    // 전체메일함 카운트 설정
    counts.allMail = { total: allMailTotal, unseen: allMailUnseen }

    // INBOX 직접 매핑
    if (folderInfos['INBOX']) {
      counts.inbox = { total: folderInfos['INBOX'].total, unseen: folderInfos['INBOX'].unseen }
    }

    return counts
  }

  // 하위 폴더 추출
  const getSubFolders = (parentPath: string) => {
    const allFolders = flattenFolders(folders)
    return allFolders
      .filter((f) => f.path.startsWith(parentPath + '/') || f.path.startsWith(parentPath + '.'))
      .map((f) => {
        // 폴더 경로에서 마지막 이름만 추출 (INBOX/테스트 -> 테스트)
        const delimiter = f.path.includes('/') ? '/' : '.'
        const parts = f.path.split(delimiter)
        const displayName = parts[parts.length - 1]
        return {
          name: displayName,
          path: f.path
        }
      })
  }

  const inboxSubFolders = getSubFolders('INBOX')
  const sentSubFolders = [
    ...getSubFolders('Sent'),
    ...getSubFolders('보낸편지함'),
    ...getSubFolders('Sent Messages')
  ]

  // "내 메일함" (사용자 정의 폴더) 추출
  // 시스템 폴더를 제외한 루트 레벨 폴더들
  const customFolders = React.useMemo(() => {
    // 시스템 폴더 목록 (FOLDER_MAP에 매핑된 폴더들)
    const systemFolderNames = new Set([
      'INBOX',
      'Sent',
      '보낸편지함',
      'Sent Messages',
      'Sent Items',
      'Drafts',
      '임시보관함',
      'Trash',
      '휴지통',
      'Deleted Messages',
      'Deleted Items',
      'Junk',
      '스팸메일함',
      'Spam',
      'SPAMBOX',
      '내게쓴메일함',
      'TOME',
      'ARCHIVING',
      '예약메일함'
    ])

    // folders 배열은 이미 트리 구조이므로, 루트 레벨 폴더는 folders 배열 자체의 항목들
    // flattenFolders를 사용하지 않고 직접 folders를 필터링
    const customRootFolders = folders.filter((f) => {
      // 시스템 폴더가 아닌 경우만 사용자 정의 폴더로 분류
      return !systemFolderNames.has(f.name) && !systemFolderNames.has(f.path)
    })

    return customRootFolders.map((f) => ({
      name: f.name,
      path: f.path,
      unseen: folderInfos[f.path]?.unseen || 0
    }))
  }, [folders, folderInfos])

  // 관련 필터 확인
  const getFiltersUsingFolder = async (folderPath: string): Promise<number> => {
    const filters = await window.electron.ipcRenderer.invoke(
      'get-filters-using-folder',
      currentAccount,
      folderPath
    )
    return filters?.length || 0
  }

  // 내 메일함 폴더 생성 (루트 레벨)
  const handleCreateCustomFolder = async (
    folderName: string
  ): Promise<{ success: boolean; error?: string }> => {
    const result = await window.electron.ipcRenderer.invoke(
      'create-folder',
      currentAccount,
      folderName,
      '' // 빈 문자열 = 루트 레벨
    )

    if (result.success) {
      // 폴더 생성 후 캐시를 무시하고 강제 새로고침
      await loadFolders(true)
      return { success: true }
    } else {
      console.error('Failed to create custom folder:', result.error)
      return { success: false, error: result.error }
    }
  }

  // 내 메일함 폴더 이름 변경
  const handleRenameCustomFolder = async (
    oldPath: string,
    newName: string
  ): Promise<{ success: boolean; error?: string }> => {
    const result = await window.electron.ipcRenderer.invoke(
      'rename-folder',
      currentAccount,
      oldPath,
      newName // 루트 레벨이므로 새 이름이 곧 새 경로
    )

    if (result.success) {
      // 관련 필터의 대상 폴더도 업데이트
      const updateResult = await window.electron.ipcRenderer.invoke(
        'update-filters-target-folder',
        currentAccount,
        oldPath,
        newName
      )
      if (updateResult.updatedCount > 0) {
        console.log(`[handleRenameCustomFolder] Updated ${updateResult.updatedCount} filters`)
      }
      // 폴더 이름 변경 후 캐시를 무시하고 강제 새로고침
      await loadFolders(true)
      return { success: true }
    } else {
      console.error('Failed to rename custom folder:', result.error)
      return { success: false, error: result.error }
    }
  }

  // 폴더의 메일 개수 조회
  const getFolderEmailCount = async (folderPath: string): Promise<number> => {
    const result = await window.electron.ipcRenderer.invoke(
      'get-folder-email-count',
      currentAccount,
      folderPath
    )
    return result?.count || 0
  }

  // 내 메일함 폴더 삭제
  const handleDeleteCustomFolder = async (
    folderPath: string,
    options?: {
      confirmFiltersDelete?: boolean
      confirmEmailsDelete?: boolean
      moveEmailsTo?: string
    }
  ): Promise<{
    success: boolean
    error?: string
    hasFilters?: boolean
    filtersCount?: number
    hasEmails?: boolean
    emailsCount?: number
  }> => {
    const { confirmFiltersDelete, confirmEmailsDelete, moveEmailsTo } = options || {}

    // 관련 필터 확인
    const filtersCount = await getFiltersUsingFolder(folderPath)

    // 관련 필터가 있고 확인을 받지 않은 경우 확인 요청
    if (filtersCount > 0 && !confirmFiltersDelete) {
      return {
        success: false,
        hasFilters: true,
        filtersCount,
        error: t('sidebar.hasRelatedFilters', { count: filtersCount })
      }
    }

    // 폴더에 메일이 있는지 확인
    const emailsCount = await getFolderEmailCount(folderPath)

    // 메일이 있고 확인/이동 지정이 안된 경우 확인 요청
    if (emailsCount > 0 && !confirmEmailsDelete && !moveEmailsTo) {
      return {
        success: false,
        hasEmails: true,
        emailsCount,
        error: t('sidebar.hasEmailsInFolder', { count: emailsCount })
      }
    }

    // 관련 필터 삭제
    if (filtersCount > 0) {
      const deleteFiltersResult = await window.electron.ipcRenderer.invoke(
        'delete-filters-using-folder',
        currentAccount,
        folderPath
      )
      console.log(`[handleDeleteCustomFolder] Deleted ${deleteFiltersResult.deletedCount} filters`)
    }

    // 폴더 삭제 (메일 이동 옵션 포함)
    const result = await window.electron.ipcRenderer.invoke(
      'delete-folder',
      currentAccount,
      folderPath,
      moveEmailsTo // 지정된 경우 메일 이동, 아니면 함께 삭제
    )

    if (result.success) {
      if (currentFolder === folderPath) {
        setCurrentFolder('INBOX')
      }
      // 폴더 삭제 후 캐시를 무시하고 강제 새로고침
      await loadFolders(true)
      // 메일 목록 새로고침 (이동된 메일 반영)
      if (moveEmailsTo) {
        await loadEmails()
      }
      return { success: true }
    } else {
      console.error('Failed to delete custom folder:', result.error)
      return { success: false, error: result.error }
    }
  }

  // 사이드바 폴더 키를 실제 IMAP 폴더 경로로 변환
  const resolveTargetFolder = (folderKey: string): string => {
    // 이미 실제 경로인 경우 (슬래시, 점 포함 또는 대문자 INBOX 등)
    if (folderKey.includes('/') || folderKey.includes('.') || folderKey === 'INBOX') {
      return folderKey
    }

    // 역매핑 테이블에서 후보 찾기
    const candidates = REVERSE_FOLDER_MAP[folderKey]
    if (!candidates) {
      return folderKey // 매핑 없으면 그대로 반환
    }

    // 폴더 목록에서 실제 존재하는 폴더 찾기
    const allFolders = flattenFolders(folders)
    for (const candidate of candidates) {
      const found = allFolders.find(
        (f) => f.path === candidate || f.name === candidate || f.path.endsWith('/' + candidate)
      )
      if (found) {
        console.log(`[resolveTargetFolder] Resolved '${folderKey}' to '${found.path}'`)
        return found.path
      }
    }

    // 기본값: 첫 번째 후보 사용
    console.log(`[resolveTargetFolder] No match found for '${folderKey}', using first candidate: '${candidates[0]}'`)
    return candidates[0]
  }

  // 이메일 이동 (벌크 API 사용)
  const handleMoveEmails = async (uids: number[], targetFolder: string): Promise<void> => {
    // 타겟 폴더 경로 해석
    const resolvedTargetFolder = resolveTargetFolder(targetFolder)

    console.log(
      `[handleMoveEmails] Moving ${uids.length} emails from ${currentFolder} to ${resolvedTargetFolder} (original: ${targetFolder})`
    )

    // 이동 전 안읽음 메일 수 계산
    const unreadCount = emails.filter(
      (e) => uids.includes(e.uid) && !e.flags.includes('\\Seen')
    ).length

    // 검색 모드인지 확인
    const isInSearchMode = !!(detailedSearchParams || (isSearching && searchQuery.trim()))

    const result = await window.electron.ipcRenderer.invoke(
      'move-bulk-emails',
      currentAccount,
      currentFolder,
      resolvedTargetFolder,
      uids
    )

    console.log(`[handleMoveEmails] Bulk move result:`, result)

    if (result.success) {
      // 폴더 카운트 업데이트
      setFolderInfos((prev) => {
        const current = prev[currentFolder]
        if (current) {
          return {
            ...prev,
            [currentFolder]: {
              ...current,
              total: Math.max(0, current.total - uids.length),
              unseen: Math.max(0, current.unseen - unreadCount)
            }
          }
        }
        return prev
      })

      // 검색 모드에서는 즉시 UI에서 삭제된 메일 제거
      if (isInSearchMode) {
        console.log(`[handleMoveEmails] In search mode, removing ${uids.length} emails from UI`)
        setEmails((prev) => prev.filter((e) => !uids.includes(e.uid)))
        setTotalEmails((prev) => Math.max(0, prev - uids.length))
      } else {
        // 일반 폴더에서는 목록 다시 로드하여 삭제된 자리를 채움
        await loadEmails()
      }
    } else {
      console.error(`[handleMoveEmails] Failed to move: ${result.error}`)
    }

    console.log(`[handleMoveEmails] Done`)
  }

  // 이메일 삭제 (휴지통으로 이동 또는 영구 삭제)
  const handleDeleteEmails = async (uids: number[], permanent: boolean = false): Promise<void> => {
    console.log(`[handleDeleteEmails] Deleting ${uids.length} emails, permanent=${permanent}`)

    // 삭제 전에 삭제될 메일의 특성 계산
    const deletedEmails = emails.filter((e) => uids.includes(e.uid))
    const unreadCount = deletedEmails.filter((e) => !e.flags.includes('\\Seen')).length

    const result = await window.electron.ipcRenderer.invoke(
      'delete-bulk-emails',
      currentAccount,
      currentFolder,
      uids,
      permanent
    )

    console.log(`[handleDeleteEmails] Result:`, result)

    if (result.success) {
      // 폴더 카운트 업데이트
      setFolderInfos((prev) => {
        const current = prev[currentFolder]
        if (current) {
          return {
            ...prev,
            [currentFolder]: {
              ...current,
              total: Math.max(0, current.total - uids.length),
              unseen: Math.max(0, current.unseen - unreadCount)
            }
          }
        }
        return prev
      })

      // UI에서 삭제된 메일 즉시 제거 (로컬 우선 방식)
      console.log(`[handleDeleteEmails] Removing ${uids.length} emails from UI`)
      setEmails((prev) => prev.filter((e) => !uids.includes(e.uid)))
      setTotalEmails((prev) => Math.max(0, prev - uids.length))
    } else {
      console.error(`[handleDeleteEmails] Failed:`, result.error)
    }
  }

  // 이메일 이동 및 자동분류 규칙 생성
  const handleMoveAndCreateRule = async (uids: number[], targetFolder: string): Promise<void> => {
    // 선택된 이메일들의 발신자 정보 추출
    const selectedEmailHeaders = emails.filter((e) => uids.includes(e.uid))
    const senderInfos = [
      ...new Map(
        selectedEmailHeaders.flatMap((e) =>
          e.from.map((f) => [f.address, { address: f.address, name: f.name || f.address }])
        )
      ).values()
    ]

    // 이메일 이동
    await handleMoveEmails(uids, targetFolder)

    // 각 발신자에 대해 자동분류 규칙 생성
    for (const sender of senderInfos) {
      const filterData = {
        name: `[${sender.name}]필터`,
        enabled: true,
        conditions: [
          {
            field: 'fromAddress',
            operator: 'equals',
            value: sender.address
          }
        ],
        matchAll: true,
        action: 'move',
        targetFolder
      }
      console.log('[handleMoveAndCreateRule] Adding filter:', filterData)
      const result = await window.electron.ipcRenderer.invoke(
        'add-mail-filter',
        currentAccount,
        filterData
      )
      if (result.isDuplicate) {
        console.log('[handleMoveAndCreateRule] Filter already exists:', result.existingFilter?.name)
      } else if (result.success) {
        console.log('[handleMoveAndCreateRule] Filter added:', result.filter?.name)
        // 새로 추가된 필터를 즉시 실행하여 INBOX의 일치하는 메일 이동
        const filterResult = await runSingleFilter(filterData)
        if (filterResult.processedCount > 0) {
          console.log(
            `[handleMoveAndCreateRule] Filter applied: ${filterResult.processedCount} emails moved`
          )
        }
      } else {
        console.error('[handleMoveAndCreateRule] Failed to add filter:', result.error)
      }
    }
  }

  // 이동용 새 폴더 생성 (루트 레벨에 생성)
  const handleCreateMoveFolder = async (
    folderName: string
  ): Promise<{ success: boolean; path?: string }> => {
    const result = await window.electron.ipcRenderer.invoke(
      'create-folder',
      currentAccount,
      folderName,
      '' // 루트 레벨에 생성
    )

    if (result.success) {
      // 폴더 목록 새로고침
      await loadFolders()
      return { success: true, path: result.path || folderName }
    } else {
      console.error('Failed to create move folder:', result.error)
      return { success: false }
    }
  }

  // 스팸메일함 폴더 경로 찾기
  const getSpamFolderPath = (): string | null => {
    const allFolders = flattenFolders(folders)
    console.log(
      '[getSpamFolderPath] All folders:',
      allFolders.map((f) => ({ name: f.name, path: f.path }))
    )

    // 가능한 스팸 폴더 이름들
    const spamNames = ['Junk', '스팸메일함', 'Spam', 'Junk E-mail', 'Bulk Mail', 'SPAMBOX']

    for (const name of spamNames) {
      const spamFolder = allFolders.find(
        (f) => f.name === name || f.path === name || f.path.endsWith(`/${name}`)
      )
      if (spamFolder) {
        console.log('[getSpamFolderPath] Found spam folder:', spamFolder.path)
        return spamFolder.path
      }
    }
    console.log('[getSpamFolderPath] No spam folder found')
    return null
  }

  // 스팸 등록 (발신자 주소를 스팸 차단 목록에 추가하고 메일을 스팸함으로 이동)
  const handleMarkSpam = async (senderEmails: string[], uids?: number[]) => {
    console.log('[handleMarkSpam] Called with senderEmails:', senderEmails, 'uids:', uids)
    try {
      // 현재 스팸 설정 가져오기
      const spamSettings = await window.electron.ipcRenderer.invoke(
        'get-spam-settings',
        currentAccount
      )

      // 새로운 차단 발신자 추가 (중복 제거)
      const existingEmails = new Set(
        spamSettings.blockedSenders.map((s: { email: string }) => s.email)
      )
      const newBlockedSenders = senderEmails
        .filter((email) => !existingEmails.has(email.toLowerCase()))
        .map((email) => ({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          email: email.toLowerCase(),
          addedAt: Date.now()
        }))

      if (newBlockedSenders.length > 0) {
        // 스팸 설정 업데이트
        await window.electron.ipcRenderer.invoke('update-spam-settings', currentAccount, {
          ...spamSettings,
          enabled: true,
          blockedSenders: [...spamSettings.blockedSenders, ...newBlockedSenders]
        })
        console.log('[handleMarkSpam] Added blocked senders:', newBlockedSenders)
      }

      // 메일을 스팸메일함으로 이동 (벌크 API 사용)
      if (uids && uids.length > 0) {
        const spamFolderPath = getSpamFolderPath()
        console.log(
          '[handleMarkSpam] Current folder:',
          currentFolder,
          'Spam folder:',
          spamFolderPath
        )

        if (spamFolderPath && currentFolder !== spamFolderPath) {
          const result = await window.electron.ipcRenderer.invoke(
            'move-bulk-emails',
            currentAccount,
            currentFolder,
            spamFolderPath,
            uids
          )
          console.log('[handleMarkSpam] Bulk move result:', result)

          if (result.success) {
            // 로컬 상태에서 이동된 이메일 제거
            setEmails((prev) => prev.filter((e) => !uids.includes(e.uid)))
            setTotalEmails((prev) => Math.max(0, prev - uids.length))
          }
        } else {
          console.log(
            '[handleMarkSpam] Cannot move - spamFolderPath:',
            spamFolderPath,
            'currentFolder:',
            currentFolder
          )
        }
      }
    } catch (error) {
      console.error('Failed to mark as spam:', error)
    }
  }

  // 스팸 해제 (발신자 차단 해제 + 받은메일함으로 이동)
  const handleUnmarkSpam = async (senderEmails: string[], uids?: number[]) => {
    console.log('[handleUnmarkSpam] Called with senderEmails:', senderEmails, 'uids:', uids)
    try {
      // 현재 스팸 설정 가져오기
      const spamSettings = await window.electron.ipcRenderer.invoke(
        'get-spam-settings',
        currentAccount
      )

      // 차단 목록에서 해당 발신자 제거
      const updatedBlockedSenders = spamSettings.blockedSenders.filter(
        (s: { email: string }) =>
          !senderEmails.some((email) => s.email.toLowerCase() === email.toLowerCase())
      )

      if (updatedBlockedSenders.length !== spamSettings.blockedSenders.length) {
        // 스팸 설정 업데이트
        await window.electron.ipcRenderer.invoke('update-spam-settings', currentAccount, {
          ...spamSettings,
          blockedSenders: updatedBlockedSenders
        })
        console.log('[handleUnmarkSpam] Removed from blocked senders')
      }

      // 메일을 받은메일함으로 이동 (벌크 API 사용)
      if (uids && uids.length > 0) {
        const result = await window.electron.ipcRenderer.invoke(
          'move-bulk-emails',
          currentAccount,
          currentFolder,
          'INBOX',
          uids
        )
        console.log('[handleUnmarkSpam] Bulk move result:', result)

        if (result.success) {
          // 로컬 상태에서 이동된 이메일 제거
          setEmails((prev) => prev.filter((e) => !uids.includes(e.uid)))
          setTotalEmails((prev) => Math.max(0, prev - uids.length))
        }
      }
    } catch (error) {
      console.error('Failed to unmark spam:', error)
    }
  }

  // 복원 (휴지통에서 받은메일함으로 이동) - 벌크 API 사용
  const handleRestore = async (uids: number[]) => {
    console.log('[handleRestore] Called with uids:', uids)
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'move-bulk-emails',
        currentAccount,
        currentFolder,
        'INBOX',
        uids
      )
      console.log('[handleRestore] Bulk move result:', result)

      if (result.success) {
        // 로컬 상태에서 이동된 이메일 제거
        setEmails((prev) => prev.filter((e) => !uids.includes(e.uid)))
        setTotalEmails((prev) => Math.max(0, prev - uids.length))
      }
    } catch (error) {
      console.error('Failed to restore emails:', error)
    }
  }

  // 폴더 비우기 (휴지통 또는 스팸메일함의 모든 메일 영구 삭제)
  const handleEmptyFolder = async () => {
    console.log('[handleEmptyFolder] Emptying folder:', currentFolder)
    try {
      // 현재 폴더의 모든 메일 영구 삭제
      const result = await window.electron.ipcRenderer.invoke(
        'empty-folder',
        currentAccount,
        currentFolder
      )
      console.log('[handleEmptyFolder] Result:', result)

      if (result.success) {
        // 로컬 상태 초기화
        setEmails([])
        setTotalEmails(0)

        // 폴더 정보 업데이트
        setFolderInfos((prev) => ({
          ...prev,
          [currentFolder]: { path: currentFolder, total: 0, unseen: 0 }
        }))
      }
    } catch (error) {
      console.error('Failed to empty folder:', error)
    }
  }

  // EmailView - 이전 메일로 이동
  const handleViewPrev = async () => {
    if (selectedEmailIndex > 0) {
      const prevEmail = emails[selectedEmailIndex - 1]
      if (prevEmail) {
        await handleEmailSelect(prevEmail)
      }
    }
  }

  // EmailView - 다음 메일로 이동
  const handleViewNext = async () => {
    if (selectedEmailIndex < emails.length - 1) {
      const nextEmail = emails[selectedEmailIndex + 1]
      if (nextEmail) {
        await handleEmailSelect(nextEmail)
      }
    }
  }

  // EmailView - 현재 메일 삭제
  const handleViewDelete = async () => {
    if (!selectedEmail) return

    // 삭제 전에 읽지 않은 메일인지 확인
    const isUnread = !selectedEmail.flags.includes('\\Seen')

    await window.electron.ipcRenderer.invoke(
      'delete-email',
      currentAccount,
      currentFolder,
      selectedEmail.uid,
      false
    )

    // 로컬 상태에서 삭제된 이메일 제거 (가상 폴더에서는 UID + folder로 비교)
    setEmails((prev) =>
      prev.filter(
        (e) =>
          e.uid !== selectedEmail.uid ||
          (selectedEmail.folder && e.folder !== selectedEmail.folder)
      )
    )
    setTotalEmails((prev) => Math.max(0, prev - 1))

    // 폴더 카운트 업데이트
    setFolderInfos((prev) => {
      const current = prev[currentFolder]
      if (current) {
        return {
          ...prev,
          [currentFolder]: {
            ...current,
            total: Math.max(0, current.total - 1),
            unseen: isUnread ? Math.max(0, current.unseen - 1) : current.unseen
          }
        }
      }
      return prev
    })

    // 목록으로 돌아가기
    setSelectedEmail(null)
    setCurrentView('list')
  }

  // EmailView - 현재 메일 스팸 등록
  const handleViewMarkSpam = async () => {
    if (!selectedEmail) return

    const senderEmail = selectedEmail.from[0]?.address
    if (senderEmail) {
      // 발신자 차단 및 메일 스팸함으로 이동
      await handleMarkSpam([senderEmail], [selectedEmail.uid])
    }

    // 목록으로 돌아가기
    setSelectedEmail(null)
    setCurrentView('list')
  }

  // EmailView - 안읽음 표시
  const handleViewMarkUnread = async () => {
    if (!selectedEmail) return

    // 가상 폴더(ALL_MAIL 등)에서는 실제 폴더 경로 사용
    const actualFolder = selectedEmail.folder || currentFolder

    await window.electron.ipcRenderer.invoke(
      'set-email-flags',
      currentAccount,
      actualFolder,
      selectedEmail.uid,
      ['\\Seen'],
      false
    )

    // 로컬 상태 업데이트 (가상 폴더에서는 UID + folder로 비교)
    setEmails((prev) =>
      prev.map((e) =>
        e.uid === selectedEmail.uid &&
        (!selectedEmail.folder || e.folder === selectedEmail.folder)
          ? { ...e, flags: e.flags.filter((f) => f !== '\\Seen') }
          : e
      )
    )

    // 폴더 안읽은 메일 수 업데이트
    setFolderInfos((prev) => {
      const current = prev[currentFolder]
      if (current) {
        return {
          ...prev,
          [currentFolder]: { ...current, unseen: current.unseen + 1 }
        }
      }
      return prev
    })

    // 목록으로 돌아가기
    setSelectedEmail(null)
    setCurrentView('list')
  }

  // EmailView - EML 파일로 저장
  const handleViewSaveAsEml = async () => {
    if (!selectedEmail) return

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'save-email-as-eml',
        currentAccount,
        currentFolder,
        selectedEmail.uid,
        selectedEmail.subject
      )
      if (!result.success) {
        console.error('Failed to save email as EML:', result.error)
      }
    } catch (error) {
      console.error('Failed to save email as EML:', error)
    }
  }

  // EmailView - 메일 이동
  const handleViewMove = async (targetFolder: string) => {
    if (!selectedEmail) return

    await window.electron.ipcRenderer.invoke(
      'move-email',
      currentAccount,
      currentFolder,
      targetFolder,
      selectedEmail.uid
    )

    // 로컬 상태에서 이동된 이메일 제거 (가상 폴더에서는 UID + folder로 비교)
    setEmails((prev) =>
      prev.filter(
        (e) =>
          e.uid !== selectedEmail.uid ||
          (selectedEmail.folder && e.folder !== selectedEmail.folder)
      )
    )
    setTotalEmails((prev) => Math.max(0, prev - 1))

    // 목록으로 돌아가기
    setSelectedEmail(null)
    setCurrentView('list')
  }

  // EmailView - 메일 이동 및 자동분류 규칙 생성 (계속 이동)
  const handleViewMoveAndCreateRule = async (targetFolder: string) => {
    if (!selectedEmail) return

    const senderAddress = selectedEmail.from[0]?.address
    const senderName = selectedEmail.from[0]?.name || senderAddress

    // 이메일 이동
    await window.electron.ipcRenderer.invoke(
      'move-email',
      currentAccount,
      currentFolder,
      targetFolder,
      selectedEmail.uid
    )

    // 자동분류 규칙 생성
    if (senderAddress) {
      const filterData = {
        name: `[${senderName}]필터`,
        enabled: true,
        conditions: [
          {
            field: 'fromAddress',
            operator: 'equals',
            value: senderAddress
          }
        ],
        matchAll: true,
        action: 'move',
        targetFolder
      }
      console.log('[handleViewMoveAndCreateRule] Adding filter:', filterData)
      const result = await window.electron.ipcRenderer.invoke(
        'add-mail-filter',
        currentAccount,
        filterData
      )
      if (result.isDuplicate) {
        console.log(
          '[handleViewMoveAndCreateRule] Filter already exists:',
          result.existingFilter?.name
        )
      } else if (result.success) {
        console.log('[handleViewMoveAndCreateRule] Filter added:', result.filter?.name)
        // 새로 추가된 필터 즉시 실행
        const filterResult = await runSingleFilter(filterData)
        if (filterResult.processedCount > 0) {
          console.log(
            `[handleViewMoveAndCreateRule] Filter applied: ${filterResult.processedCount} emails moved`
          )
        }
      } else {
        console.error('[handleViewMoveAndCreateRule] Failed to add filter:', result.error)
      }
    }

    // 로컬 상태에서 이동된 이메일 제거 (가상 폴더에서는 UID + folder로 비교)
    setEmails((prev) =>
      prev.filter(
        (e) =>
          e.uid !== selectedEmail.uid ||
          (selectedEmail.folder && e.folder !== selectedEmail.folder)
      )
    )
    setTotalEmails((prev) => Math.max(0, prev - 1))

    // 목록으로 돌아가기
    setSelectedEmail(null)
    setCurrentView('list')
  }

  // EmailView - 별표 토글
  const handleViewToggleStar = async (starred: boolean) => {
    if (!selectedEmail) return

    // 가상 폴더(ALL_MAIL 등)에서는 실제 폴더 경로 사용
    const actualFolder = selectedEmail.folder || currentFolder

    await window.electron.ipcRenderer.invoke(
      'set-email-flags',
      currentAccount,
      actualFolder,
      selectedEmail.uid,
      ['\\Flagged'],
      starred
    )

    // 로컬 상태 업데이트 (가상 폴더에서는 UID + folder로 비교)
    setEmails((prev) =>
      prev.map((e) => {
        if (
          e.uid !== selectedEmail.uid ||
          (selectedEmail.folder && e.folder !== selectedEmail.folder)
        )
          return e
        const newFlags = starred
          ? [...new Set([...e.flags, '\\Flagged'])]
          : e.flags.filter((f) => f !== '\\Flagged')
        return { ...e, flags: newFlags }
      })
    )
  }

  // ========== 발신자 팝업 핸들러들 ==========

  // VIP 토글
  const handleToggleSenderVip = async (email: string, isVip: boolean) => {
    const senderName = selectedEmail?.from[0]?.name || ''
    if (isVip) {
      await window.electron.ipcRenderer.invoke('add-vip-sender', currentAccount, email, senderName)
    } else {
      await window.electron.ipcRenderer.invoke('remove-vip-sender', currentAccount, email)
    }
    // 선택된 이메일 다시 로드하여 VIP 상태 반영
    if (selectedEmail) {
      setSelectedEmail({ ...selectedEmail })
    }
  }

  // 발신자에게 메일 쓰기
  const handleComposeToSender = (senderEmail: string, name: string) => {
    setComposeData({
      mode: 'compose',
      to: name ? `${name} <${senderEmail}>` : senderEmail,
      cc: '',
      subject: '',
      content: ''
    })
    setCurrentView('compose')
  }

  // 발신자를 주소록에 추가
  const handleAddSenderToContacts = async (data: {
    name: string
    email: string
    groupId: string
    isVip: boolean
  }) => {
    const result = await window.electron.ipcRenderer.invoke('add-contact', currentAccount, {
      name: data.name || data.email.split('@')[0],
      email: data.email,
      groupIds: data.groupId ? [data.groupId] : [],
      starred: data.isVip
    })
    if (result.success) {
      // VIP 발신자로도 등록
      if (data.isVip) {
        await window.electron.ipcRenderer.invoke(
          'add-vip-sender',
          currentAccount,
          data.email,
          data.name
        )
      }
      alert(t('addressBook.added'))
    } else {
      alert(result.error || t('addressBook.addFailed'))
    }
  }

  // 발신자 차단
  const handleBlockSender = async (email: string) => {
    const confirmed = confirm(t('spam.blockConfirm', { email }))
    if (!confirmed) return

    const settings = await window.electron.ipcRenderer.invoke('get-spam-settings', currentAccount)
    const blockedSenders = settings.blockedSenders || []
    blockedSenders.push({
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      addedAt: Date.now()
    })
    await window.electron.ipcRenderer.invoke('update-spam-settings', currentAccount, {
      blockedSenders
    })
    alert(t('spam.blocked', { email }))
  }

  // 주고받은 메일 보기
  const handleViewConversation = async (senderEmail: string) => {
    // from 또는 to에 해당 이메일이 포함된 메일 검색
    setDetailedSearchParams({
      sender: senderEmail,
      recipientType: 'to',
      recipient: '',
      contentType: 'all',
      content: '',
      mailbox: 'all',
      periodType: 'all',
      startDate: '',
      endDate: '',
      hasAttachment: false,
      includeTrashSpam: false
    })
    setCurrentPage(1) // 검색 시 1페이지로 초기화
    setCurrentView('list')
  }

  // 보낸 사람으로 검색
  const handleSearchBySender = async (senderEmail: string) => {
    setDetailedSearchParams({
      sender: senderEmail,
      recipientType: 'to',
      recipient: '',
      contentType: 'all',
      content: '',
      mailbox: 'all',
      periodType: 'all',
      startDate: '',
      endDate: '',
      hasAttachment: false,
      includeTrashSpam: false
    })
    setCurrentPage(1) // 검색 시 1페이지로 초기화
    setCurrentView('list')
  }

  // 받는 사람으로 검색
  const handleSearchByRecipient = async (senderEmail: string) => {
    setDetailedSearchParams({
      sender: '',
      recipientType: 'to',
      recipient: senderEmail,
      contentType: 'all',
      content: '',
      mailbox: 'all',
      periodType: 'all',
      startDate: '',
      endDate: '',
      hasAttachment: false,
      includeTrashSpam: false
    })
    setCurrentPage(1) // 검색 시 1페이지로 초기화
    setCurrentView('list')
  }

  // 자동 분류 설정 (메일 필터 추가)
  const handleAutoClassifySender = (email: string) => {
    console.log('[handleAutoClassifySender] Opening auto-classify dialog for:', email)
    console.log('[handleAutoClassifySender] Current account:', currentAccount)
    console.log('[handleAutoClassifySender] Available folders:', folders.length)
    setAutoClassifySenderEmail(email)
    setIsAutoClassifyDialogOpen(true)
  }

  // 자동 분류 다이얼로그 확인 핸들러
  const handleAutoClassifyConfirm = async (data: {
    senderAddress: string
    targetFolder: string
    newFolderName?: string
    moveExistingEmails: boolean
  }) => {
    console.log('[handleAutoClassifyConfirm] === START ===')
    console.log('[handleAutoClassifyConfirm] Received data:', JSON.stringify(data, null, 2))
    console.log('[handleAutoClassifyConfirm] Current account:', currentAccount)

    try {
      // 필터 생성
      const filterData = {
        name: `[${data.senderAddress}] 자동분류`,
        enabled: true,
        conditions: [
          {
            field: 'fromAddress',
            operator: 'equals',
            value: data.senderAddress
          }
        ],
        matchAll: true,
        action: 'move',
        targetFolder: data.targetFolder
      }

      console.log('[handleAutoClassifyConfirm] Filter data to add:', JSON.stringify(filterData, null, 2))
      console.log('[handleAutoClassifyConfirm] Calling IPC add-mail-filter...')

      const result = await window.electron.ipcRenderer.invoke(
        'add-mail-filter',
        currentAccount,
        filterData
      )

      console.log('[handleAutoClassifyConfirm] IPC result:', JSON.stringify(result, null, 2))

      if (result.isDuplicate) {
        console.log(
          '[handleAutoClassifyConfirm] Filter already exists:',
          result.existingFilter?.name
        )
      } else if (result.success) {
        console.log('[handleAutoClassifyConfirm] Filter added successfully:', result.filter?.name)
        console.log('[handleAutoClassifyConfirm] Filter ID:', result.filter?.id)

        // 기존 메일도 이동하기 옵션이 선택된 경우
        if (data.moveExistingEmails) {
          console.log('[handleAutoClassifyConfirm] moveExistingEmails is true, running filter...')
          const filterResult = await runSingleFilter(filterData)
          console.log('[handleAutoClassifyConfirm] runSingleFilter result:', filterResult)
          if (filterResult.processedCount > 0) {
            console.log(
              `[handleAutoClassifyConfirm] Moved ${filterResult.processedCount} existing emails`
            )
          }
        } else {
          console.log('[handleAutoClassifyConfirm] moveExistingEmails is false, skipping filter run')
        }
      } else {
        console.error('[handleAutoClassifyConfirm] Failed to add filter:', result.error)
      }

      console.log('[handleAutoClassifyConfirm] Closing dialog...')
      setIsAutoClassifyDialogOpen(false)
      console.log('[handleAutoClassifyConfirm] === END ===')
    } catch (error) {
      console.error('[handleAutoClassifyConfirm] Error:', error)
      console.error('[handleAutoClassifyConfirm] Error stack:', error instanceof Error ? error.stack : 'N/A')
    }
  }

  // 발신자의 모든 메일 삭제
  const handleDeleteAllFromSender = async (senderEmail: string) => {
    try {
      console.log('Deleting all emails from sender:', senderEmail)
      console.log('Current folder:', currentFolder)
      console.log('Current account:', currentAccount)

      // 현재 폴더에서 해당 발신자의 메일 검색
      const searchParams: DetailedSearchParams = {
        sender: senderEmail,
        recipientType: 'to',
        recipient: '',
        contentType: 'all',
        content: '',
        mailbox: currentFolder,
        periodType: 'all',
        startDate: '',
        endDate: '',
        hasAttachment: false,
        includeTrashSpam: false
      }

      console.log('Search params:', searchParams)

      const result = await window.electron.ipcRenderer.invoke(
        'search-emails-detailed',
        currentAccount,
        searchParams,
        { start: 1, limit: 1000 }
      )

      console.log('Search result:', result)

      if (!result.success) {
        alert(t('search.error', { error: result.error || t('compose.unknownError') }))
        return
      }

      if (!result.emails || result.emails.length === 0) {
        alert(t('email.noEmailsToDelete'))
        return
      }

      console.log(`Found ${result.emails.length} emails to delete`)

      // 벌크 삭제 API 사용
      const uidsToDelete = result.emails.map((mail: { uid: number }) => mail.uid)
      const deleteResult = await window.electron.ipcRenderer.invoke(
        'delete-bulk-emails',
        currentAccount,
        currentFolder,
        uidsToDelete,
        false
      )
      console.log('Bulk delete result:', deleteResult)

      if (deleteResult.success && deleteResult.deletedCount > 0) {
        alert(t('email.movedToTrash', { count: deleteResult.deletedCount }))
        // 로컬 상태 업데이트
        setEmails((prev) => prev.filter((e) => !uidsToDelete.includes(e.uid)))
        setTotalEmails((prev) => Math.max(0, prev - deleteResult.deletedCount))
      } else if (!deleteResult.success) {
        alert(t('email.deleteFailed', { errors: deleteResult.error || t('compose.unknownError') }))
      }
    } catch (error) {
      console.error('Error in handleDeleteAllFromSender:', error)
      alert(
        t('common.errorOccurred', {
          error: error instanceof Error ? error.message : t('compose.unknownError')
        })
      )
    }
  }

  // 발신자 메일 강조 (미구현 - 추후 구현)
  const handleHighlightSender = async (_senderEmail: string) => {
    alert(t('email.highlightFeaturePending'))
  }

  // 발신자 VIP 여부 확인
  const checkSenderVip = async (email: string): Promise<boolean> => {
    return await window.electron.ipcRenderer.invoke('is-vip-sender', currentAccount, email)
  }

  // 선택된 이메일의 발신자 VIP 여부
  const [isSenderVip, setIsSenderVip] = React.useState(false)

  React.useEffect(() => {
    if (selectedEmail?.from[0]?.address) {
      checkSenderVip(selectedEmail.from[0].address).then(setIsSenderVip)
    }
  }, [selectedEmail])

  // 필터 실행 (활성화된 필터를 받은메일함에 적용)
  const handleRunFilters = async (): Promise<{
    success: boolean
    processedCount: number
    error?: string
  }> => {
    try {
      // 모든 필터 가져오기
      const filters = await window.electron.ipcRenderer.invoke('get-mail-filters', currentAccount)
      const enabledFilters = filters?.filter((f: { enabled: boolean }) => f.enabled) || []

      if (enabledFilters.length === 0) {
        return { success: false, processedCount: 0, error: '활성화된 필터가 없습니다.' }
      }

      // INBOX의 모든 이메일 가져오기 (Local-First)
      const result = await window.electron.ipcRenderer.invoke(
        'get-emails-local',
        currentAccount,
        'INBOX',
        { start: 1, limit: 1000 }
      )

      if (!result.success || !result.emails) {
        return {
          success: false,
          processedCount: 0,
          error: '이메일 목록을 가져오는데 실패했습니다.'
        }
      }

      const inboxEmails = result.emails
      let processedCount = 0

      // 각 이메일에 대해 필터 적용
      for (const email of inboxEmails) {
        // 이메일 전체 내용 가져오기 (본문 필터링용)
        let emailContent: { text?: string; html?: string } | null = null

        for (const filter of enabledFilters) {
          let matchesAll = filter.matchAll
          let hasMatch = false

          for (const condition of filter.conditions) {
            let fieldValue = ''

            switch (condition.field) {
              case 'fromName':
                fieldValue = email.from?.[0]?.name || ''
                break
              case 'fromAddress':
                fieldValue = email.from?.[0]?.address || ''
                break
              case 'toName':
                fieldValue = email.to?.[0]?.name || ''
                break
              case 'toAddress':
                fieldValue = email.to?.[0]?.address || ''
                break
              case 'subject':
                fieldValue = email.subject || ''
                break
              case 'body':
                // 본문이 필요하면 전체 이메일 로드 (Local-First)
                if (!emailContent) {
                  let contentResult = await window.electron.ipcRenderer.invoke(
                    'get-email-content-local',
                    currentAccount,
                    'INBOX',
                    email.uid
                  )
                  if (!contentResult.success) {
                    contentResult = await window.electron.ipcRenderer.invoke(
                      'get-email-content',
                      currentAccount,
                      'INBOX',
                      email.uid
                    )
                  }
                  if (contentResult.success && contentResult.email) {
                    emailContent = contentResult.email
                  }
                }
                fieldValue = emailContent?.text || emailContent?.html?.replace(/<[^>]+>/g, '') || ''
                break
            }

            let conditionMatches = false
            const compareValue = fieldValue.toLowerCase()
            const searchValue = condition.value.toLowerCase()

            switch (condition.operator) {
              case 'contains':
                conditionMatches = compareValue.includes(searchValue)
                break
              case 'equals':
                conditionMatches = compareValue === searchValue
                break
              case 'startsWith':
                conditionMatches = compareValue.startsWith(searchValue)
                break
              case 'endsWith':
                conditionMatches = compareValue.endsWith(searchValue)
                break
            }

            if (filter.matchAll) {
              // 모두 일치: 하나라도 불일치하면 실패
              if (!conditionMatches) {
                matchesAll = false
                break
              }
            } else {
              // 하나라도 일치: 하나라도 일치하면 성공
              if (conditionMatches) {
                hasMatch = true
                break
              }
            }
          }

          const shouldApply = filter.matchAll ? matchesAll : hasMatch

          if (shouldApply) {
            // 필터 동작 실행
            switch (filter.action) {
              case 'move':
                if (filter.targetFolder) {
                  await window.electron.ipcRenderer.invoke(
                    'move-email',
                    currentAccount,
                    'INBOX',
                    filter.targetFolder,
                    email.uid
                  )
                  processedCount++
                }
                break
              case 'delete':
                await window.electron.ipcRenderer.invoke(
                  'delete-email',
                  currentAccount,
                  'INBOX',
                  email.uid,
                  false
                )
                processedCount++
                break
              case 'markRead':
                await window.electron.ipcRenderer.invoke(
                  'set-email-flags',
                  currentAccount,
                  'INBOX',
                  email.uid,
                  ['\\Seen'],
                  true
                )
                processedCount++
                break
              case 'markStarred':
                await window.electron.ipcRenderer.invoke(
                  'set-email-flags',
                  currentAccount,
                  'INBOX',
                  email.uid,
                  ['\\Flagged'],
                  true
                )
                processedCount++
                break
            }
            break // 첫 번째 일치하는 필터만 적용
          }
        }
      }

      // 현재 INBOX를 보고 있다면 새로고침
      if (currentFolder === 'INBOX') {
        await loadEmails()
      }

      return { success: true, processedCount }
    } catch (error) {
      console.error('Failed to run filters:', error)
      return { success: false, processedCount: 0, error: '필터 실행 중 오류가 발생했습니다.' }
    }
  }

  // 단일 필터 실행 (새 필터 추가 후 즉시 적용)
  const runSingleFilter = async (filter: {
    conditions: Array<{ field: string; operator: string; value: string }>
    matchAll: boolean
    action: string
    targetFolder?: string
  }): Promise<{ success: boolean; processedCount: number }> => {
    console.log('[runSingleFilter] === START ===')
    console.log('[runSingleFilter] Filter:', JSON.stringify(filter, null, 2))
    console.log('[runSingleFilter] Current account:', currentAccount)

    try {
      // INBOX의 모든 이메일 가져오기 (Local-First)
      console.log('[runSingleFilter] Fetching emails from local DB...')
      const result = await window.electron.ipcRenderer.invoke(
        'get-emails-local',
        currentAccount,
        'INBOX',
        { start: 1, limit: 1000 }
      )

      console.log('[runSingleFilter] get-emails-local result:', {
        success: result.success,
        emailCount: result.emails?.length || 0,
        error: result.error
      })

      if (!result.success || !result.emails) {
        console.error('[runSingleFilter] Failed to get emails:', result.error)
        return { success: false, processedCount: 0 }
      }

      const inboxEmails = result.emails
      const matchingUids: number[] = []
      console.log(`[runSingleFilter] Total emails in INBOX: ${inboxEmails.length}`)

      // 각 이메일에 대해 필터 조건 확인
      for (const email of inboxEmails) {
        let matchesAll = filter.matchAll
        let hasMatch = false

        for (const condition of filter.conditions) {
          let fieldValue = ''

          switch (condition.field) {
            case 'fromName':
              fieldValue = email.from?.[0]?.name || ''
              break
            case 'fromAddress':
              fieldValue = email.from?.[0]?.address || ''
              break
            case 'toName':
              fieldValue = email.to?.[0]?.name || ''
              break
            case 'toAddress':
              fieldValue = email.to?.[0]?.address || ''
              break
            case 'subject':
              fieldValue = email.subject || ''
              break
          }

          let conditionMatches = false
          const compareValue = fieldValue.toLowerCase()
          const searchValue = condition.value.toLowerCase()

          switch (condition.operator) {
            case 'contains':
              conditionMatches = compareValue.includes(searchValue)
              break
            case 'equals':
              conditionMatches = compareValue === searchValue
              break
            case 'startsWith':
              conditionMatches = compareValue.startsWith(searchValue)
              break
            case 'endsWith':
              conditionMatches = compareValue.endsWith(searchValue)
              break
          }

          // 첫 몇 개 이메일에 대해 상세 로그
          if (matchingUids.length < 3 || inboxEmails.indexOf(email) < 5) {
            console.log(`[runSingleFilter] Email UID ${email.uid}: field=${condition.field}, fieldValue="${fieldValue}", searchValue="${condition.value}", operator=${condition.operator}, matches=${conditionMatches}`)
          }

          if (filter.matchAll) {
            if (!conditionMatches) {
              matchesAll = false
              break
            }
          } else {
            if (conditionMatches) {
              hasMatch = true
              break
            }
          }
        }

        const shouldApply = filter.matchAll ? matchesAll : hasMatch
        if (shouldApply) {
          matchingUids.push(email.uid)
          console.log(`[runSingleFilter] Match found: UID ${email.uid}, from: ${email.from?.[0]?.address}`)
        }
      }

      console.log(`[runSingleFilter] Found ${matchingUids.length} matching emails`)
      console.log(`[runSingleFilter] Matching UIDs:`, matchingUids)

      if (matchingUids.length === 0) {
        console.log('[runSingleFilter] No matching emails, returning')
        return { success: true, processedCount: 0 }
      }

      // 필터 동작 실행 (벌크 API 사용)
      if (filter.action === 'move' && filter.targetFolder) {
        console.log(`[runSingleFilter] Moving ${matchingUids.length} emails to ${filter.targetFolder}`)
        const moveResult = await window.electron.ipcRenderer.invoke(
          'move-bulk-emails',
          currentAccount,
          'INBOX',
          filter.targetFolder,
          matchingUids
        )

        console.log('[runSingleFilter] move-bulk-emails result:', moveResult)

        if (moveResult.success) {
          console.log(
            `[runSingleFilter] Moved ${moveResult.movedCount} emails to ${filter.targetFolder}`
          )

          // 현재 INBOX를 보고 있다면 로컬 상태 업데이트
          if (currentFolder === 'INBOX') {
            console.log('[runSingleFilter] Updating local state (currently viewing INBOX)')
            setEmails((prev) => prev.filter((e) => !matchingUids.includes(e.uid)))
            setTotalEmails((prev) => Math.max(0, prev - matchingUids.length))
          }

          console.log('[runSingleFilter] === END (success) ===')
          return { success: true, processedCount: moveResult.movedCount }
        } else {
          console.error('[runSingleFilter] Move failed:', moveResult.error)
        }
      } else {
        console.log(`[runSingleFilter] Action is not 'move' or no targetFolder. action=${filter.action}, targetFolder=${filter.targetFolder}`)
      }

      console.log('[runSingleFilter] === END (no action taken) ===')
      return { success: true, processedCount: 0 }
    } catch (error) {
      console.error('[runSingleFilter] Error:', error)
      console.error('[runSingleFilter] Error stack:', error instanceof Error ? error.stack : 'N/A')
      return { success: false, processedCount: 0 }
    }
  }

  // 로딩 화면 (언어 선택 모달 및 PIN 인증 화면 포함)
  if (appState === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-haze-pale/30 to-haze-light/20">
        {/* PIN 인증 화면 */}
        {isPinRequired && !isPinVerified && <PinScreen onVerified={handlePinVerified} />}

        {/* 언어 선택 모달 (첫 실행 시) */}
        <LanguageSelector isOpen={showLanguageSelector} onClose={handleLanguageSelected} />

        {!showLanguageSelector && !isPinRequired && (
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        )}
      </div>
    )
  }

  // 계정 설정 화면
  if (appState === 'setup') {
    return <AccountSetup onComplete={handleAccountSetupComplete} />
  }

  // 계정 추가 모드 (기존 계정이 있는 상태에서 새 계정 추가)
  if (isAddingAccount) {
    return (
      <AccountSetup
        onComplete={handleAccountSetupComplete}
        onCancel={handleCancelAddAccount}
        isAddingAccount={true}
      />
    )
  }

  const folderCounts = getFolderCounts()

  // 주소록에서 메일 쓰기
  const handleComposeToContact = (email: string, name: string) => {
    setComposeData({
      to: name ? `${name} <${email}>` : email,
      cc: '',
      subject: '',
      content: '',
      mode: 'compose'
    })
    setAppView('mail')
    setCurrentView('compose')
  }

  // 계정 정보를 Header용 형식으로 변환
  const accountsForHeader = accounts.map((a) => ({
    email: a.email,
    name: a.name,
    // 현재 계정은 최신 folderInfos 사용, 다른 계정은 accountUnreadCounts 사용
    unreadCount:
      a.email === currentAccount
        ? folderInfos['INBOX']?.unseen || 0
        : accountUnreadCounts[a.email] || 0
  }))

  // 메인 화면
  return (
    <div className="flex h-screen flex-col">
      {/* PIN 인증 화면 */}
      {isPinRequired && !isPinVerified && <PinScreen onVerified={handlePinVerified} />}

      {/* 잠금 화면 */}
      {isLocked && <LockScreen onUnlock={handleUnlock} pinEnabled={isPinEnabledForLock} />}

      {/* 언어 선택 모달 (첫 실행 시) */}
      <LanguageSelector isOpen={showLanguageSelector} onClose={handleLanguageSelected} />

      <Header
        accountEmail={currentAccount}
        accounts={accountsForHeader}
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime}
        onManualSync={handleManualSync}
        currentView={appView}
        onViewChange={(view) => {
          setAppView(view)
          if (view === 'mail') {
            setSettingsView(null)
          }
        }}
        onAccountChange={handleAccountChange}
        onOpenAccountManager={() => setIsAccountManagerOpen(true)}
        onAddAccount={handleAddAccount}
        onOpenSettings={() => setIsGlobalSettingsOpen(true)}
      />

      {/* 계정 관리 모달 */}
      <AccountManagerModal
        isOpen={isAccountManagerOpen}
        accounts={accounts.map((a) => ({
          email: a.email,
          name: a.name,
          isDefault: (a as any).isDefault || false,
          incoming: a.incoming,
          outgoing: a.outgoing
        }))}
        onClose={() => setIsAccountManagerOpen(false)}
        onDeleteAccount={handleDeleteAccount}
        onSetDefaultAccount={handleSetDefaultAccount}
        onAddAccount={handleAddAccount}
      />

      {/* 자동 분류 다이얼로그 */}
      <AutoClassifyDialog
        isOpen={isAutoClassifyDialogOpen}
        accountEmail={currentAccount}
        senderEmail={autoClassifySenderEmail}
        folders={folders}
        onClose={() => setIsAutoClassifyDialogOpen(false)}
        onConfirm={handleAutoClassifyConfirm}
        onCreateFolder={handleCreateMoveFolder}
      />

      {/* 글로벌 설정 다이얼로그 */}
      <GlobalSettings
        isOpen={isGlobalSettingsOpen}
        onClose={() => setIsGlobalSettingsOpen(false)}
      />

      {/* EmailView 상세 검색 다이얼로그 */}
      <Dialog open={viewDetailedSearchOpen} onOpenChange={setViewDetailedSearchOpen} modal={false}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('search.detailed')}</DialogTitle>
            <DialogDescription>
              {t('search.detailedDesc', 'Enter search criteria to filter emails.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* 보낸사람 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('email.from')}</label>
              <input
                type="text"
                value={viewDetailedSearch.sender}
                onChange={(e) =>
                  setViewDetailedSearch({ ...viewDetailedSearch, sender: e.target.value })
                }
                placeholder={t('search.senderPlaceholder')}
                className="w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            {/* 받는사람 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('email.to')}</label>
              <div className="flex gap-2">
                <Select
                  value={viewDetailedSearch.recipientType}
                  onValueChange={(value) =>
                    setViewDetailedSearch({
                      ...viewDetailedSearch,
                      recipientType: value as 'to' | 'to_cc' | 'to_cc_bcc'
                    })
                  }
                >
                  <SelectTrigger className="w-[160px]">
                    <span>
                      {viewDetailedSearch.recipientType === 'to' && t('email.to')}
                      {viewDetailedSearch.recipientType === 'to_cc' &&
                        `${t('email.to')} + ${t('compose.cc')}`}
                      {viewDetailedSearch.recipientType === 'to_cc_bcc' && t('search.periodAll')}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="to">{t('email.to')}</SelectItem>
                    <SelectItem value="to_cc">
                      {t('email.to')} + {t('compose.cc')}
                    </SelectItem>
                    <SelectItem value="to_cc_bcc">{t('search.periodAll')}</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  type="text"
                  value={viewDetailedSearch.recipient}
                  onChange={(e) =>
                    setViewDetailedSearch({ ...viewDetailedSearch, recipient: e.target.value })
                  }
                  placeholder={t('search.recipientPlaceholder')}
                  className="flex-1 h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>

            {/* 내용 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('search.contentPlaceholder')}</label>
              <div className="flex gap-2">
                <Select
                  value={viewDetailedSearch.contentType}
                  onValueChange={(value) =>
                    setViewDetailedSearch({
                      ...viewDetailedSearch,
                      contentType: value as 'all' | 'subject' | 'body'
                    })
                  }
                >
                  <SelectTrigger className="w-[160px]">
                    <span>
                      {viewDetailedSearch.contentType === 'all' && t('search.periodAll')}
                      {viewDetailedSearch.contentType === 'subject' && t('email.subject')}
                      {viewDetailedSearch.contentType === 'body' && t('compose.body')}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('search.periodAll')}</SelectItem>
                    <SelectItem value="subject">{t('email.subject')}</SelectItem>
                    <SelectItem value="body">{t('compose.body')}</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  type="text"
                  value={viewDetailedSearch.content}
                  onChange={(e) =>
                    setViewDetailedSearch({ ...viewDetailedSearch, content: e.target.value })
                  }
                  placeholder={t('search.contentPlaceholder')}
                  className="flex-1 h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>

            {/* 메일함 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('search.mailbox')}</label>
              <Select
                value={viewDetailedSearch.mailbox}
                onValueChange={(value) =>
                  setViewDetailedSearch({ ...viewDetailedSearch, mailbox: value })
                }
              >
                <SelectTrigger className="w-full">
                  <span>
                    {viewDetailedSearch.mailbox === 'all'
                      ? t('search.periodAll')
                      : [...inboxSubFolders, ...customFolders].find(
                          (f) => f.path === viewDetailedSearch.mailbox
                        )?.name || viewDetailedSearch.mailbox}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('search.periodAll')}</SelectItem>
                  {[...inboxSubFolders, ...customFolders].map((folder) => (
                    <SelectItem key={folder.path} value={folder.path}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 기간 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('search.period')}</label>
              <div className="flex gap-2">
                <Select
                  value={viewDetailedSearch.periodType}
                  onValueChange={(value) => {
                    setViewDetailedSearch({
                      ...viewDetailedSearch,
                      periodType: value as DetailedSearchParams['periodType']
                    })
                    if (value !== 'custom') {
                      setViewDetailedSearch((prev) => ({ ...prev, startDate: '', endDate: '' }))
                    }
                  }}
                >
                  <SelectTrigger className="w-[100px]">
                    <span>
                      {viewDetailedSearch.periodType === 'all' && t('search.periodAll')}
                      {viewDetailedSearch.periodType === '1week' && t('search.period1Week')}
                      {viewDetailedSearch.periodType === '1month' && t('search.period1Month')}
                      {viewDetailedSearch.periodType === '3months' && t('search.period3Months')}
                      {viewDetailedSearch.periodType === '6months' && t('search.period6Months')}
                      {viewDetailedSearch.periodType === '1year' && t('search.period1Year')}
                      {viewDetailedSearch.periodType === 'custom' && t('search.periodCustom')}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('search.periodAll')}</SelectItem>
                    <SelectItem value="1week">{t('search.period1Week')}</SelectItem>
                    <SelectItem value="1month">{t('search.period1Month')}</SelectItem>
                    <SelectItem value="3months">{t('search.period3Months')}</SelectItem>
                    <SelectItem value="6months">{t('search.period6Months')}</SelectItem>
                    <SelectItem value="1year">{t('search.period1Year')}</SelectItem>
                    <SelectItem value="custom">{t('search.periodCustom')}</SelectItem>
                  </SelectContent>
                </Select>
                {viewDetailedSearch.periodType === 'custom' && (
                  <div className="flex items-center gap-2 flex-1">
                    <div className="relative flex-1">
                      <input
                        type="date"
                        value={viewDetailedSearch.startDate}
                        onChange={(e) =>
                          setViewDetailedSearch({ ...viewDetailedSearch, startDate: e.target.value })
                        }
                        className="w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                    <span className="text-muted-foreground">~</span>
                    <div className="relative flex-1">
                      <input
                        type="date"
                        value={viewDetailedSearch.endDate}
                        onChange={(e) =>
                          setViewDetailedSearch({ ...viewDetailedSearch, endDate: e.target.value })
                        }
                        className="w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 체크박스 옵션 */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={viewDetailedSearch.hasAttachment}
                  onCheckedChange={(checked) =>
                    setViewDetailedSearch({ ...viewDetailedSearch, hasAttachment: !!checked })
                  }
                />
                <span className="text-sm">{t('search.hasAttachment')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={viewDetailedSearch.includeTrashSpam}
                  onCheckedChange={(checked) =>
                    setViewDetailedSearch({ ...viewDetailedSearch, includeTrashSpam: !!checked })
                  }
                />
                <span className="text-sm">{t('search.includeTrashSpam')}</span>
              </label>
            </div>

            {/* 버튼 */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() =>
                  setViewDetailedSearch({
                    sender: '',
                    recipientType: 'to',
                    recipient: '',
                    contentType: 'all',
                    content: '',
                    mailbox: 'all',
                    periodType: 'all',
                    startDate: '',
                    endDate: '',
                    hasAttachment: false,
                    includeTrashSpam: false
                  })
                }
              >
                {t('common.reset')}
              </Button>
              <Button
                onClick={() => {
                  handleDetailedSearch(viewDetailedSearch)
                  setViewDetailedSearchOpen(false)
                  setCurrentView('list') // 검색 결과를 보기 위해 목록 모드로 전환
                }}
              >
                <Search className="h-4 w-4 mr-1" />
                {t('common.search')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {appView === 'contacts' ? (
        <AddressBook accountEmail={currentAccount} onComposeToContact={handleComposeToContact} />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            onCompose={handleNewCompose}
            onComposeToSelf={handleComposeToSelf}
            onFolderSelect={(folder) => {
              setSettingsView(null)
              handleFolderSelect(folder)
            }}
            folderCounts={folderCounts}
            inboxSubFolders={inboxSubFolders}
            sentSubFolders={sentSubFolders}
            customFolders={customFolders}
            onCreateCustomFolder={handleCreateCustomFolder}
            onRenameCustomFolder={handleRenameCustomFolder}
            onDeleteCustomFolder={handleDeleteCustomFolder}
            onSettingsSelect={(settingsKey) => {
              setSettingsView(settingsKey as SettingsView)
              setCurrentView('list')
            }}
            onDropEmails={handleMoveEmails}
            onUnreadCountClick={handleUnreadCountClick}
            currentFolder={currentFolder}
          />
          {settingsView === 'settings-general' ? (
            <BasicSettings
              accountEmail={currentAccount}
              onSettingsChange={(newSettings) => {
                // emailsPerPage 변경 시 페이지 1로 초기화
                if (newSettings.emailsPerPage !== emailsPerPage) {
                  setCurrentPage(1)
                }
                setEmailsPerPage(newSettings.emailsPerPage)
                setViewMode(newSettings.viewMode || 'list')
                // pollingInterval은 초 단위로 저장되어 있으므로 ms로 변환
                setPollingInterval((newSettings.pollingInterval ?? 30) * 1000)
              }}
            />
          ) : settingsView === 'settings-ai' ? (
            <LLMSettings accountEmail={currentAccount} />
          ) : settingsView === 'settings-filter' ? (
            <FilterSettings
              accountEmail={currentAccount}
              inboxSubFolders={inboxSubFolders}
              customFolders={customFolders}
              onRunFilters={handleRunFilters}
            />
          ) : settingsView === 'settings-signature' ? (
            <SignatureSettings accountEmail={currentAccount} />
          ) : settingsView === 'settings-template' ? (
            <TemplateSettings />
          ) : settingsView === 'settings-spam' ? (
            <SpamSettings accountEmail={currentAccount} />
          ) : settingsView === 'settings-e2e' ? (
            <EncryptionSettings accountEmail={currentAccount} />
          ) : currentView === 'compose' ? (
            <ComposeEmail
              accountEmail={currentAccount}
              onClose={() => {
                setComposeData(null)
                setCurrentView('list')
              }}
              onSent={() => {
                setComposeData(null)
                loadEmails()
              }}
              onNavigateToAddressBook={() => {
                setComposeData(null)
                setCurrentView('list')
                setAppView('contacts')
              }}
              initialTo={composeData?.to}
              initialCc={composeData?.cc}
              initialSubject={composeData?.subject}
              initialContent={composeData?.content}
              mode={composeData?.mode}
            />
          ) : viewMode === 'list' && currentView === 'view' && selectedEmail ? (
            // 목록만 보기 모드: 이메일 전체 화면 보기
            <EmailView
              currentAccount={currentAccount}
              isLoadingContent={isLoadingContent}
              email={{
                id: String(selectedEmail.uid),
                uid: selectedEmail.uid,
                sender: selectedEmail.from[0]?.name || selectedEmail.from[0]?.address || 'Unknown',
                senderEmail: selectedEmail.from[0]?.address || '',
                recipient: selectedEmail.to[0]?.name || selectedEmail.to[0]?.address || '',
                subject: selectedEmail.subject,
                date: new Date(selectedEmail.date).toLocaleString('ko-KR'),
                content: selectedEmail.text || '',
                html: selectedEmail.html,
                isStarred: selectedEmail.flags.includes('\\Flagged'),
                hasExternalLink: true,
                attachments: selectedEmail.attachments
              }}
              folderName={currentFolder}
              currentIndex={selectedEmailIndex + 1}
              totalCount={emails.length}
              unreadCount={folderCounts[currentFolder]?.unseen || 0}
              moveFolders={[...inboxSubFolders, ...customFolders]}
              isSenderVip={isSenderVip}
              onBack={() => setCurrentView('list')}
              onPrev={handleViewPrev}
              onNext={handleViewNext}
              onReply={handleReply}
              onReplyAll={handleReplyAll}
              onForward={handleForward}
              onDelete={handleViewDelete}
              onMarkSpam={handleViewMarkSpam}
              onMarkUnread={handleViewMarkUnread}
              onSaveAsEml={handleViewSaveAsEml}
              onMove={handleViewMove}
              onMoveAndCreateRule={handleViewMoveAndCreateRule}
              onCreateMoveFolder={handleCreateMoveFolder}
              onToggleStar={handleViewToggleStar}
              onToggleSenderVip={handleToggleSenderVip}
              onComposeToSender={handleComposeToSender}
              onAddSenderToContacts={handleAddSenderToContacts}
              onBlockSender={handleBlockSender}
              onViewConversation={handleViewConversation}
              onSearchBySender={handleSearchBySender}
              onSearchByRecipient={handleSearchByRecipient}
              onAutoClassifySender={handleAutoClassifySender}
              onDeleteAllFromSender={handleDeleteAllFromSender}
              onHighlightSender={handleHighlightSender}
              onDetailedSearch={() => setViewDetailedSearchOpen(true)}
              onSearch={(query) => {
                setSearchQuery(query)
                setIsSearching(true)
              }}
            />
          ) : viewMode === 'split' ? (
            // 좌우 분할 보기 모드
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* 공유 헤더 - 전체 너비 */}
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold">
                    {detailedSearchParams
                      ? t('search.detailedResults')
                      : getFolderName(currentFolder)}
                  </h1>
                  <span className="text-muted-foreground">/ {totalEmails}</span>
                  <button
                    className="p-1.5 rounded-md hover:bg-muted disabled:opacity-50"
                    onClick={() => loadEmails()}
                    disabled={isLoadingEmails}
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingEmails ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={t('common.searchPlaceholder')}
                      value={splitGlobalFilter}
                      onChange={(e) => setSplitGlobalFilter(e.target.value)}
                      className={`w-[200px] h-9 px-3 pr-16 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${splitGlobalFilter ? 'border-primary' : ''}`}
                    />
                    {splitGlobalFilter ? (
                      <button
                        type="button"
                        className="absolute right-8 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                        onClick={() => setSplitGlobalFilter('')}
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ) : null}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Search className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1"
                    onClick={() => setSplitDetailedSearchOpen(true)}
                  >
                    {t('search.detailed')}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* 분할 컨텐츠 영역 */}
              <div
                ref={splitContainerRef}
                className={`flex flex-1 overflow-hidden ${isResizing ? 'select-none' : ''}`}
                style={{ cursor: isResizing ? 'col-resize' : undefined }}
              >
                {/* 왼쪽: 이메일 목록 */}
                <div
                  className="overflow-hidden flex flex-col flex-shrink-0 border-r"
                  style={{ width: splitPanelWidth }}
                >
                  <EmailList
                    compactMode={true}
                    accountEmail={currentAccount}
                    folderName={
                      detailedSearchParams
                        ? t('search.detailedResults')
                        : showUnreadOnly
                          ? `${getFolderName(currentFolder)} (${t('sidebar.unreadOnly')})`
                          : getFolderName(currentFolder)
                    }
                    folderType={getFolderType(currentFolder)}
                    emails={filteredEmails}
                    totalCount={totalEmails}
                    isLoading={isLoadingEmails}
                    isSwitchingAccount={isSwitchingAccount}
                    currentPage={currentPage}
                    emailsPerPage={emailsPerPage}
                    onPageChange={setCurrentPage}
                    onEmailSelect={handleEmailSelect}
                    onRefresh={() => loadEmails()}
                    onDetailedSearch={handleDetailedSearch}
                    detailedSearchOpen={splitDetailedSearchOpen}
                    onDetailedSearchOpenChange={setSplitDetailedSearchOpen}
                    externalFilter={splitGlobalFilter}
                    onExternalFilterChange={setSplitGlobalFilter}
                    onDelete={(uids) => handleDeleteEmails(uids, false)}
                    onPermanentDelete={(uids) => handleDeleteEmails(uids, true)}
                    onMarkRead={async (uids, read) => {
                      // 실제로 상태가 변경될 메일 목록
                      const affectedEmails = emails.filter((e) => {
                        if (!uids.includes(e.uid)) return false
                        const isCurrentlyRead = e.flags.includes('\\Seen')
                        return read ? !isCurrentlyRead : isCurrentlyRead
                      })
                      const affectedCount = affectedEmails.length

                      for (const uid of uids) {
                        // 가상 폴더(ALL_MAIL 등)에서는 각 이메일의 실제 폴더 사용
                        const email = emails.find((e) => e.uid === uid)
                        const actualFolder = email?.folder || currentFolder
                        await window.electron.ipcRenderer.invoke(
                          'set-email-flags',
                          currentAccount,
                          actualFolder,
                          uid,
                          ['\\Seen'],
                          read
                        )
                      }

                      // 로컬 상태에서 플래그 업데이트
                      setEmails((prev) =>
                        prev.map((e) => {
                          if (!uids.includes(e.uid)) return e
                          const newFlags = read
                            ? [...new Set([...e.flags, '\\Seen'])]
                            : e.flags.filter((f) => f !== '\\Seen')
                          return { ...e, flags: newFlags }
                        })
                      )

                      // 폴더 안읽은 메일 수 업데이트
                      if (affectedCount > 0) {
                        setFolderInfos((prev) => {
                          const current = prev[currentFolder]
                          if (current) {
                            const newUnseen = read
                              ? Math.max(0, current.unseen - affectedCount)
                              : current.unseen + affectedCount
                            return {
                              ...prev,
                              [currentFolder]: { ...current, unseen: newUnseen }
                            }
                          }
                          return prev
                        })
                      }
                    }}
                    onToggleStar={async (uid, starred) => {
                      // 가상 폴더(ALL_MAIL 등)에서는 이메일의 실제 폴더 사용
                      const email = emails.find((e) => e.uid === uid)
                      const actualFolder = email?.folder || currentFolder
                      await window.electron.ipcRenderer.invoke(
                        'set-email-flags',
                        currentAccount,
                        actualFolder,
                        uid,
                        ['\\Flagged'],
                        starred
                      )
                      // 로컬 상태에서 플래그 업데이트
                      setEmails((prev) =>
                        prev.map((e) => {
                          if (e.uid !== uid) return e
                          const newFlags = starred
                            ? [...new Set([...e.flags, '\\Flagged'])]
                            : e.flags.filter((f) => f !== '\\Flagged')
                          return { ...e, flags: newFlags }
                        })
                      )
                    }}
                    onReply={handleListReply}
                    onForward={handleListForward}
                    moveFolders={[...inboxSubFolders, ...customFolders]}
                    onMove={handleMoveEmails}
                    onMoveAndCreateRule={handleMoveAndCreateRule}
                    onCreateMoveFolder={handleCreateMoveFolder}
                    onMarkSpam={handleMarkSpam}
                    onUnmarkSpam={handleUnmarkSpam}
                    onRestore={handleRestore}
                    onEmptyFolder={handleEmptyFolder}
                    checkSenderVip={checkSenderVip}
                    onToggleSenderVip={handleToggleSenderVip}
                    onComposeToSender={handleComposeToSender}
                    onAddSenderToContacts={handleAddSenderToContacts}
                    onBlockSender={handleBlockSender}
                    onViewConversation={handleViewConversation}
                    onSearchBySender={handleSearchBySender}
                    onSearchByRecipient={handleSearchByRecipient}
                    onAutoClassifySender={handleAutoClassifySender}
                    onDeleteAllFromSender={handleDeleteAllFromSender}
                    onHighlightSender={handleHighlightSender}
                    onGetEmailContent={handleGetEmailContent}
                  />
                </div>
                {/* 리사이즈 핸들 */}
                <div
                  className="w-1 bg-border hover:bg-primary/50 cursor-col-resize flex-shrink-0 transition-colors"
                  onMouseDown={handleResizeStart}
                  title="드래그하여 크기 조절"
                />
                {/* 오른쪽: 이메일 내용 */}
                <div className="flex-1 overflow-hidden">
                  {selectedEmail ? (
                    <EmailView
                      compactMode={true}
                      currentAccount={currentAccount}
                      isLoadingContent={isLoadingContent}
                      email={{
                        id: String(selectedEmail.uid),
                        uid: selectedEmail.uid,
                        sender:
                          selectedEmail.from[0]?.name ||
                          selectedEmail.from[0]?.address ||
                          'Unknown',
                        senderEmail: selectedEmail.from[0]?.address || '',
                        recipient: selectedEmail.to[0]?.name || selectedEmail.to[0]?.address || '',
                        subject: selectedEmail.subject,
                        date: new Date(selectedEmail.date).toLocaleString('ko-KR'),
                        content: selectedEmail.text || '',
                        html: selectedEmail.html,
                        isStarred: selectedEmail.flags.includes('\\Flagged'),
                        hasExternalLink: true,
                        attachments: selectedEmail.attachments
                      }}
                      folderName={currentFolder}
                      currentIndex={selectedEmailIndex + 1}
                      totalCount={emails.length}
                      unreadCount={folderCounts[currentFolder]?.unseen || 0}
                      moveFolders={[...inboxSubFolders, ...customFolders]}
                      isSenderVip={isSenderVip}
                      onBack={() => setSelectedEmail(null)}
                      onPrev={handleViewPrev}
                      onNext={handleViewNext}
                      onReply={handleReply}
                      onReplyAll={handleReplyAll}
                      onForward={handleForward}
                      onDelete={handleViewDelete}
                      onMarkSpam={handleViewMarkSpam}
                      onMarkUnread={handleViewMarkUnread}
                      onSaveAsEml={handleViewSaveAsEml}
                      onMove={handleViewMove}
                      onMoveAndCreateRule={handleViewMoveAndCreateRule}
                      onCreateMoveFolder={handleCreateMoveFolder}
                      onToggleStar={handleViewToggleStar}
                      onToggleSenderVip={handleToggleSenderVip}
                      onComposeToSender={handleComposeToSender}
                      onAddSenderToContacts={handleAddSenderToContacts}
                      onBlockSender={handleBlockSender}
                      onViewConversation={handleViewConversation}
                      onSearchBySender={handleSearchBySender}
                      onSearchByRecipient={handleSearchByRecipient}
                      onAutoClassifySender={handleAutoClassifySender}
                      onDeleteAllFromSender={handleDeleteAllFromSender}
                      onHighlightSender={handleHighlightSender}
                      onDetailedSearch={() => setSplitDetailedSearchOpen(true)}
                      onSearch={(query) => {
                        setSplitGlobalFilter(query)
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <p>{t('email.selectEmail')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            // 목록만 보기 모드: 기본 이메일 목록
            <EmailList
              accountEmail={currentAccount}
              folderName={
                detailedSearchParams
                  ? t('search.detailedResults')
                  : showUnreadOnly
                    ? `${getFolderName(currentFolder)} (${t('sidebar.unreadOnly')})`
                    : getFolderName(currentFolder)
              }
              folderType={getFolderType(currentFolder)}
              emails={filteredEmails}
              totalCount={totalEmails}
              isLoading={isLoadingEmails}
              isSwitchingAccount={isSwitchingAccount}
              currentPage={currentPage}
              emailsPerPage={emailsPerPage}
              onPageChange={setCurrentPage}
              onEmailSelect={handleEmailSelect}
              onRefresh={() => loadEmails()}
              onDetailedSearch={handleDetailedSearch}
              onDelete={(uids) => handleDeleteEmails(uids, false)}
              onPermanentDelete={(uids) => handleDeleteEmails(uids, true)}
              onMarkRead={async (uids, read) => {
                // 실제로 상태가 변경될 메일 목록
                const affectedEmails = emails.filter((e) => {
                  if (!uids.includes(e.uid)) return false
                  const isCurrentlyRead = e.flags.includes('\\Seen')
                  return read ? !isCurrentlyRead : isCurrentlyRead
                })
                const affectedCount = affectedEmails.length

                for (const uid of uids) {
                  // 가상 폴더(ALL_MAIL 등)에서는 각 이메일의 실제 폴더 사용
                  const email = emails.find((e) => e.uid === uid)
                  const actualFolder = email?.folder || currentFolder
                  await window.electron.ipcRenderer.invoke(
                    'set-email-flags',
                    currentAccount,
                    actualFolder,
                    uid,
                    ['\\Seen'],
                    read
                  )
                }

                // 로컬 상태에서 플래그 업데이트
                setEmails((prev) =>
                  prev.map((e) => {
                    if (!uids.includes(e.uid)) return e
                    const newFlags = read
                      ? [...new Set([...e.flags, '\\Seen'])]
                      : e.flags.filter((f) => f !== '\\Seen')
                    return { ...e, flags: newFlags }
                  })
                )

                // 폴더 안읽은 메일 수 업데이트
                if (affectedCount > 0) {
                  setFolderInfos((prev) => {
                    const current = prev[currentFolder]
                    if (current) {
                      const newUnseen = read
                        ? Math.max(0, current.unseen - affectedCount)
                        : current.unseen + affectedCount
                      return {
                        ...prev,
                        [currentFolder]: { ...current, unseen: newUnseen }
                      }
                    }
                    return prev
                  })
                }
              }}
              onToggleStar={async (uid, starred) => {
                // 가상 폴더(ALL_MAIL 등)에서는 이메일의 실제 폴더 사용
                const email = emails.find((e) => e.uid === uid)
                const actualFolder = email?.folder || currentFolder
                await window.electron.ipcRenderer.invoke(
                  'set-email-flags',
                  currentAccount,
                  actualFolder,
                  uid,
                  ['\\Flagged'],
                  starred
                )
                setEmails((prev) =>
                  prev.map((e) =>
                    e.uid === uid
                      ? {
                          ...e,
                          flags: starred
                            ? [...e.flags, '\\Flagged'].filter((f, i, arr) => arr.indexOf(f) === i)
                            : e.flags.filter((f) => f !== '\\Flagged')
                        }
                      : e
                  )
                )
              }}
              onReply={handleListReply}
              onForward={handleListForward}
              availableFolders={folders
                .filter((f) => !f.path.startsWith('INBOX/'))
                .map((f) => ({ name: f.name, path: f.path }))}
              moveFolders={[...inboxSubFolders, ...customFolders]}
              onMove={handleMoveEmails}
              onMoveAndCreateRule={handleMoveAndCreateRule}
              onCreateMoveFolder={handleCreateMoveFolder}
              onMarkSpam={handleMarkSpam}
              onUnmarkSpam={handleUnmarkSpam}
              onRestore={handleRestore}
              onEmptyFolder={handleEmptyFolder}
              checkSenderVip={checkSenderVip}
              onToggleSenderVip={handleToggleSenderVip}
              onComposeToSender={handleComposeToSender}
              onAddSenderToContacts={handleAddSenderToContacts}
              onBlockSender={handleBlockSender}
              onViewConversation={handleViewConversation}
              onSearchBySender={handleSearchBySender}
              onSearchByRecipient={handleSearchByRecipient}
              onAutoClassifySender={handleAutoClassifySender}
              onDeleteAllFromSender={handleDeleteAllFromSender}
              onHighlightSender={handleHighlightSender}
              onGetEmailContent={handleGetEmailContent}
            />
          )}
        </div>
      )}

      {/* Local-First 동기화 상태바 */}
      <SyncStatusBar />
    </div>
  )
}

export default App
