import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { RequestsPage as RequestsPageContent } from "@/components/requests/requests-page";

function RequestsPageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Skeleton className="h-10 rounded-md" />
        <Skeleton className="h-10 rounded-md" />
        <Skeleton className="h-10 rounded-md" />
        <Skeleton className="h-10 rounded-md" />
      </div>
      <div className="rounded-lg border bg-card p-4">
        <Skeleton className="mb-4 h-8 w-48" />
        <div className="space-y-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </div>
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={<RequestsPageSkeleton />}>
      <RequestsPageContent />
    </Suspense>
  );
}
