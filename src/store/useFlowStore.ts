import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { classifyContent, contentHash, createId } from '../lib/domain'
import type { CloudConnectionState } from '../lib/reliability'
import { getOrCreateDeviceId, isCloudConfigured } from '../services/supabase'
import type {
  Activity,
  AdminUserSummary,
  AuditLog,
  ClipboardItem,
  Device,
  Prompt,
  Settings,
  StorageItem,
  StorageQuota,
  Transfer,
  TransferStatus,
  UserProfile,
  UserRole,
} from '../types'

const now = Date.now()
const currentDevice: Device = {
  id: getOrCreateDeviceId(),
  name: '这台电脑',
  platform: 'Windows',
  status: 'online',
  isCurrent: true,
  lastSeenAt: new Date(now).toISOString(),
}
const studioDevice: Device = {
  id: 'device-studio',
  name: 'AI 创作工作站',
  platform: 'Windows',
  status: 'online',
  isCurrent: false,
  lastSeenAt: new Date(now - 48_000).toISOString(),
}
const laptopDevice: Device = {
  id: 'device-laptop',
  name: '灵感笔记本',
  platform: 'Windows',
  status: 'offline',
  isCurrent: false,
  lastSeenAt: new Date(now - 7_200_000).toISOString(),
}

export const defaultSettings: Settings = {
  clipboardListening: false,
  autoSync: false,
  autoWriteClipboard: false,
  syncPaused: false,
  historyDays: 30,
  autoDownload: false,
  backgroundRun: true,
  launchAtStartup: false,
  autoUpdate: true,
  textNotifications: true,
  fileNotifications: true,
  deviceNotifications: true,
  previewNotifications: false,
  theme: 'system',
  accent: 'blue',
  fontScale: 1,
  density: 'comfortable',
  rememberLastPage: true,
  sidebarOrder: ['home', 'clipboard', 'files', 'prompts', 'storage', 'devices'],
  homeWidgets: ['quick-send', 'devices', 'recent', 'storage'],
  defaultTargetDeviceId: undefined,
  downloadDirectory: undefined,
  meteredNetworkUploads: false,
  reduceMotion: false,
  wallpaperPath: undefined,
  wallpaperUrl: undefined,
  wallpaperOverlay: 0.58,
}

