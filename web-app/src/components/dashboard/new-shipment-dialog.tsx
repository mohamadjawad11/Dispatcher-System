"use client";

import { useRef, useState } from "react";
import { CircleDot, Hash, PackagePlus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createShipment } from "@/app/actions/shipments";

type Errors = { customerName?: string; destinationCity?: string };

/**
 * Trigger button + native <dialog> for registering a new shipment. The shipment
 * enters the state machine at DISPATCHED with a server-minted tracking number;
 * `onCreated` receives the new id so the ledger can refresh and highlight it.
 */
export function NewShipmentDialog({
  onCreated,
}: {
  onCreated: (shipmentId: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [customerName, setCustomerName] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  function open() {
    setCustomerName("");
    setDestinationCity("");
    setErrors({});
    dialogRef.current?.showModal();
  }

  function close() {
    if (submitting) return;
    dialogRef.current?.close();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: Errors = {};
    if (!customerName.trim())
      nextErrors.customerName = "Customer name is required.";
    if (!destinationCity.trim())
      nextErrors.destinationCity = "Destination city is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const result = await createShipment({ customerName, destinationCity });
    setSubmitting(false);

    if (!result.ok) {
      toast.error("Could not create shipment", { description: result.error });
      return;
    }

    toast.success(`Shipment ${result.data.trackingNumber} created`, {
      description: "Now DISPATCHED. Audit trail updated.",
    });
    dialogRef.current?.close();
    onCreated(result.data.id);
  }

  return (
    <>
      <Button size="sm" onClick={open}>
        <PackagePlus className="h-3.5 w-3.5" />
        New shipment
      </Button>

      <dialog
        ref={dialogRef}
        className="shipment-dialog p-0"
        aria-labelledby="new-shipment-title"
        onCancel={(event) => {
          if (submitting) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                id="new-shipment-title"
                className="font-display text-lg font-semibold tracking-[-0.02em]"
              >
                New shipment
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Register a shipment into the live ledger.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-shipment-customer">Customer name</Label>
            <Input
              id="new-shipment-customer"
              autoFocus
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="e.g. Rana Haddad"
              disabled={submitting}
              aria-invalid={Boolean(errors.customerName)}
              aria-describedby={
                errors.customerName ? "new-shipment-customer-error" : undefined
              }
            />
            {errors.customerName && (
              <p
                id="new-shipment-customer-error"
                className="text-xs font-medium text-destructive"
              >
                {errors.customerName}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-shipment-destination">Destination city</Label>
            <Input
              id="new-shipment-destination"
              value={destinationCity}
              onChange={(event) => setDestinationCity(event.target.value)}
              placeholder="e.g. Zahlé"
              disabled={submitting}
              aria-invalid={Boolean(errors.destinationCity)}
              aria-describedby={
                errors.destinationCity
                  ? "new-shipment-destination-error"
                  : undefined
              }
            />
            {errors.destinationCity && (
              <p
                id="new-shipment-destination-error"
                className="text-xs font-medium text-destructive"
              >
                {errors.destinationCity}
              </p>
            )}
          </div>

          {/* Show the machine: what the system will assign, not editable. */}
          <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/12 bg-background/70 px-2 py-1 text-muted-foreground">
              <Hash className="h-3 w-3" />
              Tracking #<span className="text-foreground">auto-assigned</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/12 bg-background/70 px-2 py-1 text-muted-foreground">
              <CircleDot className="h-3 w-3 text-success" />
              Status<span className="text-foreground">DISPATCHED</span>
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create shipment"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
