import { useState } from "react";
import type { Route } from "./+types/om";
import type { CampaignId } from "../lib/campaign.server";
import { getDb } from "../lib/db.server";
import { sourceFilter } from "../lib/museums.server";
import { getCachedSiteStats as getSiteStats } from "../lib/stats.server";
import { getCampaignConfig } from "../lib/campaign.server";
import { formatUiNumber, uiText, useUiLocale } from "../lib/ui-language";

export function headers() {
  return { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" };
}

export function meta({ data }: Route.MetaArgs) {
  const isEnglish = data?.campaignId === "europeana";
  const title = data?.museumName
    ? (isEnglish ? `About Kabinett × ${data.museumName}` : `Om Kabinett × ${data.museumName}`)
    : (isEnglish ? "About Kabinett — Kabinett" : "Om Kabinett — Kabinett");
  const desc = data?.museumName
    ? (isEnglish ? `Explore ${data.museumName}'s collection with semantic search that understands what you're looking for.` : `Utforska ${data.museumName}s samling med semantisk sökning som förstår vad du letar efter.`)
    : (isEnglish ? "Kabinett brings cultural heritage together in one place, with semantic search that understands what you're looking for." : "Kabinett samlar Sveriges kulturarv på ett ställe — med semantisk sökning som förstår vad du letar efter.");
  return [
    { title },
    { name: "description", content: desc },
    { property: "og:title", content: title },
    { property: "og:description", content: desc },
    { property: "og:type", content: "website" },
  ];
}

export async function loader() {
  const db = getDb();
  const sourceA = sourceFilter("a");
  const siteStats = getSiteStats(db);
  const campaign = getCampaignConfig();
  const stats = {
    totalWorks: siteStats.totalWorks,
    museums: siteStats.museums,
    minYear: siteStats.minYear,
    maxYear: siteStats.maxYear,
  };

  const collections = db.prepare(`
    SELECT COALESCE(a.sub_museum, m.name) as coll_name, a.source as id, COUNT(*) as cnt
    FROM artworks a
    LEFT JOIN museums m ON m.id = a.source
    WHERE ${sourceA.sql}
      AND COALESCE(a.sub_museum, m.name) IS NOT NULL
      AND COALESCE(a.sub_museum, m.name) != 'Statens historiska museer'
    GROUP BY coll_name
    ORDER BY cnt DESC
  `).all(...sourceA.params) as Array<{ name: string; id: string; cnt: number }>;
  const museums = collections.map((row: any) => ({ id: row.id, name: row.coll_name }));

  return { stats, museums, museumName: campaign.museumName, campaignId: campaign.id };
}

function formatRange(minYear: number | null, maxYear: number | null, uiLocale: "sv" | "en"): string {
  if (!minYear || !maxYear) return uiLocale === "en" ? "Unknown" : "Okänt";
  if (minYear === maxYear) return String(minYear);
  return `${minYear}–${maxYear}`;
}

function formatMuseumSummary(names: string[], uiLocale: "sv" | "en"): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] || "";
  if (names.length <= 4) {
    return uiLocale === "en"
      ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
      : `${names.slice(0, -1).join(", ")} och ${names[names.length - 1]}`;
  }

  const visibleNames = names.slice(0, 3).join(", ");
  const remaining = names.length - 3;
  return uiLocale === "en"
    ? `${visibleNames} and ${remaining} other collections`
    : `${visibleNames} och ${remaining} andra samlingar`;
}

