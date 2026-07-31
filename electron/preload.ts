import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('flowbridge', {
  platform: process.platform,
  getDeviceInfo: () => ipcRenderer.invoke('device:info'),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text: string) => ipcRenderer.invoke('clipboard:write', text),
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  showItemInFolder: (path: string) => ipcRenderer.invoke('files:reveal', path),
})
