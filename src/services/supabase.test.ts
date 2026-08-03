import { describe, expect, it } from 'vitest'
import { safeStorageFileName, sha256 } from './supabase'

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

describe('storage object keys', () => {
  it('keeps Chinese and other unsupported characters out of the internal Supabase key', () => {
    expect(safeStorageFileName('微信图片_20240921221915.jpg')).toBe('file.jpg')
    expect(safeStorageFileName('2024 年 12 月大学英语四级考试真题(第1套).docx')).toBe('file.docx')
    expect(safeStorageFileName('未渲染的人间-01-海水涨进卧室-15秒 (7).mp4')).toBe('file.mp4')
  })
})
