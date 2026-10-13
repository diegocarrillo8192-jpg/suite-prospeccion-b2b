import { describe, expect, it } from "vitest";
import { extractInlineImages } from "./server-mailer";
import { classifyWebsite, sanitizeProspectWebsites } from "./engines/domains";
import {
  greetingName,
  htmlToPlainText,
  logoHtml,
  renderTemplate,
  resolvePlaceholderLinks,
  senderExtras,
  spamSignals,
  withPreheader,
  withUnsubscribeNotice,
} from "./template";
import type { Prospect } from "./types";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function prospect(partial: Partial<Prospect> = {}): Prospect {
  return {
    id: "p",
    nombre: "",
    empresa: "Clínica Sonrisa",
    correo: "info@sonrisa.com",
    telefono: "",
    whatsapp: "",
    direccion: "",
    website: "",
    ciudad: "Panamá",
    rubro: "Dentista",
    ...partial,
  };
}

describe("logo e imágenes en línea", () => {
  it("convierte data URIs en adjuntos cid reutilizando imágenes repetidas", () => {
    const html = `<img src="data:image/png;base64,${PNG}" /><p>x</p><img src="data:image/png;base64,${PNG}" />`;
    const { html: out, images } = extractInlineImages(html);
    expect(images).toHaveLength(1);
    expect(images[0].contentType).toBe("image/png");
    expect(out).not.toContain("data:image");
    expect(out.match(/cid:img1@suite-b2b/g)).toHaveLength(2);
  });

  it("usa el logo si existe y el nombre de la empresa si no", () => {
    expect(logoHtml(`data:image/png;base64,${PNG}`, "Acme")).toContain("<img");
    expect(logoHtml("https://acme.com/logo.png", "Acme")).toContain('src="https://acme.com/logo.png"');
    expect(logoHtml("javascript:alert(1)", "Acme")).toContain("Acme");
    expect(logoHtml("", "Acme")).not.toContain("<img");
  });
});

describe("plantillas", () => {
  it("saluda al equipo cuando no hay nombre de contacto", () => {
    expect(greetingName(prospect())).toBe("equipo de Clínica Sonrisa");
    expect(renderTemplate("Hola {{nombre}},", prospect({ empresa: "" }))).toBe("Hola,");
  });

  it("no envía datos de relleno en la firma real", () => {
    const real = senderExtras({ senderName: "Ana", senderEmail: "ana@acme.com" });
    expect(real.telefono_remitente).toBe("");
    const preview = senderExtras({ senderName: "", senderEmail: "" }, { preview: true });
    expect(preview.telefono_remitente).not.toBe("");
    const html = renderTemplate(
      "<!--F:firma-->Un saludo,<br />{{nombre_remitente}}<br />{{telefono_remitente}}<!--/F:firma-->",
      prospect(),
      real
    );
    expect(html).toBe("<!--F:firma-->Un saludo,<br />Ana<!--/F:firma-->");
  });

  it("inserta el preheader oculto al inicio", () => {
    const out = withPreheader("<p>Hola</p>", "Idea <rápida>");
    expect(out.startsWith('<div style="display:none')).toBe(true);
    expect(out).toContain("Idea &lt;rápida&gt;");
    expect(withPreheader("<p>Hola</p>", "  ")).toBe("<p>Hola</p>");
    expect(htmlToPlainText(out)).toBe("Hola");
  });

  it("detecta señales de spam", () => {
    const signals = spamSignals("GANA DINERO YA!!!", '<a href="https://tudominio.com">x</a>');
    const text = signals.map((s) => s.text).join(" ");
    expect(text).toMatch(/MAYÚSCULAS/);
    expect(text).toMatch(/signos repetidos/);
    expect(text).toMatch(/enlace de ejemplo/);
  });

  it("sustituye el enlace de ejemplo por la web o el correo del remitente", () => {
    const html = '<a data-cta href="https://tudominio.com">Ver</a>';
    expect(resolvePlaceholderLinks(html, { senderWebsite: "acme.com" })).toContain('href="https://acme.com/"');
    expect(resolvePlaceholderLinks(html, { senderEmail: "ana@acme.com" })).toContain('href="mailto:ana@acme.com"');
    expect(resolvePlaceholderLinks(html, {})).toBe(html);
  });

  it("añade el aviso de baja con enlace de respuesta", () => {
    const out = withUnsubscribeNotice("<p>Hola</p>", "ana@acme.com");
    expect(out).toContain("mailto:ana@acme.com?subject=BAJA");
    expect(out.startsWith("<p>Hola</p>")).toBe(true);
  });
});

describe("clasificación de sitios web", () => {
  it("distingue web propia, redes sociales y directorios", () => {
    expect(classifyWebsite("https://clinicasonrisa.com").kind).toBe("own");
    expect(classifyWebsite("https://www.instagram.com/sonrisa")).toEqual({ kind: "social", platform: "instagram" });
    expect(classifyWebsite("https://www.doctoralia.com.pa/x").kind).toBe("directory");
    expect(classifyWebsite("https://panama.interyellow.com/x").kind).toBe("directory");
  });

  it("conserva el negocio y mueve la red social a `social`", () => {
    const [p] = sanitizeProspectWebsites([prospect({ website: "https://facebook.com/sonrisa" })]);
    expect(p.website).toBe("");
    expect(p.social?.facebook).toBe("https://facebook.com/sonrisa");
  });
});
