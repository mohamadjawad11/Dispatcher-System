"use client";

import { useMemo, useState } from "react";
import { Bot, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AnalyzeSkeleton } from "@/components/copilot/analyze-skeleton";
import { FallbackForm } from "@/components/copilot/fallback-form";
import { TriageCards } from "@/components/copilot/triage-cards";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { analyzeException } from "@/app/actions/exceptions";
import { ShipmentStatus } from "@/lib/types";
import { useDispatchStore } from "@/store/use-dispatch-store";

const SAMPLE_PROMPTS = [
  "el van 3etlit 3a tari2 Zahle, battery mfassakha, ma fini kammel",
  "zboun mish mawjoud bel beit w ma byjaweb 3al telephone",
  "fi 3asfe w shté ktir 3a Tripoli, el tari2 ma2tou3",
];

export function CopilotPanel({
  onExecuted,
  aiLive,
}: {
  onExecuted: () => void;
  aiLive: boolean;
}) {
  const shipments = useDispatchStore((state) => state.shipments);
  const selectedShipmentId = useDispatchStore(
    (state) => state.selectedShipmentId,
  );
  const selectShipment = useDispatchStore((state) => state.selectShipment);
  const isProcessing = useDispatchStore((state) => state.isProcessing);
  const isFallbackMode = useDispatchStore((state) => state.isFallbackMode);
  const activeTriage = useDispatchStore((state) => state.activeExceptionTriage);
  const setProcessing = useDispatchStore((state) => state.setProcessing);
  const setTriage = useDispatchStore((state) => state.setTriage);
  const enterFallback = useDispatchStore((state) => state.enterFallback);
  const clearTriage = useDispatchStore((state) => state.clearTriage);

  const [rawInput, setRawInput] = useState("");

  // Only shipments that can still receive an exception (not delivered).
  const eligibleShipments = useMemo(
    () =>
      shipments.filter(
        (shipment) => shipment.status !== ShipmentStatus.DELIVERED,
      ),
    [shipments],
  );

  const selectedShipment = useMemo(
    () => shipments.find((shipment) => shipment.id === selectedShipmentId),
    [shipments, selectedShipmentId],
  );

  async function handleAnalyze() {
    if (!selectedShipmentId || !selectedShipment) {
      toast.error("Select a shipment to attach this exception to.");
      return;
    }
    if (!rawInput.trim()) {
      toast.error("Type the courier update before analyzing.");
      return;
    }

    clearTriage();
    setProcessing(true);

    const result = await analyzeException(rawInput, selectedShipmentId);

    if (!result.ok) {
      // AI failed -> drop into manual fallback mode.
      enterFallback();
      toast.warning("AI analysis failed", {
        description: "Switched to manual triage. Build the record by hand.",
      });
      return;
    }

    setTriage({
      shipmentId: selectedShipmentId,
      trackingNumber: selectedShipment.trackingNumber,
      rawInput,
      analysis: result.data,
      source: "AI",
    });
  }

  function handleExecuted() {
    setRawInput("");
    onExecuted();
  }

  const showComposer = !isProcessing && !activeTriage && !isFallbackMode;

  return (
    <section className="console-panel flex h-full min-h-[720px] flex-col overflow-hidden rounded-xl motion-safe:animate-panel-in">
      <div className="border-b border-primary-foreground/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-primary-foreground/10 bg-primary-foreground/10 text-accent shadow-[0_0_0_1px_hsl(var(--accent)_/_0.12)]">
              <Bot className="h-3.5 w-3.5" />
            </span>
            <h2 className="font-display text-base font-semibold tracking-[-0.02em] text-primary-foreground">
              Exception CoPilot
            </h2>
          </div>
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
            {aiLive ? "Live AI" : "Mock AI"}
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Composer */}
        {showComposer && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="shipment-select"
                className="text-primary-foreground/75"
              >
                Shipment
              </Label>
              <Select
                value={selectedShipmentId ?? undefined}
                onValueChange={selectShipment}
              >
                <SelectTrigger
                  id="shipment-select"
                  className="console-field"
                  autoFocus
                >
                  <SelectValue placeholder="Select an active shipment" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleShipments.length === 0 && (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      No eligible shipments.
                    </div>
                  )}
                  {eligibleShipments.map((shipment) => (
                    <SelectItem key={shipment.id} value={shipment.id}>
                      {shipment.trackingNumber} — {shipment.customerName} (
                      {shipment.destinationCity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="raw-input" className="text-primary-foreground/75">
                  Courier update
                </Label>
                <span className="text-[10px] text-primary-foreground/40">
                  ⌘⏎ to analyze
                </span>
              </div>
              <Textarea
                id="raw-input"
                placeholder="e.g. el van 3etlit 3a tari2 Zahle, battery mfassakha…"
                value={rawInput}
                onChange={(event) => setRawInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    handleAnalyze();
                  }
                }}
                className="console-field min-h-[112px] resize-y leading-relaxed shadow-[0_1px_0_hsl(42_45%_96%_/_0.06)_inset] focus-visible:ring-accent"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {SAMPLE_PROMPTS.map((sample, index) => (
                <Tooltip key={sample}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setRawInput(sample)}
                      className="rounded-full border border-primary-foreground/10 bg-primary-foreground/10 px-2.5 py-1 text-left text-[11px] font-medium text-primary-foreground/70 transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-primary-foreground"
                    >
                      {index === 0 && "Vehicle"}
                      {index === 1 && "Customer"}
                      {index === 2 && "Weather"}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {index === 0 && "Load a vehicle-breakdown example to speed up triage."}
                    {index === 1 && "Load a customer-absence example for a missed delivery."}
                    {index === 2 && "Load a weather-delay example for route disruption."}
                  </TooltipContent>
                </Tooltip>
              ))}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help rounded-full border border-primary-foreground/10 bg-primary-foreground/5 px-2 py-1 text-[11px] font-medium text-primary-foreground/40">
                    fail →
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Type &quot;fail&quot; anywhere in the update to simulate an AI failure and enter manual fallback.
                </TooltipContent>
              </Tooltip>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={handleAnalyze}
                  disabled={isProcessing}
                >
                  <Sparkles className="h-4 w-4" />
                  Analyze
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Analyze the selected shipment note and generate a structured exception record, action plan, and customer message.
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Loading */}
        {isProcessing && <AnalyzeSkeleton />}

        {/* AI result */}
        {!isProcessing && activeTriage && (
          <TriageCards draft={activeTriage} onExecuted={handleExecuted} />
        )}

        {/* Fallback */}
        {!isProcessing && isFallbackMode && !activeTriage && selectedShipment && (
          <FallbackForm
            shipmentId={selectedShipment.id}
            trackingNumber={selectedShipment.trackingNumber}
            rawInput={rawInput}
            onExecuted={handleExecuted}
          />
        )}
      </div>
    </section>
  );
}
