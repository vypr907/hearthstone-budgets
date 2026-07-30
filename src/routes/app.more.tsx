import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, ChevronRight, PiggyBank, Receipt } from "lucide-react";

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
  { to: "/app/institutions", label: "Institutions", icon: Building2 },
  { to: "/app/transactions", label: "Transactions", icon: Receipt },
];

function MorePage() {
  return (
    <>
      <AppHeader title="More" />
      <div className="space-y-2 p-4">
        {links.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to}>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 text-base font-medium">{label}</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
