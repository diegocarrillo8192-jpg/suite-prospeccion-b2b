import type { Prospect } from "../types";
import { countryNameFor } from "../country-codes";
import { geocodeCity } from "../extract";
import { ExtractionError, type EngineRequest, type EngineResult } from "./engine";
import { formatPhone, makeId, normalizeWebsite } from "./shared";

const APIFY_API = "https://api.apify.com/v2";
const DEFAULT_ACTOR = "compass/crawler-google-places";
/** Tiempo máximo esperando al actor antes de devolver lo que ya extrajo. */
const RUN_DEADLINE_MS = 95000;

interface ApifyPlace {
  title?: string;
  website?: string;
  phone?: string;
  phoneUnformatted?: string;
  emails?: string[];
  address?: string;
  city?: string;
  countryCode?: string;
  categoryName?: string;
  totalScore?: number;
  reviewsCount?: number;
  url?: string;
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
  instagrams?: string[];
  facebooks?: string[];
  linkedIns?: string[];
}

interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string;
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

/** Mensaje claro para los códigos de error típicos de Apify. */
export function apifyErrorMessage(status: number, raw: string): string {
  const text = raw.toLowerCase();
  if (status === 401 || text.includes("user-or-token-not-found") || text.includes("invalid token")) {
    return "El token de Apify no es válido. Cópialo de Apify Console › Settings › API & Integrations.";
  }
  if (status === 402 || text.includes("not-enough-usage") || text.includes("credit")) {
    return "Tu cuenta de Apify no tiene créditos suficientes para ejecutar el actor.";
  }
  if (status === 404 || text.includes("actor-not-found") || text.includes("record-not-found")) {
    return "No se encontró el actor de Apify configurado. Revisa el nombre (usuario/actor).";
  }
  if (status === 429) return "Apify limitó las solicitudes. Espera un momento e intenta de nuevo.";
  return `Apify respondió ${status}.`;
}

async function apifyFetch(path: string, token: string, init?: RequestInit, timeoutMs = 20000): Promise<Response> {
  return fetch(`${APIFY_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function extractWithApify(request: EngineRequest): Promise<EngineResult> {
  const token = request.apifyToken.trim();
  if (!token) {
    throw new ExtractionError("missing_apify_key", "Falta la API Key de Apify.");
  }

  const geo = await geocodeCity(request.city);
  const countryCode = geo?.countryCode ?? "";
  const cityName = geo?.cityName ?? request.city;
  const countryName = countryNameFor(countryCode, geo?.countryName ?? "");
  const locationQuery =
    countryName && !request.city.toLowerCase().includes(countryName.toLowerCase())
      ? `${request.city}, ${countryName}`
      : request.city;

  // 1) Lanza el actor de forma asíncrona (sin el límite de 60 s de run-sync).
  let run: ApifyRun;
  try {
    const res = await apifyFetch(`/acts/${actorPath(request.apifyActor)}/runs`, token, {
      method: "POST",
      body: JSON.stringify({
        searchStringsArray: [request.niche.trim() || "negocios"],
        locationQuery,
        maxCrawledPlacesPerSearch: request.limit,
        language: "es",
        countryCode: countryCode ? countryCode.toLowerCase() : undefined,
        skipClosedPlaces: true,
        maxReviews: 0,
        maxImages: 0,
        scrapeContacts: false,
      }),
    });
    if (!res.ok) {
      throw new ExtractionError("apify_error", apifyErrorMessage(res.status, await res.text().catch(() => "")));
    }
    const data = (await res.json()) as { data?: ApifyRun };
    if (!data.data?.id) throw new ExtractionError("apify_error", "Apify no devolvió el identificador de la ejecución.");
    run = data.data;
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError("apify_unreachable", "No se pudo contactar a Apify.");
  }

  // 2) Espera a que termine (long-polling) o hasta el plazo máximo.
  const deadline = Date.now() + RUN_DEADLINE_MS;
  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status) && Date.now() < deadline) {
    const wait = Math.max(1, Math.min(30, Math.floor((deadline - Date.now()) / 1000)));
    try {
      const res = await apifyFetch(`/actor-runs/${run.id}?waitForFinish=${wait}`, token, undefined, (wait + 10) * 1000);
      if (res.ok) {
        const data = (await res.json()) as { data?: ApifyRun };
        if (data.data) run = data.data;
      }
    } catch {
      // reintenta hasta el plazo
    }
  }
  if (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) {
    // Detiene el actor para no consumir créditos y usa los resultados parciales.
    await apifyFetch(`/actor-runs/${run.id}/abort`, token, { method: "POST" }).catch(() => undefined);
  }
  if (run.status === "FAILED") {
    throw new ExtractionError("apify_error", "La ejecución del actor de Apify falló. Revisa el registro en Apify Console.");
  }

  // 3) Descarga el dataset.
  let items: ApifyPlace[] = [];
  try {
    const res = await apifyFetch(
      `/datasets/${run.defaultDatasetId}/items?clean=true&format=json&limit=${request.limit}`,
      token,
      undefined,
      30000
    );
    if (res.ok) {
      const data = (await res.json()) as unknown;
      if (Array.isArray(data)) items = data as ApifyPlace[];
    }
  } catch {
    // dataset no disponible
  }

  const prospects: Prospect[] = items
    .filter((place) => !place.permanentlyClosed)
    .slice(0, request.limit)
    .map((place, index) => {
      const website = normalizeWebsite(place.website ?? "");
      const phone = formatPhone(place.phone || place.phoneUnformatted || "", countryCode || place.countryCode || "");
      const email = pickEmail(place);
      const social: Prospect["social"] = {};
      if (place.instagrams?.[0]) social.instagram = place.instagrams[0];
      if (place.facebooks?.[0]) social.facebook = place.facebooks[0];
      if (place.linkedIns?.[0]) social.linkedin = place.linkedIns[0];
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
        social: Object.keys(social).length ? social : undefined,
      };
    });

  return {
    prospects,
    meta: {
      source: "Apify (Google Maps Scraper)",
      countryCode: countryCode || (items[0]?.countryCode ?? "").toUpperCase(),
      countryName,
      cityName,
    },
  };
}

/** Verifica el token consultando la cuenta. */
export async function testApifyToken(token: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await apifyFetch("/users/me", token.trim(), undefined, 12000);
    if (!res.ok) return { ok: false, message: apifyErrorMessage(res.status, await res.text().catch(() => "")) };
    const data = (await res.json()) as { data?: { username?: string; plan?: { id?: string } } };
    const user = data.data?.username ? ` como ${data.data.username}` : "";
    const plan = data.data?.plan?.id ? ` · plan ${data.data.plan.id}` : "";
    return { ok: true, message: `Conectado a Apify${user}${plan}.` };
  } catch {
    return { ok: false, message: "No se pudo contactar a Apify. Revisa tu conexión." };
  }
}
