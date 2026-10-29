
import Link from "next/link";

export function InstitutionalHeader() {
  return (
    <header className="mb-8 flex items-center gap-4 rounded-2xl border border-line bg-card px-4 py-4 shadow-sm sm:px-6">
      <Link
        href="/"
        aria-label="Volver al inicio de Trivia UNSAdA"
        className="shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        <img
          src="/logo-unsada.png"
          alt="Logo oficial de la UNSAdA"
          className="h-14 w-14 object-contain sm:h-16 sm:w-16"
        />
      </Link>

      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-accent sm:text-xs">
          Universidad Nacional de San Antonio de Areco
        </p>

        <p className="mt-1 text-lg font-bold tracking-tight text-navy sm:text-xl">
          Trivia UNSAdA
        </p>

        <p className="text-xs text-muted sm:text-sm">
          Aprender, jugar y compartir conocimientos
        </p>
      </div>
    </header>
  );
}
