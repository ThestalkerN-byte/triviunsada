import Link from "next/link";
import { JoinPanel } from "./join-panel";

export default function JoinPage() {
  return (
    <main>
      <Link
        href="/"
        className="text-sm text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Volver al inicio
      </Link>
      <h1 className="mt-6 text-4xl">Unirse</h1>
      <JoinPanel />
    </main>
  );
}
