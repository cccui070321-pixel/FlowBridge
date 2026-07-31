import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { classifyContent, contentHash } from '../lib/domain'
import type { ClipboardItem, Device } from '../types'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim()

export const isCloudConfigured = Boolean(url && publishableKey && !url.includes('your-project'))

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
    app_version: '0.2.0',
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
  })
  if (error) throw error
}

type DeviceRow = {
  id: string
  name: string
  platform: Device['platform']
  last_seen_at: string
  revoked_at: string | null
}

type ClipboardRow = {
  id: string
  source_device_id: string
  target_device_id: string
  content: string
  content_hash: string
  content_type: ClipboardItem['contentType']
  is_favorite: boolean
  created_at: string
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

export interface WorkspaceSyncHandlers {
  deviceName: string
  onDevices: (devices: Device[]) => void
  onInitialClipboard: (items: ClipboardItem[]) => void
  onIncomingClipboard: (item: ClipboardItem) => void
  onError: (message: string) => void
}

export async function startWorkspaceSync(handlers: WorkspaceSyncHandlers) {
  const client = requireClient()
  const session = await requireSession()
  const currentDeviceId = getOrCreateDeviceId()
  await registerDevice({ id: currentDeviceId, name: handlers.deviceName, platform: 'Windows' })

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

  const deliveredEvents = new Set<string>()
  const deliverEvent = async (event: { id: string; payload_ref: string | null }) => {
    if (!event.payload_ref || deliveredEvents.has(event.id)) return
    deliveredEvents.add(event.id)
    const { data, error } = await client.from('clipboard_items').select('id,source_device_id,target_device_id,content,content_hash,content_type,is_favorite,created_at').eq('id', event.payload_ref).single()
    if (error) throw error
    handlers.onIncomingClipboard(mapClipboard(data as ClipboardRow))
    const { error: acknowledgeError } = await client.from('sync_events').update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() }).eq('id', event.id)
    if (acknowledgeError) throw acknowledgeError
  }

  const receivePending = async () => {
    const { data, error } = await client.from('sync_events').select('id,payload_ref').eq('target_device_id', currentDeviceId).eq('event_type', 'clipboard.created').in('status', ['pending', 'delivered']).order('created_at', { ascending: true })
    if (error) throw error
    for (const event of data as Array<{ id: string; payload_ref: string | null }>) await deliverEvent(event)
  }

  await Promise.all([refreshDevices(), loadHistory(), receivePending()])

  const channels: RealtimeChannel[] = []
  channels.push(client.channel(`flowbridge-events-${currentDeviceId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sync_events', filter: `target_device_id=eq.${currentDeviceId}` }, (payload) => {
      const event = payload.new as { id: string; payload_ref: string | null; event_type: string }
      if (event.event_type === 'clipboard.created') void deliverEvent(event).catch((error) => handlers.onError(error instanceof Error ? error.message : '接收文本失败'))
    }).subscribe())
  channels.push(client.channel(`flowbridge-devices-${session.user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'devices', filter: `user_id=eq.${session.user.id}` }, () => {
      void refreshDevices().catch((error) => handlers.onError(error instanceof Error ? error.message : '刷新设备失败'))
    }).subscribe())

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

export async function sha256(file: File) {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
