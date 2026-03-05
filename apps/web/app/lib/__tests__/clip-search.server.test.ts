import { describe, expect, it } from "vitest";
import { CLIP_TEXT_MODEL } from "../clip-search.server";

describe("clip text model", () => {
  it("uses the same CLIP checkpoint family as image embeddings", () => {
    expect(CLIP_TEXT_MODEL).toBe("Xenova/clip-vit-base-patch32");
  });
});
