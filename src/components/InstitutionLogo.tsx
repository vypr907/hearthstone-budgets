import { useState } from "react";
import { cn } from "@/lib/utils";
import { institutionTypeVisual } from "@/lib/visual-meta";

/**
 * ADR-030: institution avatar. Shows the logo when `logoUrl` is set and loads,
 * otherwise falls back to the code-side icon/colour for the institution type.
 */
export function InstitutionLogo({
  logoUrl,
  type,
  size = 40,
  className,
}: {
  logoUrl?: string | null;
  type?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const visual = institutionTypeVisual(type);
  const showImage = !!logoUrl?.trim() && !failed;

  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-[12px] text-lg",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: showImage ? "var(--muted)" : `${visual.color}22`,
      }}
    >
      {showImage ? (
        <img
          src={logoUrl!}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        visual.icon
      )}
    </span>
  );
}
