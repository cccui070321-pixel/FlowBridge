/// <reference types="vite/client" />

interface Window {
  flowbridge?: {
    platform: string
    getDeviceInfo: () => Promise<{ hostname: string; platform: string; version: string; appVersion: string }>
    readClipboard: () => Promise<string>
    writeClipboard: (text: string) => Promise<void>
    pickFiles: () => Promise<Array<{ name: string; path: string; size: number }>>
    showItemInFolder: (path: string) => Promise<void>
    chooseDownloadDirectory: () => Promise<string | null>
    downloadFile: (input: { signedUrls: string[]; checksum?: string; fileName: string; defaultDirectory?: string }) => Promise<string | null>
  }
}
