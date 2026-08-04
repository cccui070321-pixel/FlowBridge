export type ProfileImageKind = 'avatar' | 'wallpaper'

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function validateProfileImage(file: Pick<File, 'size' | 'type'>, kind: ProfileImageKind) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return '请选择 JPG、PNG 或 WebP 图片'
  if (file.size <= 0) return '图片内容为空'
  const maxBytes = kind === 'avatar' ? 5 * 1024 * 1024 : 15 * 1024 * 1024
  if (file.size > maxBytes) return kind === 'avatar' ? '头像不能超过 5MB' : '壁纸不能超过 15MB'
  return null
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片处理失败')), 'image/webp', 0.9)
  })
}

export async function normalizeProfileImage(file: File, kind: ProfileImageKind) {
  const problem = validateProfileImage(file, kind)
  if (problem) throw new Error(problem)
  const image = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前电脑无法处理图片')
    if (kind === 'avatar') {
      const sourceSize = Math.min(image.width, image.height)
      canvas.width = 512
      canvas.height = 512
      context.drawImage(image, (image.width - sourceSize) / 2, (image.height - sourceSize) / 2, sourceSize, sourceSize, 0, 0, 512, 512)
    } else {
      const scale = Math.min(1, 2560 / image.width, 1440 / image.height)
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
    }
    return await canvasBlob(canvas)
  } finally {
    image.close()
  }
}
