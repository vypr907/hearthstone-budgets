export function formatMoney(n: number | null | undefined): string {
  const v = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(v);
}

export function isOverdue(dueDay: number | null | undefined, status: string | null | undefined) {
  if (!dueDay) return false;
  if (status === "paid" || status === "cleared") return false;
  const today = new Date().getDate();
  return today > dueDay;
}
