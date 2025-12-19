import * as React from 'react'
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  Star,
  ExternalLink,
  Printer,
  MailOpen,
  Download,
  Paperclip,
  Globe,
  Eye,
  Search,
  ArrowUp,
  Loader2,
  Plus,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Lock,
  AlertTriangle,
  ImageOff
} from 'lucide-react'
import DOMPurify from 'dompurify'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { cn } from '@renderer/lib/utils'
import { Input } from './ui/input'
import { Separator } from './ui/separator'
import { SenderPopup } from './SenderPopup'
import { EmailAISummary } from './EmailAISummary'
import { TranslationToggle } from './TranslationToggle'
import { EmailQAPanel } from './EmailQAPanel'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from './ui/dialog'
import { useTranslation } from 'react-i18next'

interface Attachment {
  filename: string
  contentType: string
  size: number
  contentId?: string
  partId?: string
  encoding?: string
  content?: Uint8Array | string
}

interface Email {
  id: string
  uid: number
  sender: string
  senderEmail: string
  recipient: string
  subject: string
  date: string
  content: string
  html?: string
  isStarred: boolean
  hasExternalLink: boolean
  attachments?: Attachment[]
}

interface SubFolder {
  name: string
  path: string
}

interface RelatedEmail {
  id: string
  sender: string
  subject: string
  date: string
  hasExternalLink?: boolean
}

interface EmailViewProps {
  email?: Email
  currentAccount?: string
  folderName?: string
  currentIndex?: number
  totalCount?: number
  unreadCount?: number
  moveFolders?: SubFolder[]
  relatedEmails?: RelatedEmail[]
  isSenderVip?: boolean
  /** 분할 보기 모드에서 헤더 바 숨김 */
  compactMode?: boolean
  onBack?: () => void
  onPrev?: () => void
  onNext?: () => void
  onReply?: () => void
  onReplyAll?: () => void
  onForward?: () => void
  onDelete?: () => void
  onMarkSpam?: () => void
  onMarkUnread?: () => void
  onSaveAsEml?: () => void
  onMove?: (targetFolder: string) => void
  onMoveAndCreateRule?: (targetFolder: string) => void
  onCreateMoveFolder?: (folderName: string) => Promise<{ success: boolean; path?: string }>
  onPrint?: () => void
  onToggleStar?: (starred: boolean) => void
  onDeleteUnread?: () => void
  onSearch?: (query: string) => void
  onRelatedEmailClick?: (id: string) => void
  // 발신자 팝업 관련 콜백
  onToggleSenderVip?: (email: string, isVip: boolean) => void
  onComposeToSender?: (email: string, name: string) => void
  onAddSenderToContacts?: (data: {
    name: string
    email: string
    groupId: string
    isVip: boolean
  }) => void
  onBlockSender?: (email: string) => void
  onViewConversation?: (email: string) => void
  onSearchBySender?: (email: string) => void
  onSearchByRecipient?: (email: string) => void
  onAutoClassifySender?: (email: string) => void
  onDeleteAllFromSender?: (email: string) => void
  onHighlightSender?: (email: string) => void
}

const sampleEmail: Email = {
  id: '1',
  uid: 1,
  sender: 'npm',
  senderEmail: 'support@npmjs.com',
  recipient: 'ssabrojs',
  subject: '[Action Required] Classic npm tokens stop working December 9th',
  date: '2025년 12월 4일 (목) 오후 2:16',
  content: `Hi ssabrojs,

Your npm account has classic tokens that will stop working on December 9th, 2025.

**What's happening:**
• November 5th: Classic token creation was disabled
• December 9th: All classic tokens will be permanently revoked

**What you need to do:**
Migrate to trusted publishing or granular access tokens before December 9th to avoid disruption.

**Learn more:**
• November 5th changes: https://gh.io/npm-classic-token-disabled
• December 9th changes: https://gh.io/all-npm-classic-tokens-revoked
• Trusted publishing with OIDC: https://docs.npmjs.com/trusted-publishers
• Token migration guide: https://docs.npmjs.com/creating-and-viewing-access-tokens

Questions? Join our community discussion: https://github.com/orgs/community/discussions/178140

The npm team`,
  isStarred: false,
  hasExternalLink: true
}

