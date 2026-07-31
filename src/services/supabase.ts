import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isCloudConfigured = Boolean(url && anonKey && !url.includes('your-project'))

export const supabase: SupabaseClient | null = isCloudConfigured ? createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

export async function sendMagicLink(email: string) {
  if (!supabase) throw new Error('尚未配置 Supabase。复制 .env.example 为 .env.local 并填写项目地址与匿名密钥。')
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
  if (error) throw error
}

export async function registerDevice(input: { id: string; name: string; platform: string }) {
  if (!supabase) return
  const { data: session } = await supabase.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) throw new Error('登录状态无效')
  const { error } = await supabase.from('devices').upsert({
    id: input.id,
    user_id: userId,
    name: input.name,
    platform: input.platform,
    app_version: '0.1.0',
    last_seen_at: new Date().toISOString(),
  })
  if (error) throw error
}

export async function sha256(file: File) {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
