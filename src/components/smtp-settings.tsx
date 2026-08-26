"use client";

import { useState, useSyncExternalStore } from "react";
import {
  clearEncryptedCredentials,
  encryptCredentials,
  getCredentialsSnapshot,
  saveEncryptedCredentials,
  subscribeCredentials,
} from "@/lib/encryption";

export function SmtpSettings() {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const saved = useSyncExternalStore(subscribeCredentials, getCredentialsSnapshot, () => null) !== null;

  async function onSave() {
    if (!host || !user || !pass || !passphrase) {
      setMsg("Completa todos los campos y define una frase de cifrado.");
      return;
    }
    try {
      const blob = await encryptCredentials({ host, port, user, pass }, passphrase);
      saveEncryptedCredentials(blob);
      setMsg("Credenciales cifradas (AES-256-GCM) y guardadas localmente.");
      setPass("");
      setPassphrase("");
    } catch {
      setMsg("No se pudo cifrar en este navegador.");
    }
  }

  function onClear() {
    clearEncryptedCredentials();
    setMsg("Credenciales eliminadas.");
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Credenciales SMTP (opcional)</h3>
          <p className="mt-1 text-xs text-slate-500">Se guardan cifradas en tu dispositivo.</p>
        </div>
        <span className="text-slate-400">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="smtp.host.com"
              aria-label="Servidor SMTP"
              className="col-span-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
            />
            <input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="587"
              aria-label="Puerto SMTP"
              className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
            />
          </div>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="usuario@dominio.com"
            aria-label="Usuario SMTP"
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
          />
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Contraseña SMTP"
            aria-label="Contraseña SMTP"
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
          />
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Frase de cifrado (no se guarda)"
            aria-label="Frase de cifrado"
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
          />
          <div className="flex gap-2">
            <button
              onClick={onSave}
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400"
            >
              Guardar cifrado
            </button>
            {saved && (
              <button
                onClick={onClear}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
              >
                Borrar
              </button>
            )}
          </div>
          {saved && <p className="text-xs text-emerald-400">● Credenciales almacenadas (cifradas)</p>}
          {msg && <p className="text-xs text-slate-400">{msg}</p>}
        </div>
      )}
    </div>
  );
}
