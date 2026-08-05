import { app, net, type WebContents } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, open, readFile, rename, stat, truncate, writeFile } from 'node:fs/promises'
import path from 'node:path'

type JobStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled'
type TransferDirection = 'upload' | 'download'

interface StoredJob {
  id: string
  direction: TransferDirection
  fileName: string
  filePath: string
  fileSize: number
  fileMtimeMs?: number
  status: JobStatus
  completedParts: number
  totalParts: number
  checksum?: string
  error?: string
  updatedAt: string
}

export interface UploadPart {
  key: string
  start: number
  size: number
}

export interface UploadRequest {
  jobId: string
  filePath: string
  fileName: string
  fileSize: number
  fileMtimeMs: number
  mimeType: string
  endpoint: string
  bucket: string
  accessToken: string
  apiKey: string
  parts: UploadPart[]
  manifestKey?: string
}

export interface DownloadRequest {
  jobId: string
  fileName: string
  fileSize: number
  destinationPath: string
  signedUrls: string[]
  partSizes: number[]
  checksum?: string
}

export interface TransferProgress {
  jobId: string
  direction: TransferDirection
  stage: 'hashing' | 'uploading' | 'downloading' | 'verifying' | 'waiting' | 'completed' | 'failed'
  progress: number
  bytesTransferred: number
  error?: string
}

const MAX_UPLOAD_PART_BYTES = 45 * 1024 * 1024
const RETRY_DELAYS = [0, 1_000, 3_000, 5_000, 10_000] as const

function validateJobId(value: string) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw new Error('传输任务编号无效')
}

function validateStorageKey(value: string) {
  if (!/^[a-zA-Z0-9._/-]+$/.test(value) || value.includes('..')) throw new Error('云端文件路径无效')
}

function storageObjectUrl(endpoint: string, bucket: string, key: string) {
  const base = new URL(endpoint)
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co') || base.pathname !== '/storage/v1/object') {
    throw new Error('云端上传地址无效')
  }
  validateStorageKey(bucket)
  validateStorageKey(key)
  const encoded = [bucket, ...key.split('/')].map(encodeURIComponent).join('/')
  return `${base.toString().replace(/\/$/, '')}/${encoded}`
}

async function wait(ms: number) {
  if (ms <= 0) return
  await new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function readRange(filePath: string, start: number, size: number) {
  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.allocUnsafe(size)
    let offset = 0
    while (offset < size) {
      const { bytesRead } = await handle.read(buffer, offset, size - offset, start + offset)
      if (bytesRead === 0) throw new Error('读取原文件时提前结束')
      offset += bytesRead
    }
    return buffer
  } finally {
    await handle.close()
  }
}

async function hashFile(filePath: string, fileSize: number, onProgress: (bytes: number) => void) {
  const handle = await open(filePath, 'r')
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(4 * 1024 * 1024)
  let offset = 0
  try {
    while (offset < fileSize) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, fileSize - offset), offset)
      if (bytesRead === 0) throw new Error('读取原文件时提前结束')
      hash.update(buffer.subarray(0, bytesRead))
      offset += bytesRead
      onProgress(offset)
    }
    return hash.digest('hex')
  } finally {
    await handle.close()
  }
}

