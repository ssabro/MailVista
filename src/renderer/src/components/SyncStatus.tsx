import { useState, useEffect } from 'react'
import { RefreshCw, AlertCircle, Check, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface SyncStatusData {
  pending: number
  processing: number
  failed: number
  lastError: string | null
}

interface SyncOperationFailedData {
  operationType: string
  folderPath: string
  affectedCount: number
  error: string
}

export function SyncStatusBar() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SyncStatusData>({
    pending: 0,
    processing: 0,
    failed: 0,
    lastError: null
  })
  const [showError, setShowError] = useState(false)
  const [lastFailedOperation, setLastFailedOperation] = useState<SyncOperationFailedData | null>(
    null
  )

  useEffect(() => {
    // IPC 이벤트 리스너 등록
    const handleSyncStatusUpdate = (_event: unknown, data: SyncStatusData) => {
      setStatus(data)
    }

    const handleSyncOperationFailed = (_event: unknown, data: SyncOperationFailedData) => {
      setLastFailedOperation(data)
      setShowError(true)
      // 5초 후 에러 메시지 숨김
      setTimeout(() => {
        setShowError(false)
      }, 5000)
    }

    // 이벤트 리스너 등록
    window.electron.ipcRenderer.on('sync-status-update', handleSyncStatusUpdate)
    window.electron.ipcRenderer.on('sync-operation-failed', handleSyncOperationFailed)

    // 초기 상태 조회
    const fetchInitialStatus = async () => {
      try {
        const result = await window.electron.ipcRenderer.invoke('operation-queue-get-stats')
        if (result.success && result.stats) {
          setStatus({
            pending: result.stats.pending,
            processing: result.stats.processing,
            failed: result.stats.failed,
            lastError: result.stats.lastError
          })
        }
      } catch (error) {
        console.error('Failed to fetch initial sync status:', error)
      }
    }

    fetchInitialStatus()

    // 정기적으로 상태 업데이트 (10초마다)
    const intervalId = setInterval(fetchInitialStatus, 10000)

    // 정리 함수
    return () => {
      window.electron.ipcRenderer.removeAllListeners('sync-status-update')
      window.electron.ipcRenderer.removeAllListeners('sync-operation-failed')
      clearInterval(intervalId)
    }
  }, [])

  const totalPending = status.pending + status.processing

  // 실패한 작업 정리
  const clearFailedOperations = async () => {
    try {
      await window.electron.ipcRenderer.invoke('operation-queue-clear-failed')
      setStatus((prev) => ({ ...prev, failed: 0, lastError: null }))
    } catch (error) {
      console.error('Failed to clear failed operations:', error)
    }
  }

  // 동기화 대기 중인 작업이 없고 실패한 작업도 없으면 표시하지 않음
  if (totalPending === 0 && status.failed === 0 && !showError) {
    return null
  }

  const getOperationTypeLabel = (type: string): string => {
    switch (type) {
      case 'delete_trash':
      case 'delete_permanent':
        return t('sync.operationType.delete', '삭제')
      case 'move':
        return t('sync.operationType.move', '이동')
      case 'flag_add':
      case 'flag_remove':
        return t('sync.operationType.flag', '플래그')
      default:
        return type
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* 에러 메시지 */}
      {showError && lastFailedOperation && (
        <div className="bg-red-500/90 text-white px-4 py-2 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>
              {t('sync.operationFailed', '동기화 실패')}:{' '}
              {getOperationTypeLabel(lastFailedOperation.operationType)} (
              {lastFailedOperation.affectedCount}
              {t('sync.items', '개')})
            </span>
            {lastFailedOperation.error && (
              <span className="text-red-200">- {lastFailedOperation.error}</span>
            )}
          </div>
          <button
            onClick={() => setShowError(false)}
            className="text-white/80 hover:text-white ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* 동기화 상태바 */}
      {totalPending > 0 && (
        <div className="bg-blue-500/90 text-white px-4 py-2 text-sm flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>
            {t('sync.syncing', '동기화 중')}... ({totalPending}
            {t('sync.itemsPending', '개 대기')})
          </span>
          {status.processing > 0 && (
            <span className="text-blue-200">
              ({status.processing}
              {t('sync.itemsProcessing', '개 처리 중')})
            </span>
          )}
        </div>
      )}

      {/* 실패한 작업이 있을 때 표시 */}
      {status.failed > 0 && !showError && (
        <div className="bg-amber-500/90 text-white px-4 py-2 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>
            {status.failed}
            {t('sync.failedOperations', '개의 동기화 작업이 실패했습니다')}
          </span>
          {status.lastError && (
            <span className="text-amber-200 text-xs ml-2 truncate max-w-[300px]" title={status.lastError}>
              ({status.lastError.length > 50 ? status.lastError.substring(0, 50) + '...' : status.lastError})
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            <button
              onClick={() => {
                // 로그 폴더 열기 요청
                window.electron.ipcRenderer.invoke('open-log-folder').catch(console.error)
              }}
              className="text-white/80 hover:text-white text-xs underline"
              title={t('sync.viewLogs', '로그 보기')}
            >
              {t('sync.viewLogs', '로그 보기')}
            </button>
            <button
              onClick={clearFailedOperations}
              className="text-white/80 hover:text-white p-1"
              title={t('sync.dismiss', '닫기')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// 동기화 완료 토스트 컴포넌트 (선택적 사용)
export function SyncCompleteToast({ show, onClose }: { show: boolean; onClose: () => void }) {
  const { t } = useTranslation()

  useEffect(() => {
    if (show) {
      const timer = setTimeout(onClose, 3000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [show, onClose])

  if (!show) return null

  return (
    <div className="fixed bottom-4 right-4 bg-green-500/90 text-white px-4 py-2 rounded-lg shadow-lg text-sm flex items-center gap-2 z-50">
      <Check className="h-4 w-4" />
      <span>{t('sync.complete', '동기화 완료')}</span>
    </div>
  )
}
