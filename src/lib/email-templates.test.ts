import { describe, expect, it } from "vitest";
import {
  EMAIL_TEMPLATES,
  applyFieldsToHtml,
  hasEditableFields,
  parseFields,
  type TemplateFields,
} from "@/lib/email-templates";

const SAMPLE_FIELDS: TemplateFields = {
  saludo: "Hola equipo,",
  mensaje: "Primera línea\nSegunda línea",
  ctaTexto: "Reservar demo",
  ctaEnlace: "https://acme.com/demo",
  firma: "Saludos,\nAna Gómez",
};

describe("galería de plantillas prediseñadas", () => {
  it("incluye las plantillas profesionales solicitadas", () => {
    expect(EMAIL_TEMPLATES.map((t) => t.id)).toEqual([
      "presentacion",
      "propuesta",
      "auditoria",
      "contacto",
    ]);
  });

  it("todas exponen campos editables con valores por defecto", () => {
    for (const tpl of EMAIL_TEMPLATES) {
      expect(hasEditableFields(tpl.html)).toBe(true);
      expect(tpl.defaults.saludo.length).toBeGreaterThan(0);
      expect(tpl.defaults.mensaje.length).toBeGreaterThan(0);
      expect(tpl.defaults.ctaTexto.length).toBeGreaterThan(0);
      expect(tpl.defaults.ctaEnlace).toMatch(/^https?:\/\//);
      expect(tpl.build(tpl.defaults)).toContain(tpl.defaults.ctaTexto);
    }
  });
});

describe("applyFieldsToHtml", () => {
  it("inyecta los campos del formulario en el HTML final", () => {
    const tpl = EMAIL_TEMPLATES[0];
    const html = applyFieldsToHtml(tpl.html, SAMPLE_FIELDS);
    expect(html).toContain("Hola equipo,");
    expect(html).toContain("Primera línea<br />Segunda línea");
    expect(html).toContain("Reservar demo");
    expect(html).toContain('href="https://acme.com/demo"');
    expect(html).toContain("Saludos,<br />Ana Gómez");
  });

  it("conserva el resto del diseño original", () => {
    const tpl = EMAIL_TEMPLATES[0];
    const html = applyFieldsToHtml(tpl.html, SAMPLE_FIELDS);
    expect(html).toContain("<table");
    expect(html).toContain("{{empresa_remitente}}");
  });

  it("realiza round-trip editar -> HTML -> campos", () => {
    for (const tpl of EMAIL_TEMPLATES) {
      const html = applyFieldsToHtml(tpl.html, SAMPLE_FIELDS);
      expect(parseFields(html)).toEqual(SAMPLE_FIELDS);
    }
  });
});

describe("hasEditableFields", () => {
  it("detecta plantillas con campos y texto plano sin ellos", () => {
    expect(hasEditableFields(EMAIL_TEMPLATES[0].html)).toBe(true);
    expect(hasEditableFields("<p>Hola {{nombre}}</p>")).toBe(false);
  });
});
