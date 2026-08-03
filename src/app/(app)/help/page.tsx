import type { Metadata } from "next";

import { FaqSearch } from "@/components/help/faq-search";
import { FAQ_ITEMS } from "@/lib/help-content";

export const metadata: Metadata = {
  title: "Centro de ayuda | SIG-EPE",
  description: "Preguntas frecuentes sobre el uso de SIG-EPE.",
};

export default function HelpPage() {
  return (
    <main className="min-w-0 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Centro de ayuda</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Encuentra respuestas rápidas sobre solicitudes, documentos, pagos y rendiciones.
          </p>
        </header>
        <FaqSearch items={FAQ_ITEMS} />
      </div>
    </main>
  );
}
