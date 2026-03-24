import { formatUiNumber, uiText, useUiLocale } from "../lib/ui-language";

export type StatsCardData = {
  total: number;
  museums: number;
  paintings: number;
  yearsSpan: number;
};

export default function StatsSection({ stats, museumName }: { stats: StatsCardData; museumName?: string | null }) {
  const uiLocale = useUiLocale();
  const items = [
    { value: formatUiNumber(stats.total, uiLocale), label: uiText(uiLocale, "verk", "artworks") },
    ...(stats.museums > 1 ? [{ value: formatUiNumber(stats.museums, uiLocale), label: uiText(uiLocale, "samlingar", "collections") }] : []),
    { value: uiText(uiLocale, `${stats.yearsSpan} år`, `${formatUiNumber(stats.yearsSpan, uiLocale)} years`), label: uiText(uiLocale, "av historia", "of history") },
    { value: formatUiNumber(stats.paintings, uiLocale), label: uiText(uiLocale, "målningar", "paintings") },
  ];
  return (
    <div className="py-10 md:py-12 border-t border-dark-rule px-4 md:px-6 lg:px-10">
      <p className="text-[11px] uppercase tracking-[0.08em] text-dark-secondary">
        {museumName || uiText(uiLocale, "Sveriges kulturarv", "Sweden's cultural heritage")}
      </p>
      <h2 className="text-[18px] text-dark-primary mt-2 leading-[1.3]">
        {uiText(uiLocale, "Samlingen i siffror", "Collection in numbers")}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-[42px] text-dark-primary leading-none">{item.value}</p>
            <p className="text-[11px] text-dark-secondary mt-1 uppercase tracking-[0.08em]">{item.label}</p>
          </div>
        ))}
      </div>
      <a
        href="/discover"
        className="inline-block mt-6 text-[13px] text-dark-secondary hover:text-dark-primary transition-colors no-underline focus-ring"
      >
        {uiText(uiLocale, "Upptäck samlingen", "Explore collection")} →
      </a>
    </div>
  );
}
