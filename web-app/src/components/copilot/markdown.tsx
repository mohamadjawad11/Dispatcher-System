import ReactMarkdown from "react-markdown";

import { cn } from "@/lib/utils";

/**
 * Minimal, dependency-light markdown renderer styled for the action-plan card.
 * Avoids pulling in a full typography plugin — we map the handful of elements
 * the mock AI actually emits (headings via bold, ordered lists, paragraphs).
 */
export function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2 text-sm leading-relaxed", className)}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="text-primary-foreground/80">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-primary-foreground">
              {children}
            </strong>
          ),
          ol: ({ children }) => (
            <ol className="ml-4 list-decimal space-y-1 text-primary-foreground/80">
              {children}
            </ol>
          ),
          ul: ({ children }) => (
            <ul className="ml-4 list-disc space-y-1 text-primary-foreground/80">
              {children}
            </ul>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-accent underline underline-offset-2"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
