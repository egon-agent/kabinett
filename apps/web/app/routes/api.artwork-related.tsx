import type { LoaderFunctionArgs } from "react-router";
import { getRelatedArtworks } from "../lib/related-artworks.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const rawId = url.searchParams.get("id") || "";
  const artworkId = Number.parseInt(rawId, 10);

  if (!Number.isFinite(artworkId) || artworkId === 0) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }

  const related = getRelatedArtworks(artworkId);
  return Response.json(related, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
