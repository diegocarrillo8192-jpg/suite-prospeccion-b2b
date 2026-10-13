import { beforeEach, describe, expect, it } from "vitest";
import { useEffect } from "react";
import { act, render } from "@testing-library/react";
import { AppStateProvider, useAppState } from "@/components/app-state";
import type { Prospect } from "@/lib/types";

function prospect(id: string, correo = "", extra: Partial<Prospect> = {}): Prospect {
  return {
    id,
    nombre: "",
    empresa: `Empresa ${id}`,
    correo,
    telefono: "",
    whatsapp: "",
    direccion: "",
    website: "",
    ciudad: "Panamá",
    rubro: "Dentista",
    ...extra,
  };
}

const probe = {} as { current: ReturnType<typeof useAppState> };
function Probe() {
  const value = useAppState();
  useEffect(() => {
    probe.current = value;
  });
  return null;
}

function renderState() {
  render(
    <AppStateProvider>
      <Probe />
    </AppStateProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("cola automática de la campaña", () => {
  it("los prospectos con correo pasan solos a la lista de envío", () => {
    renderState();
    expect(probe.current.autoQueue).toBe(true);
    act(() => {
      probe.current.setProspects([prospect("a", "a@acme.com"), prospect("b"), prospect("c", "c@globex.com", { emailStatus: "invalid" })]);
      probe.current.queueProspects([prospect("a", "a@acme.com"), prospect("b"), prospect("c", "c@globex.com", { emailStatus: "invalid" })]);
    });
    expect(probe.current.recipients.map((r) => r.correo)).toEqual(["a@acme.com"]);
  });

  it("un prospecto que consigue correo al enriquecerse entra a la campaña", () => {
    renderState();
    act(() => probe.current.setProspects([prospect("a"), prospect("b")]));
    act(() => probe.current.updateProspects({ a: { correo: "info@a.com" } }));
    expect(probe.current.recipients.map((r) => r.correo)).toEqual(["info@a.com"]);
    // Las actualizaciones posteriores se reflejan en el destinatario.
    act(() => probe.current.updateProspects({ a: { emailStatus: "valid" } }));
    expect(probe.current.recipients[0].emailStatus).toBe("valid");
  });

  it("respeta el interruptor desactivado", () => {
    renderState();
    act(() => probe.current.setAutoQueue(false));
    act(() => probe.current.setProspects([prospect("a")]));
    act(() => probe.current.updateProspects({ a: { correo: "info@a.com" } }));
    expect(probe.current.recipients).toHaveLength(0);
  });

  it("la biblioteca acumula los contactos con correo de todas las búsquedas", () => {
    renderState();
    act(() => probe.current.setProspects([prospect("a", "a@acme.com"), prospect("b")]));
    act(() => probe.current.setProspects([prospect("c", "c@globex.com"), prospect("d", "A@acme.com", { rubro: "Abogado" })]));
    act(() => probe.current.updateProspects({ c: { emailStatus: "valid" } }));
    const lib = probe.current.library;
    expect(lib.map((p) => p.correo.toLowerCase()).sort()).toEqual(["a@acme.com", "c@globex.com"]);
    expect(lib.find((p) => p.correo === "c@globex.com")?.emailStatus).toBe("valid");
    act(() => probe.current.removeFromLibrary(["c@globex.com"]));
    expect(probe.current.library).toHaveLength(1);
  });

  it("appendProspects suma sin duplicar por id, correo o web", () => {
    renderState();
    act(() => probe.current.setProspects([prospect("a", "a@acme.com")]));
    let added = 0;
    act(() => {
      added = probe.current.appendProspects([
        prospect("x", "A@acme.com"),
        prospect("y", "", { website: "https://globex.com/contacto", empresa: "Globex" }),
        prospect("z", "", { website: "globex.com", empresa: "Globex" }),
      ]);
    });
    expect(added).toBe(1);
    expect(probe.current.prospects).toHaveLength(2);
  });
});
