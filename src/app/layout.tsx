import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { Header } from '../components/Header'
import { SportRail } from '../components/SportRail'
import { BadgeProvider } from '../components/BadgeProvider'
import { Footer } from '../components/Footer'
import { JsonLd, organizationLd } from '../lib/jsonld'
import { getBadges } from '../lib/badges'
import { INDEXABLE, SITE_NAME, SITE_URL } from '../lib/site'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} – live resultater og dagens kampe`, template: `%s | ${SITE_NAME}` },
  description: 'Resultater, kampprogram, stillinger og statistik for fodbold, ishockey og basketball i Danmark, Tyskland, England, Sverige og Norge.',
  applicationName: SITE_NAME,
  // Fictional data must not end up in search results or AI answers
  robots: INDEXABLE ? { index: true, follow: true } : { index: false, follow: false, nocache: true },
  openGraph: { siteName: SITE_NAME, locale: 'da_DK', type: 'website' },
  icons: { icon: '/favicon.svg' },
}

// Logos are found in the background after deploy, so pages are rendered per request to pick them up
export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: '#0f110c',
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const badges = await getBadges()
  return (
    <html lang="da">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- loaded at runtime so builds work offline */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;1,700;1,800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap"
        />
      </head>
      <body>
        <JsonLd data={organizationLd()} />
        <BadgeProvider badges={badges}>
          <div className="app">
            <Suspense fallback={<nav className="rail" aria-label="Sportsgrene" />}>
              <SportRail />
            </Suspense>
            <div className="app__main">
              <Header />
              {children}
              <Footer />
            </div>
          </div>
        </BadgeProvider>
      </body>
    </html>
  )
}
