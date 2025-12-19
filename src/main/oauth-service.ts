/**
 * OAuth Service for Email Account Authentication
 * Supports Gmail (Google) and Outlook (Microsoft) OAuth 2.0
 */

import { BrowserWindow } from 'electron'
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { logger, LogCategory } from './logger'
import icon from '../../resources/icon.png?asset'
import {
  saveOAuthConfig as saveConfig,
  getOAuthConfig as getConfig,
  saveOAuthTokens as saveTokens,
  getOAuthTokens as getTokens,
  deleteOAuthTokens as deleteTokens,
  isOAuthAccount as isOAuth,
  type OAuthProvider,
  type OAuthTokens,
  type OAuthConfig
} from './settings/unified-config'

// Re-export types
export type { OAuthProvider, OAuthTokens, OAuthConfig }

// =====================================================
// 타입 정의 (unified-config에서 가져옴)
// =====================================================

// =====================================================
// OAuth 설정
// =====================================================

// Google OAuth 설정
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const GOOGLE_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
]

// Microsoft OAuth 설정
const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const MICROSOFT_USERINFO_URL = 'https://graph.microsoft.com/v1.0/me'
const MICROSOFT_SCOPES = [
  'https://outlook.office.com/IMAP.AccessAsUser.All',
  'https://outlook.office.com/SMTP.Send',
  'offline_access',
  'openid',
  'profile',
  'email'
]

// 로컬 콜백 서버 포트
const OAUTH_CALLBACK_PORT = 8235
const OAUTH_REDIRECT_URI = `http://localhost:${OAUTH_CALLBACK_PORT}/oauth/callback`

