import { AlertTriangle, Paperclip, Users, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { cn } from '@renderer/lib/utils'

export interface SafetyWarning {
  type: 'attachment' | 'sensitive' | 'recipients'
  titleKey: string
  descriptionKey: string
  descriptionParams?: Record<string, string | number>
  detailKeys?: { key: string; params?: Record<string, string | number> }[]
}

interface SendSafetyModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirmSend: () => void
  warnings: SafetyWarning[]
}

// 경고 아이콘 선택
function getWarningIcon(type: SafetyWarning['type']) {
  switch (type) {
    case 'attachment':
      return <Paperclip className="h-5 w-5" />
    case 'sensitive':
      return <ShieldAlert className="h-5 w-5" />
    case 'recipients':
      return <Users className="h-5 w-5" />
    default:
      return <AlertTriangle className="h-5 w-5" />
  }
}

// 경고 색상 선택
function getWarningColor(type: SafetyWarning['type']) {
  switch (type) {
    case 'sensitive':
      return 'text-red-500 bg-red-50 border-red-200'
    case 'recipients':
      return 'text-orange-500 bg-orange-50 border-orange-200'
    case 'attachment':
    default:
      return 'text-amber-500 bg-amber-50 border-amber-200'
  }
}

export function SendSafetyModal({
  isOpen,
  onClose,
  onConfirmSend,
  warnings
}: SendSafetyModalProps) {
  const { t } = useTranslation()

  if (warnings.length === 0) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            {t('sendSafety.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground mb-4">{t('sendSafety.description')}</p>

          <div className="space-y-3">
            {warnings.map((warning, index) => (
              <div
                key={index}
                className={cn('p-3 rounded-lg border', getWarningColor(warning.type))}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">{getWarningIcon(warning.type)}</div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm">{t(warning.titleKey)}</h4>
                    <p className="text-sm mt-1 opacity-80">
                      {t(warning.descriptionKey, warning.descriptionParams)}
                    </p>
                    {warning.detailKeys && warning.detailKeys.length > 0 && (
                      <div className="mt-2 text-xs opacity-70">
                        <ul className="list-disc list-inside space-y-0.5">
                          {warning.detailKeys.slice(0, 5).map((detail, i) => (
                            <li key={i} className="truncate">
                              {t(detail.key, detail.params)}
                            </li>
                          ))}
                          {warning.detailKeys.length > 5 && (
                            <li>
                              {t('sendSafety.recipients.andMore', {
                                count: warning.detailKeys.length - 5
                              })}
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            {t('sendSafety.goBack')}
          </Button>
          <Button variant="destructive" onClick={onConfirmSend} className="flex-1">
            {t('sendSafety.sendAnyway')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 안전 검사 유틸리티 함수들

// 첨부 파일 관련 키워드 (다국어 지원)
const ATTACHMENT_KEYWORDS = [
  // 한국어
  '첨부',
  '파일',
  '문서',
  '동봉',
  '보내드립니다',
  '첨부합니다',
  '첨부했습니다',
  '첨부드립니다',
  '첨부해 드립니다',
  '파일을 보내',
  '자료를 보내',
  // 영어
  'attached',
  'attachment',
  'attaching',
  'enclosed',
  'enclosing',
  'find attached',
  'see attached',
  'please find',
  'sending you',
  'file attached',
  'document attached',
  // 일본어
  '添付',
  'ファイル',
  '送付',
  '同封',
  '別添',
  '添付します',
  '添付しました',
  '送ります',
  'お送りします',
  // 중국어
  '附件',
  '附上',
  '随附',
  '请查收',
  '发送文件',
  '附加文件'
]

// 민감 키워드
const SENSITIVE_KEYWORDS = [
  '비밀번호',
  '패스워드',
  'password',
  'passwd',
  '계좌',
  '계좌번호',
  'account number',
  '신용카드',
  '카드번호',
  'credit card',
  'card number',
  '주민번호',
  '주민등록번호',
  '사회보장번호',
  'ssn',
  'social security',
  '인증번호',
  'pin',
  'otp',
  '보안코드',
  'cvv',
  'cvc',
  '개인정보',
  '비밀',
  'secret',
  'private key',
  'api key',
  'access token'
]

// 대량 수신자 기준
const BULK_RECIPIENT_THRESHOLD = 5

/**
 * 이메일 발송 전 안전 검사 수행
 */
export function performSafetyCheck(params: {
  plainText: string
  subject: string
  attachments: { name: string }[]
  toCount: number
  ccCount: number
  bccCount: number
}): SafetyWarning[] {
  const warnings: SafetyWarning[] = []
  const { plainText, subject, attachments, toCount, ccCount, bccCount } = params

  // 검사할 텍스트 (제목 + 본문)
  const textToCheck = `${subject} ${plainText}`.toLowerCase()

  // 1. 첨부 파일 누락 검사
  const hasAttachmentKeyword = ATTACHMENT_KEYWORDS.some((keyword) =>
    textToCheck.includes(keyword.toLowerCase())
  )

  if (hasAttachmentKeyword && attachments.length === 0) {
    const foundKeywords = ATTACHMENT_KEYWORDS.filter((keyword) =>
      textToCheck.includes(keyword.toLowerCase())
    )
    warnings.push({
      type: 'attachment',
      titleKey: 'sendSafety.attachment.title',
      descriptionKey: 'sendSafety.attachment.description',
      detailKeys: foundKeywords.slice(0, 3).map((k) => ({
        key: 'sendSafety.attachment.keywordFound',
        params: { keyword: k }
      }))
    })
  }

  // 2. 민감 키워드 경고
  const foundSensitiveKeywords = SENSITIVE_KEYWORDS.filter((keyword) =>
    textToCheck.includes(keyword.toLowerCase())
  )

  if (foundSensitiveKeywords.length > 0) {
    warnings.push({
      type: 'sensitive',
      titleKey: 'sendSafety.sensitive.title',
      descriptionKey: 'sendSafety.sensitive.description',
      detailKeys: foundSensitiveKeywords.map((k) => ({
        key: 'sendSafety.attachment.keywordFound',
        params: { keyword: k }
      }))
    })
  }

  // 3. 대량 수신자 경고
  const totalRecipients = toCount + ccCount + bccCount

  if (totalRecipients > BULK_RECIPIENT_THRESHOLD) {
    const detailKeys: { key: string; params?: Record<string, string | number> }[] = [
      { key: 'sendSafety.recipients.to', params: { count: toCount } }
    ]
    if (ccCount > 0) {
      detailKeys.push({ key: 'sendSafety.recipients.cc', params: { count: ccCount } })
    }
    if (bccCount > 0) {
      detailKeys.push({ key: 'sendSafety.recipients.bcc', params: { count: bccCount } })
    }

    warnings.push({
      type: 'recipients',
      titleKey: 'sendSafety.recipients.title',
      descriptionKey: 'sendSafety.recipients.description',
      descriptionParams: { count: totalRecipients },
      detailKeys
    })
  }

  return warnings
}
