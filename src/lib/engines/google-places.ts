import type { Prospect } from "../types";
import { countryNameFor } from "../country-codes";
import { geocodeCity } from "../extract";
import { ExtractionError, type EngineRequest, type EngineResult } from "./engine";
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
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "nextPageToken",
].join(",");

const MAX_RESULTS_PER_PAGE = 20;
const BIAS_RADIUS_M = 25000;

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
}

interface GoogleSearchResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
}

/** Traduce los errores habituales de Google Cloud a un mensaje accionable. */
export function googleErrorMessage(status: number, raw: string): string {
  const text = raw.toLowerCase();
  if (text.includes("api_key_invalid") || text.includes("api key not valid")) {
    return "La API Key de Google no es válida. Cópiala de nuevo desde Google Cloud Console.";
  }
  if (text.includes("billing")) {
    return "Tu proyecto de Google Cloud no tiene la facturación activada (requerida por Places API).";
  }
  if (text.includes("service_disabled") || text.includes("has not been used") || text.includes("is disabled")) {
    return "Activa «Places API (New)» en tu proyecto de Google Cloud y vuelve a intentarlo.";
  }
  if (text.includes("api_key_service_blocked") || text.includes("referer") || text.includes("ip address")) {
    return "La API Key tiene restricciones que bloquean este uso. Permite «Places API (New)» y quita la restricción de sitio/IP.";
  }
  if (status === 429 || text.includes("quota")) {
    return "Se alcanzó la cuota de Google Places. Espera o aumenta el límite en Google Cloud.";
  }
  return `Google Places respondió ${status}.`;
}

export async function extractWithGooglePlaces(request: EngineRequest): Promise<EngineResult> {
  const apiKey = request.googleKey.trim();
  if (!apiKey) {
    throw new ExtractionError("missing_google_key", "Falta la API Key de Google Places.");
  }

  const geo = await geocodeCity(request.city);
  const countryCode = geo?.countryCode ?? "";
  const cityName = geo?.cityName ?? request.city;
  const countryName = countryNameFor(countryCode, geo?.countryName ?? "");
  // «dentistas en Bogotá, Colombia» evita ambigüedades entre ciudades homónimas.
  const location =
    countryName && !request.city.toLowerCase().includes(countryName.toLowerCase())
      ? `${request.city}, ${countryName}`
      : request.city;
  const query = buildQuery(request.niche || "negocios", location);

  const collected: GooglePlace[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < 6 && collected.length < request.limit; page++) {
    const body: Record<string, unknown> = {
      textQuery: query,
      languageCode: "es",
      pageSize: MAX_RESULTS_PER_PAGE,
    };
    if (countryCode) body.regionCode = countryCode;
    if (geo && geo.latitude && geo.longitude) {
      body.locationBias = {
        circle: { center: { latitude: geo.latitude, longitude: geo.longitude }, radius: BIAS_RADIUS_M },
      };
    }
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
      const detail = await response.text().catch(() => "");
      throw new ExtractionError("google_error", googleErrorMessage(response.status, detail));
    }

    const data = (await response.json().catch(() => null)) as GoogleSearchResponse | null;
    if (!data) {
      throw new ExtractionError("google_error", "Google Places devolvió una respuesta inesperada.");
    }

    for (const place of data.places ?? []) {
      const key = place.id ?? place.displayName?.text ?? "";
      if (!key || seen.has(key)) continue;
      if (place.businessStatus && place.businessStatus !== "OPERATIONAL") continue;
      seen.add(key);
      collected.push(place);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  const prospects: Prospect[] = collected.slice(0, request.limit).map((place, index) => {
    const website = normalizeWebsite(place.websiteUri ?? "");
    const phone = formatPhone(place.internationalPhoneNumber || place.nationalPhoneNumber || "", countryCode);
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
      rating: typeof place.rating === "number" ? place.rating : undefined,
      reviews: typeof place.userRatingCount === "number" ? place.userRatingCount : undefined,
    };
  });

  return {
    prospects,
    meta: { source: "Google Places API", countryCode, countryName, cityName },
  };
}

/** Comprueba la API Key con una consulta mínima. */
export async function testGooglePlacesKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(GOOGLE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey.trim(),
        "X-Goog-FieldMask": "places.id",
      },
      body: JSON.stringify({ textQuery: "cafetería en Ciudad de Panamá", pageSize: 1 }),
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) return { ok: true, message: "Conectado: Google Places API (New) responde correctamente." };
    return { ok: false, message: googleErrorMessage(res.status, await res.text().catch(() => "")) };
  } catch {
    return { ok: false, message: "No se pudo contactar a Google. Revisa tu conexión." };
  }
}