// OAuth 결과 페이지 HTML 템플릿
function getOAuthResultHTML(success: boolean, email?: string, errorMsg?: string): string {
  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #1e3a5f 0%, #0f1c2e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 48px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    .icon {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 36px;
    }
    .icon.success { background: #dcfce7; color: #16a34a; }
    .icon.error { background: #fee2e2; color: #dc2626; }
    h1 {
      font-size: 24px;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 12px;
    }
    .email {
      font-size: 16px;
      color: #3b82f6;
      font-weight: 500;
      margin-bottom: 8px;
    }
    .message {
      font-size: 14px;
      color: #6b7280;
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .hint {
      font-size: 13px;
      color: #9ca3af;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
    }
    .brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 32px;
      color: #64748b;
      font-size: 14px;
    }
    .brand svg { width: 24px; height: 24px; }
  `

  if (success && email) {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>인증 성공 - MailVista</title>
  <style>${styles}</style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
      </svg>
      <span>MailVista</span>
    </div>
    <div class="icon success">✓</div>
    <h1>인증 성공!</h1>
    <p class="email">${email}</p>
    <p class="message">계정이 성공적으로 연결되었습니다.</p>
    <p class="hint">이 창은 자동으로 닫히거나 직접 닫으셔도 됩니다.</p>
  </div>
  <script>setTimeout(() => window.close(), 3000);</script>
</body>
</html>`
  } else {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>인증 실패 - MailVista</title>
  <style>${styles}</style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
      </svg>
      <span>MailVista</span>
    </div>
    <div class="icon error">✕</div>
    <h1>인증 실패</h1>
    <p class="message">${errorMsg || '인증 과정에서 오류가 발생했습니다.'}</p>
    <p class="hint">이 창을 닫고 다시 시도해 주세요.</p>
  </div>
</body>
</html>`
  }
}

// =====================================================
// 스토어 - unified-config 사용
// =====================================================

// =====================================================
// 내장 OAuth 자격 증명 로드
// =====================================================

interface EmbeddedGoogleCredentials {
  installed: {
    client_id: string
    client_secret: string
    project_id?: string
    auth_uri?: string
    token_uri?: string
    redirect_uris?: string[]
  }
}

let embeddedGoogleConfig: OAuthConfig | null = null

/**
 * 내장된 Google OAuth 자격 증명 로드
 */
function loadEmbeddedGoogleCredentials(): OAuthConfig | null {
  if (embeddedGoogleConfig) {
    return embeddedGoogleConfig
  }

  try {
    // 여러 가능한 경로 시도
    const possiblePaths = [
      // 빌드 환경: extraResources로 복사된 경로
      path.join(process.resourcesPath || '', 'config', 'oauth-credentials.json'),
      // 개발 환경: electron-vite는 out/main으로 컴파일
      // __dirname = <project>/out/main
      path.join(__dirname, '..', '..', 'src', 'main', 'config', 'oauth-credentials.json'),
      path.join(__dirname, 'config', 'oauth-credentials.json'),
      path.join(__dirname, '..', 'config', 'oauth-credentials.json'),
      // 빌드 환경 (asar 내부)
      path.join(
        process.resourcesPath || '',
        'app.asar',
        'out',
        'main',
        'config',
        'oauth-credentials.json'
      ),
      path.join(
        process.resourcesPath || '',
        'app',
        'out',
        'main',
        'config',
        'oauth-credentials.json'
      )
    ]

    logger.debug(LogCategory.AUTH, 'Searching for OAuth credentials in paths', {
      __dirname,
      resourcesPath: process.resourcesPath,
      paths: possiblePaths
    })

    for (const credPath of possiblePaths) {
      if (fs.existsSync(credPath)) {
        const content = fs.readFileSync(credPath, 'utf-8')
        const credentials: EmbeddedGoogleCredentials = JSON.parse(content)

        if (credentials.installed?.client_id && credentials.installed?.client_secret) {
          embeddedGoogleConfig = {
            clientId: credentials.installed.client_id,
            clientSecret: credentials.installed.client_secret
          }
          logger.info(
            LogCategory.AUTH,
            `Loaded embedded Google OAuth credentials from: ${credPath}`
          )
          return embeddedGoogleConfig
        }
      }
    }

    logger.warn(LogCategory.AUTH, 'Embedded Google OAuth credentials not found')
    return null
  } catch (error) {
    logger.error(LogCategory.AUTH, 'Failed to load embedded Google OAuth credentials', { error })
    return null
  }
}

/**
 * 내장된 OAuth 자격 증명이 있는지 확인
 */
export function hasEmbeddedOAuthCredentials(provider: OAuthProvider): boolean {
  if (provider === 'google') {
    return loadEmbeddedGoogleCredentials() !== null
  }
  // Microsoft는 현재 내장 자격 증명 없음
  return false
}

// =====================================================
// OAuth 설정 관리 (unified-config 위임)
// =====================================================

/**
 * OAuth 설정 저장
 */
export function saveOAuthConfig(provider: OAuthProvider, config: OAuthConfig): void {
  saveConfig(provider, config)
  logger.info(LogCategory.AUTH, `OAuth config saved for ${provider}`)
}

/**
 * OAuth 설정 조회 (사용자 설정 우선, 없으면 내장 자격 증명 사용)
 */
export function getOAuthConfig(provider: OAuthProvider): OAuthConfig | undefined {
  // 1. 사용자가 직접 설정한 자격 증명 확인
  const config = getConfig(provider)
  if (config) {
    return config
  }

  // 2. 내장된 자격 증명 사용
  if (provider === 'google') {
    const embedded = loadEmbeddedGoogleCredentials()
    if (embedded) {
      return embedded
    }
  }

  return undefined
}

/**
 * OAuth 토큰 저장
 */
export function saveOAuthTokens(email: string, provider: OAuthProvider, tokens: OAuthTokens): void {
  saveTokens(email, provider, tokens)
  logger.info(LogCategory.AUTH, `OAuth tokens saved for ${email}`)
}

/**
 * OAuth 토큰 조회
 */
export function getOAuthTokens(
  email: string
): { provider: OAuthProvider; tokens: OAuthTokens } | undefined {
  return getTokens(email)
}

/**
 * OAuth 토큰 삭제
 */
export function deleteOAuthTokens(email: string): void {
  deleteTokens(email)
  logger.info(LogCategory.AUTH, `OAuth tokens deleted for ${email}`)
}

/**
 * 계정이 OAuth를 사용하는지 확인
 */
export function isOAuthAccount(email: string): boolean {
  return isOAuth(email)
}

// =====================================================
// Google OAuth
// =====================================================

/**
 * 내장 자격 증명으로 Google OAuth 인증 시작 (사용자가 자격 증명 입력 불필요)
 */
export async function startGoogleOAuthWithEmbeddedCredentials(): Promise<{
  success: boolean
  email?: string
  tokens?: OAuthTokens
  error?: string
}> {
  const config = getOAuthConfig('google')
  if (!config) {
    return { success: false, error: 'No Google OAuth credentials available' }
  }
  return startGoogleOAuth(config.clientId, config.clientSecret)
}

/**
 * Google OAuth 인증 시작
 */
export async function startGoogleOAuth(
  clientId: string,
  clientSecret: string
): Promise<{
  success: boolean
  email?: string
  tokens?: OAuthTokens
  error?: string
}> {
  return new Promise((resolve) => {
    logger.info(LogCategory.AUTH, 'Starting Google OAuth flow')

    // OAuth 설정 저장
    saveOAuthConfig('google', { clientId, clientSecret })

    // 인증 URL 생성
    const authUrl = new URL(GOOGLE_AUTH_URL)
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', GOOGLE_SCOPES.join(' '))
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')

    // 로컬 콜백 서버 생성
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '', `http://localhost:${OAUTH_CALLBACK_PORT}`)

      if (url.pathname === '/oauth/callback') {
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(getOAuthResultHTML(false, undefined, error))
          server.close()
          resolve({ success: false, error })
          return
        }

        if (!code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(getOAuthResultHTML(false, undefined, '인증 코드가 없습니다.'))
          server.close()
          resolve({ success: false, error: 'No authorization code' })
          return
        }

        try {
          // Authorization code로 토큰 교환
          const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: OAUTH_REDIRECT_URI,
              grant_type: 'authorization_code'
            })
          })

          const tokenData = await tokenResponse.json()

          if (!tokenResponse.ok || !tokenData.access_token) {
            throw new Error(tokenData.error_description || 'Token exchange failed')
          }

          // 사용자 정보 가져오기
          const userResponse = await fetch(GOOGLE_USERINFO_URL, {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
          })
          const userData = await userResponse.json()

          if (!userResponse.ok || !userData.email) {
            throw new Error('Failed to get user info')
          }

          const tokens: OAuthTokens = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: Date.now() + tokenData.expires_in * 1000,
            scope: tokenData.scope,
            email: userData.email
          }

          // 토큰 저장
          saveOAuthTokens(userData.email, 'google', tokens)

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(getOAuthResultHTML(true, userData.email))

          server.close()
          logger.info(LogCategory.AUTH, `Google OAuth successful for ${userData.email}`)
          resolve({ success: true, email: userData.email, tokens })
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(getOAuthResultHTML(false, undefined, errorMsg))
          server.close()
          logger.error(LogCategory.AUTH, 'Google OAuth error', { error: errorMsg })
          resolve({ success: false, error: errorMsg })
        }
      }
    })

    server.listen(OAUTH_CALLBACK_PORT, () => {
      logger.debug(
        LogCategory.AUTH,
        `OAuth callback server listening on port ${OAUTH_CALLBACK_PORT}`
      )

      // 브라우저 창 열기
      const authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        icon: icon,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      authWindow.setMenuBarVisibility(false)
      authWindow.loadURL(authUrl.toString())

      authWindow.on('closed', () => {
        // 창이 닫히면 서버도 닫기 (타임아웃 방지)
        setTimeout(() => {
          server.close()
        }, 1000)
      })
    })

    // 타임아웃 (5분)
    setTimeout(
      () => {
        server.close()
        resolve({ success: false, error: 'OAuth timeout' })
      },
      5 * 60 * 1000
    )
  })
}

