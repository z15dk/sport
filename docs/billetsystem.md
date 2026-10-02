# Billetsystemet (Matchlys eget billetsalg til klubber)

Status: **demo / pilot**. Salgsside `/billetsystem` (skjult for Google, ikke i sidefod eller sitemap, til ejeren åbner den), demo `/billetsystem/demo` med rigtige kampe, men uden betaling. Demo-køb slettes efter tre dage.

## Dele

| Del | Fil | Adresse |
|---|---|---|
| Motor (ordrer, billetter, QR-signatur, scanning, salgstal, henvendelser) | `src/lib/ticketShop.ts` | – |
| Kampene, der kan sælges til (vores kampprogram) | `src/lib/ticketDemo.ts` | – |
| Køb | `src/app/api/billetsystem/ordre/route.ts` | `POST /api/billetsystem/ordre` |
| Scanning ved indgangen | `src/app/api/billetsystem/scan/route.ts` | `POST /api/billetsystem/scan` |
| Klubbens salgstal | `src/app/api/billetsystem/salg/route.ts` | `GET /api/billetsystem/salg?kamp=` |
| Henvendelser fra klubber | `src/app/api/billetsystem/kontakt/route.ts` | `POST /api/billetsystem/kontakt` (vises på `/admin/billetter`) |
| Sider | `src/app/billetsystem/**`, `TicketCard`, `TicketCheckout`, `TicketScanner`, `ClubSalesLive`, `LeadForm` | `/billetsystem`, `/billetsystem/demo/…` |

Browser-delene (køb, scanner, klubbens oversigt) taler kun med `/api/billetsystem/*`. Motoren kender kun Matchly gennem `ticketDemo.ts` (kampene) – det er de to grænser, der skal holdes, hvis systemet flyttes.

## Data – alt i én mappe

`TICKET_SHOP_DIR` (standard `/opt/scoreline/data/billetsalg/`):

- `billetsalg.db` – SQLite: `orders`, `tickets` (en række pr. billet, `used_at` når den er scannet), `leads`.
- `billetsalg.secret` – nøglen, QR-koderne signeres med (`MTK1.<billet-id>.<signatur>`). Uden den kan udstedte billetter ikke scannes. `TICKET_SHOP_SECRET` (hex, mindst 32 tegn) vinder over filen, så flere servere kan dele den.

## Flyt til en anden server

1. Stop salget kort (eller flyt uden for kampdage).
2. Kopiér mappen: `rsync -a /opt/scoreline/data/billetsalg/ ny-server:/sti/billetsalg/` (SQLite i WAL-tilstand: kopiér med tjenesten stoppet, eller brug `sqlite3 billetsalg.db ".backup kopi.db"`).
3. Sæt `TICKET_SHOP_DIR=/sti/billetsalg` (og evt. `TICKET_SHOP_SECRET`) på den nye server.
4. Peg trafikken om: hele Matchly flytter med (samme app), eller kun billetsalget – så skal `/billetsystem*` og `/api/billetsystem/*` sendes til den nye server (fx i Caddy/nginx), og `ticketDemo.ts` skal hente kampene fra Matchly over nettet i stedet for fra hukommelsen.
5. Test: køb i demoen, scan, se salgstallene.

## Før rigtig betaling (ikke bygget endnu)

- Stripe Connect (Express): klubben oprettes med CVR og bankkonto; betalingen går direkte til klubben, Matchly tager gebyret (5 kr. + 3 % pr. betalt billet, `feeFor`) som application fee. Først i Stripes testtilstand.
- Klub-login og klubbens egne priser, antal pladser og salgsstart pr. kamp (i demoen faste typer: `DEMO_TYPES`).
- Mail med billetterne (SMTP findes i `src/lib/mail.ts`), Wallet senere.
- Scanneren beskyttet med klubbens adgangskode og en liste til brug uden net.
- Handelsbetingelser (ingen fortrydelsesret på billetter til en bestemt dato, forbrugeraftaleloven § 18, stk. 2, nr. 12), aftale med klubben om, at den er arrangør, databehandleraftale. Pris vises altid med gebyr.
- Backup af `billetsalg.db` hver nat.
