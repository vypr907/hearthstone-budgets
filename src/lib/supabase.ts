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
  | "custom"
  /** ADR-048: a non-recurring charge (invoice) with a single due date. */
  | "one_time";



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
  /** ADR-040: interval in days when billing_cycle is "custom". */
  cycle_interval_days?: number | null;
  payment_status: string | null;
  notes: string | null;
  is_active: boolean | null;
  /** Variable bills prompt for the amount owed each cycle. */
  is_variable_amount?: boolean | null;
  /** Amount owed for the current cycle (set on the first payment of a cycle). */
  cycle_amount_due?: number | null;
  /** Total paid so far against the current cycle. */
  cycle_paid_to_date?: number | null;
  /** ADR-049: past-due amount carried in from before tracking started. */
  opening_arrears?: number | null;
  /** ADR-049: date the opening arrears figure was accurate as of. */
  arrears_as_of?: string | null;

  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  household_id: string;
  name: string;
  domain?: string | null;
  parent_category?: string | null;
  /** ADR-029: emoji icon shown on category rows. */
  icon?: string | null;
  /** ADR-029: hex colour accent for category rows. */
  color?: string | null;
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
  /** When true, actual_amount wins over the ledger-derived sum (ADR-041). */
  is_manual_override?: boolean | null;
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
  next_due_date: string | null;
  billing_cycle: BillingCycle | null;
  /** ADR-040: interval in days when billing_cycle is "custom". */
  cycle_interval_days?: number | null;
  payment_status: string | null;

  on_payment_plan: boolean | null;
  paid_with: string | null;
  manual_or_auto: string | null;
  priority_order: number | null;
  notes: string | null;
  date_paid_off: string | null;
  /** ADR-032: serviced by payroll/HSA deduction — excluded from cash obligations. */
  is_paycheck_deduction?: boolean | null;
  /** ADR-035: paid so far toward the current cycle's minimum payment. */
  cycle_paid_to_date?: number | null;
  /** ADR-048: number of payments in the plan, when known. */
  plan_payment_count?: number | null;
  /** ADR-048: final payment amount when it differs from the regular payment. */
  plan_final_payment?: number | null;
  /** ADR-052: invoice reference number; drives the auto-composed name. */
  invoice_number?: string | null;
  /** ADR-049: past-due amount carried in from before tracking started. */
  opening_arrears?: number | null;
  /** ADR-049: date the opening arrears figure was accurate as of. */
  arrears_as_of?: string | null;

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
  /** Full or masked account number; only the last 4 are ever displayed. */
  account_number?: string | null;
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

export type ExportFormat = "png" | "pdf";

export type Household = {
  id: string;
  name?: string | null;
  /** ADR-028: preferred snapshot export encoding. */
  export_format?: ExportFormat | null;
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
  /** ADR-030: logo image URL (often a derived favicon). */
  logo_url?: string | null;
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
  /** ADR-027: set when this row funds/withdraws from a savings goal. */
  linked_goal_id?: string | null;
  /** ADR-044: shared by every line of one split transaction. */
  split_group_id?: string | null;
  /** ADR-056: shared by both sides of a transfer or advance deposit. */
  transfer_group_id?: string | null;
  /** ADR-053: the place this money was spent at (merchant/store). */
  institution_id?: string | null;
  created_at: string;
  updated_at: string;
};

/** ADR-045: a non-payment change to a debt's balance owed. */
export type DebtAdjustment = {
  id: string;
  household_id: string;
  debt_id: string;
  amount: number;
  adjustment_type: string | null;
  description: string | null;
  adjustment_date: string;
  /** ADR-058: when false the row is record-only and does not modify remaining_balance. Default true. */
  affects_balance?: boolean | null;
  created_at?: string | null;
};

/** ADR-058: a non-payment change to a bill's cycle_amount_due. Mirrors debt_adjustments. */
export type BillAdjustment = {
  id: string;
  household_id: string;
  bill_id: string;
  amount: number;
  adjustment_type: string | null;
  description: string | null;
  adjustment_date: string;
  /** ADR-058: when false the row is record-only and does not modify cycle_amount_due. Default true. */
  affects_balance?: boolean | null;
  created_at?: string | null;
};

export type DebtStrategySettings = {
  household_id: string;
  active_strategy: string | null;
  extra_monthly_payment: number | null;
  updated_at?: string | null;
};

/** A recurring source of income. Exactly one per household may be primary. */
export type IncomeSource = {
  id: string;
  household_id: string;
  name: string;
  cadence: string | null;
  is_primary: boolean | null;
  typical_amount: number | null;
  is_active: boolean | null;
  created_at?: string | null;
};

/** How one primary paycheck deposits across accounts (read-only in the UI). */
export type IncomeSourceSplit = {
  id: string;
  income_source_id: string;
  account_id: string | null;
  amount: number | null;
  /** 'fixed' or 'remainder'. */
  split_type: string | null;
  day_offset: number | null;
  sort_order: number | null;
};

/** ADR-055: a pre-tax or post-tax deduction from a paycheck (HSA, 401k, etc.). */
export type IncomeSourceDeduction = {
  id: string;
  household_id: string;
  income_source_id: string;
  name: string;
  /** Flat dollar amount — exactly one of amount / percent is set. */
  amount: number | null;
  /** Percentage of the net pay event amount — exactly one of amount / percent is set. */
  percent: number | null;
  /** Optional account the deduction deposits into. If null, row is reporting-only. */
  destination_account_id: string | null;
  is_pre_tax: boolean | null;
  created_at?: string | null;
};

/** A single expected or received paycheck. */
export type IncomeEvent = {
  id: string;
  household_id: string;
  income_source_id: string | null;
  expected_date: string | null;
  expected_amount: number | null;
  actual_date: string | null;
  actual_amount: number | null;
  status: string | null;
  created_at?: string | null;
};

/** Money set aside for a spending category out of one paycheck. */
export type PayPeriodAllocation = {
  id: string;
  household_id: string;
  income_event_id: string;
  category_id: string | null;
  /** ADR-039: set instead of category_id when the row allocates to a savings goal. */
  goal_id?: string | null;
  /** ADR-059: manually planned payment toward a bill in this pay period. */
  bill_id?: string | null;
  /** ADR-059: manually planned payment toward a debt in this pay period. */
  debt_id?: string | null;
  allocated_amount: number | null;

};


/** ADR-027: a sinking fund. current_amount is derived, never stored. */
export type SavingsGoal = {
  id: string;
  household_id: string;
  name: string;
  icon: string | null;
  target_amount: number;
  target_date: string | null;
  /** ADR-033: optional account this envelope's money physically lives in. */
  account_id?: string | null;
  /** ADR-033: set when this goal is the envelope for a non-monthly bill. */
  linked_bill_id?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
};
