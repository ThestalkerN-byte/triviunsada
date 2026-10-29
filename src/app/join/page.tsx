
import Link from "next/link";
import { InstitutionalHeader } from "../institutional-header";
import { JoinPanel } from "./join-panel";

export default function JoinPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <InstitutionalHeader />

      <Link
        href="/"
        className="text-sm text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
      >
        Volver al inicio
      </Link>

      <h1 className="mt-6 text-4xl text-primary-900">Unirse</h1>

      <JoinPanel />
    </main>
  );
}
