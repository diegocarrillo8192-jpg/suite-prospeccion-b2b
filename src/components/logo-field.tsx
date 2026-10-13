"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Link2, Trash2 } from "lucide-react";

const MAX_W = 440;
const MAX_H = 160;

/** Reduce la imagen a un tamaño apto para correo y la devuelve como data URI. */
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const scale = Math.min(1, MAX_W / img.width, MAX_H / img.height);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        ctx.drawImage(img, 0, 0, w, h);
        // PNG conserva la transparencia; si pesa demasiado se pasa a JPEG.
        let data = canvas.toDataURL("image/png");
        if (data.length > 180_000) {
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
          data = canvas.toDataURL("image/jpeg", 0.88);
        }
        resolve(data);
      };
      img.src = String(reader.result ?? "");
    };
    reader.readAsDataURL(file);
  });
}

export function LogoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [urlMode, setUrlMode] = useState(false);
  const isData = value.startsWith("data:");

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) {
      setError("Formato no soportado. Usa PNG, JPG, GIF o WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("La imagen supera 5 MB.");
      return;
    }
    try {
      onChange(await resizeImage(file));
      setError(null);
    } catch {
      setError("No se pudo procesar la imagen.");
    }
  }

  return (
    <div>
      <span className="label">Logo de tu marca (opcional)</span>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
        <div className="flex h-14 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa de un data URI o URL externa
            <img src={value} alt="Logo" className="max-h-12 max-w-[7.5rem] object-contain" />
          ) : (
            <span className="text-[10px] text-slate-400">Sin logo</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-sm btn-secondary">
            <ImagePlus className="h-3.5 w-3.5" /> Subir imagen
          </button>
          <button type="button" onClick={() => setUrlMode((m) => !m)} className="btn btn-sm btn-ghost">
            <Link2 className="h-3.5 w-3.5" /> Usar URL
          </button>
          {value && (
            <button type="button" onClick={() => onChange("")} className="btn btn-sm btn-ghost" aria-label="Quitar logo">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {urlMode && (
        <input
          value={isData ? "" : value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="https://tudominio.com/logo.png"
          aria-label="URL del logo"
          className="input mt-2 text-xs"
        />
      )}
      <p className="mt-1.5 text-[11px] text-slate-500">
        Aparece en la cabecera de las plantillas mediante la variable {"{{logo}}"}. Las imágenes subidas se incrustan
        en el correo para que se vean en Gmail y Outlook.
      </p>
      {error && <p className="mt-1 text-[11px] text-rose-400">{error}</p>}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={onFile} className="hidden" />
    </div>
  );
}
