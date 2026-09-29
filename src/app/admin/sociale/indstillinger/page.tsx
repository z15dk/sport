import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AdminNav } from '../../../../components/admin/AdminNav'
import {
  ActionButton,
  ApprovalForm,
  ConfigSwitch,
  EmailForm,
  MetaConnect,
  MetaManual,
  PriorityForm,
  ScheduleForm,
  ThreadsConnect,
  TopicsForm,
  XConnect,
  type SettingsProps,
} from '../../../../components/admin/SocialAdmin'
import { isAdmin } from '../../../../lib/admin'
import { defaultWeight } from '../../../../lib/social'
import { connected } from '../../../../lib/socialPlatforms'
import { chromiumPath } from '../../../../lib/socialRender'
import {
  EXTERNAL_PRIORITIES,
  KIND_NAMES,
  PLATFORM_NAMES,
  STORY_PLATFORMS,
  TOPICS,
  masked,
  socialConfig,
  socialSecrets,
  type Platform,
} from '../../../../lib/socialStore'
import { DIVISIONS, shownDivisions, sportOf } from '../../../../data/leagues'
import { SITE_URL } from '../../../../lib/site'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Indstillinger · Sociale medier', robots: { index: false, follow: false } }

// The social media engine's settings: the accounts (keys are kept on the
// server and only shown as ••••1234), mail, approval, times, the day's topics
// and which matches and leagues come first.

function Account({ platform, status, children, guide }: { platform: Platform; status: string; children: ReactNode; guide: ReactNode }) {
  const on = connected(platform)
  return (
    <section className="panel prose__section" id={platform}>
      <h2 className="panel__title">{PLATFORM_NAMES[platform]}</h2>
      <div className="social-pad">
        <p className={on ? 'social-msg is-ok' : 'muted'}>{on ? status : 'Ikke forbundet'}</p>
        {on && (
          <p>
            <ActionButton pill body={{ action: 'test', platform }} label="Test forbindelsen" busyLabel="Tester …" />{' '}
            <ActionButton body={{ action: 'disconnect', platform }} label="Fjern forbindelsen" confirm={`Fjern forbindelsen til ${PLATFORM_NAMES[platform]}?`} />
          </p>
        )}
        <details className="social-guide">
          <summary>Sådan får du adgangen</summary>
          {guide}
        </details>
        {children}
      </div>
    </section>
  )
}

