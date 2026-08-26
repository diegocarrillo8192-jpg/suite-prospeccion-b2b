import type { Prospect } from "./types";

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PREFIX = [
  "Grupo", "Lumen", "Nova", "Andes", "Delta", "Orbita", "Vértice", "Konek",
  "Alma", "Pionero", "Evolta", "Sigma", "Cumbre", "Nexo", "Radix",
];
const ROOT = [
  "Digital", "Tech", "Consultores", "Soluciones", "Studio", "Labs", "Media",
  "Servicios", "Ingeniería", "Marketing", "Comercial", "Inteligencia", "Cloud",
  "Datos", "Creativo",
];
const FIRST = [
  "María", "Juan", "Lucía", "Pedro", "Ana", "Diego", "Carla", "Sofía",
  "Andrés", "Valentina", "Pablo", "Camila", "Jorge", "Renata", "Facundo",
];
const LAST = [
  "González", "Pérez", "Rodríguez", "Fernández", "López", "Martínez",
  "Sánchez", "Romero", "Torres", "Álvarez", "Castillo", "Reyes",
];
const TLD = ["com", "cl", "ar", "mx", "co", "pe", "es", "io"];
const STREETS = [
  "Av. Corrientes", "Av. Providencia", "Av. 9 de Julio", "Av. Apoquindo",
  "Calle San Martín", "Calle Belgrano", "Av. Insurgentes", "Av. Reforma",
  "Calle 5", "Ruta 8",
];

function pick<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function generateLeads(niche: string, city: string, count = 24): Prospect[] {
  const seed = hashString(`${niche.toLowerCase()}|${city.toLowerCase()}`) || 1;
  const rnd = mulberry32(seed);
  const nicheWord = niche.trim() || "Negocios";
  const base = normalize(nicheWord.split(/\s+/)[0] || "prospecto").slice(0, 14) || "prospecto";
  const cityName = city.trim() || "Buenos Aires";

  const used = new Set<string>();
  const out: Prospect[] = [];

  for (let i = 0; i < count; i++) {
    let empresa =
      rnd() > 0.5
        ? `${pick(rnd, ROOT)} ${capitalize(nicheWord)}`
        : `${pick(rnd, PREFIX)} ${pick(rnd, ROOT)}`;
    if (used.has(empresa)) empresa = `${empresa} ${Math.floor(rnd() * 90) + 10}`;
    used.add(empresa);

    const domain = `${base}${Math.floor(rnd() * 900) + 100}.${pick(rnd, TLD)}`;
    const area = Math.floor(rnd() * 900) + 100;
    const telefono = `+54 11 ${area}-${String(Math.floor(rnd() * 9000) + 1000).padStart(4, "0")}`;
    const whatsapp = `54${area}${String(Math.floor(rnd() * 90000000) + 10000000)}`;
    const direccion = `${pick(rnd, STREETS)} ${Math.floor(rnd() * 4500) + 100}, ${cityName}`;

    out.push({
      id: `p-${i}-${seed}`,
      nombre: `${pick(rnd, FIRST)} ${pick(rnd, LAST)}`,
      empresa,
      correo: `contacto@${domain}`,
      telefono,
      whatsapp,
      direccion,
      website: `https://www.${domain}`,
      ciudad: cityName,
      rubro: nicheWord,
    });
  }

  return out;
}
