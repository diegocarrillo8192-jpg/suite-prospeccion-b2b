import type { Prospect } from "../types";
import type { GeoLocation } from "../extract";
import { formatPhone, makeId, normalizeWebsite } from "./shared";

const USER_AGENT = "SuiteProspeccionB2B/1.0 (contacto: diegocarrillo8192@gmail.com)";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

interface OverpassElement {
  type?: string;
  id?: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

interface NicheRule {
  test: RegExp;
  filters: string[];
}

const NICHE_RULES: NicheRule[] = [
  {
    test: /restauran|gastronom|comida|marisqu|pizzer|pizza|sushi|parrilla|asador|cafeter|caf[eé]|bar\b|cervez|cantina|pupus|fonda|panader|pasteler|helader|dulcer|comida r[aá]pida/i,
    filters: ['["amenity"~"^(restaurant|cafe|fast_food|bar|pub|biergarten|ice_cream|food_court)$"]'],
  },
  {
    test: /taller|mec[aá]nic|automotriz|autos?\b|carro|veh[ií]cul|llanta|repues|carrocer/i,
    filters: ['["shop"~"^(car_repair|car_parts|tyres|motorcycle_repair)$"]'],
  },
  {
    test: /odont[oó]log|dentist|dental/i,
    filters: [
      '["amenity"="dentist"]',
      '["healthcare"~"^(dentist|dental)$"]',
      '["office"="dentist"]',
    ],
  },
  {
    test: /cl[ií]nic|m[eé]dic|salud|hospital|consultori|fisioterap|psic[oó]log|laboratorio/i,
    filters: [
      '["amenity"~"^(clinic|doctors|hospital|physiotherapist|veterinary)$"]',
      '["healthcare"~"^(clinic|doctor|hospital)$"]',
    ],
  },
  {
    test: /farmac|pharmac|droguer|botica/i,
    filters: ['["amenity"="pharmacy"]'],
  },
  {
    test: /veterinari|veterinar/i,
    filters: ['["amenity"="veterinary"]'],
  },
  {
    test: /hotel|hostal|hosteler|posada|motel|apartahotel/i,
    filters: ['["tourism"~"^(hotel|motel|guest_house|hostel|apartment|chalet)$"]'],
  },
  {
    test: /abogad|jur[ií]dic|lawyer|legal|notar[ií]a/i,
    filters: ['["office"~"^(lawyer|notary)$"]'],
  },
  {
    test: /contador|contable|accountant|contabilidad|auditor/i,
    filters: ['["office"~"^(accountant|tax_advisor)$"]'],
  },
  {
    test: /inmobiliar|real estate|propiedad|bienes ra[ií]ces/i,
    filters: ['["office"~"^(estate_agent|property_management)$"]'],
  },
  {
    test: /peluquer|barber|est[eé]tica|sal[oó]n de belleza|beauty|spa\b|u[nñ]as|manicur/i,
    filters: ['["shop"~"^(hairdresser|beauty|nail_salon)$"]'],
  },
  {
    test: /gimnasio|gym|fitness|crossfit|deportiv|spinning|yoga/i,
    filters: ['["leisure"~"^(fitness_centre|sports_centre|pitch|dance)$"]'],
  },
  {
    test: /supermerc|supermarket|abarrot|minimarket|mercado|colmado|tienda de barrio/i,
    filters: ['["shop"~"^(supermarket|convenience|grocery|greengrocer|general)$"]'],
  },
  {
    test: /ferreter|hardware|construcci|materiales/i,
    filters: ['["shop"~"^(hardware|doityourself|trade|building_materials|paint)$"]'],
  },
  {
    test: /[oó]ptic|optical|optica|optometr/i,
    filters: ['["shop"~"^(optician|hearing_aids)$"]'],
  },
  {
    test: /joyer|jewel|relojer|orfebre|plater/i,
    filters: ['["shop"~"^(jewelry|watches|goldsmith)$"]'],
  },
  {
    test: /florister|florist|flores/i,
    filters: ['["shop"="florist"]'],
  },
  {
    test: /zapater|calzado|shoe/i,
    filters: ['["shop"~"^(shoes|shoe)$"]'],
  },
  {
    test: /ropa|moda|boutique|clothing|bordad|sastrer/i,
    filters: ['["shop"~"^(clothes|boutique|fashion|tailor|fabric)$"]'],
  },
  {
    test: /librer|bookstore|papeler|imprenta/i,
    filters: ['["shop"~"^(books|stationery|copyshop)$"]'],
  },
  {
    test: /software|inform[aá]tic|tecnolog|marketing|publicit|dise[nñ]o web|agencia|consultor|desarrollo/i,
    filters: ['["office"~"^(it|advertising_agency|consulting|company)$"]'],
  },
  {
    test: /constructora|carpinter|electricista|plomer|fontaner|alba[nñ]il|pintor|arquitect/i,
    filters: ['["craft"~"^(carpenter|electrician|plumber|hvac|roofer|painter|builder|architect)$"]'],
  },
  {
    test: /colegio|escuela|academ|universidad|educaci|idiomas|instituto/i,
    filters: ['["amenity"~"^(school|college|university|language_school|driving_school|music_school)$"]'],
  },
  {
    test: /banco|financier|fintech|cooperativa|seguros|asegurador/i,
    filters: ['["amenity"="bank"]'],
  },
  {
    test: /transporte|log[ií]stica|flete|carga|env[ií]o|paqueter|mudanza/i,
    filters: ['["office"~"^(logistics|moving_company|transport)$"]'],
  },
  {
    test: /concesionario|automotriz|veh[ií]culos|autos usados|dealership/i,
    filters: ['["shop"~"^(car|motorcycle|truck)$"]'],
  },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function filterForNiche(niche: string): string[] {
  const topic = niche.trim();
  for (const rule of NICHE_RULES) {
    if (rule.test.test(topic)) return rule.filters;
  }
  return [`["name"~"${escapeRegex(topic)}",i]`];
}

function buildOverpassQuery(filters: string[], radius: number, geo: GeoLocation, outCount: number): string {
  const around = `(around:${radius},${geo.latitude},${geo.longitude})`;
  const lines = filters.map((filter) => `  nwr${filter}${around};`);
  return [
    "[out:json][timeout:25];",
    "(",
    ...lines,
    ");",
    `out tags ${outCount};`,
  ].join("\n");
}

async function runOverpassQuery(query: string, signal?: AbortSignal): Promise<OverpassElement[]> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (signal?.aborted) {
        controller.abort();
      } else {
        signal?.addEventListener("abort", abort, { once: true });
      }
      const timer = setTimeout(() => controller.abort(), 25000);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "User-Agent": USER_AGENT,
          },
          body: new URLSearchParams({ data: query }).toString(),
          signal: controller.signal,
        });
        if (!res.ok) continue;
        const data = (await res.json().catch(() => null)) as OverpassResponse | null;
        const elements = data?.elements;
        if (Array.isArray(elements) && elements.length > 0) return elements;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    } catch {
      continue;
    }
  }
  return [];
}

