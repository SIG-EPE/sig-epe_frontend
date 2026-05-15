import { Suspense } from "react";

import { RenditionsInboxPage as RenditionsInboxPageContent } from "@/components/renditions/renditions-inbox-page";

export default function RenditionsPage() {
  return (
    <Suspense fallback={null}>
      <RenditionsInboxPageContent />
    </Suspense>
  );
}
