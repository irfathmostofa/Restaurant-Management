import supabase from './supabase'

const DEFAULT_MAX_DIMENSION = 1600
const DEFAULT_QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4, 0.3]
const TARGET_SIZE_RATIO = 0.7 // upload at most 70% of the original size (>= 30% smaller)
const NOT_REENCODABLE = new Set(['image/gif'])

let webpSupport

function detectWebp() {
  if (webpSupport !== undefined) return webpSupport
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    webpSupport = false
  }
  return webpSupport
}

function formatFor(mime) {
  if (mime === 'image/png' || mime === 'image/webp') {
    return detectWebp() ? 'image/webp' : 'image/png'
  }
  return 'image/jpeg'
}

function extFor(mime) {
  if (mime === 'image/webp') return '.webp'
  if (mime === 'image/png') return '.png'
  if (mime === 'image/gif') return '.gif'
  return '.jpg'
}

function slugify(name) {
  return (name || 'image')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'image'
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // fall through to the <img> path
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not read the selected image.'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function encodeBlob(canvas, format, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Image compression failed.'))
    }, format, quality)
  })
}

/**
 * Re-encodes an image file down to a target size (at most 70% of the
 * original bytes) by downscaling to `maxDimension` and stepping the
 * encode quality down until the size target is met. The smallest blob
 * is always returned, so the file can never grow during this step.
 */
export async function optimizeImage(file, { maxDimension = DEFAULT_MAX_DIMENSION, qualitySteps = DEFAULT_QUALITY_STEPS } = {}) {
  if (!file || !/^image\//.test(file.type)) {
    throw new Error('Please choose an image file (JPEG, PNG or WebP).')
  }
  // SVG is a script-carrying vector format and an XSS vector; never accept it.
  if (file.type === 'image/svg+xml') {
    throw new Error('SVG images are not supported for security reasons.')
  }
  const sizeBefore = file.size

  // Formats we cannot re-encode without losing data (animation).
  if (NOT_REENCODABLE.has(file.type)) {
    return {
      blob: file,
      url: URL.createObjectURL(file),
      sizeBefore,
      sizeAfter: sizeBefore,
      reducedPct: 0,
      format: file.type
    }
  }

  const bitmap = await loadBitmap(file)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width || 1, bitmap.height || 1))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round((bitmap.width || 1) * scale))
  canvas.height = Math.max(1, Math.round((bitmap.height || 1) * scale))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  if ('close' in bitmap) bitmap.close()

  const format = formatFor(file.type)
  const target = sizeBefore * TARGET_SIZE_RATIO
  let best = null
  for (const quality of qualitySteps) {
    const blob = await encodeBlob(canvas, format, quality)
    if (!best || blob.size < best.size) best = blob
    if (blob.size <= target) break
  }

  // Never-grow guarantee: if re-encoding did not yield a smaller file, keep
  // the original bytes instead.
  if (!best || best.size >= sizeBefore) {
    return {
      blob: file,
      url: URL.createObjectURL(file),
      sizeBefore,
      sizeAfter: sizeBefore,
      reducedPct: 0,
      format: file.type
    }
  }

  const reducedPct = sizeBefore > 0 ? Math.round((1 - best.size / sizeBefore) * 100) : 0
  return {
    blob: best,
    url: URL.createObjectURL(best),
    sizeBefore,
    sizeAfter: best.size,
    reducedPct,
    format
  }
}

/**
 * Optimises (>= 30% smaller when possible) then uploads the image to
 * Supabase Storage. Returns the public URL and stats for UI feedback.
 */
export async function uploadImage({ bucket = 'product-images', folder = 'menu', file, maxDimension }) {
  const optimized = await optimizeImage(file, { maxDimension })
  const path = `${folder}/${Date.now()}-${slugify(file.name)}${extFor(optimized.format)}`
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, optimized.blob, { contentType: optimized.format, cacheControl: '31536000', upsert: false })
    if (error) {
      throw new Error(error.message || 'Upload failed.')
    }
  } finally {
    // The preview object URL is only used for optimization bookkeeping; it is
    // never shown, so release it to avoid leaking memory.
    URL.revokeObjectURL(optimized.url)
  }
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
  return {
    path,
    url: publicUrl,
    sizeBefore: optimized.sizeBefore,
    sizeAfter: optimized.sizeAfter,
    reducedPct: optimized.reducedPct
  }
}

/** Best-effort removal of an uploaded object. Returns true if a file was deleted. */
export async function deleteUploadedImage(bucket, url) {
  if (!url) return false
  const marker = `/object/public/${bucket}/`
  const idx = url.indexOf(marker)
  const path = idx === -1 ? null : decodeURIComponent(url.slice(idx + marker.length))
  if (!path) return false
  const { error } = await supabase.storage.from(bucket).remove([path])
  return !error
}
