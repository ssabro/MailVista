import Database from 'better-sqlite3'
import { getStorageDatabase } from './database'

export interface SearchOptions {
  query: string
  accountIds?: string[]
  accountEmails?: string[]
  folderIds?: string[]
  folderPaths?: string[]
  from?: string
  to?: string
  subject?: string
  hasAttachment?: boolean
  dateFrom?: number
  dateTo?: number
  isUnread?: boolean
  isFlagged?: boolean
  limit?: number
  offset?: number
}

export interface SearchResult {
  emailId: string
  uid: number
  folderId: string
  folderPath: string
  accountId: string
  accountEmail: string
  subject: string | null
  fromName: string | null
  fromAddress: string | null
  toAddresses: string | null
  date: number | null
  flags: string | null
  hasAttachment: boolean
  snippet: string
  rank: number
}

export interface SearchSuggestion {
  type: 'contact' | 'subject' | 'folder'
  value: string
  count: number
}

interface ParsedQuery {
  fieldTerms: Record<string, string[]>
  generalTerms: string[]
}

export class SearchService {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getStorageDatabase().getDatabase()
  }

  // 로컬 검색 (하이브리드: 필드별 검색은 LIKE, 일반 텍스트는 FTS)
  searchLocal(options: SearchOptions): SearchResult[] {
    const { query, limit = 50, offset = 0 } = options

    if (!query.trim()) {
      return []
    }

    // 쿼리 파싱: 필드별 검색과 일반 텍스트 분리
    const parsed = this.parseSearchQuery(query)
    console.log('[Search] Parsed query:', JSON.stringify(parsed))

    // 필드별 검색만 있으면 LIKE 사용, 일반 텍스트만 있으면 FTS, 둘 다 있으면 하이브리드
    if (parsed.generalTerms.length === 0 && Object.keys(parsed.fieldTerms).length > 0) {
      // 필드별 검색만 - LIKE 사용
      return this.searchWithLike(parsed, options, limit, offset)
    } else if (parsed.generalTerms.length > 0 && Object.keys(parsed.fieldTerms).length === 0) {
      // 일반 텍스트만 - FTS 사용
      return this.searchWithFts(parsed.generalTerms, options, limit, offset)
    } else {
      // 하이브리드 - FTS + LIKE 조건
      return this.searchHybrid(parsed, options, limit, offset)
    }
  }

  // 쿼리 파싱: from:, to:, subject: 등 필드별 검색과 일반 텍스트 분리
  private parseSearchQuery(query: string): ParsedQuery {
    const tokens = this.tokenize(query)
    const fieldTerms: Record<string, string[]> = {}
    const generalTerms: string[] = []

    for (const token of tokens) {
      if (token.startsWith('from:')) {
        const value = token.slice(5)
        if (value) {
          fieldTerms.from = fieldTerms.from || []
          fieldTerms.from.push(value)
        }
      } else if (token.startsWith('to:')) {
        const value = token.slice(3)
        if (value) {
          fieldTerms.to = fieldTerms.to || []
          fieldTerms.to.push(value)
        }
      } else if (token.startsWith('subject:')) {
        const value = token.slice(8)
        if (value) {
          fieldTerms.subject = fieldTerms.subject || []
          fieldTerms.subject.push(value)
        }
      } else if (token.startsWith('body:')) {
        const value = token.slice(5)
        if (value) {
          fieldTerms.body = fieldTerms.body || []
          fieldTerms.body.push(value)
        }
      } else if (token.startsWith('-')) {
        // 제외 검색은 일반 텍스트로 처리
        generalTerms.push(token)
      } else if (token) {
        generalTerms.push(token)
      }
    }

    return { fieldTerms, generalTerms }
  }

  // LIKE 기반 필드별 검색
  private searchWithLike(
    parsed: ParsedQuery,
    options: SearchOptions,
    limit: number,
    offset: number
  ): SearchResult[] {
    const params: (string | number)[] = []
    const conditions: string[] = []

    // 필드별 조건 추가
    if (parsed.fieldTerms.from?.length) {
      const fromConditions = parsed.fieldTerms.from.map(
        () => '(e.from_name LIKE ? OR e.from_address LIKE ?)'
      )
      conditions.push(`(${fromConditions.join(' OR ')})`)
      for (const term of parsed.fieldTerms.from) {
        params.push(`%${term}%`, `%${term}%`)
      }
    }

    if (parsed.fieldTerms.to?.length) {
      const toConditions = parsed.fieldTerms.to.map(() => 'e.to_addresses LIKE ?')
      conditions.push(`(${toConditions.join(' OR ')})`)
      for (const term of parsed.fieldTerms.to) {
        params.push(`%${term}%`)
      }
    }

    if (parsed.fieldTerms.subject?.length) {
      const subjectConditions = parsed.fieldTerms.subject.map(() => 'e.subject LIKE ?')
      conditions.push(`(${subjectConditions.join(' OR ')})`)
      for (const term of parsed.fieldTerms.subject) {
        params.push(`%${term}%`)
      }
    }

    if (parsed.fieldTerms.body?.length) {
      const bodyConditions = parsed.fieldTerms.body.map(() => 'e.body_text LIKE ?')
      conditions.push(`(${bodyConditions.join(' OR ')})`)
      for (const term of parsed.fieldTerms.body) {
        params.push(`%${term}%`)
      }
    }

    // 공통 필터 추가
    this.addCommonFilters(conditions, params, options)

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(limit, offset)

    const sql = `
      SELECT
        e.id as emailId,
        e.uid,
        e.folder_id as folderId,
        f.path as folderPath,
        f.account_id as accountId,
        a.email as accountEmail,
        e.subject,
        e.from_name as fromName,
        e.from_address as fromAddress,
        e.to_addresses as toAddresses,
        e.date,
        e.flags,
        e.has_attachment as hasAttachment,
        SUBSTR(e.body_text, 1, 200) as snippet,
        0 as rank
      FROM emails e
      JOIN folders f ON e.folder_id = f.id
      JOIN accounts a ON f.account_id = a.id
      ${whereClause}
      ORDER BY e.date DESC
      LIMIT ? OFFSET ?
    `

    console.log('[Search] LIKE SQL:', sql.replace(/\s+/g, ' ').trim())
    console.log('[Search] LIKE params:', JSON.stringify(params))

    try {
      const results = this.db.prepare(sql).all(...params) as SearchResult[]
      return results.map((r) => ({
        ...r,
        hasAttachment: Boolean(r.hasAttachment)
      }))
    } catch (error) {
      console.error('[Search] LIKE error:', error)
      return []
    }
  }

  // FTS 기반 일반 텍스트 검색
  private searchWithFts(
    generalTerms: string[],
    options: SearchOptions,
    limit: number,
    offset: number
  ): SearchResult[] {
    const ftsQuery = this.buildSimpleFtsQuery(generalTerms)
    console.log('[Search] FTS query:', ftsQuery)

    const params: (string | number)[] = [ftsQuery]
    const conditions: string[] = []

    this.addCommonFilters(conditions, params, options)

    const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : ''
    params.push(limit, offset)

    const sql = `
      SELECT
        e.id as emailId,
        e.uid,
        e.folder_id as folderId,
        f.path as folderPath,
        f.account_id as accountId,
        a.email as accountEmail,
        e.subject,
        e.from_name as fromName,
        e.from_address as fromAddress,
        e.to_addresses as toAddresses,
        e.date,
        e.flags,
        e.has_attachment as hasAttachment,
        snippet(emails_fts, -1, '<mark>', '</mark>', '...', 64) as snippet,
        bm25(emails_fts) as rank
      FROM emails_fts
      JOIN emails e ON emails_fts.rowid = e.rowid
      JOIN folders f ON e.folder_id = f.id
      JOIN accounts a ON f.account_id = a.id
      WHERE emails_fts MATCH ?
      ${whereClause}
      ORDER BY rank
      LIMIT ? OFFSET ?
    `

    try {
      const results = this.db.prepare(sql).all(...params) as SearchResult[]
      return results.map((r) => ({
        ...r,
        hasAttachment: Boolean(r.hasAttachment)
      }))
    } catch (error) {
      console.error('[Search] FTS error:', error)
      return []
    }
  }

  // 하이브리드 검색 (FTS + LIKE)
  private searchHybrid(
    parsed: ParsedQuery,
    options: SearchOptions,
    limit: number,
    offset: number
  ): SearchResult[] {
    const ftsQuery = this.buildSimpleFtsQuery(parsed.generalTerms)
    console.log('[Search] Hybrid FTS query:', ftsQuery)

    const params: (string | number)[] = [ftsQuery]
    const conditions: string[] = []

    // 필드별 LIKE 조건 추가
    if (parsed.fieldTerms.from?.length) {
      const fromConditions = parsed.fieldTerms.from.map(
        () => '(e.from_name LIKE ? OR e.from_address LIKE ?)'
      )
      conditions.push(`(${fromConditions.join(' OR ')})`)
      for (const term of parsed.fieldTerms.from) {
        params.push(`%${term}%`, `%${term}%`)
      }
    }

    if (parsed.fieldTerms.to?.length) {
      const toConditions = parsed.fieldTerms.to.map(() => 'e.to_addresses LIKE ?')
      conditions.push(`(${toConditions.join(' OR ')})`)
      for (const term of parsed.fieldTerms.to) {
        params.push(`%${term}%`)
      }
    }

    if (parsed.fieldTerms.subject?.length) {
      const subjectConditions = parsed.fieldTerms.subject.map(() => 'e.subject LIKE ?')
      conditions.push(`(${subjectConditions.join(' OR ')})`)
      for (const term of parsed.fieldTerms.subject) {
        params.push(`%${term}%`)
      }
    }

    // 공통 필터 추가
    this.addCommonFilters(conditions, params, options)

    const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : ''
    params.push(limit, offset)

    const sql = `
      SELECT
        e.id as emailId,
        e.uid,
        e.folder_id as folderId,
        f.path as folderPath,
        f.account_id as accountId,
        a.email as accountEmail,
        e.subject,
        e.from_name as fromName,
        e.from_address as fromAddress,
        e.to_addresses as toAddresses,
        e.date,
        e.flags,
        e.has_attachment as hasAttachment,
        snippet(emails_fts, -1, '<mark>', '</mark>', '...', 64) as snippet,
        bm25(emails_fts) as rank
      FROM emails_fts
      JOIN emails e ON emails_fts.rowid = e.rowid
      JOIN folders f ON e.folder_id = f.id
      JOIN accounts a ON f.account_id = a.id
      WHERE emails_fts MATCH ?
      ${whereClause}
      ORDER BY rank
      LIMIT ? OFFSET ?
    `

    try {
      const results = this.db.prepare(sql).all(...params) as SearchResult[]
      return results.map((r) => ({
        ...r,
        hasAttachment: Boolean(r.hasAttachment)
      }))
    } catch (error) {
      console.error('[Search] Hybrid error:', error)
      return []
    }
  }

  // 공통 필터 조건 추가
  private addCommonFilters(
    conditions: string[],
    params: (string | number)[],
    options: SearchOptions
  ): void {
    if (options.accountEmails?.length) {
      conditions.push(`a.email IN (${options.accountEmails.map(() => '?').join(',')})`)
      params.push(...options.accountEmails)
    } else if (options.accountIds?.length) {
      conditions.push(`f.account_id IN (${options.accountIds.map(() => '?').join(',')})`)
      params.push(...options.accountIds)
    }

    if (options.folderPaths?.length) {
      conditions.push(`f.path IN (${options.folderPaths.map(() => '?').join(',')})`)
      params.push(...options.folderPaths)
    } else if (options.folderIds?.length) {
      conditions.push(`e.folder_id IN (${options.folderIds.map(() => '?').join(',')})`)
      params.push(...options.folderIds)
    }

    if (options.dateFrom) {
      conditions.push('e.date >= ?')
      params.push(options.dateFrom)
    }
    if (options.dateTo) {
      conditions.push('e.date <= ?')
      params.push(options.dateTo)
    }

    if (options.hasAttachment !== undefined) {
      conditions.push('e.has_attachment = ?')
      params.push(options.hasAttachment ? 1 : 0)
    }

    if (options.isUnread) {
      conditions.push("e.flags NOT LIKE '%\\\\Seen%'")
    }

    if (options.isFlagged) {
      conditions.push("e.flags LIKE '%\\\\Flagged%'")
    }
  }

  // 단순 FTS 쿼리 생성 (일반 텍스트용)
  private buildSimpleFtsQuery(terms: string[]): string {
    const ftsTerms: string[] = []

    for (const term of terms) {
      if (term.startsWith('-')) {
        // 제외 검색
        const value = term.slice(1)
        if (value) {
          const parts = this.splitIntoTokens(value)
          if (parts.length > 0) {
            ftsTerms.push(`NOT ${parts[0]}`)
          }
        }
      } else if (term.startsWith('"') && term.endsWith('"')) {
        // 정확한 구문 검색
        const phrase = term.slice(1, -1)
        if (phrase) {
          ftsTerms.push(`"${phrase.replace(/"/g, '""')}"`)
        }
      } else {
        // 일반 검색어 - 토큰으로 분리
        const parts = this.splitIntoTokens(term)
        for (const part of parts) {
          ftsTerms.push(`${part}*`)
        }
      }
    }

    return ftsTerms.length > 0 ? ftsTerms.join(' AND ') : '*'
  }

  // 고급 필터 검색 (FTS 없이 SQL 조건만)
  searchWithFilters(options: Omit<SearchOptions, 'query'> & { query?: string }): SearchResult[] {
    const { limit = 50, offset = 0 } = options
    const params: (string | number)[] = []
    const conditions: string[] = []

    // 일반 텍스트 검색 (LIKE)
    if (options.query?.trim()) {
      const likeQuery = `%${options.query}%`
      conditions.push(
        '(e.subject LIKE ? OR e.from_name LIKE ? OR e.from_address LIKE ? OR e.body_text LIKE ?)'
      )
      params.push(likeQuery, likeQuery, likeQuery, likeQuery)
    }

    // 발신자 필터
    if (options.from) {
      const fromLike = `%${options.from}%`
      conditions.push('(e.from_name LIKE ? OR e.from_address LIKE ?)')
      params.push(fromLike, fromLike)
    }

    // 수신자 필터
    if (options.to) {
      const toLike = `%${options.to}%`
      conditions.push('e.to_addresses LIKE ?')
      params.push(toLike)
    }

    // 제목 필터
    if (options.subject) {
      conditions.push('e.subject LIKE ?')
      params.push(`%${options.subject}%`)
    }

    // 계정 필터
    if (options.accountEmails?.length) {
      conditions.push(`a.email IN (${options.accountEmails.map(() => '?').join(',')})`)
      params.push(...options.accountEmails)
    }

    // 폴더 필터
    if (options.folderPaths?.length) {
      conditions.push(`f.path IN (${options.folderPaths.map(() => '?').join(',')})`)
      params.push(...options.folderPaths)
    }

    // 날짜 필터
    if (options.dateFrom) {
      conditions.push('e.date >= ?')
      params.push(options.dateFrom)
    }
    if (options.dateTo) {
      conditions.push('e.date <= ?')
      params.push(options.dateTo)
    }

    // 첨부파일 필터
    if (options.hasAttachment !== undefined) {
      conditions.push('e.has_attachment = ?')
      params.push(options.hasAttachment ? 1 : 0)
    }

    // 읽지 않음 필터
    if (options.isUnread) {
      conditions.push('e.flags NOT LIKE \'%"\\\\Seen"%\'')
    }

    // 중요 표시 필터
    if (options.isFlagged) {
      conditions.push('e.flags LIKE \'%"\\\\Flagged"%\'')
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    console.log('[SearchService] searchWithFilters - options:', JSON.stringify(options))
    console.log('[SearchService] searchWithFilters - conditions:', conditions)
    console.log('[SearchService] searchWithFilters - whereClause:', whereClause)
    params.push(limit, offset)

    const sql = `
      SELECT
        e.id as emailId,
        e.uid,
        e.folder_id as folderId,
        f.path as folderPath,
        f.account_id as accountId,
        a.email as accountEmail,
        e.subject,
        e.from_name as fromName,
        e.from_address as fromAddress,
        e.to_addresses as toAddresses,
        e.date,
        e.flags,
        e.has_attachment as hasAttachment,
        SUBSTR(e.body_text, 1, 200) as snippet,
        0 as rank
      FROM emails e
      JOIN folders f ON e.folder_id = f.id
      JOIN accounts a ON f.account_id = a.id
      ${whereClause}
      ORDER BY e.date DESC
      LIMIT ? OFFSET ?
    `

    // Debug: 실제 flags 형식 확인
    try {
      const sampleFlags = this.db
        .prepare('SELECT flags FROM emails WHERE flags IS NOT NULL LIMIT 3')
        .all() as Array<{ flags: string }>
      console.log(
        '[SearchService] Sample flags in DB:',
        sampleFlags.map((f) => f.flags)
      )
    } catch (e) {
      console.error('[SearchService] Failed to get sample flags:', e)
    }

    console.log('[SearchService] Executing SQL:', sql.replace(/\s+/g, ' ').trim())
    console.log('[SearchService] With params:', params)

    const results = this.db.prepare(sql).all(...params) as SearchResult[]
    console.log('[SearchService] Results count:', results.length)
    return results.map((r) => ({
      ...r,
      hasAttachment: Boolean(r.hasAttachment)
    }))
  }

  // 검색 제안 (자동완성)
  getSuggestions(prefix: string, limit: number = 10): SearchSuggestion[] {
    if (!prefix.trim() || prefix.length < 2) {
      return []
    }

    const suggestions: SearchSuggestion[] = []
    const prefixLike = `${prefix}%`

    // 발신자 이름 제안
    const fromNames = this.db
      .prepare(
        `
      SELECT from_name as value, COUNT(*) as count
      FROM emails
      WHERE from_name LIKE ? AND from_name IS NOT NULL
      GROUP BY from_name
      ORDER BY count DESC
      LIMIT ?
    `
      )
      .all(prefixLike, limit) as Array<{ value: string; count: number }>

    for (const item of fromNames) {
      suggestions.push({ type: 'contact', value: item.value, count: item.count })
    }

    // 발신자 주소 제안
    const fromAddresses = this.db
      .prepare(
        `
      SELECT from_address as value, COUNT(*) as count
      FROM emails
      WHERE from_address LIKE ? AND from_address IS NOT NULL
      GROUP BY from_address
      ORDER BY count DESC
      LIMIT ?
    `
      )
      .all(prefixLike, limit) as Array<{ value: string; count: number }>

    for (const item of fromAddresses) {
      if (!suggestions.some((s) => s.value === item.value)) {
        suggestions.push({ type: 'contact', value: item.value, count: item.count })
      }
    }

    // 제목 제안 (단어 매칭)
    const subjects = this.db
      .prepare(
        `
      SELECT subject as value, COUNT(*) as count
      FROM emails
      WHERE subject LIKE ? AND subject IS NOT NULL
      GROUP BY subject
      ORDER BY count DESC
      LIMIT ?
    `
      )
      .all(`%${prefix}%`, Math.ceil(limit / 2)) as Array<{ value: string; count: number }>

    for (const item of subjects) {
      suggestions.push({ type: 'subject', value: item.value, count: item.count })
    }

    // 결과 정렬 및 제한
    return suggestions.sort((a, b) => b.count - a.count).slice(0, limit)
  }

  // 토큰화 (따옴표 구문 유지)
  private tokenize(query: string): string[] {
    const tokens: string[] = []
    let current = ''
    let inQuotes = false

    for (const char of query) {
      if (char === '"') {
        if (inQuotes) {
          current += char
          tokens.push(current)
          current = ''
        } else {
          if (current) {
            tokens.push(...current.trim().split(/\s+/))
          }
          current = char
        }
        inQuotes = !inQuotes
      } else if (char === ' ' && !inQuotes) {
        if (current) {
          tokens.push(current)
          current = ''
        }
      } else {
        current += char
      }
    }

    if (current) {
      if (inQuotes) {
        // 닫히지 않은 따옴표 - 일반 토큰으로 처리
        tokens.push(...current.replace(/"/g, '').trim().split(/\s+/))
      } else {
        tokens.push(current)
      }
    }

    return tokens.filter(Boolean)
  }

  // 이메일/텍스트를 FTS 토큰으로 분리 (FTS 토크나이저와 동일하게)
  private splitIntoTokens(value: string): string[] {
    // FTS5 unicode61 토크나이저는 @, ., -, _ 등으로 토큰을 분리
    return value
      .toLowerCase()
      .split(/[@.\-_\s]+/) // 특수문자로 분리
      .map((t) => t.replace(/[^\w가-힣]/g, '')) // 알파벳, 숫자, 한글만 유지
      .filter((t) => t.length > 0) // 빈 문자열 제거
  }

  // 검색 결과 개수 (하이브리드 검색 사용)
  getSearchCount(options: SearchOptions): number {
    const { query } = options

    if (!query.trim()) {
      return 0
    }

    // 검색 결과를 직접 가져와서 개수 반환 (간단한 구현)
    const results = this.searchLocal({ ...options, limit: 1000, offset: 0 })
    return results.length
  }
}

// 싱글톤 인스턴스
let searchServiceInstance: SearchService | null = null

export function getSearchService(): SearchService {
  if (!searchServiceInstance) {
    searchServiceInstance = new SearchService()
  }
  return searchServiceInstance
}
