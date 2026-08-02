import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { createSHA256 } from 'hash-wasm'
import * as tus from 'tus-js-client'
import { classifyContent, contentHash } from '../lib/domain'
import type {
  AdminUserSummary,
  AuditLog,
  ClipboardItem,
  Device,
  Settings,
  StorageCategory,
  StorageItem,
  StorageQuota,
  Transfer,
  UserProfile,
  UserRole,
} from '../types'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim()
const bucket = 'flowbridge-files'

const localDemoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')
export const isCloudConfigured = Boolean(url && publishableKey && !url.includes('your-project')) && !localDemoMode
export const supabase: SupabaseClient | null = isCloudConfigured ? createClient(url!, publishableKey!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

function requireClient() {
  if (!supabase) throw new Error('尚未配置 Supabase。请填写项目地址与 Publishable key。')
  return supabase
}

async function requireSession(): Promise<Session> {
  const client = requireClient()
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  if (!data.session) throw new Error('登录已失效，请退出后重新登录')
  return data.session
}

export function getOrCreateDeviceId() {
  const storageKey = 'flowbridge-device-id'
  const existing = window.localStorage.getItem(storageKey)
  if (existing) return existing
  const id = crypto.randomUUID()
  window.localStorage.setItem(storageKey, id)
  return id
}

export async function getCloudSession() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export async function signInWithPassword(email: string, password: string) {
  const client = requireClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

export async function signUpWithPassword(email: string, password: string) {
  const client = requireClient()
  const { data, error } = await client.auth.signUp({ email, password })
  if (error) throw error
  return data.session
}

export async function signOutCloud() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function registerDevice(input: { id: string; name: string; platform: string }) {
  const client = requireClient()
  const session = await requireSession()
  const { error } = await client.from('devices').upsert({
    id: input.id,
    user_id: session.user.id,
    name: input.name,
    platform: input.platform,
    app_version: '0.3.0',
    last_app_version: '0.3.0',
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
  })
  if (error) throw error
}

type DeviceRow = { id: string; name: string; platform: Device['platform']; last_seen_at: string; revoked_at: string | null }
type ClipboardRow = {
  id: string; source_device_id: string; target_device_id: string; content: string; content_hash: string
  content_type: ClipboardItem['contentType']; is_favorite: boolean; created_at: string
}
type TransferRow = {
  id: string; source_device_id: string; target_device_id: string; file_name: string; file_size: number
  mime_type: string; status: Transfer['status']; bytes_transferred: number; storage_key: string
  checksum: string | null; last_error_code: string | null; created_at: string; expires_at: string
}
type StorageRow = {
  id: string; owner_id: string; transfer_id: string | null; storage_key: string; original_name: string
  mime_type: string; size_bytes: number; sha256: string; category: StorageItem['category']
  retention_type: StorageItem['retentionType']; expires_at: string | null; deleted_at: string | null
  created_at: string; updated_at: string
}

const mapDevice = (row: DeviceRow, currentDeviceId: string): Device => ({
  id: row.id,
  name: row.name,
  platform: row.platform,
  status: row.id === currentDeviceId || Date.now() - new Date(row.last_seen_at).getTime() < 60_000 ? 'online' : 'offline',
  isCurrent: row.id === currentDeviceId,
  lastSeenAt: row.last_seen_at,
})

const mapClipboard = (row: ClipboardRow): ClipboardItem => ({
  id: row.id,
  sourceDeviceId: row.source_device_id,
  targetDeviceId: row.target_device_id,
  content: row.content,
  contentHash: row.content_hash,
  contentType: row.content_type,
  isFavorite: row.is_favorite,
  createdAt: row.created_at,
})

const mapTransfer = (row: TransferRow): Transfer => ({
  id: row.id,
  sourceDeviceId: row.source_device_id,
  targetDeviceId: row.target_device_id,
  fileName: row.file_name,
  fileSize: Number(row.file_size),
  mimeType: row.mime_type,
  status: row.status,
  progress: row.file_size > 0 ? Math.round(Number(row.bytes_transferred ?? 0) / Number(row.file_size) * 100) : 0,
  bytesTransferred: Number(row.bytes_transferred ?? 0),
  storageKey: row.storage_key,
  checksum: row.checksum ?? undefined,
  error: row.last_error_code ?? undefined,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
})

const mapStorage = (row: StorageRow): StorageItem => ({
  id: row.id,
  ownerId: row.owner_id,
  transferId: row.transfer_id ?? undefined,
  storageKey: row.storage_key,
  originalName: row.original_name,
  mimeType: row.mime_type,
  sizeBytes: Number(row.size_bytes),
  sha256: row.sha256,
  category: row.category,
  retentionType: row.retention_type,
  expiresAt: row.expires_at ?? undefined,
  deletedAt: row.deleted_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export async function sendCloudClipboard(input: { sourceDeviceId: string; targetDeviceId: string; content: string }) {
  const client = requireClient()
  const session = await requireSession()
  const { data, error } = await client.from('clipboard_items').insert({
    user_id: session.user.id,
    source_device_id: input.sourceDeviceId,
    target_device_id: input.targetDeviceId,
    content_type: classifyContent(input.content),
    content: input.content,
    content_hash: contentHash(input.content),
  }).select().single()
  if (error) throw error
  const { error: eventError } = await client.from('sync_events').insert({
    user_id: session.user.id,
    source_device_id: input.sourceDeviceId,
    target_device_id: input.targetDeviceId,
    event_type: 'clipboard.created',
    payload_ref: data.id,
  })
  if (eventError) throw eventError
  return mapClipboard(data as ClipboardRow)
}

export interface AccountSnapshot {
  profile: UserProfile
  settings: Partial<Settings>
  role: UserRole
  quota: StorageQuota
  storageItems: StorageItem[]
  transfers: Transfer[]
}

export async function loadAccountSnapshot(): Promise<AccountSnapshot> {
  const client = requireClient()
  const session = await requireSession()
  const userId = session.user.id
  const [profileResult, preferencesResult, roleResult, quotaResult, storageResult, transferResult] = await Promise.all([
    client.from('profiles').select('*').eq('id', userId).single(),
    client.from('user_preferences').select('*').eq('user_id', userId).single(),
    client.from('user_roles').select('role').eq('user_id', userId).single(),
    client.from('storage_quotas').select('quota_bytes,used_bytes_cached').eq('user_id', userId).single(),
    client.from('storage_items').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(500),
    client.from('transfers').select('id,source_device_id,target_device_id,file_name,file_size,mime_type,status,bytes_transferred,storage_key,checksum,last_error_code,created_at,expires_at').order('created_at', { ascending: false }).limit(300),
  ])
  const firstError = [profileResult, preferencesResult, roleResult, quotaResult, storageResult, transferResult].find((result) => result.error)?.error
  if (firstError) throw firstError
  const profile = profileResult.data
  const preferences = preferencesResult.data
  return {
    profile: {
      id: userId,
      email: profile.email || session.user.email || '',
      displayName: profile.display_name || session.user.email?.split('@')[0] || 'FlowBridge 用户',
      avatarPath: profile.avatar_path ?? undefined,
      bio: profile.bio || '',
      locale: profile.locale || 'zh-CN',
      timezone: profile.timezone || 'Asia/Shanghai',
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    },
    settings: {
      theme: preferences.theme,
      accent: preferences.accent,
      fontScale: Number(preferences.font_scale) as Settings['fontScale'],
      density: preferences.density,
      sidebarOrder: preferences.sidebar_order,
      homeWidgets: (preferences.home_widgets as string[]).map((item) => item === 'activity' ? 'recent' : item),
      defaultTargetDeviceId: preferences.default_target_device_id ?? undefined,
      textNotifications: preferences.notification_policy?.text ?? true,
      fileNotifications: preferences.notification_policy?.file ?? true,
      deviceNotifications: preferences.notification_policy?.device ?? true,
      previewNotifications: preferences.notification_policy?.preview ?? false,
      historyDays: preferences.retention_policy?.clipboardDays ?? 30,
    },
    role: (roleResult.data?.role ?? 'user') as UserRole,
    quota: { quotaBytes: Number(quotaResult.data?.quota_bytes ?? 2 * 1024 ** 3), usedBytes: Number(quotaResult.data?.used_bytes_cached ?? 0) },
    storageItems: (storageResult.data as StorageRow[]).map(mapStorage),
    transfers: (transferResult.data as TransferRow[]).map(mapTransfer),
  }
}

export async function updateCloudProfile(patch: Pick<UserProfile, 'displayName' | 'bio' | 'locale' | 'timezone'>) {
  const client = requireClient()
  const session = await requireSession()
  const { error } = await client.from('profiles').update({
    display_name: patch.displayName.trim(),
    bio: patch.bio.trim(),
    locale: patch.locale,
    timezone: patch.timezone,
    updated_at: new Date().toISOString(),
  }).eq('id', session.user.id)
  if (error) throw error
}

export async function updateCloudPreferences(settings: Settings) {
  const client = requireClient()
  const session = await requireSession()
  const { error } = await client.from('user_preferences').update({
    theme: settings.theme,
    accent: settings.accent,
    font_scale: settings.fontScale,
    density: settings.density,
    sidebar_order: settings.sidebarOrder,
    home_widgets: settings.homeWidgets,
    default_target_device_id: settings.defaultTargetDeviceId ?? null,
    notification_policy: {
      text: settings.textNotifications,
      file: settings.fileNotifications,
      device: settings.deviceNotifications,
      preview: settings.previewNotifications,
      quota: true,
    },
    retention_policy: { clipboardDays: settings.historyDays, transferDays: 7, trashDays: 30 },
    updated_at: new Date().toISOString(),
  }).eq('user_id', session.user.id)
  if (error) throw error
}

const categoryFor = (mimeType: string, name: string): StorageCategory => {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return 'archive'
  if (mimeType.startsWith('text/') || /\.(pdf|docx?|xlsx?|pptx?|md|txt|csv)$/i.test(name)) return 'document'
  return 'other'
}

const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|#%]/g, '_').slice(-180) || 'file'

export async function sha256(file: File, onProgress?: (progress: number) => void) {
  const hasher = await createSHA256()
  hasher.init()
  const chunkSize = 4 * 1024 * 1024
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const chunk = new Uint8Array(await file.slice(offset, Math.min(offset + chunkSize, file.size)).arrayBuffer())
    hasher.update(chunk)
    onProgress?.(Math.round(Math.min(offset + chunk.length, file.size) / Math.max(file.size, 1) * 100))
  }
  return hasher.digest('hex')
}

export interface UploadFileInput {
  file: File
  transferId?: string
  sourceDeviceId: string
  targetDeviceId: string
  onProgress: (progress: number, bytesUploaded: number) => void
  onHashProgress?: (progress: number) => void
}

export async function uploadCloudFile(input: UploadFileInput): Promise<{ transfer: Transfer; storageItem: StorageItem }> {
  if (input.file.size > 500 * 1024 ** 2) throw new Error('单个文件不能超过 500 MB')
  const client = requireClient()
  const session = await requireSession()
  const { data: quotaRow, error: quotaError } = await client.from('storage_quotas').select('quota_bytes,used_bytes_cached').eq('user_id', session.user.id).single()
  if (quotaError) throw quotaError
  if (Number(quotaRow.used_bytes_cached) + input.file.size > Number(quotaRow.quota_bytes)) throw new Error('云端空间不足，请先清理文件或联系管理员调整配额')

  const transferId = input.transferId ?? crypto.randomUUID()
  const storageKey = `${session.user.id}/${transferId}/${safeFileName(input.file.name)}`
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
  const { error: insertError } = await client.from('transfers').insert({
    id: transferId,
    user_id: session.user.id,
    source_device_id: input.sourceDeviceId,
    target_device_id: input.targetDeviceId,
    file_name: input.file.name,
    file_size: input.file.size,
    mime_type: input.file.type || 'application/octet-stream',
    storage_key: storageKey,
    status: 'uploading',
    bytes_transferred: 0,
    expires_at: expiresAt,
  })
  if (insertError) throw insertError

  try {
    const checksum = await sha256(input.file, input.onHashProgress)
    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(input.file, {
        endpoint: `${url}/storage/v1/upload/resumable`,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        headers: { authorization: `Bearer ${session.access_token}`, 'x-upsert': 'true' },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        metadata: {
          bucketName: bucket,
          objectName: storageKey,
          contentType: input.file.type || 'application/octet-stream',
          cacheControl: '3600',
        },
        onError: reject,
        onProgress: (uploaded, total) => input.onProgress(Math.round(uploaded / Math.max(total, 1) * 100), uploaded),
        onSuccess: () => resolve(),
      })
      void upload.findPreviousUploads().then((previous) => {
        if (previous.length) upload.resumeFromPreviousUpload(previous[0])
        upload.start()
      }).catch(reject)
    })

    const { data: transferRow, error: transferError } = await client.from('transfers').update({
      status: 'waiting',
      bytes_transferred: input.file.size,
      checksum,
      updated_at: new Date().toISOString(),
    }).eq('id', transferId).select('id,source_device_id,target_device_id,file_name,file_size,mime_type,status,bytes_transferred,storage_key,checksum,last_error_code,created_at,expires_at').single()
    if (transferError) throw transferError
    const { data: storageRow, error: storageError } = await client.from('storage_items').insert({
      owner_id: session.user.id,
      transfer_id: transferId,
      storage_key: storageKey,
      original_name: input.file.name,
      mime_type: input.file.type || 'application/octet-stream',
      size_bytes: input.file.size,
      sha256: checksum,
      category: categoryFor(input.file.type, input.file.name),
      retention_type: 'temporary',
      expires_at: expiresAt,
    }).select().single()
    if (storageError) throw storageError
    const { error: eventError } = await client.from('sync_events').insert({
      user_id: session.user.id,
      source_device_id: input.sourceDeviceId,
      target_device_id: input.targetDeviceId,
      event_type: 'file.ready',
      payload_ref: transferId,
    })
    if (eventError) throw eventError
    return { transfer: mapTransfer(transferRow as TransferRow), storageItem: mapStorage(storageRow as StorageRow) }
  } catch (error) {
    const message = error instanceof Error ? error.message : '上传失败'
    await client.from('transfers').update({ status: 'failed', last_error_code: message.slice(0, 180), updated_at: new Date().toISOString() }).eq('id', transferId)
    throw error
  }
}

export async function createFileDownload(storageKey: string) {
  const client = requireClient()
  await requireSession()
  const { data, error } = await client.storage.from(bucket).createSignedUrl(storageKey, 120, { download: true })
  if (error) throw error
  return data.signedUrl
}

export async function markTransferCompleted(transferId: string, sourceDeviceId: string, targetDeviceId: string) {
  const client = requireClient()
  const session = await requireSession()
  const { error } = await client.from('transfers').update({ status: 'completed', received_at: new Date().toISOString(), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', transferId)
  if (error) throw error
  await client.from('sync_events').insert({ user_id: session.user.id, source_device_id: sourceDeviceId, target_device_id: targetDeviceId, event_type: 'file.received', payload_ref: transferId })
}

export async function deleteCloudStorageItem(item: StorageItem) {
  const client = requireClient()
  const { error: storageError } = await client.storage.from(bucket).remove([item.storageKey])
  if (storageError) throw storageError
  const { error } = await client.from('storage_items').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', item.id)
  if (error) throw error
}

export async function saveCloudStorageItem(id: string) {
  const client = requireClient()
  const { error } = await client.from('storage_items').update({ retention_type: 'saved', expires_at: null, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function loadAdminData(): Promise<{ users: AdminUserSummary[]; logs: AuditLog[] }> {
  const client = requireClient()
  const [{ data: users, error: userError }, { data: logs, error: logError }] = await Promise.all([
    client.rpc('admin_list_users'),
    client.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(300),
  ])
  if (userError) throw userError
  if (logError) throw logError
  return {
    users: (users ?? []).map((row: Record<string, unknown>) => ({
      userId: String(row.user_id), email: String(row.email), displayName: String(row.display_name),
      accountStatus: row.account_status as AdminUserSummary['accountStatus'], role: row.role as UserRole,
      createdAt: String(row.created_at), lastSignInAt: row.last_sign_in_at ? String(row.last_sign_in_at) : undefined,
      deviceCount: Number(row.device_count), storageUsed: Number(row.storage_used), storageQuota: Number(row.storage_quota),
    })),
    logs: (logs ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id), actorId: row.actor_id ? String(row.actor_id) : undefined, targetUserId: row.target_user_id ? String(row.target_user_id) : undefined,
      action: String(row.action), resourceType: String(row.resource_type), resourceId: row.resource_id ? String(row.resource_id) : undefined,
      reason: String(row.reason ?? ''), result: row.result as AuditLog['result'], createdAt: String(row.created_at),
    })),
  }
}

export async function adminSetAccountStatus(userId: string, status: AdminUserSummary['accountStatus'], reason: string) {
  const { error } = await requireClient().rpc('admin_set_account_status', { p_user_id: userId, p_status: status, p_reason: reason })
  if (error) throw error
}

export async function adminSetStorageQuota(userId: string, quotaBytes: number, reason: string) {
  const { error } = await requireClient().rpc('admin_set_storage_quota', { p_user_id: userId, p_quota_bytes: quotaBytes, p_reason: reason })
  if (error) throw error
}

export async function adminSetUserRole(userId: string, role: UserRole, reason: string) {
  const { error } = await requireClient().rpc('admin_set_user_role', { p_user_id: userId, p_role: role, p_reason: reason })
  if (error) throw error
}

export async function adminRevokeDevices(userId: string, reason: string) {
  const { error } = await requireClient().rpc('admin_revoke_user_devices', { p_user_id: userId, p_reason: reason })
  if (error) throw error
}

export interface WorkspaceSyncHandlers {
  deviceName: string
  onDevices: (devices: Device[]) => void
  onInitialClipboard: (items: ClipboardItem[]) => void
  onIncomingClipboard: (item: ClipboardItem) => void
  onTransfers?: (items: Transfer[]) => void
  onIncomingTransfer?: (item: Transfer) => void
  onError: (message: string) => void
}

export async function startWorkspaceSync(handlers: WorkspaceSyncHandlers) {
  const client = requireClient()
  const session = await requireSession()
  const currentDeviceId = getOrCreateDeviceId()
  await registerDevice({ id: currentDeviceId, name: handlers.deviceName, platform: 'Windows' })
  const transferColumns = 'id,source_device_id,target_device_id,file_name,file_size,mime_type,status,bytes_transferred,storage_key,checksum,last_error_code,created_at,expires_at'

  const refreshDevices = async () => {
    const { data, error } = await client.from('devices').select('id,name,platform,last_seen_at,revoked_at').is('revoked_at', null).order('last_seen_at', { ascending: false })
    if (error) throw error
    handlers.onDevices((data as DeviceRow[]).map((row) => mapDevice(row, currentDeviceId)))
  }
  const loadHistory = async () => {
    const { data, error } = await client.from('clipboard_items').select('id,source_device_id,target_device_id,content,content_hash,content_type,is_favorite,created_at').order('created_at', { ascending: false }).limit(200)
    if (error) throw error
    handlers.onInitialClipboard((data as ClipboardRow[]).map(mapClipboard))
  }
  const loadTransfers = async () => {
    if (!handlers.onTransfers) return
    const { data, error } = await client.from('transfers').select(transferColumns).order('created_at', { ascending: false }).limit(300)
    if (error) throw error
    handlers.onTransfers((data as TransferRow[]).map(mapTransfer))
  }
  const deliveredEvents = new Set<string>()
  const deliverEvent = async (event: { id: string; payload_ref: string | null; event_type: string }) => {
    if (!event.payload_ref || deliveredEvents.has(event.id)) return
    deliveredEvents.add(event.id)
    if (event.event_type === 'clipboard.created') {
      const { data, error } = await client.from('clipboard_items').select('id,source_device_id,target_device_id,content,content_hash,content_type,is_favorite,created_at').eq('id', event.payload_ref).single()
      if (error) throw error
      handlers.onIncomingClipboard(mapClipboard(data as ClipboardRow))
    }
    if (event.event_type === 'file.ready') {
      const { data, error } = await client.from('transfers').select(transferColumns).eq('id', event.payload_ref).single()
      if (error) throw error
      handlers.onIncomingTransfer?.(mapTransfer(data as TransferRow))
    }
    const { error: acknowledgeError } = await client.from('sync_events').update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() }).eq('id', event.id)
    if (acknowledgeError) throw acknowledgeError
  }
  const receivePending = async () => {
    const { data, error } = await client.from('sync_events').select('id,payload_ref,event_type').eq('target_device_id', currentDeviceId).in('event_type', ['clipboard.created', 'file.ready']).in('status', ['pending', 'delivered']).order('created_at', { ascending: true })
    if (error) throw error
    for (const event of data as Array<{ id: string; payload_ref: string | null; event_type: string }>) await deliverEvent(event)
  }

  await Promise.all([refreshDevices(), loadHistory(), loadTransfers(), receivePending()])
  const channels: RealtimeChannel[] = []
  channels.push(client.channel(`flowbridge-events-${currentDeviceId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sync_events', filter: `target_device_id=eq.${currentDeviceId}` }, (payload) => {
      const event = payload.new as { id: string; payload_ref: string | null; event_type: string }
      if (event.event_type === 'clipboard.created' || event.event_type === 'file.ready') void deliverEvent(event).catch((error) => handlers.onError(error instanceof Error ? error.message : '接收内容失败'))
    }).subscribe())
  channels.push(client.channel(`flowbridge-devices-${session.user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'devices', filter: `user_id=eq.${session.user.id}` }, () => {
      void refreshDevices().catch((error) => handlers.onError(error instanceof Error ? error.message : '刷新设备失败'))
    }).subscribe())
  if (handlers.onTransfers) {
    channels.push(client.channel(`flowbridge-transfers-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers', filter: `user_id=eq.${session.user.id}` }, () => {
        void loadTransfers().catch((error) => handlers.onError(error instanceof Error ? error.message : '刷新文件失败'))
      }).subscribe())
  }

  const heartbeat = window.setInterval(() => {
    void (async () => {
      const { error } = await client.rpc('heartbeat_device', { p_device_id: currentDeviceId })
      if (error) throw error
      await refreshDevices()
    })().catch((error: unknown) => handlers.onError(error instanceof Error ? error.message : '设备心跳失败'))
  }, 20_000)
  return () => {
    window.clearInterval(heartbeat)
    channels.forEach((channel) => { void client.removeChannel(channel) })
  }
}
