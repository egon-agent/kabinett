# Europeana Reference UI

Thin reference UI for the standalone visual search service.

## Flows

- text to image
- similar works
- colour matching

## Local run

```bash
cd apps/europeana-reference-ui
npm run start
```

The UI uses `/api` by default. The local server proxies `/api/*` to `VISUAL_SERVICE_URL`,
which defaults to `http://127.0.0.1:4318`.
