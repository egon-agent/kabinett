import type { Route } from "./+types/artwork";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useFavorites } from "../lib/favorites";
import { getDb, type ArtworkRow } from "../lib/db.server";
import { buildImageUrl, buildDirectImageUrl } from "../lib/images";
import { sourceFilter } from "../lib/museums.server";
import { normalizeArtworkCategory, parseArtist, parseArtists } from "../lib/parsing";

export function headers() {
  return { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data?.artwork) return [{ title: "Konstverk — Kabinett" }];
  const { artwork } = data;
  const artist = artwork.artists?.[0]?.name || "Okänd konstnär";
  const genitive = artwork.museumName ? `${artwork.museumName}${artwork.museumName.endsWith("s") ? "" : "s"}` : "Kabinett";
  const desc = `${artwork.title} av ${artist}${artwork.datingText ? `, ${artwork.datingText}` : ""}. Ur ${genitive} samling.`;
  return [
    { title: `${artwork.title} — Kabinett` },
    { name: "description", content: desc },
    { property: "og:title", content: artwork.title },
    { property: "og:description", content: artwork.ogDescription || `${artist}${artwork.datingText ? ` · ${artwork.datingText}` : ""}` },
    { property: "og:image", content: artwork.ogImageUrl || artwork.imageUrl },
    { property: "og:type", content: "article" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: artwork.title },
    { name: "twitter:description", content: artwork.ogDescription || `${artist} — ${artwork.museumName || "Kabinett"}` },
    { name: "twitter:image", content: artwork.ogImageUrl || artwork.imageUrl },
  ];
}

export const links = ({ data }: { data?: { canonicalUrl?: string } } = {}) => {
  if (!data?.canonicalUrl) return [];
  return [{ rel: "canonical", href: data.canonicalUrl }];
};

function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, "\\u003C/");
}

function parseDimensions(json: string | null): string | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json) as Array<{ dimension?: string }>;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr.map((dimensionItem) => dimensionItem.dimension).filter(Boolean).join("; ");
  } catch { return null; }
}

function parseExhibitions(json: string | null): Array<{ title: string; venue: string; year: string }> {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as Array<{ title?: string; venue?: string; organizer?: string; year_start?: number }>;
    if (!Array.isArray(arr)) return [];
    return arr.map((exhibition) => ({
      title: exhibition.title || "",
      venue: exhibition.venue || exhibition.organizer || "",
      year: exhibition.year_start ? String(exhibition.year_start) : "",
    })).filter((exhibition) => exhibition.title || exhibition.venue);
  } catch { return []; }
}

type DescriptionSection = {
  heading: "Beskrivning" | "Proveniens" | "Utställningar" | "Litteratur";
  content: string;
};

type RelatedArtwork = {
  id: number;
  title_sv: string | null;
  title_en: string | null;
  iiif_url: string;
  dominant_color: string | null;
  artists?: string | null;
  dating_text?: string | null;
  focal_x: number | null;
  focal_y: number | null;
};

function normalizeMetaText(value: string | null | undefined): string {
  return value?.trim() || "";
}

function buildRelatedSecondaryText(item: RelatedArtwork, variant: "same-artist" | "similar"): string {
  if (variant === "same-artist") {
    return normalizeMetaText(item.dating_text);
  }

  const artist = parseArtist(item.artists || null).trim();
  if (artist && artist !== "Okänd konstnär") {
    return artist;
  }
  return normalizeMetaText(item.dating_text);
}

function RelatedArtworkCard({
  item,
  secondaryText,
  fallbackArtist,
}: {
  item: RelatedArtwork;
  secondaryText: string;
  fallbackArtist: string;
}) {
  const title = item.title_sv || item.title_en || "Utan titel";
  const parsedArtist = parseArtist(item.artists || null).trim();
  const altArtist = parsedArtist || fallbackArtist;

  return (
    <a
      href={`/artwork/${item.id}`}
      className="shrink-0 w-[100px] no-underline hover:opacity-85 transition-opacity duration-200 focus-ring"
    >
      <div
        className="w-[100px] h-[100px] overflow-hidden rounded-card"
        style={{ backgroundColor: item.dominant_color || "#E0DEDA" }}
      >
        <img
          src={buildImageUrl(item.iiif_url, 400)}
          alt={`${title} — ${altArtist}`}
          width={200}
          height={200}
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.classList.add("is-broken");
          }}
          className="w-full h-full object-cover"
          style={{ objectPosition: `${(item.focal_x ?? 0.5) * 100}% ${(item.focal_y ?? 0.5) * 100}%` }}
        />
      </div>
      <div className="pt-1.5">
        <p className="text-[11px] text-primary leading-[1.3] line-clamp-2">
          {title}
        </p>
        {secondaryText && (
          <p className="text-[11px] text-secondary mt-0.5 leading-[1.3] line-clamp-1">
            {secondaryText}
          </p>
        )}
      </div>
    </a>
  );
}

