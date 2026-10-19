import Link from "next/link";
import { ConfigGate } from "./config-gate";

export default function ConfigPage() {
  return (
    <main>
      <Link
        href="/"
        className="text-sm text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Volver al inicio
      </Link>
      <ConfigGate />
    </main>
  );
}
