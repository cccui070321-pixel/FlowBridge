export type DeviceStatus = 'online' | 'offline'
export type TransferStatus = 'queued' | 'uploading' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'expired'
export type ContentType = 'text' | 'prompt' | 'url'

export interface Device {
  id: string
  name: string
  platform: 'Windows' | 'macOS' | 'Linux'
  status: DeviceStatus
  isCurrent: boolean
  lastSeenAt: string
}

export interface ClipboardItem {
  id: string
  sourceDeviceId: string
  targetDeviceId: string
  content: string
  contentHash: string
  contentType: ContentType
  isFavorite: boolean
  createdAt: string
}

export interface Transfer {
  id: string
  sourceDeviceId: string
  targetDeviceId: string
  fileName: string
  fileSize: number
  mimeType: string
  status: TransferStatus
  progress: number
  checksum?: string
  error?: string
  localPath?: string
  createdAt: string
  expiresAt: string
}

export interface Prompt {
  id: string
  title: string
  content: string
  tags: string[]
  modelName?: string
  sourceDeviceId: string
  parentPromptId?: string
  isFavorite: boolean
  deletedAt?: string
  createdAt: string
  updatedAt: string
}

export interface Activity {
  id: string
  type: 'clipboard' | 'file' | 'prompt' | 'device'
  title: string
  detail: string
  status: 'success' | 'pending' | 'failed' | 'info'
  createdAt: string
}

export interface Settings {
  clipboardListening: boolean
  autoSync: boolean
  autoWriteClipboard: boolean
  syncPaused: boolean
  historyDays: number
  autoDownload: boolean
  textNotifications: boolean
  fileNotifications: boolean
  deviceNotifications: boolean
  previewNotifications: boolean
  theme: 'system' | 'light' | 'dark'
  reduceMotion: boolean
}
