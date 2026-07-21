import { Link } from "@tanstack/react-router";
import { Home, ListChecks, Receipt, CreditCard, Wallet } from "lucide-react";

const items: Array<{ to: string; label: string; icon: typeof Home; exact?: boolean }> = [
  { to: "/app", label: "Home", icon: Home, exact: true },
  { to: "/app/everything", label: "All", icon: ListChecks },
  { to: "/app/bills", label: "Bills", icon: Receipt },
  { to: "/app/debts", label: "Debts", icon: CreditCard },
  { to: "/app/accounts", label: "Accounts", icon: Wallet },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between">
        {items.map(({ to, label, icon: Icon, exact }) => (
          <li key={to} className="flex-1">
            <Link
              to={to as string}
              activeOptions={{ exact: !!exact }}
              activeProps={{ className: "text-primary" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors active:bg-accent/50"
            >
              <Icon className="h-6 w-6" />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
