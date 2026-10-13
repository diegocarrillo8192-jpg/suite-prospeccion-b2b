"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isValidEmail } from "@/lib/sanitize";
import type { ExtractionMeta } from "@/lib/extract";
import type { CampaignRecord, Prospect, SearchRecord, TabId } from "@/lib/types";

export type DialogId = "providers" | "sender" | null;
export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

export interface SearchDraft {
  niche: string;
  city: string;
  limit: number;
}

export interface TransferResult {
  added: number;
  skipped: number;
}

interface AppState {
  hydrated: boolean;
  tab: TabId;
  setTab: (t: TabId) => void;
  dialog: DialogId;
  openDialog: (d: DialogId) => void;
  closeDialog: () => void;
  prospects: Prospect[];
  setProspects: (p: Prospect[]) => void;
  updateProspects: (updates: Record<string, Partial<Prospect>>) => void;
  removeProspects: (ids: string[]) => void;
  searchDraft: SearchDraft;
  setSearchDraft: (patch: Partial<SearchDraft>) => void;
  searchMeta: ExtractionMeta | null;
  setSearchMeta: (m: ExtractionMeta | null) => void;
  selectedIds: string[];
  toggleSelect: (id: string) => void;
  setSelection: (ids: string[]) => void;
  selectAll: () => void;
  clearSelection: () => void;
  recipients: Prospect[];
  addRecipients: (p: Prospect[]) => number;
  removeRecipient: (id: string) => void;
  clearRecipients: () => void;
  transferSelected: () => TransferResult;
  campaigns: CampaignRecord[];
  addCampaign: (c: CampaignRecord) => void;
  clearCampaigns: () => void;
  contactedEmails: Set<string>;
  /** Correos que pidieron no recibir más mensajes: nunca se les envía. */
  suppressed: string[];
  suppressedSet: Set<string>;
  addSuppressed: (emails: string[]) => number;
  removeSuppressed: (email: string) => void;
  recentSearches: SearchRecord[];
  addRecentSearch: (s: SearchRecord) => void;
  toasts: Toast[];
  notify: (tone: ToastTone, title: string, description?: string) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<AppState | null>(null);

const KEYS = {
  prospects: "b2b.workspace.prospects.v1",
  meta: "b2b.workspace.meta.v1",
  recipients: "b2b.workspace.recipients.v1",
  campaigns: "b2b.workspace.campaigns.v1",
  searches: "b2b.workspace.searches.v1",
  suppressed: "b2b.workspace.suppressed.v1",
} as const;

const MAX_CAMPAIGNS = 30;
const MAX_SEARCHES = 8;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // almacenamiento lleno o no disponible
  }
}