// =====================================================
// Microsoft OAuth
// =====================================================

/**
 * Microsoft OAuth 인증 시작
 */
export async function startMicrosoftOAuth(
  clientId: string,
  clientSecret: string
): Promise<{
  success: boolean
  email?: string
  tokens?: OAuthTokens
  error?: string
}> {
  return new Promise((resolve) => {
    logger.info(LogCategory.AUTH, 'Starting Microsoft OAuth flow')

    // OAuth 설정 저장
    saveOAuthConfig('microsoft', { clientId, clientSecret })

    // 인증 URL 생성
    const authUrl = new URL(MICROSOFT_AUTH_URL)
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', MICROSOFT_SCOPES.join(' '))
    authUrl.searchParams.set('response_mode', 'query')

    // 로컬 콜백 서버 생성
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '', `http://localhost:${OAUTH_CALLBACK_PORT}`)

      if (url.pathname === '/oauth/callback') {
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')

        if (error) {
          const errorDesc = url.searchParams.get('error_description') || error
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(getOAuthResultHTML(false, undefined, errorDesc))
          server.close()
          resolve({ success: false, error: errorDesc })
          return
        }

        if (!code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(getOAuthResultHTML(false, undefined, '인증 코드가 없습니다.'))
          server.close()
          resolve({ success: false, error: 'No authorization code' })
          return
        }

        try {
          // Authorization code로 토큰 교환
          const tokenResponse = await fetch(MICROSOFT_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: OAUTH_REDIRECT_URI,
              grant_type: 'authorization_code'
            })
          })

          const tokenData = await tokenResponse.json()

          if (!tokenResponse.ok || !tokenData.access_token) {
            throw new Error(tokenData.error_description || 'Token exchange failed')
          }

          // 사용자 정보 가져오기
          const userResponse = await fetch(MICROSOFT_USERINFO_URL, {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
          })
          const userData = await userResponse.json()

          if (!userResponse.ok) {
            throw new Error('Failed to get user info')
          }

          const email = userData.mail || userData.userPrincipalName

          const tokens: OAuthTokens = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: Date.now() + tokenData.expires_in * 1000,
            scope: tokenData.scope,
            email
          }

          // 토큰 저장
          saveOAuthTokens(email, 'microsoft', tokens)

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(getOAuthResultHTML(true, email))

          server.close()
          logger.info(LogCategory.AUTH, `Microsoft OAuth successful for ${email}`)
          resolve({ success: true, email, tokens })
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(getOAuthResultHTML(false, undefined, errorMsg))
          server.close()
          logger.error(LogCategory.AUTH, 'Microsoft OAuth error', { error: errorMsg })
          resolve({ success: false, error: errorMsg })
        }
      }
    })

    server.listen(OAUTH_CALLBACK_PORT, () => {
      logger.debug(
        LogCategory.AUTH,
        `OAuth callback server listening on port ${OAUTH_CALLBACK_PORT}`
      )

      // 브라우저 창 열기
      const authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        icon: icon,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      authWindow.setMenuBarVisibility(false)
      authWindow.loadURL(authUrl.toString())

      authWindow.on('closed', () => {
        setTimeout(() => {
          server.close()
        }, 1000)
      })
    })

    // 타임아웃 (5분)
    setTimeout(
      () => {
        server.close()
        resolve({ success: false, error: 'OAuth timeout' })
      },
      5 * 60 * 1000
    )
  })
}

