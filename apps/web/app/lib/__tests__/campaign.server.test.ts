import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCampaignConfig } from "../campaign.server";

const originalCampaign = process.env.KABINETT_CAMPAIGN;

describe("campaign.server", () => {
  beforeEach(() => {
    delete process.env.KABINETT_CAMPAIGN;
  });

  afterEach(() => {
    if (typeof originalCampaign === "string") {
      process.env.KABINETT_CAMPAIGN = originalCampaign;
      return;
    }
    delete process.env.KABINETT_CAMPAIGN;
  });

  it("falls back to default campaign", () => {
    const campaign = getCampaignConfig();
    expect(campaign.id).toBe("default");
    expect(campaign.museumId).toBeNull();
    expect(campaign.noindex).toBe(false);
  });

  it("accepts campaign aliases", () => {
    process.env.KABINETT_CAMPAIGN = "nm";
    const campaign = getCampaignConfig();
    expect(campaign.id).toBe("nationalmuseum");
    expect(campaign.museumId).toBe("nationalmuseum");
  });

  it("enables noindex in museum campaign mode", () => {
    process.env.KABINETT_CAMPAIGN = "nordiska";
    const campaign = getCampaignConfig();
    expect(campaign.id).toBe("nordiska");
    expect(campaign.noindex).toBe(true);
  });

  it("uses default for unknown values", () => {
    process.env.KABINETT_CAMPAIGN = "foo";
    const campaign = getCampaignConfig();
    expect(campaign.id).toBe("default");
  });
});
