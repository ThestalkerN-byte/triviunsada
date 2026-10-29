import type { Metadata } from "next";
import { Source_Serif_4 } from "next/font/google";
import { FloatingNav } from "@/components/FloatingNav";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  style: ["italic", "normal"],
  variable: "--font-source-serif",
});

export const metadata: Metadata = {
  title: {
    default: "Trivia UNSAdA | Universidad Nacional de San Antonio de Areco",
    template: "%s | Trivia UNSAdA",
  },
  description:
    "Poné a prueba tus conocimientos y jugá con preguntas de las carreras de la Universidad Nacional de San Antonio de Areco.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR" className={sourceSerif.variable}>
      <body className="min-h-dvh bg-sand-50 font-sans text-ink-900 antialiased">
        <div className="pb-28">{children}</div>
        <FloatingNav />
      </body>
    </html>
  );
}
