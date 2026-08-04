import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('renderer content security policy', () => {
  it('allows WebAssembly hashing without enabling JavaScript unsafe-eval', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(html).toContain("script-src 'self' 'wasm-unsafe-eval'")
    expect(html).not.toMatch(/script-src[^;]*'unsafe-eval'/)
  })

  it('loads the CommonJS updater through its default export in packaged ESM', () => {
    const mainProcess = readFileSync(resolve(process.cwd(), 'electron/main.ts'), 'utf8')

    expect(mainProcess).toContain("import electronUpdater from 'electron-updater'")
    expect(mainProcess).not.toContain("import { autoUpdater } from 'electron-updater'")
  })
})
