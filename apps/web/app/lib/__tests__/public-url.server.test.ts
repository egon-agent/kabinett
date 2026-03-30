import { describe, expect, it } from "vitest";
import { getCanonicalUrl, getPublicOrigin } from "../public-url.server";

describe("public-url.server", () => {
  it("prefers x-forwarded headers for public origin", () => {
    const request = new Request("http://internal.fly.dev/search?q=test", {
      headers: {
        host: "internal.fly.dev",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "europeana.norrava.com",
      },
    });

    expect(getPublicOrigin(request)).toBe("https://europeana.norrava.com");
    expect(getCanonicalUrl(request)).toBe("https://europeana.norrava.com/search");
  });

  it("falls back to Forwarded header when needed", () => {
    const request = new Request("http://127.0.0.1:3000/", {
      headers: {
        forwarded: 'for=192.0.2.60;proto=https;host="nm.norrava.com"',
      },
    });

    expect(getPublicOrigin(request)).toBe("https://nm.norrava.com");
    expect(getCanonicalUrl(request)).toBe("https://nm.norrava.com/");
  });

  it("falls back to request url when no proxy headers exist", () => {
    const request = new Request("http://localhost:3000/artwork/123");

    expect(getPublicOrigin(request)).toBe("http://localhost:3000");
    expect(getCanonicalUrl(request)).toBe("http://localhost:3000/artwork/123");
  });
});

