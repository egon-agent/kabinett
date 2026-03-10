import type { CampaignId, CampaignConfig } from "./campaign.server";
import { resolveCampaignFromHost } from "./campaign.server";

export type RequestContext = {
  museums: string[] | null;
  campaignId: CampaignId;
};

/**
 * Simple global request context.
 * Safe because Node.js is single-threaded and React Router runs all loaders
 * for a single request before moving to the next request.
 */
let currentContext: RequestContext | null = null;

export function getRequestContext(): RequestContext | undefined {
  return currentContext ?? undefined;
}

/**
 * Set campaign context for the current request based on the Host header.
 * Call from the root loader — it runs before all child loaders.
 */
export function ensureRequestContext(request: Request): CampaignConfig {
  const campaign = resolveCampaignFromHost(request.headers.get("host"));
  currentContext = {
    museums: campaign.museums,
    campaignId: campaign.id,
  };
  return campaign;
}

/**
 * Clear context after request completes. Called from entry.server.tsx.
 */
export function clearRequestContext(): void {
  currentContext = null;
}
