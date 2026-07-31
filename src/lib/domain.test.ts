import { describe, expect, it } from 'vitest'
import { MAX_FILE_BYTES, MAX_TEXT_BYTES, classifyContent, contentHash, isSensitiveContent, validateFiles, validateText } from './domain'

describe('FlowBridge domain guards', () => {
  it('creates stable hashes for deduplication', () => {
    expect(contentHash('same prompt')).toBe(contentHash('same prompt'))
    expect(contentHash('same prompt')).not.toBe(contentHash('another prompt'))
  })

  it('recognizes URLs and likely prompts', () => {
    expect(classifyContent('https://flowbridge.app/docs')).toBe('url')
    expect(classifyContent('请生成一个有电影感的镜头，画面要求冷色调')).toBe('prompt')
    expect(classifyContent('明天见')).toBe('text')
  })

  it('blocks empty and oversized text', () => {
    expect(validateText('  ')).toContain('请输入')
    expect(validateText('a'.repeat(MAX_TEXT_BYTES + 1))).toContain('1MB')
    expect(validateText('usable')).toBeNull()
  })

  it('blocks oversized file batches', () => {
    expect(validateFiles([])).toContain('至少一个')
    expect(validateFiles([{ size: MAX_FILE_BYTES + 1 }])).toContain('500MB')
    expect(validateFiles([{ size: 1024 }])).toBeNull()
  })

  it('warns about common secret patterns', () => {
    expect(isSensitiveContent('api_key=abc123')).toBe(true)
    expect(isSensitiveContent('普通创作提示词')).toBe(false)
  })
})
