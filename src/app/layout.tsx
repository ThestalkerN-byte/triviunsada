
import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="es-AR">
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">
        <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-8">
          {children}
        </div>
      </body>
    </html>
  );
}
