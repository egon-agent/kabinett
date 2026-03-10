export type CampaignId = "default" | "nationalmuseum" | "nordiska" | "shm";

export type CampaignConfig = {
  id: CampaignId;
  museumId: string | null;
  museumName: string | null;
  heroSubline: string;
  heroIntro: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  noindex: boolean;
};

type CampaignBase = Omit<CampaignConfig, "id">;

const DEFAULT_HERO_SUBLINE = "Sök på vad som helst.";

const CAMPAIGNS: Record<CampaignId, CampaignBase> = {
  default: {
    museumId: null,
    museumName: null,
    heroSubline: DEFAULT_HERO_SUBLINE,
    heroIntro: null,
    metaTitle: null,
    metaDescription: null,
    noindex: false,
  },
  nationalmuseum: {
    museumId: "nationalmuseum",
    museumName: "Nationalmuseum",
    heroSubline: "Utforska samlingen med semantisk sökning.",
    heroIntro: "Det här läget visar endast verk från Nationalmuseum.",
    metaTitle: "Kabinett × Nationalmuseum",
    metaDescription: "Utforska verk från Nationalmuseum i Kabinett.",
    noindex: true,
  },
  nordiska: {
    museumId: "nordiska",
    museumName: "Nordiska museet",
    heroSubline: "Utforska samlingen med semantisk sökning.",
    heroIntro: "Det här läget visar endast verk från Nordiska museet.",
    metaTitle: "Kabinett × Nordiska museet",
    metaDescription: "Utforska verk från Nordiska museet i Kabinett.",
    noindex: true,
  },
  shm: {
    museumId: "shm",
    museumName: "Statens historiska museer",
    heroSubline: "Utforska samlingen med semantisk sökning.",
    heroIntro: "Det här läget visar endast verk från Statens historiska museer.",
    metaTitle: "Kabinett × Statens historiska museer",
    metaDescription: "Utforska verk från Statens historiska museer i Kabinett.",
    noindex: true,
  },
};

const ALIASES: Record<string, CampaignId> = {
  default: "default",
  multi: "default",
  all: "default",
  nm: "nationalmuseum",
  nationalmuseum: "nationalmuseum",
  nordiska: "nordiska",
  shm: "shm",
};

function parseCampaignId(value: string | undefined): CampaignId {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "default";
  return ALIASES[normalized] || "default";
}

export function getCampaignConfig(): CampaignConfig {
  const id = parseCampaignId(process.env.KABINETT_CAMPAIGN);
  return { id, ...CAMPAIGNS[id] };
}
