/**
 * ADR-029 / ADR-030 — presentation-only metadata helpers.
 *
 * Categories carry their own `icon` / `color` columns; institutions carry a
 * `logo_url`. Anything missing falls back to a neutral gray generic icon or a
 * code-side lookup map (institution types), never to a database write.
 */

import { emojiFor } from "@/components/viz";

/** Small fixed palette offered by the category colour picker. */
export const CATEGORY_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#64748b",
];

/** Neutral fallback when a category has no colour set. */
export const DEFAULT_CATEGORY_COLOR = "#9ca3af";
/** Neutral fallback when a category has no icon set. */
export const DEFAULT_CATEGORY_ICON = "🏷️";

/** ADR-032: marks a debt serviced by payroll/HSA deduction. */
export const PAYCHECK_DEDUCTION_ICON = "💼";

/** ADR-081: marks a recurring auto-transfer between the household's own accounts. */
export const AUTO_TRANSFER_ICON = "🔁";

/** Emoji choices offered by the category icon picker. */
export const CATEGORY_ICONS = [
  "🏷️",
  "🛒",
  "🍽️",
  "⛽",
  "🚗",
  "🏠",
  "💡",
  "💧",
  "📱",
  "🌐",
  "🛡️",
  "🩺",
  "💊",
  "🎬",
  "🎮",
  "🐾",
  "🎓",
  "💳",
  "🏦",
  "🐷",
  "📈",
  "👛",
  "🔁",
  "✈️",
  "🛍️",
  "🎁",
  "👶",
  "💼",
  "🧾",
  "🍺",
  "☕",
  "🍔",
  "🚕",
  "🚌",
  "🚲",
  "⚡",
  "🔧",
  "🛠️",
  "🌳",
  "🧹",
  "🏋️",
  "🧘",
  "💇",
  "💅",
  "🧴",
  "🎵",
  "📺",
  "🎨",
  "📚",
  "🎉",
  "🎂",
  "⚖️",
  "🖥️",
  "❤️",
  "💵",
  "💸",
  "📦",
  "🚬",
  "💨",
  "🆘",
  "📁",
  "🎄",
  "🧮",
  "🚙",
  "🧳",
  "💻",
  "🍕",
  "🛁",
  "🚿",
  "📷",
  "🏖️",
  "🅿️",
  "🏥",
  "🧸",
  "🎧",
  "🕹️",
  "🌱",
  "🐍",
  "🐱",
];

export type CategoryVisualSource = {
  name?: string | null;
  icon?: string | null;
  color?: string | null;
};

/** Resolve the icon + colour to render for a category row. */
export function categoryVisual(category: CategoryVisualSource | null | undefined) {
  return {
    icon: category?.icon?.trim() || DEFAULT_CATEGORY_ICON,
    color: category?.color?.trim() || DEFAULT_CATEGORY_COLOR,
  };
}

/** ADR-104: neutral fallback when a tag has no icon set — distinct from the
 *  category default so a tag chip reads visually different from a category
 *  chip even when neither has picked an icon. */
export const DEFAULT_TAG_ICON = "🔖";

/** Resolve the icon + colour to render for a tag chip. Reuses the category
 *  icon/colour picker palettes (CATEGORY_ICONS/CATEGORY_COLORS) — one set of
 *  choices, not a duplicated second palette. */
export function tagVisual(tag: CategoryVisualSource | null | undefined) {
  return {
    icon: tag?.icon?.trim() || DEFAULT_TAG_ICON,
    color: tag?.color?.trim() || DEFAULT_CATEGORY_COLOR,
  };
}

/* ---------------- Institution types (code-side map, no schema) ---------------- */

