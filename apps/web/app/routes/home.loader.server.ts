import { getCuratedIds } from "../lib/curated-home";
import { getThemes } from "../lib/themes";
import { fetchFeed } from "../lib/feed.server";
import type { SpotlightCardData } from "../components/SpotlightCard";
import type { StatsCardData } from "../components/StatsSection";
import type { ThemeCardSection } from "../components/ThemeCard";
import type { ArtworkDisplayItem } from "../components/artwork-meta";
import { getCampaignConfig, type CampaignId } from "../lib/campaign.server";
import { getDb } from "../lib/db.server";
import { buildDirectImageUrl, buildImageUrl } from "../lib/images";
import { getEnabledMuseums, shouldShowCollectionLabels, sourceFilter } from "../lib/museums.server";
import { getCachedSiteStats } from "../lib/stats.server";
import { formatUiNumber, resolveUiLocale } from "../lib/ui-language";

export type HomeLoaderData = {
  initialItems: ArtworkDisplayItem[];
  initialCursor: number | null;
  initialHasMore: boolean;
  preloadedThemes: ThemeCardSection[];
  showMuseumBadge: boolean;
  heroHeadline: string;
  heroSubline: string;
  heroIntro: string | null;
  museumName: string | null;
  stats: StatsCardData;
  spotlight: SpotlightCardData | null;
  ogImageUrl: string | null;
  metaTitle: string;
  metaDescription: string;
  noindex: boolean;
  campaignId: CampaignId;
  canonicalUrl: string;
  origin: string;
};

type CachedHomePayload = Omit<HomeLoaderData, "canonicalUrl" | "origin">;

const HOME_INITIAL_ITEMS = 10;
const HOME_INITIAL_ITEMS_MIN = 8;
const HOME_THEME_PRELOAD_ITEMS = 6;
const HOME_CACHE_TTL_MS = Number(process.env.KABINETT_HOME_CACHE_MS ?? "300000");
let homeCache:
  | {
      key: string;
      ts: number;
      data: CachedHomePayload;
    }
  | null = null;

/** Pick n random items from an array (Fisher-Yates partial shuffle). */
function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = arr.slice();
  const result: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy[idx]);
    copy[idx] = copy[copy.length - 1];
    copy.pop();
  }
  return result;
}

function cloneHomePayload(payload: CachedHomePayload): CachedHomePayload {
  return {
    ...payload,
    initialItems: payload.initialItems.map((item) => ({ ...item })),
    preloadedThemes: payload.preloadedThemes.map((theme) => ({
      ...theme,
      items: theme.items.map((item) => ({ ...item })),
    })),
    stats: { ...payload.stats },
    spotlight: payload.spotlight ? { ...payload.spotlight } : null,
  };
}

