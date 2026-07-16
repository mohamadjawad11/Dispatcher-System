"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";

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
import { createExceptionFromTriage } from "@/app/actions/exceptions";
import { Category, Severity } from "@/lib/types";
import { useDispatchStore } from "@/store/use-dispatch-store";

const SEVERITY_OPTIONS: Severity[] = [
  Severity.LOW,
  Severity.HIGH,
  Severity.CRITICAL,
];

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: Category.VEHICLE_ISSUE, label: "Vehicle issue" },
  { value: Category.CUSTOMER_ABSENT, label: "Customer absent" },
  { value: Category.WEATHER, label: "Weather" },
];

export function FallbackForm({
  shipmentId,
  trackingNumber,
  rawInput,
  onExecuted,
}: {
  shipmentId: string;
  trackingNumber: string;
  rawInput: string;
  onExecuted: () => void;
}) {
  const clearTriage = useDispatchStore((state) => state.clearTriage);
  const setProcessing = useDispatchStore((state) => state.setProcessing);

  const [severity, setSeverity] = useState<Severity>(Severity.HIGH);
  const [category, setCategory] = useState<Category>(Category.VEHICLE_ISSUE);
  const [actionPlan, setActionPlan] = useState("");
  const [notificationText, setNotificationText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!actionPlan.trim() || !notificationText.trim()) {
      toast.error("Both an action plan and a customer notification are required.");
      return;
    }

    setSubmitting(true);
    setProcessing(true);
    const result = await createExceptionFromTriage({
      shipmentId,
      severity,
      category,
      rawInput,
      actionPlan,
      notificationText,
    });
    setSubmitting(false);
    setProcessing(false);

    if (!result.ok) {
      toast.error("Could not execute", { description: result.error });
      return;
    }

    const halted = severity === Severity.HIGH || severity === Severity.CRITICAL;
    toast.success("Manual exception logged", {
      description: halted
        ? `Shipment ${trackingNumber} auto-HALTED (Rule B). Audit trail updated.`
        : `Exception filed for ${trackingNumber}. Audit trail updated.`,
    });

    clearTriage();
    onExecuted();
  }

  return (
    <section className="triage-panel rounded-lg p-3 text-primary-foreground">
      <Tooltip>
        <TooltipTrigger asChild>
          <h3 className="mb-3 flex w-fit items-center gap-1.5 font-display text-sm font-semibold">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            Manual Triage
          </h3>
        </TooltipTrigger>
        <TooltipContent>
          AI failed. The state machine still validates the execution.
        </TooltipContent>
      </Tooltip>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="fallback-severity" className="text-primary-foreground/75">
              Severity
            </Label>
            <Select
              value={severity}
              onValueChange={(value) => setSeverity(value as Severity)}
            >
              <SelectTrigger id="fallback-severity" className="console-field">
                <SelectValue placeholder="Select severity" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fallback-category" className="text-primary-foreground/75">
              Category
            </Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as Category)}
            >
              <SelectTrigger id="fallback-category" className="console-field">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fallback-plan" className="text-primary-foreground/75">
            Action plan
          </Label>
          <Textarea
            id="fallback-plan"
            placeholder="1. Dispatch backup vehicle…"
            value={actionPlan}
            onChange={(event) => setActionPlan(event.target.value)}
            className="console-field min-h-[88px] focus-visible:ring-accent"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fallback-notification" className="text-primary-foreground/75">
            Customer notification
          </Label>
          <Textarea
            id="fallback-notification"
            placeholder="Short SMS to the customer…"
            value={notificationText}
            onChange={(event) => setNotificationText(event.target.value)}
            className="console-field min-h-[80px] focus-visible:ring-accent"
          />
        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="success"
                className="flex-1"
                onClick={handleSubmit}
                disabled={submitting}
              >
                <CheckCircle2 className="h-4 w-4" />
                {submitting ? "Executing…" : "Approve & Execute"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Save the manually entered exception and apply the same workflow rules as the AI path.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={clearTriage}
                disabled={submitting}
                aria-label="Cancel manual triage"
                className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Close manual triage without saving and return to the main copilot composer.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </section>
  );
}