async function postObject(input: UploadRequest, key: string, body: Uint8Array, contentType: string) {
  const objectUrl = storageObjectUrl(input.endpoint, input.bucket, key)
  let lastError: unknown
  for (const delay of RETRY_DELAYS) {
    await wait(delay)
    try {
      const response = await net.fetch(objectUrl, {
        method: 'POST',
        headers: {
          apikey: input.apiKey,
          authorization: `Bearer ${input.accessToken}`,
          'content-type': contentType,
          'x-upsert': 'true',
        },
        body,
      })
      if (!response.ok) throw new Error(`上传失败（HTTP ${response.status}）：${(await response.text()).slice(0, 180)}`)
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('上传失败，请检查网络后重试')
}

async function uniqueDestination(requestedPath: string) {
  const parsed = path.parse(requestedPath)
  for (let index = 0; index < 10_000; index += 1) {
    const candidate = index === 0 ? requestedPath : path.join(parsed.dir, `${parsed.name} (${index})${parsed.ext}`)
    try {
      await stat(candidate)
    } catch {
      return candidate
    }
  }
  throw new Error('无法生成可用的保存文件名')
}

export class TransferQueue {
  private jobs = new Map<string, StoredJob>()
  private loaded = false
  private saveChain: Promise<void> = Promise.resolve()

  private get queuePath() {
    return path.join(app.getPath('userData'), 'transfer-queue-v1.json')
  }

  private key(direction: TransferDirection, id: string) {
    return `${direction}:${id}`
  }

  private async load() {
    if (this.loaded) return
    this.loaded = true
    try {
      const parsed = JSON.parse(await readFile(this.queuePath, 'utf8')) as StoredJob[]
      for (const job of parsed) {
        if (job.status === 'running') job.status = 'waiting'
        this.jobs.set(this.key(job.direction, job.id), job)
      }
    } catch {
      this.jobs.clear()
    }
  }

  private async save() {
    const snapshot = JSON.stringify([...this.jobs.values()], null, 2)
    this.saveChain = this.saveChain.catch(() => undefined).then(async () => {
      await mkdir(path.dirname(this.queuePath), { recursive: true })
      const temporaryPath = `${this.queuePath}.${process.pid}.tmp`
      await writeFile(temporaryPath, snapshot, 'utf8')
      await rename(temporaryPath, this.queuePath)
    })
    await this.saveChain
  }

  private emit(webContents: WebContents, progress: TransferProgress) {
    if (!webContents.isDestroyed()) webContents.send('transfer:progress', progress)
  }

  async list() {
    await this.load()
    return [...this.jobs.values()].map((job) => ({ ...job }))
  }

  async get(direction: TransferDirection, id: string) {
    await this.load()
    return this.jobs.get(this.key(direction, id))
  }

  async upload(request: UploadRequest, webContents: WebContents) {
    await this.load()
    validateJobId(request.jobId)
    if (!path.isAbsolute(request.filePath)) throw new Error('原文件路径无效')
    if (!request.parts.length || request.parts.some((part) => part.size <= 0 || part.size > MAX_UPLOAD_PART_BYTES)) throw new Error('文件分片无效')
    if (request.parts.reduce((sum, part) => sum + part.size, 0) !== request.fileSize) throw new Error('文件分片大小与原文件不一致')

    const info = await stat(request.filePath)
    if (!info.isFile() || info.size !== request.fileSize || Math.abs(info.mtimeMs - request.fileMtimeMs) > 2_000) {
      throw new Error('原文件已被移动或修改，请重新选择')
    }

    const key = this.key('upload', request.jobId)
    const existing = this.jobs.get(key)
    const canResume = existing
      && existing.filePath === request.filePath
      && existing.fileSize === request.fileSize
      && existing.fileMtimeMs === request.fileMtimeMs
      && existing.totalParts === request.parts.length
    const job: StoredJob = canResume ? existing : {
      id: request.jobId,
      direction: 'upload',
      fileName: request.fileName,
      filePath: request.filePath,
      fileSize: request.fileSize,
      fileMtimeMs: request.fileMtimeMs,
      status: 'queued',
      completedParts: 0,
      totalParts: request.parts.length,
      updatedAt: new Date().toISOString(),
    }
    this.jobs.set(key, job)
    if (job.status === 'completed' && job.checksum) return { checksum: job.checksum }

    job.status = 'running'
    job.error = undefined
    job.updatedAt = new Date().toISOString()
    await this.save()
    try {
      if (!job.checksum) {
        this.emit(webContents, { jobId: job.id, direction: 'upload', stage: 'hashing', progress: 0, bytesTransferred: 0 })
        job.checksum = await hashFile(job.filePath, job.fileSize, (bytes) => {
          this.emit(webContents, { jobId: job.id, direction: 'upload', stage: 'hashing', progress: Math.round(bytes / Math.max(job.fileSize, 1) * 100), bytesTransferred: bytes })
        })
        await this.save()
      }

      let completedBytes = request.parts.slice(0, job.completedParts).reduce((sum, part) => sum + part.size, 0)
      for (let index = job.completedParts; index < request.parts.length; index += 1) {
        const part = request.parts[index]
        const body = await readRange(job.filePath, part.start, part.size)
        await postObject(request, part.key, body, 'application/octet-stream')
        job.completedParts = index + 1
        completedBytes += part.size
        job.updatedAt = new Date().toISOString()
        await this.save()
        this.emit(webContents, { jobId: job.id, direction: 'upload', stage: 'uploading', progress: Math.round(completedBytes / Math.max(job.fileSize, 1) * 100), bytesTransferred: completedBytes })
      }

      if (request.manifestKey) {
        const manifest = Buffer.from(JSON.stringify({
          format: 'flowbridge.chunk-manifest.v1',
          fileName: request.fileName,
          fileSize: request.fileSize,
          mimeType: request.mimeType,
          checksum: job.checksum,
          chunks: request.parts.map((part) => ({ key: part.key, size: part.size })),
        }))
        await postObject(request, request.manifestKey, manifest, 'application/json')
      }

      job.status = 'completed'
      job.updatedAt = new Date().toISOString()
      await this.save()
      this.emit(webContents, { jobId: job.id, direction: 'upload', stage: 'waiting', progress: 100, bytesTransferred: job.fileSize })
      return { checksum: job.checksum }
    } catch (error) {
      job.status = 'failed'
      job.error = error instanceof Error ? error.message : '上传失败'
      job.updatedAt = new Date().toISOString()
      await this.save()
      this.emit(webContents, { jobId: job.id, direction: 'upload', stage: 'failed', progress: Math.round(job.completedParts / Math.max(job.totalParts, 1) * 100), bytesTransferred: request.parts.slice(0, job.completedParts).reduce((sum, part) => sum + part.size, 0), error: job.error })
      throw error
    }
  }

  async download(request: DownloadRequest, webContents: WebContents) {
    await this.load()
    validateJobId(request.jobId)
    if (!path.isAbsolute(request.destinationPath)) throw new Error('保存路径无效')
    if (!request.signedUrls.length || request.signedUrls.length !== request.partSizes.length) throw new Error('下载分片信息无效')
    if (request.partSizes.reduce((sum, size) => sum + size, 0) !== request.fileSize) throw new Error('下载大小与文件记录不一致')
    if (request.signedUrls.some((url) => {
      try {
        const parsed = new URL(url)
        return parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')
      } catch { return true }
    })) throw new Error('下载地址无效')

    const key = this.key('download', request.jobId)
    const existing = this.jobs.get(key)
    const destinationPath = existing?.filePath ?? await uniqueDestination(request.destinationPath)
    const temporaryPath = `${destinationPath}.flowbridge.part`
    const canResume = existing && existing.fileSize === request.fileSize && existing.totalParts === request.signedUrls.length
    const job: StoredJob = canResume ? existing : {
      id: request.jobId,
      direction: 'download',
      fileName: request.fileName,
      filePath: destinationPath,
      fileSize: request.fileSize,
      status: 'queued',
      completedParts: 0,
      totalParts: request.signedUrls.length,
      updatedAt: new Date().toISOString(),
    }
    this.jobs.set(key, job)
    if (job.status === 'completed') return job.filePath

    job.status = 'running'
    job.error = undefined
    job.updatedAt = new Date().toISOString()
    await this.save()
    const completedBytes = request.partSizes.slice(0, job.completedParts).reduce((sum, size) => sum + size, 0)
    await mkdir(path.dirname(destinationPath), { recursive: true })
    try {
      try { await truncate(temporaryPath, completedBytes) } catch { await writeFile(temporaryPath, Buffer.alloc(0)) }
      const handle = await open(temporaryPath, 'r+')
      let downloadedBytes = completedBytes
      try {
        for (let index = job.completedParts; index < request.signedUrls.length; index += 1) {
          const partStart = downloadedBytes
          let partError: unknown
          let downloaded = false
          for (const delay of RETRY_DELAYS) {
            await wait(delay)
            try {
              await handle.truncate(partStart)
              downloadedBytes = partStart
              const response = await net.fetch(request.signedUrls[index])
              if (!response.ok || !response.body) throw new Error(`下载失败（HTTP ${response.status}）`)
              const reader = response.body.getReader()
              let partBytes = 0
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                const buffer = Buffer.from(value)
                await handle.write(buffer, 0, buffer.length, downloadedBytes)
                downloadedBytes += buffer.length
                partBytes += buffer.length
                if (partBytes > request.partSizes[index]) throw new Error('下载分片大小异常')
                this.emit(webContents, { jobId: job.id, direction: 'download', stage: 'downloading', progress: Math.round(downloadedBytes / Math.max(job.fileSize, 1) * 100), bytesTransferred: downloadedBytes })
              }
              if (partBytes !== request.partSizes[index]) throw new Error('下载分片不完整')
              downloaded = true
              break
            } catch (error) {
              partError = error
            }
          }
          if (!downloaded) throw partError instanceof Error ? partError : new Error('下载失败，请检查网络后重试')
          job.completedParts = index + 1
          job.updatedAt = new Date().toISOString()
          await this.save()
        }
      } finally {
        await handle.close()
      }

      this.emit(webContents, { jobId: job.id, direction: 'download', stage: 'verifying', progress: 100, bytesTransferred: job.fileSize })
      const digest = await hashFile(temporaryPath, job.fileSize, () => undefined)
      if (request.checksum && digest !== request.checksum.toLowerCase()) throw new Error('文件完整性校验失败，请重新接收')
      await rename(temporaryPath, destinationPath)
      job.status = 'completed'
      job.checksum = digest
      job.updatedAt = new Date().toISOString()
      await this.save()
      this.emit(webContents, { jobId: job.id, direction: 'download', stage: 'completed', progress: 100, bytesTransferred: job.fileSize })
      return destinationPath
    } catch (error) {
      job.status = 'failed'
      job.error = error instanceof Error ? error.message : '下载失败'
      job.updatedAt = new Date().toISOString()
      await this.save()
      this.emit(webContents, { jobId: job.id, direction: 'download', stage: 'failed', progress: Math.round(completedBytes / Math.max(job.fileSize, 1) * 100), bytesTransferred: completedBytes, error: job.error })
      throw error
    }
  }
}
