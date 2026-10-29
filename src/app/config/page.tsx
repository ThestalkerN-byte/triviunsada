import Link from "next/link";
import { ConfigGate } from "./config-gate";

export default function ConfigPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <Link
        href="/"
        className="text-sm text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
      >
        Volver al inicio
      </Link>
      <ConfigGate />
    </main>
  );
}