const CC_LICENSE_URLS: Record<string, string> = {
  "CC0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "Public Domain": "https://creativecommons.org/publicdomain/mark/1.0/",
  "CC BY": "https://creativecommons.org/licenses/by/4.0/",
  "CC BY-SA": "https://creativecommons.org/licenses/by-sa/4.0/",
  "CC BY-NC": "https://creativecommons.org/licenses/by-nc/4.0/",
  "CC BY-NC-SA": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  "CC BY-NC-ND": "https://creativecommons.org/licenses/by-nc-nd/4.0/",
  "CC BY-ND": "https://creativecommons.org/licenses/by-nd/4.0/",
};

const DESCRIPTION_PREFIX = /^Beskrivning i inventariet:\s*/i;
const DESCRIPTION_MARKERS = /(Proveniens:|Utställningar:|Litteratur:|Beskrivning:?)/g;

function normalizeDescriptionHeading(marker: string): DescriptionSection["heading"] {
  const normalized = marker.replace(":", "").trim();
  if (normalized === "Proveniens") return "Proveniens";
  if (normalized === "Utställningar") return "Utställningar";
  if (normalized === "Litteratur") return "Litteratur";
  return "Beskrivning";
}

function parseDescriptionSections(raw: string | null): DescriptionSection[] {
  if (!raw) return [];

  const cleaned = raw
    .replace(/\r\n/g, "\n")
    .replace(DESCRIPTION_PREFIX, "")
    .trim();

  if (!cleaned) return [];

  const matches = Array.from(cleaned.matchAll(DESCRIPTION_MARKERS));
  if (matches.length === 0) {
    return [{ heading: "Beskrivning", content: cleaned }];
  }

  const sections: DescriptionSection[] = [];
  const firstIndex = matches[0]?.index ?? 0;
  const intro = cleaned.slice(0, firstIndex).trim();
  if (intro) {
    sections.push({ heading: "Beskrivning", content: intro });
  }

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    if (!current) continue;

    const marker = current[0];
    const start = (current.index ?? 0) + marker.length;
    const end = next?.index ?? cleaned.length;
    const content = cleaned.slice(start, end).trim();

    if (!content) continue;
    sections.push({
      heading: normalizeDescriptionHeading(marker),
      content,
    });
  }

  return sections.length > 0 ? sections : [{ heading: "Beskrivning", content: cleaned }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const artworkId = Number.parseInt(params.id || "", 10);
  if (!Number.isFinite(artworkId) || artworkId === 0) {
    throw new Response("Ogiltigt id", { status: 400 });
  }

  const db = getDb();
  const sourceA = sourceFilter("a");
  const row = db
    .prepare(
      `SELECT a.*, COALESCE(a.sub_museum, m.name) as museum_name, m.url as museum_url
       FROM artworks a
       LEFT JOIN museums m ON m.id = a.source
       WHERE a.id = ? AND ${sourceA.sql}`
    )
    .get(artworkId, ...sourceA.params) as (ArtworkRow & { museum_name: string | null; museum_url: string | null }) | undefined;

  if (!row) throw new Response("Inte hittat", { status: 404 });

  const artists = parseArtists(row.artists || null);

  const collectionName = row.sub_museum || row.museum_name || null;
  const museumName = row.museum_name || "Museum";
  const inventoryClean = (row.inventory_number || "").replace(/^(nordiska:|shm:)/, "");
  const museumSiteUrl = row.source === "shm" && inventoryClean
      ? `https://samlingar.shm.se/object/${encodeURIComponent(inventoryClean)}`
      : row.source === "nordiska"
        ? null
        : row.museum_url || null;
  const ogImageUrl = row.iiif_url
    ? (row.source === "nationalmuseum" ? buildDirectImageUrl(row.iiif_url, 800) : row.iiif_url)
    : null;
  const ogDescriptionParts = [
    artists[0]?.name || "Okänd konstnär",
    row.dating_text || "",
    museumName || "",
  ].filter(Boolean);

  const artwork = {
    id: row.id,
    title: row.title_sv || row.title_en || "Utan titel",
    titleEn: row.title_en,
    category: normalizeArtworkCategory(row.category),
    techniqueMaterial: row.technique_material,
    artists,
    datingText: row.dating_text,
    datingType: row.dating_type as string | null,
    yearStart: row.year_start,
    acquisitionYear: row.acquisition_year,
    imageUrl: buildImageUrl(row.iiif_url, 800),
    thumbUrl: buildImageUrl(row.iiif_url, 400),
    focalX: row.focal_x,
    focalY: row.focal_y,
    color: row.dominant_color || "#E0DEDA",
    colorR: row.color_r,
    colorG: row.color_g,
    colorB: row.color_b,
    museumName,
    collectionName,
    museumSiteUrl,
    ogImageUrl,
    ogDescription: ogDescriptionParts.join(" · "),
    description: row.descriptions_sv || null,
    dimensions: parseDimensions(row.dimensions_json),
    signature: row.signature || null,
    inscription: row.inscription || null,
    style: row.style_sv || null,
    objectType: row.object_type_sv || null,
    motiveCategory: row.motive_category || null,
    exhibitions: parseExhibitions(row.exhibitions_json),
    materialTags: row.material_tags || null,
    techniqueTags: row.technique_tags || null,
    mediaLicense: row.media_license || null,
    mediaCopyright: row.media_copyright || null,
  };

  const artistName = artists[0]?.name;
  return { artwork, artistName, canonicalUrl: `${url.origin}${url.pathname}` };
}

