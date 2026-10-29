"use client";

import clsx from "clsx";
import { Gamepad2, House, MonitorPlay, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items: {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  activeClass: string;
}[] = [
  {
    href: "/",
    label: "Inicio",
    icon: House,
    exact: true,
    activeClass: "bg-primary-700 text-white",
  },
  {
    href: "/play",
    label: "Individual",
    icon: Gamepad2,
    activeClass: "bg-primary-700 text-white",
  },
  {
    href: "/host",
    label: "Crear sala",
    icon: MonitorPlay,
    activeClass: "bg-joy-500 text-ink-900",
  },
  {
    href: "/join",
    label: "Unirse",
    icon: Users,
    activeClass: "bg-plum-700 text-white",
  },
];

function isCurrent(pathname: string, href: string, exact?: boolean) {
  if (exact || href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

export function FloatingNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Modos de juego"
      className="fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 sm:w-auto"
    >
      <ul className="flex items-center justify-center gap-1 rounded-pill border border-primary-700/10 bg-white/80 p-1.5 shadow-float backdrop-blur-md">
        {items.map((item) => {
          const active = isCurrent(pathname, item.href, item.exact);
          const Icon = item.icon;

          return (
            <li key={item.href} className="min-w-0 flex-1 sm:flex-none">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex min-h-11 items-center justify-center gap-2 rounded-pill px-4 py-2.5 text-sm font-semibold transition-colors duration-200 motion-reduce:transition-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
                  active
                    ? item.activeClass
                    : "text-ink-600 hover:bg-primary-100 hover:text-primary-900",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                <span className={clsx(!active && "max-sm:sr-only")}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
