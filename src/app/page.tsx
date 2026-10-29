
import Link from "next/link";

const entries = [
  {
    number: "01",
    href: "/play",
    title: "Modo individual",
    description:
      "Elegí tu carrera, poné a prueba tus conocimientos y aprendé con cada pregunta.",
    action: "Comenzar trivia",
    icon: "🎮",
    theme: "blue",
    label: "Jugá a tu ritmo",
  },
  {
    number: "02",
    href: "/host",
    title: "Crear sala",
    description:
      "Organizá una partida y compartí el desafío con otros estudiantes.",
    action: "Crear una partida",
    icon: "🖥️",
    theme: "gold",
    label: "Sé el anfitrión",
  },
  {
    number: "03",
    href: "/join",
    title: "Unirse a una sala",
    description:
      "Ingresá el PIN de la partida, elegí tu nickname y sumate al desafío.",
    action: "Ingresar a una sala",
    icon: "🤝",
    theme: "green",
    label: "Jugá en equipo",
  },
] as const;

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f6fa] text-slate-900">
      <header className="relative z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-10 sm:py-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-20">
              <img
                src="/logo-unsada.png"
                alt="Logo oficial de la UNSAdA"
                className="h-full w-full object-contain"
              />
            </div>

            <div>
              <p className="text-xl font-black tracking-wide text-blue-950 sm:text-2xl">
                UNSAdA
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600 sm:text-sm">
                Universidad y territorio
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-blue-950 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Plataforma académica
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900">
        <div className="absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full border border-amber-300/20 sm:h-[30rem] sm:w-[30rem]" />
        <div className="absolute right-10 top-12 -z-10 hidden h-64 w-64 rounded-full border border-amber-300/30 lg:block" />
        <div className="absolute -bottom-32 left-1/3 -z-10 h-72 w-72 rounded-full bg-blue-400/10 blur-3xl" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-10 sm:py-20 lg:grid-cols-[1.3fr_0.7fr] lg:gap-16 lg:py-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-200 sm:text-sm">
              <span>✦</span>
              Conocimiento · Comunidad · Universidad
            </div>

            <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-white sm:text-7xl lg:text-8xl">
              Trivia
              <span className="mt-2 block font-serif font-normal italic text-amber-300">
                UNSAdA
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-base leading-8 text-blue-50 sm:text-lg">
              Aprendé jugando, descubrí nuevas áreas de conocimiento y poné a
              prueba lo que sabés. ¡Tu próximo desafío empieza acá!
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/play"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-amber-400 px-6 py-4 font-extrabold text-blue-950 shadow-lg transition duration-200 hover:-translate-y-1 hover:bg-amber-300 hover:shadow-xl focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-amber-300"
              >
                🎮 Empezar a jugar
                <span className="text-xl">→</span>
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium text-blue-100">
              <span className="flex items-center gap-2">
                <span className="text-amber-300">✓</span>
                Aprendé
              </span>
              <span className="flex items-center gap-2">
                <span className="text-amber-300">✓</span>
                Participá
              </span>
              <span className="flex items-center gap-2">
                <span className="text-amber-300">✓</span>
                Superate
              </span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm lg:max-w-md">
            <div className="absolute inset-5 rounded-[2rem] bg-amber-300/20 blur-2xl" />

            <div className="relative rotate-1 rounded-[2rem] border border-white/20 bg-white/10 p-5 shadow-2xl backdrop-blur-sm sm:p-7">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-amber-300 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-blue-950">
                  Tu próximo desafío
                </span>
                <span className="text-2xl text-amber-300">✦</span>
              </div>

              <div className="my-8 flex items-center justify-center">
                <div className="flex h-36 w-36 items-center justify-center rounded-[2rem] border border-amber-200/40 bg-gradient-to-br from-amber-200 to-amber-500 text-7xl shadow-xl sm:h-44 sm:w-44 sm:text-8xl">
                  🎓
                </div>
              </div>

              <h2 className="text-center text-2xl font-black text-white sm:text-3xl">
                ¿Cuánto sabés?
              </h2>
              <p className="mt-3 text-center leading-7 text-blue-100">
                Elegí tu modalidad, respondé las preguntas y descubrí todo lo
                que podés aprender.
              </p>

              <div className="mt-6 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/10 p-3 text-center">
                  <div className="text-2xl">🧠</div>
                  <p className="mt-1 text-xs font-semibold text-white">Aprendé</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/10 p-3 text-center">
                  <div className="text-2xl">🏆</div>
                  <p className="mt-1 text-xs font-semibold text-white">Superate</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/10 p-3 text-center">
                  <div className="text-2xl">🤝</div>
                  <p className="mt-1 text-xs font-semibold text-white">Compartí</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-10 sm:py-20">
        <div className="mb-9 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700 sm:text-sm">
              Elegí tu experiencia
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-blue-950 sm:text-4xl">
              ¿Cómo querés participar?
            </h2>
            <p className="mt-3 max-w-xl leading-7 text-slate-600">
              Elegí una modalidad y comenzá tu experiencia en la Trivia
              Universitaria.
            </p>
          </div>

          <span className="hidden rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm font-semibold text-blue-950 shadow-sm sm:block">
            🎓 Una universidad, muchos desafíos
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {entries.map((entry) => {
            const colors = {
              blue: {
                icon: "bg-blue-100 text-blue-800",
                border: "hover:border-blue-400",
                label: "bg-blue-100 text-blue-800",
                button: "bg-blue-950 text-white group-hover:bg-blue-800",
                glow: "bg-blue-500",
              },
              gold: {
                icon: "bg-amber-100 text-amber-800",
                border: "hover:border-amber-400",
                label: "bg-amber-100 text-amber-900",
                button: "bg-amber-400 text-blue-950 group-hover:bg-amber-300",
                glow: "bg-amber-400",
              },
              green: {
                icon: "bg-emerald-100 text-emerald-800",
                border: "hover:border-emerald-400",
                label: "bg-emerald-100 text-emerald-800",
                button: "bg-emerald-700 text-white group-hover:bg-emerald-600",
                glow: "bg-emerald-400",
              },
            }[entry.theme];

            return (
              <Link
                key={entry.href}
                href={entry.href}
                className={`group relative flex min-h-80 flex-col overflow-hidden rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-md transition duration-300 hover:-translate-y-2 hover:shadow-xl focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-700 sm:p-7 ${colors.border}`}
              >
                <div
                  className={`absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-10 blur-2xl transition group-hover:opacity-25 ${colors.glow}`}
                />

                <div className="relative flex items-center justify-between gap-3">
                  <span className="text-sm font-black tracking-[0.15em] text-slate-400">
                    EXPERIENCIA {entry.number}
                  </span>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${colors.label}`}>
                    {entry.label}
                  </span>
                </div>

                <div className={`mt-6 flex h-16 w-16 items-center justify-center rounded-2xl text-4xl shadow-sm transition duration-300 group-hover:scale-110 ${colors.icon}`}>
                  {entry.icon}
                </div>

                <h3 className="relative mt-5 text-xl font-extrabold text-blue-950 sm:text-2xl">
                  {entry.title}
                </h3>

                <p className="relative mt-3 flex-1 text-sm leading-7 text-slate-600">
                  {entry.description}
                </p>

                <div className={`relative mt-6 flex min-h-12 items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${colors.button}`}>
                  {entry.action}
                  <span className="text-xl transition-transform duration-200 group-hover:translate-x-1">
                    →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        <footer className="mt-14 flex flex-col gap-3 border-t border-slate-200 pt-6 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo-unsada.png"
              alt=""
              className="h-10 w-10 object-contain"
            />
            <div>
              <p className="font-bold text-blue-950">Trivia UNSAdA</p>
              <p className="text-xs">Universidad y territorio</p>
            </div>
          </div>

          <p>Un espacio para aprender, participar y compartir conocimientos.</p>
        </footer>
      </section>
    </main>
  );
}