export default async function SocialSettings() {
  if (!(await isAdmin())) redirect('/admin')
  const cfg = socialConfig()
  const s = socialSecrets()
  const props: SettingsProps = {
    times: cfg.times,
    matches: cfg.matches,
    kinds: cfg.kinds,
    kindNames: KIND_NAMES,
    platformNames: PLATFORM_NAMES,
    storyPlatforms: STORY_PLATFORMS,
    topics: cfg.topics,
    topicList: TOPICS.map((t) => ({ id: t.id, name: t.name, description: t.description })),
    topicLeague: cfg.topicLeague,
    leagues: [
      ...shownDivisions().map((d) => ({ key: d.id, name: d.name, weight: defaultWeight(d.id), saved: cfg.weights[d.id] })),
      ...EXTERNAL_PRIORITIES.map((p) => ({ key: p.key, name: p.name, weight: p.weight, saved: cfg.weights[p.key] })),
    ],
    favorites: cfg.favorites,
    hashtags: cfg.hashtags,
    approval: cfg.approval,
  }
  const clubs = [...new Set(DIVISIONS.flatMap((d) => d.clubs.map((c) => c.name)))].sort((a, b) => a.localeCompare(b, 'da'))
  const soccer = shownDivisions().filter((d) => sportOf(d) === 'soccer').map((d) => ({ id: d.id, name: d.name }))
  const https = SITE_URL.startsWith('https://')
  return (
    <div className="page">
      <div className="clubs prose admin">
        <AdminNav current="/admin/sociale/indstillinger" />
        <h1 className="feed__title">Indstillinger for sociale medier</h1>

        <section className="panel prose__section">
          <h2 className="panel__title">Motoren</h2>
          <div className="social-pad">
            <div className="social-switches">
              <ConfigSwitch value={cfg.enabled} label="Motoren kører" setting="enabled" />
              <ConfigSwitch value={cfg.dryRun} label="Tør-kørsel (planlægger, laver billeder og mails, men sender intet til platformene)" setting="dryRun" />
            </div>
            <p className="muted small">
              Billeder: {chromiumPath() ? 'Chromium er installeret.' : 'Chromium mangler – deploy/update.sh installerer det ved næste udrulning.'} Billederne hentes af
              Instagram og Threads fra {SITE_URL}/sociale-billeder/…{https ? '.' : ' – det kræver, at SITE_URL er sidens offentlige https-adresse.'}
            </p>
          </div>
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">Godkendelse</h2>
          <div className="social-pad">
            <p className="muted small">
              Mens opslag skal godkendes, sendes en mail, når dagens plan er klar (kl. {cfg.times.draft}), og når resultaterne er klar. Et opslag, der ikke er godkendt,
              når dets tid er gået, bliver ikke postet.
            </p>
            <ApprovalForm approval={cfg.approval} />
          </div>
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">Mail</h2>
          <div className="social-pad">
            <EmailForm email={cfg.email} hasPass={!!s.smtp.pass} />
          </div>
        </section>

        <Account
          platform="facebook"
          status={`Forbundet til siden ${s.meta.pageName ?? s.meta.pageId} (side-token ${masked(s.meta.pageToken)})`}
          guide={
            <ol>
              <li>Instagram: skift kontoen til en professionel konto (Business eller Creator) og kobl den til Matchlys Facebook-side (siden → Indstillinger → Linkede konti).</li>
              <li>
                Gå til <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps</a> → Opret app → vælg typen
                &quot;Business&quot;.
              </li>
              <li>Under Indstillinger → Grundlæggende: kopier App-id og App-hemmelighed, og skriv {SITE_URL}/privatliv som adresse til privatlivspolitikken. Sæt appen til Live.</li>
              <li>
                Åbn <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">Graph API Explorer</a>, vælg appen og &quot;Brugertoken&quot;, og
                tilføj rettighederne: pages_show_list, pages_read_engagement, pages_manage_posts, read_insights, business_management, instagram_basic,
                instagram_content_publish og instagram_manage_insights.
              </li>
              <li>Tryk Generate Access Token, log ind og vælg Matchly-siden og Instagram-kontoen.</li>
              <li>Indsæt App-id, App-hemmelighed og tokenet herunder. Vi laver det om til en side-token, der ikke udløber, og finder selv Instagram-kontoen.</li>
            </ol>
          }
        >
          <MetaConnect />
          <details className="social-guide">
            <summary>Indtast side-id og token i hånden</summary>
            <MetaManual />
          </details>
        </Account>

        <Account
          platform="instagram"
          status={`Forbundet til @${s.meta.igUsername ?? s.meta.igUserId} (via Facebook-siden)`}
          guide={<p>Instagram forbindes sammen med Facebook ovenfor: kontoen skal være en professionel konto koblet til Facebook-siden.</p>}
        >
          {!connected('instagram') && connected('facebook') && (
            <p className="small">Facebook-siden er forbundet, men har ingen Instagram-konto koblet på. Kobl kontoen til siden, og forbind Facebook igen.</p>
          )}
        </Account>

        <Account
          platform="threads"
          status={`Forbundet til @${s.threads.username ?? s.threads.userId} (token ${masked(s.threads.token)}, fornyes automatisk)`}
          guide={
            <ol>
              <li>
                Gå til <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps</a> → Opret app → vælg
                &quot;Adgang til Threads API&quot;.
              </li>
              <li>Tilføj rettighederne threads_basic, threads_content_publish og threads_manage_insights.</li>
              <li>Under Roller: tilføj Matchlys Threads-konto som tester, og accepter invitationen i Threads (Indstillinger → Konto → Webstedstilladelser).</li>
              <li>Brug &quot;User Token Generator&quot; i appens Threads-indstillinger, og indsæt tokenet herunder.</li>
            </ol>
          }
        >
          <ThreadsConnect />
        </Account>

        <Account
          platform="x"
          status={`Forbundet til @${s.x.username ?? '?'} (API-nøgle ${masked(s.x.apiKey)})`}
          guide={
            <ol>
              <li>
                Opret en udviklerkonto på <a href="https://developer.x.com" target="_blank" rel="noreferrer">developer.x.com</a> med Matchlys X-konto. Gratis-planen giver
                ca. 500 opslag om måneden (tal på opslagene kræver Basic-planen).
              </li>
              <li>Under appens User authentication settings: App permissions &quot;Read and write&quot;, type &quot;Web App, Automated App or Bot&quot;, callback og website {SITE_URL}.</li>
              <li>Under Keys and tokens: kopier API Key og Secret, og lav Access Token og Secret (efter du har sat Read and write).</li>
              <li>Indsæt de fire nøgler herunder.</li>
            </ol>
          }
        >
          <XConnect />
        </Account>

        <section className="panel prose__section">
          <h2 className="panel__title">Tider og opslag</h2>
          <div className="social-pad">
            <ScheduleForm {...props} />
          </div>
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">Dagens emne pr. ugedag</h2>
          <div className="social-pad">
            <TopicsForm {...props} divisions={soccer} />
          </div>
        </section>

        <section className="panel prose__section">
          <h2 className="panel__title">Prioritering af kampe og ligaer</h2>
          <div className="social-pad">
            <PriorityForm {...props} clubs={clubs} />
          </div>
        </section>
      </div>
    </div>
  )
}
