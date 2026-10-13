export interface QueryPlan {
  query: string;
  phrase: string;
  variants: string[];
  /** Frases alternativas («sinónimo en ciudad, país») para ampliar la búsqueda en Maps. */
  synonyms: string[];
}

interface NicheSynonyms {
  test: RegExp;
  terms: string[];
}

const NICHE_SYNONYMS: NicheSynonyms[] = [
  { test: /dentist|odont|dental/i, terms: ["dentistas", "clínica dental", "consultorio dental", "odontólogos"] },
  { test: /restauran|gastronom|comida/i, terms: ["restaurantes", "restaurante", "comida"] },
  { test: /caf[eé]|cafeter/i, terms: ["cafeterías", "café", "coffee shop"] },
  { test: /\bbar(es)?\b|cocteler|cervecer/i, terms: ["bares", "bar", "pub"] },
  { test: /panader|pasteler|reposter/i, terms: ["panaderías", "pastelerías", "repostería"] },
  { test: /peluquer|barber|est[eé]tica|belleza|sal[oó]n/i, terms: ["peluquerías", "salón de belleza", "barberías"] },
  { test: /\bspa\b|masaj/i, terms: ["spa", "centro de masajes", "spa de bienestar"] },
  { test: /u[ñn]as|manicur/i, terms: ["salón de uñas", "manicure", "nail bar"] },
  { test: /taller|mec[aá]nic/i, terms: ["talleres mecánicos", "taller de mecánica", "mecánica automotriz"] },
  { test: /concesionari|autos|carros|veh[ií]culo/i, terms: ["concesionarios de autos", "venta de autos", "agencia de autos"] },
  { test: /cl[ií]nic|m[eé]dic|salud|hospital/i, terms: ["clínicas", "clínica médica", "consultorios médicos"] },
  { test: /psic[oó]log|terapia|terapeut/i, terms: ["psicólogos", "consultorio psicológico", "terapeutas"] },
  { test: /fisio|kinesi|rehabilit/i, terms: ["fisioterapia", "fisioterapeutas", "centro de rehabilitación"] },
  { test: /[oó]ptic/i, terms: ["ópticas", "óptica", "optometristas"] },
  { test: /abogad|jur[ií]dic|legal|bufete/i, terms: ["abogados", "bufete de abogados", "firma de abogados"] },
  { test: /contad|contab|auditor|fiscal/i, terms: ["contadores", "firma contable", "asesoría contable"] },
  { test: /farmac|droguer|botica/i, terms: ["farmacias", "droguerías", "farmacia"] },
  { test: /gimnasio|fitness|crossfit|gym/i, terms: ["gimnasios", "centros de entrenamiento", "gimnasio"] },
  { test: /yoga|pilates/i, terms: ["estudios de yoga", "pilates", "yoga"] },
  { test: /veterinari|mascota/i, terms: ["veterinarias", "clínica veterinaria", "veterinarios"] },
  { test: /inmobiliari|bienes ra[ií]ces|real estate/i, terms: ["inmobiliarias", "bienes raíces", "agencia inmobiliaria"] },
  { test: /constructor|construcci[oó]n/i, terms: ["constructoras", "empresas de construcción", "contratistas"] },
  { test: /arquitect/i, terms: ["arquitectos", "estudio de arquitectura", "firma de arquitectura"] },
  { test: /hotel|hostal|hospedaje|alojamiento/i, terms: ["hoteles", "hotel", "hospedaje"] },
  { test: /viaje|turism|tour/i, terms: ["agencias de viajes", "turismo", "tour operadores"] },
  { test: /marketing|publicidad|agencia digital/i, terms: ["agencias de marketing", "agencia de publicidad", "marketing digital"] },
  { test: /software|tecnolog|inform[aá]tic|desarroll/i, terms: ["empresas de software", "desarrollo de software", "empresas de tecnología"] },
  { test: /seguro/i, terms: ["aseguradoras", "corredores de seguros", "agentes de seguros"] },
  { test: /log[ií]stic|transporte|mudanza|courier|env[ií]o/i, terms: ["empresas de logística", "transporte de carga", "mudanzas"] },
  { test: /imprenta|impresi[oó]n|serigraf/i, terms: ["imprentas", "impresión digital", "serigrafía"] },
  { test: /ferreter/i, terms: ["ferreterías", "ferretería", "materiales de construcción"] },
  { test: /ropa|moda|boutique/i, terms: ["tiendas de ropa", "boutiques", "moda"] },
  { test: /joyer/i, terms: ["joyerías", "joyería", "relojerías"] },
  { test: /muebl|decoraci/i, terms: ["mueblerías", "tiendas de muebles", "decoración"] },
  { test: /florist|flores/i, terms: ["floristerías", "florerías", "flores"] },
  { test: /lavander|tintorer/i, terms: ["lavanderías", "tintorerías", "lavandería"] },
  { test: /limpieza|aseo/i, terms: ["empresas de limpieza", "servicios de limpieza", "limpieza comercial"] },
  { test: /seguridad|vigilancia/i, terms: ["empresas de seguridad", "seguridad privada", "vigilancia"] },
  { test: /electric|plomer|fontaner|aire acondicionado|refrigeraci/i, terms: ["electricistas", "plomeros", "técnicos de aire acondicionado"] },
  { test: /colegio|escuela|academ|instituto|educaci/i, terms: ["colegios", "academias", "centros educativos"] },
  { test: /guarder|preescolar|kinder/i, terms: ["guarderías", "preescolares", "jardines infantiles"] },
  { test: /evento|bodas|catering/i, terms: ["organización de eventos", "salones de eventos", "catering"] },
  { test: /fotograf/i, terms: ["fotógrafos", "estudio fotográfico", "fotografía"] },
  { test: /carpinter/i, terms: ["carpinterías", "carpintería", "ebanistería"] },
  { test: /supermercad|minimercad|abarrot/i, terms: ["supermercados", "minisúper", "tiendas de abarrotes"] },
];

