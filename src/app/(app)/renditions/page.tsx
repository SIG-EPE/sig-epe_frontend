import { Suspense } from "react";

import { RenditionsRouteSkeleton } from "@/components/performance/route-skeletons";
import { RenditionsInboxPage as RenditionsInboxPageContent } from "@/components/renditions/renditions-inbox-page";

export default function RenditionsPage() {
  return (
    <Suspense fallback={<RenditionsRouteSkeleton />}>
      <RenditionsInboxPageContent />
    </Suspense>
  );
}
