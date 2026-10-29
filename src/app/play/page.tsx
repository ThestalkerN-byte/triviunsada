
import Link from "next/link";
import { Suspense } from "react";
import { InstitutionalHeader } from "../institutional-header";
import { PlayPanel } from "./play-panel";

export default function PlayPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <InstitutionalHeader />

      <Link
        href="/"
        className="text-sm text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
      >
        Volver al inicio
      </Link>

      <h1 className="mt-6 text-4xl text-primary-900">Modo individual</h1>

      <Suspense fallback={<p className="mt-8">Cargando el banco…</p>}>
        <PlayPanel />
      </Suspense>
    </main>
  );
}
