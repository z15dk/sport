import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Team logos come from TheSportsDB or local files; plain <img> is used, so no image domains needed
  poweredByHeader: false,
  // HTTPS always: browsers remember to use it for a year (the server sends http on to https)
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] }]
  },
}

export default nextConfig