function categoryOf(tags: Record<string, string>): string {
  const keys = ["amenity", "shop", "office", "healthcare", "craft", "tourism", "leisure"];
  for (const key of keys) {
    const value = tags[key];
    if (value) {
      const label = value.replace(/_/g, " ");
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
  }
  return "";
}

function firstValue(tags: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = tags[key];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

function scoreProspect(prospect: Prospect): number {
  let score = 0;
  if (prospect.website) score += 2;
  if (prospect.telefono && prospect.telefono !== "No disponible") score += 2;
  if (prospect.correo && prospect.correo !== "No disponible") score += 1;
  if (prospect.social && Object.keys(prospect.social).length > 0) score += 1;
  return score;
}

function toProspects(
  elements: OverpassElement[],
  geo: GeoLocation,
  topic: string,
  limit: number
): Prospect[] {
  const out: Prospect[] = [];
  const seen = new Set<string>();

  for (const element of elements) {
    const tags = element.tags;
    if (!tags) continue;
    const name = (tags.name || tags.operator || tags.brand || "").trim();
    if (!name) continue;
    const nameKey = name.toLowerCase();
    if (seen.has(nameKey)) continue;
    seen.add(nameKey);

    const website = normalizeWebsite(
      firstValue(tags, ["website", "contact:website", "url", "contact:url"])
    );
    const rawPhone = firstValue(tags, [
      "phone",
      "contact:phone",
      "contact:mobile",
      "mobile",
      "contact:whatsapp",
    ]);
    const email = firstValue(tags, ["email", "contact:email"]).toLowerCase();
    const phone = rawPhone ? formatPhone(rawPhone, geo.countryCode) : { display: "", digits: "" };

    if (!phone.display && !website && !email) continue;

    const addressParts = [
      tags["addr:full"],
      tags["addr:street"],
      tags["addr:housenumber"],
      tags["addr:district"],
      tags["addr:city"],
      tags["addr:postcode"],
    ]
      .map((value) => (value || "").trim())
      .filter(Boolean);
    const uniqueParts = Array.from(new Set(addressParts));
    const address = uniqueParts.length ? uniqueParts.join(", ") : geo.cityName;

    const social: Prospect["social"] = {};
    if (tags["contact:facebook"]) social.facebook = tags["contact:facebook"];
    const whatsappTag = firstValue(tags, ["contact:whatsapp", "whatsapp"]);
    if (whatsappTag && phone.digits) social.whatsapp = `https://wa.me/${phone.digits}`;

    out.push({
      id: makeId(name, website, `osm-${element.type ?? "n"}-${element.id ?? ""}`, email, phone.digits),
      nombre: "",
      empresa: name,
      correo: email || "No disponible",
      telefono: phone.display || "No disponible",
      whatsapp: phone.digits,
      direccion: address,
      website,
      ciudad: geo.cityName,
      rubro: categoryOf(tags) || topic,
      emails: email ? [email] : undefined,
      social: Object.keys(social).length ? social : undefined,
      enriched: true,
    });
  }

  return out
    .sort((a, b) => scoreProspect(b) - scoreProspect(a))
    .slice(0, limit);
}

export async function extractOverpass(
  geo: GeoLocation,
  niche: string,
  limit: number,
  signal?: AbortSignal
): Promise<Prospect[]> {
  if (!geo.latitude || !geo.longitude) return [];

  const topic = niche.trim() || "negocios";
  const filters = filterForNiche(topic);
  const outCount = Math.min(Math.max(limit * 5, 100), 400);

  const seen = new Set<string>();
  const collected: Prospect[] = [];

  const collect = (prospects: Prospect[]) => {
    for (const prospect of prospects) {
      if (seen.has(prospect.id)) continue;
      seen.add(prospect.id);
      collected.push(prospect);
    }
  };

  collect(await runOverpassRadius(filters, 12000, geo, topic, outCount, limit, signal));
  if (collected.length < limit) {
    collect(await runOverpassRadius(filters, 6000, geo, topic, outCount, limit, signal));
  }

  return collected.slice(0, limit);
}

async function runOverpassRadius(
  filters: string[],
  radius: number,
  geo: GeoLocation,
  topic: string,
  outCount: number,
  limit: number,
  signal?: AbortSignal
): Promise<Prospect[]> {
  const query = buildOverpassQuery(filters, radius, geo, outCount);
  const elements = await runOverpassQuery(query, signal);
  if (elements.length === 0) return [];
  return toProspects(elements, geo, topic, limit);
}
