# Matchly billeder – driftsvejledning

Systemet tagger dine egne kampbilleder med klub, trøjenummer og spillernavn.
Koden ligger i `src/lib/photos/`, jobbet i `scripts/photos-job.ts`, og det kører som
systemd-tjenesten `scoreline-photos` med laveste prioritet (Nice 19, disk "idle",
højst 50 % af én CPU og 700 MB hukommelse). Siden går altid forud.

## Sådan flyder et billede

1. Du lægger billeder i det fælles drev: `Matchly Billeder/<Klub>/<ÅÅÅÅ-MM-DD>_<Modstander>/` (eller `<DDMMÅÅ> <Modstander>`, fx `300926 Thisted`)
   (fx `Brabrand/2026-08-01_Skive/IMG_0412.jpg`).
2. Hvert 10. minut (10 min. efter forrige kørsel sluttede) finder jobbet nye billeder og sætter dem i kø.
3. Ét billede ad gangen: hent → ret orientering, læs optagelsesdato → lav versioner
   (miniature 480 px på serveren, web 1600 px i Drive-mappen `_web`, uden EXIF/GPS)
   → Gemini finder numre, farver og bokse → egen klub/modstander ud fra trøjefarven
   → navn fra kampens DBU-holdkort, ellers truppen → gem.
4. Alt usikkert (lav tillid, ukendt navn, usikkert hold, ingen numre, ukendt klub) markeres til gennemgang.
5. Originalen markeres "klar til arkivering" (arkivering til NAS kommer i fase 3; indtil da bliver originalen i Drive).

Én gang i døgnet henter jobbet klubber, trøjefarver og holdkort fra dbu.dk
(pulje 508656 = CampoBet 2. Division 2026/27; flere puljer i `PHOTOS_DBU_POOLS`).

## Opsætning (én gang)

### 1. Servicekonto til Drive (gratis)

1. Gå til <https://console.cloud.google.com/> med din Workspace-konto og opret et projekt, fx "Matchly billeder".
2. **APIs & Services → Library**: søg "Google Drive API" og tryk **Enable**.
3. **IAM & Admin → Service Accounts → Create service account**: navn fx `matchly-billeder`. Ingen roller i projektet.
4. Åbn servicekontoen → **Keys → Add key → Create new key → JSON**. Der hentes en `.json`-fil. Den er en hemmelighed.
5. Kopiér filen til serveren og lås den:

   ```bash
   scp matchly-billeder-*.json root@178.104.121.60:/opt/scoreline/google-sa.json
   ssh root@178.104.121.60 'chown scoreline: /opt/scoreline/google-sa.json && chmod 600 /opt/scoreline/google-sa.json'
   ```

   Slet derefter den lokale kopi.

### 2. Det fælles drev

1. Opret (eller brug) et fælles drev, og læg mappen `Matchly Billeder` i det.
2. Drevet → **Administrer medlemmer** → tilføj servicekontoens mailadresse (`matchly-billeder@<projekt>.iam.gserviceaccount.com`) som **Indholdsadministrator**.
3. Find id'erne i adresselinjen:
   - drevets id: åbn drevets rod – `https://drive.google.com/drive/folders/<DREV-ID>`
   - mappens id: åbn `Matchly Billeder` – `https://drive.google.com/drive/folders/<MAPPE-ID>`

### 3. Gemini-nøgle (gratis)

<https://aistudio.google.com/apikey> → **Create API key**. Gratisniveauet må bruges af Google til at forbedre deres produkter (accepteret til prototypen).

### 4. Indstillinger i `/opt/scoreline/env`

```bash
GOOGLE_SA_FILE=/opt/scoreline/google-sa.json
PHOTOS_DRIVE_ID=<DREV-ID>
PHOTOS_FOLDER_ID=<MAPPE-ID>
GEMINI_API_KEY=<nøglen>
# Valgfrie (standard i parentes):
# GEMINI_MODEL=gemini-3.5-flash-lite  (gratis: 500 kald/døgn, 15/min; Flash-modellerne kun 20/døgn)
# PHOTOS_PAUSE_MS=6000          pause efter hvert AI-kald
# PHOTOS_DAILY_LIMIT=200        højst så mange AI-kald pr. døgn
# PHOTOS_BATCH=50               højst så mange billeder pr. kørsel
# PHOTOS_MIN_CONFIDENCE=0.8     under dette får et nummer intet navn
# PHOTOS_MAX_LOAD=1.5           vent mens serverens belastning er højere
# PHOTOS_DBU_POOLS=508656       DBU-puljer (kommasepareret)
# PHOTOS_CACHE_MB=300           cache af web-versioner på serveren
```

Nøglerne står aldrig i koden eller i git. **Lås filen, før nøglerne lægges i:** den var 30. sep. 2026 læsbar for alle brugere på serveren (644). systemd læser den som root, så appen virker uændret:

```bash
chmod 600 /opt/scoreline/env
```

### 5. Installér tjenesten og timeren

```bash
ssh root@178.104.121.60
cp /opt/scoreline/current/deploy/scoreline-photos.service /opt/scoreline/current/deploy/scoreline-photos.timer /etc/systemd/system/
systemctl daemon-reload
```

Timeren slås **ikke** til endnu – første kørsel tages i hånden (se nedenfor).

## Start og stop

