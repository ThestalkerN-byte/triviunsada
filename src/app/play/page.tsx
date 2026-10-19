import Link from "next/link";
import { Suspense } from "react";
import { PlayPanel } from "./play-panel";

export default function PlayPage() {
  return (
    <main>
      <Link
        href="/"
        className="text-sm text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Volver al inicio
      </Link>
      <h1 className="mt-6 text-4xl">Modo individual</h1>
      <Suspense fallback={<p className="mt-8">Cargando el banco…</p>}>
        <PlayPanel />
      </Suspense>
    </main>
  );
}
