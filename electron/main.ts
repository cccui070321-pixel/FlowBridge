import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, session, shell } from 'electron'
import { stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

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
}

app.whenReady().then(() => {
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
    return Promise.all(paths.map(async (filePath) => ({ name: path.basename(filePath), path: filePath, size: (await stat(filePath)).size })))
  })
  ipcMain.handle('files:reveal', (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('文件路径无效')
    shell.showItemInFolder(filePath)
  })
  ipcMain.handle('files:choose-download-directory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('files:download', async (event, input: unknown) => {
    const value = input as { signedUrl?: unknown; fileName?: unknown; defaultDirectory?: unknown }
    if (typeof value?.signedUrl !== 'string' || !value.signedUrl.startsWith('https://')) throw new Error('下载地址无效')
    if (typeof value.fileName !== 'string' || !value.fileName.trim()) throw new Error('文件名无效')
    const signedUrl = value.signedUrl
    const safeName = path.basename(value.fileName).replace(/[<>:"/\\|?*]/g, '_')
    const defaultPath = typeof value.defaultDirectory === 'string' && path.isAbsolute(value.defaultDirectory)
      ? path.join(value.defaultDirectory, safeName)
      : safeName
    const owner = BrowserWindow.fromWebContents(event.sender)
    const result = owner ? await dialog.showSaveDialog(owner, { defaultPath }) : await dialog.showSaveDialog({ defaultPath })
    if (result.canceled || !result.filePath) return null
    return new Promise<string>((resolve, reject) => {
      const listener = (_downloadEvent: Electron.Event, item: Electron.DownloadItem) => {
        if (item.getURL() !== signedUrl) return
        session.defaultSession.removeListener('will-download', listener)
        item.setSavePath(result.filePath!)
        item.once('done', (_doneEvent, state) => state === 'completed' ? resolve(result.filePath!) : reject(new Error(`下载${state === 'cancelled' ? '已取消' : '失败'}`)))
      }
      session.defaultSession.on('will-download', listener)
      event.sender.downloadURL(signedUrl)
    })
  })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
