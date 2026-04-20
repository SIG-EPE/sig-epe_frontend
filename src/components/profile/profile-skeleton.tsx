import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

// -------------------------------------------------------
// ProfileSkeleton — shown while auth store is hydrating
// -------------------------------------------------------

export function ProfileSkeleton() {
  return (
    <div data-testid="profile-skeleton" className="max-w-2xl mx-auto space-y-6">
      {/* Card 1 — Identity skeleton */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-5 w-24" />
          </div>
        </CardContent>
      </Card>

      {/* Card 2 — Personal info skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-36" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Card 3 — Security skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-9 w-44" />
        </CardContent>
      </Card>
    </div>
  )
}
