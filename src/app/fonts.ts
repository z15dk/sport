import localFont from 'next/font/local'

// The site's two typefaces, served from our own domain with next/font: the files are
// hashed and cached for a year, the body font is preloaded (it is on screen at once),
// and a fallback font with matching metrics is generated, so the text does not jump
// when the real font arrives. globals.css uses them through --display and --body.

/** Headings, scores and numbers: Barlow Condensed (600/700/800, 700/800 italic) */
export const display = localFont({
  src: [
    { path: '../fonts/barlow-condensed-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/barlow-condensed-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../fonts/barlow-condensed-latin-800-normal.woff2', weight: '800', style: 'normal' },
    { path: '../fonts/barlow-condensed-latin-700-italic.woff2', weight: '700', style: 'italic' },
    { path: '../fonts/barlow-condensed-latin-800-italic.woff2', weight: '800', style: 'italic' },
  ],
  display: 'swap',
  // Five files: fetched when the stylesheet asks for them (preloading all of them would hold up the first paint on phones)
  preload: false,
  adjustFontFallback: 'Arial',
  variable: '--font-display',
})

/** Body text: DM Sans (variable weight, optical size), latin */
export const body = localFont({
  src: '../fonts/dm-sans-latin-opsz-normal.woff2',
  weight: '100 1000',
  style: 'normal',
  display: 'swap',
  preload: true,
  adjustFontFallback: 'Arial',
  variable: '--font-body',
})
