import { cn } from "@/lib/utils";

/**
 * Fixed rotating palette used to colour per-item bars and rings so lists read
 * as distinct rows instead of one flat accent. Presentation only.
 */
export const ITEM_COLORS = [
  "var(--item-1)",
  "var(--item-2)",
  "var(--item-3)",
  "var(--item-4)",
  "var(--item-5)",
  "var(--item-6)",
];

export function itemColor(index: number) {
  return ITEM_COLORS[index % ITEM_COLORS.length];
}

/** Stable colour for a named row (so a category keeps its colour). */
export function colorForKey(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return itemColor(h);
}

/** Small circular progress ring, ~48px, with the percentage in the middle. */
export function ProgressRing({
  value,
  color,
  size = 48,
  label,
  className,
}: {
  value: number;
  color?: string;
  size?: number;
  label?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-label={label ?? `${Math.round(pct)}% used`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? "var(--brand)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
        />
      </svg>
      <span className="absolute text-[10px] font-bold tabular-nums">
        {Math.round(pct)}%
      </span>
    </span>
  );
}

/** Horizontal bar with a per-item colour. */
export function ItemBar({
  value,
  color,
  className,
}: {
  value: number;
  color?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${pct}%`, background: color ?? "var(--brand)" }}
      />
    </div>
  );
}

const EMOJI_RULES: Array<[RegExp, string]> = [
  [/grocer|food|market/i, "🛒"],
  [/gas|fuel|car|auto|vehicle/i, "⛽"],
  [/dining|restaurant|eat|coffee/i, "🍽️"],
  [/rent|mortgage|house|home/i, "🏠"],
  [/electric|power|utilit|water|energy/i, "💡"],
  [/phone|mobile|cell/i, "📱"],
  [/internet|wifi|cable/i, "🌐"],
  [/insur/i, "🛡️"],
  [/medical|health|doctor|dental/i, "🩺"],
  [/stream|netflix|entertain|fun/i, "🎬"],
  [/pet|dog|cat/i, "🐾"],
  [/kid|child|school|tuition|student/i, "🎓"],
  [/credit|card/i, "💳"],
  [/loan|debt/i, "🏦"],
  [/save|saving/i, "🐷"],
  [/check/i, "🏦"],
  [/invest|retire/i, "📈"],
  [/cash|wallet/i, "👛"],
  [/subscription|member/i, "🔁"],
  [/travel|vacation/i, "✈️"],
  [/cloth|shop/i, "🛍️"],
  [/gift|holiday/i, "🎁"],
];

/** A friendly single-emoji icon derived from a name/type. Cosmetic only. */
export function emojiFor(name: string | null | undefined, fallback = "💰") {
  const s = (name ?? "").trim();
  if (!s) return fallback;
  for (const [re, emoji] of EMOJI_RULES) if (re.test(s)) return emoji;
  return fallback;
}

/** Rounded tinted square holding an emoji icon. */
export function EmojiIcon({
  name,
  fallback,
  className,
}: {
  name?: string | null;
  fallback?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-muted text-lg",
        className,
      )}
    >
      {emojiFor(name, fallback)}
    </span>
  );
}

/**
 * SVG donut chart showing share-of-spending by category.
 * Each slice is proportional to its `value`; zero-spend categories are omitted.
 * Slices under 2% are collapsed into an "Other" segment to avoid tiny slivers.
 */
export function DonutChart({
  slices,
  size = 140,
  thickness = 22,
  className,
}: {
  slices: Array<{ label: string; value: number; color: string }>;
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const visible = slices.filter((s) => s.value > 0);
  const total = visible.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  // Merge tiny slices (< 2%) into "Other" to prevent visual noise.
  const MIN_PCT = 0.02;
  const main: typeof visible = [];
  let otherTotal = 0;
  for (const s of visible) {
    if (s.value / total < MIN_PCT) otherTotal += s.value;
    else main.push(s);
  }
  if (otherTotal > 0)
    main.push({ label: "Other", value: otherTotal, color: "var(--muted-foreground)" });

  // Build arc segments using strokeDasharray / strokeDashoffset rotation trick.
  let offset = 0; // offset in circumference units, starting from top (−90°)
  const segments = main.map((s) => {
    const pct = s.value / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const rotation = (offset / circumference) * 360 - 90;
    offset += dash;
    return { ...s, dash, gap, rotation };
  });

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Spending by category"
        className="shrink-0"
      >
        {/* Background ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={thickness}
        />
        {segments.map((seg) => (
          <circle
            key={seg.label}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeDasharray={`${seg.dash} ${seg.gap}`}
            strokeDashoffset={0}
            style={{ transform: `rotate(${seg.rotation}deg)`, transformOrigin: `${cx}px ${cy}px` }}
            aria-label={`${seg.label}: ${Math.round((seg.value / total) * 100)}%`}
          />
        ))}
      </svg>
      {/* Legend — top 5 slices by value */}
      <div className="min-w-0 flex-1 space-y-1">
        {[...main]
          .sort((a, b) => b.value - a.value)
          .slice(0, 5)
          .map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: s.color }}
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
              <span className="shrink-0 tabular-nums font-medium">
                {Math.round((s.value / total) * 100)}%
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
