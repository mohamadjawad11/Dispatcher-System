import { Skeleton } from "@/components/ui/skeleton";

/** Synchronous loading state shown while the mock AI is "thinking". */
export function AnalyzeSkeleton() {
  return (
    <div className="space-y-4 text-primary-foreground" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-primary-foreground/70">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
        </span>
        Analyzing the update and drafting a response…
      </div>

      {[0, 1, 2].map((index) => (
        <div key={index} className="triage-panel rounded-lg p-3">
          <Skeleton className="mb-2 h-3.5 w-32 bg-primary-foreground/15" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-full bg-primary-foreground/10" />
            <Skeleton className="h-3 w-[92%] bg-primary-foreground/10" />
            <Skeleton className="h-3 w-[78%] bg-primary-foreground/10" />
          </div>
        </div>
      ))}
    </div>
  );
}
