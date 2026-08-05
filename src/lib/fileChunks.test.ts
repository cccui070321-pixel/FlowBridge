import { describe, expect, it } from 'vitest'
import {
  CHUNK_MANIFEST_FORMAT,
  MAX_STORAGE_OBJECT_BYTES,
  chunkManifestKey,
  createChunkDescriptors,
  parseChunkManifest,
} from './fileChunks'

describe('large file chunking', () => {
  it('splits a 106.9 MB file into objects below the Supabase free-plan limit', () => {
    const size = Math.round(106.9 * 1024 * 1024)
    const chunks = createChunkDescriptors('user/transfer/setup.exe', size)
    expect(chunks).toHaveLength(3)
    expect(chunks.every((chunk) => chunk.size <= MAX_STORAGE_OBJECT_BYTES)).toBe(true)
    expect(chunks.reduce((total, chunk) => total + chunk.size, 0)).toBe(size)
    expect(chunkManifestKey('user/transfer/setup.exe')).toBe('user/transfer/setup.exe.flowbridge.json')
  })

  it('accepts only internally consistent manifests', () => {
    const chunks = createChunkDescriptors('user/transfer/file.bin', MAX_STORAGE_OBJECT_BYTES + 10)
    const manifest = {
      format: CHUNK_MANIFEST_FORMAT,
      fileName: 'file.bin',
      fileSize: MAX_STORAGE_OBJECT_BYTES + 10,
      mimeType: 'application/octet-stream',
      checksum: 'a'.repeat(64),
      chunks,
    }
    expect(parseChunkManifest(manifest)).toEqual(manifest)
    expect(() => parseChunkManifest({ ...manifest, fileSize: 1 })).toThrow('分片总大小不匹配')
  })
})
