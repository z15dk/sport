import type { Metadata, Viewport } from 'next'
import { SiteNav } from '../components/SiteNav'
import { BadgeProvider } from '../components/BadgeProvider'
import { Footer } from '../components/Footer'
import { AdSlot } from '../components/AdSlot'
import { JsonLd, organizationLd, websiteLd } from '../lib/jsonld'
import { getBadges } from '../lib/badges'
import { loadRealData } from '../lib/realdata'
import { RealDataProvider } from '../components/RealDataProvider'
import { clientRealData } from '../lib/clientData'
import { SITE_NAME, SITE_URL } from '../lib/site'
import { indexable } from '../lib/settings'
// The site's fonts, served from our own domain (no request to Google that holds up the first paint)
import '@fontsource/barlow-condensed/latin-600.css'
import '@fontsource/barlow-condensed/latin-700.css'
import '@fontsource/barlow-condensed/latin-800.css'
import '@fontsource/barlow-condensed/latin-700-italic.css'
import '@fontsource/barlow-condensed/latin-800-italic.css'
import '@fontsource-variable/dm-sans/opsz.css'
import './globals.css'

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${SITE_NAME} – live resultater og dagens kampe`, template: `%s | ${SITE_NAME}` },
    description: 'Resultater, kampprogram, stillinger og statistik for fodbold, ishockey og basketball i Danmark, England, Tyskland, Spanien, Portugal, Sverige og Norge – live, gratis og på dansk.',
    applicationName: SITE_NAME,
    // Hidden from search engines until indexing is switched on (/admin/indstillinger or SITE_INDEXABLE)
    robots: indexable() ? { index: true, follow: true } : { index: false, follow: false, nocache: true },
    openGraph: { siteName: SITE_NAME, locale: 'da_DK', type: 'website' },
    twitter: { card: 'summary_large_image' },
    // Matchly's M on lime (favicon.ico for browsers and Google; 96 px, a multiple of 48, for Google's search results)
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
        { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicon-96.png', sizes: '96x96', type: 'image/png' },
      ],
      apple: '/apple-touch-icon.png',
    },
    appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: 'black-translucent' },
  }
}

// Logos are found in the background after deploy, so pages are rendered per request to pick them up
export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: '#0f110c',
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const badges = await getBadges()
  const real = loadRealData()
  return (
    <html lang="da">
      <head>
      </head>
      <body>
        <JsonLd data={websiteLd()} />
        <JsonLd data={organizationLd()} />
        <RealDataProvider data={clientRealData(real)}>
          <BadgeProvider badges={badges}>
            <div className="app">
              <div className="app__main">
                <SiteNav />
                <AdSlot placement="top" />
                {children}
              </div>
            </div>
            <Footer />
          </BadgeProvider>
        </RealDataProvider>
      </body>
    </html>
  )
}
