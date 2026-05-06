import { Suspense } from 'react';
import { PlanningLinesPage } from "@/components/budget/planning/planning-lines-page";

function PlanningPageLoading() {
  return <div className="p-6"><p>Cargando lineas...</p></div>;
}

export default function PlanningPage() {
  return (
    <Suspense fallback={<PlanningPageLoading />}>
      <PlanningLinesPage />
    </Suspense>
  );
}