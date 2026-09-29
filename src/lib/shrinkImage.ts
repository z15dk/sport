// In the browser: a picture made at most `maxWidth` wide as JPEG before it is
// uploaded, so a phone's 10 MB photo (or HEIC, which the browser can show but
// the server cannot read) arrives as a few hundred KB the server always takes.
// Falls back to the file itself when the browser cannot draw it.

export async function shrinkImage(file: File, maxWidth = 2400, quality = 0.86): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxWidth / bitmap.width)
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}
