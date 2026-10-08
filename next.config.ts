import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Team logos come from TheSportsDB or local files; plain <img> is used, so no image domains needed
  poweredByHeader: false,
  // HTTPS always: browsers remember to use it for a year (the server sends http on to https)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // Not to be framed by other sites (clickjacking) – except the widgets and the full-page ad, which are made to be
      // embedded and send their own "frame-ancestors *" (two CSP headers would block them)
      {
        source: '/:path((?!widget|annonce/helside).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
    ]
  },
}

export default nextConfig
