import type { ReactNode } from "react";

/**
 * Shared empty-state block — the "No X yet" / "Nothing matches" copy that
 * appears when a list is empty or filtered out. Standardizes spacing and
 * muted styling across screens.
 */
export function EmptyState({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={
        "py-8 text-center text-sm text-muted-foreground" +
        (className ? ` ${className}` : "")
      }
    >
      {children}
    </p>
  );
}