export default function About({ loaderData }: Route.ComponentProps) {
  const uiLocale = useUiLocale();
  const { stats, museums, museumName, campaignId } = loaderData;
  const [showAllCollections, setShowAllCollections] = useState(false);
  const museumNames = museums.map((museum) => museum.name);
  const museumSummary = formatMuseumSummary(museumNames, uiLocale);
  const visibleMuseums = showAllCollections ? museums : museums.slice(0, 24);
  const hiddenMuseumCount = Math.max(0, museums.length - visibleMuseums.length);

  return (
    <div className="min-h-screen pt-16 bg-dark-base text-dark-text">
      <div className="max-w-3xl mx-auto px-5 lg:px-6">
        <div className="pt-8">
          <h1 className="font-serif text-[2rem] text-dark-text m-0">
            {museumName
              ? uiText(uiLocale, `Om Kabinett × ${museumName}`, `About Kabinett × ${museumName}`)
              : uiText(uiLocale, "Om Kabinett", "About Kabinett")}
          </h1>
          <p className="mt-4 text-[1rem] lg:text-[1.05rem] text-dark-text-secondary leading-[1.7]">
            {museumName
              ? uiText(uiLocale, `Utforska ${stats.totalWorks.toLocaleString("sv")} verk från ${museumSummary} — med semantisk sökning som förstår vad du letar efter.`, `Explore ${formatUiNumber(stats.totalWorks, uiLocale)} works from ${museumSummary} with semantic search that understands what you're looking for.`)
              : uiText(uiLocale, `Kabinett samlar Sveriges kulturarv på ett ställe. Utforska över ${stats.totalWorks.toLocaleString("sv")} verk från ${museumSummary} — med semantisk sökning som förstår vad du letar efter.`, `Kabinett brings cultural heritage together in one place. Explore more than ${formatUiNumber(stats.totalWorks, uiLocale)} works from ${museumSummary} with semantic search that understands what you're looking for.`)
            }
          </p>
        </div>

        <section className="pt-10">
          <h2 className="font-serif text-[1.3rem] text-dark-text">{uiText(uiLocale, "Så fungerar det", "How it works")}</h2>
          <p className="mt-3 text-[0.95rem] text-dark-text-secondary leading-[1.7]">
            {uiText(uiLocale, 'Vi använder CLIP, en AI-modell, för att förstå bildernas innehåll. Det betyder att du kan söka på "solnedgång över havet" och hitta relevanta verk — även om de inte är taggade med de orden.', 'We use CLIP, an AI model, to understand the content of images. That means you can search for "sunset over the sea" and find relevant works even if those exact words are not in the metadata.')}
          </p>
        </section>

        <section className="pt-10">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="bg-dark-raised rounded-card p-5">
              <p className="text-[0.65rem] uppercase tracking-[0.14em] text-dark-text-muted m-0">{uiText(uiLocale, "Verk", "Artworks")}</p>
              <p className="text-[1.6rem] font-serif text-dark-text mt-2">
                {formatUiNumber(stats.totalWorks, uiLocale)}
              </p>
            </div>
            <div className="bg-dark-raised rounded-card p-5">
              <p className="text-[0.65rem] uppercase tracking-[0.14em] text-dark-text-muted m-0">{uiText(uiLocale, "Samlingar", "Collections")}</p>
              <p className="text-[1.6rem] font-serif text-dark-text mt-2">
                {formatUiNumber(stats.museums, uiLocale)}
              </p>
            </div>
            <div className="bg-dark-raised rounded-card p-5">
              <p className="text-[0.65rem] uppercase tracking-[0.14em] text-dark-text-muted m-0">{uiText(uiLocale, "Tidsomfång", "Time span")}</p>
              <p className="text-[1.6rem] font-serif text-dark-text mt-2">
                {formatRange(stats.minYear, stats.maxYear, uiLocale)}
              </p>
            </div>
          </div>
        </section>

        <section className="pt-10">
          <h2 className="font-serif text-[1.3rem] text-dark-text">{uiText(uiLocale, "Datakällor", "Data sources")}</h2>
          <p className="mt-3 text-[0.95rem] text-dark-text-secondary leading-[1.7]">
            {uiText(uiLocale, "All metadata (text) är CC0 — fri att använda utan hänvisning. Bilderna delas under respektive museums licensvillkor — vanligtvis", "All metadata (text) is CC0 and free to use without attribution. Images are shared under each museum's license terms, usually")}{" "}
            <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener noreferrer" className="text-dark-text underline decoration-dark-text-muted underline-offset-2 hover:decoration-dark-text transition-colors">CC0</a>,{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="text-dark-text underline decoration-dark-text-muted underline-offset-2 hover:decoration-dark-text transition-colors">CC BY</a> {uiText(uiLocale, "eller", "or")}{" "}
            <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/" target="_blank" rel="noopener noreferrer" className="text-dark-text underline decoration-dark-text-muted underline-offset-2 hover:decoration-dark-text transition-colors">CC BY-NC-ND</a>.
            {uiText(uiLocale, "Licensinformation visas på varje verks sida.", "License information is shown on each artwork page.")} {renderDataSourceCopy(campaignId)}
          </p>
        </section>

        {uiLocale !== "en" && (
          <section className="pt-10">
            <h2 className="font-serif text-[1.3rem] text-dark-text">För skolan</h2>
            <p className="mt-3 text-[0.95rem] text-dark-text-secondary leading-[1.7]">
              Kabinett har färdiga{" "}
              <a href="/skola" className="text-dark-text underline decoration-dark-text-muted underline-offset-2 hover:decoration-dark-text transition-colors">
                lektioner
              </a>{" "}
              med diskussionsfrågor och koppling till Lgr22 — redo att använda i klassrummet.
            </p>
          </section>
        )}

        <section className="pt-10 pb-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-serif text-[1.3rem] text-dark-text m-0">{uiText(uiLocale, "Samlingar", "Collections")}</h2>
              <p className="mt-2 text-[0.92rem] text-dark-text-muted leading-[1.6]">
                {uiText(uiLocale, `${museums.length.toLocaleString("sv")} samlingar i urvalet.`, `${formatUiNumber(museums.length, uiLocale)} collections in this selection.`)}
              </p>
            </div>
            {museums.length > 24 ? (
              <button
                type="button"
                onClick={() => setShowAllCollections((value) => !value)}
                className="shrink-0 text-[0.82rem] px-3.5 py-[0.45rem] rounded-full border border-[rgba(255,255,255,0.08)] bg-dark-raised text-dark-text hover:bg-dark-hover transition-colors focus-ring"
              >
                {showAllCollections
                  ? uiText(uiLocale, "Visa färre", "Show fewer")
                  : uiText(uiLocale, `Visa alla ${museums.length.toLocaleString("sv")}`, `Show all ${formatUiNumber(museums.length, uiLocale)}`)}
              </button>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {visibleMuseums.map((m) => (
              <a
                key={m.name}
                href={`/samling/${encodeURIComponent(m.name)}`}
                className="text-[0.82rem] px-3.5 py-[0.4rem] rounded-full bg-dark-raised text-dark-text no-underline hover:bg-dark-hover transition-colors focus-ring"
              >
                {m.name}
              </a>
            ))}
          </div>
          {!showAllCollections && hiddenMuseumCount > 0 ? (
            <p className="mt-4 text-[0.9rem] text-dark-text-muted leading-[1.6]">
              {uiText(uiLocale, `och ${hiddenMuseumCount.toLocaleString("sv")} till.`, `and ${formatUiNumber(hiddenMuseumCount, uiLocale)} more.`)}
            </p>
          ) : null}
        </section>

      </div>
    </div>
  );
}

function renderDataSourceCopy(campaignId: CampaignId) {
  if (campaignId === "nationalmuseum") {
    return <>Data hämtas via Nationalmuseums API.</>;
  }

  if (campaignId === "nordiska" || campaignId === "shm") {
    return (
      <>
        Data hämtas via{" "}
        <a
          href="https://www.raa.se/hitta-information/k-samsok/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-dark-text underline decoration-dark-text-muted underline-offset-2 hover:decoration-dark-text transition-colors"
        >
          K-samsök
        </a>{" "}
        (Riksantikvarieämbetets aggregator).
      </>
    );
  }

  if (campaignId === "europeana") {
    return (
      <>
        Data is provided via{" "}
        <a
          href="https://www.europeana.eu"
          target="_blank"
          rel="noopener noreferrer"
          className="text-dark-text underline decoration-dark-text-muted underline-offset-2 hover:decoration-dark-text transition-colors"
        >
          Europeana
        </a>
        .
      </>
    );
  }

  return (
    <>
      Data hämtas via{" "}
      <a
        href="https://www.raa.se/hitta-information/k-samsok/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-dark-text underline decoration-dark-text-muted underline-offset-2 hover:decoration-dark-text transition-colors"
      >
        K-samsök
      </a>{" "}
      (Riksantikvarieämbetets aggregator) och Nationalmuseums API.
    </>
  );
}
