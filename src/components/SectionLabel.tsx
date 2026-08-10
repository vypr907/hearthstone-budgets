/**
 * Shared section label — the uppercase eyebrow text above grouped content.
 * Standardizes the typography that previously drifted between text-xs / 11px
 * and tracking-wide / tracking-widest across screens.
 *
 * Use `size="sub"` for the smaller in-card labels (the old 10px variant).
 */
export function SectionLabel({
  children,
  className,
  size = "md",
}: {
  children: React.ReactNode;
  className?: string;
  size?: "md" | "sub";
}) {
  return (
    <p
      className={
        (size === "sub"
          ? "text-[10px] font-semibold uppercase tracking-widest"
          : "text-[11px] font-semibold uppercase tracking-widest") +
        " text-muted-foreground" +
        (className ? ` ${className}` : "")
      }
    >
      {children}
    </p>
  );
}
