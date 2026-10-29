"use client";

import { CONFIG_ACCESS_KEY, credentialsMatch } from "@/config/access";
import { Suspense, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { AdminPanel } from "./admin-panel";

const fieldClass =
  "w-full rounded-xl border border-sand-100 bg-sand-50 px-3 py-3 text-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500";
const primaryClass =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-primary-700 px-5 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500";
const secondaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-sand-100 bg-white px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readAccess() {
  return window.sessionStorage.getItem(CONFIG_ACCESS_KEY) === "1";
}

function publishAccess(open: boolean) {
  if (open) window.sessionStorage.setItem(CONFIG_ACCESS_KEY, "1");
  else window.sessionStorage.removeItem(CONFIG_ACCESS_KEY);
  for (const listener of listeners) listener();
}

export function ConfigGate() {
  const open = useSyncExternalStore(subscribe, readAccess, () => false);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!credentialsMatch(user, password)) {
      setError("Usuario o contraseña incorrectos.");
      return;
    }
    setError(null);
    setPassword("");
    publishAccess(true);
  }

  if (!open) {
    return (
      <>
        <h1 className="mt-6 text-4xl text-primary-900">Configuración</h1>
        <form className="mt-8 grid max-w-md gap-4" onSubmit={enter} autoComplete="off">
          <label className="grid gap-2" htmlFor="config-user">
            Usuario
            <input
              id="config-user"
              className={fieldClass}
              autoComplete="off"
              value={user}
              onChange={(event) => setUser(event.target.value)}
            />
          </label>
          <label className="grid gap-2" htmlFor="config-password">
            Contraseña
            <input
              id="config-password"
              className={fieldClass}
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? (
            <p role="alert" className="text-red-800">
              {error}
            </p>
          ) : null}
          <button type="submit" className={primaryClass}>
            Entrar
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl text-primary-900">Configuración</h1>
        <button type="button" className={secondaryClass} onClick={() => publishAccess(false)}>
          Salir
        </button>
      </div>
      <p className="mt-4 max-w-xl text-lg leading-relaxed">
        Las carreras y las preguntas quedan guardadas en este navegador.
      </p>
      <Suspense fallback={<p className="mt-8">Cargando el banco…</p>}>
        <AdminPanel />
      </Suspense>
    </>
  );
}
