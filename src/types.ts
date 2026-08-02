export type DeviceStatus = 'online' | 'offline'
export type TransferStatus = 'queued' | 'uploading' | 'uploaded' | 'waiting' | 'downloading' | 'completed' | 'failed' | 'cancelled' | 'expired' | 'checksum_failed'
export type ContentType = 'text' | 'prompt' | 'url'
export type AccentColor = 'blue' | 'indigo' | 'teal' | 'orange' | 'rose' | 'graphite'
export type InterfaceDensity = 'comfortable' | 'compact'
export type StorageCategory = 'image' | 'video' | 'document' | 'archive' | 'other'
export type UserRole = 'user' | 'admin' | 'super_admin'
export type AccountStatus = 'active' | 'suspended' | 'deletion_pending'

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
  bytesTransferred?: number
  storageKey?: string
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
  accent: AccentColor
  fontScale: 0.9 | 1 | 1.1 | 1.25
  density: InterfaceDensity
  rememberLastPage: boolean
  sidebarOrder: string[]
  homeWidgets: string[]
  defaultTargetDeviceId?: string
  downloadDirectory?: string
  meteredNetworkUploads: boolean
  reduceMotion: boolean
}

export interface UserProfile {
  id: string
  email: string
  displayName: string
  avatarPath?: string
  bio: string
  locale: string
  timezone: string
  createdAt: string
  updatedAt: string
}

export interface StorageQuota {
  quotaBytes: number
  usedBytes: number
}

export interface StorageItem {
  id: string
  ownerId: string
  transferId?: string
  storageKey: string
  originalName: string
  mimeType: string
  sizeBytes: number
  sha256: string
  category: StorageCategory
  retentionType: 'temporary' | 'saved'
  expiresAt?: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
}

export interface AdminUserSummary {
  userId: string
  email: string
  displayName: string
  accountStatus: AccountStatus
  role: UserRole
  createdAt: string
  lastSignInAt?: string
  deviceCount: number
  storageUsed: number
  storageQuota: number
}

export interface AuditLog {
  id: string
  actorId?: string
  targetUserId?: string
  action: string
  resourceType: string
  resourceId?: string
  reason: string
  result: 'success' | 'failed'
  createdAt: string
}
