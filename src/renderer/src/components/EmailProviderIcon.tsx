import { cn } from '@renderer/lib/utils'

type EmailProvider =
  | 'gmail'
  | 'outlook'
  | 'yahoo'
  | 'icloud'
  | 'naver'
  | 'daum'
  | 'kakao'
  | 'hanmail'
  | 'nate'
  | 'proton'
  | 'zoho'
  | 'aol'
  | 'yandex'
  | 'mail'
  | 'gmx'
  | 'unknown'

interface EmailProviderIconProps {
  email: string
  className?: string
  size?: number
}

// 이메일 주소에서 이메일 서비스 프로바이더 감지
export function getEmailProvider(email: string): EmailProvider {
  const domain = email.split('@')[1]?.toLowerCase() || ''

  // Gmail
  if (domain === 'gmail.com' || domain === 'googlemail.com') return 'gmail'

  // Microsoft (Outlook, Hotmail, Live)
  if (
    domain === 'outlook.com' ||
    domain === 'outlook.kr' ||
    domain === 'hotmail.com' ||
    domain === 'live.com' ||
    domain === 'msn.com'
  )
    return 'outlook'

  // Yahoo
  if (domain.startsWith('yahoo.') || domain === 'ymail.com') return 'yahoo'

  // iCloud (Apple)
  if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') return 'icloud'

  // Naver (Korean)
  if (domain === 'naver.com') return 'naver'

  // Daum/Kakao (Korean)
  if (domain === 'daum.net') return 'daum'
  if (domain === 'kakao.com') return 'kakao'
  if (domain === 'hanmail.net') return 'hanmail'

  // Nate (Korean)
  if (domain === 'nate.com' || domain === 'empas.com') return 'nate'

  // ProtonMail
  if (domain === 'protonmail.com' || domain === 'proton.me' || domain === 'pm.me') return 'proton'

  // Zoho
  if (domain.startsWith('zoho.')) return 'zoho'

  // AOL
  if (domain === 'aol.com') return 'aol'

  // Yandex
  if (domain === 'yandex.com' || domain === 'yandex.ru' || domain === 'ya.ru') return 'yandex'

  // Mail.ru
  if (domain === 'mail.ru') return 'mail'

  // GMX
  if (domain.startsWith('gmx.')) return 'gmx'

  return 'unknown'
}

