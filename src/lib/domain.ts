import type { ContentType } from '../types'

export const MAX_TEXT_BYTES = 1024 * 1024
export const MAX_FILE_BYTES = 500 * 1024 * 1024
export const MAX_FILES_PER_BATCH = 20

export function createId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}_${random}`
}

export function contentHash(content: string) {
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function classifyContent(content: string): ContentType {
  try {
    const url = new URL(content.trim())
    if (url.protocol === 'http:' || url.protocol === 'https:') return 'url'
  } catch { /* not a URL */ }
  const promptSignals = /(?:生成|画面|风格|要求|角色|镜头|negative\s*prompt|prompt|构图|材质)/i
  return content.length >= 120 || promptSignals.test(content) ? 'prompt' : 'text'
}

export function isSensitiveContent(content: string) {
  return /(?:验证码|password|passwd|secret|api[_ -]?key|token|私钥|BEGIN (?:RSA |EC )?PRIVATE KEY)/i.test(content)
}

export function byteLength(content: string) {
  return new TextEncoder().encode(content).byteLength
}

export function validateText(content: string) {
  if (!content.trim()) return '请输入要发送的内容'
  if (byteLength(content) > MAX_TEXT_BYTES) return '文本超过 1MB，请改用文件发送'
  return null
}

export function validateFiles(files: Array<{ size: number }>) {
  if (files.length === 0) return '请选择至少一个文件'
  if (files.length > MAX_FILES_PER_BATCH) return `单次最多发送 ${MAX_FILES_PER_BATCH} 个文件`
  if (files.some((file) => file.size > MAX_FILE_BYTES)) return '单文件不能超过 500MB'
  return null
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

export function relativeTime(date: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000))
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  return `${Math.floor(seconds / 86400)} 天前`
}
