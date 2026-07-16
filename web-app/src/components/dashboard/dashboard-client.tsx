"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  FileWarning,
  OctagonPause,
  PackageCheck,
  Truck,
} from "lucide-react";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { NewShipmentDialog } from "@/components/dashboard/new-shipment-dialog";
import { ShipmentTable } from "@/components/dashboard/shipment-table";
import { CopilotPanel } from "@/components/copilot/copilot-panel";
import { getRecentAuditLogs, getShipments } from "@/app/actions/shipments";
import {
  ShipmentStatus,
  type AuditLogDTO,
  type ShipmentDTO,
} from "@/lib/types";
import { useDispatchStore } from "@/store/use-dispatch-store";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 5000;

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  tone: string;
}) {
  return (
    <div className={cn("metric-tile rounded-lg p-4 text-foreground", tone)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-display text-3xl font-semibold leading-none tracking-[-0.03em]">
            {value}
          </div>
          <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </div>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-background/70">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

export function DashboardClient({
  initialShipments,
  initialLogs,
  aiLive,
}: {
  initialShipments: ShipmentDTO[];
  initialLogs: AuditLogDTO[];
  aiLive: boolean;
}) {
  const shipments = useDispatchStore((state) => state.shipments);
  const setShipments = useDispatchStore((state) => state.setShipments);
  const [logs, setLogs] = useState<AuditLogDTO[]>(initialLogs);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Hydrate the store from the server-rendered snapshot once on mount.
  useEffect(() => {
    setShipments(initialShipments);
    setHydrated(true);
  }, [initialShipments, setShipments]);

  const refresh = useCallback(async () => {
    const [nextShipments, nextLogs] = await Promise.all([
      getShipments(),
      getRecentAuditLogs(),
    ]);
    setShipments(nextShipments);
    setLogs(nextLogs);
    setLastSynced(new Date());
  }, [setShipments]);

  // Poll for fresh data on an interval (the dashboard's "real-time" feel).
  useEffect(() => {
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // After creating a shipment, refresh the ledger and briefly highlight the row.
  const handleShipmentCreated = useCallback(
    async (shipmentId: string) => {
      await refresh();
      setHighlightId(shipmentId);
      setTimeout(() => setHighlightId(null), 2200);
    },
    [refresh],
  );

  // Use the server snapshot until the store has hydrated to avoid a flash.
  const displayShipments = hydrated ? shipments : initialShipments;

  const halted = displayShipments.filter(
    (shipment) => shipment.status === ShipmentStatus.HALTED,
  ).length;
  const inTransit = displayShipments.filter(
    (shipment) => shipment.status === ShipmentStatus.IN_TRANSIT,
  ).length;
  const delivered = displayShipments.filter(
    (shipment) => shipment.status === ShipmentStatus.DELIVERED,
  ).length;

  const openExceptions = displayShipments.reduce(
    (total, shipment) =>
      total + shipment.exceptions.filter((exception) => !exception.resolved).length,
    0,
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.58fr)_minmax(390px,0.92fr)]">
      {/* Left column — dashboard */}
      <section className="space-y-5 motion-safe:animate-panel-in">
        <div className="control-panel rounded-xl p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                Live state ledger
              </p>
              <h2 className="font-display text-2xl font-semibold tracking-[-0.03em]">
                Shipments under control
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-primary/10 bg-background/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                <Activity className="h-3.5 w-3.5 text-success" />
                {lastSynced
                  ? `Synced ${lastSynced.toLocaleTimeString()}`
                  : "Polling every 5s"}
              </span>
              <NewShipmentDialog onCreated={handleShipmentCreated} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Halted"
              value={halted}
              icon={OctagonPause}
              tone="text-destructive"
            />
            <StatCard
              label="Open exceptions"
              value={openExceptions}
              icon={FileWarning}
              tone="text-warning"
            />
            <StatCard
              label="In transit"
              value={inTransit}
              icon={Truck}
              tone="text-primary"
            />
            <StatCard
              label="Delivered"
              value={delivered}
              icon={PackageCheck}
              tone="text-success"
            />
          </div>
        </div>

        <ShipmentTable
          shipments={displayShipments}
          onMutated={refresh}
          highlightId={highlightId}
        />

        <ActivityFeed logs={logs} />
      </section>

      {/* Right column — CoPilot */}
      <aside className="xl:sticky xl:top-24 xl:h-[calc(100vh-7rem)]">
        <CopilotPanel onExecuted={refresh} aiLive={aiLive} />
      </aside>
    </div>
  );
}
