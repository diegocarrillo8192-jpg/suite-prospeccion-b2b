import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prospect } from "./types";

vi.mock("./enricher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./enricher")>();
  return {
    ...actual,
    enrichProspect: vi.fn(async () => ({
      emails: ["info@example.com", "ventas@example.com"],
      bestEmail: "info@example.com",
      social: {
        instagram: "https://instagram.com/example",
        whatsapp: "https://wa.me/50760000000",
      },
      phoneDisplay: "+507 6000-0000",
      phoneDigits: "50760000000",
      validation: {
        email: "info@example.com",
        domain: "example.com",
        status: "valid" as const,
        label: "Válido",
        reason: "ok",
        hasMx: true,
        disposable: false,
        catchAll: false,
        mxRecords: ["mx.example.com"],
      },
      pagesScanned: 1,
      enriched: true,
      tech: { detected: [], ssl: true, server: null, analyzed: true, opportunity: null },
    })),
  };
});

import {
  apiEngineFor,
  crawlDeepContacts,
  hasApiCredentials,
  resolveHybridMode,
} from "./hybrid-scraper";

function makeProspect(partial: Partial<Prospect> = {}): Prospect {
  return {
    id: "p1",
    nombre: "",
    empresa: "Example",
    correo: "No disponible",
    telefono: "No disponible",
    whatsapp: "",
    direccion: "Calle 1",
    website: "https://example.com",
    ciudad: "Panamá",
    rubro: "Restaurante",
    ...partial,
  };
}

describe("hybrid-scraper mode resolution", () => {
  it("falls back to local when no API keys are configured", () => {
    expect(hasApiCredentials({})).toBe(false);
    expect(hasApiCredentials({ googleKey: "   " })).toBe(false);
    expect(resolveHybridMode("free", {})).toBe("local");
    expect(resolveHybridMode("apify", {})).toBe("local");
    expect(resolveHybridMode("google", {})).toBe("local");
  });

  it("uses API mode only when the matching key exists", () => {
    expect(hasApiCredentials({ apifyToken: "apify_api_x" })).toBe(true);
    expect(resolveHybridMode("apify", { apifyToken: "apify_api_x" })).toBe("api");
    expect(resolveHybridMode("google", { apifyToken: "apify_api_x" })).toBe("local");
    expect(resolveHybridMode("google", { googleKey: "AIza" })).toBe("api");
  });

  it("picks the best available api engine", () => {
    expect(apiEngineFor("google", { googleKey: "AIza" })).toBe("google");
    expect(apiEngineFor("apify", { apifyToken: "apify_api_x" })).toBe("apify");
    expect(apiEngineFor("google", { apifyToken: "apify_api_x" })).toBe("apify");
    expect(apiEngineFor("free", {})).toBe("free");
  });
});

describe("crawlDeepContacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enriches only prospects with a website", async () => {
    const input = [
      makeProspect({ id: "a", website: "https://a.example" }),
      makeProspect({ id: "b", website: "" }),
    ];

    const output = await crawlDeepContacts(input, { countryCode: "PA", limit: 5, concurrency: 2 });

    expect(output[0].correo).toBe("info@example.com");
    expect(output[0].emails).toEqual(["info@example.com", "ventas@example.com"]);
    expect(output[0].social?.instagram).toBe("https://instagram.com/example");
    expect(output[0].whatsapp).toBe("50760000000");
    expect(output[0].telefono).toBe("+507 6000-0000");
    expect(output[0].emailStatus).toBe("valid");
    expect(output[0].enriched).toBe(true);
    expect(output[1].correo).toBe("No disponible");
    expect(output[1].enriched).toBeUndefined();
  });

  it("returns the original array when no prospect has a website", async () => {
    const input = [makeProspect({ id: "a", website: "" })];
    const output = await crawlDeepContacts(input, {});
    expect(output).toEqual(input);
  });
});
