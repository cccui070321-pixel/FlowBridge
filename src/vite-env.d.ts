/// <reference types="vite/client" />

interface Window {
  flowbridge?: {
    platform: string
    getDeviceInfo: () => Promise<{ hostname: string; platform: string; version: string }>
    readClipboard: () => Promise<string>
    writeClipboard: (text: string) => Promise<void>
    pickFiles: () => Promise<Array<{ name: string; path: string; size: number }>>
    showItemInFolder: (path: string) => Promise<void>
  }
}
