import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Mail,
  Server,
  Lock,
  User,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  HelpCircle,
  Settings
} from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@renderer/lib/utils'

type Protocol = 'imap'
type Step = 'welcome' | 'provider' | 'basic' | 'server' | 'testing' | 'complete'

interface AccountConfig {
  email: string
  password: string
  name: string
  protocol: Protocol
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

const defaultPorts = {
  imap: { secure: 993, insecure: 143 },
  smtp: { secure: 465, insecure: 587 }
}

// 이메일 제공자 설정
interface EmailProvider {
  id: string
  name: string
  icon: string // 이모지 or 텍스트 아이콘
  color: string // tailwind 색상 클래스
  domains: string[]
  config: {
    protocol: Protocol
    incoming: { host: string; port: number; secure: boolean }
    outgoing: { host: string; port: number; secure: boolean }
  }
  requiresAppPassword: boolean
  appPasswordUrl?: string
  appPasswordGuide?: string[]
  notes?: string
}

// 정적 제공자 설정 (번역이 필요 없는 부분)
interface ProviderConfig {
  id: string
  icon: string
  color: string
  domains: string[]
  config: {
    protocol: Protocol
    incoming: { host: string; port: number; secure: boolean }
    outgoing: { host: string; port: number; secure: boolean }
  }
  requiresAppPassword: boolean
  appPasswordUrl?: string
}

const providerConfigs: ProviderConfig[] = [
  {
    id: 'gmail',
    icon: 'G',
    color: 'bg-red-500',
    domains: ['gmail.com', 'googlemail.com'],
    config: {
      protocol: 'imap',
      incoming: { host: 'imap.gmail.com', port: 993, secure: true },
      outgoing: { host: 'smtp.gmail.com', port: 465, secure: true }
    },
    requiresAppPassword: true,
    appPasswordUrl: 'https://myaccount.google.com/apppasswords'
  },
  {
    id: 'naver',
    icon: 'N',
    color: 'bg-green-500',
    domains: ['naver.com'],
    config: {
      protocol: 'imap',
      incoming: { host: 'imap.naver.com', port: 993, secure: true },
      outgoing: { host: 'smtp.naver.com', port: 465, secure: true }
    },
    requiresAppPassword: false
  },
  {
    id: 'kakao',
    icon: 'K',
    color: 'bg-yellow-400',
    domains: ['kakao.com'],
    config: {
      protocol: 'imap',
      incoming: { host: 'imap.kakao.com', port: 993, secure: true },
      outgoing: { host: 'smtp.kakao.com', port: 465, secure: true }
    },
    requiresAppPassword: true,
    appPasswordUrl: 'https://mail.kakao.com'
  },
  {
    id: 'daum',
    icon: 'D',
    color: 'bg-blue-500',
    domains: ['daum.net', 'hanmail.net'],
    config: {
      protocol: 'imap',
      incoming: { host: 'imap.daum.net', port: 993, secure: true },
      outgoing: { host: 'smtp.daum.net', port: 465, secure: true }
    },
    requiresAppPassword: true,
    appPasswordUrl: 'https://mail.daum.net'
  },
  {
    id: 'outlook',
    icon: 'O',
    color: 'bg-blue-600',
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    config: {
      protocol: 'imap',
      incoming: { host: 'outlook.office365.com', port: 993, secure: true },
      outgoing: { host: 'smtp.office365.com', port: 587, secure: false }
    },
    requiresAppPassword: true,
    appPasswordUrl: 'https://account.live.com/proofs/AppPassword'
  },
  {
    id: 'yahoo',
    icon: 'Y',
    color: 'bg-purple-600',
    domains: ['yahoo.com', 'yahoo.co.kr'],
    config: {
      protocol: 'imap',
      incoming: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
      outgoing: { host: 'smtp.mail.yahoo.com', port: 465, secure: true }
    },
    requiresAppPassword: true,
    appPasswordUrl: 'https://login.yahoo.com/account/security'
  },
  {
    id: 'icloud',
    icon: '',
    color: 'bg-gray-500',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    config: {
      protocol: 'imap',
      incoming: { host: 'imap.mail.me.com', port: 993, secure: true },
      outgoing: { host: 'smtp.mail.me.com', port: 587, secure: false }
    },
    requiresAppPassword: true,
    appPasswordUrl: 'https://appleid.apple.com/account/manage'
  }
]

// 번역된 제공자 정보를 반환하는 함수
function getEmailProviders(
  t: (key: string, options?: { returnObjects?: boolean }) => string | string[]
): EmailProvider[] {
  return providerConfigs.map((config) => ({
    ...config,
    name: t(`account.setup.providers.${config.id}.name`) as string,
    appPasswordGuide: t(`account.setup.providers.${config.id}.guide`, {
      returnObjects: true
    }) as string[],
    notes: t(`account.setup.providers.${config.id}.notes`) as string
  }))
}

// 도메인 기반 서버 설정 (하위 호환성 유지)
const commonProviders: Record<string, Partial<AccountConfig>> = {}
providerConfigs.forEach((provider) => {
  provider.domains.forEach((domain) => {
    commonProviders[domain] = {
      protocol: provider.config.protocol,
      incoming: provider.config.incoming,
      outgoing: provider.config.outgoing
    }
  })
})

interface AccountSetupProps {
  onComplete: (account: AccountConfig) => void
  onCancel?: () => void
  isAddingAccount?: boolean
}

export function AccountSetup({ onComplete, onCancel, isAddingAccount = false }: AccountSetupProps) {
  const { t } = useTranslation()

  // 번역된 이메일 제공자 목록
  const emailProviders = React.useMemo(() => getEmailProviders(t), [t])

  // 도메인으로 제공자 찾기
  const getProviderByDomain = React.useCallback(
    (domain: string): EmailProvider | null => {
      return emailProviders.find((p) => p.domains.includes(domain.toLowerCase())) || null
    },
    [emailProviders]
  )

  const [step, setStep] = React.useState<Step>('welcome')
  const [showPassword, setShowPassword] = React.useState(false)
  const [selectedProvider, setSelectedProvider] = React.useState<EmailProvider | null>(null)
  const [showGuide, setShowGuide] = React.useState(false)
  const [testStatus, setTestStatus] = React.useState<{
    incoming: 'pending' | 'testing' | 'success' | 'error'
    outgoing: 'pending' | 'testing' | 'success' | 'error'
    message?: string
  }>({ incoming: 'pending', outgoing: 'pending' })

  const [config, setConfig] = React.useState<AccountConfig>({
    email: '',
    password: '',
    name: '',
    protocol: 'imap',
    incoming: { host: '', port: 993, secure: true },
    outgoing: { host: '', port: 465, secure: true }
  })

  const updateConfig = (updates: Partial<AccountConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }))
  }

  const updateIncoming = (updates: Partial<AccountConfig['incoming']>) => {
    setConfig((prev) => ({
      ...prev,
      incoming: { ...prev.incoming, ...updates }
    }))
  }

  const updateOutgoing = (updates: Partial<AccountConfig['outgoing']>) => {
    setConfig((prev) => ({
      ...prev,
      outgoing: { ...prev.outgoing, ...updates }
    }))
  }

  // 제공자 선택 시 설정 적용
  const selectProvider = (provider: EmailProvider | null) => {
    setSelectedProvider(provider)
    if (provider) {
      setConfig((prev) => ({
        ...prev,
        protocol: provider.config.protocol,
        incoming: provider.config.incoming,
        outgoing: provider.config.outgoing
      }))
    }
  }

  // 이메일 도메인 기반으로 서버 설정 자동 완성
  const autoCompleteServerSettings = (email: string) => {
    const domain = email.split('@')[1]?.toLowerCase()
    if (domain) {
      const provider = getProviderByDomain(domain)
      if (provider) {
        selectProvider(provider)
      } else if (commonProviders[domain]) {
        const providerConfig = commonProviders[domain]
        setConfig((prev) => ({
          ...prev,
          protocol: providerConfig.protocol || prev.protocol,
          incoming: providerConfig.incoming || prev.incoming,
          outgoing: providerConfig.outgoing || prev.outgoing
        }))
      }
    }
  }

  const handleEmailChange = (email: string) => {
    updateConfig({ email })
    if (email.includes('@')) {
      autoCompleteServerSettings(email)
    }
  }

  // 외부 URL 열기
  const openExternalUrl = (url: string) => {
    window.electron.ipcRenderer.invoke('open-external', url)
  }

  const handleIncomingSecureChange = (secure: boolean) => {
    const port = defaultPorts.imap
    updateIncoming({ secure, port: secure ? port.secure : port.insecure })
  }

  const handleOutgoingSecureChange = (secure: boolean) => {
    updateOutgoing({
      secure,
      port: secure ? defaultPorts.smtp.secure : defaultPorts.smtp.insecure
    })
  }

  const testConnection = async () => {
    setStep('testing')
    setTestStatus({ incoming: 'testing', outgoing: 'pending' })

    try {
      // Incoming server test (IMAP)
      const incomingResult = await window.electron.ipcRenderer.invoke('test-mail-connection', {
        type: config.protocol,
        host: config.incoming.host,
        port: config.incoming.port,
        secure: config.incoming.secure,
        user: config.email,
        password: config.password
      })

      if (incomingResult.success) {
        setTestStatus((prev) => ({ ...prev, incoming: 'success', outgoing: 'testing' }))

        // Outgoing server test (SMTP)
        const outgoingResult = await window.electron.ipcRenderer.invoke('test-mail-connection', {
          type: 'smtp',
          host: config.outgoing.host,
          port: config.outgoing.port,
          secure: config.outgoing.secure,
          user: config.email,
          password: config.password
        })

        if (outgoingResult.success) {
          setTestStatus((prev) => ({ ...prev, outgoing: 'success' }))
          // Save account
          await window.electron.ipcRenderer.invoke('save-account', config)
          setTimeout(() => setStep('complete'), 1000)
        } else {
          setTestStatus((prev) => ({
            ...prev,
            outgoing: 'error',
            message: outgoingResult.error || t('account.setup.outgoingServerFailed')
          }))
        }
      } else {
        setTestStatus({
          incoming: 'error',
          outgoing: 'pending',
          message: incomingResult.error || t('account.setup.incomingServerFailed')
        })
      }
    } catch (error) {
      setTestStatus({
        incoming: 'error',
        outgoing: 'pending',
        message: error instanceof Error ? error.message : t('account.setup.connectionTestFailed')
      })
    }
  }

  const canProceedToServer = config.email && config.name && config.password
  const canTestConnection =
    config.incoming.host && config.incoming.port && config.outgoing.host && config.outgoing.port

  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-haze-pale/30 to-haze-light/20">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-primary px-8 py-6 text-white">
          <div className="flex items-center gap-3">
            <Mail className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">MailVista</h1>
              <p className="text-sm text-primary-foreground/80">{t('account.setup.title')}</p>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="px-8 py-4 border-b">
          <div className="flex items-center gap-2">
            {['welcome', 'provider', 'basic', 'server', 'testing', 'complete'].map((s, i) => (
              <React.Fragment key={s}>
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium',
                    step === s
                      ? 'bg-primary text-white'
                      : ['welcome', 'provider', 'basic', 'server', 'testing', 'complete'].indexOf(
                            step
                          ) > i
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {i + 1}
                </div>
                {i < 5 && (
                  <div
                    className={cn(
                      'flex-1 h-1 rounded',
                      ['welcome', 'provider', 'basic', 'server', 'testing', 'complete'].indexOf(
                        step
                      ) > i
                        ? 'bg-primary/40'
                        : 'bg-muted'
                    )}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {step === 'welcome' && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Mail className="h-10 w-10 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-2">
                  {isAddingAccount
                    ? t('account.setup.welcomeAddAccount')
                    : t('account.setup.welcome')}
                </h2>
                <p className="text-muted-foreground">
                  {isAddingAccount
                    ? t('account.setup.welcomeAddDesc')
                    : t('account.setup.welcomeDesc')}
                  <br />
                  {t('account.setup.supportedProviders')}
                </p>
              </div>
              <div className="flex gap-3">
                {isAddingAccount && onCancel && (
                  <Button variant="outline" className="flex-1" size="lg" onClick={onCancel}>
                    {t('account.setup.cancel')}
                  </Button>
                )}
                <Button className="flex-1" size="lg" onClick={() => setStep('provider')}>
                  {isAddingAccount
                    ? t('account.setup.startAddAccount')
                    : t('account.setup.startSetup')}
                </Button>
              </div>
            </div>
          )}

          {step === 'provider' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">{t('account.setup.selectProvider')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('account.setup.selectProviderDesc')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {emailProviders.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => {
                      selectProvider(provider)
                      setStep('basic')
                    }}
                    className={cn(
                      'flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left hover:border-primary hover:bg-primary/5',
                      selectedProvider?.id === provider.id
                        ? 'border-primary bg-primary/5'
                        : 'border-muted'
                    )}
                  >
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg',
                        provider.color
                      )}
                    >
                      {provider.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{provider.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {provider.domains[0]}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>

              {/* Other mail option */}
              <button
                onClick={() => {
                  setSelectedProvider(null)
                  setStep('basic')
                }}
                className="w-full flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-muted hover:border-primary hover:bg-primary/5 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Settings className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium">{t('account.setup.otherProvider')}</div>
                  <div className="text-xs text-muted-foreground">
                    {t('account.setup.otherProviderDesc')}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep('welcome')}>
                  {t('account.setup.prev')}
                </Button>
              </div>
            </div>
          )}

          {step === 'basic' && (
            <div className="space-y-6">
              {/* Provider info header */}
              {selectedProvider && (
                <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold',
                      selectedProvider.color
                    )}
                  >
                    {selectedProvider.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{selectedProvider.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('account.setup.serverConfigured')}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setStep('provider')}
                  >
                    {t('account.setup.change')}
                  </Button>
                </div>
              )}

              <div>
                <h2 className="text-xl font-semibold mb-1">{t('account.setup.accountInfo')}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedProvider
                    ? t('account.setup.enterAccountInfo', { provider: selectedProvider.name })
                    : t('account.setup.enterAccountInfoGeneric')}
                </p>
              </div>

              <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      {t('account.setup.displayName')}
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder={t('account.setup.displayNamePlaceholder')}
                        value={config.name}
                        onChange={(e) => updateConfig({ name: e.target.value })}
                        className="w-full h-11 pl-10 pr-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      {t('account.setup.emailAddress')}
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="email"
                        placeholder={
                          selectedProvider
                            ? `example@${selectedProvider.domains[0]}`
                            : 'example@email.com'
                        }
                        value={config.email}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        className="w-full h-11 pl-10 pr-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium">
                        {selectedProvider?.requiresAppPassword
                          ? t('account.setup.appPassword')
                          : t('account.password')}
                      </label>
                      {selectedProvider?.appPasswordGuide && (
                        <button
                          type="button"
                          onClick={() => setShowGuide(!showGuide)}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <HelpCircle className="h-3 w-3" />
                          {showGuide
                            ? t('account.setup.closeGuide')
                            : t('account.setup.appPasswordGuide')}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder={
                          selectedProvider?.requiresAppPassword
                            ? t('account.setup.appPasswordPlaceholder')
                            : t('account.setup.passwordPlaceholder')
                        }
                        value={config.password}
                        onChange={(e) => updateConfig({ password: e.target.value })}
                        className="w-full h-11 pl-10 pr-12 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {/* App password guide */}
                    {showGuide && selectedProvider?.appPasswordGuide && (
                      <div className="mt-3 p-3 bg-secondary border border-haze-light/50 rounded-lg">
                        <div className="flex items-start gap-2 mb-2">
                          <AlertCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          <div className="text-sm font-medium text-secondary-foreground">
                            {selectedProvider.requiresAppPassword
                              ? t('account.setup.appPasswordMethod')
                              : t('account.setup.setupMethod')}
                          </div>
                        </div>
                        <ul className="space-y-1 text-xs text-muted-foreground ml-6">
                          {selectedProvider.appPasswordGuide.map((step, idx) => (
                            <li key={idx}>
                              {t(`account.provider.${selectedProvider.id}.guide${idx + 1}`, step)}
                            </li>
                          ))}
                        </ul>
                        {selectedProvider.appPasswordUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 w-full text-xs bg-white"
                            onClick={() => openExternalUrl(selectedProvider.appPasswordUrl!)}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            {t('account.setup.openSettingsPage', {
                              provider: selectedProvider.name
                            })}
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Simple note */}
                    {!showGuide && selectedProvider?.notes && (
                      <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {t(`account.provider.${selectedProvider.id}.notes`, selectedProvider.notes)}
                      </p>
                    )}
                    {!showGuide && !selectedProvider && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {t('account.setup.appPasswordNote')}
                      </p>
                    )}
                  </div>
                </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep('provider')}>
                  {t('account.setup.prev')}
                </Button>
                <Button
                  className="flex-1"
                  disabled={!canProceedToServer}
                  onClick={() => setStep('server')}
                >
                  {t('account.setup.next')}
                </Button>
              </div>
            </div>
          )}

          {step === 'server' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">{t('account.setup.serverSettings')}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedProvider
                    ? t('account.setup.serverSettingsAutoDesc', { provider: selectedProvider.name })
                    : t('account.setup.serverSettingsManualDesc')}
                </p>
              </div>

              {/* Auto-config notice */}
              {selectedProvider && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm text-green-700">
                    {t('account.setup.serverAutoApplied', { provider: selectedProvider.name })}
                  </span>
                </div>
              )}

              {/* Incoming server */}
              <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Server className="h-4 w-4" />
                  {t('account.setup.incomingServer')}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <input
                      type="text"
                      placeholder="imap.example.com"
                      value={config.incoming.host}
                      onChange={(e) => updateIncoming({ host: e.target.value })}
                      className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      placeholder="993"
                      value={config.incoming.port}
                      onChange={(e) => updateIncoming({ port: parseInt(e.target.value) || 0 })}
                      className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={config.incoming.secure}
                    onChange={(e) => handleIncomingSecureChange(e.target.checked)}
                    className="rounded"
                  />
                  {t('account.setup.useSSL')}
                </label>
              </div>

              {/* Outgoing server */}
              <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Server className="h-4 w-4" />
                  {t('account.setup.outgoingServer')}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <input
                      type="text"
                      placeholder="smtp.example.com"
                      value={config.outgoing.host}
                      onChange={(e) => updateOutgoing({ host: e.target.value })}
                      className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      placeholder="465"
                      value={config.outgoing.port}
                      onChange={(e) => updateOutgoing({ port: parseInt(e.target.value) || 0 })}
                      className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={config.outgoing.secure}
                    onChange={(e) => handleOutgoingSecureChange(e.target.checked)}
                    className="rounded"
                  />
                  {t('account.setup.useSSL')}
                </label>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep('basic')}>
                  {t('account.setup.prev')}
                </Button>
                <Button className="flex-1" disabled={!canTestConnection} onClick={testConnection}>
                  {t('account.setup.connectionTest')}
                </Button>
              </div>
            </div>
          )}

          {step === 'testing' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">{t('account.setup.connectionTest')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('account.setup.testingConnection')}
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
                  {testStatus.incoming === 'testing' && (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  )}
                  {testStatus.incoming === 'success' && (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  )}
                  {testStatus.incoming === 'error' && <XCircle className="h-5 w-5 text-red-500" />}
                  {testStatus.incoming === 'pending' && (
                    <div className="h-5 w-5 rounded-full border-2" />
                  )}
                  <div>
                    <div className="font-medium">{t('account.setup.incomingServer')}</div>
                    <div className="text-sm text-muted-foreground">
                      {config.incoming.host}:{config.incoming.port}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
                  {testStatus.outgoing === 'testing' && (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  )}
                  {testStatus.outgoing === 'success' && (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  )}
                  {testStatus.outgoing === 'error' && <XCircle className="h-5 w-5 text-red-500" />}
                  {testStatus.outgoing === 'pending' && (
                    <div className="h-5 w-5 rounded-full border-2" />
                  )}
                  <div>
                    <div className="font-medium">{t('account.setup.outgoingServer')}</div>
                    <div className="text-sm text-muted-foreground">
                      {config.outgoing.host}:{config.outgoing.port}
                    </div>
                  </div>
                </div>

                {testStatus.message && (
                  <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
                    {testStatus.message}
                  </div>
                )}
              </div>

              {(testStatus.incoming === 'error' || testStatus.outgoing === 'error') && (
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep('server')}>
                    {t('account.setup.editSettings')}
                  </Button>
                  <Button className="flex-1" onClick={testConnection}>
                    {t('account.setup.retry')}
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === 'complete' && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-2">{t('account.setup.setupComplete')}</h2>
                <p className="text-muted-foreground">
                  {t('account.setup.setupCompleteDesc')}
                  <br />
                  {t('account.setup.canUseNow')}
                </p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg text-left">
                <div className="text-sm text-muted-foreground mb-1">
                  {t('account.setup.connectedAccount')}
                </div>
                <div className="font-medium">{config.email}</div>
              </div>
              <Button className="w-full" size="lg" onClick={() => onComplete(config)}>
                {t('account.setup.start')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