// =====================================================
// 토큰 갱신
// =====================================================

/**
 * Google 토큰 갱신
 */
export async function refreshGoogleToken(email: string): Promise<{
  success: boolean
  tokens?: OAuthTokens
  error?: string
}> {
  const stored = getOAuthTokens(email)
  if (!stored || stored.provider !== 'google') {
    return { success: false, error: 'No Google tokens found' }
  }

  const config = getOAuthConfig('google')
  if (!config) {
    return { success: false, error: 'No Google OAuth config found' }
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: stored.tokens.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token'
      })
    })

    const data = await response.json()

    if (!response.ok || !data.access_token) {
      throw new Error(data.error_description || 'Token refresh failed')
    }

    const newTokens: OAuthTokens = {
      ...stored.tokens,
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000
    }

    saveOAuthTokens(email, 'google', newTokens)
    logger.info(LogCategory.AUTH, `Google token refreshed for ${email}`)

    return { success: true, tokens: newTokens }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    logger.error(LogCategory.AUTH, 'Google token refresh error', { error: errorMsg })
    return { success: false, error: errorMsg }
  }
}

/**
 * Microsoft 토큰 갱신
 */
export async function refreshMicrosoftToken(email: string): Promise<{
  success: boolean
  tokens?: OAuthTokens
  error?: string
}> {
  const stored = getOAuthTokens(email)
  if (!stored || stored.provider !== 'microsoft') {
    return { success: false, error: 'No Microsoft tokens found' }
  }

  const config = getOAuthConfig('microsoft')
  if (!config) {
    return { success: false, error: 'No Microsoft OAuth config found' }
  }

  try {
    const response = await fetch(MICROSOFT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: stored.tokens.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
        scope: MICROSOFT_SCOPES.join(' ')
      })
    })

    const data = await response.json()

    if (!response.ok || !data.access_token) {
      throw new Error(data.error_description || 'Token refresh failed')
    }

    const newTokens: OAuthTokens = {
      ...stored.tokens,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || stored.tokens.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000
    }

    saveOAuthTokens(email, 'microsoft', newTokens)
    logger.info(LogCategory.AUTH, `Microsoft token refreshed for ${email}`)

    return { success: true, tokens: newTokens }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    logger.error(LogCategory.AUTH, 'Microsoft token refresh error', { error: errorMsg })
    return { success: false, error: errorMsg }
  }
}

