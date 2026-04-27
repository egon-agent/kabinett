# Europeana Visual Layer Runbook

## Runtime

Run the visual service as a separate Node process or container. It needs:

- `DATABASE_PATH` pointing at the SQLite database with the Europeana demo index.
- `EUROPEANA_API_KEY` for Europeana Search API calls used by demo hydration.
- `KABINETT_CLIP_MODEL_PATH` for local CLIP model files, or `KABINETT_CLIP_ALLOW_REMOTE=1` for hosted demos that may fetch the model at runtime.
- `EUROPEANA_COLOR_INDEX_PATH` pointing at the generated local dominant-colour index. Defaults to `apps/europeana-visual-service/.cache/europeana-color-index.json`.
- `EUROPEANA_VISUAL_ALLOWED_ORIGINS` set to the public demo origin before exposing the service.

Build or refresh the local colour index:

```bash
cd apps/europeana-visual-service
EUROPEANA_COLOR_INDEX_LIMIT=0 npm run build:color-index
```

Use a smaller `EUROPEANA_COLOR_INDEX_LIMIT` for a quick demo subset. Use `0` for all currently indexed Europeana records.

## Healthcheck

```bash
curl -f http://127.0.0.1:4318/health
```

## Smoke checks

```bash
curl -s -X POST http://127.0.0.1:4318/v1/visual/search \
  -H 'Content-Type: application/json' \
  --data '{"query":"apple","limit":3}'

curl -s 'http://127.0.0.1:4318/v1/visual/similar/%2F966%2Feuropeana_fashion_500063023?limit=3'

curl -s 'http://127.0.0.1:4318/v1/visual/color?hex=C62F32&limit=3'
```

## Hosted demo topology

Expose only the reference UI URL publicly. Route `/api/*` to this service and strip the `/api` prefix in the reverse proxy.

Recommended public shape:

- `https://visual-demo.example.org/` -> reference UI
- `https://visual-demo.example.org/api/*` -> visual service

## Current demo limitations

The current demo index is Europeana-only and contains about 100,000 visual records. It is not the full Europeana corpus. The indexed subset is constrained to image records with media and thumbnail, `TYPE:IMAGE`, `theme=art`, and `reusability=open`.

## Production handover

For a takeover, deliver the service container, this runbook, `openapi.yaml`, `.env.example`, the index artifact or rebuild scripts, and an agreed support window. Full-corpus production requires a separate ingest/index pipeline for all Europeana records with usable visual media.
