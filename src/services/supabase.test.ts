import { describe, expect, it } from 'vitest'
import { sha256 } from './supabase'

describe('file integrity', () => {
  it('calculates a streaming SHA-256 digest without loading the whole file at once', async () => {
    const bytes = new TextEncoder().encode('abc')
    const file = {
      size: bytes.length,
      slice: (start: number, end: number) => ({ arrayBuffer: async () => bytes.slice(start, end).buffer }),
    } as unknown as File
    const progress: number[] = []
    await expect(sha256(file, (value) => progress.push(value))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(progress.at(-1)).toBe(100)
  })
})
