import type { Metadata, Viewport } from 'next'
import { SiteNav } from '../components/SiteNav'
import { BadgeProvider } from '../components/BadgeProvider'
import { Footer } from '../components/Footer'
import { AdSlot } from '../components/AdSlot'
import { AdHeadCode } from '../components/AdCode'
import { JsonLd, organizationLd, websiteLd } from '../lib/jsonld'
import { getBadges } from '../lib/badges'
import { loadRealData } from '../lib/realdata'
import { RealDataProvider } from '../components/RealDataProvider'
import { clientRealData } from '../lib/clientData'
import { liveCursor } from '../lib/liveFeed'
import { VisitBeacon } from '../components/VisitBeacon'
import { AdminBar } from '../components/AdminBar'
import { ConsentBanner } from '../components/ConsentBanner'
import { trackingConfig } from '../lib/tracking'
import { SITE_NAME, SITE_URL } from '../lib/site'
import { indexable } from '../lib/settings'
import { AD_TURN_SCRIPT, adTurnCss } from '../data/ads'
// The site's fonts, served from our own domain (src/app/fonts.ts: preloaded body font, fallback with matching metrics)
import { body, display } from './fonts'
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
    // The attribute and class below are set by the scripts before the page is drawn (not by React)
    <html lang="da" suppressHydrationWarning className={`${display.variable} ${body.variable}`}>
      <head>
        {/* A closed "Følg dine hold" stays closed from the first paint (the box itself reads the choice only after loading) */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(localStorage.getItem('myTeamsHintHidden')==='true')document.documentElement.setAttribute('data-teams-hint','hidden')}catch(e){}",
          }}
        />
        {/* Placements shared by several advertisers show one banner per visit, chosen here before the page is drawn (src/data/ads.ts) */}
        <script dangerouslySetInnerHTML={{ __html: AD_TURN_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: adTurnCss() }} />
      </head>
      <body>
        <JsonLd data={websiteLd()} />
        <JsonLd data={organizationLd()} />
        <RealDataProvider data={clientRealData(real)} cursor={liveCursor(real)}>
          <BadgeProvider badges={badges}>
            <AdminBar />
            <div className="app">
              <div className="app__main">
                <SiteNav />
                <AdSlot placement="top" />
                {children}
              </div>
            </div>
            <Footer />
            <VisitBeacon />
            <ConsentBanner ga={trackingConfig().ga} metaPixel={trackingConfig().metaPixel} />
            {/* An ad network's main script, set in /admin/reklamer */}
            {real?.settings?.ads && real.ads?.head && <AdHeadCode code={real.ads.head} />}
          </BadgeProvider>
        </RealDataProvider>
      </body>
    </html>
  )
}
