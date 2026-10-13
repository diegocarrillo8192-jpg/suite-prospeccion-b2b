"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  Download,
  FileUp,
  FlaskConical,
  Lightbulb,
  PenLine,
  PlugZap,
  Search,
  Send,
  SlidersHorizontal,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { useAppState } from "./app-state";
import { PageHeader } from "./ui";
import type { TabId } from "@/lib/types";

interface Step {
  icon: LucideIcon;
  title: string;
  summary: string;
  body: ReactNode;
  example?: ReactNode;
  go?: { tab: TabId; label: string; dialog?: "sender" };
}

const SEARCH_EXAMPLES: { niche: string; city: string; why: string }[] = [
  { niche: "Clínicas dentales", city: "Ciudad de Panamá", why: "Panamá · salud" },
  { niche: "Restaurantes", city: "Bogotá", why: "Colombia · gastronomía" },
  { niche: "Inmobiliarias", city: "Ciudad de México", why: "México · bienes raíces" },
  { niche: "Abogados", city: "Madrid", why: "España · legal" },
  { niche: "Gimnasios", city: "Miami", why: "EE. UU. · fitness" },
  { niche: "Talleres mecánicos", city: "David, Chiriquí", why: "Panamá · automotriz" },
  { niche: "Hoteles boutique", city: "Cartagena", why: "Colombia · turismo" },
  { niche: "Agencias de marketing", city: "Buenos Aires", why: "Argentina · servicios B2B" },
];

const VARIABLES: [string, string, string][] = [
  ["{{nombre}}", "Contacto o «equipo de {empresa}»", "Hola equipo de Clínica Sonrisa,"],
  ["{{empresa}}", "Nombre del negocio", "Propuesta para Clínica Sonrisa"],
  ["{{ciudad}}", "Ciudad del prospecto", "…negocios en Ciudad de Panamá"],
  ["{{rubro}}", "Nicho o categoría", "…para clínicas dentales como la suya"],
  ["{{sitio_web}}", "Dominio del sitio", "Revisamos clinicasonrisa.com"],
  ["{{telefono}}", "Teléfono del prospecto", "+507 6000-0000"],
  ["{{nombre_remitente}}", "Tu nombre (Ajustes)", "Ana Pérez"],
  ["{{empresa_remitente}}", "Tu empresa (Nombre | Empresa)", "Acme Digital"],
  ["{{logo}}", "Tu logo (Ajustes del Remitente)", "Imagen en la cabecera"],
];

const FAQ: [string, string][] = [
  [
    "¿Por qué algunos prospectos no tienen correo?",
    "Muchos negocios no publican su correo. La app visita su sitio web (inicio, contacto, aviso legal) para encontrarlo. Si no tienen web propia, usa el teléfono o WhatsApp que también se extraen.",
  ],
  [
    "¿Funciona en otros países?",
    "Sí. Escribe la ciudad y, si hay ambigüedad, añade el país: «Santiago, Chile», «Valencia, Venezuela», «Colón, Panamá». Los teléfonos se formatean con el prefijo internacional correcto.",
  ],
  [
    "¿Cómo evito caer en spam?",
    "Valida los correos antes de enviar, mantén pausas de 10–30 s, envía lotes moderados (Gmail: hasta ~500/día), personaliza con {{empresa}} y usa un dominio propio con SPF/DKIM en Resend o SendGrid.",
  ],
  [
    "¿Dónde se guardan mis datos y claves?",
    "Solo en este navegador (localStorage). No hay base de datos externa. Si cambias de equipo, exporta tus prospectos a Excel o CSV.",
  ],
  [
    "¿Qué significa «Oportunidad alta»?",
    "El análisis del sitio detectó problemas que puedes ofrecer resolver: sin SSL, sin analítica, CMS antiguo, sin e-commerce, etc. Pasa el cursor sobre la etiqueta para ver los motivos.",
  ],
  [
    "Una API falló, ¿pierdo la búsqueda?",
    "No. Si Google Places o Apify fallan (clave, cuota, red), la app usa automáticamente el motor local gratuito y te avisa.",
  ],
];

