const cache = new Map<string, HTMLImageElement>()
const listeners = new Set<() => void>()

/**
 * Explicit web-safe image MIME list for `<input type="file">`.
 * Avoiding `image/*` (and omitting `image/heic`) tells iOS/iPadOS/macOS Photos pickers
 * to transcode Apple HEIC/HEIF photos to JPEG automatically.
 */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/svg+xml'

/** Image MIME types accepted by Penrill sync servers and rendered natively by every browser. */
export const UNIVERSAL_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/svg+xml'
])

const IMAGE_MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png'
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg|heic|heif|tiff?)$/i
// Safari caps canvas backing stores around 16.7M pixels (4096×4096); capping prevents blank outputs on 48MP iPhone photos.
const MAX_TRANSCODE_SIDE = 4096
const JPEG_QUALITY = 0.92

export function isImageFile(file: Pick<File, 'type' | 'name'>): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT.test(file.name)
}

function dataUrlMime(src: string): { raw: string; normalized: string } | null {
  if (!src.startsWith('data:')) return null
  const comma = src.indexOf(',')
  if (comma < 0) return null
  const meta = src.slice(5, comma)
  const first = meta.split(';')[0]?.trim() ?? ''
  const raw = !first || first.includes('=') || first.toLowerCase() === 'base64' ? '' : first
  const clean = raw.toLowerCase()
  const normalized = IMAGE_MIME_ALIASES[clean] ?? clean
  return { raw, normalized }
}

/** Draws a decoded image onto a canvas (respecting Safari's canvas pixel cap) and exports JPEG. */
export function imageElementToJpegDataUrl(img: Pick<HTMLImageElement, 'naturalWidth' | 'naturalHeight'>): string | null {
  if (typeof document === 'undefined') return null
  const nw = img.naturalWidth
  const nh = img.naturalHeight
  if (!(nw > 0 && nh > 0)) return null
  const scale = Math.min(1, MAX_TRANSCODE_SIDE / Math.max(nw, nh))
  const w = Math.max(1, Math.round(nw * scale))
  const h = Math.max(1, Math.round(nh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img as HTMLImageElement, 0, 0, w, h)
  const out = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  return out.startsWith('data:image/jpeg;base64,') && out.length > 32 ? out : null
}

/**
 * Ensures an inserted image uses a universally supported MIME type (`image/jpeg`, `image/png`, etc.).
 * Apple HEIC/HEIF/TIFF photos decoded natively by Safari/WebKit are transcoded to JPEG so they sync
 * and render cleanly across macOS, iOS, Windows, Linux, Chrome, Firefox and Electron.
 */
export function normalizeImageDataUrl(src: string, img: HTMLImageElement): string {
  const mime = dataUrlMime(src)
  if (!mime) return src
  if (UNIVERSAL_IMAGE_TYPES.has(mime.normalized)) {
    if (mime.raw && mime.raw.toLowerCase() !== mime.normalized) {
      const fixed = `data:${mime.normalized}${src.slice(5 + mime.raw.length)}`
      cache.set(fixed, img)
      return fixed
    }
    return src
  }
  const jpeg = imageElementToJpegDataUrl(img)
  if (jpeg) {
    cache.set(jpeg, img)
    return jpeg
  }
  return src
}

export async function transcodeDataUrlToJpeg(src: string): Promise<string | null> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return null
  const img = await loadImage(src)
  return imageElementToJpegDataUrl(img)
}

/** Called when a not-yet-decoded image finishes loading so the board can redraw. */
export function subscribeImageLoad(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function getImage(src: string): HTMLImageElement {
  let img = cache.get(src)
  if (!img) {
    img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      for (const notify of listeners) notify()
    }
    img.src = src
    cache.set(src, img)
  }
  return img
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  const img = getImage(src)
  if (img.complete) {
    return img.naturalWidth > 0 ? Promise.resolve(img) : Promise.reject(new Error('Image failed to load'))
  }
  return new Promise((resolve, reject) => {
    img.addEventListener('load', () => resolve(img), { once: true })
    img.addEventListener('error', () => reject(new Error('Image failed to load')), { once: true })
  })
}

export function readFileAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}
