"use client";

import type { Prospect } from "./types";

const STORAGE_KEY = "b2b_prospect_history_v1";

const listeners = new Set<() => void>();

function emitChange(): void {
  for (const l of listeners) l();
}

export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getHistoryCount(): number {
  return readHistory().length;
}

export function getServerHistoryCount(): number {
  return 0;
}

function normalize(v: string): string {
  return (v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@.]/g, "");
}

export interface ProspectRecord {
  empresa: string;
  website: string;
  email: string;
}

export function readHistory(): ProspectRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is ProspectRecord =>
        r && typeof r.empresa === "string" && typeof r.website === "string" && typeof r.email === "string"
    );
  } catch {
    return [];
  }
}

function writeHistory(records: ProspectRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    emitChange();
  } catch {
    // almacenamiento no disponible
  }
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    emitChange();
  } catch {
    // almacenamiento no disponible
  }
}

export function rememberProspects(prospects: Prospect[]): void {
  if (prospects.length === 0) return;
  const existing = readHistory();
  const seen = new Set<string>();
  for (const r of existing) {
    seen.add(normalize(r.empresa));
    if (r.website) seen.add(normalize(r.website));
    if (r.email) seen.add(normalize(r.email));
  }

  const next: ProspectRecord[] = [...existing];
  for (const p of prospects) {
    const rec: ProspectRecord = {
      empresa: p.empresa,
      website: p.website,
      email: p.correo && p.correo !== "No disponible" ? p.correo : "",
    };
    const keys = [normalize(rec.empresa)];
    if (rec.website) keys.push(normalize(rec.website));
    if (rec.email) keys.push(normalize(rec.email));
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    next.push(rec);
  }
  writeHistory(next);
}

export function filterDuplicates(prospects: Prospect[]): {
  fresh: Prospect[];
  skipped: number;
} {
  const history = readHistory();
  const seen = new Set<string>();
  for (const r of history) {
    seen.add(normalize(r.empresa));
    if (r.website) seen.add(normalize(r.website));
    if (r.email) seen.add(normalize(r.email));
  }

  const fresh: Prospect[] = [];
  let skipped = 0;
  for (const p of prospects) {
    const keys = [normalize(p.empresa)];
    if (p.website) keys.push(normalize(p.website));
    if (p.correo && p.correo !== "No disponible") keys.push(normalize(p.correo));
    if (keys.some((k) => seen.has(k))) {
      skipped++;
    } else {
      fresh.push(p);
      keys.forEach((k) => seen.add(k));
    }
  }
  return { fresh, skipped };
}
