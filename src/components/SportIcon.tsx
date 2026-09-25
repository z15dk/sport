import type { SportId } from '../types'

export function SportIcon({ sport, size = 22 }: { sport: SportId; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (sport) {
    case 'soccer':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5l3.4 2.5-1.3 4h-4.2l-1.3-4z" fill="currentColor" />
          <path d="M12 7.5V3.2M15.4 10l4-1.4M14.1 14l2.5 3.6M9.9 14l-2.5 3.6M8.6 10l-4-1.4" />
        </svg>
      )
    case 'basketball':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M3 12h18M5.6 5.6c2.6 2.6 2.6 10.2 0 12.8M18.4 5.6c-2.6 2.6-2.6 10.2 0 12.8" />
        </svg>
      )
    case 'ice_hockey':
      return (
        <svg {...common}>
          <path d="M8 3l6.5 14.5c.3.7 1 1 1.7 1H21" />
          <path d="M16 3L9.5 17.5c-.3.7-1 1-1.7 1H3" />
          <ellipse cx="12" cy="20.5" rx="2.2" ry="1" fill="currentColor" />
        </svg>
      )
    case 'handball':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M4.5 7.5c4 1 7 4 7.5 13.4M19.5 7.5c-4 1-7 4-7.5 13.4M6 18.5c3-3 9-3 12 0" />
        </svg>
      )
    case 'volleyball':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3c-1 4 0 7 3 9M12 3c3.5 1.5 6 4.5 6.8 8.3M3.4 9.5c3.5-.5 7 .5 8.6 2.5M3.4 9.5a9 9 0 006.4 11.3M12 12c-1.5 3-4.5 5.5-8 5.9M12 12c3 .4 6 2.4 7.6 5.4" />
        </svg>
      )
    case 'american_football':
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="10" ry="6" transform="rotate(-45 12 12)" />
          <path d="M9 15l6-6M10.5 10.5l1.5 1.5M12 9l1.5 1.5M9 12l1.5 1.5" />
        </svg>
      )
    case 'tennis':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M5.6 5.6a9 9 0 010 12.8M18.4 5.6a9 9 0 000 12.8" />
        </svg>
      )
  }
}
