import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  category: string
  message: string
  details?: unknown
}

export interface LogFilter {
  level?: LogLevel
  category?: string
  startDate?: Date
  endDate?: Date
  search?: string
}

class Logger {
  private logDir: string
  private currentLogFile: string
  private maxLogFiles: number = 7 // Keep logs for 7 days
  private maxLogSize: number = 10 * 1024 * 1024 // 10MB per file
  private logLevel: LogLevel = 'info'
  private memoryLogs: LogEntry[] = []
  private maxMemoryLogs: number = 1000

  constructor() {
    this.logDir = path.join(app.getPath('userData'), 'logs')
    this.currentLogFile = this.getLogFileName()
    this.ensureLogDirectory()
    this.cleanOldLogs()
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  private getLogFileName(): string {
    const date = new Date().toISOString().split('T')[0]
    return path.join(this.logDir, `mailvista-${date}.log`)
  }

  private cleanOldLogs(): void {
    try {
      const files = fs.readdirSync(this.logDir)
      const logFiles = files
        .filter((f) => f.startsWith('mailvista-') && f.endsWith('.log'))
        .sort()
        .reverse()

      // Remove old log files beyond maxLogFiles
      if (logFiles.length > this.maxLogFiles) {
        const filesToDelete = logFiles.slice(this.maxLogFiles)
        for (const file of filesToDelete) {
          fs.unlinkSync(path.join(this.logDir, file))
        }
      }
    } catch (error) {
      console.error('Failed to clean old logs:', error)
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    return levels.indexOf(level) >= levels.indexOf(this.logLevel)
  }

  private formatTimestamp(): string {
    return new Date().toISOString()
  }

  /**
   * 로그 인젝션 방지 - 개행 문자 및 제어 문자 이스케이프
   * 공격자가 로그에 가짜 로그 항목을 삽입하는 것을 방지
   */
  private sanitizeLogMessage(message: string): string {
    return message
      .replace(/\r\n/g, '\\r\\n')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/[\x00-\x1F\x7F]/g, '') // 제어 문자 제거
  }

  private formatLogEntry(entry: LogEntry): string {
    const sanitizedMessage = this.sanitizeLogMessage(entry.message)
    let line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.category}] ${sanitizedMessage}`
    if (entry.details !== undefined) {
      try {
        const detailsStr =
          typeof entry.details === 'string'
            ? this.sanitizeLogMessage(entry.details)
            : JSON.stringify(entry.details, null, 2)
        line += `\n  Details: ${detailsStr}`
      } catch {
        line += `\n  Details: [Unable to stringify]`
      }
    }
    return line
  }

  private writeToFile(entry: LogEntry): void {
    try {
      // Check if we need to rotate to a new day's file
      const newLogFile = this.getLogFileName()
      if (newLogFile !== this.currentLogFile) {
        this.currentLogFile = newLogFile
        this.cleanOldLogs()
      }

      // Check file size and rotate if needed
      if (fs.existsSync(this.currentLogFile)) {
        const stats = fs.statSync(this.currentLogFile)
        if (stats.size >= this.maxLogSize) {
          const timestamp = Date.now()
          const rotatedFile = this.currentLogFile.replace('.log', `-${timestamp}.log`)
          fs.renameSync(this.currentLogFile, rotatedFile)
        }
      }

      const logLine = this.formatLogEntry(entry) + '\n'
      fs.appendFileSync(this.currentLogFile, logLine, 'utf8')
    } catch (error) {
      console.error('Failed to write log:', error)
    }
  }

  private addToMemory(entry: LogEntry): void {
    this.memoryLogs.push(entry)
    if (this.memoryLogs.length > this.maxMemoryLogs) {
      this.memoryLogs.shift()
    }
  }

  private log(level: LogLevel, category: string, message: string, details?: unknown): void {
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      category,
      message,
      details
    }

    this.addToMemory(entry)
    this.writeToFile(entry)

    // Always output to console for visibility
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
    const levelTag = level.toUpperCase().padEnd(5)
    const prefix = `[${timestamp}] [${levelTag}] [${category}]`

    const consoleMethod =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.log

    if (details !== undefined && details !== null && details !== '') {
      consoleMethod(prefix, message, details)
    } else {
      consoleMethod(prefix, message)
    }
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level
  }

  debug(category: string, message: string, details?: unknown): void {
    this.log('debug', category, message, details)
  }

  info(category: string, message: string, details?: unknown): void {
    this.log('info', category, message, details)
  }

  warn(category: string, message: string, details?: unknown): void {
    this.log('warn', category, message, details)
  }

  error(category: string, message: string, details?: unknown): void {
    this.log('error', category, message, details)
  }

  // Get recent logs from memory
  getRecentLogs(filter?: LogFilter): LogEntry[] {
    let logs = [...this.memoryLogs]

    if (filter) {
      if (filter.level) {
        const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
        const minLevelIndex = levels.indexOf(filter.level)
        logs = logs.filter((log) => levels.indexOf(log.level) >= minLevelIndex)
      }

      if (filter.category) {
        logs = logs.filter((log) =>
          log.category.toLowerCase().includes(filter.category!.toLowerCase())
        )
      }

      if (filter.search) {
        const searchLower = filter.search.toLowerCase()
        logs = logs.filter(
          (log) =>
            log.message.toLowerCase().includes(searchLower) ||
            (log.details && JSON.stringify(log.details).toLowerCase().includes(searchLower))
        )
      }

      if (filter.startDate) {
        logs = logs.filter((log) => new Date(log.timestamp) >= filter.startDate!)
      }

      if (filter.endDate) {
        logs = logs.filter((log) => new Date(log.timestamp) <= filter.endDate!)
      }
    }

    return logs
  }

  // Read logs from file
  async readLogFile(date?: string): Promise<LogEntry[]> {
    try {
      const logFile = date ? path.join(this.logDir, `mailvista-${date}.log`) : this.currentLogFile

      if (!fs.existsSync(logFile)) {
        return []
      }

      const content = fs.readFileSync(logFile, 'utf8')
      const lines = content.split('\n').filter((line) => line.trim())

      const entries: LogEntry[] = []
      let currentEntry: Partial<LogEntry> | null = null

      for (const line of lines) {
        const match = line.match(
          /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\] \[(\w+)\] \[([^\]]+)\] (.*)$/
        )
        if (match) {
          if (currentEntry && currentEntry.timestamp) {
            entries.push(currentEntry as LogEntry)
          }
          currentEntry = {
            timestamp: match[1],
            level: match[2].toLowerCase() as LogLevel,
            category: match[3],
            message: match[4]
          }
        } else if (currentEntry && line.startsWith('  Details: ')) {
          try {
            currentEntry.details = JSON.parse(line.substring(11))
          } catch {
            currentEntry.details = line.substring(11)
          }
        }
      }

      if (currentEntry && currentEntry.timestamp) {
        entries.push(currentEntry as LogEntry)
      }

      return entries
    } catch (error) {
      console.error('Failed to read log file:', error)
      return []
    }
  }

  // Get list of available log files
  getLogFiles(): { date: string; size: number; path: string }[] {
    try {
      const files = fs.readdirSync(this.logDir)
      return files
        .filter((f) => f.startsWith('mailvista-') && f.endsWith('.log'))
        .map((f) => {
          const filePath = path.join(this.logDir, f)
          const stats = fs.statSync(filePath)
          const dateMatch = f.match(/mailvista-(\d{4}-\d{2}-\d{2})/)
          return {
            date: dateMatch ? dateMatch[1] : f,
            size: stats.size,
            path: filePath
          }
        })
        .sort((a, b) => b.date.localeCompare(a.date))
    } catch (error) {
      console.error('Failed to get log files:', error)
      return []
    }
  }

  // Export logs to file
  async exportLogs(
    targetPath: string,
    options?: { startDate?: string; endDate?: string }
  ): Promise<boolean> {
    try {
      const files = this.getLogFiles()
      let filteredFiles = files

      if (options?.startDate) {
        filteredFiles = filteredFiles.filter((f) => f.date >= options.startDate!)
      }
      if (options?.endDate) {
        filteredFiles = filteredFiles.filter((f) => f.date <= options.endDate!)
      }

      let allContent = ''
      for (const file of filteredFiles.reverse()) {
        const content = fs.readFileSync(file.path, 'utf8')
        allContent += `\n=== ${file.date} ===\n${content}`
      }

      fs.writeFileSync(targetPath, allContent.trim(), 'utf8')
      return true
    } catch (error) {
      console.error('Failed to export logs:', error)
      return false
    }
  }

  // Clear all logs
  clearLogs(): void {
    try {
      const files = fs.readdirSync(this.logDir)
      for (const file of files) {
        if (file.startsWith('mailvista-') && file.endsWith('.log')) {
          fs.unlinkSync(path.join(this.logDir, file))
        }
      }
      this.memoryLogs = []
    } catch (error) {
      console.error('Failed to clear logs:', error)
    }
  }

  // Get log directory path
  getLogDirectory(): string {
    return this.logDir
  }
}

// Export singleton instance
export const logger = new Logger()

// Export category constants for consistency
export const LogCategory = {
  // Core
  APP: 'App',
  IPC: 'IPC',
  ERROR: 'Error',

  // Mail operations
  MAIL: 'Mail',
  MAIL_SEND: 'Mail:Send',
  MAIL_FETCH: 'Mail:Fetch',
  MAIL_MOVE: 'Mail:Move',
  MAIL_DELETE: 'Mail:Delete',
  MAIL_FLAG: 'Mail:Flag',

  // Sync & Connection
  SYNC: 'Sync',
  POOL: 'Pool',
  CACHE: 'Cache',
  NETWORK: 'Network',

  // Account & Auth
  ACCOUNT: 'Account',
  AUTH: 'Auth',
  OAUTH: 'OAuth',

  // Data management
  CONTACTS: 'Contacts',
  FOLDER: 'Folder',
  SEARCH: 'Search',
  FILTER: 'Filter',
  TAG: 'Tag',
  TEMPLATE: 'Template',
  VIRTUAL_FOLDER: 'VirtualFolder',

  // Storage
  DATABASE: 'Database',
  STORAGE: 'Storage',
  IMPORT: 'Import',
  EXPORT: 'Export',
  MIGRATION: 'Migration',

  // Security
  SECURITY: 'Security',
  ENCRYPTION: 'Encryption',
  E2E: 'E2E',
  PGP: 'PGP',
  SMIME: 'S/MIME',

  // Integrations
  AI: 'AI',
  LLM: 'LLM',
  TRELLO: 'Trello',

  // Features
  OFFLINE: 'Offline',
  NOTIFICATION: 'Notification',
  ATTACHMENT: 'Attachment',
  SIGNATURE: 'Signature'
} as const
