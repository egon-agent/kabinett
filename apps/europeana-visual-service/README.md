# Europeana Visual Search Service

Fristående demo-tjänst för Europeana-only visual search.

## Endpoints

- `POST /v1/visual/search`
- `GET /v1/visual/similar/:recordId`
- `GET /v1/visual/color`
- `GET /v1/demo/seeds`
- `POST /v1/visual/demo/hydrate`
- `GET /health`

## Lokal körning

```bash
cd apps/europeana-visual-service
npm run start
```

Miljövariabler:

- `DATABASE_PATH` - sökväg till SQLite-databasen
- `EUROPEANA_API_KEY` - nyckel för Europeana Search API
- `PORT` - port för tjänsten, standard `4318`
- `KABINETT_CLIP_ALLOW_REMOTE` - sätt `1` om CLIP-modellen får hämtas remote i demo
- `EUROPEANA_COLOR_INDEX_PATH` - sökväg till vår genererade färgindexfil
- `EUROPEANA_VISUAL_ALLOWED_ORIGINS` - kommaseparerad allowlist för publika origins, standard `*`
- `EUROPEANA_VISUAL_RATE_LIMIT_MAX` - requests per fönster, standard `120`

Bygg färgindexet från Europeana-thumbnails:

```bash
cd apps/europeana-visual-service
EUROPEANA_COLOR_INDEX_LIMIT=0 npm run build:color-index
```

## Demo-omfång

- `search` och `similar` körs mot det lokala Europeana-indexet
- `color` körs mot vårt lokala dominant-colour-index för Europeana-demoindexet
- `/v1/demo/seeds` är demo-only och hämtar slumpade seed-records för reference UI:t
- `/v1/demo/hydrate` är demo-only och hämtar kortdata från Europeana Search API baserat på `recordId`

## Överlämningsfiler

- `openapi.yaml` - låst produktkontrakt
- `.env.example` - runtime-konfiguration
- `RUNBOOK.md` - drift och felsökning
- `INTEGRATION.md` - rekommenderad Europeana-integration
