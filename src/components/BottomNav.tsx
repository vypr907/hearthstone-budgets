import { Link } from "@tanstack/react-router";
import { Home, ListChecks, Receipt, CreditCard, Clock, MoreHorizontal } from "lucide-react";

const items: Array<{ to: string; label: string; icon: typeof Home; exact?: boolean }> = [
  { to: "/app", label: "Home", icon: Home, exact: true },
  { to: "/app/everything", label: "All", icon: ListChecks },
  { to: "/app/bills", label: "Bills", icon: Receipt },
  { to: "/app/debts", label: "Debts", icon: CreditCard },
  // Accounts moved to the More grid to make room for Pending (ADR-026 nav style).
  { to: "/app/pending", label: "Pending", icon: Clock },
  { to: "/app/more", label: "More", icon: MoreHorizontal },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 shadow-[0_-6px_20px_-12px_rgb(15_23_42/0.25)] backdrop-blur supports-[backdrop-filter]:bg-card/85 pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
        {items.map(({ to, label, icon: Icon, exact }) => (
          <li key={to} className="flex-1">
            <Link
              to={to as string}
              aria-label={label}
              title={label}
              activeOptions={{ exact: !!exact }}
              activeProps={{ className: "[&>span]:bg-brand/12 [&>span]:text-brand" }}
              inactiveProps={{ className: "[&>span]:text-muted-foreground" }}
              className="flex h-16 flex-col items-center justify-center"
            >
              <span className="grid h-11 w-11 place-items-center rounded-[14px] transition-colors">
                <Icon className="h-6 w-6" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
