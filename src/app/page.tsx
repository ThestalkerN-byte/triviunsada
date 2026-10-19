import Link from "next/link";

const entries = [
  {
    href: "/play",
    title: "Modo individual",
    description: "Elegí una carrera y respondé el test.",
  },
  {
    href: "/host",
    title: "Crear sala",
    description: "Abrí una partida y proyectala.",
  },
  {
    href: "/join",
    title: "Unirse",
    description: "Entrá con el PIN y un nickname.",
  },
] as const;

export default function Home() {
  return (
    <main>
      <p className="text-sm tracking-[0.18em] text-accent uppercase">
        Universidad y territorio
      </p>
      <h1 className="mt-3 text-5xl leading-tight">Triviunsada</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed">
        Trivia por carrera para evaluar y aprender. El contenido queda en este
        navegador.
      </p>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {entries.map((entry) => (
          <li key={entry.href}>
            <Link
              href={entry.href}
              className="block h-full rounded-2xl border border-line bg-card px-5 py-6 transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <h2 className="text-2xl">{entry.title}</h2>
              <p className="mt-2 leading-relaxed">{entry.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
