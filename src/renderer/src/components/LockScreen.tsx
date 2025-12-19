import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, Mail, Unlock } from 'lucide-react'
import { Button } from './ui/button'

interface LockScreenProps {
  onUnlock: () => void
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const { t } = useTranslation()
  const [isUnlocking, setIsUnlocking] = useState(false)

  const handleUnlock = useCallback(() => {
    setIsUnlocking(true)
    // 애니메이션을 위한 짧은 딜레이
    setTimeout(() => {
      onUnlock()
    }, 300)
  }, [onUnlock])

  // 아무 키나 누르면 잠금 해제
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter 또는 Space 키로 잠금 해제
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleUnlock()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUnlock])

  return (
    <div
      className={`fixed inset-0 z-[100000] flex flex-col items-center justify-center bg-background transition-opacity duration-300 ${
        isUnlocking ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* 배경 패턴 */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10" />

      {/* 메인 콘텐츠 */}
      <div className="relative z-10 flex flex-col items-center space-y-8">
        {/* 로고 및 잠금 아이콘 */}
        <div className="relative">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-12 w-12 text-primary" />
          </div>
          <div className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-lg ring-2 ring-primary/20">
            <Lock className="h-5 w-5 text-primary" />
          </div>
        </div>

        {/* 앱 이름 */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">MailVista</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('lockScreen.locked')}</p>
        </div>

        {/* 잠금 해제 버튼 */}
        <Button
          size="lg"
          onClick={handleUnlock}
          className="min-w-[200px] gap-2"
          disabled={isUnlocking}
        >
          <Unlock className="h-5 w-5" />
          {t('lockScreen.unlock')}
        </Button>

        {/* 안내 메시지 */}
        <p className="text-xs text-muted-foreground">{t('lockScreen.hint')}</p>
      </div>

      {/* 하단 정보 */}
      <div className="absolute bottom-8 text-center">
        <p className="text-xs text-muted-foreground">{t('lockScreen.autoLockMessage')}</p>
      </div>
    </div>
  )
}
