import { AsyncLocalStorage } from "node:async_hooks";

import type { CampaignId } from "./campaign.server";

export type RequestContext = {
  museums: string[] | null;
  campaignId: CampaignId;
};

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}