// 이메일 서비스별 아이콘 SVG
export function EmailProviderIcon({ email, className, size = 16 }: EmailProviderIconProps) {
  const provider = getEmailProvider(email)

  const iconClass = cn('flex-shrink-0', className)

  switch (provider) {
    case 'gmail':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={iconClass}
          aria-label="Gmail"
        >
          <path
            fill="#EA4335"
            d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"
          />
        </svg>
      )

    case 'outlook':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={iconClass}
          aria-label="Outlook"
        >
          <path
            fill="#0078D4"
            d="M24 7.387v10.478c0 .23-.08.424-.238.576-.158.154-.352.231-.584.231h-8.146v-6.18l1.778 1.225c.088.063.19.095.305.095s.216-.032.305-.095l6.58-4.53V7.387zm-.822-.822H15.03l5.307 3.66 2.84-1.96V6.565zM14.032 5.19v13.62H1.364A1.19 1.19 0 0 1 .4 18.43a1.19 1.19 0 0 1-.4-.882V6.072c0-.344.134-.638.4-.882a1.19 1.19 0 0 1 .964-.381h12.668zm-6.37 2.468c-.76 0-1.441.152-2.044.455a3.42 3.42 0 0 0-1.418 1.3c-.345.563-.518 1.22-.518 1.97 0 .712.171 1.345.513 1.897a3.41 3.41 0 0 0 1.408 1.285c.595.304 1.267.456 2.018.456.755 0 1.433-.152 2.033-.456a3.37 3.37 0 0 0 1.4-1.285c.338-.552.507-1.185.507-1.897 0-.75-.173-1.407-.518-1.97a3.42 3.42 0 0 0-1.419-1.3c-.602-.303-1.278-.455-2.028-.455h.066zm-.055 1.455c.508 0 .925.18 1.25.54.325.36.488.827.488 1.4 0 .59-.164 1.064-.493 1.423-.329.36-.749.54-1.26.54-.513 0-.934-.178-1.263-.535-.329-.356-.493-.832-.493-1.427 0-.565.164-1.03.493-1.395.329-.364.752-.546 1.268-.546h.01z"
          />
        </svg>
      )

    case 'yahoo':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={iconClass}
          aria-label="Yahoo"
        >
          <path
            fill="#6001D2"
            d="M10.816 8.908l3.097 6.987h.058l3.032-6.987h4.15l-6.197 12.524-1.476 2.977h-4.472l1.651-3.32-5.1-10.204V8.908h5.257zm7.092-4.702l.658 3.416h-3.088l-.665-3.416h3.095zm-3.638 0l.666 3.416h-3.095l-.658-3.416h3.087z"
          />
        </svg>
      )

    case 'icloud':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={iconClass}
          aria-label="iCloud"
        >
          <path
            fill="#3693F3"
            d="M13.762 4.29a6.51 6.51 0 0 0-5.669 3.332 3.571 3.571 0 0 0-1.558-.36 3.571 3.571 0 0 0-3.516 3.049A4.992 4.992 0 0 0 0 14.946a5.058 5.058 0 0 0 5.03 5.055h13.78A5.225 5.225 0 0 0 24 14.808a5.2 5.2 0 0 0-3.505-4.93 6.503 6.503 0 0 0-6.733-5.588z"
          />
        </svg>
      )

    case 'naver':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={iconClass}
          aria-label="Naver"
        >
          <path fill="#03C75A" d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z" />
        </svg>
      )

    case 'daum':
    case 'hanmail':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={iconClass}
          aria-label="Daum"
        >
          <path
            fill="#FF5722"
            d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm2.4 16.8H9.6v-1.2h1.2v-6h-1.2V8.4h4.8v1.2h-1.2v6h1.2v1.2z"
          />
        </svg>
      )

    case 'kakao':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={iconClass}
          aria-label="Kakao"
        >
          <path
            fill="#FFE812"
            d="M12 3c5.799 0 10.5 3.664 10.5 8.185 0 4.52-4.701 8.184-10.5 8.184a13.5 13.5 0 0 1-1.727-.11l-4.408 2.883c-.501.265-.678.236-.472-.413l.892-3.678c-2.88-1.46-4.785-3.99-4.785-6.866C1.5 6.665 6.201 3 12 3z"
          />
          <path
            fill="#3C1E1E"
            d="M5.67 12.618c-.32 0-.564-.242-.564-.538 0-.297.243-.54.564-.54.32 0 .564.243.564.54 0 .296-.244.538-.564.538zm1.59-2.01a.44.44 0 0 0-.438-.436h-.067a.44.44 0 0 0-.438.436v3.13a.44.44 0 0 0 .438.436h.067a.44.44 0 0 0 .438-.436v-3.13zm4.607.034a.387.387 0 0 0-.388-.387h-.074a.387.387 0 0 0-.388.387v1.617l-1.83-1.883a.424.424 0 0 0-.32-.121h-.058a.387.387 0 0 0-.387.387v3.095a.387.387 0 0 0 .387.388h.074a.387.387 0 0 0 .388-.388v-1.617l1.83 1.884a.423.423 0 0 0 .32.12h.058a.387.387 0 0 0 .388-.387v-3.095zm3.7 2.67l-.867-1.31.787-1.183a.318.318 0 0 0-.266-.494h-.09a.318.318 0 0 0-.27.149l-.604.91-.605-.91a.318.318 0 0 0-.27-.149h-.09a.318.318 0 0 0-.266.494l.787 1.183-.867 1.31a.318.318 0 0 0 .266.494h.104a.318.318 0 0 0 .27-.149l.671-1.013.67 1.013a.318.318 0 0 0 .27.149h.104a.318.318 0 0 0 .266-.494zm2.776-2.704a.387.387 0 0 0-.387-.387h-1.723a.387.387 0 0 0-.387.387v.057c0 .214.173.388.387.388h.524v2.65a.387.387 0 0 0 .387.388h.074a.387.387 0 0 0 .388-.388v-2.65h.35a.387.387 0 0 0 .387-.388v-.057z"
          />
        </svg>
      )

    case 'nate':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={iconClass}
          aria-label="Nate"
        >
          <circle fill="#FF3D00" cx="12" cy="12" r="12" />
          <path
            fill="#FFF"
            d="M8 8v8h2v-5l4 5h2V8h-2v5l-4-5H8z"
          />
        </svg>
      )

    case 'proton':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={iconClass}
          aria-label="ProtonMail"
        >
          <path
            fill="#6D4AFF"
            d="M3.818 6.163V18.05c0 .54.218 1.059.603 1.445.386.386.904.603 1.444.603h12.27c.54 0 1.059-.217 1.444-.603.386-.386.603-.904.603-1.444V5.95a2.047 2.047 0 0 0-3.497-1.445l-4.685 4.8-4.685-4.8A2.047 2.047 0 0 0 3.818 6.16v.003zm14.364 6.24l-5.5 4.27a1.024 1.024 0 0 1-1.294.014l-5.57-4.284v5.647c0 .27.107.528.298.72.191.19.45.298.72.298h10.628c.27 0 .528-.107.72-.299.19-.19.298-.45.298-.72v-5.646h-.3z"
          />
        </svg>
      )

    case 'zoho':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={iconClass}
          aria-label="Zoho"
        >
          <path
            fill="#C8202B"
            d="M11.097 7.222L6.83 13.84h4.364l-.099 2.95-4.364 6.612H2.367l4.366-6.612H2.367L6.83 7.222h4.267zm6.536 0l-4.366 9.561h4.366L13.267 24h4.366l4.366-9.563h-4.366l4.366-7.215h-4.366z"
          />
        </svg>
      )

    case 'aol':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={iconClass}
          aria-label="AOL"
        >
          <path
            fill="#3399FF"
            d="M10.49 8.567c-2.073 0-3.848 1.456-3.848 4.033 0 2.3 1.456 3.833 3.756 3.833 2.302 0 3.849-1.352 3.849-3.833 0-2.622-1.73-4.033-3.757-4.033zm-.092 5.993c-.874 0-1.41-.874-1.41-1.96 0-1.318.629-2.16 1.502-2.16.92 0 1.41.842 1.41 2.16 0 1.132-.582 1.96-1.502 1.96zM19.5 8.66v6.252h-2.438V8.66H19.5zm-1.227-.69a1.289 1.289 0 1 0 .002-2.578 1.289 1.289 0 0 0-.002 2.578zM24 12.6c0-2.393-1.73-4.033-4.17-4.033-2.44 0-4.262 1.64-4.262 4.033 0 2.485 1.868 3.833 4.262 3.833 2.347 0 4.17-1.348 4.17-3.833zm-4.17 1.96c-.873 0-1.409-.828-1.409-1.96 0-1.272.582-2.16 1.41-2.16.873 0 1.455.888 1.455 2.16 0 1.132-.582 1.96-1.456 1.96zM5.713 16.433c1.134 0 2.164-.48 2.72-1.44l-1.584-1.044c-.314.504-.648.63-1.09.63-.557 0-.968-.37-.968-1.18V8.66H2.353v4.92c0 1.924 1.274 2.853 3.36 2.853z"
          />
        </svg>
      )

    case 'yandex':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={iconClass}
          aria-label="Yandex"
        >
          <path
            fill="#FF0000"
            d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12zm-1.454-4.473V14.25L7.19 6.978h2.427l2.04 4.727h.073l2.04-4.727h2.354l-3.356 7.272v5.277h-2.222z"
          />
        </svg>
      )

    case 'mail':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={iconClass}
          aria-label="Mail.ru"
        >
          <path
            fill="#FF6600"
            d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 16.088a4.905 4.905 0 0 1-1.58.95 5.273 5.273 0 0 1-1.94.361c-.592 0-1.136-.104-1.632-.313a3.16 3.16 0 0 1-1.198-.894c-.153.275-.36.516-.621.724a3.11 3.11 0 0 1-.87.498 3.174 3.174 0 0 1-1.076.18 3.04 3.04 0 0 1-1.494-.37 2.722 2.722 0 0 1-1.058-1.045 3.075 3.075 0 0 1-.393-1.571c0-.603.132-1.134.396-1.594a2.72 2.72 0 0 1 1.082-1.068 2.998 2.998 0 0 1 1.528-.39c.4 0 .759.062 1.076.186.317.125.59.307.819.547l.064-.548h1.32l-.56 4.316c-.032.228-.048.404-.048.53 0 .346.084.602.25.768.167.166.398.25.693.25.4 0 .771-.094 1.114-.28a2.59 2.59 0 0 0 .91-.824c.243-.36.367-.793.367-1.298 0-.72-.17-1.36-.51-1.92a3.526 3.526 0 0 0-1.388-1.323 4.034 4.034 0 0 0-1.968-.481c-.78 0-1.49.168-2.13.504a3.768 3.768 0 0 0-1.507 1.424c-.367.614-.55 1.323-.55 2.127 0 .797.183 1.51.55 2.138.366.627.872 1.117 1.518 1.47.646.352 1.39.528 2.232.528.486 0 .96-.06 1.42-.18a5.43 5.43 0 0 0 1.285-.507l.575 1.19zm-6.86-3.147c0 .36.105.652.317.877.212.225.493.337.843.337.324 0 .608-.08.851-.24a1.57 1.57 0 0 0 .565-.655c.134-.277.2-.588.2-.934 0-.36-.106-.652-.316-.877a1.05 1.05 0 0 0-.807-.337c-.328 0-.615.08-.861.24a1.624 1.624 0 0 0-.577.655 2.062 2.062 0 0 0-.216.934z"
          />
        </svg>
      )

    case 'gmx':
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={iconClass}
          aria-label="GMX"
        >
          <path
            fill="#1C449B"
            d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.5 16.5h-3V12L12 15l-2.5-3v4.5h-3v-9h3l2.5 3 2.5-3h3v9z"
          />
        </svg>
      )

    default:
      // 기본 이메일 아이콘 (알 수 없는 서비스)
      return (
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={cn(iconClass, 'text-muted-foreground')}
          aria-label="Email"
          fill="currentColor"
        >
          <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
        </svg>
      )
  }
}
