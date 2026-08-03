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
