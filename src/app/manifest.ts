import type { MetadataRoute } from 'next'
import { SITE_NAME } from '../lib/site'

/** Lets Matchly be added to the home screen as an app */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} – live resultater`,
    short_name: SITE_NAME,
    description: 'Live resultater, stillinger og statistik for dine hold.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0f110c',
    theme_color: '#0f110c',
    lang: 'da',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
