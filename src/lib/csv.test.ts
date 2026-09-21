import { describe, expect, it } from "vitest";
import { parseCsv, prospectsToCsv } from "@/lib/csv";
import type { Prospect } from "@/lib/types";

describe("parseCsv — mapeo automático de encabezados", () => {
  it("mapea encabezados comunes en español", () => {
    const rows = parseCsv(
      "nombre,empresa,correo,ciudad\nAna Pérez,Acme SA,ana@acme.com,Madrid"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      nombre: "Ana Pérez",
      empresa: "Acme SA",
      correo: "ana@acme.com",
      ciudad: "Madrid",
    });
  });

  it("mapea encabezados en inglés y alias", () => {
    const rows = parseCsv(
      "Name,Company,E-mail,City\nJohn Doe,Globex,john@globex.com,New York"
    );
    expect(rows[0]).toMatchObject({
      nombre: "John Doe",
      empresa: "Globex",
      correo: "john@globex.com",
      ciudad: "New York",
    });
  });

  it("ignora acentos, mayúsculas y espacios en los encabezados", () => {
    const rows = parseCsv(
      " NOMBRE , Empresa , Correo Electrónico , Localidad \nAna,Acme,ana@acme.com,Córdoba"
    );
    expect(rows[0].correo).toBe("ana@acme.com");
    expect(rows[0].ciudad).toBe("Córdoba");
  });

  it("soporta el delimitador punto y coma", () => {
    const rows = parseCsv("nombre;empresa;correo\nAna;Acme;ana@acme.com");
    expect(rows[0].correo).toBe("ana@acme.com");
  });

  it("devuelve vacío cuando no hay filas de datos", () => {
    expect(parseCsv("nombre,correo")).toEqual([]);
  });
});

describe("prospectsToCsv", () => {
  it("exporta las columnas esperadas y escapa valores con comas", () => {
    const prospect: Prospect = {
      id: "1",
      nombre: "Ana, Pérez",
      empresa: "Acme",
      correo: "ana@acme.com",
      telefono: "",
      whatsapp: "",
      direccion: "",
      website: "",
      ciudad: "Madrid",
      rubro: "",
    };
    const csv = prospectsToCsv([prospect]);
    const [header, row] = csv.split("\n");
    expect(header).toBe(
      "nombre,empresa,correo,telefono,whatsapp,direccion,website,ciudad,rubro"
    );
    expect(row).toContain('"Ana, Pérez"');
  });
});
