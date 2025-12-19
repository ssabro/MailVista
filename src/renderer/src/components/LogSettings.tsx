import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'
import {
  FileText,
  Download,
  Trash2,
  FolderOpen,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  Filter
} from 'lucide-react'
import { cn } from '../lib/utils'

interface LogEntry {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  category: string
  message: string
  details?: string | Record<string, unknown>
}

interface LogFile {
  date: string
  size: number
  path: string
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export function LogSettings() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logFiles, setLogFiles] = useState<LogFile[]>([])
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'all'>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [logDirectory, setLogDirectory] = useState<string>('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)

  useEffect(() => {
    loadLogFiles()
    loadLogDirectory()
  }, [])

  useEffect(() => {
    if (selectedDate) {
      loadLogsFromFile(selectedDate)
    } else {
      loadRecentLogs()
    }
  }, [selectedDate])

  const loadLogFiles = async () => {
    try {
      const files = await window.electron.ipcRenderer.invoke('get-log-files')
      setLogFiles(files)
      if (files.length > 0 && !selectedDate) {
        setSelectedDate(files[0].date)
      }
    } catch (error) {
      console.error('Failed to load log files:', error)
    }
  }

  const loadLogDirectory = async () => {
    try {
      const dir = await window.electron.ipcRenderer.invoke('get-log-directory')
      setLogDirectory(dir)
    } catch (error) {
      console.error('Failed to get log directory:', error)
    }
  }

  const loadRecentLogs = async () => {
    setIsLoading(true)
    try {
      const recentLogs = await window.electron.ipcRenderer.invoke('get-recent-logs')
      setLogs(recentLogs)
    } catch (error) {
      console.error('Failed to load recent logs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadLogsFromFile = async (date: string) => {
    setIsLoading(true)
    try {
      const fileLogs = await window.electron.ipcRenderer.invoke('read-log-file', date)
      setLogs(fileLogs)
    } catch (error) {
      console.error('Failed to load logs from file:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefresh = () => {
    if (selectedDate) {
      loadLogsFromFile(selectedDate)
    } else {
      loadRecentLogs()
    }
    loadLogFiles()
  }

  const handleExport = async () => {
    try {
      await window.electron.ipcRenderer.invoke('export-logs')
    } catch (error) {
      console.error('Failed to export logs:', error)
    }
  }

  const handleClearLogs = async () => {
    try {
      await window.electron.ipcRenderer.invoke('clear-logs')
      setLogs([])
      setLogFiles([])
      setShowClearConfirm(false)
    } catch (error) {
      console.error('Failed to clear logs:', error)
    }
  }

  const handleOpenLogDirectory = async () => {
    try {
      await window.electron.ipcRenderer.invoke('open-log-directory')
    } catch (error) {
      console.error('Failed to open log directory:', error)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getLevelIcon = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'warn':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />
      case 'debug':
        return <Bug className="h-4 w-4 text-gray-500" />
    }
  }

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
      case 'warn':
        return 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800'
      case 'info':
        return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
      case 'debug':
        return 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800'
    }
  }

  // Get unique categories from logs
  const categories = [...new Set(logs.map((log) => log.category))].sort()

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (filterLevel !== 'all' && log.level !== filterLevel) return false
    if (filterCategory !== 'all' && log.category !== filterCategory) return false
    return true
  })

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('logs.title')}
            </CardTitle>
            <CardDescription>{t('logs.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
                <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
                {t('logs.refresh')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                {t('logs.export')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenLogDirectory}>
                <FolderOpen className="h-4 w-4 mr-2" />
                {t('logs.openFolder')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowClearConfirm(true)}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('logs.clear')}
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{t('logs.filter')}:</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm">{t('logs.date')}:</span>
                <Select value={selectedDate} onValueChange={setSelectedDate}>
                  <SelectTrigger className="w-[140px] h-8 text-sm">
                    {selectedDate || t('logs.selectDate')}
                  </SelectTrigger>
                  <SelectContent>
                    {logFiles.map((file) => (
                      <SelectItem key={file.date} value={file.date}>
                        {file.date} ({formatFileSize(file.size)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm">{t('logs.level')}:</span>
                <Select
                  value={filterLevel}
                  onValueChange={(v) => setFilterLevel(v as LogLevel | 'all')}
                >
                  <SelectTrigger className="w-[100px] h-8 text-sm">
                    {filterLevel === 'all' ? t('logs.all') : filterLevel.toUpperCase()}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('logs.all')}</SelectItem>
                    <SelectItem value="error">ERROR</SelectItem>
                    <SelectItem value="warn">WARN</SelectItem>
                    <SelectItem value="info">INFO</SelectItem>
                    <SelectItem value="debug">DEBUG</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm">{t('logs.category')}:</span>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[120px] h-8 text-sm">
                    {filterCategory === 'all' ? t('logs.all') : filterCategory}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('logs.all')}</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Log directory info */}
            <div className="text-xs text-muted-foreground">
              {t('logs.directory')}: <code className="bg-muted px-1 rounded">{logDirectory}</code>
            </div>
          </CardContent>
        </Card>

        {/* Log List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t('logs.logList')} ({filteredLogs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{t('logs.noLogs')}</div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-auto">
                {filteredLogs
                  .slice()
                  .reverse()
                  .map((log, index) => (
                    <div
                      key={index}
                      className={cn(
                        'p-3 rounded-lg border cursor-pointer transition-colors hover:opacity-80',
                        getLevelColor(log.level)
                      )}
                      onClick={() => setSelectedLog(log)}
                    >
                      <div className="flex items-start gap-2">
                        {getLevelIcon(log.level)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                            <span>{formatTimestamp(log.timestamp)}</span>
                            <span className="px-1.5 py-0.5 bg-background rounded text-xs font-medium">
                              {log.category}
                            </span>
                          </div>
                          <p className="text-sm break-words">{log.message}</p>
                          {log.details && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {typeof log.details === 'string'
                                ? log.details
                                : JSON.stringify(log.details)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogTitle className="flex items-center gap-2">
            {selectedLog && getLevelIcon(selectedLog.level)}
            {t('logs.detailTitle')}
          </DialogTitle>
          <DialogDescription className="sr-only">{t('logs.detailDesc')}</DialogDescription>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('logs.timestamp')}:</span>
                  <p className="font-mono">{selectedLog.timestamp}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('logs.level')}:</span>
                  <p className="font-medium uppercase">{selectedLog.level}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('logs.category')}:</span>
                  <p>{selectedLog.category}</p>
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">{t('logs.message')}:</span>
                <p className="mt-1 p-3 bg-muted rounded-lg">{selectedLog.message}</p>
              </div>
              {selectedLog.details && (
                <div>
                  <span className="text-sm text-muted-foreground">{t('logs.details')}:</span>
                  <pre className="mt-1 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-60">
                    {typeof selectedLog.details === 'string'
                      ? selectedLog.details
                      : JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Clear Confirm Dialog */}
      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent>
          <DialogTitle>{t('logs.clearConfirmTitle')}</DialogTitle>
          <DialogDescription>{t('logs.clearConfirmDesc')}</DialogDescription>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowClearConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleClearLogs}>
              {t('logs.clear')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
