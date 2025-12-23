/**
 * 계정 관련 타입 정의
 */

// 서버 설정
export interface ServerConfig {
  host: string
  port: number
  secure: boolean
}

// 계정 설정 (비밀번호 포함 - 런타임용)
export interface AccountConfig {
  email: string
  password: string
  name: string
  protocol: 'imap'
  incoming: ServerConfig
  outgoing: ServerConfig
}

// 저장된 계정 정보 (비밀번호 암호화됨 - 저장용)
export interface StoredAccount {
  email: string
  encryptedPassword: string
  name: string
  protocol: 'imap'
  incoming: ServerConfig
  outgoing: ServerConfig
  isDefault?: boolean
}

// 계정 저장 결과
export interface SaveAccountResult {
  success: boolean
  error?: string
}

// 계정 삭제 결과
export interface DeleteAccountResult {
  success: boolean
}

// 기본 계정 설정 결과
export interface SetDefaultResult {
  success: boolean
  error?: string
}
