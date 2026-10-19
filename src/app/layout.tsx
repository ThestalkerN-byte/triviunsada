import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Triviunsada",
  description: "Trivia por carreras universitarias, en el navegador.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-dvh bg-paper font-serif text-ink antialiased">
        <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-8">
          {children}
        </div>
      </body>
    </html>
  );
}
