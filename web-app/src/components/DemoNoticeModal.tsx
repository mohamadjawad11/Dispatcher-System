"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info, KeyRound, Terminal, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function DemoNoticeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const timer = window.setTimeout(() => setIsOpen(true), 250);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement;
    const originalOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    function getFocusableElements() {
      return Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);

      if (
        previouslyFocused instanceof HTMLElement &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/45 px-4 py-6 backdrop-blur-[2px] animate-in fade-in-0 duration-200"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setIsOpen(false);
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative max-h-[calc(100dvh-3rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-primary/20 bg-card text-card-foreground shadow-[0_30px_80px_hsl(var(--primary)_/_0.26)] outline-none animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/80 bg-secondary/45 px-5 py-4">
          <div className="flex gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-accent/35 bg-accent/15 text-accent-foreground">
              <Info className="h-4 w-4 text-accent" />
            </span>
            <div>
              <h2
                id={titleId}
                className="font-display text-xl font-semibold leading-tight"
              >
                Demo project notice
              </h2>
              <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
                A quick heads-up before you explore the dispatcher workflow.
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close demo notice"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              This is a demo and portfolio project. The OpenAI API key currently
              configured for this deployed demo is a free, limited-token key, so
              it may run out of tokens or stop working at any time.
            </p>
            <p>
              Without a valid OpenAI key, the AI service automatically falls back
              to a simple keyword-based classifier. The demo will still
              technically function, but it will not perform real AI analysis.
            </p>
          </div>

          <div className="rounded-lg border border-border/85 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Terminal className="h-4 w-4 text-accent" />
              Running it yourself
            </div>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Clone the repo from GitHub.</li>
              <li>
                Copy <code className="font-semibold text-foreground">.env.example</code>{" "}
                to <code className="font-semibold text-foreground">.env</code> in both the{" "}
                <code className="font-semibold text-foreground">web-app/</code> and{" "}
                <code className="font-semibold text-foreground">ai-service/</code>{" "}
                folders.
              </li>
              <li>
                Add your own{" "}
                <code className="font-semibold text-foreground">OPENAI_API_KEY</code> in{" "}
                <code className="font-semibold text-foreground">ai-service/.env</code>.
              </li>
              <li>
                Set a shared{" "}
                <code className="font-semibold text-foreground">AI_SERVICE_API_KEY</code>{" "}
                value in both <code className="font-semibold text-foreground">.env</code>{" "}
                files. The values must match.
              </li>
              <li>
                Run{" "}
                <code className="font-semibold text-foreground">
                  docker compose up --build
                </code>{" "}
                for local setup.
              </li>
            </ol>
          </div>

          <div className="flex flex-col gap-3 border-t border-border/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <KeyRound className="h-3.5 w-3.5 text-accent" />
              Bring your own key for reliable AI responses.
            </div>
            <Button type="button" onClick={() => setIsOpen(false)}>
              Got it
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
