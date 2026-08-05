/// <reference types="vite/client" />

interface Window {
  flowbridge?: {
    platform: string
    getDeviceInfo: () => Promise<{ hostname: string; platform: string; version: string; appVersion: string }>
    readClipboard: () => Promise<string>
    writeClipboard: (text: string) => Promise<void>
    pickFiles: () => Promise<Array<{ name: string; path: string; size: number; mtimeMs: number }>>
    showItemInFolder: (path: string) => Promise<void>
    chooseDownloadDirectory: () => Promise<string | null>
    listTransferJobs: () => Promise<Array<{ id: string; direction: 'upload' | 'download'; fileName: string; filePath: string; fileSize: number; fileMtimeMs?: number; status: string; completedParts: number; totalParts: number; checksum?: string; error?: string }>>
    uploadFile: (input: { jobId: string; filePath: string; fileName: string; fileSize: number; fileMtimeMs: number; mimeType: string; endpoint: string; bucket: string; accessToken: string; apiKey: string; parts: Array<{ key: string; start: number; size: number }>; manifestKey?: string }) => Promise<{ checksum: string }>
    downloadFile: (input: { transferId: string; signedUrls: string[]; partSizes: number[]; checksum?: string; fileName: string; fileSize: number; defaultDirectory?: string; autoSave?: boolean }) => Promise<string | null>
    onTransferProgress: (callback: (progress: { jobId: string; direction: 'upload' | 'download'; stage: string; progress: number; bytesTransferred: number; error?: string }) => void) => void
    onAppResume: (callback: () => void) => void
    onToggleSync: (callback: () => void) => void
    setBackgroundRun: (enabled: boolean) => Promise<void>
    quitApp: () => Promise<void>
    getUpdateState: () => Promise<UpdateState>
    checkForUpdates: () => Promise<UpdateState>
    installUpdate: () => Promise<{ ok: boolean; reason?: string }>
    onUpdateState: (callback: (state: UpdateState) => void) => () => void
  }
}

interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error' | 'unsupported' | 'waiting-for-transfers'
  currentVersion: string
  version?: string
  percent?: number
  releaseNotes?: string
  error?: string
}
