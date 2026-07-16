import {
  ArrowRight,
  Clock3,
  FilePlus2,
  OctagonPause,
  RotateCcw,
  Truck,
} from "lucide-react";

import type { AuditLogDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACTION_META: Record<
  string,
  { icon: typeof Truck; tone: string; label: string }
> = {
  AUTO_HALT: {
    icon: OctagonPause,
    tone: "text-destructive bg-destructive/10",
    label: "Shipment auto-halted",
  },
  AUTO_RELEASE: {
    icon: RotateCcw,
    tone: "text-warning bg-warning/10",
    label: "Shipment released",
  },
  EXCEPTION_CREATED: {
    icon: FilePlus2,
    tone: "text-primary bg-primary/10",
    label: "Exception logged",
  },
  SHIPMENT_CREATED: {
    icon: Truck,
    tone: "text-muted-foreground bg-muted",
    label: "Shipment created",
  },
};

function metaFor(log: AuditLogDTO) {
  const known = ACTION_META[log.action];
  if (known) return known;

  return {
    icon: Truck,
    tone: "text-muted-foreground bg-muted",
    label:
      log.action === "STATUS_CHANGE"
        ? log.entityType === "SHIPMENT"
          ? "Shipment status change"
          : "Exception status change"
        : log.action,
  };
}

export function ActivityFeed({ logs }: { logs: AuditLogDTO[] }) {
  return (
    <section className="ops-panel rounded-xl p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Append-only trace
          </p>
          <h2 className="font-display text-xl font-semibold tracking-[-0.03em]">
            Audit Activity
          </h2>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/10 bg-background/70 text-primary">
          <Clock3 className="h-4 w-4" />
        </span>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-primary/15 bg-background/55 px-4 py-8 text-center text-sm text-muted-foreground">
          Actions you take will appear here as an audited, append-only trail.
        </div>
      ) : (
        <ol className="max-h-[420px] space-y-1 overflow-y-auto rounded-lg border border-primary/10 bg-background/55 p-1.5">
          {logs.map((log) => {
            const { icon: Icon, tone, label } = metaFor(log);
            return (
              <li
                key={log.id}
                className="ledger-row flex items-start gap-3 rounded-lg border border-transparent px-2 py-2 hover:border-primary/10"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                    tone,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {label}
                    <span className="rounded-full border border-primary/10 bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                      {log.entityType}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    {log.oldState && (
                      <>
                        <span>{log.oldState}</span>
                        <ArrowRight className="h-3 w-3 shrink-0" />
                      </>
                    )}
                    <span className="truncate">{log.newState}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground/70">
                    {log.changedBy}
                    <span aria-hidden="true"> · </span>
                    <time dateTime={log.createdAt}>
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </time>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
