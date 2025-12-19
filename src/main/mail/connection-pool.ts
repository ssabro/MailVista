/**
 * IMAP 연결 풀 시스템
 * - 계정별 연결 풀 관리
 * - 유휴 연결 재사용
 * - 자동 정리
 */
import { ImapFlow } from 'imapflow'
import type { MailboxLockObject } from 'imapflow'
import type { AccountConfig } from '../account/types'

// 풀링된 연결 정보
export interface PooledConnection {
  client: ImapFlow
  inUse: boolean
  lastUsed: number
  account: string
  currentMailbox?: string
  mailboxLock?: MailboxLockObject
}

class ImapConnectionPool {
  private pools: Map<string, PooledConnection[]> = new Map()
  private maxConnectionsPerAccount = 3
  private idleTimeout = 5 * 60 * 1000 // 5분
  private cleanupInterval: NodeJS.Timeout | null = null
  private pendingAcquires: Map<
    string,
    Array<{
      resolve: (conn: PooledConnection) => void
      reject: (err: Error) => void
    }>
  > = new Map()
  // 생성 중인 연결 수를 추적 (경쟁 조건 방지)
  private pendingCreations: Map<string, number> = new Map()

  constructor() {
    // 주기적으로 유휴 연결 정리 (1분마다)
    this.cleanupInterval = setInterval(() => this.cleanupIdleConnections(), 60000)
  }

  /**
   * 연결 획득 (기존 유휴 연결 사용 또는 새 연결 생성)
   */
  async acquire(account: AccountConfig): Promise<PooledConnection> {
    const key = account.email
    let pool = this.pools.get(key)

    if (!pool) {
      pool = []
      this.pools.set(key, pool)
    }

    // 1. 사용 가능한 유휴 연결 찾기
    const idleConn = pool.find((c) => !c.inUse)
    if (idleConn) {
      // 연결이 유효한지 확인
      if (!this.isConnectionValid(idleConn)) {
        console.log(`[Pool] Removing invalid connection for ${key}`)
        this.remove(idleConn)
        // 재귀적으로 다시 연결 획득 시도
        return this.acquire(account)
      }
      idleConn.inUse = true
      idleConn.lastUsed = Date.now()
      console.log(
        `[Pool] Reusing connection for ${key} (${pool.filter((c) => c.inUse).length}/${pool.length} in use)`
      )
      return idleConn
    }

    // 2. 풀에 여유가 있으면 새 연결 생성 (생성 중인 연결도 고려)
    const pendingCount = this.pendingCreations.get(key) || 0
    const totalConnections = pool.length + pendingCount

    if (totalConnections < this.maxConnectionsPerAccount) {
      // 생성 중인 연결 수 증가
      this.pendingCreations.set(key, pendingCount + 1)
      console.log(
        `[Pool] Creating new connection for ${key} (${totalConnections + 1}/${this.maxConnectionsPerAccount})`
      )

      try {
        const newConn = await this.createConnection(account)
        pool.push(newConn)
        return newConn
      } catch (err) {
        // 생성 실패 시 대기 중인 요청에 연결 할당 시도
        const pending = this.pendingAcquires.get(key)
        if (pending && pending.length > 0) {
          const waiter = pending.shift()!
          waiter.reject(err as Error)
        }
        throw err
      } finally {
        // 생성 중인 연결 수 감소
        const current = this.pendingCreations.get(key) || 1
        this.pendingCreations.set(key, Math.max(0, current - 1))
      }
    }

    // 3. 풀이 가득 찬 경우 대기
    console.log(
      `[Pool] Pool full for ${key} (${pool.length} + ${pendingCount} pending), waiting for available connection...`
    )
    return new Promise((resolve, reject) => {
      let pending = this.pendingAcquires.get(key)
      if (!pending) {
        pending = []
        this.pendingAcquires.set(key, pending)
      }

      // 30초 타임아웃
      const timeout = setTimeout(() => {
        const idx = pending!.findIndex((p) => p.resolve === resolve)
        if (idx !== -1) {
          pending!.splice(idx, 1)
          reject(new Error('Connection pool acquire timeout'))
        }
      }, 30000)

      pending.push({
        resolve: (conn) => {
          clearTimeout(timeout)
          resolve(conn)
        },
        reject
      })
    })
  }

  /**
   * 연결 반환
   */
  release(conn: PooledConnection): void {
    // mailbox lock 해제
    if (conn.mailboxLock) {
      try {
        conn.mailboxLock.release()
      } catch {
        // 무시
      }
      conn.mailboxLock = undefined
      conn.currentMailbox = undefined
    }

    conn.inUse = false
    conn.lastUsed = Date.now()

    // 대기 중인 요청이 있으면 즉시 할당
    const pending = this.pendingAcquires.get(conn.account)
    if (pending && pending.length > 0) {
      const waiter = pending.shift()!
      conn.inUse = true
      waiter.resolve(conn)
      console.log(`[Pool] Connection assigned to waiting request for ${conn.account}`)
    } else {
      console.log(`[Pool] Connection released for ${conn.account}`)
    }
  }

  /**
   * 연결 제거 (에러 발생 시)
   */
  remove(conn: PooledConnection): void {
    const pool = this.pools.get(conn.account)
    if (pool) {
      const idx = pool.indexOf(conn)
      if (idx !== -1) {
        pool.splice(idx, 1)
        console.log(`[Pool] Connection removed for ${conn.account} (${pool.length} remaining)`)
      }
    }

    // mailbox lock 해제
    if (conn.mailboxLock) {
      try {
        conn.mailboxLock.release()
      } catch {
        // 무시
      }
      conn.mailboxLock = undefined
      conn.currentMailbox = undefined
    }

    try {
      conn.client.logout().catch(() => {})
    } catch {
      // 연결이 이미 종료된 경우 무시
    }
  }

