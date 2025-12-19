import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ChevronUp,
  Paperclip,
  Send,
  Loader2,
  X,
  File,
  FileText,
  FileImage,
  FileArchive,
  HelpCircle,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Key,
  FileKey,
  FileStack,
  Cloud,
  ExternalLink
} from 'lucide-react'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from './ui/dialog'
import { Input } from './ui/input'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { cn } from '@renderer/lib/utils'
import { AddressBookDialog } from './AddressBookDialog'
import { SendSafetyModal, SafetyWarning, performSafetyCheck } from './SendSafetyModal'
import { AIReplyDialog } from './AIReplyDialog'
import { ToneDropdown } from './ToneDropdown'
import { LargeFileUploadDialog } from './LargeFileUploadDialog'

// 대용량 첨부 기준 (10MB)
const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024

interface ComposeEmailProps {
  accountEmail: string
  onClose?: () => void
  onSent?: () => void
  onNavigateToAddressBook?: () => void
  // Reply/Forward initial values
  initialTo?: string
  initialCc?: string
  initialSubject?: string
  initialContent?: string
  mode?: 'compose' | 'reply' | 'replyAll' | 'forward' | 'toSelf'
}

interface EmailTag {
  id: string
  email: string
  isValid: boolean
}

interface AttachmentFile {
  id: string
  name: string
  path: string
  size: number
  type: string
  // 대용량 파일 클라우드 업로드 정보
  isCloudUpload?: boolean
  cloudUrl?: string
  cloudProvider?: string
  expiresAt?: string
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  content: string
}

// 이메일 유효성 검사 정규식
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// "Name <email>" 형식에서 이메일 추출
function extractEmail(input: string): string {
  const match = input.match(/<([^>]+)>/)
  if (match) {
    return match[1].trim()
  }
  return input.trim()
}

// 파일 크기 포맷팅
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// 파일 아이콘 선택
function getFileIcon(type: string) {
  if (type.startsWith('image/')) return <FileImage className="h-4 w-4" />
  if (type.includes('zip') || type.includes('rar') || type.includes('7z'))
    return <FileArchive className="h-4 w-4" />
  if (type.includes('text') || type.includes('document')) return <FileText className="h-4 w-4" />
  return <File className="h-4 w-4" />
}

