import Link from "next/link";
import { HostPanel } from "./host-panel";

export default function HostPage() {
  return (
    <main>
      <Link
        href="/"
        className="text-sm text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Volver al inicio
      </Link>
      <h1 className="mt-6 text-4xl sm:text-5xl">Crear sala</h1>
      <HostPanel />
    </main>
  );
}
