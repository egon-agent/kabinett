import { describe, expect, it } from "vitest";
import { normalizeArtworkCategory, parseArtist, parseArtists } from "../parsing";

describe("parseArtist", () => {
  it("returns first artist name for valid JSON", () => {
    const result = parseArtist('[{"name":"Anders Zorn"},{"name":"Carl Larsson"}]');

    expect(result).toBe("Anders Zorn");
  });

  it("returns unknown artist for null", () => {
    expect(parseArtist(null)).toBe("Okänd konstnär");
  });

  it("returns unknown artist for malformed JSON", () => {
    expect(parseArtist("{not-json")).toBe("Okänd konstnär");
  });

  it("returns unknown artist for empty array", () => {
    expect(parseArtist("[]")).toBe("Okänd konstnär");
  });

  it("filters out url-like Europeana authority values", () => {
    const result = parseArtist('[{"name":"http://viaf.org/viaf/35255759"},{"name":"Lela Stamatiou"}]');

    expect(result).toBe("Lela Stamatiou");
  });

  it("filters out machine labels such as 180_person", () => {
    const result = parseArtists('[{"name":"180_person"},{"name":"Petre Bulgăraș"}]');

    expect(result).toEqual([{ name: "Petre Bulgăraș", nationality: "", role: "" }]);
  });
});

describe("normalizeArtworkCategory", () => {
  it("hides generic Europeana categories", () => {
    expect(normalizeArtworkCategory("IMAGE")).toBe("");
  });

  it("preserves specific categories", () => {
    expect(normalizeArtworkCategory("Måleri")).toBe("Måleri");
  });
});
