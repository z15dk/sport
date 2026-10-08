// The clubs of 1.–3. division with a public contact address, for the mail about their Matchly page and the free
// table widget (/admin/klubkontakt). Every address was seen on the club's own website (8 October 2026, the page
// in `source`); a named person only where the club itself lists them for communication, press or partners.

export interface ClubContact {
  slug: string
  name: string
  division: '1. division' | '2. division' | '3. division'
  website: string
  email: string
  note?: string
  source: string
}

const c = (division: ClubContact['division']) => (slug: string, name: string, website: string, email: string, source: string, note?: string): ClubContact => ({ slug, name, division, website, email, source, note })
const d1 = c('1. division')
const d2 = c('2. division')
const d3 = c('3. division')

export const CLUB_CONTACTS: ClubContact[] = [
  d1('aab', 'AaB', 'aabsport.dk', 'aab@aab-as.dk', 'aabsport.dk/om-aab/kontakt/'),
  d1('aarhus-fremad', 'Aarhus Fremad', 'aarhus-fremad.dk', 'kamp@aarhus-fremad.dk', 'aarhus-fremad.dk/fremads-bestyrelse/', 'Event, marketing og kommunikation'),
  d1('ab', 'AB', 'ab.dk', 'info@ab.dk', 'ab.dk/kontakt'),
  d1('esbjerg-fb', 'Esbjerg fB', 'efb.dk', 'efb@efb.dk', 'efb.dk/kontakt/'),
  d1('fc-fredericia', 'FC Fredericia', 'fcfredericia.dk', 'pa@fcfredericia.dk', 'fcfredericia.dk/kontakt', 'Kommunikationsansvarlig'),
  d1('hb-koege', 'HB Køge', 'hbkoge.dk', 'info@hbkoge.dk', 'hbkoge.dk/presse/'),
  d1('hilleroed-fodbold', 'Hillerød Fodbold', 'hfelite.dk', 'info@hfelite.dk', 'hfelite.dk/kontakt/'),
  d1('hobro-ik', 'Hobro IK', 'hobroik.dk', 'info@hikfodbold.dk', 'hobroik.dk/hobro-ik/kontakt/'),
  d1('hvidovre-if', 'Hvidovre IF', 'hvidovrefodbold.dk', 'hfas@hif.dk', 'hvidovrefodbold.dk/klub-info/presse/'),
  d1('kolding-if', 'Kolding IF', 'kolding-if.dk', 'cml@kolding-if.dk', 'kolding-if.dk/klubben/kontakt/', 'Kommunikationschef'),
  d1('vejle-boldklub', 'Vejle Boldklub', 'vejle-boldklub.dk', 'presse@vejle-boldklub.dk', 'vejle-boldklub.dk/klubben/organisation/', 'Presse'),
  d1('vendsyssel-ff', 'Vendsyssel FF', 'vendsysselff.dk', 'info@vendsysselff.dk', 'vendsysselff.dk/om-os/presseinfo/'),
  d2('b-93', 'B.93', 'b93.dk', 'support@b93cph.dk', 'b93.dk'),
  d2('brabrand-if', 'Brabrand IF', 'brabrand-fodbold.dk', 'formand@brabrand-fodbold.dk', 'brabrand-fodbold.dk/traener/kontaktpersoner/', 'Formanden'),
  d2('fa-2000', 'FA 2000', 'frederiksbergalliancen.dk', 'kontor@fa2000.dk', 'frederiksbergalliancen.dk/kontakt/'),
  d2('fc-roskilde', 'FC Roskilde', 'fc-roskilde.dk', 'pw@fc-roskilde.dk', 'fc-roskilde.dk/presseinfo/', 'Kommerciel chef og pressekontakt'),
  d2('fremad-amager', 'Fremad Amager', 'fremad-amager.dk', 'info@fremad-amager.dk', 'fremad-amager.dk'),
  d2('hik', 'HIK', 'hik.dk/fodbold', 'kontoret@hik.dk', 'hik.dk/kontakt-os/fodboldafdelingen/'),
  d2('middelfart-boldklub', 'Middelfart Boldklub', 'middelfartboldklub.dk', 'yja@middelfartboldklub.dk', 'middelfartboldklub.dk/kontakt/', 'Salgs- og marketingchef'),
  d2('naestved-bk', 'Næstved BK', 'naestvedboldklub.dk', 'sj@naestvedboldklub.dk', 'naestvedboldklub.dk/kontakt-i-naestved-boldklub-i-vi-er-klar/', 'Sponsor- og salgschef'),
  d2('nykoebing-fc', 'Nykøbing FC', 'nykobingfc.dk', 'nykobingfc@nykobingfc.dk', 'nykobingfc.dk/kontakt/kontakt-os/'),
  d2('skive-ik', 'Skive IK', 'sik-elite.dk', 'kontakt@sik-elite.dk', 'sik-elite.dk/kontakt'),
  d2('thisted-fc', 'Thisted FC', 'thistedfc.dk', 'tfcelite@thistedfc.dk', 'thistedfc.dk/kontakt/'),
  d2('vsk-aarhus', 'VSK Aarhus', 'vskaarhus.dk', 'kontakt@vskaarhus.dk', 'vskaarhus.dk'),
  d3('asa-aarhus', 'ASA Aarhus', 'asa-fodbold.dk', 'kontaktasafodbold@gmail.com', 'asa-fodbold.dk/klubben/kontaktoplysninger/andre-kontaktpersoner/'),
  d3('bk-frem', 'BK Frem', 'bkfrem.dk', 'kontakt@bkfrem.dk', 'bkfrem.dk/kontakt', 'Tjek adressen på deres side først'),
  d3('broenshoej-bk', 'Brønshøj BK', 'bronshojboldklub.dk', 'bronshoj1919@gmail.com', 'bronshojboldklub.dk/kontakt-info/organisation/'),
  d3('fc-helsingoer', 'FC Helsingør', 'fchelsingor.dk', 'mail@fchelsingor.dk', 'fchelsingor.dk/kontakt/'),
  d3('hoersholm-usseroed-ik', 'Hørsholm-Usserød IK', 'hui-fodbold.dk', 'katja.loran@hui-fodbold.dk', 'hui-fodbold.dk/om-hui-1/kluborganisation-1', 'Kommunikationsansvarlig'),
  d3('holbaek-b-og-i', 'Holbæk B&I', 'hbi.dk', 'js@hbi.dk', 'hbi.dk/om-hbi/ledelse-og-administration/', 'Kommerciel og kommunikationsansvarlig'),
  d3('holstebro-boldklub', 'Holstebro Boldklub', 'holstebroboldklub.dk', 'holstebrohb@holstebroboldklub.dk', 'holstebroboldklub.dk/kontakt/kontakt'),
  d3('ishoej-if', 'Ishøj IF', 'ishojif.dk', 'bestyrelse@ishojif.dk', 'ishojif.dk'),
  d3('naesby-bk', 'Næsby BK', 'naesbyboldklub.dk', 'nbk@naesbyboldklub.dk', 'naesbyboldklub.dk/klubben/kontakt/presse/'),
  d3('ringsted-if', 'Ringsted IF', 'rif-fodbold.dk', 'kontor@rif-fodbold.dk', 'rif-fodbold.dk'),
  d3('sundby-bk', 'Sundby BK', 'sundbyboldklub.dk', 'administration@sundbyboldklub.dk', 'sundbyboldklub.dk/kontakt/sb-administration-pr/adminstrationen/'),
  d3('vanloese-if', 'Vanløse IF', 'vanloeseif.dk', 'pressevanloeseif@gmail.com', 'vanloeseif.dk/kontakt/', 'Presse'),
  d3('vejgaard-bk', 'Vejgaard BK', 'vejgaard-bk.dk', 'klubchef@vejgaard-bk.dk', 'vejgaard-bk.dk/klubben/for-pressen/', 'Klubchefen tager al presse'),
]
