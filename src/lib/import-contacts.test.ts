import { describe, expect, it } from "vitest";
import { parseCsv, parseDelimited, parsePastedContacts } from "@/lib/csv";
import { toProspects } from "@/lib/import-contacts";

describe("parseDelimited", () => {
  it("detecta tabuladores (copiado de Excel / Google Sheets)", () => {
    const m = parseDelimited("nombre\tcorreo\nAna\tana@acme.com");
    expect(m).toEqual([
      ["nombre", "correo"],
      ["Ana", "ana@acme.com"],
    ]);
  });

  it("respeta comillas con saltos de línea y separadores dentro", () => {
    const m = parseDelimited('empresa,direccion,correo\n"Acme, SA","Calle 5\nLocal 2",ana@acme.com\n');
    expect(m[1]).toEqual(["Acme, SA", "Calle 5\nLocal 2", "ana@acme.com"]);
  });

  it("no corta por punto y coma cuando el separador es la coma", () => {
    const rows = parseCsv("empresa,direccion,correo\nAcme,Calle 5; local 2,ana@acme.com");
    expect(rows[0]).toMatchObject({ empresa: "Acme", direccion: "Calle 5; local 2", correo: "ana@acme.com" });
  });
});

describe("mapeo de columnas", () => {
  it("entiende exportaciones de Google Maps / Apify", () => {
    const rows = parseCsv(
      "title,categoryName,city,phone,website,emails/0\nClínica Sonrisa,Dentista,Panamá,+507 6000,sonrisa.com,INFO@sonrisa.com"
    );
    expect(rows[0]).toMatchObject({
      empresa: "Clínica Sonrisa",
      rubro: "Dentista",
      ciudad: "Panamá",
      telefono: "+507 6000",
      website: "sonrisa.com",
      correo: "info@sonrisa.com",
    });
  });

  it("no confunde «hotel» con teléfono", () => {
    const rows = parseCsv("hotel,correo\nHotel Sol,ventas@sol.com");
    expect(rows[0].telefono).toBe("");
  });

  it("toma el primer correo de una celda con varios", () => {
    const rows = parseCsv('empresa,emails\nAcme,"ventas@acme.com; info@acme.com"');
    expect(rows[0].correo).toBe("ventas@acme.com");
  });

  it("sin encabezados busca la columna de correos", () => {
    const rows = parseCsv("Acme SA,ana@acme.com\nGlobex,luis@globex.com");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ empresa: "Acme SA", correo: "ana@acme.com" });
  });
});

describe("parsePastedContacts", () => {
  it("acepta una lista libre de correos con nombres", () => {
    const { rows } = parsePastedContacts("ventas@empresa.com\nClínica Sonrisa <info@sonrisa.com>\n\nbasura sin correo");
    expect(rows.map((r) => r.correo)).toEqual(["ventas@empresa.com", "info@sonrisa.com"]);
    expect(rows[1].empresa).toBe("Clínica Sonrisa");
  });

  it("acepta una tabla con encabezados", () => {
    const { rows, detected } = parsePastedContacts("nombre\tempresa\tcorreo\nAna\tAcme\tana@acme.com");
    expect(detected).toEqual(expect.arrayContaining(["correo", "empresa", "nombre"]));
    expect(rows[0]).toMatchObject({ nombre: "Ana", empresa: "Acme", correo: "ana@acme.com" });
  });
});

describe("toProspects", () => {
  it("separa con correo, recuperables por web y descartados, sin duplicados", () => {
    const split = toProspects([
      { empresa: "Acme", correo: "ana@acme.com" },
      { empresa: "Acme bis", correo: "ANA@acme.com " },
      { empresa: "Globex", website: "globex.com" },
      { empresa: "Sin datos", telefono: "123" },
    ]);
    expect(split.withEmail).toHaveLength(1);
    expect(split.withEmail[0].correo).toBe("ana@acme.com");
    expect(split.findable).toHaveLength(1);
    expect(split.findable[0].website).toBe("globex.com");
    expect(split.discarded).toBe(1);
  });
});
