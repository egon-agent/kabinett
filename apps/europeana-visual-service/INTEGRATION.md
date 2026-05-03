# Europeana Integration Notes

## Product contract

Europeana-owned clients should call only:

- `POST /v1/visual/search`
- `GET /v1/visual/similar/:recordId`
- `GET /v1/visual/color?hex=...`

Each product endpoint returns:

```json
{
  "items": [{ "recordId": "/dataset/id", "score": 0.82 }],
  "nextCursor": "opaque-cursor-or-null",
  "meta": {}
}
```

Europeana should hydrate titles, thumbnails, rights, links, and item cards through existing Europeana APIs and UI components.

## Recommended integration points

1. Add a "Visual results" block or tab on the existing search page. Pass the user's query to `POST /v1/visual/search` and render returned `recordId` values with existing result cards.

2. Add a "Visually similar works" module on item pages. Pass the current item record ID to `GET /v1/visual/similar/:recordId` and render returned records as a standard carousel or result grid.

## Demo-only endpoint

`POST /v1/demo/hydrate` exists only so the hosted reference UI can render cards without becoming a Europeana frontend. It should not be part of a production integration.

## Low-friction rollout

Use a feature flag and load the visual block after the primary Search API results. If the visual service is unavailable, hide the visual block and leave the ordinary Europeana search unchanged.
