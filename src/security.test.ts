import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('renderer content security policy', () => {
  it('allows WebAssembly hashing without enabling JavaScript unsafe-eval', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(html).toContain("script-src 'self' 'wasm-unsafe-eval'")
    expect(html).not.toMatch(/script-src[^;]*'unsafe-eval'/)
  })
})
