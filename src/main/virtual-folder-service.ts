/**
 * 가상 폴더 서비스
 * @deprecated SQLite로 마이그레이션됨. storage/virtual-folders-repository.ts 사용
 */

// Storage 함수들 re-export
export {
  type VirtualFolderCondition,
  type VirtualFolder,
  getVirtualFolders,
  createVirtualFolder,
  updateVirtualFolder,
  deleteVirtualFolder
} from './storage/virtual-folders-repository'

/**
 * 가상 폴더 조건에 맞는 IMAP 검색 쿼리 생성
 */
export function buildSearchQuery(folder: {
  conditions: Array<{
    field: string
    operator: string
    value: string | boolean
  }>
}): object[] {
  const queries: object[] = []

  for (const condition of folder.conditions) {
    let query: object | null = null

    switch (condition.field) {
      case 'from':
        if (condition.operator === 'contains' || condition.operator === 'equals') {
          query = { from: String(condition.value) }
        }
        break

      case 'to':
        if (condition.operator === 'contains' || condition.operator === 'equals') {
          query = { to: String(condition.value) }
        }
        break

      case 'subject':
        if (condition.operator === 'contains' || condition.operator === 'equals') {
          query = { subject: String(condition.value) }
        }
        break

      case 'body':
        if (condition.operator === 'contains') {
          query = { body: String(condition.value) }
        }
        break

      case 'hasAttachment':
        // IMAP doesn't have a direct attachment filter, skip for now
        break

      case 'isUnread':
        if (condition.value === true) {
          query = { unseen: true }
        } else {
          query = { seen: true }
        }
        break

      case 'isStarred':
        if (condition.value === true) {
          query = { flagged: true }
        } else {
          query = { unflagged: true }
        }
        break

      case 'date':
        if (condition.operator === 'before') {
          query = { before: new Date(String(condition.value)) }
        } else if (condition.operator === 'after') {
          query = { since: new Date(String(condition.value)) }
        }
        break
    }

    if (query) {
      queries.push(query)
    }
  }

  return queries
}

/**
 * 이메일이 가상 폴더 조건과 일치하는지 확인
 */
export function matchesVirtualFolder(
  email: {
    from?: { address: string; name?: string }[]
    to?: { address: string; name?: string }[]
    subject?: string
    text?: string
    hasAttachment?: boolean
    flags?: string[]
    date?: string | Date
  },
  folder: {
    conditions: Array<{
      field: string
      operator: string
      value: string | boolean
    }>
    conditionLogic: 'and' | 'or'
  }
): boolean {
  const results: boolean[] = []

  for (const condition of folder.conditions) {
    let matches = false

    switch (condition.field) {
      case 'from': {
        const fromAddresses =
          email.from?.map((f) => `${f.name || ''} ${f.address}`.toLowerCase()) || []
        const searchValue = String(condition.value).toLowerCase()
        matches = fromAddresses.some((addr) => {
          switch (condition.operator) {
            case 'contains':
              return addr.includes(searchValue)
            case 'equals':
              return addr === searchValue
            case 'startsWith':
              return addr.startsWith(searchValue)
            case 'endsWith':
              return addr.endsWith(searchValue)
            default:
              return false
          }
        })
        break
      }

      case 'to': {
        const toAddresses = email.to?.map((t) => `${t.name || ''} ${t.address}`.toLowerCase()) || []
        const searchValue = String(condition.value).toLowerCase()
        matches = toAddresses.some((addr) => {
          switch (condition.operator) {
            case 'contains':
              return addr.includes(searchValue)
            case 'equals':
              return addr === searchValue
            case 'startsWith':
              return addr.startsWith(searchValue)
            case 'endsWith':
              return addr.endsWith(searchValue)
            default:
              return false
          }
        })
        break
      }

      case 'subject': {
        const subject = (email.subject || '').toLowerCase()
        const searchValue = String(condition.value).toLowerCase()
        switch (condition.operator) {
          case 'contains':
            matches = subject.includes(searchValue)
            break
          case 'equals':
            matches = subject === searchValue
            break
          case 'startsWith':
            matches = subject.startsWith(searchValue)
            break
          case 'endsWith':
            matches = subject.endsWith(searchValue)
            break
        }
        break
      }

      case 'body': {
        const body = (email.text || '').toLowerCase()
        const searchValue = String(condition.value).toLowerCase()
        if (condition.operator === 'contains') {
          matches = body.includes(searchValue)
        }
        break
      }

      case 'hasAttachment':
        matches = email.hasAttachment === condition.value
        break

      case 'isUnread':
        matches = condition.value === !email.flags?.includes('\\Seen')
        break

      case 'isStarred':
        matches = condition.value === email.flags?.includes('\\Flagged')
        break

      case 'date': {
        const emailDate = email.date ? new Date(email.date) : null
        const conditionDate = new Date(String(condition.value))
        if (emailDate) {
          if (condition.operator === 'before') {
            matches = emailDate < conditionDate
          } else if (condition.operator === 'after') {
            matches = emailDate > conditionDate
          }
        }
        break
      }
    }

    results.push(matches)
  }

  if (results.length === 0) return false

  // 조건 결합 방식에 따라 결과 반환
  if (folder.conditionLogic === 'and') {
    return results.every((r) => r)
  } else {
    return results.some((r) => r)
  }
}

/**
 * 기본 아이콘 목록
 */
export function getDefaultIcons(): string[] {
  return [
    'folder',
    'inbox',
    'mail',
    'star',
    'heart',
    'bookmark',
    'tag',
    'flag',
    'clock',
    'calendar',
    'briefcase',
    'users',
    'building',
    'home',
    'globe'
  ]
}

/**
 * 기본 색상 목록
 */
export function getDefaultColors(): string[] {
  return [
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#06b6d4', // cyan
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#6b7280' // gray
  ]
}