const INSTITUTION_TYPE_META: Record<string, { icon: string; color: string }> = {
  bank: { icon: "🏦", color: "#3b82f6" },
  credit_union: { icon: "🏦", color: "#0ea5e9" },
  credit_card: { icon: "💳", color: "#a855f7" },
  lender: { icon: "📄", color: "#6366f1" },
  loan: { icon: "📄", color: "#6366f1" },
  mortgage: { icon: "🏠", color: "#22c55e" },
  utility: { icon: "💡", color: "#f59e0b" },
  insurance: { icon: "🛡️", color: "#14b8a6" },
  medical: { icon: "🩺", color: "#ec4899" },
  telecom: { icon: "📱", color: "#0ea5e9" },
  internet: { icon: "🌐", color: "#3b82f6" },
  subscription: { icon: "🔁", color: "#f97316" },
  retailer: { icon: "🛍️", color: "#ef4444" },
  government: { icon: "🏛️", color: "#64748b" },
  investment: { icon: "📈", color: "#22c55e" },
  // ADR-099
  restaurant: { icon: "🍔", color: "#ef4444" },
  grocery_store: { icon: "🛒", color: "#22c55e" },
  gas_station: { icon: "⛽", color: "#f59e0b" },
  liquor_store: { icon: "🍺", color: "#a855f7" },
  department_store: { icon: "🛍️", color: "#ef4444" },
  specialty_store: { icon: "📦", color: "#f97316" },
  venue: { icon: "🎉", color: "#ec4899" },
  game: { icon: "🎮", color: "#6366f1" },
  app: { icon: "📱", color: "#0ea5e9" },
  dispensary: { icon: "🌱", color: "#22c55e" },
  personal_care: { icon: "💇", color: "#ec4899" },
  employer: { icon: "💼", color: "#64748b" },
  delivery: { icon: "🚕", color: "#f97316" },
};

/** "credit_card" / "credit card" → "Credit Card". */
export function formatTypeLabel(type: string | null | undefined) {
  const s = (type ?? "").trim();
  if (!s) return "Institution";
  return s
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Icon + colour for an institution type, same pattern as categories. */
export function institutionTypeVisual(type: string | null | undefined) {
  const key = (type ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const hit = INSTITUTION_TYPE_META[key];
  if (hit) return hit;
  return { icon: emojiFor(type, "🏢"), color: DEFAULT_CATEGORY_COLOR };
}

/* ---------------- Account types (code-side map, no schema) ---------------- */

const ACCOUNT_TYPE_META: Record<string, { icon: string; color: string }> = {
  checking: { icon: "💳", color: "#3b82f6" },
  savings: { icon: "🐷", color: "#22c55e" },
  credit: { icon: "💳", color: "#a855f7" },
  invest: { icon: "📈", color: "#14b8a6" },
  retirement: { icon: "🏖️", color: "#f59e0b" },
  hsa: { icon: "🩺", color: "#0ea5e9" },
  lpfsa: { icon: "🦷", color: "#0ea5e9" },
  cash: { icon: "💵", color: "#64748b" },
};

/** Icon + colour for an account type, same pattern as institutions. */
export function accountTypeVisual(type: string | null | undefined) {
  const key = (type ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return ACCOUNT_TYPE_META[key] ?? { icon: "🏦", color: DEFAULT_CATEGORY_COLOR };
}

/* ---------------- Logo suggestion (ADR-030) ---------------- */

/** Extract a bare domain from a possibly-scheme-less URL string. */
export function domainFromUrl(url: string | null | undefined) {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withScheme).hostname;
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Suggested favicon URL for a login page domain. Returned for the user to
 * review in the form — never written silently.
 */
export function suggestedLogoUrl(loginUrl: string | null | undefined) {
  const domain = domainFromUrl(loginUrl);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

/**
 * Best-effort domain guess for a merchant typed into the transaction form —
 * "Bob's Burgers" → "bobsburgers.com". Only used to pre-fill a suggested logo,
 * which the user can clear or correct on the institution afterwards.
 */
export function guessMerchantDomain(name: string | null | undefined) {
  const slug = (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (slug.length < 3) return null;
  return `${slug}.com`;
}