// =====================================================
// XOAUTH2 토큰 생성
// =====================================================

/**
 * IMAP/SMTP XOAUTH2 인증 토큰 생성
 * - token: IMAP용 XOAUTH2 base64 인코딩 토큰
 * - accessToken: SMTP용 raw access token
 */
export async function getXOAuth2Token(email: string): Promise<{
  success: boolean
  token?: string
  accessToken?: string
  error?: string
}> {
  const stored = getOAuthTokens(email)
  if (!stored) {
    return { success: false, error: 'No OAuth tokens found' }
  }

  // 토큰이 만료되었으면 갱신
  if (stored.tokens.expiresAt < Date.now() + 60000) {
    const refreshResult =
      stored.provider === 'google'
        ? await refreshGoogleToken(email)
        : await refreshMicrosoftToken(email)

    if (!refreshResult.success) {
      return { success: false, error: refreshResult.error }
    }

    stored.tokens = refreshResult.tokens!
  }

  // XOAUTH2 토큰 생성 (base64 인코딩) - IMAP용
  const authString = `user=${email}\x01auth=Bearer ${stored.tokens.accessToken}\x01\x01`
  const token = Buffer.from(authString).toString('base64')

  return {
    success: true,
    token, // IMAP용 XOAUTH2 토큰
    accessToken: stored.tokens.accessToken // SMTP용 raw access token
  }
}

/**
 * OAuth 계정의 제공자 정보 반환
 */
export function getOAuthProvider(email: string): OAuthProvider | null {
  const stored = getOAuthTokens(email)
  return stored?.provider || null
}

/**
 * OAuth 서버 설정 반환 (Gmail/Outlook)
 */
export function getOAuthServerConfig(provider: OAuthProvider): {
  imap: { host: string; port: number; secure: boolean }
  smtp: { host: string; port: number; secure: boolean }
} {
  if (provider === 'google') {
    return {
      imap: { host: 'imap.gmail.com', port: 993, secure: true },
      smtp: { host: 'smtp.gmail.com', port: 465, secure: true }
    }
  } else {
    return {
      imap: { host: 'outlook.office365.com', port: 993, secure: true },
      smtp: { host: 'smtp.office365.com', port: 587, secure: false }
    }
  }
}