const COUNTRY_LOCAL: Record<string, { tld: string; alt: string }> = {
  panama: { tld: "pa", alt: "Panama" },
  colombia: { tld: "co", alt: "Colombia" },
  mexico: { tld: "mx", alt: "Mexico" },
  espana: { tld: "es", alt: "Spain" },
  argentina: { tld: "ar", alt: "Argentina" },
  chile: { tld: "cl", alt: "Chile" },
  peru: { tld: "pe", alt: "Peru" },
  ecuador: { tld: "ec", alt: "Ecuador" },
  "costa rica": { tld: "cr", alt: "Costa Rica" },
  guatemala: { tld: "gt", alt: "Guatemala" },
  "republica dominicana": { tld: "do", alt: "Dominican Republic" },
  uruguay: { tld: "uy", alt: "Uruguay" },
  paraguay: { tld: "py", alt: "Paraguay" },
  bolivia: { tld: "bo", alt: "Bolivia" },
  venezuela: { tld: "ve", alt: "Venezuela" },
  honduras: { tld: "hn", alt: "Honduras" },
  "el salvador": { tld: "sv", alt: "El Salvador" },
  nicaragua: { tld: "ni", alt: "Nicaragua" },
};

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function buildLocation(city: string, countryName: string): string {
  const c = city.trim();
  const country = countryName.trim();
  if (!c) return country;
  if (!country) return c;
  const cityLower = c.toLowerCase();
  if (cityLower === country.toLowerCase() || country.toLowerCase().startsWith(cityLower)) {
    return c;
  }
  return `${c}, ${country}`;
}

function countryClause(countryName: string): string {
  const name = countryName.trim();
  if (!name) return "";
  const local = COUNTRY_LOCAL[stripAccents(name).toLowerCase()];
  if (local) return `"${name}" site:.${local.tld} OR "${local.alt}"`;
  return `"${name}"`;
}

function buildWebPhrase(term: string, city: string, countryName: string): string {
  const parts = [`"${term.trim()}"`];
  const c = city.trim();
  if (c && stripAccents(c).toLowerCase() !== stripAccents(countryName).toLowerCase()) {
    parts.push(`"${c}"`);
  }
  const clause = countryClause(countryName);
  if (clause) parts.push(clause);
  return parts.join(" ");
}

export function planQueries(niche: string, city: string, countryName: string): QueryPlan {
  const topic = niche.trim() || "negocios";
  const location = buildLocation(city, countryName);
  const synonyms = NICHE_SYNONYMS.find((rule) => rule.test.test(topic))?.terms ?? [];
  const terms = [topic, ...synonyms.filter((t) => t.toLowerCase() !== topic.toLowerCase())];

  const phrases: string[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    const phrase = location ? `${term} en ${location}` : term;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    phrases.push(phrase);
  }

  const quotedTerms = terms.slice(0, 3).map((term) => `"${term.trim()}"`);
  const termGroup =
    quotedTerms.length > 1 ? `(${quotedTerms.join(" OR ")})` : quotedTerms[0] ?? `"${topic}"`;

  const parts = [termGroup];
  const c = city.trim();
  if (c && stripAccents(c).toLowerCase() !== stripAccents(countryName).toLowerCase()) {
    parts.push(`"${c}"`);
  }
  const clause = countryClause(countryName);
  if (clause) parts.push(clause);

  return {
    query: parts.join(" "),
    phrase: phrases[0] ?? location ?? topic,
    synonyms: phrases.slice(1, 4),
    variants: terms.slice(1, 4).map((term) => buildWebPhrase(term, city, countryName)),
  };
}
