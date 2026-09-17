import type { Prospect } from "../types";
import { countryNameFor } from "../country-codes";
import { geocodeCity } from "../extract";
import {
  ExtractionError,
  type EngineRequest,
  type EngineResult,
} from "./engine";
import { buildQuery, formatPhone, makeId, normalizeWebsite } from "./shared";

const GOOGLE_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.primaryTypeDisplayName",
  "nextPageToken",
].join(",");

const MAX_RESULTS_PER_PAGE = 20;

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  primaryTypeDisplayName?: { text?: string };
}

interface GoogleSearchResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
}

export async function extractWithGooglePlaces(request: EngineRequest): Promise<EngineResult> {
  const apiKey = request.googleKey.trim();
  if (!apiKey) {
    throw new ExtractionError("missing_google_key", "Falta la API Key de Google Places.");
  }

  const geo = await geocodeCity(request.city);
  const countryCode = geo?.countryCode ?? "";
  const cityName = geo?.cityName ?? request.city;
  const query = buildQuery(request.niche || "negocios", request.city);

  const collected: GooglePlace[] = [];
  let pageToken: string | undefined;

  while (collected.length < request.limit) {
    const body: Record<string, unknown> = {
      textQuery: query,
      languageCode: "es",
      maxResultCount: Math.min(request.limit - collected.length, MAX_RESULTS_PER_PAGE),
    };
    if (pageToken) body.pageToken = pageToken;

    let response: Response;
    try {
      response = await fetch(GOOGLE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new ExtractionError("google_unreachable", "No se pudo contactar a Google Places.");
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new ExtractionError(
        "google_error",
        `Google Places respondió ${response.status}${detail ? `: ${detail}` : ""}`
      );
    }

    const data = (await response.json().catch(() => null)) as GoogleSearchResponse | null;
    if (!data) {
      throw new ExtractionError("google_error", "Google Places devolvió una respuesta inesperada.");
    }

    collected.push(...(data.places ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  const prospects: Prospect[] = collected.slice(0, request.limit).map((place, index) => {
    const website = normalizeWebsite(place.websiteUri ?? "");
    const phone = formatPhone(
      place.internationalPhoneNumber || place.nationalPhoneNumber || "",
      countryCode
    );
    return {
      id: makeId(place.id ?? "", place.displayName?.text ?? "", website, index),
      nombre: "",
      empresa: (place.displayName?.text ?? "").trim() || "Sin nombre",
      correo: "No disponible",
      telefono: phone.display || "No disponible",
      whatsapp: phone.digits,
      direccion: (place.formattedAddress ?? "").trim() || cityName,
      website,
      ciudad: cityName,
      rubro: place.primaryTypeDisplayName?.text || request.niche.trim() || "negocios",
    };
  });

  return {
    prospects,
    meta: {
      source: "Google Places API",
      countryCode,
      countryName: countryNameFor(countryCode, geo?.countryName ?? ""),
      cityName,
    },
  };
}
