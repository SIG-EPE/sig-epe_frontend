import { Suspense } from 'react';
import { LineDetailPage } from "@/components/budget/detail/line-detail-page";

function LineDetailLoading() {
  return <div className="p-6"><p>Cargando detalle...</p></div>;
}

export default function LineDetailRoutePage() {
  return (
    <Suspense fallback={<LineDetailLoading />}>
      <LineDetailPage />
    </Suspense>
  );
}