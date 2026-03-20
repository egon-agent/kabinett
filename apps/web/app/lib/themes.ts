import type { ThemeCardSection } from "../components/ThemeCard";
import type { CampaignId } from "./campaign.server";

// Universal themes that work well across all collections
const UNIVERSAL_THEMES: ThemeCardSection[] = [
  { title: "Porträtt", titleEn: "Portraits", subtitle: "Ansikten genom tiderna", subtitleEn: "Faces through time", filter: "Porträtt", queryEn: "portrait", color: "#2E2620", searchType: "visual", items: [] },
  { title: "I rött", titleEn: "In red", subtitle: "Passion och drama", subtitleEn: "Passion and drama", filter: "Rött", queryEn: "red", color: "#3A1A1A", searchType: "visual", items: [] },
  { title: "Djur i konsten", titleEn: "Animals in art", subtitle: "Från hästar till hundar", subtitleEn: "From horses to hounds", filter: "Djur", queryEn: "animals", color: "#2D3A2D", searchType: "visual", items: [] },
  { title: "Blommor", titleEn: "Flowers", subtitle: "Natur i närbild", subtitleEn: "Nature up close", filter: "Blommor", queryEn: "flowers", color: "#2A2D1A", searchType: "visual", items: [] },
  { title: "I blått", titleEn: "In blue", subtitle: "Melankoli och hav", subtitleEn: "Melancholy and sea", filter: "Blått", queryEn: "blue", color: "#1A1A2E", searchType: "visual", items: [] },
];

// Campaign-specific highlight themes (strong visual results per collection)
const NM_THEMES: ThemeCardSection[] = [
  { title: "Havslandskap", titleEn: "Seascapes", subtitle: "Vatten, kust och hav", subtitleEn: "Water, coast and sea", filter: "Havet", queryEn: "sea", color: "#1A2A3A", searchType: "visual", items: [] },
  { title: "Nattscener", titleEn: "Night scenes", subtitle: "Mörker och mystik", subtitleEn: "Darkness and mystery", filter: "Natt", queryEn: "night", color: "#0F0F1A", searchType: "visual", items: [] },
  { title: "Skulptur", titleEn: "Sculpture", subtitle: "Form i tre dimensioner", subtitleEn: "Form in three dimensions", filter: "Skulptur", queryEn: "sculpture", color: "#222222", searchType: "visual", items: [] },
  { title: "1800-talet", titleEn: "The 19th century", subtitle: "Romantik och realism", subtitleEn: "Romanticism and realism", filter: "1800-tal", queryEn: "19th century", color: "#2A2520", searchType: "all", items: [] },
  { title: "1700-talet", titleEn: "The 18th century", subtitle: "Rokoko och upplysning", subtitleEn: "Rococo and enlightenment", filter: "1700-tal", queryEn: "18th century", color: "#28261E", searchType: "all", items: [] },
];

const NORDISKA_THEMES: ThemeCardSection[] = [
  { title: "Samiska spår", subtitle: "Duodji, dräkter och vardagsliv", filter: "samisk", color: "#241A16", searchType: "visual", items: [] },
  { title: "Folkdräkter", subtitle: "Traditioner i tyg", filter: "Folkdräkt", color: "#2A1F1A", searchType: "visual", items: [] },
  { title: "Stockholm i svartvitt", subtitle: "Huvudstaden genom kameran", filter: "Stockholm svartvitt", color: "#1A1D24", searchType: "all", items: [] },
  { title: "Vintermotiv", subtitle: "Snö, is och kyla", filter: "Vinter snö", color: "#1E2530", searchType: "visual", items: [] },
  { title: "Barndom", subtitle: "Lek och vardag", filter: "Barn leker", color: "#2D2A1A", searchType: "visual", items: [] },
  { title: "Mode", subtitle: "Från NK till haute couture", filter: "Mode klänning", color: "#2A1A2A", searchType: "visual", items: [] },
];

const SHM_THEMES: ThemeCardSection[] = [
  { title: "Guld och silver", subtitle: "Skatter och smycken", filter: "Guld silver smycke", color: "#2A2518", searchType: "visual", items: [] },
  { title: "Runstenar", subtitle: "Berättelser i sten", filter: "Runsten", color: "#1C1E1A", searchType: "visual", items: [] },
  { title: "Rustningar", subtitle: "Från tornerspel till krig", filter: "Rustning harnesk", color: "#1F1A14", searchType: "visual", items: [] },
  { title: "Kungligt", subtitle: "Kronor, tronföljd och makt", filter: "Kung krona kunglig", color: "#28201A", searchType: "all", items: [] },
  { title: "Medeltid", subtitle: "Tro, makt och hantverk", filter: "Medeltid kyrka", color: "#1E1E20", searchType: "all", items: [] },
];

const SAFE_TEXT_THEMES: ThemeCardSection[] = [
  UNIVERSAL_THEMES[0],
  UNIVERSAL_THEMES[2],
  UNIVERSAL_THEMES[3],
];

// Max 5 themes per campaign — universal first, then highlights to fill
const MAX_THEMES = 5;

const CAMPAIGN_THEMES: Record<CampaignId, ThemeCardSection[]> = {
  default: [...UNIVERSAL_THEMES.slice(0, 2), ...NM_THEMES.slice(0, 3)],
  europeana: [...SAFE_TEXT_THEMES, NM_THEMES[0], NM_THEMES[3]].slice(0, MAX_THEMES),
  nationalmuseum: [...UNIVERSAL_THEMES.slice(0, 2), ...NM_THEMES.slice(0, 3)],
  nordiska: [...SAFE_TEXT_THEMES, NM_THEMES[1], NM_THEMES[3]].slice(0, MAX_THEMES),
  shm: [...SAFE_TEXT_THEMES, NM_THEMES[4], NM_THEMES[3]].slice(0, MAX_THEMES),
};

/** @deprecated Use getThemes(campaignId) instead */
export const THEMES = CAMPAIGN_THEMES.default;

export function getThemes(campaignId: CampaignId = "default"): ThemeCardSection[] {
  return CAMPAIGN_THEMES[campaignId] || CAMPAIGN_THEMES.default;
}
