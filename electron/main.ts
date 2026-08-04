import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, powerMonitor, shell, Tray } from 'electron'
import { stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electronUpdater from 'electron-updater'
import { TransferQueue, type DownloadRequest, type UploadRequest } from './transferQueue.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const { autoUpdater } = electronUpdater
const transferQueue = new TransferQueue()
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let backgroundRun = true
let quitting = false
let updateCheckInFlight = false
let updateCheckTimeout: ReturnType<typeof setTimeout> | undefined
const UPDATE_CHECK_TIMEOUT_MS = 30_000
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  quitting = true
  app.quit()
}

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error' | 'unsupported' | 'waiting-for-transfers'
interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  version?: string
  percent?: number
  releaseNotes?: string
  error?: string
}
let updateState: UpdateState = { status: 'idle', currentVersion: app.getVersion() }

function broadcastUpdateState(patch: Partial<UpdateState>) {
  updateState = { ...updateState, ...patch, currentVersion: app.getVersion() }
  mainWindow?.webContents.send('update:state', updateState)
}

function releaseNotesText(notes: unknown) {
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) return notes.map((item) => typeof item?.note === 'string' ? item.note : '').filter(Boolean).join('\n')
  return undefined
}

function clearUpdateCheckTimeout() {
  if (updateCheckTimeout) clearTimeout(updateCheckTimeout)
  updateCheckTimeout = undefined
}

function finishUpdateCheck(patch: Partial<UpdateState>) {
  updateCheckInFlight = false
  clearUpdateCheckTimeout()
  broadcastUpdateState(patch)
}

function requestUpdateCheck() {
  if (!app.isPackaged) {
    broadcastUpdateState({ status: 'unsupported', error: '开发模式不执行自动更新；安装版会正常检查 GitHub Release。' })
    return updateState
  }
  if (updateCheckInFlight || updateState.status === 'downloading') return updateState
  updateCheckInFlight = true
  broadcastUpdateState({ status: 'checking', percent: undefined, error: undefined })
  clearUpdateCheckTimeout()
  updateCheckTimeout = setTimeout(() => {
    if (!updateCheckInFlight) return
    finishUpdateCheck({ status: 'error', error: '连接更新服务器超时，请检查网络后重试。' })
  }, UPDATE_CHECK_TIMEOUT_MS)
  void autoUpdater.checkForUpdates().catch((error) => {
    finishUpdateCheck({ status: 'error', error: error instanceof Error ? error.message : '检查更新失败' })
  })
  return updateState
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.on('checking-for-update', () => broadcastUpdateState({ status: 'checking', percent: undefined, error: undefined }))
  autoUpdater.on('update-available', (info) => finishUpdateCheck({ status: 'available', version: info.version, releaseNotes: releaseNotesText(info.releaseNotes), error: undefined }))
  autoUpdater.on('update-not-available', (info) => finishUpdateCheck({ status: 'not-available', version: info.version, percent: undefined, error: undefined }))
  autoUpdater.on('download-progress', (progress) => broadcastUpdateState({ status: 'downloading', percent: Math.round(progress.percent), error: undefined }))
  autoUpdater.on('update-downloaded', (info) => broadcastUpdateState({ status: 'downloaded', version: info.version, percent: 100, releaseNotes: releaseNotesText(info.releaseNotes), error: undefined }))
  autoUpdater.on('error', (error) => finishUpdateCheck({ status: 'error', error: error.message }))
  setTimeout(() => { void requestUpdateCheck() }, 30_000)
  setInterval(() => { void requestUpdateCheck() }, 6 * 60 * 60 * 1_000)
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#f5f5f7',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(currentDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('mailto:')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const allowed = process.env.VITE_DEV_SERVER_URL ?? `file://${path.join(currentDir, '../dist/index.html')}`
    if (!url.startsWith(allowed)) event.preventDefault()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadFile(path.join(currentDir, '../dist/index.html'))
  }

  window.once('ready-to-show', () => window.show())
  window.on('close', (event) => {
    if (!quitting && backgroundRun) {
      event.preventDefault()
      window.hide()
      window.webContents.send('app:backgrounded')
    }
  })
  window.on('closed', () => { if (mainWindow === window) mainWindow = null })
  mainWindow = window
  return window
}

