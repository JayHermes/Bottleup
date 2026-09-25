// Re-encode images through a canvas before upload: strips EXIF metadata (which
// can embed precise GPS and device info) and downscales to a sane size.
export async function normalizeImage(file) {
  if (!file || !file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const max = 1600
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
