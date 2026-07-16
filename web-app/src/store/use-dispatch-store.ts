"use client";

import { create } from "zustand";

import type { ExceptionTriageDraft, ShipmentDTO } from "@/lib/types";

interface DispatchState {
  /** Live list of shipments rendered in the dashboard (kept fresh by polling). */
  shipments: ShipmentDTO[];
  /** The mock AI's pending 3-card output, awaiting dispatcher approval. */
  activeExceptionTriage: ExceptionTriageDraft | null;
  /** True while the AI analysis (or an approve/execute write) is in flight. */
  isProcessing: boolean;
  /** True when analysis failed and the dispatcher must triage manually. */
  isFallbackMode: boolean;
  /** Shipment currently selected in the CoPilot composer, if any. */
  selectedShipmentId: string | null;

  setShipments: (shipments: ShipmentDTO[]) => void;
  selectShipment: (shipmentId: string | null) => void;
  setProcessing: (value: boolean) => void;
  setTriage: (draft: ExceptionTriageDraft) => void;
  clearTriage: () => void;
  enterFallback: () => void;
  exitFallback: () => void;
  reset: () => void;
}

export const useDispatchStore = create<DispatchState>((set) => ({
  shipments: [],
  activeExceptionTriage: null,
  isProcessing: false,
  isFallbackMode: false,
  selectedShipmentId: null,

  setShipments: (shipments) => set({ shipments }),
  selectShipment: (shipmentId) => set({ selectedShipmentId: shipmentId }),
  setProcessing: (value) => set({ isProcessing: value }),
  setTriage: (draft) =>
    set({
      activeExceptionTriage: draft,
      isProcessing: false,
      isFallbackMode: draft.source === "MANUAL",
    }),
  clearTriage: () =>
    set({
      activeExceptionTriage: null,
      isProcessing: false,
      isFallbackMode: false,
    }),
  enterFallback: () => set({ isFallbackMode: true, isProcessing: false }),
  exitFallback: () => set({ isFallbackMode: false }),
  reset: () =>
    set({
      activeExceptionTriage: null,
      isProcessing: false,
      isFallbackMode: false,
      selectedShipmentId: null,
    }),
}));
