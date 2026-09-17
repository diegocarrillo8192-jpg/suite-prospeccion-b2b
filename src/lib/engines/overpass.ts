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
  filter: string;
}

const NICHE_RULES: NicheRule[] = [
  {
    test: /restauran|gastronom|comida|marisqu|pizzer|pizza|sushi|parrilla|asador|cafeter|caf[eé]|bar\b|cervez|cantina|pupus|fonda|panader|pasteler|helader|dulcer|comida r[aá]pida/i,
    filter: '["amenity"~"^(restaurant|cafe|fast_food|bar|pub|biergarten|ice_cream|food_court)$"]',
  },
  {
    test: /taller|mec[aá]nic|automotriz|autos?\b|carro|veh[ií]cul|llanta|repues|carrocer/i,
    filter: '["shop"~"^(car_repair|car_parts|tyres|motorcycle_repair)$"]',
  },
  {
    test: /odont[oó]log|dentist|dental/i,
    filter: '["amenity"="dentist"]',
  },
  {
    test: /cl[ií]nic|m[eé]dic|salud|hospital|consultori|fisioterap|psic[oó]log|laboratorio/i,
    filter: '["amenity"~"^(clinic|doctors|hospital|physiotherapist|veterinary)$"]',
  },
  {
    test: /farmac|pharmac|droguer|botica/i,
    filter: '["amenity"="pharmacy"]',
  },
  {
    test: /veterinari|veterinar/i,
    filter: '["amenity"="veterinary"]',
  },
  {
    test: /hotel|hostal|hosteler|posada|motel|apartahotel/i,
    filter: '["tourism"~"^(hotel|motel|guest_house|hostel|apartment|chalet)$"]',
  },
  {
    test: /abogad|jur[ií]dic|lawyer|legal|notar[ií]a/i,
    filter: '["office"~"^(lawyer|notary)$"]',
  },
  {
    test: /contador|contable|accountant|contabilidad|auditor/i,
    filter: '["office"~"^(accountant|tax_advisor)$"]',
  },
  {
    test: /inmobiliar|real estate|propiedad|bienes ra[ií]ces/i,
    filter: '["office"~"^(estate_agent|property_management)$"]',
  },
  {
    test: /peluquer|barber|est[eé]tica|sal[oó]n de belleza|beauty|spa\b|u[nñ]as|manicur/i,
    filter: '["shop"~"^(hairdresser|beauty|nail_salon)$"]',
  },
  {
    test: /gimnasio|gym|fitness|crossfit|deportiv|spinning|yoga/i,
    filter: '["leisure"~"^(fitness_centre|sports_centre|pitch|dance)$"]',
  },
  {
    test: /supermerc|supermarket|abarrot|minimarket|mercado|colmado|tienda de barrio/i,
    filter: '["shop"~"^(supermarket|convenience|grocery|greengrocer|general)$"]',
  },
  {
    test: /ferreter|hardware|construcci|materiales/i,
    filter: '["shop"~"^(hardware|doityourself|trade|building_materials|paint)$"]',
  },
  {
    test: /[oó]ptic|optical|optica|optometr/i,
    filter: '["shop"~"^(optician|hearing_aids)$"]',
  },
  {
    test: /joyer|jewel|relojer|orfebre|plater/i,
    filter: '["shop"~"^(jewelry|watches|goldsmith)$"]',
  },
  {
    test: /florister|florist|flores/i,
    filter: '["shop"="florist"]',
  },
  {
    test: /zapater|calzado|shoe/i,
    filter: '["shop"~"^(shoes|shoe)$"]',
  },
  {
    test: /ropa|moda|boutique|clothing|bordad|sastrer/i,
    filter: '["shop"~"^(clothes|boutique|fashion|tailor|fabric)$"]',
  },
  {
    test: /librer|bookstore|papeler|imprenta/i,
    filter: '["shop"~"^(books|stationery|copyshop)$"]',
  },
  {
    test: /software|inform[aá]tic|tecnolog|marketing|publicit|dise[nñ]o web|agencia|consultor|desarrollo/i,
    filter: '["office"~"^(it|advertising_agency|consulting|company)$"]',
  },
  {
    test: /constructora|carpinter|electricista|plomer|fontaner|alba[nñ]il|pintor|arquitect/i,
    filter: '["craft"~"^(carpenter|electrician|plumber|hvac|roofer|painter|builder|architect)$"]',
  },
  {
    test: /colegio|escuela|academ|universidad|educaci|idiomas|instituto/i,
    filter: '["amenity"~"^(school|college|university|language_school|driving_school|music_school)$"]',
  },
  {
    test: /banco|financier|fintech|cooperativa|seguros|asegurador/i,
    filter: '["amenity"="bank"]',
  },
  {
    test: /transporte|log[ií]stica|flete|carga|env[ií]o|paqueter|mudanza/i,
    filter: '["office"~"^(logistics|moving_company|transport)$"]',
  },
  {
    test: /concesionario|automotriz|veh[ií]culos|autos usados|dealership/i,
    filter: '["shop"~"^(car|motorcycle|truck)$"]',
  },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function filterForNiche(niche: string): string {
  const topic = niche.trim();
  for (const rule of NICHE_RULES) {
    if (rule.test.test(topic)) return rule.filter;
  }
  return `["name"~"${escapeRegex(topic)}",i]`;
}

function buildOverpassQuery(filter: string, radius: number, geo: GeoLocation, outCount: number): string {
  const around = `(around:${radius},${geo.latitude},${geo.longitude})`;
  return [
    "[out:json][timeout:25];",
    "(",
    `  nwr${filter}${around};`,
    ");",
    `out tags ${outCount};`,
  ].join("\n");
}

async function runOverpassQuery(query: string): Promise<OverpassElement[]> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) continue;
      const data = (await res.json().catch(() => null)) as OverpassResponse | null;
      const elements = data?.elements;
      if (Array.isArray(elements) && elements.length > 0) return elements;
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
      social: tags["contact:facebook"] ? { facebook: tags["contact:facebook"] } : undefined,
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
  limit: number
): Promise<Prospect[]> {
  if (!geo.latitude || !geo.longitude) return [];

  const topic = niche.trim() || "negocios";
  const filter = filterForNiche(topic);
  const outCount = Math.min(Math.max(limit * 5, 100), 400);

  for (const radius of [12000, 6000]) {
    const query = buildOverpassQuery(filter, radius, geo, outCount);
    const elements = await runOverpassQuery(query);
    if (elements.length > 0) return toProspects(elements, geo, topic, limit);
  }

  return [];
}