| Hvad | Kommando (på serveren) |
|---|---|
| Kør nu (højst `PHOTOS_BATCH` billeder) | `systemctl start scoreline-photos` |
| Kør med et andet antal, fx 50 | `cd /opt/scoreline/current && sudo -u scoreline bash -c 'set -a; . /opt/scoreline/env; nice -n 19 npm run -s photos -- run --limit 50'` |
| Følg med | `journalctl -u scoreline-photos -f` |
| Slå automatisk kørsel til | `systemctl enable --now scoreline-photos.timer` |
| Slå automatisk kørsel fra | `systemctl disable --now scoreline-photos.timer` |
| Stop en kørsel | `systemctl stop scoreline-photos` (billedet der blev arbejdet på, tages op igen efter 15 min.) |
| Hent DBU nu | `… npm run -s photos -- dbu` (samme `sudo -u scoreline …` som ovenfor) |
| Beregn navne igen (efter trup-rettelser, uden AI-kald) | `… npm run -s photos -- retag` |

Jobbet kan stoppes når som helst. Et billede, der var i gang, frigives efter 15 minutter.
Svarede AI'en før stoppet, genbruges svaret, så det samme billede aldrig koster to kald.

## Overvåg kvoten

```bash
cd /opt/scoreline/current && sudo -u scoreline bash -c 'set -a; . /opt/scoreline/env; npm run -s photos -- status'
```

viser køen pr. status, antal til gennemgang, dagens AI-kald (`quota.calls` af `dailyLimit`),
hvor mange gange Google har sagt stop i dag (`quota.limited`), seneste kørsel og de seneste fejl.
Kvoten nulstilles ved midnat amerikansk vestkysttid (kl. 9 dansk tid).
Googles egen oversigt: <https://aistudio.google.com/usage>.

## Når noget fejler

| Du ser | Betyder | Gør |
|---|---|---|
| `Mangler i /opt/scoreline/env: …` | Opsætningen er ikke færdig | Udfyld de nævnte linjer (afsnit 4) |
| `Gemini-kvoten er brugt (429)` / `Dagens grænse … er nået` | Dagens gratiskvote er brugt | Intet. Jobbet stoppede pænt og fortsætter selv næste kørsel |
| `Gemini afviste nøglen (401/403)` | Nøglen er forkert eller slettet | Ny nøgle i AI Studio → `GEMINI_API_KEY` |
| `Gemini-modellen … kan ikke bruges (404)` | Google har udfaset modellen (Googles besked står med) | Sæt `GEMINI_MODEL` til en aktuel gratis model – se grænserne på <https://aistudio.google.com/rate-limit> |
| `Servicekontoen kunne ikke logge ind` | JSON-nøglen er forkert/slettet | Ny nøgle (afsnit 1), tjek `GOOGLE_SA_FILE` og rettigheder |
| `Drive … 404` på mappen | Servicekontoen er ikke medlem af drevet, eller id er forkert | Afsnit 2 |
| Billede med status `fejl`: `Kampmappen … skal hedde ÅÅÅÅ-MM-DD_Modstander (eller DDMMÅÅ Modstander)` | Billedet ligger forkert | Flyt det i Drive – det tages op igen af sig selv |
| `Filtypen image/heic understøttes ikke` | iPhone-format | Gem som JPG (eller sæt kameraet til "Mest kompatibel") |
| `midlertidig fejl, prøves igen senere` | Google/net svarede ikke | Intet – prøves op til 3 gange, derefter status `fejl` |
| Mange billeder med `fejl` efter en rettelse | | `npm run -s photos -- retry` sætter dem i kø igen |
| `Kunne ikke slette … (låneperioden er udløbet)` | Drive svarede ikke | Intet – prøves igen næste kørsel; kørslen står som fejlet i systemd, så det ses |
| `Serveren har travlt` | Belastningen er over `PHOTOS_MAX_LOAD` | Intet – jobbet venter eller prøver igen om 10 min. |

Hvert billede logges i databasens `photo_log` (tid pr. trin, resultat, fejl) og i journalen
(`journalctl -u scoreline-photos --since today`).

## Admin

<https://matchly.dk/admin/billeder> (Matchlys admin-login): **Søg** ("Brabrand 9", navn, kamp, situation; numre finder kun egne spillere), **Gennemgang** (usikre billeder, hurtigste først, forslag ud fra rygnavnet), **Trupper** (DBU-trup, rettelser, udebanetrøjer, andre klubnavne). På et billede: ret nummer/navn/hold, tilføj og slet spillere, ret kamp og dato (navnene findes igen uden nyt AI-kald), godkend og hent JPEG i 4:5, story, kvadrat og 16:9 centreret på en spiller.

### Rettigheder og lånte billeder

Hvert billede har "Foto:" – som standard `Matchly.dk` (`PHOTOS_DEFAULT_CREDIT`). Lånte billeder får fotografens/klubbens navn og en dato under "Lånt til og med" (på ét billede eller alle billeder fra samme kamp). Dagen efter sletter billedjobbet billedet: original og web-version flyttes til det fælles drevs papirkurv (Google tømmer den efter 30 dage), miniature og cache slettes på serveren, tags slettes, og billedet står tilbage som `slettet` med grunden i loggen. Et udløbet billede kan ikke hentes til SoMe, heller ikke før jobbet har kørt. Lånte billeder arkiveres aldrig på NAS'en. Oversigten viser, hvor mange lån der udløber inden for 14 dage.

## Data

- Database: `/opt/scoreline/data/billeder.db` (SQLite) – kø, tags, klubber, holdkort, trupper, log, kvote.
- Miniaturer: `/opt/scoreline/data/fotos/miniaturer/` (~30 KB pr. billede).
- Cache af web-versioner: `/opt/scoreline/data/fotos/cache/` (højst 300 MB, ældste slettes).
- Web-versioner: det fælles drevs mappe `_web/`. Originaler: i Drive, til NAS'en overtager (fase 3).
