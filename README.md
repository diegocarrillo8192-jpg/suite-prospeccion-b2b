# Suite de Prospección B2B

Aplicación web para **encontrar empresas por nicho y ciudad en cualquier país**, obtener sus correos, WhatsApp y redes sociales, analizar su sitio web y **enviarles campañas de correo personalizadas** con pausas anti-spam.

Todo funciona **sin API Keys** gracias al motor local gratuito. Google Places y Apify son opcionales.

## Secciones

| Sección | Qué hace |
| --- | --- |
| **Panel** | Embudo (encontrados → con correo → validados → contactados), primeros pasos, historial de campañas con el detalle por destinatario y búsquedas recientes. |
| **Buscador** | Nicho + ciudad (o varias ciudades separadas por `;`), catálogo de 150+ nichos, 10 a 100 resultados, rastreo profundo de sitios, filtro de duplicados. Tabla con filtros, orden, acciones masivas, exportación Excel/PDF/CSV y vista en tarjetas en móvil. |
| **Emisor de Correos** | Constructor de campaña paso a paso (Para → De → Asunto → Contenido → Envío), 7 plantillas para cualquier nicho, logo de marca, texto de vista previa, revisión de entregabilidad, cuota diaria, prueba a tu correo, envío con pausa/reanudar y registro por destinatario. |
| **Conectores** | Motor local, Google Places API, Apify y canales de correo (Gmail, SMTP, Resend, SendGrid, Simulado) con botón **Probar** y guía para obtener cada clave. |
| **Manual de uso** | Guía paso a paso con ejemplos, variables disponibles y preguntas frecuentes. |

## Cómo funciona el motor local gratuito

1. **Geocodifica** la ciudad con OpenStreetMap (Nominatim) para obtener país, coordenadas y prefijo telefónico.
2. **Extrae de Google Maps** con un navegador Chromium sin interfaz (Playwright) y completa con el endpoint interno de Maps paginado (20 en 20) y sinónimos del nicho hasta llegar a la cantidad pedida.
3. Si Maps no responde, recurre a **OpenStreetMap (Overpass)** y a resultados web (Bing / DuckDuckGo).
4. **Rastrea el sitio web** de cada negocio (inicio, contacto, aviso legal…) para extraer correos, WhatsApp, redes sociales, SSL y tecnologías, y calcula la *oportunidad web*.
5. Descarta directorios (Doctoralia, Páginas Amarillas, Yelp…) como «sitio web» y mueve los enlaces de Instagram/Facebook a redes sociales.
6. Si el sitio no publica correo, sugiere `info@dominio` **solo** si el dominio tiene registros MX activos.

Si una API (Google Places / Apify) falla por clave, cuota o red, la búsqueda continúa automáticamente con el motor local y se muestra un aviso.

## Requisitos

- Node.js 20+
- Navegador de Playwright para el scraping local:

```bash
npm run setup
```

## Puesta en marcha

```bash
npm install
```

```bash
npm run dev
```

Abre <http://localhost:3000>.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción |
| `npm run lint` | ESLint |
| `npm test` | Pruebas (Vitest + Testing Library) |

## Cumplimiento y entregabilidad

- Cada correo puede incluir un aviso para darse de baja («responde BAJA») y siempre lleva la cabecera `List-Unsubscribe`, que Gmail y Yahoo muestran como botón.
- La **lista de bajas** (Emisor › Para › Lista de bajas) excluye esos correos de todas las campañas.
- Envío uno a uno con pausas aleatorias de 10–30 s, contador de envíos diarios por canal y revisión de palabras que activan filtros de spam.
- El enlace de ejemplo de las plantillas (`tudominio.com`) se sustituye por tu web (Ajustes del Remitente) o, si no la tienes, por tu correo.

## Privacidad

Prospectos, campañas, borradores y claves se guardan **solo en el `localStorage` del navegador** (las claves, ofuscadas). El servidor no persiste datos: únicamente actúa de intermediario hacia los proveedores.

## Despliegue

Con Docker (incluye Chromium para el scraping):

```bash
docker build -t suite-prospeccion-b2b .
```

```bash
docker run -p 3000:3000 suite-prospeccion-b2b
```

El scraping con Playwright necesita un servidor Node con Chromium (VPS, Docker, Railway, Render…). En plataformas *serverless* sin navegador (p. ej. Vercel) el motor local usa automáticamente los métodos HTTP de respaldo, con menos cobertura; ahí conviene configurar Google Places o Apify.
