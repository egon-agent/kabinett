import { useRouteLoaderData } from "react-router";

export type UiLocale = "sv" | "en";

type RootUiData = {
  campaignId?: string | null;
  uiLocale?: UiLocale;
} | null;

export function resolveUiLocale(campaignId?: string | null): UiLocale {
  return campaignId === "europeana" ? "en" : "sv";
}

export function uiText(locale: UiLocale, swedish: string, english: string): string {
  return locale === "en" ? english : swedish;
}

export function formatUiNumber(value: number, locale: UiLocale): string {
  return value.toLocaleString(locale === "en" ? "en-US" : "sv-SE");
}

export function getOgLocale(locale: UiLocale): string {
  return locale === "en" ? "en_GB" : "sv_SE";
}

export function useUiLocale(): UiLocale {
  const data = useRouteLoaderData("root") as RootUiData | undefined;
  if (data?.uiLocale) return data.uiLocale;

  if (typeof document !== "undefined") {
    return document.documentElement.lang === "en" ? "en" : "sv";
  }

  return "sv";
}

export function useIsEnglishUi(): boolean {
  return useUiLocale() === "en";
}
