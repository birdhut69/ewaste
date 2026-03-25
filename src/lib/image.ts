export interface CompressImageOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  targetBytes?: number
}

const DEFAULT_OPTIONS: Required<CompressImageOptions> = {
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.82,
  targetBytes: 900 * 1024,
}

export async function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        resolve(result)
        return
      }
      reject(new Error('Failed to convert file to data URL'))
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

async function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image'))
    image.src = source
  })
}

async function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to create compressed image blob'))
          return
        }
        resolve(blob)
      },
      'image/jpeg',
      quality,
    )
  })
}

function scaledDimensions(width: number, height: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  if (width <= maxWidth && height <= maxHeight) {
    return { width, height }
  }

  const ratio = Math.min(maxWidth / width, maxHeight / height)
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

export async function compressImageFile(file: File, options?: CompressImageOptions): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file
  }

  const merged = { ...DEFAULT_OPTIONS, ...(options || {}) }
  const sourceDataUrl = await fileToDataUrl(file)
  const image = await loadImage(sourceDataUrl)

  const originalWidth = image.naturalWidth || image.width
  const originalHeight = image.naturalHeight || image.height

  const size = scaledDimensions(originalWidth, originalHeight, merged.maxWidth, merged.maxHeight)

  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height

  const ctx = canvas.getContext('2d')
  if (!ctx) return file

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, size.width, size.height)

  let quality = merged.quality
  let blob = await canvasToBlob(canvas, quality)

  while (blob.size > merged.targetBytes && quality > 0.45) {
    quality = Math.max(0.45, quality - 0.08)
    blob = await canvasToBlob(canvas, quality)
  }

  if (blob.size >= file.size && size.width === originalWidth && size.height === originalHeight) {
    return file
  }

  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}
