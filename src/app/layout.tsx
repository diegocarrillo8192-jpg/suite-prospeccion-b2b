import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://suite-prospeccion-b2b.vercel.app"),
  title: "Suite de Prospección B2B",
  description:
    "Buscador de leads y emisor de correos masivos para prospección B2B.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
  },
  openGraph: {
    title: "Suite de Prospección B2B",
    description:
      "Buscador de leads y emisor de correos masivos para prospección B2B.",
    url: "https://suite-prospeccion-b2b.vercel.app",
    siteName: "Suite de Prospección B2B",
    locale: "es",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Suite de Prospección B2B",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Suite de Prospección B2B",
    description:
      "Buscador de leads y emisor de correos masivos para prospección B2B.",
    images: ["/og.png"],
  },
};

/**
 * Decide antes del primer pintado si el splash se reproduce (primera visita de
 * la sesión) o se omite. Corre durante el parseo del HTML, así la interfaz
 * nunca se ve antes que el splash. `window.__b2bSplash` conserva la decisión
 * porque React reinicia los atributos de <html> al remontar en desarrollo.
 */
const SPLASH_SCRIPT = `(function(){var m="play";try{if(sessionStorage.getItem("b2b.splash.seen")==="1")m="skip";else sessionStorage.setItem("b2b.splash.seen","1")}catch(e){}window.__b2bSplash=m;if(m==="skip")document.documentElement.setAttribute("data-splash","skip")})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
