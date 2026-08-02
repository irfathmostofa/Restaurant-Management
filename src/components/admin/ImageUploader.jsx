import { useRef, useState } from 'react'
import { uploadImage, deleteUploadedImage } from '../../lib/storage'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export default function ImageUploader({
  label = 'Image',
  value,
  onChange,
  bucket = 'product-images',
  folder = 'menu',
  maxDimension = 1600
}) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_IMAGE_SIZE) {
      setError('Image is too large (max 5 MB).')
      return
    }
    setError(null)
    setInfo(null)
    setUploading(true)
    try {
      const result = await uploadImage({ bucket, folder, file, maxDimension })
      // Replace the previous uploaded image when a new one is chosen.
      if (value && value.startsWith(`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${bucket}/`)) {
        deleteUploadedImage(bucket, value)
      }
      onChange(result.url)
      setInfo({
        reducedPct: result.reducedPct,
        sizeBefore: result.sizeBefore,
        sizeAfter: result.sizeAfter
      })
    } catch (err) {
      setError(err.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = () => {
    if (value && value.startsWith(`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${bucket}/`)) {
      deleteUploadedImage(bucket, value)
    }
    onChange('')
    setInfo(null)
  }

  return (
    <div>
      <span className="block text-sm font-medium text-stone-700 mb-1">{label}</span>
      <div className="flex items-start gap-4">
        <div className="w-24 h-24 rounded-lg border border-stone-200 bg-stone-50 overflow-hidden flex items-center justify-center shrink-0">
          {value ? (
            <img src={value} alt={label} className="w-full h-full object-cover" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-stone-300"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleFile} />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
            >
              {uploading ? 'Uploading…' : value ? 'Change image' : 'Upload image'}
            </button>
            {value && (
              <button type="button" onClick={handleRemove} className="text-sm font-medium text-red-500 hover:text-red-700">
                Remove
              </button>
            )}
          </div>
          {uploading && <p className="text-xs text-stone-500">Optimising and uploading…</p>}
          {info && (
            <p className="text-xs text-emerald-600 font-medium">
              Optimised {info.reducedPct > 0 ? `by ${info.reducedPct}%` : ''} ({formatBytes(info.sizeBefore)} → {formatBytes(info.sizeAfter)})
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {!info && !error && <p className="text-xs text-stone-400">Images are optimised automatically before upload.</p>}
        </div>
      </div>
    </div>
  )
}
