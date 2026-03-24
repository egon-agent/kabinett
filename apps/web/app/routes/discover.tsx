import type Database from "better-sqlite3";
import type { Route } from "./+types/discover";
import { getDb } from "../lib/db.server";
import { buildImageUrl } from "../lib/images";
import { sourceFilter } from "../lib/museums.server";
import { parseArtist } from "../lib/parsing";
import { getCachedSiteStats as getSiteStats } from "../lib/stats.server";
import { getCampaignConfig } from "../lib/campaign.server";
import { formatUiNumber, resolveUiLocale, uiText, useUiLocale } from "../lib/ui-language";

export function headers() {
  return { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" };
}

export function meta({ data }: Route.MetaArgs) {
  const isEnglish = data?.uiLocale === "en";
  return [
    { title: isEnglish ? "Discover — Kabinett" : "Upptäck — Kabinett" },
    { name: "description", content: isEnglish ? "Explore hundreds of thousands of works from museum collections." : "Utforska hundratusentals verk från Sveriges museer." },
  ];
}

type Collection = {
  title: string;
  subtitle: string;
  query?: string;
  titleEn?: string;
  subtitleEn?: string;
  queryEn?: string;
  imageIds?: number[];
  imageUrl?: string;
  imageTitle?: string;
  imageArtist?: string;
  color?: string;
  focalX?: number | null;
  focalY?: number | null;
};

type TopArtist = {
  name: string;
  count: number;
  imageUrl?: string;
  imageTitle: string;
  imageArtist: string;
  color: string;
  focalX?: number | null;
  focalY?: number | null;
};

type MuseumSummary = {
  id: string;
  name: string;
  count: number;
};

type ThemeImageRow = {
  iiif_url: string;
  dominant_color: string | null;
  title_sv: string | null;
  title_en: string | null;
  artists: string | null;
  focal_x: number | null;
  focal_y: number | null;
};

type TopArtistQueryRow = {
  name: string;
  cnt: number;
  iiif_url: string | null;
  dominant_color: string | null;
  title_sv: string | null;
  title_en: string | null;
  artists: string | null;
  focal_x: number | null;
  focal_y: number | null;
};

type ToolItem = {
  title: string;
  desc: string;
  href: string;
  mobileOnly?: boolean;
};

const COLLECTIONS: Collection[] = [
  { title: "Mörkt & dramatiskt", titleEn: "Dark & dramatic", subtitle: "Skuggor och spänning", subtitleEn: "Shadows and tension", query: "natt skymning skugga storm", queryEn: "night dusk shadow storm", imageIds: [24664, 20450, 15634] },
  { title: "Stormigt hav", titleEn: "Stormy sea", subtitle: "Vågor och vind", subtitleEn: "Waves and wind", query: "storm hav vågor skepp", queryEn: "storm sea waves ship", imageIds: [18217, 20356, 17939] },
  { title: "Blommor", titleEn: "Flowers", subtitle: "Natur i närbild", subtitleEn: "Nature up close", query: "blomma blommor blomster ros tulpan bukett flower bouquet", queryEn: "flower flowers rose tulip bouquet", imageIds: [-166319052559119, -179937114869368, 17457] },
  { title: "Hästar", titleEn: "Horses", subtitle: "Ädla djur genom tiderna", subtitleEn: "Noble animals through time", query: "häst horse", queryEn: "horse", imageIds: [14802, -247833644771404, -69141112380166] },
  { title: "Porträtt", titleEn: "Portraits", subtitle: "Ansikten genom tiderna", subtitleEn: "Faces through time", query: "porträtt portrait ansikte", queryEn: "portrait face", imageIds: [216852, 16308, 17096] },
  { title: "Landskap", titleEn: "Landscapes", subtitle: "Skog, berg och dal", subtitleEn: "Forest, mountain and valley", query: "landskap skog forest berg", queryEn: "landscape forest mountain", imageIds: [-202485135028962, -62777224500383, 17076] },
  { title: "Hattar", titleEn: "Hats", subtitle: "Huvudbonader genom historien", subtitleEn: "Headwear through history", query: "hatt hattar mössa huvudbonad hat bonnet", queryEn: "hat hats bonnet headwear", imageIds: [-253468788019903, -256891764421414, -61674516346084] },
  { title: "Mytologi", titleEn: "Mythology", subtitle: "Gudar och hjältar", subtitleEn: "Gods and heroes", query: "mytologi gud gudinna myth god goddess", queryEn: "mythology god goddess hero", imageIds: [71395, 177136, 17313] },
  { title: "Telefoner", titleEn: "Telephones", subtitle: "Från vev till knappar", subtitleEn: "From crank to keypad", query: "telefon telefoner telephone", queryEn: "telephone telephones", imageIds: [-278306166813061, -62193254264396, -223649635814047] },
  { title: "Skepp & båtar", titleEn: "Ships & boats", subtitle: "Till havs", subtitleEn: "At sea", query: "skepp båt fartyg ship boat", queryEn: "ship boat vessel", imageIds: [-139485473585279, -448520122533, -103198960131251] },
  { title: "Kaniner", titleEn: "Rabbits", subtitle: "Lurviga vänner", subtitleEn: "Furry friends", query: "kanin hare rabbit", queryEn: "rabbit hare", imageIds: [-62346619720310, -132331838014998, -101957079536391] },
  { title: "Musik", titleEn: "Music", subtitle: "Instrument och melodier", subtitleEn: "Instruments and melodies", query: "musik instrument violin gitarr piano", queryEn: "music instrument violin guitar piano", imageIds: [-230629938287298, -87109461851263, -86518388012200] },
  { title: "Katter", titleEn: "Cats", subtitle: "Mjuka tassar", subtitleEn: "Soft paws", query: "katt cats cat", queryEn: "cat cats", imageIds: [-189194491314296, 35597, -239926311302559] },
  { title: "Mat & frukt", titleEn: "Food & fruit", subtitle: "Gastronomi i konsten", subtitleEn: "Gastronomy in art", query: "frukt äpple päron mat stillleben fruit", queryEn: "fruit apple pear food still life", imageIds: [-253717850327201, -5907047110556, -111000855806884] },
  { title: "Arkitektur", titleEn: "Architecture", subtitle: "Slott och kyrkor", subtitleEn: "Palaces and churches", query: "slott kyrka palace church architecture", queryEn: "palace church architecture", imageIds: [-129853437095252, -98579182221784, -45980371825152] },
  { title: "Barn", titleEn: "Children", subtitle: "Barndomens porträtt", subtitleEn: "Portraits of childhood", query: "barn child children", queryEn: "child children", imageIds: [17996, 16051, 17093] },
];

const discoverCacheMap = new Map<string, { expiresAt: number; data: any }>();
const DISCOVER_CACHE_TTL_MS = 3_600_000;
let hasTopArtistsMaterializedTable: boolean | null = null;

function buildTopArtistFilters(alias: string): string {
  const artistName = `json_extract(${alias}.artists, '$[0].name')`;

  return [
    `${alias}.artists IS NOT NULL`,
    `${artistName} IS NOT NULL`,
    `${artistName} NOT LIKE '%känd%'`,
    `${artistName} NOT LIKE '%nonym%'`,
    `${artistName} NOT LIKE 'http://%'`,
    `${artistName} NOT LIKE 'https://%'`,
    `${artistName} NOT LIKE 'www.%'`,
    `${artistName} NOT GLOB '[0-9]*_*'`,
    `${artistName} NOT IN ('Gustavsberg')`,
    `COALESCE(${alias}.category, '') NOT LIKE '%Keramik%'`,
    `COALESCE(${alias}.category, '') NOT LIKE '%Porslin%'`,
    `COALESCE(${alias}.category, '') NOT LIKE '%Glas%'`,
    `COALESCE(${alias}.category, '') NOT LIKE '%Formgivning%'`,
    `${alias}.iiif_url IS NOT NULL`,
    `LENGTH(${alias}.iiif_url) > 40`,
  ].join("\n        AND ");
}

function topArtistsMaterializedTableExists(db: Database.Database): boolean {
  if (hasTopArtistsMaterializedTable !== null) {
    return hasTopArtistsMaterializedTable;
  }

  const row = db.prepare(
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table' AND name = 'top_artists_materialized'`
  ).get() as { name?: string } | undefined;

  hasTopArtistsMaterializedTable = Boolean(row?.name);
  return hasTopArtistsMaterializedTable;
}

function queryMaterializedTopArtists(db: Database.Database, sources: string[]): TopArtistQueryRow[] {
  if (sources.length === 0) {
    return [];
  }

  const placeholders = sources.map(() => "?").join(",");

  return db.prepare(
    `WITH filtered AS (
       SELECT
         name,
         SUM(artwork_count) as cnt,
         MAX(sample_artwork_id) as sample_artwork_id
       FROM top_artists_materialized
       WHERE source IN (${placeholders})
       GROUP BY name
       HAVING cnt >= 20
       ORDER BY cnt DESC
       LIMIT 12
     )
     SELECT
       f.name,
       f.cnt,
       a.iiif_url,
       a.dominant_color,
       a.title_sv,
       a.title_en,
       a.artists,
       a.focal_x,
       a.focal_y
     FROM filtered f
     JOIN artworks a ON a.id = f.sample_artwork_id
     LEFT JOIN broken_images bi ON bi.artwork_id = a.id
     WHERE bi.artwork_id IS NULL
     ORDER BY f.cnt DESC`
  ).all(...sources) as TopArtistQueryRow[];
}

function queryLiveTopArtists(
  db: Database.Database,
  source: { sql: string; params: string[] },
): TopArtistQueryRow[] {
  const baseFilters = buildTopArtistFilters("a");

  return db.prepare(`
    WITH top_artists AS (
      SELECT json_extract(a.artists, '$[0].name') as name, COUNT(*) as cnt
      FROM artworks a
      WHERE ${baseFilters}
        AND ${source.sql}
      GROUP BY name
      HAVING cnt >= 20
      ORDER BY cnt DESC
      LIMIT 12
    ), artist_samples AS (
      SELECT
        json_extract(a.artists, '$[0].name') as name,
        MAX(a.id) as sample_id
      FROM artworks a
      LEFT JOIN broken_images bi ON bi.artwork_id = a.id
      WHERE ${baseFilters}
        AND bi.artwork_id IS NULL
        AND json_extract(a.artists, '$[0].name') IN (SELECT name FROM top_artists)
        AND ${source.sql}
      GROUP BY name
    )
    SELECT
      ta.name,
      ta.cnt,
      a.iiif_url,
      a.dominant_color,
      a.title_sv,
      a.title_en,
      a.artists,
      a.focal_x,
      a.focal_y
    FROM top_artists ta
    JOIN artist_samples s ON s.name = ta.name
    JOIN artworks a ON a.id = s.sample_id
    ORDER BY ta.cnt DESC
  `).all(...source.params, ...source.params) as TopArtistQueryRow[];
}

function queryTopArtists(
  db: Database.Database,
  source: { sql: string; params: string[] },
): TopArtistQueryRow[] {
  if (topArtistsMaterializedTableExists(db)) {
    try {
      return queryMaterializedTopArtists(db, source.params);
    } catch {
      hasTopArtistsMaterializedTable = false;
    }
  }

  return queryLiveTopArtists(db, source);
}

function pickSeeded<T>(items: T[], seed: number): T | undefined {
  if (items.length === 0) return undefined;
  const idx = Math.abs(seed) % items.length;
  return items[idx];
}

function tokenizeSearch(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function buildDiscoverTitleFtsQuery(text: string): string {
  const terms = tokenizeSearch(text).map((term) => term.replaceAll("\"", ""));
  if (terms.length === 0) return "";
  return terms
    .map((term) => `(title_sv:"${term}"* OR title_en:"${term}"*)`)
    .join(" OR ");
}

export async function loader() {
  const now = Date.now();
  const randomSeed = Math.floor(now / 60_000);
  const campaign = getCampaignConfig();
  const cacheKey = campaign.id;
  const cached = discoverCacheMap.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const db = getDb();
  const source = sourceFilter();
  const sourceA = sourceFilter("a");

  const themeByIdStmt = db.prepare(
    `SELECT a.iiif_url, a.dominant_color, a.title_sv, a.title_en, a.artists, a.focal_x, a.focal_y
     FROM artworks a
     WHERE a.id = ?
       AND a.iiif_url IS NOT NULL
       AND LENGTH(a.iiif_url) > 40
       AND a.id NOT IN (SELECT artwork_id FROM broken_images)
       AND ${sourceA.sql}`
  );

  const themeFtsStmt = db.prepare(
    `SELECT a.iiif_url, a.dominant_color, a.title_sv, a.title_en, a.artists, a.focal_x, a.focal_y
     FROM artworks_fts
     JOIN artworks a ON a.id = artworks_fts.rowid
     WHERE artworks_fts MATCH ?
       AND a.iiif_url IS NOT NULL
       AND LENGTH(a.iiif_url) > 40
       AND LENGTH(COALESCE(a.title_sv, a.title_en, '')) BETWEEN 2 AND 140
       AND a.id NOT IN (SELECT artwork_id FROM broken_images)
       AND ${sourceA.sql}
     ORDER BY artworks_fts.rank ASC
     LIMIT 36`
  );

  const themeFallbackPool = db.prepare(
    `SELECT a.iiif_url, a.dominant_color, a.title_sv, a.title_en, a.artists, a.focal_x, a.focal_y
     FROM artworks a
     WHERE a.iiif_url IS NOT NULL
       AND LENGTH(a.iiif_url) > 40
       AND a.id NOT IN (SELECT artwork_id FROM broken_images)
       AND ${sourceA.sql}
     ORDER BY a.id DESC
     LIMIT 500`
  ).all(...sourceA.params) as ThemeImageRow[];

  const usedThemeImages = new Set<string>();

  const collections = COLLECTIONS.map((c, index) => {
    try {
      let row: ThemeImageRow | undefined;

      if (c.imageIds?.length) {
        for (let offset = 0; offset < c.imageIds.length; offset += 1) {
          const pickedId = c.imageIds[(randomSeed + index + offset) % c.imageIds.length];
          const candidate = themeByIdStmt.get(pickedId, ...sourceA.params) as ThemeImageRow | undefined;
          if (!candidate) continue;
          if (!usedThemeImages.has(candidate.iiif_url)) {
            row = candidate;
            break;
          }
          if (!row) row = candidate;
        }
      }

      if (!row) {
        const ftsQuery = buildDiscoverTitleFtsQuery(c.query || c.title);
        if (ftsQuery) {
          try {
            const rows = themeFtsStmt.all(ftsQuery, ...sourceA.params) as ThemeImageRow[];
            const available = rows.filter((candidate) => !usedThemeImages.has(candidate.iiif_url));
            row = pickSeeded(available, randomSeed + index) || pickSeeded(rows, randomSeed + index);
          } catch {
            // FTS can be sparse/uneven across sources; fall through to LIKE fallback.
          }
        }
      }

      if (!row) {
        const terms = tokenizeSearch(c.query || c.title);
        if (terms.length > 0) {
          const likeClauses = terms.map(
            () =>
              "(LOWER(COALESCE(a.title_sv, '')) LIKE ? OR LOWER(COALESCE(a.title_en, '')) LIKE ? OR LOWER(COALESCE(a.category, '')) LIKE ? OR LOWER(COALESCE(a.technique_material, '')) LIKE ?)"
          );
          const likeParams = terms.flatMap((term) => {
            const pattern = `%${term}%`;
            return [pattern, pattern, pattern, pattern];
          });
          const rows = db.prepare(
            `SELECT a.iiif_url, a.dominant_color, a.title_sv, a.title_en, a.artists, a.focal_x, a.focal_y
             FROM artworks a
             WHERE a.iiif_url IS NOT NULL
               AND LENGTH(a.iiif_url) > 40
               AND LENGTH(COALESCE(a.title_sv, a.title_en, '')) BETWEEN 2 AND 140
               AND a.id NOT IN (SELECT artwork_id FROM broken_images)
               AND ${sourceA.sql}
               AND (${likeClauses.join(" OR ")})
             ORDER BY a.id DESC
             LIMIT 72`
          ).all(...sourceA.params, ...likeParams) as ThemeImageRow[];
          const available = rows.filter((candidate) => !usedThemeImages.has(candidate.iiif_url));
          row = pickSeeded(available, randomSeed + index) || pickSeeded(rows, randomSeed + index);
        }
      }

      if (!row && themeFallbackPool.length > 0) {
        const available = themeFallbackPool.filter((candidate) => !usedThemeImages.has(candidate.iiif_url));
        row = pickSeeded(available, randomSeed + index * 13) || pickSeeded(themeFallbackPool, randomSeed + index * 13);
      }

      if (row?.iiif_url) {
        usedThemeImages.add(row.iiif_url);
      }

      return {
        ...c,
        imageUrl: row?.iiif_url ? buildImageUrl(row.iiif_url, 400) : undefined,
        imageTitle: row?.title_sv || row?.title_en || "Utan titel",
        imageArtist: parseArtist(row?.artists || null),
        color: row?.dominant_color || "#2B2926",
        focalX: row?.focal_x ?? null,
        focalY: row?.focal_y ?? null,
      };
    } catch {
      return { ...c, color: "#2B2926" };
    }
  });

  const artistsWithImages = queryTopArtists(db, source);

  const mappedArtists: TopArtist[] = artistsWithImages.map((artistRow) => ({
    name: artistRow.name,
    count: artistRow.cnt,
    imageUrl: artistRow.iiif_url ? buildImageUrl(artistRow.iiif_url, 300) : undefined,
    imageTitle: artistRow.title_sv || artistRow.title_en || "Utan titel",
    imageArtist: parseArtist(artistRow.artists || null),
    color: artistRow.dominant_color || "#E0DEDA",
    focalX: artistRow.focal_x,
    focalY: artistRow.focal_y,
  }));

  const siteStats = getSiteStats(db);
  const stats = {
    totalWorks: siteStats.totalWorks,
    paintings: siteStats.paintings,
    museums: siteStats.museums,
    yearsSpan: siteStats.yearsSpan,
  };

  const museums = db.prepare(`
    SELECT COALESCE(a.sub_museum, m.name) as coll_name, COUNT(*) as count
    FROM artworks a
    LEFT JOIN museums m ON m.id = a.source
    WHERE ${sourceA.sql}
      AND COALESCE(a.sub_museum, m.name) IS NOT NULL
      AND COALESCE(a.sub_museum, m.name) != 'Statens historiska museer'
    GROUP BY coll_name
    ORDER BY count DESC
  `).all(...sourceA.params) as Array<{ coll_name: string; count: number }>;
  const museumList: MuseumSummary[] = museums.map((row: any) => ({
    id: row.coll_name,
    name: row.coll_name,
    count: row.count as number,
  }));
  stats.museums = museumList.length;

  const payload = {
    collections,
    topArtists: mappedArtists,
    stats,
    museums: museumList,
    isCampaign: campaign.id !== "default",
    museumName: campaign.museumName,
    uiLocale: resolveUiLocale(campaign.id),
  };

  discoverCacheMap.set(cacheKey, {
    expiresAt: now + DISCOVER_CACHE_TTL_MS,
    data: payload,
  });

  return payload;
}

export default function Discover({ loaderData }: Route.ComponentProps) {
  const { collections, topArtists, stats, museums, museumName } = loaderData;
  const uiLocale = useUiLocale();
  const hasWalks = uiLocale !== "en";
  const isEuropeanaCampaign = museumName === "Europeana";
  const secondaryStatNumber = isEuropeanaCampaign
    ? formatUiNumber(stats.totalWorks, uiLocale)
    : formatUiNumber(stats.paintings, uiLocale);
  const secondaryStatLabel = isEuropeanaCampaign
    ? uiText(uiLocale, "bilder", "images")
    : uiText(uiLocale, "målningar", "paintings");

  const tools: ToolItem[] = [
    { title: uiText(uiLocale, "Tidslinje", "Timeline"), desc: uiText(uiLocale, "800 år av konst, decennium för decennium", "800 years of art, decade by decade"), href: "/timeline" },
    { title: uiText(uiLocale, "Färgmatch", "Color match"), desc: uiText(uiLocale, "Matcha en färg med konstverk", "Match a color with artworks"), href: "/color-match", mobileOnly: true },
    ...(hasWalks
      ? [{ title: uiText(uiLocale, "Vandringar", "Walks"), desc: uiText(uiLocale, "Tematiska resor genom samlingen", "Thematic journeys through the collection"), href: "/vandringar" }]
      : []),
  ];
  const mobileToolCount = tools.length;
  const desktopToolCount = tools.filter((tool) => !tool.mobileOnly).length;
  const showToolHeadingOnMobile = mobileToolCount > 1;
  const showToolHeadingOnDesktop = desktopToolCount > 1;
  const showToolHeading = showToolHeadingOnMobile || showToolHeadingOnDesktop;
  const toolHeadingClass = [
    "text-[18px] text-primary leading-[1.3] mb-4",
    showToolHeadingOnMobile && !showToolHeadingOnDesktop
      ? "md:hidden"
      : !showToolHeadingOnMobile && showToolHeadingOnDesktop
        ? "hidden md:block"
        : "",
  ].join(" ").trim();

  return (
    <div className="min-h-screen pt-16 bg-white text-primary">
      <div className="px-4 md:px-6 lg:px-10 pt-8 pb-6">
        <h1 className="text-[32px] text-primary leading-[1.3]">{uiText(uiLocale, "Upptäck", "Discover")}</h1>
        <p className="text-[15px] text-secondary mt-1">{uiText(uiLocale, "Teman, konstnärer och samlingar", "Themes, artists and collections")}</p>
      </div>

        {/* Themes — compact list with small thumbnails */}
        <section className="px-4 md:px-6 lg:px-10">
          <h2 className="text-[11px] uppercase tracking-[0.08em] text-secondary mb-3">{uiText(uiLocale, "Teman", "Themes")}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
            {collections.map((c: Collection) => (
              <a
                key={c.title}
                href={`/search?q=${encodeURIComponent(uiLocale === "en" ? (c.queryEn || c.query || c.title) : (c.query || c.title))}&type=visual`}
                className="flex items-center gap-3 py-2.5 no-underline hover:opacity-75 transition-opacity focus-ring"
              >
                <div
                  className="w-14 h-14 shrink-0 overflow-hidden rounded-card"
                  style={{ backgroundColor: c.color || "#E0DEDA" }}
                >
                  {c.imageUrl && (
                    <img
                      src={c.imageUrl}
                      alt=""
                      loading="lazy"
                      width={112}
                      height={112}
                      onError={(event) => {
                        event.currentTarget.classList.add("is-broken");
                      }}
                      className="w-full h-full object-cover"
                      style={{ objectPosition: `${(c.focalX ?? 0.5) * 100}% ${(c.focalY ?? 0.5) * 100}%` }}
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] text-primary leading-[1.3] truncate">{uiText(uiLocale, c.title, c.titleEn || c.title)}</p>
                  <p className="text-[11px] text-secondary mt-0 truncate">{uiText(uiLocale, c.subtitle, c.subtitleEn || c.subtitle)}</p>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Top artists */}
        {topArtists.length > 0 && (
          <section className="mt-12 px-4 md:px-6 lg:px-10">
            <h2 className="text-[11px] uppercase tracking-[0.08em] text-secondary mb-4">{uiText(uiLocale, "Konstnärer", "Artists")}</h2>

            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
              {topArtists.map((a: TopArtist) => (
                <a
                  key={a.name}
                  href={`/artist/${encodeURIComponent(a.name)}`}
                  className="shrink-0 w-[120px] block no-underline hover:opacity-85 transition-opacity duration-200 focus-ring"
                >
                  <div
                    className="w-[120px] h-[120px] overflow-hidden rounded-card"
                    style={{ backgroundColor: a.color || "#E0DEDA" }}
                  >
                    {a.imageUrl && (
                      <img
                        src={a.imageUrl}
                        alt={`${a.imageTitle || uiText(uiLocale, "Utan titel", "Untitled")} — ${a.imageArtist || a.name}`}
                        loading="lazy"
                        width={300}
                        height={300}
                        onError={(event) => {
                          event.currentTarget.classList.add("is-broken");
                        }}
                        className="w-full h-full object-cover"
                        style={{ objectPosition: `${(a.focalX ?? 0.5) * 100}% ${(a.focalY ?? 0.5) * 100}%` }}
                      />
                    )}
                  </div>
                  <div className="pt-2">
                    <p className="text-[13px] text-primary leading-[1.3]">{a.name}</p>
                    <p className="text-[11px] text-secondary mt-0.5">
                      {uiText(uiLocale, `${a.count.toLocaleString("sv")} verk`, `${formatUiNumber(a.count, uiLocale)} works`)}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Tools + Collections + Stats — side by side on desktop */}
        <div className="mt-12 border-t border-rule pt-8 pb-16 px-4 md:px-6 lg:px-10 grid lg:grid-cols-3 gap-10 lg:gap-12">
          {/* Tools */}
          {tools.length > 0 && (
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.08em] text-secondary mb-3">{uiText(uiLocale, "Verktyg", "Tools")}</h2>
              <div className="flex flex-col">
                {tools.map((tool) => (
                  <div key={tool.title} className={tool.mobileOnly ? "md:hidden" : ""}>
                    <ToolLink title={tool.title} desc={tool.desc} href={tool.href} />
                  </div>
                ))}
              </div>

              {/* Stats under tools */}
              <div className="mt-6 bg-white rounded-card p-5">
                <h2 className="text-[11px] uppercase tracking-[0.08em] text-secondary mb-3">{uiText(uiLocale, "I siffror", "In numbers")}</h2>
                <div className="grid grid-cols-2 gap-4">
                  <StatItem number={formatUiNumber(stats.totalWorks, uiLocale)} label={uiText(uiLocale, "verk", "artworks")} />
                  <StatItem number={formatUiNumber(stats.museums, uiLocale)} label={uiText(uiLocale, "samlingar", "collections")} />
                  <StatItem number={uiText(uiLocale, `${stats.yearsSpan} år`, `${formatUiNumber(stats.yearsSpan, uiLocale)} years`)} label={uiText(uiLocale, "av historia", "of history")} />
                  <StatItem number={secondaryStatNumber} label={secondaryStatLabel} />
                </div>
              </div>
            </div>
          )}

          {/* Collections — spans 2 cols on desktop */}
          {museums.length > 0 && (
            <div className="lg:col-span-2">
              <h2 className="text-[11px] uppercase tracking-[0.08em] text-secondary mb-3">{uiText(uiLocale, "Samlingar", "Collections")}</h2>
              <div className="grid md:grid-cols-2 gap-x-8">
                {museums.map((museum: MuseumSummary) => (
                  <a
                    key={museum.id}
                    href={`/samling/${encodeURIComponent(museum.name)}`}
                    className="flex items-center justify-between py-2.5 border-b border-rule no-underline hover:text-primary transition-colors focus-ring"
                  >
                    <span className="text-[15px] text-primary">{museum.name}</span>
                    <span className="text-[13px] text-secondary">
                      {uiText(uiLocale, `${museum.count.toLocaleString("sv")} verk`, `${formatUiNumber(museum.count, uiLocale)} works`)}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
    </div>
  );
}

function ToolLink({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <a href={href} className="flex items-center justify-between py-3 border-b border-rule no-underline hover:text-primary focus-ring">
      <div>
        <p className="text-[15px] text-primary m-0">{title}</p>
        <p className="text-[11px] text-secondary mt-0.5">{desc}</p>
      </div>
      <span className="text-secondary text-[15px]">→</span>
    </a>
  );
}

function StatItem({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <p className="text-[42px] text-primary leading-none">{number}</p>
      <p className="text-[11px] text-secondary mt-1 uppercase tracking-[0.08em]">{label}</p>
    </div>
  );
}
