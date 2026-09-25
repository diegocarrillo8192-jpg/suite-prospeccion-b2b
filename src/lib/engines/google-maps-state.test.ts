import { describe, expect, it } from "vitest";
import {
  buildMapsSearchUrl,
  normalizeMapsUrl,
  parseMapsEntry,
  parseMapsSearchResults,
  stripSecurityPrefix,
} from "./google-maps-state";

function buildPlaceState(): string {
  const darray: unknown[] = [];
  darray[4] = [null, null, null, null, null, null, null, 4.7, 321];
  darray[7] = ["/url?q=https://cafecentral.example/&opi=89978449"];
  darray[9] = [null, null, 8.9824, -79.5199];
  darray[10] = "0x8f6b:0x1";
  darray[11] = "Café Central";
  darray[13] = ["Cafetería", "Restaurante"];
  darray[18] = "Café Central, Calle 50, Ciudad de Panamá";
  darray[27] = "https://www.google.com/maps/place/Cafe+Central";
  darray[78] = "ChIJCafeCentral";
  darray[178] = [["+507 6000-0000"]];
  const data: unknown[] = [null, null, null, null, null, null, darray];
  return `)]}'\n${JSON.stringify(data)}`;
}

function buildSearchBody(): string {
  const business: unknown[] = [];
  business[2] = ["Calle 50", "Ciudad de Panamá", "Panamá"];
  business[4] = [null, null, null, null, null, null, null, 4.5, 1200];
  business[7] = ["https://panama-resto.example"];
  business[9] = [null, null, 8.98, -79.52];
  business[10] = "0xabc:0xdef";
  business[11] = "Restaurante Panamá";
  business[13] = ["Restaurante"];
  business[178] = [["+507 2222-3333"]];
  const item: unknown[] = [];
  item[14] = business;
  const data: unknown[] = [[null, [null, item]]];
  return `)]}'\n${JSON.stringify(data)}`;
}

describe("google-maps-state", () => {
  it("parses a place state payload into a MapsEntry", () => {
    const entry = parseMapsEntry(buildPlaceState());
    expect(entry).not.toBeNull();
    expect(entry?.name).toBe("Café Central");
    expect(entry?.category).toBe("Cafetería");
    expect(entry?.address).toBe("Calle 50, Ciudad de Panamá");
    expect(entry?.website).toBe("https://cafecentral.example/");
    expect(entry?.phone).toBe("+5076000-0000");
    expect(entry?.rating).toBeCloseTo(4.7);
    expect(entry?.reviews).toBe(321);
    expect(entry?.placeId).toBe("ChIJCafeCentral");
  });

  it("parses the search response business list", () => {
    const entries = parseMapsSearchResults(buildSearchBody());
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("Restaurante Panamá");
    expect(entries[0].category).toBe("Restaurante");
    expect(entries[0].address).toBe("Calle 50, Ciudad de Panamá, Panamá");
    expect(entries[0].website).toBe("https://panama-resto.example");
    expect(entries[0].phone).toBe("+5072222-3333");
    expect(entries[0].rating).toBeCloseTo(4.5);
    expect(entries[0].reviews).toBe(1200);
  });

  it("strips the JSON security prefix", () => {
    expect(stripSecurityPrefix(")]}'\n{\"a\":1}")).toBe('{"a":1}');
    expect(stripSecurityPrefix('{"a":1}')).toBe('{"a":1}');
  });

  it("normalizes google redirect urls", () => {
    expect(normalizeMapsUrl("/url?q=https://example.com/&opi=1")).toBe("https://example.com/");
    expect(normalizeMapsUrl("https://example.com")).toBe("https://example.com");
  });

  it("builds a maps search url with pb params", () => {
    const url = buildMapsSearchUrl("cafés en Panamá", {
      latitude: 8.98,
      longitude: -79.52,
      zoom: 14,
    });
    expect(url).toContain("maps.google.com/search");
    expect(url).toContain("tbm=map");
    expect(url).toContain("pb=");
    expect(url).toContain("q=caf");
  });
});
