"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  GIOF_ASSIGNMENT_HELP,
  GIOF_FLOW_EXAMPLE,
  GIOF_ROLE_GUIDES,
  GIOF_STAGE_GUIDES,
  GIOF_TROUBLESHOOTING,
  getGiofRoleGuide,
  isGiofHelpContext,
} from "@/lib/giof-assignment-help";
import { useAuthStore } from "@/stores/auth-store";

const GUIDE_NAV_ITEMS = [
  { id: "roles", label: "Roles" },
  { id: "request", label: "Revisión de solicitud" },
  { id: "payment", label: "Cola de pagos" },
  { id: "rexan", label: "Rendición de anticipo" },
  { id: "example", label: "Ejemplo completo" },
  { id: "troubleshooting", label: "Preguntas frecuentes" },
] as const;

type GuideSectionId = (typeof GUIDE_NAV_ITEMS)[number]["id"];

function isGuideSectionId(value?: string | null): value is GuideSectionId {
  return GUIDE_NAV_ITEMS.some((item) => item.id === value);
}

export function GiofAssignmentGuide() {
  const searchParams = useSearchParams();
  const roleCode = useAuthStore((state) => state.user?.role?.code);
  const roleGuide = getGiofRoleGuide(roleCode);
  const context = searchParams.get("context");
  const contextualSectionId = isGiofHelpContext(context) ? context : null;
  const [activeSectionId, setActiveSectionId] = useState<GuideSectionId>(contextualSectionId ?? "roles");

  useEffect(() => {
    const hashSectionId = window.location.hash.slice(1);
    const activeId = contextualSectionId ?? (isGuideSectionId(hashSectionId) ? hashSectionId : "roles");
    const focusedSectionId = contextualSectionId ?? (isGuideSectionId(hashSectionId) ? hashSectionId : roleGuide?.id);
    setActiveSectionId(activeId);
    if (!focusedSectionId) return;
    const section = document.getElementById(focusedSectionId);
    if (!section) return;
    section.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [contextualSectionId, roleGuide?.id]);

  useEffect(() => {
    function updateFromHash() {
      const hashSectionId = window.location.hash.slice(1);
      if (isGuideSectionId(hashSectionId)) setActiveSectionId(hashSectionId);
    }

    window.addEventListener("hashchange", updateFromHash);
    if (typeof IntersectionObserver === "undefined") {
      return () => window.removeEventListener("hashchange", updateFromHash);
    }

    const observer = new IntersectionObserver((entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting && isGuideSectionId(entry.target.id))
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (visibleEntry && isGuideSectionId(visibleEntry.target.id)) {
        setActiveSectionId(visibleEntry.target.id);
      }
    }, { rootMargin: "-15% 0px -65% 0px", threshold: [0.1, 0.25, 0.5, 0.75] });

    for (const item of GUIDE_NAV_ITEMS) {
      const section = document.getElementById(item.id);
      if (section) observer.observe(section);
    }

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", updateFromHash);
    };
  }, []);

  return (
    <main className="min-w-0 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-5xl space-y-10">
        <header className="space-y-3">
          <Button asChild variant="link" className="h-auto p-0">
            <Link href={ROUTES.HELP}>Volver al Centro de ayuda</Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{GIOF_ASSIGNMENT_HELP.title}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">{GIOF_ASSIGNMENT_HELP.summary}</p>
          {roleGuide && <Badge variant="secondary">Sección recomendada: {roleGuide.title}</Badge>}
        </header>

        <nav aria-label="Contenido de la guía" className="rounded-lg border bg-muted/30 p-4">
          <p className="mb-3 text-sm font-medium">Ir a una sección</p>
          <div className="overflow-x-auto pb-1" data-testid="guide-section-scroller">
            <div className="flex w-max min-w-full flex-nowrap gap-2 text-sm">
              {GUIDE_NAV_ITEMS.map((item) => {
                const isActive = activeSectionId === item.id;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    aria-current={isActive ? "location" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      window.history.pushState(null, "", `#${item.id}`);
                      setActiveSectionId(item.id);
                      const section = document.getElementById(item.id);
                      section?.focus({ preventScroll: true });
                      section?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 font-medium whitespace-nowrap no-underline transition-colors hover:bg-accent hover:text-accent-foreground hover:no-underline focus:no-underline focus-visible:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isActive && "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
                    )}
                  >
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>
        </nav>

        <section id="roles" aria-labelledby="roles-title" className="scroll-mt-6 space-y-4">
          <h2 id="roles-title" className="text-xl font-semibold sm:text-2xl">Qué puede hacer cada rol</h2>
          <div className="grid gap-4 lg:grid-cols-3">
            {Object.values(GIOF_ROLE_GUIDES).map((guide) => {
              const isRecommended = roleGuide?.id === guide.id;
              return (
                <article
                  key={guide.id}
                  id={guide.id}
                  tabIndex={-1}
                  className="scroll-mt-6 rounded-lg border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-recommended={isRecommended || undefined}
                >
                  <h3 className="font-semibold">{guide.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{guide.description}</p>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">
                    {guide.points.map((point) => <li key={point}>{point}</li>)}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="matrix-title" className="space-y-4">
          <div>
            <h2 id="matrix-title" className="text-xl font-semibold sm:text-2xl">Matriz de etapas asignables</h2>
            <p className="mt-1 text-sm text-muted-foreground">Cada tarjeta presenta el destino, los estados permitidos y los bloqueos de su etapa.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {GIOF_STAGE_GUIDES.map((stage) => (
              <article key={stage.id} id={stage.id} tabIndex={-1} className="scroll-mt-6 rounded-lg border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <h3 className="font-semibold">{stage.title}</h3>
                <dl className="mt-3 space-y-3 text-sm leading-6">
                  <div><dt className="font-medium">Destino</dt><dd className="text-muted-foreground">{stage.target}</dd></div>
                  <div><dt className="font-medium">Asignable</dt><dd className="text-muted-foreground">{stage.assignable}</dd></div>
                  <div><dt className="font-medium">No asignable</dt><dd className="text-muted-foreground">{stage.notAssignable}</dd></div>
                  <div><dt className="font-medium">Seguimiento</dt><dd className="text-muted-foreground">{stage.observation}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section id="example" aria-labelledby="example-title" className="scroll-mt-6 rounded-lg border bg-muted/30 p-4 sm:p-5">
          <h2 id="example-title" className="text-xl font-semibold">Ejemplo: un anticipo de inicio a fin</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6">
            {GIOF_FLOW_EXAMPLE.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </section>

        <section id="troubleshooting" aria-labelledby="troubleshooting-title" className="scroll-mt-6 space-y-4">
          <h2 id="troubleshooting-title" className="text-xl font-semibold sm:text-2xl">Preguntas frecuentes y solución de problemas</h2>
          <div className="space-y-3">
            {GIOF_TROUBLESHOOTING.map((item) => (
              <details key={item.question} className="rounded-lg border bg-card p-4">
                <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item.question}</summary>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
