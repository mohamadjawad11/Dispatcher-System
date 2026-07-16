"use client";

import { Fragment, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  PackageCheck,
  Quote,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import {
  CategoryBadge,
  ResolvedBadge,
  SeverityBadge,
  ShipmentStatusBadge,
} from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  markShipmentDelivered,
  markShipmentInTransit,
} from "@/app/actions/shipments";
import { updateExceptionResolution } from "@/app/actions/exceptions";
import { ShipmentStatus, type ShipmentDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

function openExceptionCount(shipment: ShipmentDTO): number {
  return shipment.exceptions.filter((exception) => !exception.resolved).length;
}

export function ShipmentTable({
  shipments,
  onMutated,
  highlightId,
}: {
  shipments: ShipmentDTO[];
  onMutated: () => void;
  highlightId?: string | null;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleDeliver(shipment: ShipmentDTO) {
    startTransition(async () => {
      const result = await markShipmentDelivered(shipment.id);
      if (!result.ok) {
        toast.error("Delivery blocked (Rule A)", { description: result.error });
        return;
      }
      toast.success(`${shipment.trackingNumber} delivered`, {
        description: "Status change recorded in the audit log.",
      });
      onMutated();
    });
  }

  function handleInTransit(shipment: ShipmentDTO) {
    startTransition(async () => {
      const result = await markShipmentInTransit(shipment.id);
      if (!result.ok) {
        toast.error("Could not update", { description: result.error });
        return;
      }
      toast.success(`${shipment.trackingNumber} is in transit`);
      onMutated();
    });
  }

  function handleResolve(exceptionId: string) {
    startTransition(async () => {
      const result = await updateExceptionResolution(exceptionId, true);
      if (!result.ok) {
        toast.error("Could not update exception", {
          description: result.error,
        });
        return;
      }
      toast.success("Exception resolved", {
        description: "Shipment auto-released if no open exceptions remain.",
      });
      onMutated();
    });
  }

  if (shipments.length === 0) {
    return (
      <div className="ops-panel flex h-40 items-center justify-center rounded-xl border-dashed text-sm text-muted-foreground">
        No shipments yet. Use “New shipment” above to add your first one.
      </div>
    );
  }

  return (
    <section className="ops-panel rounded-xl p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Shipment queue
          </p>
          <h2 className="font-display text-xl font-semibold tracking-[-0.03em]">
            Active Shipments
          </h2>
        </div>
        <span className="rounded-full border border-primary/10 bg-background/70 px-3 py-1 text-xs font-semibold text-muted-foreground">
          {shipments.length} records
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-primary/10 bg-background/55">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5 hover:bg-primary/5">
              <TableHead className="w-8" />
              <TableHead>Tracking</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {shipments.map((shipment) => {
            const openCount = openExceptionCount(shipment);
            const isExpanded = expanded[shipment.id];
            const hasExceptions = shipment.exceptions.length > 0;

            return (
              <Fragment key={shipment.id}>
                <TableRow
                  className={cn(
                    "ledger-row",
                    shipment.status === ShipmentStatus.HALTED &&
                      "bg-destructive/10 hover:bg-destructive/15",
                    shipment.id === highlightId && "row-flash",
                  )}
                >
                  <TableCell className="pr-0">
                    {hasExceptions ? (
                      <button
                        type="button"
                        onClick={() => toggle(shipment.id)}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        aria-label={isExpanded ? "Collapse" : "Expand"}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-display text-xs font-semibold tracking-[0.02em]">
                    {shipment.trackingNumber}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{shipment.customerName}</div>
                  </TableCell>
                  <TableCell>{shipment.destinationCity}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <ShipmentStatusBadge status={shipment.status} />
                      {openCount > 0 && (
                        <span className="rounded-full border border-destructive/15 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-destructive">
                          {openCount} open
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {shipment.status === ShipmentStatus.DISPATCHED && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleInTransit(shipment)}
                              disabled={isPending}
                            >
                              <Truck className="h-3.5 w-3.5" />
                              Transit
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Move a dispatched shipment into transit when the courier has started the route.
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {shipment.status !== ShipmentStatus.DELIVERED && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => handleDeliver(shipment)}
                              disabled={isPending}
                            >
                              <PackageCheck className="h-3.5 w-3.5" />
                              Deliver
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Mark the shipment as completed once it has been handed to the customer.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>

                {isExpanded && hasExceptions && (
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell />
                    <TableCell colSpan={5} className="py-2 pl-1 pr-3">
                      <div className="artifact-panel divide-y divide-border/70 rounded-lg">
                        {shipment.exceptions.map((exception) => (
                          <div key={exception.id} className="p-3.5 first:pt-3 last:pb-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <SeverityBadge severity={exception.severity} />
                                <CategoryBadge category={exception.category} />
                                <ResolvedBadge resolved={exception.resolved} />
                              </div>
                              <time
                                dateTime={exception.createdAt}
                                className="text-[11px] font-medium tabular-nums text-muted-foreground/80"
                              >
                                {new Date(exception.createdAt).toLocaleString(
                                  undefined,
                                  {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  },
                                )}
                              </time>
                            </div>

                            <div className="mt-2.5 flex items-start gap-2 rounded-md border border-border/60 bg-background/70 px-3 py-2.5">
                              <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/35" />
                              <p className="max-w-3xl text-[13px] leading-relaxed text-foreground/85">
                                {exception.rawInput}
                              </p>
                            </div>

                            {!exception.resolved && (
                              <div className="mt-2.5 flex justify-end">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleResolve(exception.id)}
                                  disabled={isPending}
                                >
                                  Resolve
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