export default function Artwork({ loaderData }: Route.ComponentProps) {
  const { artwork, artistName } = loaderData;
  const artist = artwork.artists?.[0]?.name || "Okänd konstnär";
  const { isFavorite, toggle } = useFavorites();
  const saved = isFavorite(artwork.id);
  const [relatedLoading, setRelatedLoading] = useState(true);
  const [related, setRelated] = useState<{ sameArtist: RelatedArtwork[]; similar: RelatedArtwork[] }>({
    sameArtist: [],
    similar: [],
  });
  const descriptionSections = useMemo(() => parseDescriptionSections(artwork.description), [artwork.description]);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const canExpandDescription =
    descriptionSections.some((section) => section.content.length > 360) ||
    descriptionSections.reduce((sum, section) => sum + section.content.length, 0) > 700;
  const focalObjectPosition = `${(artwork.focalX ?? 0.5) * 100}% ${(artwork.focalY ?? 0.5) * 100}%`;

  const artworkJsonLd = {
    "@context": "https://schema.org",
    "@type": "VisualArtwork",
    name: artwork.title,
    image: artwork.imageUrl,
    creator: { "@type": "Person", name: artist },
    dateCreated: artwork.datingText || undefined,
    artform: artwork.category || undefined,
    artMedium: artwork.techniqueMaterial || undefined,
    description: artwork.description || artwork.ogDescription || undefined,
    url: loaderData.canonicalUrl,
  };

  useEffect(() => {
    const controller = new AbortController();
    setRelatedLoading(true);
    fetch(`/api/artwork-related?id=${artwork.id}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json() as Promise<{ sameArtist?: RelatedArtwork[]; similar?: RelatedArtwork[] }>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setRelated({
          sameArtist: Array.isArray(payload.sameArtist) ? payload.sameArtist : [],
          similar: Array.isArray(payload.similar) ? payload.similar : [],
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setRelated({ sameArtist: [], similar: [] });
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setRelatedLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [artwork.id]);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "/";
    }
  }, []);

  return (
    <div className="min-h-screen pt-16 bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(artworkJsonLd) }}
      />
      {/* Back button */}
      <div className="px-4 md:px-6 lg:px-10 pt-4">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-[13px] text-secondary hover:text-primary transition-colors bg-transparent border-none cursor-pointer focus-ring py-1"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Tillbaka
        </button>
      </div>

      <div className="px-4 md:px-6 lg:px-10 py-6 lg:grid lg:grid-cols-[1.2fr_1fr] lg:gap-10 xl:gap-16 lg:items-start">
        {/* Image — sticky on desktop */}
        <div className="lg:sticky lg:top-20">
          <img
            src={artwork.imageUrl}
            srcSet={`${artwork.thumbUrl} 400w, ${artwork.imageUrl} 800w`}
            sizes="(max-width: 1024px) 100vw, 55vw"
            alt={`${artwork.title} — ${artist}`}
            loading="eager"
            fetchPriority="high"
            onError={(event) => {
              event.currentTarget.classList.add("is-broken");
            }}
            className="w-full object-contain max-h-[80vh]"
            style={{ objectPosition: focalObjectPosition }}
          />
        </div>

        {/* Metadata */}
        <div className="pt-6 lg:pt-0 pb-8">
        <h1 className="text-[32px] text-primary leading-[1.3]">
          {artwork.title}
        </h1>

        {artwork.artists.length > 0 && (
          <p className="mt-2 text-[15px]">
            {artwork.artists.map((a, i: number) => (
              <span key={i}>
                {i > 0 && ", "}
                <a href={"/artist/" + encodeURIComponent(a.name)}
                  className="text-secondary hover:text-primary no-underline border-b border-rule hover:border-secondary transition-colors focus-ring">
                  {a.name}
                </a>
              </span>
            ))}
            {artwork.artists[0]?.nationality && (
              <span className="text-[13px] text-secondary">
                {" "}· {artwork.artists[0].nationality}
              </span>
            )}
          </p>
        )}
        {(artwork.collectionName || artwork.museumName) && (
          <p className="mt-2 text-[13px] text-secondary">
            Samling:{" "}
            {artwork.collectionName ? (
              <a
                href={`/samling/${encodeURIComponent(artwork.collectionName)}`}
                className="text-primary underline decoration-rule underline-offset-2 hover:decoration-secondary transition-colors focus-ring"
              >
                {artwork.collectionName}
              </a>
            ) : (
              <span className="text-primary">{artwork.museumName}</span>
            )}
          </p>
        )}

        {/* Details — single column definition list */}
        {(artwork.datingText || artwork.category || artwork.techniqueMaterial || artwork.dimensions || artwork.acquisitionYear || artwork.objectType || artwork.style || artwork.motiveCategory) && (
          <dl className="mt-8 pt-8 border-t border-rule space-y-4">
            {artwork.datingText && <Detail label={artwork.datingType || "Datering"} value={artwork.datingText} />}
            {artwork.category && <Detail label="Kategori" value={artwork.category} />}
            {artwork.techniqueMaterial && <Detail label="Teknik" value={artwork.techniqueMaterial} />}
            {artwork.dimensions && <Detail label="Mått" value={artwork.dimensions} />}
            {artwork.acquisitionYear && <Detail label="Förvärvad" value={String(artwork.acquisitionYear)} />}
            {artwork.objectType && <Detail label="Objekttyp" value={artwork.objectType} />}
            {artwork.style && <Detail label="Stil" value={artwork.style} />}
            {artwork.motiveCategory && <Detail label="Motiv" value={artwork.motiveCategory} />}
          </dl>
        )}

        {/* Description */}
        {descriptionSections.length > 0 && (
          <div className="mt-8 pt-8 border-t border-rule">
            <div className={[
              "relative",
              canExpandDescription && !isDescriptionExpanded ? "max-h-[20rem] overflow-hidden" : "",
            ].join(" ")}>
              <div className="space-y-4">
                {descriptionSections.map((section, index) => (
                  <section key={`${section.heading}-${index}`}>
                    <h3 className="text-[11px] text-secondary uppercase tracking-[0.08em] mb-1">
                      {section.heading}
                    </h3>
                    <p className="text-[15px] text-primary leading-[1.55] whitespace-pre-line">
                      {section.content}
                    </p>
                  </section>
                ))}
              </div>
              {canExpandDescription && !isDescriptionExpanded && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
              )}
            </div>
            {canExpandDescription && (
              <button
                type="button"
                title={isDescriptionExpanded ? "Visa mindre" : "Visa mer"}
                aria-label={isDescriptionExpanded ? "Visa mindre" : "Visa mer"}
                aria-expanded={isDescriptionExpanded}
                onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                className="mt-3 text-[13px] text-secondary hover:text-primary transition-colors cursor-pointer bg-transparent border-none focus-ring"
              >
                {isDescriptionExpanded ? "Visa mindre" : "Visa mer"}
              </button>
            )}
          </div>
        )}

        {/* Signature & Inscription */}
        {(artwork.signature || artwork.inscription) && (
          <div className="mt-8 pt-8 border-t border-rule space-y-3">
            {artwork.signature && (
              <div>
                <p className="text-[11px] text-secondary uppercase tracking-[0.08em]">Signatur</p>
                <p className="text-[13px] text-primary mt-0.5">{artwork.signature}</p>
              </div>
            )}
            {artwork.inscription && (
              <div>
                <p className="text-[11px] text-secondary uppercase tracking-[0.08em]">Inskription</p>
                <p className="text-[13px] text-primary mt-0.5">{artwork.inscription}</p>
              </div>
            )}
          </div>
        )}

        {/* Exhibitions */}
        {artwork.exhibitions.length > 0 && (
          <div className="mt-8 pt-8 border-t border-rule">
            <p className="text-[11px] text-secondary uppercase tracking-[0.08em] mb-2">
              Utställningar ({artwork.exhibitions.length})
            </p>
            <div className="flex flex-col gap-1">
              {artwork.exhibitions.slice(0, 5).map((ex, i: number) => (
                <div key={i} className="text-[13px] text-primary leading-[1.4]">
                  {ex.title}
                  {ex.venue && <span className="text-secondary"> — {ex.venue}</span>}
                  {ex.year && <span className="text-secondary"> ({ex.year})</span>}
                </div>
              ))}
              {artwork.exhibitions.length > 5 && (
                <p className="text-[11px] text-secondary">
                  +{artwork.exhibitions.length - 5} till
                </p>
              )}
            </div>
          </div>
        )}

        {/* License / Copyright */}
        {(artwork.mediaLicense || artwork.mediaCopyright) && (
          <div className="mt-8 pt-8 border-t border-rule">
            <p className="text-[11px] text-secondary uppercase tracking-[0.08em] mb-1.5">
              Bildlicens
            </p>
            <div className="flex flex-col gap-1">
              {artwork.mediaLicense && (
                <p className="text-[13px] text-primary">
                  {CC_LICENSE_URLS[artwork.mediaLicense] ? (
                    <a
                      href={CC_LICENSE_URLS[artwork.mediaLicense]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline decoration-rule underline-offset-2 hover:decoration-secondary transition-colors focus-ring"
                    >
                      {artwork.mediaLicense}
                    </a>
                  ) : (
                    <span>{artwork.mediaLicense}</span>
                  )}
                </p>
              )}
              {artwork.mediaCopyright && (
                <p className="text-[13px] text-secondary leading-[1.3]">
                  {artwork.mediaCopyright}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Actions row */}
        <div className="flex flex-wrap items-center gap-3 mt-8 pt-8 border-t border-rule">
          <button
            type="button"
            onClick={() => {
              if (!saved) {
                window.__toast?.("Sparad");
              } else {
                window.__toast?.("Borttagen från sparade");
              }
              toggle(artwork.id);
            }}
            className="px-3.5 py-1.5 text-[13px] border border-rule rounded-card bg-white text-secondary hover:text-primary hover:border-secondary transition-colors cursor-pointer focus-ring"
          >
            {saved ? "♥ Sparad" : "Spara"}
          </button>
          <button
            type="button"
            onClick={() => {
              const artist = artwork.artists?.[0]?.name || "Okänd konstnär";
              const text = `${artwork.title} av ${artist}`;
              const url = window.location.href;
              if (navigator.share) {
                navigator.share({ title: artwork.title, text, url });
              } else {
                navigator.clipboard.writeText(url);
                window.__toast?.("Länk kopierad");
              }
            }}
            className="px-3.5 py-1.5 text-[13px] border border-rule rounded-card bg-white text-secondary hover:text-primary hover:border-secondary transition-colors cursor-pointer focus-ring"
          >
            Dela
          </button>
          {artwork.museumSiteUrl && artwork.museumName && (
            <a href={artwork.museumSiteUrl} target="_blank" rel="noopener noreferrer"
              className="px-3.5 py-1.5 text-[13px] border border-rule rounded-card bg-white text-secondary hover:text-primary hover:border-secondary transition-colors no-underline focus-ring">
              Till {artwork.museumName} →
            </a>
          )}
        </div>
        </div>
      </div>

      {/* Same artist section */}
      {!relatedLoading && related.sameArtist.length > 0 && (
        <section className="px-4 md:px-6 lg:px-10 pt-10">
          <h2 className="text-[11px] uppercase tracking-[0.08em] text-secondary mb-3">
            Mer av {artistName}
          </h2>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            {related.sameArtist.map((s) => (
              <RelatedArtworkCard
                key={s.id}
                item={s}
                fallbackArtist={artistName || "Okänd konstnär"}
                secondaryText={buildRelatedSecondaryText(s, "same-artist")}
              />
            ))}
          </div>
        </section>
      )}

      {/* Similar works */}
      {!relatedLoading && related.similar.length > 0 && (
        <section className="px-4 md:px-6 lg:px-10 pt-10">
          <h2 className="text-[11px] uppercase tracking-[0.08em] text-secondary mb-3">
            Liknande verk
          </h2>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            {related.similar.map((s) => (
              <RelatedArtworkCard
                key={s.id}
                item={s}
                fallbackArtist="Okänd konstnär"
                secondaryText={buildRelatedSecondaryText(s, "similar")}
              />
            ))}
          </div>
        </section>
      )}

      <div className="pb-16" />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] text-secondary uppercase tracking-[0.08em]">{label}</dt>
      <dd className="text-[15px] text-primary mt-0.5 m-0">{value}</dd>
    </div>
  );
}