export const EmailView = React.memo(function EmailView({
  email = sampleEmail,
  currentAccount,
  folderName = 'Inbox',
  currentIndex = 1,
  totalCount = 1,
  unreadCount = 0,
  moveFolders = [],
  relatedEmails = [],
  isSenderVip = false,
  compactMode = false,
  onBack,
  onPrev,
  onNext,
  onReply,
  onReplyAll,
  onForward,
  onDelete,
  onMarkSpam,
  onMarkUnread,
  onSaveAsEml,
  onMove,
  onMoveAndCreateRule,
  onCreateMoveFolder,
  onPrint,
  onToggleStar,
  onDeleteUnread,
  onSearch,
  onRelatedEmailClick,
  onToggleSenderVip,
  onComposeToSender,
  onAddSenderToContacts,
  onBlockSender,
  onViewConversation,
  onSearchBySender,
  onSearchByRecipient,
  onAutoClassifySender,
  onDeleteAllFromSender,
  onHighlightSender
}: EmailViewProps): React.ReactElement {
  const { t } = useTranslation()
  const [isStarred, setIsStarred] = React.useState(email.isStarred)
  const [isHeaderExpanded, setIsHeaderExpanded] = React.useState(true)
  const [isAttachmentsExpanded, setIsAttachmentsExpanded] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState('')
  const contentRef = React.useRef<HTMLDivElement>(null)

  // 암호화 복호화 상태 (Signal, PGP, S/MIME)
  type EncryptionType = 'none' | 'signal' | 'pgp' | 'smime'
  const [encryptionType, setEncryptionType] = React.useState<EncryptionType>('none')
  const [isDecrypting, setIsDecrypting] = React.useState(false)
  const [decryptedContent, setDecryptedContent] = React.useState<{
    html: string
    text: string
  } | null>(null)
  const [decryptionError, setDecryptionError] = React.useState<string | null>(null)
  const [showPassphraseDialog, setShowPassphraseDialog] = React.useState(false)
  const [decryptPassphrase, setDecryptPassphrase] = React.useState('')
  const [pendingDecryptContent, setPendingDecryptContent] = React.useState<string>('')

  // 발신자 팝업 상태
  const [isSenderPopupOpen, setIsSenderPopupOpen] = React.useState(false)
  const [senderPopupPosition, setSenderPopupPosition] = React.useState({ top: 0, left: 0 })

  // 이동 팝오버 상태
  const [isMovePopoverOpen, setIsMovePopoverOpen] = React.useState(false)
  const [selectedMoveFolder, setSelectedMoveFolder] = React.useState<string | null>(null)
  const [newFolderName, setNewFolderName] = React.useState('')
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false)
  const [isMoving, setIsMoving] = React.useState(false)

  // AI Translation 상태
  const [translatedContent, setTranslatedContent] = React.useState<string | null>(null)

  // 인쇄 미리보기 상태
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = React.useState(false)
  const [printPreviewContent, setPrintPreviewContent] = React.useState<string>('')

  // 보안 기능 상태
  const [blockExternalImages, setBlockExternalImages] = React.useState(true)
  const [loadImagesForThisEmail, setLoadImagesForThisEmail] = React.useState(false)
  const [hasBlockedImages, setHasBlockedImages] = React.useState(false)
  const [showDangerousFileWarning, setShowDangerousFileWarning] = React.useState(false)
  const [pendingAttachment, setPendingAttachment] = React.useState<Attachment | null>(null)
  const [attachmentRiskInfo, setAttachmentRiskInfo] = React.useState<{
    level: string
    message: string | null
  } | null>(null)
  const [showUrlWarning, setShowUrlWarning] = React.useState(false)
  const [pendingUrl, setPendingUrl] = React.useState('')
  const [urlAnalysis, setUrlAnalysis] = React.useState<{
    url: string
    domain: string
    isPunycode: boolean
    decodedDomain: string | null
    riskLevel: string
    warnings: string[]
  } | null>(null)
  const [emailAuthStatus, setEmailAuthStatus] = React.useState<{
    spf: string
    dkim: string
    dmarc: string
    fromDomain: string
    summary: { status: string; icon: string }
  } | null>(null)

  React.useEffect(() => {
    setIsStarred(email.isStarred)
  }, [email.isStarred])

  // Reset translation when email changes
  React.useEffect(() => {
    setTranslatedContent(null)
  }, [email.id])

  // 이메일 변경 시 보안 상태 초기화 및 설정 로드
  React.useEffect(() => {
    setLoadImagesForThisEmail(false)
    setHasBlockedImages(false)
    setEmailAuthStatus(null)

    // 계정별 프라이버시 설정 로드
    const loadPrivacySettings = async (): Promise<void> => {
      if (!currentAccount) return
      try {
        const settings = await window.electron.ipcRenderer.invoke(
          'get-app-settings',
          currentAccount
        )
        if (settings?.privacy) {
          setBlockExternalImages(settings.privacy.blockExternalImages ?? true)
        }
      } catch (e) {
        console.error('[Security] Failed to load privacy settings:', e)
      }
    }

    // 이메일 인증 상태 로드
    const loadAuthStatus = async (): Promise<void> => {
      if (!currentAccount || !folderName || !email.uid) return
      try {
        const authStatus = await window.electron.ipcRenderer.invoke(
          'get-email-auth-status',
          currentAccount,
          email.uid,
          folderName
        )
        setEmailAuthStatus(authStatus)
      } catch (e) {
        console.error('[Security] Failed to load auth status:', e)
      }
    }

    loadPrivacySettings()
    loadAuthStatus()
  }, [email.id, email.uid, currentAccount, folderName])

  // 암호화 감지 및 복호화 (Signal, PGP, S/MIME)
  React.useEffect(() => {
    const detectAndDecrypt = async () => {
      // 상태 초기화
      setEncryptionType('none')
      setDecryptedContent(null)
      setDecryptionError(null)
      setPendingDecryptContent('')

      if (!email.html && !email.content) return
      if (!currentAccount) return

      const contentToCheck = email.html || email.content

      try {
        // 암호화 유형 감지
        const detectedType = await window.electron.ipcRenderer.invoke(
          'detect-encryption-type',
          contentToCheck
        )

        if (detectedType === 'none') return

        setEncryptionType(detectedType)

        if (detectedType === 'signal') {
          // Signal Protocol 복호화 (자동)
          setIsDecrypting(true)

          // 암호화된 페이로드 추출
          let encryptedPayload = ''
          const preMatch = contentToCheck.match(
            /<pre[^>]*style="display:\s*none;"[^>]*>([^<]+)<\/pre>/i
          )
          if (preMatch) {
            encryptedPayload = preMatch[1].trim()
          } else {
            const lines = contentToCheck.split('\n')
            for (const line of lines) {
              const trimmed = line.trim()
              if (trimmed.startsWith('E2E:') || trimmed.match(/^[A-Za-z0-9+/=]{50,}$/)) {
                encryptedPayload = trimmed.replace(/^E2E:/, '').trim()
                break
              }
            }
          }

          if (!encryptedPayload) {
            setDecryptionError('암호화된 페이로드를 찾을 수 없습니다.')
            setIsDecrypting(false)
            return
          }

          const result = await window.electron.ipcRenderer.invoke(
            'e2e-decrypt',
            currentAccount,
            email.senderEmail,
            encryptedPayload
          )

          if (result.success && result.plaintext) {
            try {
              const parsed = JSON.parse(result.plaintext)
              setDecryptedContent({
                html: parsed.html || '',
                text: parsed.text || ''
              })
            } catch {
              setDecryptedContent({ html: '', text: result.plaintext })
            }
          } else {
            setDecryptionError(result.error || '복호화에 실패했습니다.')
          }
          setIsDecrypting(false)
        } else if (detectedType === 'pgp' || detectedType === 'smime') {
          // PGP/S-MIME은 암호가 필요하므로 암호화된 내용 저장
          // pre 태그에서 암호화된 내용 추출
          const preMatch = contentToCheck.match(/<pre[^>]*>([^<]+)<\/pre>/i)
          if (preMatch) {
            setPendingDecryptContent(preMatch[1].trim())
          } else {
            // 텍스트에서 PGP 또는 S/MIME 블록 추출
            if (detectedType === 'pgp') {
              const pgpMatch = contentToCheck.match(
                /-----BEGIN PGP MESSAGE-----([\s\S]*?)-----END PGP MESSAGE-----/
              )
              if (pgpMatch) {
                setPendingDecryptContent(pgpMatch[0])
              }
            } else {
              // S/MIME - 전체 내용이 암호화됨
              setPendingDecryptContent(contentToCheck)
            }
          }
        }
      } catch (err) {
        console.error('Encryption detection error:', err)
        setDecryptionError(
          err instanceof Error ? err.message : '암호화 감지 중 오류가 발생했습니다.'
        )
      }
    }

    detectAndDecrypt()
  }, [email.id, email.html, email.content, email.senderEmail, currentAccount])

  // PGP/S-MIME 복호화 함수
  const handleDecryptWithPassphrase = async () => {
    if (!pendingDecryptContent || !decryptPassphrase) return

    setIsDecrypting(true)
    setShowPassphraseDialog(false)

    try {
      let result
      if (encryptionType === 'pgp') {
        result = await window.electron.ipcRenderer.invoke(
          'pgp-decrypt',
          currentAccount,
          pendingDecryptContent,
          decryptPassphrase
        )
      } else {
        result = await window.electron.ipcRenderer.invoke(
          'smime-decrypt',
          currentAccount,
          pendingDecryptContent,
          decryptPassphrase
        )
      }

      if (result.success && result.decrypted) {
        setDecryptedContent({
          html: '',
          text: result.decrypted
        })
        setDecryptionError(null)
      } else {
        setDecryptionError(result.error || '복호화에 실패했습니다.')
      }
    } catch (err) {
      console.error('Decryption error:', err)
      setDecryptionError(err instanceof Error ? err.message : '복호화 중 오류가 발생했습니다.')
    } finally {
      setIsDecrypting(false)
      setDecryptPassphrase('')
    }
  }

  const handleToggleStar = (): void => {
    const newStarred = !isStarred
    setIsStarred(newStarred)
    onToggleStar?.(newStarred)
  }

  const handlePrint = (): void => {
    if (onPrint) {
      onPrint()
    } else {
      // 첨부파일 목록 HTML 생성
      let attachmentsHtml = ''
      if (email.attachments && email.attachments.length > 0) {
        const attachmentsList = email.attachments
          .map((att) => `<li>${att.filename} (${formatSize(att.size)})</li>`)
          .join('')
        attachmentsHtml = `
          <div class="attachments">
            <h3>${t('email.attachmentsCount', { count: email.attachments.length })}</h3>
            <ul>${attachmentsList}</ul>
          </div>
        `
      }

      // 이메일 본문 처리
      let emailContent = ''
      if (email.html) {
        emailContent = email.html
      } else if (email.content) {
        // 텍스트 콘텐츠의 경우 HTML 이스케이프 후 줄바꿈 처리
        emailContent = email.content
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>')
      } else {
        emailContent = `<p style="color: #888;">${t('email.noContent')}</p>`
      }

      // iframe을 사용하여 인쇄
      const printFrame = document.createElement('iframe')
      printFrame.style.position = 'absolute'
      printFrame.style.top = '-10000px'
      printFrame.style.left = '-10000px'
      printFrame.style.width = '800px'
      printFrame.style.height = '600px'
      document.body.appendChild(printFrame)

      const frameDoc = printFrame.contentDocument || printFrame.contentWindow?.document
      if (frameDoc) {
        frameDoc.open()

        // HTML 구성 (문자열 연결 방식으로 안전하게 처리)
        frameDoc.write('<!DOCTYPE html><html><head>')
        frameDoc.write('<meta charset="UTF-8">')
        frameDoc.write(`<title>${t('email.printTitle')}</title>`)
        frameDoc.write('<style>')
        frameDoc.write('* { margin: 0; padding: 0; box-sizing: border-box; }')
        frameDoc.write(
          "body { font-family: 'Malgun Gothic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #333; font-size: 14px; line-height: 1.6; }"
        )
        frameDoc.write(
          '.header { border-bottom: 2px solid #e5e5e5; padding-bottom: 20px; margin-bottom: 20px; }'
        )
        frameDoc.write(
          '.subject { font-size: 20px; font-weight: 600; margin-bottom: 16px; color: #111; }'
        )
        frameDoc.write('.meta { color: #555; font-size: 13px; line-height: 1.8; }')
        frameDoc.write('.meta-row { display: flex; margin-bottom: 4px; }')
        frameDoc.write('.meta-label { width: 70px; color: #888; flex-shrink: 0; }')
        frameDoc.write('.meta-value { flex: 1; }')
        frameDoc.write(
          '.attachments { background: #f8f9fa; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin-bottom: 20px; }'
        )
        frameDoc.write('.attachments h3 { font-size: 14px; margin: 0 0 12px 0; color: #555; }')
        frameDoc.write('.attachments ul { margin: 0; padding-left: 20px; }')
        frameDoc.write('.attachments li { font-size: 13px; color: #666; margin-bottom: 4px; }')
        frameDoc.write('.content { font-size: 14px; line-height: 1.8; }')
        frameDoc.write('.content img { max-width: 100%; height: auto; }')
        frameDoc.write('a { color: #2563eb; }')
        frameDoc.write(
          '@media print { body { padding: 20px; } .attachments { break-inside: avoid; } }'
        )
        frameDoc.write('</style>')
        frameDoc.write('</head><body>')

        // Header
        frameDoc.write('<div class="header">')
        frameDoc.write('<div class="subject">')
        frameDoc.write(email.subject.replace(/</g, '&lt;').replace(/>/g, '&gt;'))
        frameDoc.write('</div>')
        frameDoc.write('<div class="meta">')
        frameDoc.write(
          `<div class="meta-row"><span class="meta-label">${t('email.from')}</span><span class="meta-value">`
        )
        frameDoc.write(email.sender.replace(/</g, '&lt;').replace(/>/g, '&gt;'))
        frameDoc.write(' &lt;')
        frameDoc.write(email.senderEmail.replace(/</g, '&lt;').replace(/>/g, '&gt;'))
        frameDoc.write('&gt;</span></div>')
        frameDoc.write(
          `<div class="meta-row"><span class="meta-label">${t('email.to')}</span><span class="meta-value">`
        )
        frameDoc.write(email.recipient.replace(/</g, '&lt;').replace(/>/g, '&gt;'))
        frameDoc.write('</span></div>')
        frameDoc.write(
          `<div class="meta-row"><span class="meta-label">${t('email.date')}</span><span class="meta-value">`
        )
        frameDoc.write(email.date)
        frameDoc.write('</span></div>')
        frameDoc.write('</div></div>')

        // Attachments
        if (attachmentsHtml) {
          frameDoc.write(attachmentsHtml)
        }

        // Content
        frameDoc.write('<div class="content">')
        frameDoc.write(emailContent)
        frameDoc.write('</div>')

        frameDoc.write('</body></html>')
        frameDoc.close()

        // document.write 후 바로 인쇄
        setTimeout(() => {
          try {
            printFrame.contentWindow?.focus()
            printFrame.contentWindow?.print()
          } catch (e) {
            console.error('Print error:', e)
          }
          // 인쇄 대화상자 닫힌 후 iframe 제거
          setTimeout(() => {
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame)
            }
          }, 100)
        }, 500)
      }
    }
  }

  // 인쇄 미리보기 열기
  const handlePrintPreview = (): void => {
    // 첨부파일 목록 HTML 생성
    let attachmentsHtml = ''
    if (email.attachments && email.attachments.length > 0) {
      const attachmentsList = email.attachments
        .map((att) => `<li>${att.filename} (${formatSize(att.size)})</li>`)
        .join('')
      attachmentsHtml = `
        <div class="attachments">
          <h3>${t('email.attachmentsCount', { count: email.attachments.length })}</h3>
          <ul>${attachmentsList}</ul>
        </div>
      `
    }

    // 이메일 본문 처리
    let emailContent = ''
    if (email.html) {
      emailContent = email.html
    } else if (email.content) {
      // 텍스트 콘텐츠의 경우 HTML 이스케이프 후 줄바꿈 처리
      emailContent = email.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')
    } else {
      emailContent = `<p style="color: #888;">${t('email.noContent')}</p>`
    }

    // 미리보기용 HTML 생성
    const previewHtml = `
      <div style="font-family: 'Malgun Gothic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #333; font-size: 14px; line-height: 1.6; background: white;">
        <div style="border-bottom: 2px solid #e5e5e5; padding-bottom: 20px; margin-bottom: 20px;">
          <div style="font-size: 20px; font-weight: 600; margin-bottom: 16px; color: #111;">
            ${email.subject.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
          </div>
          <div style="color: #555; font-size: 13px; line-height: 1.8;">
            <div style="display: flex; margin-bottom: 4px;">
              <span style="width: 70px; color: #888; flex-shrink: 0;">${t('email.from')}</span>
              <span style="flex: 1;">${email.sender.replace(/</g, '&lt;').replace(/>/g, '&gt;')} &lt;${email.senderEmail.replace(/</g, '&lt;').replace(/>/g, '&gt;')}&gt;</span>
            </div>
            <div style="display: flex; margin-bottom: 4px;">
              <span style="width: 70px; color: #888; flex-shrink: 0;">${t('email.to')}</span>
              <span style="flex: 1;">${email.recipient.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
            </div>
            <div style="display: flex; margin-bottom: 4px;">
              <span style="width: 70px; color: #888; flex-shrink: 0;">${t('email.date')}</span>
              <span style="flex: 1;">${email.date}</span>
            </div>
          </div>
        </div>
        ${
          attachmentsHtml
            ? `
          <div style="background: #f8f9fa; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            ${attachmentsHtml.replace(/<div class="attachments">/, '').replace(/<\/div>$/, '')}
          </div>
        `
            : ''
        }
        <div style="font-size: 14px; line-height: 1.8;">
          ${emailContent}
        </div>
      </div>
    `

    setPrintPreviewContent(previewHtml)
    setIsPrintPreviewOpen(true)
  }

  // 인쇄 미리보기에서 인쇄 실행
  const handlePrintFromPreview = (): void => {
    setIsPrintPreviewOpen(false)
    setTimeout(() => handlePrint(), 100)
  }

  // 첨부파일 위험도 체크 후 다운로드
  const handleDownloadAttachment = async (attachment: Attachment): Promise<void> => {
    try {
      // 위험도 체크
      const riskInfo = await window.electron.ipcRenderer.invoke(
        'check-attachment-risk',
        attachment.filename
      )

      // 위험한 파일은 경고 다이얼로그 표시
      if (riskInfo.level === 'dangerous') {
        setPendingAttachment(attachment)
        setAttachmentRiskInfo(riskInfo)
        setShowDangerousFileWarning(true)
        return
      }

      // 안전한 파일은 바로 다운로드
      await performAttachmentDownload(attachment)
    } catch (e) {
      console.error('Error checking attachment risk:', e)
      // 오류 시에도 다운로드 진행
      await performAttachmentDownload(attachment)
    }
  }

  // 실제 다운로드 수행
  const performAttachmentDownload = async (attachment: Attachment): Promise<void> => {
    try {
      let content = attachment.content

      // 콘텐츠가 없고 partId가 있으면 서버에서 가져옴
      if (!content && attachment.partId && currentAccount) {
        const result = await window.electron.ipcRenderer.invoke(
          'get-attachment-content',
          currentAccount,
          folderName, // 폴더 경로 (예: INBOX, Sent 등)
          email.uid,
          attachment.partId
        )

        if (result.success && result.content) {
          content = result.content
        } else {
          console.error('Failed to download attachment:', result.error)
          return
        }
      }

      if (!content) return

      // 다운로드 처리
      const blob = new Blob([content as BlobPart], { type: attachment.contentType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Error downloading attachment:', e)
    }
  }

  // 위험한 파일 다운로드 확인
  const handleConfirmDangerousDownload = async (): Promise<void> => {
    setShowDangerousFileWarning(false)
    if (pendingAttachment) {
      await performAttachmentDownload(pendingAttachment)
      setPendingAttachment(null)
      setAttachmentRiskInfo(null)
    }
  }

  // URL 열기 확인
  const handleConfirmOpenUrl = (): void => {
    setShowUrlWarning(false)
    if (pendingUrl) {
      window.electron.ipcRenderer.invoke('open-external-url', pendingUrl)
      setPendingUrl('')
      setUrlAnalysis(null)
    }
  }

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const getTotalAttachmentSize = (): number => {
    if (!email.attachments) return 0
    return email.attachments.reduce((acc, att) => acc + att.size, 0)
  }

  const handleDownloadAll = async (): Promise<void> => {
    if (!email.attachments) return
    for (const att of email.attachments) {
      await handleDownloadAttachment(att)
    }
  }

  const handleSearch = (e: React.FormEvent): void => {
    e.preventDefault()
    onSearch?.(searchQuery)
  }

  // 이동 관련 핸들러
  const handleMove = async (): Promise<void> => {
    if (!selectedMoveFolder) return
    setIsMoving(true)
    try {
      onMove?.(selectedMoveFolder)
      setIsMovePopoverOpen(false)
      setSelectedMoveFolder(null)
    } finally {
      setIsMoving(false)
    }
  }

  const handleMoveAndCreateRule = async (): Promise<void> => {
    if (!selectedMoveFolder) return
    setIsMoving(true)
    try {
      onMoveAndCreateRule?.(selectedMoveFolder)
      setIsMovePopoverOpen(false)
      setSelectedMoveFolder(null)
    } finally {
      setIsMoving(false)
    }
  }

  const handleCreateFolder = async (): Promise<void> => {
    if (!newFolderName.trim() || !onCreateMoveFolder) return
    setIsCreatingFolder(true)
    try {
      const result = await onCreateMoveFolder(newFolderName.trim())
      if (result.success && result.path) {
        setSelectedMoveFolder(result.path)
        setNewFolderName('')
      }
    } finally {
      setIsCreatingFolder(false)
    }
  }

  // 발신자 클릭 핸들러
  const handleSenderClick = (e: React.MouseEvent): void => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setSenderPopupPosition({
      top: rect.bottom + 8,
      left: rect.left
    })
    setIsSenderPopupOpen(true)
  }

  const getFileIcon = (contentType: string): React.ReactElement => {
    if (contentType.startsWith('image/')) {
      return <Globe className="h-5 w-5 text-blue-500" />
    }
    if (contentType.includes('html') || contentType.includes('text')) {
      return <Globe className="h-5 w-5 text-blue-500" />
    }
    return <Paperclip className="h-5 w-5 text-muted-foreground" />
  }

  const renderContent = (): React.ReactElement => {
    // 암호화된 메일 처리
    if (encryptionType !== 'none') {
      // 복호화 중
      if (isDecrypting) {
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Lock className="h-12 w-12 text-primary mb-4 animate-pulse" />
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('email.encryptedDecrypting')}</span>
            </div>
          </div>
        )
      }

      // 복호화 성공
      if (decryptedContent) {
        const encryptionLabel =
          encryptionType === 'signal'
            ? 'Signal Protocol'
            : encryptionType === 'pgp'
              ? 'PGP'
              : 'S/MIME'
        const bgColor =
          encryptionType === 'signal'
            ? 'bg-green-50 border-green-200'
            : encryptionType === 'pgp'
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-blue-50 border-blue-200'
        const textColor =
          encryptionType === 'signal'
            ? 'text-green-600'
            : encryptionType === 'pgp'
              ? 'text-emerald-600'
              : 'text-blue-600'
        const textColorBold =
          encryptionType === 'signal'
            ? 'text-green-700'
            : encryptionType === 'pgp'
              ? 'text-emerald-700'
              : 'text-blue-700'

        return (
          <div>
            {/* 복호화 성공 배너 */}
            <div className={`flex items-center gap-2 mb-4 p-3 ${bgColor} border rounded-lg`}>
              <ShieldCheck className={`h-5 w-5 ${textColor}`} />
              <span className={`text-sm ${textColorBold} font-medium`}>
                {t('email.encryptedDecrypted', { label: encryptionLabel })}
              </span>
            </div>

            {/* 복호화된 내용 */}
            {decryptedContent.html ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(decryptedContent.html, {
                    USE_PROFILES: { html: true },
                    ADD_ATTR: ['target']
                  })
                }}
              />
            ) : (
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {decryptedContent.text}
              </div>
            )}
          </div>
        )
      }

      // 복호화 실패
      if (decryptionError) {
        const encryptionLabel =
          encryptionType === 'signal'
            ? 'Signal Protocol'
            : encryptionType === 'pgp'
              ? 'PGP'
              : 'S/MIME'
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ShieldAlert className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">
              {t('email.encryptedMsgTitle', { type: encryptionLabel })}
            </p>
            <p className="text-sm text-red-500 mb-4">
              {t('email.encryptedFailed', { error: decryptionError })}
            </p>
            {encryptionType === 'signal' ? (
              <p className="text-xs text-muted-foreground max-w-md">
                {t('email.encryptedSignalError')}
              </p>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowPassphraseDialog(true)}>
                {t('email.retry')}
              </Button>
            )}
          </div>
        )
      }

      // PGP/S-MIME: 암호 입력 대기
      if ((encryptionType === 'pgp' || encryptionType === 'smime') && pendingDecryptContent) {
        const encryptionLabel = encryptionType === 'pgp' ? 'PGP' : 'S/MIME'
        const textColor = encryptionType === 'pgp' ? 'text-emerald-600' : 'text-blue-600'

        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Lock className={`h-12 w-12 ${textColor} mb-4`} />
            <p className="text-lg font-medium text-foreground mb-2">
              {t('email.encryptedMsgTitle', { type: encryptionLabel })}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {t('email.encryptedNeedPassphrase')}
            </p>
            <Button onClick={() => setShowPassphraseDialog(true)}>
              <Lock className="h-4 w-4 mr-2" />
              {t('email.decrypt')}
            </Button>
          </div>
        )
      }

      // Signal Protocol: 암호화 감지됨 (자동 복호화 시도 전)
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Lock className="h-12 w-12 text-primary mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">
            {t('email.encryptedSignalTitle')}
          </p>
          <p className="text-sm text-muted-foreground">{t('email.encryptedSignalDesc')}</p>
        </div>
      )
    }

    // 일반 메일: HTML 내용이 있으면 HTML로 렌더링
    if (email.html) {
      // 외부 이미지 차단이 활성화되어 있고 이 이메일에서 이미지 로드를 허용하지 않은 경우
      const shouldBlockImages = blockExternalImages && !loadImagesForThisEmail

      // DOMPurify 훅 설정 (외부 이미지 차단)
      if (shouldBlockImages) {
        let foundBlockedImages = false
        DOMPurify.addHook('afterSanitizeElements', (node) => {
          if (node instanceof Element && node.tagName === 'IMG') {
            const src = node.getAttribute('src') || ''
            // data: URI, cid: (인라인 첨부), blob: 은 허용
            if (
              src &&
              !src.startsWith('data:') &&
              !src.startsWith('cid:') &&
              !src.startsWith('blob:')
            ) {
              node.setAttribute('data-blocked-src', src)
              node.removeAttribute('src')
              node.setAttribute('alt', '[이미지 차단됨]')
              node.setAttribute(
                'style',
                'border: 1px dashed #ccc; padding: 8px; background: #f5f5f5;'
              )
              foundBlockedImages = true
            }
          }
        })

        const sanitizedHtml = DOMPurify.sanitize(email.html, {
          USE_PROFILES: { html: true },
          ADD_ATTR: ['target', 'data-blocked-src']
        })

        // 훅 제거
        DOMPurify.removeHook('afterSanitizeElements')

        // 차단된 이미지가 있으면 상태 업데이트
        if (foundBlockedImages && !hasBlockedImages) {
          setTimeout(() => setHasBlockedImages(true), 0)
        }

        return (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        )
      }

      // 이미지 차단 비활성화 시 일반 렌더링
      const sanitizedHtml = DOMPurify.sanitize(email.html, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['target']
      })

      return (
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      )
    }

    // 텍스트 내용 렌더링
    return (
      <div className="whitespace-pre-wrap text-sm leading-relaxed">
        {email.content.split('\n').map((line, index) => {
          // URL을 링크로 변환
          const urlRegex = /(https?:\/\/[^\s]+)/g
          if (urlRegex.test(line)) {
            const parts = line.split(urlRegex)
            return (
              <p key={index} className="my-1">
                {parts.map((part, i) =>
                  urlRegex.test(part) ? (
                    <a
                      key={i}
                      href={part}
                      className="text-blue-500 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {part}
                    </a>
                  ) : (
                    part
                  )
                )}
              </p>
            )
          }
          // **text** 를 볼드로 변환
          if (line.startsWith('**') && line.endsWith('**')) {
            return (
              <p key={index} className="my-2 font-semibold">
                {line.replace(/\*\*/g, '')}
              </p>
            )
          }
          // 빈 줄
          if (line.trim() === '') {
            return <br key={index} />
          }
          return (
            <p key={index} className="my-1">
              {line}
            </p>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      {/* Header Bar - 분할 보기 모드에서 숨김 */}
      {!compactMode && (
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1 text-sm hover:text-primary" onClick={onBack}>
              <ChevronLeft className="h-4 w-4" />
              <span className="font-medium">{t('email.list')}</span>
              <span className="text-primary font-medium">{currentIndex}</span>
              <span className="text-muted-foreground">/ {totalCount}</span>
            </button>
            {unreadCount > 0 && (
              <button
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={onDeleteUnread}
              >
                {t('email.deleteUnread')}
              </button>
            )}
          </div>
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative">
              <Input
                type="text"
                placeholder={t('common.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-48 pr-8 text-sm"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-sm">
              {t('email.detail')}
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </form>
        </div>
      )}

      {/* Action Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b">
        <Button variant="ghost" size="sm" className="h-8 px-3 text-sm" onClick={onReply}>
          {t('email.reply')}
        </Button>
        <Button variant="ghost" size="sm" className="h-8 px-3 text-sm" onClick={onReplyAll}>
          {t('email.replyAll')}
        </Button>
        <Button variant="ghost" size="sm" className="h-8 px-3 text-sm" onClick={onForward}>
          {t('email.forward')}
        </Button>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <Button variant="ghost" size="sm" className="h-8 px-3 text-sm" onClick={onDelete}>
          {t('email.delete')}
        </Button>
        <Button variant="ghost" size="sm" className="h-8 px-3 text-sm" onClick={onMarkSpam}>
          {t('email.markAsSpam')}
        </Button>
        <Button variant="ghost" size="sm" className="h-8 px-3 text-sm" onClick={onMarkUnread}>
          {t('email.markAsUnread')}
        </Button>

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* 이동 드롭다운 */}
        <Popover open={isMovePopoverOpen} onOpenChange={setIsMovePopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-3 text-sm">
              {t('email.move')}
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0">
            <div className="p-2 border-b">
              <p className="text-sm font-medium">{t('email.selectMoveFolder')}</p>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {moveFolders.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  {t('email.noSubFolders')}
                </div>
              ) : (
                moveFolders.map((folder) => (
                  <div
                    key={folder.path}
                    onClick={() => setSelectedMoveFolder(folder.path)}
                    className={cn(
                      'px-3 py-2 text-sm cursor-pointer hover:bg-muted/50',
                      selectedMoveFolder === folder.path && 'bg-primary/10 text-primary'
                    )}
                  >
                    {folder.name}
                  </div>
                ))
              )}
            </div>
            <div className="p-2 border-t">
              <div className="flex items-center gap-1 mb-2">
                <input
                  type="text"
                  placeholder={t('email.newFolderName')}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="flex-1 h-7 px-2 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleCreateFolder()
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim() || isCreatingFolder}
                >
                  {isCreatingFolder ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={handleMove}
                  disabled={!selectedMoveFolder || isMoving}
                >
                  {t('email.move')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={handleMoveAndCreateRule}
                  disabled={!selectedMoveFolder || isMoving}
                >
                  {t('email.continueMove')}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* 더보기 드롭다운 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-3 text-sm">
              {t('common.more')}
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48 p-1">
            <button
              className="flex items-center w-full px-2 py-1.5 text-sm rounded hover:bg-muted"
              onClick={onSaveAsEml}
            >
              <Download className="h-4 w-4 mr-2" />
              {t('email.saveToPC')}
            </button>
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        {/* 오른쪽 메뉴 */}
        <Button variant="ghost" size="sm" className="h-8 px-3 text-sm" onClick={onBack}>
          {t('email.list')}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onPrev}
          disabled={currentIndex <= 1}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onNext}
          disabled={currentIndex >= totalCount}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      {/* Email content */}
      <div className="flex-1 overflow-auto" ref={contentRef}>
        <div className="p-6">
          {/* Subject Section */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <button onClick={handleToggleStar}>
                <Star
                  className={cn(
                    'h-5 w-5',
                    isStarred
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-muted-foreground hover:text-yellow-400'
                  )}
                />
              </button>
              <h1 className="text-lg font-medium">
                {email.subject}
                {email.hasExternalLink && (
                  <ExternalLink className="inline-block ml-2 h-4 w-4 text-muted-foreground" />
                )}
              </h1>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-sm"
                onClick={handlePrintPreview}
              >
                <Eye className="h-4 w-4" />
                {t('email.printPreview')}
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-sm" onClick={handlePrint}>
                <Printer className="h-4 w-4" />
                {t('email.print')}
              </Button>
              <TranslationToggle
                accountEmail={currentAccount || ''}
                emailContent={email.content || email.html || ''}
                onTranslated={(translated) => setTranslatedContent(translated)}
                onShowOriginal={() => setTranslatedContent(null)}
              />
            </div>
          </div>

          {/* Sender Info Section */}
          <div className="mb-4 text-sm border-b pb-4">
            <div className="flex items-center gap-2 mb-2">
              <button
                className="flex items-center gap-2"
                onClick={() => setIsHeaderExpanded(!isHeaderExpanded)}
              >
                <ChevronUp
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    !isHeaderExpanded && 'rotate-180'
                  )}
                />
                <span className="text-muted-foreground">{t('email.from')}</span>
              </button>
              <button
                className="bg-muted px-2 py-0.5 rounded text-sm hover:bg-muted/80 transition-colors cursor-pointer"
                onClick={handleSenderClick}
              >
                {email.sender} &lt;{email.senderEmail}&gt;
              </button>
              {isSenderVip && (
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">
                  VIP
                </span>
              )}
              {/* 이메일 인증 상태 배지 */}
              {emailAuthStatus && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1 px-2 py-0.5 rounded text-xs hover:bg-muted">
                      {emailAuthStatus.summary.status === 'verified' ? (
                        <ShieldCheck className="h-4 w-4 text-green-600" />
                      ) : emailAuthStatus.summary.status === 'failed' ? (
                        <ShieldAlert className="h-4 w-4 text-red-600" />
                      ) : emailAuthStatus.summary.status === 'partial' ? (
                        <ShieldAlert className="h-4 w-4 text-yellow-600" />
                      ) : (
                        <ShieldQuestion className="h-4 w-4 text-gray-400" />
                      )}
                      <span
                        className={cn(
                          'font-medium',
                          emailAuthStatus.summary.status === 'verified' && 'text-green-700',
                          emailAuthStatus.summary.status === 'failed' && 'text-red-700',
                          emailAuthStatus.summary.status === 'partial' && 'text-yellow-700',
                          emailAuthStatus.summary.status === 'unknown' && 'text-gray-500'
                        )}
                      >
                        {t(
                          `security.auth${emailAuthStatus.summary.status.charAt(0).toUpperCase() + emailAuthStatus.summary.status.slice(1)}`
                        )}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium mb-2">{t('security.emailAuthStatus')}</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">SPF</span>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-xs font-medium',
                            emailAuthStatus.spf === 'pass' && 'bg-green-100 text-green-700',
                            emailAuthStatus.spf === 'fail' && 'bg-red-100 text-red-700',
                            emailAuthStatus.spf === 'softfail' && 'bg-yellow-100 text-yellow-700',
                            !['pass', 'fail', 'softfail'].includes(emailAuthStatus.spf) &&
                              'bg-gray-100 text-gray-600'
                          )}
                        >
                          {emailAuthStatus.spf}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">DKIM</span>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-xs font-medium',
                            emailAuthStatus.dkim === 'pass' && 'bg-green-100 text-green-700',
                            emailAuthStatus.dkim === 'fail' && 'bg-red-100 text-red-700',
                            !['pass', 'fail'].includes(emailAuthStatus.dkim) &&
                              'bg-gray-100 text-gray-600'
                          )}
                        >
                          {emailAuthStatus.dkim}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">DMARC</span>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-xs font-medium',
                            emailAuthStatus.dmarc === 'pass' && 'bg-green-100 text-green-700',
                            emailAuthStatus.dmarc === 'fail' && 'bg-red-100 text-red-700',
                            !['pass', 'fail'].includes(emailAuthStatus.dmarc) &&
                              'bg-gray-100 text-gray-600'
                          )}
                        >
                          {emailAuthStatus.dmarc}
                        </span>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            {isHeaderExpanded && (
              <>
                <div className="flex items-center gap-2 mb-1 ml-6">
                  <span className="text-muted-foreground">{t('email.to')}</span>
                  <span className="bg-muted px-2 py-0.5 rounded text-sm">{email.recipient}</span>
                </div>
                <div className="ml-6 text-muted-foreground">{email.date}</div>
              </>
            )}
          </div>

          {/* 발신자 팝업 */}
          <SenderPopup
            accountEmail={currentAccount || ''}
            senderName={email.sender}
            senderEmail={email.senderEmail}
            isVip={isSenderVip}
            isOpen={isSenderPopupOpen}
            anchorPosition={senderPopupPosition}
            onClose={() => setIsSenderPopupOpen(false)}
            onToggleVip={(isVip) => {
              onToggleSenderVip?.(email.senderEmail, isVip)
            }}
            onCompose={() => {
              setIsSenderPopupOpen(false)
              onComposeToSender?.(email.senderEmail, email.sender)
            }}
            onAddToContacts={(data) => {
              onAddSenderToContacts?.(data)
            }}
            onCopyEmail={() => {
              // 복사는 SenderPopup 내부에서 처리
            }}
            onBlock={() => {
              setIsSenderPopupOpen(false)
              onBlockSender?.(email.senderEmail)
            }}
            onViewConversation={() => {
              setIsSenderPopupOpen(false)
              onViewConversation?.(email.senderEmail)
            }}
            onSearchBySender={() => {
              setIsSenderPopupOpen(false)
              onSearchBySender?.(email.senderEmail)
            }}
            onSearchByRecipient={() => {
              setIsSenderPopupOpen(false)
              onSearchByRecipient?.(email.senderEmail)
            }}
            onAutoClassify={() => {
              setIsSenderPopupOpen(false)
              onAutoClassifySender?.(email.senderEmail)
            }}
            onDeleteAllFromSender={() => {
              setIsSenderPopupOpen(false)
              onDeleteAllFromSender?.(email.senderEmail)
            }}
            onHighlightSender={() => {
              setIsSenderPopupOpen(false)
              onHighlightSender?.(email.senderEmail)
            }}
          />

          {/* Attachments Section */}
          {email.attachments && email.attachments.length > 0 && (
            <div className="mb-4 border rounded-lg overflow-hidden">
              {/* 첨부파일 헤더 */}
              <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
                <div className="flex items-center gap-3">
                  <button
                    className="flex items-center gap-2"
                    onClick={() => setIsAttachmentsExpanded(!isAttachmentsExpanded)}
                  >
                    <ChevronUp
                      className={cn(
                        'h-4 w-4 text-muted-foreground transition-transform',
                        !isAttachmentsExpanded && 'rotate-180'
                      )}
                    />
                    <span className="text-sm font-medium">
                      {t('email.attachmentsCount', { count: email.attachments.length })}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {formatSize(getTotalAttachmentSize())}
                    </span>
                  </button>
                  <button
                    className="text-sm text-primary hover:underline"
                    onClick={handleDownloadAll}
                  >
                    {t('email.downloadAll')}
                  </button>
                </div>
              </div>

              {/* 첨부파일 목록 */}
              {isAttachmentsExpanded && (
                <div className="p-3">
                  {email.attachments.map((att, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted/50 group"
                    >
                      <div
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => handleDownloadAttachment(att)}
                      >
                        {getFileIcon(att.contentType)}
                        <div>
                          <span className="text-sm text-primary hover:underline">
                            {att.filename}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {formatSize(att.size)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Summary */}
          <EmailAISummary
            accountEmail={currentAccount || ''}
            emailContent={email.content || email.html || ''}
          />

          {/* 외부 이미지 차단 배너 */}
          {blockExternalImages && hasBlockedImages && !loadImagesForThisEmail && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <ImageOff className="h-4 w-4 text-yellow-600 flex-shrink-0" />
              <span className="text-sm text-yellow-800 flex-1">{t('security.imagesBlocked')}</span>
              <Button variant="outline" size="sm" onClick={() => setLoadImagesForThisEmail(true)}>
                {t('security.loadImages')}
              </Button>
            </div>
          )}

          {/* Email Body */}
          <div className="prose prose-sm max-w-none mb-8">
            {translatedContent ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{translatedContent}</div>
            ) : (
              renderContent()
            )}
          </div>

          {/* AI Q&A Panel */}
          <EmailQAPanel
            accountEmail={currentAccount || ''}
            emailId={email.id}
            emailContent={email.content || email.html || ''}
            emailSubject={email.subject}
            className="mb-4"
          />

          {/* Related Emails Section */}
          {relatedEmails.length > 0 && (
            <div className="border-t pt-4">
              {relatedEmails.map((related) => (
                <button
                  key={related.id}
                  className="flex items-center w-full px-2 py-3 text-sm hover:bg-muted/50 rounded border-b last:border-b-0"
                  onClick={() => onRelatedEmailClick?.(related.id)}
                >
                  <ChevronDown className="h-4 w-4 text-muted-foreground mr-2" />
                  <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center mr-3">
                    <MailOpen className="h-3 w-3" />
                  </span>
                  <span className="font-medium w-32 truncate text-left">{related.sender}</span>
                  <span className="flex-1 truncate text-left text-muted-foreground">
                    {related.subject}
                    {related.hasExternalLink && (
                      <ExternalLink className="inline-block ml-1 h-3 w-3" />
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground ml-4">{related.date}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Scroll to Top Button */}
      <button
        className="fixed bottom-6 right-6 w-10 h-10 bg-background border rounded-full shadow-lg flex items-center justify-center hover:bg-muted transition-colors"
        onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <ArrowUp className="h-5 w-5" />
      </button>

      {/* PGP/S-MIME 복호화 암호 입력 다이얼로그 */}
      <Dialog open={showPassphraseDialog} onOpenChange={setShowPassphraseDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('email.decryptTitle', { type: encryptionType === 'pgp' ? 'PGP' : 'S/MIME' })}
            </DialogTitle>
            <DialogDescription>{t('email.decryptDesc')}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="password"
              placeholder={t('email.passphrasePlaceholder')}
              value={decryptPassphrase}
              onChange={(e) => setDecryptPassphrase(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && decryptPassphrase) {
                  handleDecryptWithPassphrase()
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPassphraseDialog(false)
                setDecryptPassphrase('')
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleDecryptWithPassphrase} disabled={!decryptPassphrase}>
              {t('email.decrypt')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 인쇄 미리보기 다이얼로그 */}
      <Dialog open={isPrintPreviewOpen} onOpenChange={setIsPrintPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('email.printPreview')}</DialogTitle>
            <DialogDescription>{t('email.printPreviewDesc')}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-md bg-gray-100 p-4">
            <div
              className="bg-white shadow-lg mx-auto"
              style={{ maxWidth: '800px' }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(printPreviewContent) }}
            />
          </div>
          <DialogFooter className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsPrintPreviewOpen(false)}>
              {t('common.close')}
            </Button>
            <Button onClick={handlePrintFromPreview}>
              <Printer className="h-4 w-4 mr-2" />
              {t('email.print')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 위험한 첨부파일 경고 다이얼로그 */}
      <Dialog open={showDangerousFileWarning} onOpenChange={setShowDangerousFileWarning}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="h-5 w-5" />
              {t('security.dangerousFile')}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm font-medium mb-2">{pendingAttachment?.filename}</p>
            <p className="text-sm text-muted-foreground">{attachmentRiskInfo?.message}</p>
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-800">{t('security.dangerousFileWarning')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDangerousFileWarning(false)
                setPendingAttachment(null)
                setAttachmentRiskInfo(null)
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleConfirmDangerousDownload}>
              {t('security.downloadAnyway')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 의심스러운 URL 경고 다이얼로그 */}
      <Dialog open={showUrlWarning} onOpenChange={setShowUrlWarning}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle
                className={
                  urlAnalysis?.riskLevel === 'dangerous' ? 'text-red-600' : 'text-yellow-600'
                }
              />
              {t('security.suspiciousLink')}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground mb-1">{t('security.linkDestination')}</p>
              <p className="text-sm font-mono break-all">{pendingUrl}</p>
            </div>

            {urlAnalysis?.isPunycode && urlAnalysis.decodedDomain && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-sm font-medium text-yellow-800">
                  {t('security.internationalizedDomain')}
                </p>
                <p className="text-sm text-yellow-700">
                  {t('security.actualDomain')}: {urlAnalysis.decodedDomain}
                </p>
              </div>
            )}

            {urlAnalysis?.warnings.map((warning, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowUrlWarning(false)
                setPendingUrl('')
                setUrlAnalysis(null)
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant={urlAnalysis?.riskLevel === 'dangerous' ? 'destructive' : 'default'}
              onClick={handleConfirmOpenUrl}
            >
              {t('security.openAnyway')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
})
