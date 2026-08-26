"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Prospect, TabId } from "@/lib/types";

interface AppState {
  tab: TabId;
  setTab: (t: TabId) => void;
  prospects: Prospect[];
  setProspects: (p: Prospect[]) => void;
  selectedIds: string[];
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  recipients: Prospect[];
  addRecipients: (p: Prospect[]) => void;
  removeRecipient: (id: string) => void;
  clearRecipients: () => void;
  transferSelected: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<TabId>("search");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<Prospect[]>([]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const all = prospects.map((p) => p.id);
      return prev.length === all.length && all.length > 0 ? [] : all;
    });
  }, [prospects]);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const addRecipients = useCallback((p: Prospect[]) => {
    setRecipients((r) => {
      const seen = new Set(r.map((x) => x.id));
      return [...r, ...p.filter((x) => !seen.has(x.id))];
    });
  }, []);

  const removeRecipient = useCallback(
    (id: string) => setRecipients((r) => r.filter((x) => x.id !== id)),
    []
  );

  const clearRecipients = useCallback(() => setRecipients([]), []);

  const transferSelected = useCallback(() => {
    const sel = new Set(selectedIds);
    const chosen = prospects.filter((p) => sel.has(p.id));
    addRecipients(chosen);
    clearSelection();
    setTab("sender");
  }, [prospects, selectedIds, addRecipients, clearSelection]);

  const value = useMemo<AppState>(
    () => ({
      tab,
      setTab,
      prospects,
      setProspects,
      selectedIds,
      toggleSelect,
      selectAll,
      clearSelection,
      recipients,
      addRecipients,
      removeRecipient,
      clearRecipients,
      transferSelected,
    }),
    [
      tab,
      prospects,
      selectedIds,
      recipients,
      toggleSelect,
      selectAll,
      clearSelection,
      addRecipients,
      removeRecipient,
      clearRecipients,
      transferSelected,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState must be used within AppStateProvider");
  return v;
}
