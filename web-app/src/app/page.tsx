import { Boxes, CircleDot, ShieldCheck } from "lucide-react";

import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getRecentAuditLogs, getShipments } from "@/app/actions/shipments";

// Always render fresh data on request — this dashboard is inherently dynamic.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [shipments, logs] = await Promise.all([
    getShipments(),
    getRecentAuditLogs(),
  ]);

  // Reflect whether the real AI service is wired (vs the built-in mock). This
  // is read on the server; the seam in `mock-ai.ts` switches on the same env.
  const aiLive = Boolean(process.env.AI_SERVICE_URL);

  return (
    <main className="ops-shell min-h-screen">
      <header className="ops-header sticky top-0 z-30 border-b border-primary/10">
        <div className="mx-auto grid max-w-[1440px] gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:px-7">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-[0_12px_28px_hsl(var(--primary)_/_0.18)]">
              <Boxes className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                Exception desk
              </p>
              <h1 className="font-display text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-3xl">
                Dispatch Exception CoPilot
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <div className="flex items-center gap-2 rounded-full border border-primary/15 bg-background px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">
              <CircleDot className="h-3.5 w-3.5 text-success" />
              Live operations
            </div>
            <div className="flex items-center gap-2 rounded-full border border-primary/15 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5" />
              Rules A/B/C armed
            </div>
          </div>
        </div>
        <div className="state-rail h-1 w-full" />
      </header>

      <div className="mx-auto max-w-[1440px] px-5 py-6 lg:px-7 lg:py-8">
        <DashboardClient
          initialShipments={shipments}
          initialLogs={logs}
          aiLive={aiLive}
        />
      </div>
    </main>
  );
}
