import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { itemColor } from "@/components/viz";

import {
  Building2,
  CalendarDays,
  PiggyBank,
  Target,
  Camera,
  Tags,
  Receipt,
  Settings,
  TrendingDown,
  Wallet,
} from "lucide-react";


export const Route = createFileRoute("/app/more")({
  head: () => ({
    meta: [
      { title: "More — Hearthstone" },
      {
        name: "description",
        content:
          "Reach institutions, the transaction ledger, and other household tools in Hearthstone.",
      },
      { property: "og:title", content: "More — Hearthstone" },
      {
        property: "og:description",
        content:
          "Reach institutions, the transaction ledger, and other household tools in Hearthstone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MorePage,
});

const links = [
  { to: "/app/spending", label: "Spending", icon: PiggyBank },
  { to: "/app/goals", label: "Savings Goals", icon: Target },
  { to: "/app/paycheck", label: "Paycheck Budget", icon: Wallet },
  { to: "/app/debt-strategy", label: "Debt Strategy", icon: TrendingDown },
  { to: "/app/payment-schedule", label: "Payment Schedule", icon: CalendarDays },
  { to: "/app/categories", label: "Categories", icon: Tags },
  { to: "/app/institutions", label: "Institutions", icon: Building2 },
  { to: "/app/transactions", label: "Transactions", icon: Receipt },
  { to: "/app/snapshot", label: "Status Snapshot", icon: Camera },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

function MorePage() {
  return (
    <>
      <AppHeader title="More" />
      {/* Icon gallery — three tiles per row on phones, four from sm up. */}
      <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4">
        {links.map(({ to, label, icon: Icon }, i) => (
          <Link key={to} to={to} className="min-w-0">
            <Card className="h-full transition-transform active:scale-[0.97]">
              <CardContent className="flex h-full flex-col items-center gap-2 p-3 text-center">
                <span
                  aria-hidden
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px]"
                  style={{ background: `color-mix(in oklab, ${itemColor(i)} 18%, transparent)` }}
                >
                  <Icon className="h-6 w-6" style={{ color: itemColor(i) }} />
                </span>
                <span className="text-xs font-semibold leading-tight">{label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

