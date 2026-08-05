import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  userDataPath: '',
  fetch: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getPath: () => electronMock.userDataPath },
  net: { fetch: electronMock.fetch },
}))

import { TransferQueue } from '../../electron/transferQueue'

const webContents = () => ({ isDestroyed: () => false, send: vi.fn() })
const checksum = (value: Buffer) => createHash('sha256').update(value).digest('hex')

describe('TransferQueue', () => {
  let temporaryDirectory = ''

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'flowbridge-transfer-'))
    electronMock.userDataPath = temporaryDirectory
    electronMock.fetch.mockReset()
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('uploads a file, persists progress, and never stores credentials', async () => {
    const content = Buffer.from('FlowBridge reliable upload')
    const filePath = path.join(temporaryDirectory, 'source.bin')
    await writeFile(filePath, content)
    const info = await stat(filePath)
    electronMock.fetch.mockResolvedValue(new Response('', { status: 200 }))
    const queue = new TransferQueue()

    const result = await queue.upload({
      jobId: '12345678-1234-1234-1234-123456789abc',
      filePath,
      fileName: 'source.bin',
      fileSize: content.length,
      fileMtimeMs: info.mtimeMs,
      mimeType: 'application/octet-stream',
      endpoint: 'https://flowbridge.supabase.co/storage/v1/object',
      bucket: 'flowbridge-files',
      accessToken: 'secret-access-token',
      apiKey: 'secret-api-key',
      parts: [{ key: 'user/transfer/file.bin', start: 0, size: content.length }],
    }, webContents() as never)

    expect(result.checksum).toBe(checksum(content))
    expect((await queue.list())[0]).toMatchObject({ status: 'completed', completedParts: 1 })
    const persisted = await readFile(path.join(temporaryDirectory, 'transfer-queue-v1.json'), 'utf8')
    expect(persisted).not.toContain('secret-access-token')
    expect(persisted).not.toContain('secret-api-key')
  })

  it('retries an incomplete part and verifies the final SHA-256 hash', async () => {
    const first = Buffer.from('first part ')
    const second = Buffer.from('second part')
    const content = Buffer.concat([first, second])
    electronMock.fetch
      .mockResolvedValueOnce(new Response(first.subarray(0, 2), { status: 200 }))
      .mockResolvedValueOnce(new Response(first, { status: 200 }))
      .mockResolvedValueOnce(new Response(second, { status: 200 }))
    const queue = new TransferQueue()
    const destinationPath = path.join(temporaryDirectory, 'received.bin')

    const saved = await queue.download({
      jobId: 'abcdef12-1234-1234-1234-123456789abc',
      fileName: 'received.bin',
      fileSize: content.length,
      destinationPath,
      signedUrls: [
        'https://flowbridge.supabase.co/storage/v1/object/sign/part-1',
        'https://flowbridge.supabase.co/storage/v1/object/sign/part-2',
      ],
      partSizes: [first.length, second.length],
      checksum: checksum(content),
    }, webContents() as never)

    expect(saved).toBe(destinationPath)
    expect(await readFile(saved)).toEqual(content)
    expect((await queue.list())[0]).toMatchObject({ status: 'completed', completedParts: 2 })
  })
})
