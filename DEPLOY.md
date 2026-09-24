# Udrulning til den lokale server

Hvert push til `main` eller en `claude/**`-branch bygges og lægges automatisk ud
på den lokale server af workflowet `.github/workflows/deploy.yml`.

Det kører på en **self-hosted GitHub runner** på serveren. Runneren henter selv
jobs fra GitHub, så serveren behøver ikke være tilgængelig udefra.

## Engangsopsætning på serveren (Linux)

1. **Installer runneren**
   GitHub → repo `z15dk/sport` → Settings → Actions → Runners → *New self-hosted runner* → Linux.
   Følg kommandoerne der vises. Når `./config.sh` spørger om labels, skriv:

   ```
   scoreline
   ```

   Installer den derefter som service, så den kører efter genstart:

   ```bash
   sudo ./svc.sh install
   sudo ./svc.sh start
   ```

2. **Opret webmappen** og giv runner-brugeren skriveadgang:

   ```bash
   sudo mkdir -p /var/www/scoreline
   sudo chown <runner-bruger>: /var/www/scoreline
   ```

   Vil I bruge en anden mappe, så opret en repository-variabel `DEPLOY_DIR`
   (Settings → Secrets and variables → Actions → Variables).

3. **Webserver**: brug `deploy/nginx.conf` som udgangspunkt (nginx), eller peg en
   anden webserver på mappen. Siden er ren statisk HTML/JS/CSS.

4. *(Valgfrit)* API-nøgle: opret secret `THESPORTSDB_KEY`. Uden den bruges den gratis nøgle.

## Test

Actions → *Deploy til lokal server* → *Run workflow*. Når jobbet er grønt, ligger
siden på `http://<server-ip>/`.

Bemærk: alle branches deployer til samme mappe, så den seneste push vinder.
