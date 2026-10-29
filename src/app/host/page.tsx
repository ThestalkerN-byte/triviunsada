
import Link from "next/link";
import { InstitutionalHeader } from "../institutional-header";
import { HostPanel } from "./host-panel";

export default function HostPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <InstitutionalHeader />

      <Link
        href="/"
        className="text-sm text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
      >
        Volver al inicio
      </Link>

      <h1 className="mt-6 text-4xl text-primary-900 sm:text-5xl">Crear sala</h1>

      <HostPanel />
    </main>
  );
}
