// Every site setting the admin page controls. A new setting is one entry
// here: it gets its switch on /admin/indstillinger and is saved with the rest.

export interface SettingDef {
  key: string
  /** Heading the setting is shown under */
  group: string
  label: string
  description: string
  default: boolean
}

export const SETTINGS = [
  {
    key: 'odds',
    group: 'Odds',
    label: 'Odds på siden',
    description:
      'Fra: ingen odds, bookmaker-mærker eller "Eksempel-odds" nogen steder. Til: odds på forsiden, i Kamp i fokus og på kampsiderne, altid med "18+ · Spil ansvarligt · StopSpillet.dk". Odds er eksempler, indtil der er en aftale med en bookmaker.',
    default: false,
  },
] as const satisfies readonly SettingDef[]

export type SettingKey = (typeof SETTINGS)[number]['key']
export type SiteSettings = Record<SettingKey, boolean>

export const DEFAULT_SETTINGS = Object.fromEntries(SETTINGS.map((s) => [s.key, s.default])) as SiteSettings
export const isSettingKey = (key: string): key is SettingKey => SETTINGS.some((s) => s.key === key)
