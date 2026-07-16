"use client";

import { useState } from "react";
import { CheckCircle2, FileText, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";

import { Markdown } from "@/components/copilot/markdown";
import {
  CategoryBadge,
  SeverityBadge,
} from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createExceptionFromTriage } from "@/app/actions/exceptions";
import type { ExceptionTriageDraft } from "@/lib/types";
import { useDispatchStore } from "@/store/use-dispatch-store";

export function TriageCards({
  draft,
  onExecuted,
}: {
  draft: ExceptionTriageDraft;
  onExecuted: () => void;
}) {
  const clearTriage = useDispatchStore((state) => state.clearTriage);
  const setProcessing = useDispatchStore((state) => state.setProcessing);
  const isProcessing = useDispatchStore((state) => state.isProcessing);
  const [submitting, setSubmitting] = useState(false);

  const { structuredRecord, actionPlan, customerNotification } = draft.analysis;

  async function handleApprove() {
    setSubmitting(true);
    setProcessing(true);
    const result = await createExceptionFromTriage({
      shipmentId: draft.shipmentId,
      severity: structuredRecord.severity,
      category: structuredRecord.category,
      rawInput: draft.rawInput,
      actionPlan,
      notificationText: customerNotification,
    });
    setSubmitting(false);
    setProcessing(false);

    if (!result.ok) {
      toast.error("Could not execute", { description: result.error });
      return;
    }

    const halted =
      structuredRecord.severity === "HIGH" ||
      structuredRecord.severity === "CRITICAL";

    toast.success("Exception logged & executed", {
      description: halted
        ? `Shipment ${draft.trackingNumber} auto-HALTED (Rule B). Audit trail updated.`
        : `Exception filed for ${draft.trackingNumber}. Audit trail updated.`,
    });

    clearTriage();
    onExecuted();
  }

  return (
    <div className="space-y-3 text-primary-foreground">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold tracking-[-0.02em]">
          Proposed resolution
        </h3>
        <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
          AI draft
        </span>
      </div>

      {/* Card 1 — Structured record */}
      <article className="triage-panel rounded-lg p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <h4 className="mb-2 flex w-fit items-center gap-1.5 font-display text-sm font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
              Structured Record
            </h4>
          </TooltipTrigger>
          <TooltipContent>Normalized, machine-readable fields.</TooltipContent>
        </Tooltip>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <SeverityBadge severity={structuredRecord.severity} />
          <CategoryBadge
            category={structuredRecord.category}
            className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground"
          />
          <Separator orientation="vertical" className="h-4 bg-primary-foreground/20" />
          <span className="text-xs text-primary-foreground/70">
            <span className="text-primary-foreground/50">ETA: </span>
            {structuredRecord.etaImpact}
          </span>
        </div>
      </article>

      {/* Card 2 — Action plan */}
      <article className="triage-panel rounded-lg p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <h4 className="mb-2 flex w-fit items-center gap-1.5 font-display text-sm font-semibold">
              <FileText className="h-3.5 w-3.5 text-accent" />
              Action Plan
            </h4>
          </TooltipTrigger>
          <TooltipContent>Internal steps for the operations team.</TooltipContent>
        </Tooltip>
        <Markdown content={actionPlan} />
      </article>

      {/* Card 3 — Customer notification */}
      <article className="triage-panel rounded-lg p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <h4 className="mb-2 flex w-fit items-center gap-1.5 font-display text-sm font-semibold">
              <MessageSquare className="h-3.5 w-3.5 text-accent" />
              Customer Notification
            </h4>
          </TooltipTrigger>
          <TooltipContent>Outbound SMS shown to the customer.</TooltipContent>
        </Tooltip>
        <div className="rounded-md border border-primary-foreground/10 bg-primary-foreground/10 px-3 py-2 text-sm leading-relaxed text-primary-foreground/80">
          {customerNotification}
        </div>
      </article>

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="success"
              className="flex-1"
              onClick={handleApprove}
              disabled={submitting || isProcessing}
            >
              <CheckCircle2 className="h-4 w-4" />
              {submitting ? "Executing…" : "Approve & Execute"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Create the exception record and push the selected operational response into the workflow.
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              onClick={clearTriage}
              disabled={submitting}
              aria-label="Discard draft"
              className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
            >
              <X className="h-4 w-4" />
              Discard
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Close the draft without saving it and return to the triage console.
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
