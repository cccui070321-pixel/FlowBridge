import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('flowbridge', {
  platform: process.platform,
  getDeviceInfo: () => ipcRenderer.invoke('device:info'),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text: string) => ipcRenderer.invoke('clipboard:write', text),
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  showItemInFolder: (path: string) => ipcRenderer.invoke('files:reveal', path),
  chooseDownloadDirectory: () => ipcRenderer.invoke('files:choose-download-directory'),
  listTransferJobs: () => ipcRenderer.invoke('transfer:list'),
  uploadFile: (input: unknown) => ipcRenderer.invoke('transfer:upload', input),
  downloadFile: (input: unknown) => ipcRenderer.invoke('files:download', input),
  onTransferProgress: (callback: (progress: unknown) => void) => {
    ipcRenderer.removeAllListeners('transfer:progress')
    ipcRenderer.on('transfer:progress', (_event, progress) => callback(progress))
  },
  onAppResume: (callback: () => void) => {
    ipcRenderer.removeAllListeners('app:resume')
    ipcRenderer.on('app:resume', callback)
  },
  onToggleSync: (callback: () => void) => {
    ipcRenderer.removeAllListeners('app:toggle-sync')
    ipcRenderer.on('app:toggle-sync', callback)
  },
  setBackgroundRun: (enabled: boolean) => ipcRenderer.invoke('app:set-background-run', enabled),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  getUpdateState: () => ipcRenderer.invoke('update:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateState: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state)
    ipcRenderer.on('update:state', listener)
    return () => ipcRenderer.removeListener('update:state', listener)
  },
})
