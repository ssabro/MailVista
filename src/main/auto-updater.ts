import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater'
import { BrowserWindow, ipcMain, app } from 'electron'
import { logger, LogCategory } from './logger'
import { getGlobalSettings } from './mail-service'

export interface UpdateStatus {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error'
  currentVersion: string
  latestVersion?: string
  releaseNotes?: string
  releaseDate?: string
  downloadProgress?: number
  error?: string
}

let mainWindow: BrowserWindow | null = null
let updateStatus: UpdateStatus = {
  status: 'idle',
  currentVersion: app.getVersion()
}

// 상태 업데이트 및 렌더러에 전송
function setStatus(newStatus: Partial<UpdateStatus>): void {
  updateStatus = { ...updateStatus, ...newStatus }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status-changed', updateStatus)
  }
}

// 자동 업데이트 초기화
export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window

  // GitHub 릴리스 사용 설정
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // 개발 모드에서는 업데이트 체크 비활성화
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    logger.info(LogCategory.APP, 'Auto-updater disabled in development mode')
    return
  }

  // 이벤트 리스너 등록
  autoUpdater.on('checking-for-update', () => {
    logger.info(LogCategory.APP, 'Checking for updates...')
    setStatus({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logger.info(LogCategory.APP, 'Update available', {
      version: info.version,
      releaseDate: info.releaseDate
    })
    setStatus({
      status: 'available',
      latestVersion: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      releaseDate: info.releaseDate
    })

    // autoDownload 설정에 따라 자동 다운로드
    const settings = getGlobalSettings()
    if (settings.updates.autoDownload) {
      autoUpdater.downloadUpdate()
    }
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    logger.info(LogCategory.APP, 'No updates available', { version: info.version })
    setStatus({
      status: 'not-available',
      latestVersion: info.version
    })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    logger.debug(LogCategory.APP, 'Download progress', {
      percent: progress.percent.toFixed(2)
    })
    setStatus({
      status: 'downloading',
      downloadProgress: Math.round(progress.percent)
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    logger.info(LogCategory.APP, 'Update downloaded', { version: info.version })
    setStatus({
      status: 'downloaded',
      latestVersion: info.version,
      downloadProgress: 100
    })
  })

  autoUpdater.on('error', (error: Error) => {
    logger.error(LogCategory.ERROR, 'Auto-updater error', { error: error.message })
    setStatus({
      status: 'error',
      error: error.message
    })
  })

  // 시작 시 자동 체크
  const settings = getGlobalSettings()
  if (settings.updates.autoCheck) {
    // 앱 시작 후 5초 뒤에 업데이트 체크
    setTimeout(() => {
      checkForUpdates()
    }, 5000)
  }
}

// 업데이트 확인
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    setStatus({ status: 'not-available', error: 'Updates disabled in development mode' })
    return updateStatus
  }

  try {
    setStatus({ status: 'checking' })
    await autoUpdater.checkForUpdates()
    return updateStatus
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error(LogCategory.ERROR, 'Failed to check for updates', { error: errorMessage })
    setStatus({ status: 'error', error: errorMessage })
    return updateStatus
  }
}

// 업데이트 다운로드
export async function downloadUpdate(): Promise<boolean> {
  if (updateStatus.status !== 'available') {
    return false
  }

  try {
    await autoUpdater.downloadUpdate()
    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error(LogCategory.ERROR, 'Failed to download update', { error: errorMessage })
    setStatus({ status: 'error', error: errorMessage })
    return false
  }
}

// 업데이트 설치 (앱 재시작)
export function installUpdate(): void {
  if (updateStatus.status !== 'downloaded') {
    return
  }

  logger.info(LogCategory.APP, 'Installing update and restarting...')
  autoUpdater.quitAndInstall(false, true)
}

// 현재 상태 반환
export function getUpdateStatus(): UpdateStatus {
  return { ...updateStatus }
}

// IPC 핸들러 등록
export function registerUpdateHandlers(): void {
  // 업데이트 확인
  ipcMain.handle('update-check', async () => {
    return await checkForUpdates()
  })

  // 업데이트 다운로드
  ipcMain.handle('update-download', async () => {
    return await downloadUpdate()
  })

  // 업데이트 설치
  ipcMain.handle('update-install', () => {
    installUpdate()
    return { success: true }
  })

  // 현재 상태 조회
  ipcMain.handle('update-get-status', () => {
    return getUpdateStatus()
  })

  // 현재 버전 조회
  ipcMain.handle('update-get-version', () => {
    return {
      version: app.getVersion(),
      name: app.getName()
    }
  })
}
