// Pictures through our own domain (src/lib/imageProxy.ts) come as
// "/billede/<id>"; this adds the size they are shown in, so the browser gets a
// small WebP ("/billede/<id>-64.webp"). Pure, so server and browser agree.

const WIDTHS = [32, 64, 128, 256, 512]
const PROXIED = /^\/billede\/[a-f0-9]{20}$/

/** The picture in the width it is shown at (twice that for sharp screens); other addresses are left as they are */
export function sizedImage(src: string, shownPx: number): string
export function sizedImage(src: string | undefined, shownPx: number): string | undefined
export function sizedImage(src: string | undefined, shownPx: number): string | undefined {
  if (!src || !PROXIED.test(src)) return src
  const want = shownPx * 2
  const width = WIDTHS.find((w) => w >= want) ?? WIDTHS[WIDTHS.length - 1]
  return `${src}-${width}.webp`
}

/** A country's flag from our own domain in the width it is shown at (src/app/flag/[file]/route.ts) */
export function flagImage(code: string, shownPx: number): string {
  const want = shownPx * 2
  const width = WIDTHS.find((w) => w >= want) ?? WIDTHS[WIDTHS.length - 1]
  return `/flag/${code}-${width}.webp`
}
