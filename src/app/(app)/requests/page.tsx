import { Suspense } from "react";

import { RequestsPage as RequestsPageContent } from "@/components/requests/requests-page";

export default function RequestsPage() {
  return (
    <Suspense fallback={null}>
      <RequestsPageContent />
    </Suspense>
  );
}
