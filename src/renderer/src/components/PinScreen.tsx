import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, Mail, AlertCircle } from 'lucide-react'
import { Button } from './ui/button'

interface PinScreenProps {
  onVerified: () => void
}

export function PinScreen({ onVerified }: PinScreenProps) {
  const { t } = useTranslation()
  const [pin, setPin] = useState<string[]>(['', '', '', '', '', ''])
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // 첫 번째 입력에 포커스
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  // PIN 검증
  const verifyPin = useCallback(
    async (pinValue: string) => {
      setIsVerifying(true)
      setError(null)

      try {
        const result = await window.electron.ipcRenderer.invoke('verify-pin', pinValue)
        if (result.success && result.valid) {
          onVerified()
        } else {
          setError(t('pin.incorrect'))
          setShake(true)
          setTimeout(() => setShake(false), 500)
          // PIN 초기화
          setPin(['', '', '', '', '', ''])
          inputRefs.current[0]?.focus()
        }
      } catch (err) {
        setError(t('pin.verifyError'))
        setShake(true)
        setTimeout(() => setShake(false), 500)
      } finally {
        setIsVerifying(false)
      }
    },
    [onVerified, t]
  )

  // 입력 핸들러
  const handleInput = useCallback(
    (index: number, value: string) => {
      // 숫자만 허용
      if (!/^\d*$/.test(value)) return

      const newPin = [...pin]
      newPin[index] = value.slice(-1) // 마지막 입력 문자만

      setPin(newPin)
      setError(null)

      // 다음 입력으로 이동
      if (value && index < 5) {
        inputRefs.current[index + 1]?.focus()
      }

      // 모든 자리가 입력되면 검증
      const fullPin = newPin.join('')
      if (fullPin.length === 6) {
        verifyPin(fullPin)
      }
    },
    [pin, verifyPin]
  )

  // 키보드 핸들러
  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === 'Backspace') {
        if (!pin[index] && index > 0) {
          // 현재 칸이 비어있으면 이전 칸으로 이동
          inputRefs.current[index - 1]?.focus()
          const newPin = [...pin]
          newPin[index - 1] = ''
          setPin(newPin)
        } else {
          // 현재 칸 지우기
          const newPin = [...pin]
          newPin[index] = ''
          setPin(newPin)
        }
      } else if (e.key === 'ArrowLeft' && index > 0) {
        inputRefs.current[index - 1]?.focus()
      } else if (e.key === 'ArrowRight' && index < 5) {
        inputRefs.current[index + 1]?.focus()
      }
    },
    [pin]
  )

  // 숫자 패드 클릭 핸들러
  const handleNumberClick = useCallback(
    (num: string) => {
      const emptyIndex = pin.findIndex((p) => p === '')
      if (emptyIndex !== -1) {
        handleInput(emptyIndex, num)
      }
    },
    [pin, handleInput]
  )

  // 삭제 버튼 핸들러
  const handleDelete = useCallback(() => {
    const lastFilledIndex = pin.reduce((acc, p, i) => (p ? i : acc), -1)
    if (lastFilledIndex >= 0) {
      const newPin = [...pin]
      newPin[lastFilledIndex] = ''
      setPin(newPin)
      inputRefs.current[lastFilledIndex]?.focus()
    }
  }, [pin])

  return (
    <div className="fixed inset-0 z-[100000] flex flex-col items-center justify-center bg-background">
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
          <p className="mt-2 text-sm text-muted-foreground">{t('pin.enterPin')}</p>
        </div>

        {/* PIN 입력 필드 */}
        <div className={`flex gap-3 ${shake ? 'animate-shake' : ''}`}>
          {pin.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el
              }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleInput(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              disabled={isVerifying}
              className="h-14 w-12 rounded-lg border-2 border-input bg-background text-center text-2xl font-bold text-foreground transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
          ))}
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* 숫자 패드 */}
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((item, index) => (
            <Button
              key={index}
              variant={item === 'del' ? 'outline' : 'secondary'}
              size="lg"
              className={`h-14 w-14 text-xl font-semibold ${item === '' ? 'invisible' : ''}`}
              onClick={() => {
                if (item === 'del') {
                  handleDelete()
                } else if (item) {
                  handleNumberClick(item)
                }
              }}
              disabled={isVerifying || item === ''}
            >
              {item === 'del' ? '←' : item}
            </Button>
          ))}
        </div>

        {/* 로딩 표시 */}
        {isVerifying && <p className="text-sm text-muted-foreground">{t('pin.verifying')}</p>}
      </div>

      {/* 하단 정보 */}
      <div className="absolute bottom-8 text-center">
        <p className="text-xs text-muted-foreground">{t('pin.securityNote')}</p>
      </div>

      {/* 흔들림 애니메이션 스타일 */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  )
}