export async function homeLoader(request: Request): Promise<HomeLoaderData> {
  const url = new URL(request.url);
  const canonicalUrl = `${url.origin}${url.pathname}`;
  const enabledMuseums = getEnabledMuseums();
  const campaign = getCampaignConfig();
  const cacheKey = `${campaign.id}:${enabledMuseums.join(",")}`;
  const cached = homeCache;

  if (cached && cached.key === cacheKey && Date.now() - cached.ts < HOME_CACHE_TTL_MS) {
    return {
      ...cloneHomePayload(cached.data),
      canonicalUrl,
      origin: url.origin,
    };
  }

  const sourceA = sourceFilter("a");
  const db = getDb();

  // 1. Curated initial items — fast lookup by ID
  const curatedIds = getCuratedIds(campaign.id);
  const pickedIds = pickRandom(curatedIds, HOME_INITIAL_ITEMS);
  const placeholders = pickedIds.map(() => "?").join(",");
  const curatedRows = db.prepare(
    `SELECT a.id, a.title_sv, a.title_en, a.artists, a.dating_text, a.iiif_url,
            a.dominant_color, a.category, a.technique_material,
            a.focal_x, a.focal_y,
            COALESCE(a.sub_museum, m.name) as museum_name
     FROM artworks a
     LEFT JOIN museums m ON m.id = a.source
     WHERE a.id IN (${placeholders})
       AND a.iiif_url IS NOT NULL
       AND LENGTH(a.iiif_url) > 40
       AND a.id NOT IN (SELECT artwork_id FROM broken_images)
       AND ${sourceA.sql}`
  ).all(...pickedIds, ...sourceA.params) as any[];

  let initialItems: ArtworkDisplayItem[] = curatedRows.map((row: any) => ({
    ...row,
    title_sv: row.title_sv || row.title_en || "Utan titel",
    imageUrl: buildImageUrl(row.iiif_url, 400),
  }));

  if (initialItems.length < HOME_INITIAL_ITEMS_MIN) {
    const fallback = await fetchFeed({ cursor: null, limit: HOME_INITIAL_ITEMS, filter: "Alla" });
    const seen = new Set(initialItems.map((item) => item.id));
    for (const item of fallback.items) {
      if (seen.has(item.id)) continue;
      initialItems.push(item);
      seen.add(item.id);
      if (initialItems.length >= HOME_INITIAL_ITEMS) break;
    }
  }

  const OG_IMAGES: Record<CampaignId, string> = {
    europeana: "/og-default.jpg",
    nationalmuseum: "/og-nm.jpg",
    nordiska: "/og-nordiska.jpg",
    shm: "/og-shm.jpg",
    default: "/og-default.jpg",
  };
  const ogPath = OG_IMAGES[campaign.id];
  const ogImageUrl = ogPath
    ? `${url.origin}${ogPath}`
    : initialItems[0]?.iiif_url
      ? buildDirectImageUrl(initialItems[0].iiif_url, 800)
      : null;

  // 2. Stats (already cached in-memory by stats.server)
  const siteStats = getCachedSiteStats(db);
  const uiLocale = resolveUiLocale(campaign.id);
  const stats: StatsCardData = {
    total: siteStats.totalWorks,
    museums: siteStats.museums,
    paintings: siteStats.paintings,
    yearsSpan: siteStats.yearsSpan,
  };
  const roundedTotal = stats.total >= 1000 ? Math.floor(stats.total / 1000) * 1000 : stats.total;
  const defaultMetaDescription = uiLocale === "en"
    ? `Discover more than ${formatUiNumber(roundedTotal, uiLocale)} works from ${formatUiNumber(stats.museums, uiLocale)} Swedish collections.`
    : `Upptäck över ${roundedTotal} verk från ${stats.museums} svenska samlingar.`;
  const heroHeadline = campaign.museumName
    ? campaign.museumName
    : uiLocale === "en"
      ? `${formatUiNumber(stats.total, uiLocale)} artworks.`
      : `${stats.total.toLocaleString("sv-SE")} konstverk.`;
  const metaTitle = campaign.metaTitle || (uiLocale === "en" ? "Kabinett — Explore Sweden's cultural heritage" : "Kabinett — Utforska Sveriges kulturarv");
  const metaDescription = campaign.metaDescription
    || (campaign.museumName
      ? uiLocale === "en"
        ? `Discover works from ${campaign.museumName} in Kabinett.`
        : `Upptäck verk från ${campaign.museumName} i Kabinett.`
      : defaultMetaDescription);

  // 3. Preload first theme (lightweight — single FTS query)
  const themes = getThemes(campaign.id);
  const firstTheme = themes[0];
  let preloadedThemes: ThemeCardSection[] = [];
  if (firstTheme) {
    try {
      const themeResult = await fetchFeed({ cursor: null, limit: HOME_THEME_PRELOAD_ITEMS, filter: firstTheme.filter });
      if (themeResult.items.length > 0) {
        preloadedThemes = [{ ...firstTheme, items: themeResult.items }];
      }
    } catch { /* skip on error */ }
  }

  const payload: CachedHomePayload = {
    initialItems,
    initialCursor: null,
    initialHasMore: true,
    preloadedThemes,
    showMuseumBadge: shouldShowCollectionLabels(enabledMuseums),
    heroHeadline,
    heroSubline: campaign.heroSubline,
    heroIntro: campaign.heroIntro,
    museumName: campaign.museumName,
    stats,
    spotlight: null,
    ogImageUrl,
    metaTitle,
    metaDescription,
    noindex: campaign.noindex,
    campaignId: campaign.id,
  };

  homeCache = {
    key: cacheKey,
    ts: Date.now(),
    data: cloneHomePayload(payload),
  };

  return {
    ...cloneHomePayload(payload),
    canonicalUrl,
    origin: url.origin,
  };
}