interface FlowState {
  onboarded: boolean
  accountEmail: string
  workspaceName: string
  devices: Device[]
  selectedTargetId: string
  clipboardItems: ClipboardItem[]
  transfers: Transfer[]
  prompts: Prompt[]
  activities: Activity[]
  settings: Settings
  profile: UserProfile | null
  role: UserRole
  quota: StorageQuota
  storageItems: StorageItem[]
  adminUsers: AdminUserSummary[]
  auditLogs: AuditLog[]
  cloudStatus: CloudConnectionState
  completeOnboarding: (email: string, deviceName: string) => void
  setCloudStatus: (status: FlowState['cloudStatus']) => void
  setCloudDevices: (devices: Device[]) => void
  setCloudClipboard: (items: ClipboardItem[]) => void
  recordCloudClipboard: (item: ClipboardItem, incoming: boolean) => void
  setProfile: (profile: UserProfile | null) => void
  patchProfile: (patch: Partial<UserProfile>) => void
  setRole: (role: UserRole) => void
  setQuota: (quota: StorageQuota) => void
  setStorageItems: (items: StorageItem[]) => void
  upsertStorageItem: (item: StorageItem) => void
  removeStorageItem: (id: string) => void
  setAdminUsers: (users: AdminUserSummary[]) => void
  setAuditLogs: (logs: AuditLog[]) => void
  selectTarget: (id: string) => void
  renameDevice: (id: string, name: string) => void
  removeDevice: (id: string) => void
  sendText: (content: string) => { ok: true; item: ClipboardItem } | { ok: false; message: string }
  toggleClipboardFavorite: (id: string) => void
  deleteClipboard: (id: string) => void
  clearClipboard: () => void
  createTransfers: (files: Array<{ name: string; size: number; type?: string; path?: string; mtimeMs?: number }>) => Transfer[]
  setCloudTransfers: (items: Transfer[]) => void
  upsertTransfer: (item: Transfer) => void
  updateTransfer: (id: string, patch: Partial<Pick<Transfer, 'status' | 'progress' | 'bytesTransferred' | 'storageKey' | 'checksum' | 'error' | 'localPath' | 'localMtimeMs' | 'stage'>>) => void
  retryTransfer: (id: string) => void
  cancelTransfer: (id: string) => void
  clearTransfers: () => void
  savePrompt: (content: string, title?: string, parentPromptId?: string) => Prompt
  updatePrompt: (id: string, patch: Partial<Pick<Prompt, 'title' | 'content' | 'tags' | 'modelName'>>) => void
  togglePromptFavorite: (id: string) => void
  deletePrompt: (id: string) => void
  restorePrompt: (id: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  resetDemo: () => void
}

const initialClipboard: ClipboardItem[] = [
  {
    id: 'clip-welcome',
    sourceDeviceId: studioDevice.id,
    targetDeviceId: currentDevice.id,
    content: '把雨夜城市画成一张克制的电影海报，保留大面积负空间，人物只占画面约 15%。',
    contentHash: contentHash('把雨夜城市画成一张克制的电影海报，保留大面积负空间，人物只占画面约 15%。'),
    contentType: 'prompt',
    isFavorite: true,
    createdAt: new Date(now - 8 * 60_000).toISOString(),
  },
  {
    id: 'clip-url',
    sourceDeviceId: currentDevice.id,
    targetDeviceId: studioDevice.id,
    content: 'https://supabase.com/docs/guides/realtime',
    contentHash: contentHash('https://supabase.com/docs/guides/realtime'),
    contentType: 'url',
    isFavorite: false,
    createdAt: new Date(now - 38 * 60_000).toISOString(),
  },
]

const initialPrompts: Prompt[] = [
  {
    id: 'prompt-1',
    title: '雨夜城市海报 · V2',
    content: initialClipboard[0].content,
    tags: ['海报', '电影感'],
    modelName: 'Midjourney',
    sourceDeviceId: studioDevice.id,
    parentPromptId: 'prompt-0',
    isFavorite: true,
    createdAt: new Date(now - 86_400_000).toISOString(),
    updatedAt: new Date(now - 8 * 60_000).toISOString(),
  },
]

const initialTransfers: Transfer[] = [
  {
    id: 'transfer-1',
    sourceDeviceId: currentDevice.id,
    targetDeviceId: studioDevice.id,
    fileName: 'character-reference.png',
    fileSize: 8_432_100,
    mimeType: 'image/png',
    status: 'completed',
    progress: 100,
    bytesTransferred: 8_432_100,
    checksum: '9c2c2f75…b84d',
    createdAt: new Date(now - 22 * 60_000).toISOString(),
    expiresAt: new Date(now + 6 * 86_400_000).toISOString(),
  },
]

const initialActivities: Activity[] = [
  { id: 'activity-1', type: 'clipboard', title: '已收到 Prompt', detail: '来自 AI 创作工作站', status: 'success', createdAt: new Date(now - 8 * 60_000).toISOString() },
  { id: 'activity-2', type: 'file', title: 'character-reference.png', detail: '已发送至 AI 创作工作站', status: 'success', createdAt: new Date(now - 22 * 60_000).toISOString() },
]

const emptyQuota: StorageQuota = { quotaBytes: 2 * 1024 ** 3, usedBytes: 0 }
const addActivity = (activities: Activity[], activity: Omit<Activity, 'id' | 'createdAt'>) => [
  { ...activity, id: createId('activity'), createdAt: new Date().toISOString() },
  ...activities,
].slice(0, 1000)

const initialData = () => ({
  devices: isCloudConfigured ? [currentDevice] : [currentDevice, studioDevice, laptopDevice],
  selectedTargetId: isCloudConfigured ? '' : studioDevice.id,
  clipboardItems: isCloudConfigured ? [] : initialClipboard,
  transfers: isCloudConfigured ? [] : initialTransfers,
  prompts: isCloudConfigured ? [] : initialPrompts,
  activities: isCloudConfigured ? [] : initialActivities,
})

export const useFlowStore = create<FlowState>()(persist((set, get) => ({
  onboarded: false,
  accountEmail: '',
  workspaceName: '我的创作空间',
  ...initialData(),
  settings: defaultSettings,
  profile: null,
  role: 'user',
  quota: emptyQuota,
  storageItems: [],
  adminUsers: [],
  auditLogs: [],
  cloudStatus: 'idle',

  completeOnboarding: (email, deviceName) => set((state) => ({
    onboarded: true,
    accountEmail: email,
    devices: state.devices.map((device) => device.isCurrent ? { ...device, name: deviceName.trim() || '这台电脑' } : device),
  })),
  setCloudStatus: (cloudStatus) => set({ cloudStatus }),
  setCloudDevices: (devices) => set((state) => {
    const selectedStillExists = devices.some((device) => device.id === state.selectedTargetId && !device.isCurrent)
    const defaultTarget = state.settings.defaultTargetDeviceId
    const nextTarget = devices.find((device) => !device.isCurrent && device.id === defaultTarget)?.id
      ?? devices.find((device) => !device.isCurrent)?.id
      ?? ''
    return { devices, selectedTargetId: selectedStillExists ? state.selectedTargetId : nextTarget }
  }),
  setCloudClipboard: (clipboardItems) => set({ clipboardItems }),
  recordCloudClipboard: (item, incoming) => set((state) => {
    if (state.clipboardItems.some((existing) => existing.id === item.id)) return state
    const peerId = incoming ? item.sourceDeviceId : item.targetDeviceId
    const peerName = state.devices.find((device) => device.id === peerId)?.name ?? '另一台设备'
    return {
      clipboardItems: [item, ...state.clipboardItems],
      activities: addActivity(state.activities, {
        type: 'clipboard',
        title: incoming ? '已收到文本' : '文本已送达',
        detail: incoming ? `来自 ${peerName}` : `发送至 ${peerName}`,
        status: 'success',
      }),
    }
  }),
  setProfile: (profile) => set({ profile }),
  patchProfile: (patch) => set((state) => ({ profile: state.profile ? { ...state.profile, ...patch } : state.profile })),
  setRole: (role) => set({ role }),
  setQuota: (quota) => set({ quota }),
  setStorageItems: (storageItems) => set({ storageItems }),
  upsertStorageItem: (item) => set((state) => ({ storageItems: [item, ...state.storageItems.filter((entry) => entry.id !== item.id)] })),
  removeStorageItem: (id) => set((state) => ({ storageItems: state.storageItems.filter((entry) => entry.id !== id) })),
  setAdminUsers: (adminUsers) => set({ adminUsers }),
  setAuditLogs: (auditLogs) => set({ auditLogs }),
  selectTarget: (selectedTargetId) => set({ selectedTargetId }),
  renameDevice: (id, name) => set((state) => ({ devices: state.devices.map((device) => device.id === id ? { ...device, name: name.trim() || device.name } : device) })),
  removeDevice: (id) => set((state) => {
    const devices = state.devices.filter((device) => device.id !== id || device.isCurrent)
    return {
      devices,
      selectedTargetId: state.selectedTargetId === id ? (devices.find((device) => !device.isCurrent)?.id ?? '') : state.selectedTargetId,
      activities: addActivity(state.activities, { type: 'device', title: '设备已移除', detail: '该设备将无法继续收发内容', status: 'info' }),
    }
  }),
  sendText: (content) => {
    const state = get()
    if (state.settings.syncPaused) return { ok: false, message: '同步已暂停，请先恢复同步' }
    const target = state.devices.find((device) => device.id === state.selectedTargetId && !device.isCurrent)
    if (!target) return { ok: false, message: '请选择目标设备' }
    const hash = contentHash(content)
    const duplicate = state.clipboardItems.some((item) => item.contentHash === hash && Date.now() - new Date(item.createdAt).getTime() < 60_000)
    if (duplicate) return { ok: false, message: '相同内容刚刚已发送' }
    const item: ClipboardItem = {
      id: createId('clip'),
      sourceDeviceId: state.devices.find((device) => device.isCurrent)!.id,
      targetDeviceId: target.id,
      content,
      contentHash: hash,
      contentType: classifyContent(content),
      isFavorite: false,
      createdAt: new Date().toISOString(),
    }
    set({
      clipboardItems: [item, ...state.clipboardItems],
      activities: addActivity(state.activities, { type: 'clipboard', title: '文本已送达', detail: `发送至 ${target.name}`, status: 'success' }),
    })
    return { ok: true, item }
  },
  toggleClipboardFavorite: (id) => set((state) => ({ clipboardItems: state.clipboardItems.map((item) => item.id === id ? { ...item, isFavorite: !item.isFavorite } : item) })),
  deleteClipboard: (id) => set((state) => ({ clipboardItems: state.clipboardItems.filter((item) => item.id !== id) })),
  clearClipboard: () => set((state) => ({ clipboardItems: state.clipboardItems.filter((item) => item.isFavorite) })),
  createTransfers: (files) => {
    const state = get()
    const target = state.devices.find((device) => device.id === state.selectedTargetId && !device.isCurrent)
    if (!target || state.settings.syncPaused) return []
    const createdAt = new Date().toISOString()
    const transfers = files.map<Transfer>((file) => ({
      id: isCloudConfigured ? crypto.randomUUID() : createId('transfer'),
      sourceDeviceId: state.devices.find((device) => device.isCurrent)!.id,
      targetDeviceId: target.id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      localPath: file.path,
      localMtimeMs: file.mtimeMs,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      bytesTransferred: 0,
      createdAt,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    }))
    set({
      transfers: [...transfers, ...state.transfers],
      activities: addActivity(state.activities, { type: 'file', title: `${transfers.length} 个文件已加入队列`, detail: `目标：${target.name}`, status: 'pending' }),
    })
    return transfers
  },
  setCloudTransfers: (transfers) => set((state) => ({
    transfers: transfers.map((transfer) => {
      const local = state.transfers.find((item) => item.id === transfer.id)
      return local ? { ...transfer, localPath: local.localPath } : transfer
    }),
  })),
  upsertTransfer: (item) => set((state) => ({ transfers: [item, ...state.transfers.filter((entry) => entry.id !== item.id)] })),
  updateTransfer: (id, patch) => set((state) => {
    const transfer = state.transfers.find((item) => item.id === id)
    const statusChanged = transfer && patch.status && transfer.status !== patch.status
    const completed = patch.status === 'completed'
    const failed = patch.status === 'failed' || patch.status === 'checksum_failed'
    const activities = statusChanged && (completed || failed)
      ? addActivity(state.activities, { type: 'file', title: transfer.fileName, detail: completed ? '传输完成，校验通过' : (patch.error ?? '传输失败，可重试'), status: completed ? 'success' : 'failed' })
      : state.activities
    return { transfers: state.transfers.map((item) => item.id === id ? { ...item, ...patch } : item), activities }
  }),
  retryTransfer: (id) => get().updateTransfer(id, { status: 'queued', stage: 'queued', error: undefined }),
  cancelTransfer: (id) => get().updateTransfer(id, { status: 'cancelled' as TransferStatus }),
  clearTransfers: () => set((state) => ({ transfers: state.transfers.filter((item) => !['completed', 'cancelled', 'expired'].includes(item.status)) })),
  savePrompt: (content, title, parentPromptId) => {
    const state = get()
    const prompt: Prompt = {
      id: createId('prompt'),
      title: title?.trim() || content.trim().split(/\n/)[0].slice(0, 32) || '未命名 Prompt',
      content,
      tags: [],
      sourceDeviceId: state.devices.find((device) => device.isCurrent)!.id,
      parentPromptId,
      isFavorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    set({ prompts: [prompt, ...state.prompts], activities: addActivity(state.activities, { type: 'prompt', title: 'Prompt 已保存', detail: prompt.title, status: 'success' }) })
    return prompt
  },
  updatePrompt: (id, patch) => set((state) => ({ prompts: state.prompts.map((prompt) => prompt.id === id ? { ...prompt, ...patch, updatedAt: new Date().toISOString() } : prompt) })),
  togglePromptFavorite: (id) => set((state) => ({ prompts: state.prompts.map((prompt) => prompt.id === id ? { ...prompt, isFavorite: !prompt.isFavorite } : prompt) })),
  deletePrompt: (id) => set((state) => ({ prompts: state.prompts.map((prompt) => prompt.id === id ? { ...prompt, deletedAt: new Date().toISOString() } : prompt) })),
  restorePrompt: (id) => set((state) => ({ prompts: state.prompts.map((prompt) => prompt.id === id ? { ...prompt, deletedAt: undefined } : prompt) })),
  updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
  resetDemo: () => set({
    onboarded: false,
    accountEmail: '',
    ...initialData(),
    settings: defaultSettings,
    profile: null,
    role: 'user',
    quota: emptyQuota,
    storageItems: [],
    adminUsers: [],
    auditLogs: [],
    cloudStatus: 'idle',
  }),
}), {
  name: 'flowbridge-v0.2',
  version: 3,
  migrate: (persisted) => {
    const previous = (persisted ?? {}) as Partial<FlowState>
    return {
      ...previous,
      settings: { ...defaultSettings, ...(previous.settings ?? {}) },
      profile: previous.profile ?? null,
      role: previous.role ?? 'user',
      quota: previous.quota ?? emptyQuota,
      storageItems: previous.storageItems ?? [],
      adminUsers: previous.adminUsers ?? [],
      auditLogs: previous.auditLogs ?? [],
      cloudStatus: 'idle',
    } as FlowState
  },
}))