  /**
   * 새 연결 생성
   */
  private async createConnection(account: AccountConfig): Promise<PooledConnection> {
    // OAuth 또는 비밀번호 인증에 따라 ImapFlow 설정 구성
    // ImapFlow는 raw accessToken을 받아 내부적으로 XOAUTH2 처리
    const imapConfig = {
      host: account.incoming.host,
      port: account.incoming.port,
      secure: account.incoming.secure,
      auth:
        account.useOAuth && account.accessToken
          ? {
              user: account.email,
              accessToken: account.accessToken
            }
          : {
              user: account.email,
              pass: account.password
            },
      tls: {
        rejectUnauthorized: false
      },
      logger: false as const,
      emitLogs: false,
      // Gmail 등은 OAUTHBEARER를 지원하지 않으므로 XOAUTH2 강제 사용
      disabledCapabilities: account.useOAuth && account.accessToken ? ['AUTH=OAUTHBEARER'] : []
    }

    console.log(
      `[Pool] Creating IMAP connection for ${account.email} (OAuth: ${!!account.useOAuth})`
    )
    const client = new ImapFlow(imapConfig)

    const pooledConn: PooledConnection = {
      client,
      inUse: true,
      lastUsed: Date.now(),
      account: account.email
    }

    // 연결이 끊어지면 풀에서 제거
    client.on('close', () => {
      console.log(`[Pool] Connection closed for ${account.email}`)
      this.remove(pooledConn)
    })

    // 런타임 에러 처리 (ECONNRESET 등)
    client.on('error', (err: Error) => {
      console.error(`[Pool] Connection error for ${account.email}:`, err.message)
      // 연결 오류 시 풀에서 제거
      this.remove(pooledConn)
    })

    // 연결 시도
    await client.connect()
    return pooledConn
  }

  /**
   * 연결이 유효한지 확인
   */
  private isConnectionValid(conn: PooledConnection): boolean {
    try {
      // ImapFlow 연결 상태 확인
      return conn.client.usable === true
    } catch {
      return false
    }
  }

  /**
   * 유휴 연결 정리
   */
  private cleanupIdleConnections(): void {
    const now = Date.now()

    for (const [key, pool] of this.pools) {
      const toRemove: PooledConnection[] = []

      for (const conn of pool) {
        // 사용 중이지 않고 유휴 시간 초과된 연결 제거
        if (!conn.inUse && now - conn.lastUsed > this.idleTimeout) {
          toRemove.push(conn)
        }
      }

      for (const conn of toRemove) {
        console.log(`[Pool] Removing idle connection for ${key}`)
        this.remove(conn)
      }
    }
  }

  /**
   * 특정 계정의 모든 연결 종료
   */
  closeAll(email?: string): void {
    if (email) {
      const pool = this.pools.get(email)
      if (pool) {
        for (const conn of pool) {
          // mailbox lock 해제
          if (conn.mailboxLock) {
            try {
              conn.mailboxLock.release()
            } catch {
              // 무시
            }
          }
          try {
            conn.client.logout().catch(() => {})
          } catch {
            // 무시
          }
        }
        this.pools.delete(email)
        console.log(`[Pool] Closed all connections for ${email}`)
      }
    } else {
      for (const [key, pool] of this.pools) {
        for (const conn of pool) {
          // mailbox lock 해제
          if (conn.mailboxLock) {
            try {
              conn.mailboxLock.release()
            } catch {
              // 무시
            }
          }
          try {
            conn.client.logout().catch(() => {})
          } catch {
            // 무시
          }
        }
        console.log(`[Pool] Closed all connections for ${key}`)
      }
      this.pools.clear()
    }
  }

  /**
   * 정리
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.closeAll()
  }
}

// 전역 연결 풀 인스턴스
const connectionPool = new ImapConnectionPool()

/**
 * 연결 풀에서 연결 획득
 */
export function acquireConnection(account: AccountConfig): Promise<PooledConnection> {
  return connectionPool.acquire(account)
}

/**
 * 연결 풀에 연결 반환
 */
export function releaseConnection(conn: PooledConnection): void {
  connectionPool.release(conn)
}

/**
 * 연결 풀에서 연결 제거
 */
export function removeConnection(conn: PooledConnection): void {
  connectionPool.remove(conn)
}

/**
 * 연결 풀 정리 (앱 종료 시 호출)
 */
export function cleanupConnectionPool(email?: string): void {
  connectionPool.closeAll(email)
}

/**
 * 연결 풀 완전 종료 (앱 종료 시 호출)
 */
export function destroyConnectionPool(): void {
  connectionPool.destroy()
}

/**
 * IMAP 연결 생성 헬퍼 (연결 풀을 사용하지 않는 경우)
 */
export async function createImapConnection(account: AccountConfig): Promise<ImapFlow> {
  // ImapFlow는 raw accessToken을 받아 내부적으로 XOAUTH2 처리
  const config = {
    host: account.incoming.host,
    port: account.incoming.port,
    secure: account.incoming.secure,
    auth:
      account.useOAuth && account.accessToken
        ? {
            user: account.email,
            accessToken: account.accessToken
          }
        : {
            user: account.email,
            pass: account.password
          },
    tls: {
      rejectUnauthorized: false
    },
    logger: false as const,
    emitLogs: false,
    // Gmail 등은 OAUTHBEARER를 지원하지 않으므로 XOAUTH2 강제 사용
    disabledCapabilities: account.useOAuth && account.accessToken ? ['AUTH=OAUTHBEARER'] : []
  }

  const client = new ImapFlow(config)
  await client.connect()
  return client
}