export function hasValidEmail(p: Pick<Prospect, "correo">): boolean {
  return isValidEmail(p.correo ?? "");
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<TabId>("dashboard");
  const [dialog, setDialog] = useState<DialogId>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [searchMeta, setSearchMeta] = useState<ExtractionMeta | null>(null);
  const [searchDraft, setDraft] = useState<SearchDraft>({ niche: "", city: "", limit: 25 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<Prospect[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [recentSearches, setRecentSearches] = useState<SearchRecord[]>([]);
  const [suppressed, setSuppressed] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  // Restaura el espacio de trabajo guardado tras montar (evita desajustes de hidratación).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- lectura única de localStorage tras montar */
    setProspects(load<Prospect[]>(KEYS.prospects, []));
    setSearchMeta(load<ExtractionMeta | null>(KEYS.meta, null));
    setRecipients((current) => (current.length ? current : load<Prospect[]>(KEYS.recipients, [])));
    setCampaigns(load<CampaignRecord[]>(KEYS.campaigns, []));
    setRecentSearches(load<SearchRecord[]>(KEYS.searches, []));
    setSuppressed(load<string[]>(KEYS.suppressed, []));
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (hydrated) save(KEYS.prospects, prospects);
  }, [hydrated, prospects]);
  useEffect(() => {
    if (hydrated) save(KEYS.meta, searchMeta);
  }, [hydrated, searchMeta]);
  useEffect(() => {
    if (hydrated) save(KEYS.recipients, recipients);
  }, [hydrated, recipients]);
  useEffect(() => {
    if (hydrated) save(KEYS.campaigns, campaigns);
  }, [hydrated, campaigns]);
  useEffect(() => {
    if (hydrated) save(KEYS.searches, recentSearches);
  }, [hydrated, recentSearches]);
  useEffect(() => {
    if (hydrated) save(KEYS.suppressed, suppressed);
  }, [hydrated, suppressed]);

  const suppressedSet = useMemo(() => new Set(suppressed), [suppressed]);
  const suppressedRef = useRef<string[]>([]);
  useEffect(() => {
    suppressedRef.current = suppressed;
  }, [suppressed]);

  const addSuppressed = useCallback((emails: string[]) => {
    const current = new Set(suppressedRef.current);
    const fresh: string[] = [];
    for (const raw of emails) {
      const email = raw.trim().toLowerCase();
      if (!isValidEmail(email) || current.has(email)) continue;
      current.add(email);
      fresh.push(email);
    }
    if (fresh.length) {
      const next = [...suppressedRef.current, ...fresh];
      suppressedRef.current = next;
      setSuppressed(next);
    }
    return fresh.length;
  }, []);

  const removeSuppressed = useCallback((email: string) => {
    setSuppressed((list) => list.filter((e) => e !== email.trim().toLowerCase()));
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (tone: ToastTone, title: string, description?: string) => {
      const id = ++toastSeq.current;
      setToasts((list) => [...list.slice(-3), { id, tone, title, description }]);
      setTimeout(() => dismissToast(id), tone === "error" ? 7000 : 4500);
    },
    [dismissToast]
  );

  const setSearchDraft = useCallback((patch: Partial<SearchDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const openDialog = useCallback((d: DialogId) => {
    // Los proveedores de búsqueda viven en la sección Conectores.
    if (d === "providers") {
      setTab("connectors");
      setDialog(null);
      return;
    }
    setDialog(d);
  }, []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const updateProspects = useCallback((updates: Record<string, Partial<Prospect>>) => {
    setProspects((list) => list.map((p) => (updates[p.id] ? { ...p, ...updates[p.id] } : p)));
    setRecipients((list) => list.map((p) => (updates[p.id] ? { ...p, ...updates[p.id] } : p)));
  }, []);

  const removeProspects = useCallback((ids: string[]) => {
    const drop = new Set(ids);
    setProspects((list) => list.filter((p) => !drop.has(p.id)));
    setSelectedIds((s) => s.filter((id) => !drop.has(id)));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }, []);

  const setSelection = useCallback((ids: string[]) => setSelectedIds(ids), []);

  const selectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const all = prospects.map((p) => p.id);
      return prev.length === all.length && all.length > 0 ? [] : all;
    });
  }, [prospects]);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const recipientsRef = useRef<Prospect[]>([]);
  useEffect(() => {
    recipientsRef.current = recipients;
  }, [recipients]);

  const addRecipients = useCallback((p: Prospect[]) => {
    const current = recipientsRef.current;
    const seenIds = new Set(current.map((x) => x.id));
    const seenEmails = new Set(current.map((x) => (x.correo ?? "").trim().toLowerCase()));
    const fresh: Prospect[] = [];
    for (const item of p) {
      const email = (item.correo ?? "").trim().toLowerCase();
      if (seenIds.has(item.id) || (email && seenEmails.has(email))) continue;
      seenIds.add(item.id);
      if (email) seenEmails.add(email);
      fresh.push(item);
    }
    if (fresh.length) {
      const next = [...current, ...fresh];
      recipientsRef.current = next;
      setRecipients(next);
    }
    return fresh.length;
  }, []);

  const removeRecipient = useCallback(
    (id: string) => setRecipients((r) => r.filter((x) => x.id !== id)),
    []
  );

  const clearRecipients = useCallback(() => setRecipients([]), []);

  const transferSelected = useCallback((): TransferResult => {
    const sel = new Set(selectedIds);
    const chosen = prospects.filter((p) => sel.has(p.id));
    const withEmail = chosen.filter(hasValidEmail);
    const added = addRecipients(withEmail);
    clearSelection();
    if (withEmail.length > 0) setTab("sender");
    return { added, skipped: chosen.length - withEmail.length };
  }, [prospects, selectedIds, addRecipients, clearSelection]);

  const addCampaign = useCallback((c: CampaignRecord) => {
    setCampaigns((list) => [c, ...list].slice(0, MAX_CAMPAIGNS));
  }, []);

  const clearCampaigns = useCallback(() => setCampaigns([]), []);

  const addRecentSearch = useCallback((s: SearchRecord) => {
    setRecentSearches((list) => {
      const key = `${s.niche}|${s.city}`.toLowerCase();
      const rest = list.filter((x) => `${x.niche}|${x.city}`.toLowerCase() !== key);
      return [s, ...rest].slice(0, MAX_SEARCHES);
    });
  }, []);

  const contactedEmails = useMemo(() => {
    const set = new Set<string>();
    for (const c of campaigns) {
      if (c.mode === "simulated") continue;
      for (const r of c.results) if (r.ok) set.add(r.email.toLowerCase());
    }
    return set;
  }, [campaigns]);

  const value = useMemo<AppState>(
    () => ({
      hydrated,
      tab,
      setTab,
      dialog,
      openDialog,
      closeDialog,
      prospects,
      setProspects,
      updateProspects,
      removeProspects,
      searchDraft,
      setSearchDraft,
      searchMeta,
      setSearchMeta,
      selectedIds,
      toggleSelect,
      setSelection,
      selectAll,
      clearSelection,
      recipients,
      addRecipients,
      removeRecipient,
      clearRecipients,
      transferSelected,
      campaigns,
      addCampaign,
      clearCampaigns,
      contactedEmails,
      suppressed,
      suppressedSet,
      addSuppressed,
      removeSuppressed,
      recentSearches,
      addRecentSearch,
      toasts,
      notify,
      dismissToast,
    }),
    [
      hydrated,
      tab,
      dialog,
      openDialog,
      closeDialog,
      prospects,
      updateProspects,
      removeProspects,
      searchDraft,
      setSearchDraft,
      searchMeta,
      selectedIds,
      toggleSelect,
      setSelection,
      selectAll,
      clearSelection,
      recipients,
      addRecipients,
      removeRecipient,
      clearRecipients,
      transferSelected,
      campaigns,
      addCampaign,
      clearCampaigns,
      contactedEmails,
      suppressed,
      suppressedSet,
      addSuppressed,
      removeSuppressed,
      recentSearches,
      addRecentSearch,
      toasts,
      notify,
      dismissToast,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState must be used within AppStateProvider");
  return v;
}
