export const MAX_STORAGE_OBJECT_BYTES = 45 * 1024 * 1024
export const CHUNK_MANIFEST_SUFFIX = '.flowbridge.json'
export const CHUNK_MANIFEST_FORMAT = 'flowbridge-chunked-v1'

export interface FileChunkDescriptor {
  key: string
  size: number
}

export interface FileChunkManifest {
  format: typeof CHUNK_MANIFEST_FORMAT
  fileName: string
  fileSize: number
  mimeType: string
  checksum: string
  chunks: FileChunkDescriptor[]
}

export function createChunkDescriptors(baseKey: string, fileSize: number): FileChunkDescriptor[] {
  const count = Math.ceil(fileSize / MAX_STORAGE_OBJECT_BYTES)
  return Array.from({ length: count }, (_, index) => ({
    key: `${baseKey}.flowbridge.part.${String(index + 1).padStart(4, '0')}`,
    size: Math.min(MAX_STORAGE_OBJECT_BYTES, fileSize - index * MAX_STORAGE_OBJECT_BYTES),
  }))
}

export function chunkManifestKey(baseKey: string) {
  return `${baseKey}${CHUNK_MANIFEST_SUFFIX}`
}

export function isChunkManifestKey(storageKey: string) {
  return storageKey.endsWith(CHUNK_MANIFEST_SUFFIX)
}

export function parseChunkManifest(value: unknown): FileChunkManifest {
  if (!value || typeof value !== 'object') throw new Error('分片清单无效')
  const candidate = value as Partial<FileChunkManifest>
  if (
    candidate.format !== CHUNK_MANIFEST_FORMAT
    || typeof candidate.fileName !== 'string'
    || typeof candidate.fileSize !== 'number'
    || typeof candidate.mimeType !== 'string'
    || typeof candidate.checksum !== 'string'
    || !/^[a-f0-9]{64}$/i.test(candidate.checksum)
    || !Array.isArray(candidate.chunks)
    || candidate.chunks.length === 0
  ) throw new Error('分片清单无效')

  const chunks = candidate.chunks.map((chunk) => {
    if (!chunk || typeof chunk.key !== 'string' || typeof chunk.size !== 'number' || chunk.size <= 0 || chunk.size > MAX_STORAGE_OBJECT_BYTES) {
      throw new Error('分片清单包含无效数据')
    }
    return { key: chunk.key, size: chunk.size }
  })
  if (chunks.reduce((total, chunk) => total + chunk.size, 0) !== candidate.fileSize) throw new Error('分片总大小不匹配')
  return { ...candidate, chunks } as FileChunkManifest
}
