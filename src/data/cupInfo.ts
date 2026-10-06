// What we know about a cup beyond its games: how it is played, its history and the season's round dates,
// for the cup page's "Om turneringen", fact box, round plan and questions (src/components/cup/CupPage.tsx).
// Checked 6 October 2026 against the organisers (thefa.com, the EFL clubs' own announcements).

export interface CupRoundDate {
  /** The round as we name it (danishRound) */
  name: string
  /** ISO date (a weekend's Saturday, or the Monday of the week the round is played in) */
  date: string
  /** "uge" when the round is played during the week starting on the date */
  week?: boolean
}

export interface CupInfo {
  /** Who organises it, how many take part, the format, in short sentences */
  about: string[]
  facts: { label: string; value: string }[]
  /** The season's rounds still to come, from the organiser's calendar */
  dates: CupRoundDate[]
  /** Questions with fixed answers (the page adds those that follow the games) */
  faq: { q: string; a: string }[]
  /** The last winner, for the hero when the season has not reached its final */
  holder: { name: string; season: string; final: string }
}

export const CUP_INFO: Record<string, CupInfo> = {
  'FA Cup': {
    about: [
      'FA Cup er verdens ældste nationale fodboldturnering. Den blev spillet første gang i 1871–72 og arrangeres af det engelske fodboldforbund, The FA.',
      'Turneringen er åben for hundredvis af klubber fra hele den engelske ligapyramide. Amatørklubberne begynder i den ekstra indledende runde i august, klubberne fra League One og League Two kommer med i 1. runde i november, og Premier League- og Championship-klubberne træder ind i 3. runde i januar.',
      'Alle runder er knockout over én kamp. Fra 1. runde (hovedturneringen) bliver en uafgjort kamp afgjort med forlænget spilletid og straffespark samme dag. I kvalifikationsrunderne spilles der stadig omkampe.',
      'Finalen spilles på Wembley i London, og vinderen får en plads i Europa League.',
    ],
    facts: [
      { label: 'Første udgave', value: '1871–72' },
      { label: 'Arrangør', value: 'The FA (det engelske fodboldforbund)' },
      { label: 'Format', value: 'Knockout, én kamp pr. runde' },
      { label: 'Finalestadion', value: 'Wembley, London' },
      { label: 'Flest titler', value: 'Arsenal (14)' },
      { label: 'Forsvarende mester', value: 'Manchester City (2026)' },
      { label: 'Præmie', value: 'Plads i Europa League' },
    ],
    dates: [
      { name: '1. runde', date: '2026-11-07' },
      { name: '3. runde', date: '2027-01-09' },
      { name: 'Semifinale', date: '2027-04-24' },
      { name: 'Finale', date: '2027-05-22' },
    ],
    faq: [
      {
        q: 'Hvornår spilles FA Cup-finalen 2027?',
        a: 'Finalen spilles lørdag 22. maj 2027 på Wembley i London. Semifinalerne spilles lørdag 24. april 2027.',
      },
      {
        q: 'Hvornår kommer Premier League-klubberne med i FA Cup?',
        a: 'Klubberne fra Premier League og Championship træder ind i 3. runde, som spilles i weekenden omkring lørdag 9. januar 2027.',
      },
      {
        q: 'Hvem vandt FA Cup sidst?',
        a: 'Manchester City vandt FA Cup i 2026 med 1-0 over Chelsea i finalen på Wembley. Antoine Semenyo scorede kampens eneste mål. Det var Citys ottende FA Cup-titel.',
      },
      {
        q: 'Hvilken klub har vundet FA Cup flest gange?',
        a: 'Arsenal har vundet FA Cup 14 gange, flere end nogen anden klub.',
      },
      {
        q: 'Spilles der omkamp i FA Cup?',
        a: 'Kun i kvalifikationsrunderne. Fra 1. runde bliver en uafgjort kamp afgjort med forlænget spilletid og straffespark samme dag.',
      },
    ],
    holder: { name: 'Manchester City', season: '2025/26', final: '1-0 mod Chelsea' },
  },
  'EFL Trophy': {
    about: [
      'EFL Trophy er turneringen for klubberne i League One og League Two, Englands tredje- og fjerdebedste række. Den kendes også under sponsornavnet Vertu Trophy.',
      '64 hold deltager: de 48 klubber fra League One og League Two og 16 U21-hold fra Premier League-klubberne.',
      'Holdene er delt i en nordlig og en sydlig sektion med otte grupper af fire hold. Nr. 1 og 2 i hver gruppe går videre til 1/16-finalerne. En uafgjort gruppekamp afgøres på straffespark, og vinderen af straffesparkskonkurrencen får et ekstra point.',
      'Knockout-runderne spilles regionalt indtil kvartfinalerne. Uafgjorte kampe afgøres direkte på straffespark helt frem til semifinalerne, og finalen spilles på Wembley.',
    ],
    facts: [
      { label: 'Første udgave', value: '1983–84' },
      { label: 'Arrangør', value: 'English Football League (EFL)' },
      { label: 'Deltagere', value: '64 hold: 48 klubber fra League One og League Two + 16 U21-hold fra Premier League' },
      { label: 'Format', value: '16 grupper á fire hold, derefter knockout' },
      { label: 'Finalestadion', value: 'Wembley, London' },
      { label: 'Forsvarende mester', value: 'Luton Town (2026)' },
    ],
    dates: [
      { name: '1/16-finale', date: '2026-12-07', week: true },
      { name: 'Ottendedelsfinale', date: '2027-01-11', week: true },
      { name: 'Kvartfinale', date: '2027-02-15', week: true },
      { name: 'Semifinale', date: '2027-03-08', week: true },
      { name: 'Finale', date: '2027-04-11' },
    ],
    faq: [
      {
        q: 'Hvem deltager i EFL Trophy?',
        a: 'De 48 klubber fra League One og League Two og 16 U21-hold fra Premier League-klubber, blandt andre Arsenal, Chelsea, Liverpool, Manchester City og Tottenham.',
      },
      {
        q: 'Hvordan fungerer gruppespillet i EFL Trophy?',
        a: 'Der er 16 grupper á fire hold, delt i en nordlig og en sydlig sektion. En sejr giver 3 point. Ved uafgjort får begge hold 1 point, og vinderen af straffesparkskonkurrencen får et ekstra point. Nr. 1 og 2 går videre.',
      },
      {
        q: 'Hvornår spilles EFL Trophy-finalen 2027?',
        a: 'Finalen spilles søndag 11. april 2027 på Wembley.',
      },
      {
        q: 'Hvem vandt EFL Trophy sidst?',
        a: 'Luton Town vandt EFL Trophy i 2026 med 3-1 over Stockport County i finalen på Wembley. Det var Lutons anden titel efter 2009.',
      },
    ],
    holder: { name: 'Luton Town', season: '2025/26', final: '3-1 mod Stockport County' },
  },
}
