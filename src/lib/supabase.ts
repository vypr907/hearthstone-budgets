import { createClient } from "@supabase/supabase-js";

// Publishable key — safe to include in client bundle. RLS enforces access.
const SUPABASE_URL = "https://ilxwhgqudcxsgxrvxhtb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Q56nrfX0_LE4cuKWzYYk4g_nFURfIN5";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export type BillingCycle =
  | "monthly"
  | "biweekly"
  | "quarterly"
  | "bimonthly"
  | "annually"
  | "custom";


export type Bill = {
  id: string;
  household_id: string;
  name: string;
  category_id: string | null;
  institution_id: string | null;
  amount: number;
  manual_or_auto: string | null;
  next_due_date: string | null;
  billing_cycle: BillingCycle | null;
  payment_status: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  household_id: string;
  name: string;
  domain?: string | null;
  parent_category?: string | null;
};

export type SpendingBudget = {
  id: string;
  household_id: string;
  category_id: string | null;
  budgeted_amount: number;
  description?: string | null;
  updated_at?: string | null;
};

export type SpendingActual = {
  id: string;
  household_id: string;
  category_id: string | null;
  /** First day of the month, ISO date. */
  month: string;
  actual_amount: number;
  created_at?: string | null;
};


export type Debt = {
  id: string;
  household_id: string;
  name: string;
  category_id: string | null;
  debt_type: string | null;
  institution_id: string | null;
  starting_balance: number | null;
  program_start_balance: number | null;
  remaining_balance: number | null;
  minimum_payment: number | null;
  interest_rate: number | null;
  known_finance_charge: number | null;
  due_day: number | null;
  payment_status: string | null;
  on_payment_plan: boolean | null;
  paid_with: string | null;
  manual_or_auto: string | null;
  priority_order: number | null;
  notes: string | null;
  date_paid_off: string | null;
  created_at: string;
  updated_at: string;
};

export type Account = {
  id: string;
  household_id: string;
  institution_id: string | null;
  name: string;
  account_type: string | null;
  starting_balance: number | null;
  is_spendable: boolean | null;
  credit_limit: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};


export type AccountBalance = {
  id: string;
  account_id: string;
  balance: number;
  as_of_date: string;
  created_at: string;
};

export type Household = {
  id: string;
  name?: string;
};

export type InstitutionCategory = {
  institution_id: string;
  category_id: string;
};

export type Institution = {
  id: string;
  household_id: string;
  name: string;
  institution_type: string | null;
  login_url: string | null;
  login_username: string | null;
  sign_in_with_google: boolean | null;
  description: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionStatus = "pending" | "cleared";

export type Transaction = {
  id: string;
  household_id: string;
  account_id: string | null;
  category_id: string | null;
  amount: number;
  status: TransactionStatus | null;
  description: string | null;
  transaction_date: string;
  linked_bill_id: string | null;
  linked_debt_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DebtStrategySettings = {
  household_id: string;
  active_strategy: string | null;
  extra_monthly_payment: number | null;
  updated_at?: string | null;
};
