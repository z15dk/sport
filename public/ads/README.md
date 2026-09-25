# Reklamer

Læg annoncebilleder her og angiv dem i `src/data/ads.ts` (`creative`).

| Placering | Desktop  | Mobil   | Hvor                                   |
|-----------|----------|---------|----------------------------------------|
| top       | 970×90   | 320×100 | Under headeren på alle sider           |
| feed      | 728×90   | 320×100 | Mellem ligaerne på forsiden            |
| side      | 300×600  | 300×250 | Højre kolonne på forsiden (sticky)     |
| content   | 300×250  | 300×250 | Kamp-, klub- og turneringssider        |

Et annoncenetværk (fx Google Ad Manager/AdSense) kan i stedet fylde elementet med id `ad-<placering>` (`ad-feed-1`, `ad-feed-2` … på forsiden).
Spilreklamer skal have `gambling: true`, så "18+ · Spil ansvarligt" vises.
