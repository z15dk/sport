// SoMe crops: the largest area of the target's shape, centred on the chosen
// player's box (or the photo's centre) and kept inside the photo. Pure
// (tests/photos/crop.test.ts); the admin route cuts and scales with sharp.

export const FORMATS = {
  post: { width: 1080, height: 1350, label: '4:5' },
  story: { width: 1080, height: 1920, label: 'Story' },
  kvadrat: { width: 1080, height: 1080, label: 'Kvadrat' },
  bred: { width: 1920, height: 1080, label: '16:9' },
} as const

export type SomeFormat = keyof typeof FORMATS

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * @param box the player's [ymin, xmin, ymax, xmax] on 0–1000, or undefined for the centre
 */
export function cropRect(imgWidth: number, imgHeight: number, targetWidth: number, targetHeight: number, box?: [number, number, number, number] | null): Rect {
  const ratio = targetWidth / targetHeight
  // As large as the photo allows in the target's shape
  let width = imgWidth
  let height = Math.round(imgWidth / ratio)
  if (height > imgHeight) {
    height = imgHeight
    width = Math.round(imgHeight * ratio)
  }
  const cx = box ? ((box[1] + box[3]) / 2 / 1000) * imgWidth : imgWidth / 2
  // Faces sit in the top of a player's box: centre a little above the middle of it
  const cy = box ? ((box[0] * 0.6 + box[2] * 0.4) / 1000) * imgHeight : imgHeight / 2
  const left = Math.round(Math.min(Math.max(cx - width / 2, 0), imgWidth - width))
  const top = Math.round(Math.min(Math.max(cy - height / 2, 0), imgHeight - height))
  return { left, top, width, height }
}

/** How much the crop must be enlarged to reach the target (above ~1.5 it looks soft) */
export const upscale = (crop: Rect, targetWidth: number) => targetWidth / crop.width
