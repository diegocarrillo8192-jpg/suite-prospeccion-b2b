import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AppStateProvider } from "@/components/app-state";
import { EmailSender } from "@/components/email-sender";

const CSV = [
  "nombre,empresa,correo,ciudad",
  "Ana Pérez,Acme SA,ana@acme.com,Madrid",
  "Luis Gómez,Globex,luis@globex.com,Bogotá",
].join("\n");

function renderSender() {
  return render(
    <AppStateProvider>
      <EmailSender />
    </AppStateProvider>
  );
}

function uploadCsv(container: HTMLElement, content = CSV, name = "prospectos.csv") {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("No se encontró el input de CSV");
  const file = new File([content], name, { type: "text/csv" });
  fireEvent.change(input, { target: { files: [file] } });
}

function fieldValue(label: string): string {
  const el = screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;
  return el.value;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Emisor de Correos — flujo completo de campaña", () => {
  it("a) carga y parsea el CSV mapeando encabezados automáticamente", async () => {
    const { container } = renderSender();
    expect(screen.getByText(/Arrastra tu CSV aquí o selecciónalo manualmente/i)).toBeTruthy();

    uploadCsv(container);

    await waitFor(() => {
      expect(screen.getByText(/Ana Pérez/)).toBeTruthy();
    });
    expect(screen.getByText(/Luis Gómez/)).toBeTruthy();
    expect(
      screen.getByText(/2 contactos importados automáticamente desde prospectos.csv/i)
    ).toBeTruthy();
    expect(screen.getByText(/ana@acme.com · Madrid/)).toBeTruthy();
  });

  it("b) cambia entre las plantillas prediseñadas", () => {
    renderSender();

    const corporativa = screen.getByRole("button", { name: /Corporativa/ });
    expect(corporativa.getAttribute("aria-pressed")).toBe("true");
    expect(fieldValue("Asunto")).toBe("Propuesta de colaboración para {{empresa}}");

    fireEvent.click(screen.getByRole("button", { name: /Carta Comercial/ }));
    expect(fieldValue("Asunto")).toBe("Una propuesta pensada para {{empresa}}");
    expect(screen.getByText("Atentamente,")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Carta Comercial/ }).getAttribute("aria-pressed")
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /Promocional/ }));
    expect(fieldValue("Asunto")).toBe("{{empresa}}: una oportunidad para crecer");
    expect(screen.getByText(/Potenciá Lumen Digital/)).toBeTruthy();
  });

  it("c) actualiza la vista previa en tiempo real desde el editor visual", async () => {
    renderSender();

    fireEvent.change(screen.getByLabelText("Mensaje Principal"), {
      target: { value: "Propuesta exclusiva para {{empresa}} en {{ciudad}}" },
    });
    await waitFor(() => {
      expect(
        screen.getByText(/Propuesta exclusiva para Lumen Digital en Buenos Aires/)
      ).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Texto del Botón (CTA)"), {
      target: { value: "Reservar ahora" },
    });
    expect(screen.getByText("Reservar ahora")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Enlace del Botón (CTA)"), {
      target: { value: "https://acme.com/agenda" },
    });
    const anchor = screen.getByText("Reservar ahora").closest("a");
    expect(anchor?.getAttribute("href")).toBe("https://acme.com/agenda");

    fireEvent.change(screen.getByLabelText("Firma Personalizada"), {
      target: { value: "Cordiales saludos,\nEquipo Comercial" },
    });
    const firmaPreview = screen
      .getAllByText(/Equipo Comercial/)
      .find((el) => el.tagName === "P");
    expect(firmaPreview?.textContent).toContain("Equipo Comercial");
  });

  it("d) conmuta al modo Código HTML y conserva los campos editados", () => {
    renderSender();

    fireEvent.change(screen.getByLabelText("Mensaje Principal"), {
      target: { value: "Contenido de código" },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Código HTML" }));
    const code = screen.getByLabelText("Código HTML") as HTMLTextAreaElement;
    expect(code.value).toContain("<!--F:mensaje-->Contenido de código<!--/F:mensaje-->");
    expect(code.value).toContain("data-cta");

    fireEvent.click(screen.getByRole("tab", { name: "Editor Visual" }));
    expect(fieldValue("Mensaje Principal")).toBe("Contenido de código");
  });

  it("e) valida los ajustes del remitente y simula el envío de la campaña", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, id: `msg_${String(input)}`, hasBody: Boolean(init?.body) }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderSender();

    // 1. Abrir ajustes y validar correo inválido
    fireEvent.click(screen.getByRole("button", { name: /Ajustes del Remitente/ }));
    const email = screen.getByLabelText("Correo Remitente");
    fireEvent.change(email, { target: { value: "correo-invalido" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar Remitente" }));
    expect(screen.getByText("Ingresa un correo remitente válido.")).toBeTruthy();

    // 2. Guardar configuración válida
    fireEvent.change(email, { target: { value: "ventas@acme.com" } });
    fireEvent.change(screen.getByLabelText("Nombre del Remitente"), {
      target: { value: "Ana | Acme SA" },
    });
    fireEvent.change(screen.getByLabelText("Servidor SMTP"), {
      target: { value: "smtp.acme.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar Remitente" }));
    expect(screen.getByText(/Configuración guardada/)).toBeTruthy();

    // 3. Enviar correo de prueba (simulado)
    fireEvent.click(screen.getByRole("button", { name: /Enviar Correo de Prueba/ }));
    await waitFor(() => {
      expect(
        screen.getByText(/Correo de prueba enviado a ventas@acme.com/)
      ).toBeTruthy();
    });

    // 4. Cerrar ajustes y cargar destinatarios
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));

    uploadCsv(container);
    await waitFor(() => {
      expect(screen.getByText(/Ana Pérez/)).toBeTruthy();
    });

    // 5. Lanzar la campaña
    fireEvent.click(screen.getByRole("button", { name: "Enviar Campaña" }));
    expect(screen.getByText("Confirmar envío")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar envío" }));

    await waitFor(
      () => {
        expect(screen.getByText("Envío finalizado")).toBeTruthy();
      },
      { timeout: 10000 }
    );

    const stat = screen.getByText("Enviados").closest("div");
    expect(stat?.textContent).toContain("2");

    const sendCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/send")
    );
    const testCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/send-test")
    );
    expect(sendCalls).toHaveLength(2);
    expect(testCalls).toHaveLength(1);

    const payload = JSON.parse(String((sendCalls[0][1] as RequestInit).body));
    expect(payload.to).toBe("ana@acme.com");
    expect(payload.senderEmail).toBe("ventas@acme.com");
    expect(payload.senderName).toBe("Ana | Acme SA");
    expect(String(payload.body)).toContain("Ana Pérez");
  });
});