export function ComposeEmail({
  accountEmail,
  onClose,
  onSent,
  onNavigateToAddressBook,
  initialTo = '',
  initialCc = '',
  initialSubject = '',
  initialContent = '',
  mode = 'compose'
}: ComposeEmailProps): React.ReactElement {
  const { t } = useTranslation()
  // 참조 영역 확장 (숨은참조, 보내는 이름 포함)
  const [showCcExpanded, setShowCcExpanded] = React.useState(false)
  const [showAttachment, setShowAttachment] = React.useState(true)

  // 보내는 이름 상태
  const [senderName, setSenderName] = React.useState('')

  // 이메일 태그 상태
  const [toTags, setToTags] = React.useState<EmailTag[]>(() => {
    if (!initialTo) return []
    return initialTo
      .split(/[,;]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const email = extractEmail(entry).toLowerCase()
        return {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          email,
          isValid: EMAIL_REGEX.test(email)
        }
      })
  })
  const [ccTags, setCcTags] = React.useState<EmailTag[]>(() => {
    if (!initialCc) return []
    return initialCc
      .split(/[,;]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const email = extractEmail(entry).toLowerCase()
        return {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          email,
          isValid: EMAIL_REGEX.test(email)
        }
      })
  })
  const [bccTags, setBccTags] = React.useState<EmailTag[]>([])

  const [subject, setSubject] = React.useState(initialSubject)
  const [isImportant, setIsImportant] = React.useState(false)
  const [isSending, setIsSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // 첨부 파일 상태
  const [attachments, setAttachments] = React.useState<AttachmentFile[]>([])
  const [isDragging, setIsDragging] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // 대용량 첨부파일 상태
  const [showLargeFileDialog, setShowLargeFileDialog] = React.useState(false)
  const [pendingLargeFiles, setPendingLargeFiles] = React.useState<AttachmentFile[]>([])

  // 에디터 관련 상태
  const quillRef = React.useRef<ReactQuill>(null)
  const [editorContent, setEditorContent] = React.useState(initialContent || '')
  const [signatureLoaded, setSignatureLoaded] = React.useState(false)

  // 미리보기 다이얼로그 상태
  const [showPreview, setShowPreview] = React.useState(false)

  // 개인별 전송 옵션 (디폴트: true)
  const [sendIndividually, setSendIndividually] = React.useState(true)

  // 주소록 다이얼로그 상태
  const [showAddressBook, setShowAddressBook] = React.useState(false)

  // 암호화 상태 (Signal, PGP, S/MIME)
  type EncryptionMethod = 'none' | 'signal' | 'pgp' | 'smime'
  const [encryptionMethod, setEncryptionMethod] = React.useState<EncryptionMethod>('none')
  const [availableEncryption, setAvailableEncryption] = React.useState<EncryptionMethod[]>(['none'])
  const [recipientEncryptionStatus, setRecipientEncryptionStatus] = React.useState<
    Record<string, { signal: boolean; pgp: boolean; smime: boolean }>
  >({})
  const [isCheckingEncryption, setIsCheckingEncryption] = React.useState(false)
  const [showPassphraseDialog, setShowPassphraseDialog] = React.useState(false)
  const [encryptionPassphrase, setEncryptionPassphrase] = React.useState('')

  // AI Reply Dialog 상태
  const [showAIReplyDialog, setShowAIReplyDialog] = React.useState(false)

  // 템플릿 상태
  const [templates, setTemplates] = React.useState<EmailTemplate[]>([])
  const [showTemplatePopover, setShowTemplatePopover] = React.useState(false)

  // 안전 검사 모달 상태
  const [showSafetyModal, setShowSafetyModal] = React.useState(false)
  const [safetyWarnings, setSafetyWarnings] = React.useState<SafetyWarning[]>([])

  // Quill 에디터 모듈 설정
  const quillModules = React.useMemo(
    () => ({
      toolbar: [
        [{ font: [] }],
        [{ size: ['small', false, 'large', 'huge'] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ align: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ indent: '-1' }, { indent: '+1' }],
        ['link', 'image'],
        ['clean']
      ]
    }),
    []
  )

  const quillFormats = [
    'font',
    'size',
    'bold',
    'italic',
    'underline',
    'strike',
    'color',
    'background',
    'align',
    'list',
    'indent',
    'link',
    'image'
  ]

  const getModeTitle = (): string => {
    switch (mode) {
      case 'reply':
        return t('compose.replyTitle')
      case 'replyAll':
        return t('compose.replyAllTitle')
      case 'forward':
        return t('compose.forwardTitle')
      case 'toSelf':
        return t('sidebar.composeToSelf')
      default:
        return t('compose.title')
    }
  }

  // 암호화 가용성 확인 (Signal, PGP, S/MIME)
  React.useEffect(() => {
    const checkEncryptionAvailability = async () => {
      try {
        const available: EncryptionMethod[] = ['none']

        // Signal Protocol 확인
        const signalRegistered = await window.electron.ipcRenderer.invoke(
          'e2e-is-registered',
          accountEmail
        )
        if (signalRegistered) available.push('signal')

        // PGP 확인
        const pgpSetup = await window.electron.ipcRenderer.invoke('pgp-is-setup', accountEmail)
        if (pgpSetup) available.push('pgp')

        // S/MIME 확인
        const smimeSetup = await window.electron.ipcRenderer.invoke('smime-is-setup', accountEmail)
        if (smimeSetup) available.push('smime')

        setAvailableEncryption(available)
      } catch (err) {
        console.error('Failed to check encryption availability:', err)
        setAvailableEncryption(['none'])
      }
    }

    checkEncryptionAvailability()
  }, [accountEmail])

  // 수신자가 변경될 때 암호화 키 존재 여부 확인
  React.useEffect(() => {
    const checkRecipientEncryption = async () => {
      if (availableEncryption.length <= 1 || mode === 'toSelf') return

      setIsCheckingEncryption(true)
      const validEmails = toTags.filter((t) => t.isValid).map((t) => t.email)

      const statusMap: Record<string, { signal: boolean; pgp: boolean; smime: boolean }> = {}
      for (const email of validEmails) {
        statusMap[email] = { signal: false, pgp: false, smime: false }

        // Signal 키 확인
        if (availableEncryption.includes('signal')) {
          try {
            const result = await window.electron.ipcRenderer.invoke(
              'e2e-fetch-key-bundle',
              accountEmail,
              email
            )
            statusMap[email].signal = result.success
          } catch {
            statusMap[email].signal = false
          }
        }

        // PGP 키 확인
        if (availableEncryption.includes('pgp')) {
          try {
            const result = await window.electron.ipcRenderer.invoke(
              'pgp-get-contact-key',
              accountEmail,
              email
            )
            statusMap[email].pgp = result.success
          } catch {
            statusMap[email].pgp = false
          }
        }

        // S/MIME 인증서 확인
        if (availableEncryption.includes('smime')) {
          try {
            const result = await window.electron.ipcRenderer.invoke(
              'smime-get-contact-cert',
              accountEmail,
              email
            )
            statusMap[email].smime = result.success
          } catch {
            statusMap[email].smime = false
          }
        }
      }

      setRecipientEncryptionStatus(statusMap)
      setIsCheckingEncryption(false)

      // 모든 수신자가 특정 암호화 방법을 지원하면 자동 선택
      if (validEmails.length > 0) {
        const allSignal =
          availableEncryption.includes('signal') &&
          validEmails.every((email) => statusMap[email]?.signal)
        const allPgp =
          availableEncryption.includes('pgp') && validEmails.every((email) => statusMap[email]?.pgp)
        const allSmime =
          availableEncryption.includes('smime') &&
          validEmails.every((email) => statusMap[email]?.smime)

        if (allSignal && encryptionMethod === 'none') {
          setEncryptionMethod('signal')
        } else if (allPgp && encryptionMethod === 'none') {
          setEncryptionMethod('pgp')
        } else if (allSmime && encryptionMethod === 'none') {
          setEncryptionMethod('smime')
        }
      }
    }

    const timer = setTimeout(checkRecipientEncryption, 500)
    return () => clearTimeout(timer)
  }, [toTags, availableEncryption, accountEmail, mode, encryptionMethod])

  // 템플릿 로드
  React.useEffect(() => {
    const loadTemplates = async () => {
      try {
        const result = await window.electron.ipcRenderer.invoke('template-get-all')
        setTemplates(result || [])
      } catch (error) {
        console.error('Failed to load templates:', error)
      }
    }
    loadTemplates()
  }, [])

  // 템플릿 적용
  const applyTemplate = (template: EmailTemplate) => {
    if (template.subject) {
      setSubject(template.subject)
    }
    if (template.content) {
      // 템플릿 내용의 줄바꿈을 <br> 태그로 변환
      const htmlContent = template.content.replace(/\n/g, '<br>')
      setEditorContent(htmlContent)
    }
    setShowTemplatePopover(false)
  }

  // 서명 로드 및 적용
  React.useEffect(() => {
    if (signatureLoaded) return

    const loadSignature = async () => {
      try {
        // 서명 설정 가져오기
        const settings = await window.electron.ipcRenderer.invoke(
          'get-signature-settings',
          accountEmail
        )

        if (!settings.enabled || !settings.defaultSignatureId) {
          setSignatureLoaded(true)
          return
        }

        // mode에 따라 서명 포함 여부 결정
        const shouldIncludeSignature =
          mode === 'compose' ||
          mode === 'toSelf' ||
          (mode === 'reply' && settings.includeInReply) ||
          (mode === 'replyAll' && settings.includeInReply) ||
          (mode === 'forward' && settings.includeInForward)

        if (!shouldIncludeSignature) {
          setSignatureLoaded(true)
          return
        }

        // 기본 서명 찾기
        const defaultSignature = settings.signatures.find(
          (s: { id: string }) => s.id === settings.defaultSignatureId
        )

        if (defaultSignature) {
          // 서명 내용의 줄바꿈을 <br> 태그로 변환
          const signatureContentHtml = defaultSignature.content.replace(/\n/g, '<br>')
          // 서명을 content 앞에 추가 (줄바꿈 포함)
          const signatureHtml = `<br><br>--<br>${signatureContentHtml}`

          if (initialContent) {
            // 답장/전달: 서명 + 원본 내용
            setEditorContent(signatureHtml + '<br><br>' + initialContent)
          } else {
            // 새 메일: 서명만
            setEditorContent(signatureHtml)
          }
        }

        setSignatureLoaded(true)
      } catch (err) {
        console.error('Failed to load signature:', err)
        setSignatureLoaded(true)
      }
    }

    loadSignature()
  }, [accountEmail, mode, initialContent, signatureLoaded])

  // 주소록에서 선택한 수신자 적용
  const handleAddressBookConfirm = (
    to: { id: string; name: string; email: string }[],
    cc: { id: string; name: string; email: string }[],
    bcc: { id: string; name: string; email: string }[]
  ): void => {
    // 받는 사람 업데이트
    const newToTags: EmailTag[] = to.map((r) => ({
      id: r.id,
      email: r.email,
      isValid: EMAIL_REGEX.test(r.email)
    }))
    setToTags(newToTags)

    // 참조 업데이트
    const newCcTags: EmailTag[] = cc.map((r) => ({
      id: r.id,
      email: r.email,
      isValid: EMAIL_REGEX.test(r.email)
    }))
    setCcTags(newCcTags)

    // 숨은참조 업데이트
    const newBccTags: EmailTag[] = bcc.map((r) => ({
      id: r.id,
      email: r.email,
      isValid: EMAIL_REGEX.test(r.email)
    }))
    setBccTags(newBccTags)

    // 참조나 숨은참조가 있으면 확장 영역 표시
    if (cc.length > 0 || bcc.length > 0) {
      setShowCcExpanded(true)
    }
  }

  // 현재 수신자 목록을 주소록 다이얼로그 형식으로 변환
  const getInitialRecipients = (): {
    to: { id: string; name: string; email: string }[]
    cc: { id: string; name: string; email: string }[]
    bcc: { id: string; name: string; email: string }[]
  } => {
    return {
      to: toTags.map((t) => ({ id: t.id, name: '', email: t.email })),
      cc: ccTags.map((t) => ({ id: t.id, name: '', email: t.email })),
      bcc: bccTags.map((t) => ({ id: t.id, name: '', email: t.email }))
    }
  }

  // 에디터 내용 변경 핸들러
  const handleEditorChange = (value: string): void => {
    setEditorContent(value)
  }

  // 에디터에서 텍스트만 추출
  const getPlainText = (): string => {
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = editorContent
    return tempDiv.textContent || tempDiv.innerText || ''
  }

  // 첨부파일 추가
  const handleAddAttachments = async (): Promise<void> => {
    try {
      const result = await window.electron.ipcRenderer.invoke('select-files')
      if (result.success && result.files) {
        const newAttachments: AttachmentFile[] = result.files.map(
          (file: { name: string; path: string; size: number; type: string }) => ({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: file.name,
            path: file.path,
            size: file.size,
            type: file.type || 'application/octet-stream'
          })
        )

        // 대용량 파일과 일반 파일 분리
        const largeFiles = newAttachments.filter((f) => f.size > LARGE_FILE_THRESHOLD)
        const normalFiles = newAttachments.filter((f) => f.size <= LARGE_FILE_THRESHOLD)

        // 일반 파일은 바로 추가
        if (normalFiles.length > 0) {
          setAttachments((prev) => [...prev, ...normalFiles])
        }

        // 대용량 파일이 있으면 업로드 다이얼로그 표시
        if (largeFiles.length > 0) {
          setPendingLargeFiles(largeFiles)
          setShowLargeFileDialog(true)
        }

        setShowAttachment(true)
      }
    } catch (err) {
      console.error('Failed to select files:', err)
    }
  }

  // 첨부파일 제거
  const handleRemoveAttachment = (id: string): void => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  // 드래그 앤 드롭 처리
  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      const newAttachments: AttachmentFile[] = files.map((file) => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: file.name,
        path: (file as { path?: string }).path || file.name,
        size: file.size,
        type: file.type || 'application/octet-stream'
      }))

      // 대용량 파일과 일반 파일 분리
      const largeFiles = newAttachments.filter((f) => f.size > LARGE_FILE_THRESHOLD)
      const normalFiles = newAttachments.filter((f) => f.size <= LARGE_FILE_THRESHOLD)

      // 일반 파일은 바로 추가
      if (normalFiles.length > 0) {
        setAttachments((prev) => [...prev, ...normalFiles])
      }

      // 대용량 파일이 있으면 업로드 다이얼로그 표시
      if (largeFiles.length > 0) {
        setPendingLargeFiles(largeFiles)
        setShowLargeFileDialog(true)
      }

      setShowAttachment(true)
    }
  }

  // 대용량 파일 업로드 완료 핸들러
  const handleLargeFileUploadComplete = (
    results: {
      fileId: string
      success: boolean
      provider: string
      fileName: string
      fileSize: number
      shareUrl?: string
      error?: string
      expiresAt?: string
    }[]
  ): void => {
    // 성공적으로 업로드된 파일들을 클라우드 첨부로 추가
    const successfulUploads = results.filter((r) => r.success && r.shareUrl)

    if (successfulUploads.length > 0) {
      // 클라우드 업로드 파일을 첨부 목록에 추가
      const cloudAttachments: AttachmentFile[] = successfulUploads.map((r) => {
        const pendingFile = pendingLargeFiles.find((f) => f.id === r.fileId)
        return {
          id: r.fileId,
          name: r.fileName,
          path: '',
          size: r.fileSize,
          type: pendingFile?.type || 'application/octet-stream',
          isCloudUpload: true,
          cloudUrl: r.shareUrl,
          cloudProvider: r.provider,
          expiresAt: r.expiresAt
        }
      })

      setAttachments((prev) => [...prev, ...cloudAttachments])

      // 이메일 본문에 다운로드 링크 추가
      const linksHtml = successfulUploads
        .map(
          (r) =>
            `<p><a href="${r.shareUrl}" target="_blank">${r.fileName}</a> (${formatFileSize(r.fileSize)})</p>`
        )
        .join('')

      const cloudLinksBlock = `
        <br><br>
        <div style="padding: 12px; background: #f5f5f5; border-radius: 8px; border: 1px solid #e0e0e0;">
          <p style="margin: 0 0 8px 0; font-weight: bold; color: #333;">${t('largeFile.downloadLinks')}</p>
          ${linksHtml}
        </div>
      `

      setEditorContent((prev) => prev + cloudLinksBlock)
    }

    // 실패한 파일이 있으면 알림
    const failedUploads = results.filter((r) => !r.success)
    if (failedUploads.length > 0) {
      const failedNames = failedUploads.map((r) => r.fileName).join(', ')
      setError(t('largeFile.uploadFailed', { files: failedNames }))
    }

    // 상태 초기화
    setPendingLargeFiles([])
    setShowLargeFileDialog(false)
  }

  // 실제 발송 로직 (안전 검사 후 또는 경고 무시 시 호출)
  const proceedWithSend = async (): Promise<void> => {
    console.log('[ComposeEmail] proceedWithSend called')

    setShowSafetyModal(false)
    setError(null)
    setIsSending(true)

    try {
      // 나에게 쓰기 모드: 자신에게 발송, 일반 모드: 입력된 수신자에게 발송
      const toList =
        mode === 'toSelf'
          ? [accountEmail]
          : toTags.filter((tag) => tag.isValid).map((tag) => tag.email)
      const ccList =
        mode === 'toSelf' ? [] : ccTags.filter((tag) => tag.isValid).map((tag) => tag.email)
      const bccList =
        mode === 'toSelf' ? [] : bccTags.filter((tag) => tag.isValid).map((tag) => tag.email)

      // 에디터 내용 가져오기
      let htmlContent = editorContent
      let textContent = getPlainText()

      // 암호화 헤더
      let encryptionHeaders: Record<string, string> = {}

      // 암호화 처리
      if (encryptionMethod !== 'none' && mode !== 'toSelf') {
        console.log('[ComposeEmail] Encryption enabled:', encryptionMethod)

        try {
          const contentToEncrypt = JSON.stringify({
            html: htmlContent,
            text: textContent
          })

          if (encryptionMethod === 'signal') {
            // Signal Protocol 암호화 (1명만 지원)
            if (toList.length !== 1) {
              const proceed = confirm(t('compose.signalSingleRecipient'))
              if (!proceed) {
                setIsSending(false)
                return
              }
            } else {
              const recipientEmail = toList[0]
              const encryptResult = await window.electron.ipcRenderer.invoke(
                'e2e-encrypt',
                accountEmail,
                recipientEmail,
                contentToEncrypt
              )

              if (encryptResult.success && encryptResult.encryptedPayload) {
                htmlContent = `<div style="padding: 20px; background: #f5f5f5; border-radius: 8px; text-align: center;">
                  <p style="margin: 0 0 10px 0; font-weight: bold;">${t('compose.encryptedSignalTitle')}</p>
                  <p style="margin: 0; font-size: 12px; color: #666;">${t('compose.encryptedSignalDesc')}</p>
                </div>
                <pre style="display: none;">${encryptResult.encryptedPayload}</pre>`
                textContent = `${t('compose.encryptedMessage')}\n\n${encryptResult.encryptedPayload}`
                encryptionHeaders = await window.electron.ipcRenderer.invoke('e2e-get-headers')
                console.log('[ComposeEmail] Signal encryption successful')
              } else {
                throw new Error(encryptResult.error || t('compose.signalEncryptFailed'))
              }
            }
          } else if (encryptionMethod === 'pgp') {
            // PGP 암호화 (다중 수신자 지원)
            const encryptResult = await window.electron.ipcRenderer.invoke(
              'pgp-encrypt',
              accountEmail,
              toList,
              textContent,
              !!encryptionPassphrase, // sign if passphrase provided
              encryptionPassphrase || undefined
            )

            if (encryptResult.success && encryptResult.encrypted) {
              htmlContent = `<div style="padding: 20px; background: #e8f5e9; border-radius: 8px; text-align: center;">
                <p style="margin: 0 0 10px 0; font-weight: bold;">${t('compose.encryptedPgpTitle')}</p>
                <p style="margin: 0; font-size: 12px; color: #666;">${t('compose.encryptedPgpDesc')}</p>
              </div>
              <pre style="white-space: pre-wrap; font-family: monospace; font-size: 11px; background: #f5f5f5; padding: 10px; border-radius: 4px;">${encryptResult.encrypted}</pre>`
              textContent = encryptResult.encrypted
              encryptionHeaders['X-Encryption-Method'] = 'PGP'
              console.log('[ComposeEmail] PGP encryption successful')
            } else {
              throw new Error(encryptResult.error || t('compose.pgpEncryptFailed'))
            }
          } else if (encryptionMethod === 'smime') {
            // S/MIME 암호화 (다중 수신자 지원)
            const encryptResult = await window.electron.ipcRenderer.invoke(
              'smime-encrypt',
              accountEmail,
              toList,
              textContent,
              !!encryptionPassphrase, // sign if passphrase provided
              encryptionPassphrase || undefined
            )

            if (encryptResult.success && encryptResult.encrypted) {
              htmlContent = `<div style="padding: 20px; background: #e3f2fd; border-radius: 8px; text-align: center;">
                <p style="margin: 0 0 10px 0; font-weight: bold;">${t('compose.encryptedSmimeTitle')}</p>
                <p style="margin: 0; font-size: 12px; color: #666;">${t('compose.encryptedSmimeDesc')}</p>
              </div>
              <pre style="white-space: pre-wrap; font-family: monospace; font-size: 11px; background: #f5f5f5; padding: 10px; border-radius: 4px;">${encryptResult.encrypted}</pre>`
              textContent = encryptResult.encrypted
              encryptionHeaders['X-Encryption-Method'] = 'S/MIME'
              console.log('[ComposeEmail] S/MIME encryption successful')
            } else {
              throw new Error(encryptResult.error || t('compose.smimeEncryptFailed'))
            }
          }
        } catch (encryptError) {
          console.error('[ComposeEmail] Encryption error:', encryptError)
          const errorMsg =
            encryptError instanceof Error ? encryptError.message : t('compose.unknownError')
          const proceed = confirm(t('compose.encryptFailedConfirm', { error: errorMsg }))
          if (!proceed) {
            setIsSending(false)
            return
          }
        }
      }

      const baseEmailData = {
        subject: isImportant ? `${t('compose.importantPrefix')} ${subject}` : subject,
        text: textContent,
        html: htmlContent,
        headers: Object.keys(encryptionHeaders).length > 0 ? encryptionHeaders : undefined,
        attachments:
          attachments.length > 0
            ? attachments.map((a) => ({
                filename: a.name,
                path: a.path
              }))
            : undefined
      }

      // 개인별 전송: 받는사람이 2명 이상이고 개인별 체크가 되어 있을 때
      if (sendIndividually && toList.length > 1) {
        console.log('[ComposeEmail] Sending individual emails to', toList.length, 'recipients')

        const results: { email: string; success: boolean; error?: string }[] = []

        for (const recipientEmail of toList) {
          const emailData = {
            ...baseEmailData,
            to: [recipientEmail]
            // 개인별 전송 시 CC/BCC는 제외 (각 수신자에게 개별 발송)
          }

          console.log('[ComposeEmail] Sending to:', recipientEmail)
          const result = await window.electron.ipcRenderer.invoke(
            'send-email',
            accountEmail,
            emailData
          )

          results.push({
            email: recipientEmail,
            success: result.success,
            error: result.error
          })
        }

        const failedResults = results.filter((r) => !r.success)

        if (failedResults.length === 0) {
          console.log('[ComposeEmail] All individual emails sent successfully')
          onSent?.()
          onClose?.()
        } else if (failedResults.length === results.length) {
          // 모두 실패
          setError(
            t('compose.sendFailed', { emails: failedResults.map((r) => r.email).join(', ') })
          )
        } else {
          // 일부 실패
          const successCount = results.length - failedResults.length
          setError(
            t('compose.sendPartialSuccess', {
              success: successCount,
              fail: failedResults.length,
              emails: failedResults.map((r) => r.email).join(', ')
            })
          )
        }
      } else {
        // 일반 전송: 모든 수신자에게 한 번에 발송
        const emailData = {
          ...baseEmailData,
          to: toList,
          cc: ccList.length > 0 ? ccList : undefined,
          bcc: bccList.length > 0 ? bccList : undefined
        }

        console.log('[ComposeEmail] Sending email with data:', emailData)
        console.log('[ComposeEmail] Account email:', accountEmail)

        const result = await window.electron.ipcRenderer.invoke(
          'send-email',
          accountEmail,
          emailData
        )

        console.log('[ComposeEmail] Send result:', result)

        if (result.success) {
          // 발송 성공
          onSent?.()
          onClose?.()
        } else {
          setError(result.error || t('compose.sendError'))
        }
      }
    } catch (err) {
      console.error('[ComposeEmail] Send error:', err)
      setError(err instanceof Error ? err.message : t('compose.sendErrorGeneric'))
    } finally {
      setIsSending(false)
    }
  }

  const handleSend = async () => {
    console.log('[ComposeEmail] handleSend called')
    console.log('[ComposeEmail] mode:', mode)
    console.log('[ComposeEmail] toTags:', toTags)
    console.log('[ComposeEmail] sendIndividually:', sendIndividually)

    // 나에게 쓰기 모드가 아닌 경우에만 수신자 유효성 검사
    if (mode !== 'toSelf') {
      // 유효성 검사
      const validToTags = toTags.filter((tag) => tag.isValid)
      if (validToTags.length === 0) {
        console.log('[ComposeEmail] No valid recipients')
        setError(t('compose.noValidRecipients'))
        return
      }

      // 유효하지 않은 이메일이 있는지 확인
      const invalidTags = toTags.filter((tag) => !tag.isValid)
      if (invalidTags.length > 0) {
        console.log('[ComposeEmail] Invalid tags found:', invalidTags)
        setError(t('compose.invalidEmails', { emails: invalidTags.map((t) => t.email).join(', ') }))
        return
      }
    }

    if (!subject.trim()) {
      const confirmSend = confirm(t('compose.noSubjectConfirm'))
      if (!confirmSend) return
    }

    // 안전 검사 수행
    const plainText = getPlainText()
    const warnings = performSafetyCheck({
      plainText,
      subject,
      attachments,
      toCount: mode === 'toSelf' ? 1 : toTags.filter((t) => t.isValid).length,
      ccCount: mode === 'toSelf' ? 0 : ccTags.filter((t) => t.isValid).length,
      bccCount: mode === 'toSelf' ? 0 : bccTags.filter((t) => t.isValid).length
    })

    // 경고가 있으면 모달 표시
    if (warnings.length > 0) {
      console.log('[ComposeEmail] Safety warnings found:', warnings)
      setSafetyWarnings(warnings)
      setShowSafetyModal(true)
      return
    }

    // 경고가 없으면 바로 발송
    await proceedWithSend()
  }

  // 총 첨부파일 크기
  const totalAttachmentSize = attachments.reduce((sum, a) => sum + a.size, 0)

  return (
    <div
      className="flex flex-1 flex-col bg-background"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 드래그 오버레이 */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary z-50 flex items-center justify-center">
          <div className="text-center">
            <Paperclip className="h-12 w-12 text-primary mx-auto mb-2" />
            <p className="text-lg font-medium text-primary">{t('compose.dropFiles')}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h1 className="text-lg font-semibold">{getModeTitle()}</h1>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-4 mt-2 p-3 bg-red-50 border border-red-200 rounded-md flex items-center justify-between">
          <span className="text-sm text-red-600">{error}</span>
          <button onClick={() => setError(null)}>
            <X className="h-4 w-4 text-red-600" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <Button size="sm" className="h-8 px-4 gap-2" onClick={handleSend} disabled={isSending}>
          {isSending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('compose.sending')}
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              {t('compose.send')}
            </>
          )}
        </Button>
        <Button variant="ghost" size="sm" className="h-8 px-3 text-muted-foreground">
          {t('compose.saveDraft')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-3 text-muted-foreground"
          onClick={() => setShowPreview(true)}
        >
          {t('compose.preview')}
        </Button>

        {/* Template Selector */}
        <Popover open={showTemplatePopover} onOpenChange={setShowTemplatePopover}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-muted-foreground"
              disabled={templates.length === 0}
            >
              <FileStack className="h-4 w-4 mr-1" />
              {t('template.use')}
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                {t('template.noTemplates')}
              </p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => applyTemplate(template)}
                    className="w-full flex flex-col items-start gap-0.5 px-3 py-2 text-sm rounded-md hover:bg-muted/50"
                  >
                    <span className="font-medium truncate w-full text-left">{template.name}</span>
                    {template.subject && (
                      <span className="text-xs text-muted-foreground truncate w-full text-left">
                        {template.subject}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* AI Features */}
        {(mode === 'reply' || mode === 'replyAll' || mode === 'forward') && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-muted-foreground"
            onClick={() => setShowAIReplyDialog(true)}
          >
            {t('compose.aiDraft')}
          </Button>
        )}
        <ToneDropdown
          accountEmail={accountEmail}
          emailContent={editorContent}
          onToneConverted={(convertedContent) => setEditorContent(convertedContent)}
          onError={(error) => alert(error)}
          disabled={isSending}
          className="h-8 px-3 text-muted-foreground"
        />

        {/* 암호화 방법 선택기 */}
        {mode !== 'toSelf' && (
          <div className="flex items-center gap-2 ml-auto">
            {isCheckingEncryption ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('compose.checkingEncryption')}
              </span>
            ) : availableEncryption.length > 1 ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={encryptionMethod !== 'none' ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                      'h-8 px-3 gap-1.5',
                      encryptionMethod === 'signal' && 'bg-green-600 hover:bg-green-700 text-white',
                      encryptionMethod === 'pgp' &&
                        'bg-emerald-600 hover:bg-emerald-700 text-white',
                      encryptionMethod === 'smime' && 'bg-blue-600 hover:bg-blue-700 text-white'
                    )}
                  >
                    {encryptionMethod === 'none' ? (
                      <Shield className="h-4 w-4" />
                    ) : encryptionMethod === 'signal' ? (
                      <ShieldCheck className="h-4 w-4" />
                    ) : encryptionMethod === 'pgp' ? (
                      <Key className="h-4 w-4" />
                    ) : (
                      <FileKey className="h-4 w-4" />
                    )}
                    <span className="text-xs">
                      {encryptionMethod === 'none'
                        ? t('encryption.title')
                        : encryptionMethod === 'signal'
                          ? 'Signal'
                          : encryptionMethod === 'pgp'
                            ? 'PGP'
                            : 'S/MIME'}
                    </span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-2">
                  <div className="space-y-1">
                    <button
                      onClick={() => setEncryptionMethod('none')}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md',
                        encryptionMethod === 'none' ? 'bg-muted' : 'hover:bg-muted/50'
                      )}
                    >
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <span>{t('encryption.noEncryption')}</span>
                    </button>

                    {availableEncryption.includes('signal') && (
                      <button
                        onClick={() => setEncryptionMethod('signal')}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md',
                          encryptionMethod === 'signal'
                            ? 'bg-green-100 text-green-700'
                            : 'hover:bg-muted/50'
                        )}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        <div className="flex-1 text-left">
                          <div>Signal Protocol</div>
                          <div className="text-xs text-muted-foreground">
                            {t('compose.signalDesc')}
                          </div>
                        </div>
                      </button>
                    )}

                    {availableEncryption.includes('pgp') && (
                      <button
                        onClick={() => setEncryptionMethod('pgp')}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md',
                          encryptionMethod === 'pgp'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'hover:bg-muted/50'
                        )}
                      >
                        <Key className="h-4 w-4" />
                        <div className="flex-1 text-left">
                          <div>PGP</div>
                          <div className="text-xs text-muted-foreground">
                            {t('compose.pgpDesc')}
                          </div>
                        </div>
                      </button>
                    )}

                    {availableEncryption.includes('smime') && (
                      <button
                        onClick={() => setEncryptionMethod('smime')}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md',
                          encryptionMethod === 'smime'
                            ? 'bg-blue-100 text-blue-700'
                            : 'hover:bg-muted/50'
                        )}
                      >
                        <FileKey className="h-4 w-4" />
                        <div className="flex-1 text-left">
                          <div>S/MIME</div>
                          <div className="text-xs text-muted-foreground">
                            {t('compose.smimeDesc')}
                          </div>
                        </div>
                      </button>
                    )}

                    {(encryptionMethod === 'pgp' || encryptionMethod === 'smime') && (
                      <div className="pt-2 border-t mt-2">
                        <button
                          onClick={() => setShowPassphraseDialog(true)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted/50"
                        >
                          <Lock className="h-4 w-4" />
                          <span>
                            {encryptionPassphrase
                              ? t('compose.changeSignPassphrase')
                              : t('compose.enterSignPassphrase')}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <span
                className="text-xs text-muted-foreground flex items-center gap-1"
                title={t('compose.encryptionNotSetTitle')}
              >
                <Shield className="h-3.5 w-3.5" />
                {t('compose.encryptionNotSet')}
              </span>
            )}

            {/* 수신자 암호화 지원 상태 표시 */}
            {encryptionMethod !== 'none' && toTags.length > 0 && (
              <div className="flex items-center gap-1">
                {(() => {
                  const validEmails = toTags.filter((t) => t.isValid).map((t) => t.email)
                  const allSupported = validEmails.every(
                    (email) => recipientEncryptionStatus[email]?.[encryptionMethod] ?? false
                  )
                  const someSupported = validEmails.some(
                    (email) => recipientEncryptionStatus[email]?.[encryptionMethod] ?? false
                  )

                  if (allSupported) {
                    return (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        {t('compose.allRecipientsSupported')}
                      </span>
                    )
                  } else if (someSupported) {
                    return (
                      <span className="text-xs text-yellow-600 flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" />
                        {t('compose.someRecipientsSupported')}
                      </span>
                    )
                  } else {
                    return (
                      <span className="text-xs text-red-500 flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" />
                        {t('compose.noRecipientKey')}
                      </span>
                    )
                  }
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Form fields */}
      <div className="border-b">
        {/* 받는사람 - 나에게 쓰기 모드에서는 숨김 */}
        {mode !== 'toSelf' && (
          <div className="flex items-center px-4 py-2.5 border-b">
            <label className="w-20 text-sm text-muted-foreground flex-shrink-0">
              {t('compose.recipientLabel')}
            </label>
            {/* 개인별 체크박스 */}
            <div className="flex items-center gap-1 mr-3 flex-shrink-0">
              <Checkbox
                id="send-individually"
                checked={sendIndividually}
                onCheckedChange={(checked) => setSendIndividually(checked as boolean)}
                className="h-4 w-4"
              />
              <label
                htmlFor="send-individually"
                className="text-sm text-muted-foreground cursor-pointer whitespace-nowrap"
              >
                {t('compose.sendIndividually')}
              </label>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
            {/* 이메일 입력 */}
            <div
              onClick={() => document.getElementById('to-input')?.focus()}
              className="flex-1 flex flex-wrap items-center gap-1 min-h-[36px] px-3 py-1.5 border rounded-md cursor-text bg-background"
            >
              {toTags.map((tag) => (
                <span
                  key={tag.id}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
                    tag.isValid
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'bg-red-100 text-red-600 border border-red-200'
                  )}
                >
                  <span className="max-w-[200px] truncate">{tag.email}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setToTags(toTags.filter((t) => t.id !== tag.id))
                    }}
                    className="hover:bg-black/10 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                id="to-input"
                type="text"
                className="flex-1 min-w-[150px] h-6 text-sm border-0 bg-transparent focus:outline-none"
                placeholder={toTags.length === 0 ? t('compose.toPlaceholder') : ''}
                autoFocus={mode === 'compose'}
                onKeyDown={(e) => {
                  const value = (e.target as HTMLInputElement).value
                  if ((e.key === 'Enter' || e.key === ',' || e.key === ';') && value.trim()) {
                    e.preventDefault()
                    const trimmedEmail = value.trim().toLowerCase()
                    if (!toTags.some((t) => t.email === trimmedEmail)) {
                      setToTags([
                        ...toTags,
                        {
                          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                          email: trimmedEmail,
                          isValid: EMAIL_REGEX.test(trimmedEmail)
                        }
                      ])
                    }
                    ;(e.target as HTMLInputElement).value = ''
                  } else if (e.key === 'Backspace' && !value && toTags.length > 0) {
                    setToTags(toTags.slice(0, -1))
                  }
                }}
                onBlur={(e) => {
                  const value = e.target.value.trim()
                  if (value) {
                    const trimmedEmail = value.toLowerCase()
                    if (!toTags.some((t) => t.email === trimmedEmail)) {
                      setToTags([
                        ...toTags,
                        {
                          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                          email: trimmedEmail,
                          isValid: EMAIL_REGEX.test(trimmedEmail)
                        }
                      ])
                    }
                    e.target.value = ''
                  }
                }}
              />
            </div>
            {/* 주소록 버튼 */}
            <Button
              variant="outline"
              size="sm"
              className="ml-2 h-9 px-3 flex-shrink-0"
              onClick={() => setShowAddressBook(true)}
            >
              {t('addressBook.title')}
            </Button>
          </div>
        )}

        {/* 참조 (접기/펼치기) - 나에게 쓰기 모드에서는 숨김 */}
        {mode !== 'toSelf' && (
          <>
            <div className="flex items-center px-4 py-2.5 border-b">
              <button
                onClick={() => setShowCcExpanded(!showCcExpanded)}
                className="w-20 text-sm text-muted-foreground flex items-center gap-1 flex-shrink-0"
              >
                {t('compose.ccLabel')}
                {showCcExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              {/* 참조 이메일 입력 */}
              <div
                onClick={() => document.getElementById('cc-input')?.focus()}
                className="flex-1 flex flex-wrap items-center gap-1 min-h-[36px] px-3 py-1.5 border rounded-md cursor-text bg-background"
              >
                {ccTags.map((tag) => (
                  <span
                    key={tag.id}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
                      tag.isValid
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'bg-red-100 text-red-600 border border-red-200'
                    )}
                  >
                    <span className="max-w-[200px] truncate">{tag.email}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setCcTags(ccTags.filter((t) => t.id !== tag.id))
                      }}
                      className="hover:bg-black/10 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  id="cc-input"
                  type="text"
                  className="flex-1 min-w-[150px] h-6 text-sm border-0 bg-transparent focus:outline-none"
                  placeholder={ccTags.length === 0 ? t('compose.ccPlaceholder') : ''}
                  onKeyDown={(e) => {
                    const value = (e.target as HTMLInputElement).value
                    if ((e.key === 'Enter' || e.key === ',' || e.key === ';') && value.trim()) {
                      e.preventDefault()
                      const trimmedEmail = value.trim().toLowerCase()
                      if (!ccTags.some((t) => t.email === trimmedEmail)) {
                        setCcTags([
                          ...ccTags,
                          {
                            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                            email: trimmedEmail,
                            isValid: EMAIL_REGEX.test(trimmedEmail)
                          }
                        ])
                      }
                      ;(e.target as HTMLInputElement).value = ''
                    } else if (e.key === 'Backspace' && !value && ccTags.length > 0) {
                      setCcTags(ccTags.slice(0, -1))
                    }
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim()
                    if (value) {
                      const trimmedEmail = value.toLowerCase()
                      if (!ccTags.some((t) => t.email === trimmedEmail)) {
                        setCcTags([
                          ...ccTags,
                          {
                            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                            email: trimmedEmail,
                            isValid: EMAIL_REGEX.test(trimmedEmail)
                          }
                        ])
                      }
                      e.target.value = ''
                    }
                  }}
                />
              </div>
            </div>

            {/* 참조 확장 영역: 숨은참조, 보내는 이름 */}
            {showCcExpanded && (
              <>
                {/* 숨은참조 */}
                <div className="flex items-center px-4 py-2.5 border-b">
                  <label className="w-20 text-sm text-muted-foreground flex-shrink-0">
                    {t('compose.bccLabel')}
                  </label>
                  <div
                    onClick={() => document.getElementById('bcc-input')?.focus()}
                    className="flex-1 flex flex-wrap items-center gap-1 min-h-[36px] px-3 py-1.5 border rounded-md cursor-text bg-background"
                  >
                    {bccTags.map((tag) => (
                      <span
                        key={tag.id}
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
                          tag.isValid
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : 'bg-red-100 text-red-600 border border-red-200'
                        )}
                      >
                        <span className="max-w-[200px] truncate">{tag.email}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setBccTags(bccTags.filter((t) => t.id !== tag.id))
                          }}
                          className="hover:bg-black/10 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      id="bcc-input"
                      type="text"
                      className="flex-1 min-w-[150px] h-6 text-sm border-0 bg-transparent focus:outline-none"
                      placeholder={bccTags.length === 0 ? t('compose.bccPlaceholder') : ''}
                      onKeyDown={(e) => {
                        const value = (e.target as HTMLInputElement).value
                        if ((e.key === 'Enter' || e.key === ',' || e.key === ';') && value.trim()) {
                          e.preventDefault()
                          const trimmedEmail = value.trim().toLowerCase()
                          if (!bccTags.some((t) => t.email === trimmedEmail)) {
                            setBccTags([
                              ...bccTags,
                              {
                                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                                email: trimmedEmail,
                                isValid: EMAIL_REGEX.test(trimmedEmail)
                              }
                            ])
                          }
                          ;(e.target as HTMLInputElement).value = ''
                        } else if (e.key === 'Backspace' && !value && bccTags.length > 0) {
                          setBccTags(bccTags.slice(0, -1))
                        }
                      }}
                      onBlur={(e) => {
                        const value = e.target.value.trim()
                        if (value) {
                          const trimmedEmail = value.toLowerCase()
                          if (!bccTags.some((t) => t.email === trimmedEmail)) {
                            setBccTags([
                              ...bccTags,
                              {
                                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                                email: trimmedEmail,
                                isValid: EMAIL_REGEX.test(trimmedEmail)
                              }
                            ])
                          }
                          e.target.value = ''
                        }
                      }}
                    />
                  </div>
                </div>

                {/* 보내는 이름 */}
                <div className="flex items-center px-4 py-2.5 border-b">
                  <label className="w-20 text-sm text-muted-foreground flex-shrink-0">
                    {t('compose.senderNameLabel')}
                  </label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    className="flex-1 h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder={t('compose.senderNamePlaceholder')}
                  />
                </div>
              </>
            )}
          </>
        )}

        {/* 제목 */}
        <div className="flex items-center px-4 py-2.5 border-b">
          <label className="w-20 text-sm text-muted-foreground flex-shrink-0">
            {t('compose.subject')}
          </label>
          <div className="flex items-center gap-2 mr-3 flex-shrink-0">
            <Checkbox
              id="important"
              checked={isImportant}
              onCheckedChange={(checked) => setIsImportant(checked as boolean)}
              className="h-4 w-4"
            />
            <label htmlFor="important" className="text-sm text-red-500 cursor-pointer">
              {t('compose.important')}
            </label>
          </div>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={t('compose.subjectPlaceholder')}
          />
        </div>

        {/* 파일첨부 */}
        <div className="px-4 py-2.5">
          <div className="flex items-center">
            <button
              onClick={() => setShowAttachment(!showAttachment)}
              className="w-20 text-sm text-muted-foreground flex items-center gap-1 flex-shrink-0"
            >
              {t('compose.attachFile')}
              {showAttachment ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-4 text-sm"
              onClick={handleAddAttachments}
            >
              {t('compose.myPC')}
            </Button>
            <div className="flex-1" />
            {attachments.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {t('compose.normal')} {formatFileSize(totalAttachmentSize)}/10MB
              </span>
            )}
          </div>

          {showAttachment && (
            <div className="mt-3">
              {attachments.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className={cn(
                        'flex items-center gap-2 p-2 rounded-md',
                        attachment.isCloudUpload
                          ? 'bg-blue-50 border border-blue-200'
                          : 'bg-muted/50'
                      )}
                    >
                      {attachment.isCloudUpload ? (
                        <Cloud className="h-4 w-4 text-blue-500" />
                      ) : (
                        getFileIcon(attachment.type)
                      )}
                      <span className="flex-1 text-sm truncate">
                        {attachment.isCloudUpload && attachment.cloudUrl ? (
                          <a
                            href={attachment.cloudUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            {attachment.name}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          attachment.name
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(attachment.size)}
                      </span>
                      {attachment.isCloudUpload && (
                        <span className="text-xs text-blue-500 px-1.5 py-0.5 bg-blue-100 rounded">
                          {attachment.cloudProvider}
                        </span>
                      )}
                      <button
                        onClick={() => handleRemoveAttachment(attachment.id)}
                        className="p-1 hover:bg-muted rounded"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div
                className="border-2 border-dashed border-muted rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={handleAddAttachments}
              >
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Paperclip className="h-6 w-6" />
                  <span className="text-sm">{t('compose.dragFiles')}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 숨겨진 파일 입력 */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || [])
            if (files.length > 0) {
              const newAttachments: AttachmentFile[] = files.map((file) => ({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: file.name,
                path: (file as any).path || file.name,
                size: file.size,
                type: file.type || 'application/octet-stream'
              }))
              setAttachments((prev) => [...prev, ...newAttachments])
              setShowAttachment(true)
            }
            e.target.value = ''
          }}
        />
      </div>

      {/* ReactQuill Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ReactQuill
          ref={quillRef}
          theme="snow"
          value={editorContent}
          onChange={handleEditorChange}
          modules={quillModules}
          formats={quillFormats}
          placeholder={t('compose.contentPlaceholder')}
          className="flex-1 flex flex-col"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>
            {getPlainText().length}
            {t('compose.chars')}
          </span>
          {attachments.length > 0 && (
            <span>
              {t('compose.attachments')} {attachments.length}
              {t('compose.count')} ({formatFileSize(totalAttachmentSize)})
            </span>
          )}
        </div>
      </div>

      {/* 미리보기 다이얼로그 */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('compose.previewTitle')}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {/* 메일 헤더 정보 */}
            <div className="border rounded-lg p-4 mb-4 bg-muted/30">
              <div className="grid grid-cols-[80px_1fr] gap-2 text-sm">
                <span className="text-muted-foreground font-medium">{t('email.from')}</span>
                <span>{accountEmail}</span>

                <span className="text-muted-foreground font-medium">{t('email.to')}</span>
                <span>{toTags.map((t) => t.email).join(', ') || t('compose.none')}</span>

                {ccTags.length > 0 && (
                  <>
                    <span className="text-muted-foreground font-medium">
                      {t('compose.ccLabel')}
                    </span>
                    <span>{ccTags.map((t) => t.email).join(', ')}</span>
                  </>
                )}

                {bccTags.length > 0 && (
                  <>
                    <span className="text-muted-foreground font-medium">
                      {t('compose.bccLabel')}
                    </span>
                    <span>{bccTags.map((t) => t.email).join(', ')}</span>
                  </>
                )}

                <span className="text-muted-foreground font-medium">{t('compose.subject')}</span>
                <span className={cn(isImportant && 'text-red-500 font-medium')}>
                  {isImportant && `[${t('compose.important')}] `}
                  {subject || t('compose.noSubject')}
                </span>

                {attachments.length > 0 && (
                  <>
                    <span className="text-muted-foreground font-medium">
                      {t('compose.attachments')}
                    </span>
                    <span>
                      {attachments.length}
                      {t('compose.count')} ({formatFileSize(totalAttachmentSize)})
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* 첨부파일 목록 */}
            {attachments.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium mb-2">{t('compose.attachments')}</h4>
                <div className="flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm"
                    >
                      {getFileIcon(attachment.type)}
                      <span className="truncate max-w-[200px]">{attachment.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({formatFileSize(attachment.size)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 메일 본문 */}
            <div className="border rounded-lg p-4 min-h-[200px] bg-white">
              <div
                className="text-sm prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: editorContent || `<p style='color: #999'>${t('compose.noContent')}</p>`
                }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              {t('compose.close')}
            </Button>
            <Button
              onClick={() => {
                setShowPreview(false)
                handleSend()
              }}
              disabled={isSending}
            >
              <Send className="h-4 w-4 mr-2" />
              {t('compose.send')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 주소록 다이얼로그 */}
      <AddressBookDialog
        open={showAddressBook}
        accountEmail={accountEmail}
        onOpenChange={setShowAddressBook}
        initialTo={getInitialRecipients().to}
        initialCc={getInitialRecipients().cc}
        initialBcc={getInitialRecipients().bcc}
        onConfirm={handleAddressBookConfirm}
        onNavigateToAddressBook={onNavigateToAddressBook}
      />

      {/* 안전 검사 경고 모달 */}
      <SendSafetyModal
        isOpen={showSafetyModal}
        onClose={() => setShowSafetyModal(false)}
        onConfirmSend={proceedWithSend}
        warnings={safetyWarnings}
      />

      {/* 암호화 서명 암호 입력 다이얼로그 */}
      <Dialog open={showPassphraseDialog} onOpenChange={setShowPassphraseDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('compose.signPassphrase', {
                method: encryptionMethod === 'pgp' ? 'PGP' : 'S/MIME'
              })}
            </DialogTitle>
            <DialogDescription>{t('compose.signPassphraseDesc')}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="password"
              placeholder={t('compose.passphraseOptional')}
              value={encryptionPassphrase}
              onChange={(e) => setEncryptionPassphrase(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setShowPassphraseDialog(false)
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEncryptionPassphrase('')
                setShowPassphraseDialog(false)
              }}
            >
              {t('compose.skipSign')}
            </Button>
            <Button onClick={() => setShowPassphraseDialog(false)}>{t('common.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Reply Dialog */}
      <AIReplyDialog
        accountEmail={accountEmail}
        originalEmailId=""
        originalSubject={initialSubject}
        originalContent={initialContent}
        originalSender=""
        isOpen={showAIReplyDialog}
        onClose={() => setShowAIReplyDialog(false)}
        onInsert={(reply) => {
          // Append the AI reply to the current editor content
          const currentContent = editorContent || ''
          const separator = currentContent.trim() ? '<br><br>' : ''
          setEditorContent(reply + separator + currentContent)
        }}
      />

      {/* 대용량 파일 업로드 다이얼로그 */}
      <LargeFileUploadDialog
        isOpen={showLargeFileDialog}
        onClose={() => {
          setShowLargeFileDialog(false)
          setPendingLargeFiles([])
        }}
        files={pendingLargeFiles}
        accountEmail={accountEmail}
        onUploadComplete={handleLargeFileUploadComplete}
      />
    </div>
  )
}
