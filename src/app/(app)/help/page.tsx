import type { Metadata } from "next";
import Link from "next/link";

import { FaqSearch } from "@/components/help/faq-search";
import { Button } from "@/components/ui/button";
import { GIOF_ASSIGNMENT_HELP } from "@/lib/giof-assignment-help";
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
        <section aria-labelledby="giof-help-title" className="mb-8 rounded-lg border bg-card p-4 shadow-sm sm:p-5">
          <h2 id="giof-help-title" className="text-lg font-semibold">{GIOF_ASSIGNMENT_HELP.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{GIOF_ASSIGNMENT_HELP.summary}</p>
          <Button asChild variant="outline" className="mt-4 w-full sm:w-auto">
            <Link href={GIOF_ASSIGNMENT_HELP.href}>Abrir guía</Link>
          </Button>
        </section>
        <FaqSearch items={FAQ_ITEMS} />
      </div>
    </main>
  );
}
