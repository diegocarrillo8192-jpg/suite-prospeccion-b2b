import type { Prospect } from "../types";
import { countryNameFor } from "../country-codes";
import { geocodeCity } from "../extract";
import {
  ExtractionError,
  type EngineRequest,
  type EngineResult,
} from "./engine";
import { buildQuery, formatPhone, makeId, normalizeWebsite } from "./shared";

const APIFY_BASE = "https://api.apify.com/v2/acts";
const DEFAULT_ACTOR = "compass/crawler-google-places";

interface ApifyPlace {
  title?: string;
  website?: string;
  phone?: string;
  emails?: string[];
  address?: string;
  city?: string;
  countryCode?: string;
  categoryName?: string;
  totalScore?: number;
  reviewsCount?: number;
  url?: string;
}

function actorPath(actor: string): string {
  const normalized = (actor.trim() || DEFAULT_ACTOR).replace(/\//g, "~");
  return encodeURIComponent(normalized);
}

function pickEmail(place: ApifyPlace): string {
  const emails = Array.isArray(place.emails) ? place.emails : [];
  const valid = emails.filter((email) => typeof email === "string" && email.includes("@"));
  const preferred = ["contacto", "contact", "info", "ventas", "hola", "admin", "hello"];
  for (const prefix of preferred) {
    const hit = valid.find((email) => email.toLowerCase().startsWith(prefix));
    if (hit) return hit;
  }
  return valid[0] ?? "";
}

export async function extractWithApify(request: EngineRequest): Promise<EngineResult> {
  const token = request.apifyToken.trim();
  if (!token) {
    throw new ExtractionError("missing_apify_key", "Falta la API Key de Apify.");
  }

  const geo = await geocodeCity(request.city);
  const countryCode = geo?.countryCode ?? "";
  const cityName = geo?.cityName ?? request.city;
  const query = buildQuery(request.niche || "negocios", request.city);

  const endpoint = `${APIFY_BASE}/${actorPath(request.apifyActor)}/run-sync-get-dataset-items?token=${encodeURIComponent(
    token
  )}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [query],
        maxCrawledPlacesPerSearch: request.limit,
        language: "es",
        skipClosedPlaces: true,
        maxReviews: 0,
        maxImages: 0,
      }),
      signal: AbortSignal.timeout(55000),
    });
  } catch {
    throw new ExtractionError("apify_unreachable", "No se pudo contactar a Apify.");
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new ExtractionError(
      "apify_error",
      `Apify respondió ${response.status}${detail ? `: ${detail}` : ""}`
    );
  }

  const items = (await response.json().catch(() => null)) as ApifyPlace[] | null;
  if (!Array.isArray(items)) {
    throw new ExtractionError("apify_error", "Apify devolvió una respuesta inesperada.");
  }

  const prospects: Prospect[] = items.slice(0, request.limit).map((place, index) => {
    const website = normalizeWebsite(place.website ?? "");
    const phone = formatPhone(place.phone ?? "", countryCode || place.countryCode || "");
    const email = pickEmail(place);
    return {
      id: makeId(place.title ?? "", website, place.url ?? "", index),
      nombre: "",
      empresa: (place.title ?? "").trim() || "Sin nombre",
      correo: email || "No disponible",
      telefono: phone.display || "No disponible",
      whatsapp: phone.digits,
      direccion: (place.address ?? "").trim() || place.city || cityName,
      website,
      ciudad: place.city || cityName,
      rubro: place.categoryName || request.niche.trim() || "negocios",
      rating: typeof place.totalScore === "number" ? place.totalScore : undefined,
      reviews: typeof place.reviewsCount === "number" ? place.reviewsCount : undefined,
    };
  });

  return {
    prospects,
    meta: {
      source: "Apify (Google Maps Scraper)",
      countryCode: countryCode || (items[0]?.countryCode ?? ""),
      countryName: countryNameFor(countryCode, geo?.countryName ?? ""),
      cityName,
    },
  };
}
