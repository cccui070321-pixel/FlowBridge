import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('renderer content security policy', () => {
  it('allows WebAssembly hashing without enabling JavaScript unsafe-eval', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(html).toContain("script-src 'self' 'wasm-unsafe-eval'")
    expect(html).not.toMatch(/script-src[^;]*'unsafe-eval'/)
  })

  it('allows private Supabase avatar and wallpaper images to render', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(html).toMatch(/img-src[^;]*https:\/\/\*\.supabase\.co/)
    expect(html).not.toMatch(/img-src[^;]*https:\/\/(?!\*\.supabase\.co)/)
  })

  it('loads the CommonJS updater through its default export in packaged ESM', () => {
    const mainProcess = readFileSync(resolve(process.cwd(), 'electron/main.ts'), 'utf8')

    expect(mainProcess).toContain("import electronUpdater from 'electron-updater'")
    expect(mainProcess).not.toContain("import { autoUpdater } from 'electron-updater'")
  })

  it('returns a visible checking state without waiting indefinitely for GitHub', () => {
    const mainProcess = readFileSync(resolve(process.cwd(), 'electron/main.ts'), 'utf8')

    expect(mainProcess).toContain("broadcastUpdateState({ status: 'checking'")
    expect(mainProcess).toContain('UPDATE_CHECK_TIMEOUT_MS = 30_000')
    expect(mainProcess).toContain("error: '连接更新服务器超时，请检查网络后重试。'")
    expect(mainProcess).not.toContain('await autoUpdater.checkForUpdates()')
  })
})
