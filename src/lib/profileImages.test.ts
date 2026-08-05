import { describe, expect, it } from 'vitest'
import { takeSelectedFile, validateProfileImage } from './profileImages'

describe('profile image validation', () => {
  it('accepts supported avatar and wallpaper formats within their limits', () => {
    expect(validateProfileImage({ type: 'image/png', size: 1024 } as File, 'avatar')).toBeNull()
    expect(validateProfileImage({ type: 'image/webp', size: 10 * 1024 * 1024 } as File, 'wallpaper')).toBeNull()
  })

  it('rejects spoof-prone unsupported types and oversized images', () => {
    expect(validateProfileImage({ type: 'image/svg+xml', size: 1024 } as File, 'avatar')).toContain('JPG')
    expect(validateProfileImage({ type: 'image/jpeg', size: 6 * 1024 * 1024 } as File, 'avatar')).toContain('5MB')
    expect(validateProfileImage({ type: 'image/jpeg', size: 16 * 1024 * 1024 } as File, 'wallpaper')).toContain('15MB')
  })

  it('clears the file input so choosing the same image triggers another upload', () => {
    const file = { name: 'avatar.png' } as File
    const input = { files: [file], value: 'C:\\fakepath\\avatar.png' } as unknown as Pick<HTMLInputElement, 'files' | 'value'>

    expect(takeSelectedFile(input)).toBe(file)
    expect(input.value).toBe('')
  })
})
