import {
  ArrowRight,
  Brain,
  Check,
  Gamepad2,
  GraduationCap,
  Handshake,
  MonitorPlay,
  Sparkles,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

const entries: {
  number: string;
  href: string;
  title: string;
  description: string;
  action: string;
  label: string;
  Icon: LucideIcon;
  iconClass: string;
  badgeClass: string;
  buttonClass: string;
  glowClass: string;
}[] = [
  {
    number: "01",
    href: "/play",
    title: "Modo individual",
    description:
      "Elegí tu carrera, poné a prueba tus conocimientos y aprendé con cada pregunta.",
    action: "Comenzar trivia",
    label: "Jugá a tu ritmo",
    Icon: Gamepad2,
    iconClass: "bg-primary-100 text-primary-700",
    badgeClass: "bg-primary-100 text-primary-900",
    buttonClass: "bg-primary-700 text-white",
    glowClass: "bg-primary-100",
  },
  {
    number: "02",
    href: "/host",
    title: "Crear sala",
    description:
      "Organizá una partida y compartí el desafío con otros estudiantes.",
    action: "Crear una partida",
    label: "Sé el anfitrión",
    Icon: MonitorPlay,
    iconClass: "bg-joy-100 text-joy-600",
    badgeClass: "bg-joy-100 text-[#8A3420]",
    buttonClass: "bg-joy-500 text-ink-900",
    glowClass: "bg-joy-100",
  },
  {
    number: "03",
    href: "/join",
    title: "Unirse a una sala",
    description:
      "Ingresá el PIN de la partida, elegí tu nickname y sumate al desafío.",
    action: "Ingresar a una sala",
    label: "Jugá en equipo",
    Icon: Users,
    iconClass: "bg-plum-100 text-plum-700",
    badgeClass: "bg-plum-100 text-plum-700",
    buttonClass: "bg-plum-700 text-white",
    glowClass: "bg-plum-100",
  },
];

const checks = ["Aprendé", "Participá", "Superate"] as const;

const miniCards: { label: string; Icon: LucideIcon }[] = [
  { label: "Aprendé", Icon: Brain },
  { label: "Superate", Icon: Trophy },
  { label: "Compartí", Icon: Handshake },
];

const heroBackground = {
  background:
    "radial-gradient(60rem 30rem at 85% 10%, rgba(242,118,90,0.18), transparent 60%), linear-gradient(135deg, #0B3B3A 0%, #0F5552 55%, #17635F 100%)",
};

export default function Home() {
  return (
    <main className="min-h-dvh overflow-hidden bg-sand-50 text-ink-900">
      <header className="relative z-10 border-b border-sand-100 bg-white">
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
              <p className="text-xl font-black tracking-wide text-primary-900 sm:text-2xl">
                UNSAdA
              </p>
              <p className="mt-1 text-xs font-medium text-ink-600 sm:text-sm">
                Universidad y territorio
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-pill bg-primary-100 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-900 sm:flex">
            <span className="h-2 w-2 rounded-full bg-primary-500" />
            Plataforma académica
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden" style={heroBackground}>
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-10 sm:py-20 lg:grid-cols-[1.3fr_0.7fr] lg:gap-16 lg:py-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-pill border border-white/25 bg-white/6 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-sage-300 sm:text-sm">
              <Sparkles className="size-4 shrink-0" aria-hidden />
              Conocimiento · Comunidad · Universidad
            </div>

            <h1 className="text-[2rem] font-black leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-7xl">
              Trivia
              <span className="mt-2 block font-serif font-normal italic text-joy-500">
                UNSAdA
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-base leading-8 text-white/88 sm:text-lg">
              Aprendé jugando, descubrí nuevas áreas de conocimiento y poné a
              prueba lo que sabés. ¡Tu próximo desafío empieza acá!
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#experiencias"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-joy-500 px-6 py-4 font-extrabold text-ink-900 transition duration-200 hover:bg-joy-600 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-joy-500 motion-reduce:transition-none"
              >
                Empezar a jugar
                <ArrowRight className="size-5" aria-hidden />
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium text-white/88">
              {checks.map((label) => (
                <span key={label} className="flex items-center gap-2">
                  <Check className="size-4 text-sage-300" aria-hidden />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm lg:max-w-md">
            <div
              className="relative rotate-1 rounded-card border border-white/22 p-5 shadow-2xl sm:p-7"
              style={{
                background: "rgba(255, 255, 255, 0.10)",
                backdropFilter: "blur(14px)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="rounded-pill bg-joy-500 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-ink-900">
                  Tu próximo desafío
                </span>
              </div>

              <div className="my-8 flex items-center justify-center">
                <div className="flex size-[7.5rem] items-center justify-center rounded-[2rem] bg-gradient-to-br from-joy-500 to-[#F8A58F] shadow-xl sm:size-44">
                  <GraduationCap
                    size={72}
                    className="text-primary-900"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                </div>
              </div>

              <h2 className="text-center text-2xl font-black text-white sm:text-3xl">
                ¿Cuánto sabés?
              </h2>
              <p className="mt-3 text-center leading-7 text-white/88">
                Elegí tu modalidad, respondé las preguntas y descubrí todo lo
                que podés aprender.
              </p>

              <div className="mt-6 grid grid-cols-3 gap-2">
                {miniCards.map(({ label, Icon }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-white/10 bg-white/10 p-3 text-center"
                  >
                    <Icon className="mx-auto size-7 text-sage-300" aria-hidden />
                    <p className="mt-1 text-xs font-semibold text-white">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="experiencias" className="bg-sand-50">
        <div className="h-5 bg-gradient-to-r from-primary-900 to-primary-700" />

        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-10 sm:py-20">
          <div className="mb-9 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-joy-600 sm:text-sm">
                Elegí tu experiencia
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-primary-900 sm:text-4xl">
                ¿Cómo querés participar?
              </h2>
              <p className="mt-3 max-w-xl leading-7 text-ink-600">
                Elegí una modalidad y comenzá tu experiencia en la Trivia
                Universitaria.
              </p>
            </div>

            <span className="hidden items-center gap-2 rounded-xl border border-sand-100 bg-white px-4 py-3 text-sm font-semibold text-primary-900 shadow-sm sm:inline-flex">
              <GraduationCap className="size-[18px] text-primary-700" aria-hidden />
              Una universidad, muchos desafíos
            </span>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {entries.map((entry) => {
              const Icon = entry.Icon;

              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className="group relative flex min-h-80 flex-col overflow-hidden rounded-card border border-sand-100 bg-white p-8 shadow-card transition duration-200 hover:-translate-y-1 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-primary-500 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <div
                    className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-60 blur-2xl ${entry.glowClass}`}
                  />
                  <div className="relative flex items-center justify-between gap-3">
                    <span className="text-sm font-black tracking-[0.2em] text-ink-400">
                      EXPERIENCIA {entry.number}
                    </span>
                    <span
                      className={`rounded-pill px-3 py-1.5 text-xs font-bold ${entry.badgeClass}`}
                    >
                      {entry.label}
                    </span>
                  </div>

                  <div
                    className={`mt-6 flex h-16 w-16 items-center justify-center rounded-2xl shadow-sm ${entry.iconClass}`}
                  >
                    <Icon className="size-8" aria-hidden />
                  </div>

                  <h3 className="relative mt-5 text-xl font-extrabold text-primary-900 sm:text-2xl">
                    {entry.title}
                  </h3>

                  <p className="relative mt-3 flex-1 text-sm leading-7 text-ink-600">
                    {entry.description}
                  </p>

                  <div
                    className={`relative mt-6 flex min-h-12 items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-bold ${entry.buttonClass}`}
                  >
                    {entry.action}
                    <ArrowRight
                      className="size-5 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                      aria-hidden
                    />
                  </div>
                </Link>
              );
            })}
          </div>

          <footer className="mt-14 flex flex-col gap-3 border-t border-sand-100 pt-6 text-sm text-ink-600 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/logo-unsada.png"
                alt=""
                className="h-10 w-10 object-contain"
              />
              <div>
                <p className="font-bold text-primary-900">Trivia UNSAdA</p>
                <p className="text-xs">Universidad y territorio</p>
              </div>
            </div>

            <p>Un espacio para aprender, participar y compartir conocimientos.</p>
          </footer>
        </div>
      </section>
    </main>
  );
}
