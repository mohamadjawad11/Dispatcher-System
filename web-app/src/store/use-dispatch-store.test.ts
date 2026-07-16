import { beforeEach, describe, expect, it } from "vitest";

import { Category, Severity } from "@/lib/types";
import type { ExceptionTriageDraft, ShipmentDTO } from "@/lib/types";
import { useDispatchStore } from "@/store/use-dispatch-store";

/**
 * The dispatch store drives the CoPilot triage flow's state machine (idle ->
 * processing -> triage draft -> approved/cleared, with a manual fallback
 * branch). These tests pin down the transitions independent of any React
 * rendering.
 */

function makeDraft(source: ExceptionTriageDraft["source"]): ExceptionTriageDraft {
  return {
    shipmentId: "shipment-1",
    trackingNumber: "DXC-4F2A9",
    rawInput: "truck broke down",
    analysis: {
      structuredRecord: {
        severity: Severity.HIGH,
        category: Category.VEHICLE_ISSUE,
        etaImpact: "delayed by 2 hours",
      },
      actionPlan: "dispatch a replacement vehicle",
      customerNotification: "Your delivery is delayed.",
    },
    source,
  };
}

const initialState = useDispatchStore.getState();

beforeEach(() => {
  useDispatchStore.setState(initialState, true);
});

describe("useDispatchStore", () => {
  it("starts with an idle, empty state", () => {
    const state = useDispatchStore.getState();
    expect(state.shipments).toEqual([]);
    expect(state.activeExceptionTriage).toBeNull();
    expect(state.isProcessing).toBe(false);
    expect(state.isFallbackMode).toBe(false);
    expect(state.selectedShipmentId).toBeNull();
  });

  it("setShipments replaces the shipment list", () => {
    const shipments = [{ id: "s1" }] as unknown as ShipmentDTO[];
    useDispatchStore.getState().setShipments(shipments);
    expect(useDispatchStore.getState().shipments).toBe(shipments);
  });

  it("selectShipment sets and clears the selected id", () => {
    useDispatchStore.getState().selectShipment("shipment-1");
    expect(useDispatchStore.getState().selectedShipmentId).toBe("shipment-1");

    useDispatchStore.getState().selectShipment(null);
    expect(useDispatchStore.getState().selectedShipmentId).toBeNull();
  });

  it("setTriage with an AI draft stores it and exits fallback mode", () => {
    useDispatchStore.getState().setProcessing(true);
    useDispatchStore.getState().setTriage(makeDraft("AI"));

    const state = useDispatchStore.getState();
    expect(state.activeExceptionTriage?.source).toBe("AI");
    expect(state.isProcessing).toBe(false);
    expect(state.isFallbackMode).toBe(false);
  });

  it("setTriage with a MANUAL draft enters fallback mode", () => {
    useDispatchStore.getState().setTriage(makeDraft("MANUAL"));

    const state = useDispatchStore.getState();
    expect(state.activeExceptionTriage?.source).toBe("MANUAL");
    expect(state.isFallbackMode).toBe(true);
  });

  it("clearTriage resets triage, processing, and fallback flags", () => {
    useDispatchStore.getState().setTriage(makeDraft("MANUAL"));
    useDispatchStore.getState().clearTriage();

    const state = useDispatchStore.getState();
    expect(state.activeExceptionTriage).toBeNull();
    expect(state.isProcessing).toBe(false);
    expect(state.isFallbackMode).toBe(false);
  });

  it("enterFallback sets fallback mode and stops processing", () => {
    useDispatchStore.getState().setProcessing(true);
    useDispatchStore.getState().enterFallback();

    const state = useDispatchStore.getState();
    expect(state.isFallbackMode).toBe(true);
    expect(state.isProcessing).toBe(false);
  });

  it("exitFallback clears fallback mode only", () => {
    useDispatchStore.getState().setTriage(makeDraft("MANUAL"));
    useDispatchStore.getState().exitFallback();

    const state = useDispatchStore.getState();
    expect(state.isFallbackMode).toBe(false);
    expect(state.activeExceptionTriage).not.toBeNull();
  });

  it("reset clears triage, processing, fallback, and selection but keeps shipments", () => {
    const shipments = [{ id: "s1" }] as unknown as ShipmentDTO[];
    useDispatchStore.getState().setShipments(shipments);
    useDispatchStore.getState().selectShipment("shipment-1");
    useDispatchStore.getState().setTriage(makeDraft("MANUAL"));

    useDispatchStore.getState().reset();

    const state = useDispatchStore.getState();
    expect(state.activeExceptionTriage).toBeNull();
    expect(state.isProcessing).toBe(false);
    expect(state.isFallbackMode).toBe(false);
    expect(state.selectedShipmentId).toBeNull();
    expect(state.shipments).toBe(shipments);
  });
});