export function Guide() {
  const { setTab, openDialog, setSearchDraft } = useAppState();
  const [open, setOpen] = useState<number>(0);

  const steps: Step[] = [
    {
      icon: PlugZap,
      title: "Conecta tu correo",
      summary: "Configura el remitente una sola vez.",
      body: (
        <>
          <p>
            Ve a <b>Conectores › Envío de correos</b>, elige el canal y rellena tu nombre y correo. Pulsa{" "}
            <b>Probar Conexión</b> y luego <b>Enviar Correo de Prueba</b>. Si quieres, sube tu <b>logo</b> para que
            aparezca en la cabecera de los correos.
          </p>
          <p className="mt-2">
            La búsqueda funciona sin claves. Google Places o Apify son opcionales para más volumen.
          </p>
        </>
      ),
      example: (
        <ExampleBox>
          Canal: <b>Gmail / App Password</b> · Nombre: <code>Ana Pérez | Acme Digital</code> · Correo:{" "}
          <code>ana@acmedigital.com</code> · App Password: 16 caracteres generados en tu cuenta de Google
          (Seguridad › Contraseñas de aplicaciones).
        </ExampleBox>
      ),
      go: { tab: "connectors", label: "Abrir Conectores" },
    },
    {
      icon: Search,
      title: "Busca prospectos",
      summary: "Nicho + ciudad de cualquier país.",
      body: (
        <p>
          En el <b>Buscador</b> escribe el nicho y la ubicación, elige la cantidad (10 a 100) y pulsa{" "}
          <b>Buscar Prospectos</b>. Deja activo el <b>rastreo profundo</b> para obtener correos y redes en la misma
          búsqueda. Tarda entre 20 y 60 segundos según la cantidad.
        </p>
      ),
      example: (
        <ExampleBox>
          Nicho: <code>Clínicas dentales</code> · Ciudad: <code>Ciudad de Panamá</code> · Cantidad: <code>25</code>
          <br />
          Resultado típico: nombre, teléfono +507, WhatsApp, dirección, web, calificación, correo y redes.
        </ExampleBox>
      ),
      go: { tab: "search", label: "Ir al Buscador" },
    },
    {
      icon: SlidersHorizontal,
      title: "Filtra y prioriza",
      summary: "Quédate con los mejores leads.",
      body: (
        <p>
          Usa los filtros <b>Con correo</b>, <b>Con teléfono</b>, <b>Oportunidad alta</b> o <b>Sin contactar</b>, y ordena
          por calificación o número de reseñas. Haz clic en una fila para seleccionarla.
        </p>
      ),
      example: (
        <ExampleBox>
          Para vender diseño web: filtra <b>Oportunidad alta</b> y ordena por <b>Más reseñas</b>: negocios populares con un
          sitio mejorable.
        </ExampleBox>
      ),
    },
    {
      icon: Wand2,
      title: "Enriquece y valida",
      summary: "Más correos y menos rebotes.",
      body: (
        <p>
          <b>Enriquecer</b> visita la web de cada prospecto y extrae correos, redes, SSL y tecnologías. <b>Validar
          correos</b> comprueba sintaxis, registros MX, dominios desechables y catch-all. Envía solo a los marcados como{" "}
          <b>Válido</b> para proteger tu reputación.
        </p>
      ),
    },
    {
      icon: Download,
      title: "Exporta si lo necesitas",
      summary: "Excel, PDF o CSV.",
      body: (
        <p>
          En <b>Exportar</b> descarga un Excel con todas las columnas, un reporte PDF con estadísticas o un CSV para tu
          CRM. Se exportan los seleccionados o, si no hay selección, los visibles.
        </p>
      ),
    },
    {
      icon: FileUp,
      title: "Prepara los destinatarios",
      summary: "Llegan solos desde el Buscador, o sube tu base.",
      body: (
        <p>
          Con <b>Enviar a la campaña automáticamente</b> activado (viene así por defecto), cada prospecto con correo que
          encuentres o enriquezcas queda listo en <b>Campañas</b>: no tienes que descargar ni volver a subir nada. Si prefieres
          elegir a mano, en Campañas pulsa <b>Cargar del Buscador</b>: verás todos los contactos con correo de todas tus
          búsquedas, con filtros por rubro y ciudad, y marcas con casillas a quién enviar. ¿Ya
          tienes tus propios contactos? Pulsa <b>Importar base de datos</b> (en el Buscador) o <b>Subir base</b> (en
          Campañas): acepta Excel (.xlsx), CSV o una lista pegada desde Google Sheets. Las columnas se detectan solas
          (nombre, empresa, correo, teléfono, web, ciudad, rubro…); los duplicados se omiten y los contactos sin correo
          pero con web pasan al Buscador para encontrar su correo con <b>Enriquecer</b>.
        </p>
      ),
      example: (
        <ExampleBox>
          <code className="block whitespace-pre">
            {"nombre,empresa,correo,ciudad,rubro\nAna Pérez,Acme SA,ana@acme.com,Panamá,Software"}
          </code>
        </ExampleBox>
      ),
      go: { tab: "sender", label: "Ir a Campañas" },
    },
    {
      icon: PenLine,
      title: "Personaliza la plantilla",
      summary: "Plantillas para cualquier nicho.",
      body: (
        <p>
          Elige una plantilla y edita el saludo, mensaje, botón y firma en el <b>Editor Visual</b> (o el HTML en modo
          avanzado). Inserta variables para personalizar cada correo; la vista previa usa tu primer destinatario real.
        </p>
      ),
      example: (
        <ExampleBox>
          <i>«Hola {"{{nombre}}"}, vimos que {"{{empresa}}"} es referente en {"{{rubro}}"} en {"{{ciudad}}"}…»</i>
          <br />→ «Hola equipo de Clínica Sonrisa, vimos que Clínica Sonrisa es referente en clínicas dentales en Ciudad
          de Panamá…»
        </ExampleBox>
      ),
    },
    {
      icon: FlaskConical,
      title: "Prueba y envía",
      summary: "Con pausas humanas anti-spam.",
      body: (
        <p>
          Pulsa <b>Enviarme una prueba</b> para revisar el correo en tu bandeja. Ajusta las pausas (10–30 s) y pulsa{" "}
          <b>Enviar Campaña</b>. Puedes pausar, reanudar o detener; mantén la pestaña abierta durante el envío.
        </p>
      ),
    },
    {
      icon: BarChart3,
      title: "Mide resultados",
      summary: "Historial y embudo en el Panel.",
      body: (
        <p>
          El <b>Panel</b> muestra el embudo (encontrados → con correo → validados → contactados) y el historial de
          campañas con el detalle y los errores de cada destinatario. Los prospectos ya contactados se marcan para no
          repetirlos.
        </p>
      ),
      go: { tab: "dashboard", label: "Ver Panel" },
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Manual de uso"
        title="De cero a tu primera campaña"
        description="Sigue estos pasos para encontrar empresas, conseguir sus correos y enviarles una campaña personalizada."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <ol className="space-y-3">
          {steps.map((step, i) => {
            const expanded = open === i;
            const Icon = step.icon;
            return (
              <li key={step.title} className="card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? -1 : i)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[0.02]"
                >
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-cyan-400/10 text-violet-200">
                    <Icon className="h-[18px] w-[18px]" />
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">{step.title}</span>
                    <span className="block text-xs text-slate-500">{step.summary}</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-slate-500 transition ${expanded ? "rotate-180" : ""}`} />
                </button>
                {expanded && (
                  <div className="animate-fade-in border-t border-white/[0.06] px-5 py-4 text-sm leading-relaxed text-slate-300">
                    {step.body}
                    {step.example}
                    {step.go && (
                      <button
                        type="button"
                        onClick={() => {
                          setTab(step.go!.tab);
                          if (step.go!.dialog) openDialog(step.go!.dialog);
                        }}
                        className="btn btn-sm btn-primary mt-4"
                      >
                        {step.go.label} <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className="card card-pad">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-300" />
              <p className="text-sm font-semibold text-white">Ejemplos de búsqueda</p>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Haz clic para cargarlos en el Buscador.</p>
            <ul className="mt-3 space-y-1.5">
              {SEARCH_EXAMPLES.map((ex) => (
                <li key={`${ex.niche}-${ex.city}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchDraft({ niche: ex.niche, city: ex.city });
                      setTab("search");
                    }}
                    className="group flex w-full items-center gap-2 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2 text-left transition hover:border-violet-400/30 hover:bg-violet-500/5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-slate-200">
                        {ex.niche} · {ex.city}
                      </span>
                      <span className="block text-[10px] text-slate-500">{ex.why}</span>
                    </span>
                    <Send className="h-3 w-3 text-slate-600 group-hover:text-violet-300" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="card card-pad">
            <p className="text-sm font-semibold text-white">Variables disponibles</p>
            <ul className="mt-3 space-y-2">
              {VARIABLES.map(([token, desc, sample]) => (
                <li key={token} className="text-[11px]">
                  <code className="rounded bg-violet-500/10 px-1.5 py-0.5 font-mono text-violet-200">{token}</code>
                  <span className="ml-1.5 text-slate-400">{desc}</span>
                  <span className="block pl-1 text-slate-600">Ej.: {sample}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">Preguntas frecuentes</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="card group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-slate-100">
                {q}
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function ExampleBox({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] px-4 py-3 text-xs leading-relaxed text-slate-300">
      <p className="mb-1 text-[10px] font-semibold tracking-wider text-cyan-300 uppercase">Ejemplo</p>
      {children}
    </div>
  );
}