function showMainWindow() {
  const window = mainWindow ?? createWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function createTray() {
  if (tray) return
  const iconPath = path.join(currentDir, '../build/icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('FlowBridge · 后台接收中')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 FlowBridge', click: showMainWindow },
    { label: '暂停/恢复同步', click: () => mainWindow?.webContents.send('app:toggle-sync') },
    { label: '检查更新', click: () => { void requestUpdateCheck() } },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit() } },
  ]))
  tray.on('double-click', showMainWindow)
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return
  Menu.setApplicationMenu(null)
  ipcMain.handle('device:info', () => ({ hostname: os.hostname(), platform: os.platform(), version: os.release(), appVersion: app.getVersion() }))
  ipcMain.handle('clipboard:read', () => clipboard.readText())
  ipcMain.handle('clipboard:write', (_event, text: unknown) => {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 1024 * 1024) throw new Error('剪贴板内容无效或超过 1MB')
    clipboard.writeText(text)
  })
  ipcMain.handle('files:pick', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    if (result.canceled) return []
    const paths = result.filePaths.slice(0, 20)
    return Promise.all(paths.map(async (filePath) => {
      const info = await stat(filePath)
      return { name: path.basename(filePath), path: filePath, size: info.size, mtimeMs: info.mtimeMs }
    }))
  })
  ipcMain.handle('files:reveal', (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('文件路径无效')
    shell.showItemInFolder(filePath)
  })
  ipcMain.handle('files:choose-download-directory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('transfer:list', () => transferQueue.list())
  ipcMain.handle('transfer:upload', (event, input: unknown) => transferQueue.upload(input as UploadRequest, event.sender))
  ipcMain.handle('files:download', async (event, input: unknown) => {
    const value = input as { transferId?: unknown; signedUrls?: unknown; partSizes?: unknown; checksum?: unknown; fileName?: unknown; fileSize?: unknown; defaultDirectory?: unknown; autoSave?: unknown }
    if (typeof value.transferId !== 'string') throw new Error('传输任务编号无效')
    if (!Array.isArray(value?.signedUrls) || value.signedUrls.length === 0 || value.signedUrls.length > 20 || value.signedUrls.some((url) => typeof url !== 'string' || !url.startsWith('https://'))) throw new Error('下载地址无效')
    if (!Array.isArray(value.partSizes) || value.partSizes.length !== value.signedUrls.length || value.partSizes.some((size) => typeof size !== 'number' || size <= 0)) throw new Error('下载分片大小无效')
    if (value.checksum !== undefined && (typeof value.checksum !== 'string' || !/^[a-f0-9]{64}$/i.test(value.checksum))) throw new Error('文件校验值无效')
    if (typeof value.fileName !== 'string' || !value.fileName.trim()) throw new Error('文件名无效')
    if (typeof value.fileSize !== 'number' || value.fileSize <= 0) throw new Error('文件大小无效')
    const safeName = path.basename(value.fileName).replace(/[<>:"/\\|?*]/g, '_')
    const existing = await transferQueue.get('download', value.transferId)
    let destinationPath = existing?.filePath
    if (!destinationPath && value.autoSave === true && typeof value.defaultDirectory === 'string' && path.isAbsolute(value.defaultDirectory)) {
      destinationPath = path.join(value.defaultDirectory, safeName)
    }
    if (!destinationPath) {
      const defaultPath = typeof value.defaultDirectory === 'string' && path.isAbsolute(value.defaultDirectory) ? path.join(value.defaultDirectory, safeName) : safeName
      const owner = BrowserWindow.fromWebContents(event.sender)
      const result = owner ? await dialog.showSaveDialog(owner, { defaultPath }) : await dialog.showSaveDialog({ defaultPath })
      if (result.canceled || !result.filePath) return null
      destinationPath = result.filePath
    }
    const request: DownloadRequest = {
      jobId: value.transferId,
      fileName: value.fileName,
      fileSize: value.fileSize,
      destinationPath,
      signedUrls: value.signedUrls as string[],
      partSizes: value.partSizes as number[],
      checksum: value.checksum as string | undefined,
    }
    return transferQueue.download(request, event.sender)
  })
  ipcMain.handle('app:set-background-run', (_event, enabled: unknown) => { backgroundRun = enabled !== false })
  ipcMain.handle('update:get-state', () => updateState)
  ipcMain.handle('update:check', () => requestUpdateCheck())
  ipcMain.handle('update:install', async () => {
    if (updateState.status !== 'downloaded') return { ok: false, reason: '更新尚未下载完成' }
    const jobs = await transferQueue.list()
    if (jobs.some((job) => job.status === 'running' || job.status === 'queued')) {
      broadcastUpdateState({ status: 'waiting-for-transfers', error: '有传输任务正在进行，完成后即可安装更新。' })
      return { ok: false, reason: '有传输任务正在进行' }
    }
    quitting = true
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return { ok: true }
  })
  ipcMain.handle('app:show', () => showMainWindow())
  ipcMain.handle('app:quit', () => { quitting = true; app.quit() })
  createWindow()
  createTray()
  setupAutoUpdater()
  powerMonitor.on('resume', () => mainWindow?.webContents.send('app:resume'))
  app.on('activate', showMainWindow)
})

if (hasSingleInstanceLock) app.on('second-instance', showMainWindow)
app.on('before-quit', () => { quitting = true })
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !backgroundRun) app.quit() })
