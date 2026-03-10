# Museum-kampanjer med Cloudflare + Fly.io

Den här kodbasen stöder nu museum-specifika kampanjlägen via två env-variabler:

- `MUSEUMS` låser vilka källor som är aktiva i queries.
- `KABINETT_CAMPAIGN` styr copy/meta på startsidan (`default`, `nationalmuseum`, `nordiska`, `shm`).

## Rekommenderad topologi

Kör en separat Fly-app per kampanjsubdomän:

- `kabinett` (huvuddomän, multi-museum)
- `kabinett-nm` (`MUSEUMS=nationalmuseum`, `KABINETT_CAMPAIGN=nationalmuseum`)
- `kabinett-nordiska` (`MUSEUMS=nordiska`, `KABINETT_CAMPAIGN=nordiska`)
- `kabinett-shm` (`MUSEUMS=shm`, `KABINETT_CAMPAIGN=shm`)

## Exempel: Nationalmuseum-kampanj

1. Skapa appen:

```bash
fly apps create kabinett-nm
```

2. Sätt env:

```bash
fly secrets set -a kabinett-nm \
  MUSEUMS="nationalmuseum" \
  KABINETT_CAMPAIGN="nationalmuseum"
```

3. Deploya samma image/kod som huvudappen.

4. Koppla subdomän i Cloudflare:

- DNS `CNAME nationalmuseum.kabinett.se` -> `kabinett-nm.fly.dev`
- Proxy på (orange cloud) och SSL mode Full/Strict.

## Cloudflare-routing

Ingen Worker krävs för detta upplägg. Varje subdomän pekar direkt till rätt Fly-app.

## SEO

Kampanjlägen (`KABINETT_CAMPAIGN != default`) sätter `robots: noindex,nofollow` på startsidan.
Om du vill noindexa hela kampanjsubdomänen, gör det även i Cloudflare via transform rules eller edge headers.
