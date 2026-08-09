import type { Metadata } from "next";

import { GiofAssignmentGuide } from "@/components/help/giof-assignment-guide";

export const metadata: Metadata = {
  title: "Guía de asignación GIOF | SIG-EPE",
  description: "Guía por rol y etapa para asignar trabajo GIOF en SIG-EPE.",
};

export default function GiofAssignmentHelpPage() {
  return <GiofAssignmentGuide />;
}
