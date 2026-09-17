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
  | "semiannually"
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
  /** ADR-078: running total of arrears-directed payments (separate from opening_arrears). */
  arrears_paid_to_date?: number | null;
  /** ADR-068: paycheck deduction that funds this bill (must have an account). */
  funding_deduction_id?: string | null;
  /** ADR-074: the account this bill is usually paid from. */
  usual_payment_account_id?: string | null;
  /** ADR-106: which household member's account at the institution this belongs to, when set (null = joint/not specified). */
  institution_member_account_id?: string | null;

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
  /** ADR-078: running total of arrears-directed payments (separate from opening_arrears). */
  arrears_paid_to_date?: number | null;
  /** ADR-068: paycheck deduction that funds this debt (must have an account). */
  funding_deduction_id?: string | null;
  /** ADR-074: the account this debt is usually paid from. */
  usual_payment_account_id?: string | null;
  /** ADR-102: the real account this debt's balance actually lives on, when one exists. */
  linked_account_id?: string | null;
  /** ADR-106: which household member's account at the institution this belongs to, when set (null = joint/not specified). */
  institution_member_account_id?: string | null;

  created_at: string;
  updated_at: string;
};

/** ADR-081: a recurring auto-transfer between two of the household's own accounts. */
export type AutoTransfer = {
  id: string;
  household_id: string;
  name: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  category_id: string | null;
  next_due_date: string;
  billing_cycle: BillingCycle;
  /** ADR-040: interval in days when billing_cycle is "custom". */
  cycle_interval_days?: number | null;
  is_active: boolean | null;
  notes: string | null;
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
  /**
   * ADR-088: household_members.id this account belongs to, or null for a
   * shared/joint account. A personal account folds into only that member's
   * spendable / net-worth aggregates; visibility and edit rights are unchanged.
   */
  owner_member_id?: string | null;
  /** ADR-088: when false, the account is left out of the net-worth trend. */
  include_in_net_worth?: boolean | null;
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

/** ADR-061: selectable UI color themes. */
export type ThemeName =
  | "standard"
  | "halo"
  | "hellokitty"
  | "purple_dark"
  | "purple_pastel"
  | "cyber_neon"
  | "cyber_stealth";

export type HouseholdMember = {
  id: string;
  household_id: string;
  user_id: string | null;
  /** ADR-061: per-user display preference, default 'standard'. */
  theme: ThemeName;
  /** Human name for this member; shown in the ADR-088 account-owner picker. */
  display_name?: string | null;
  role?: string;
};

export type InstitutionCategory = {
  institution_id: string;
  category_id: string;
};

/** ADR-104: a free-form label a transaction (or one split line) can carry. */
export type Tag = {
  id: string;
  household_id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  created_at?: string | null;
};

export type TransactionTag = {
  transaction_id: string;
  tag_id: string;
};

export type Institution = {
  id: string;
  household_id: string;
  name: string;
  institution_type: string | null;
  /** The "Main site" — additional named links live in institution_links (ADR-106). */
  login_url: string | null;
  login_username: string | null;
  sign_in_with_google: boolean | null;
  description: string | null;
  notes: string | null;
  /** ADR-030: logo image URL (often a derived favicon). */
  logo_url?: string | null;
  /** ADR-106: Amazon/Prime-style grouping — this institution's totals roll up into its parent's. */
  parent_institution_id?: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * ADR-106: an additional named link for an institution, beyond its
 * `login_url` ("Main site") — e.g. a Bill Pay site or (medical
 * institutions only) a Patient Portal. `label` is the display name;
 * required in practice for `kind: "other"`, optional override otherwise.
 */
export type InstitutionLink = {
  id: string;
  institution_id: string;
  kind: "bill_pay" | "patient_portal" | "other";
  label: string | null;
  url: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/**
 * ADR-106: a household member's own account (account/patient #, login
 * username) at an institution — for providers that bill each member
 * separately rather than combining into one joint invoice.
 */
export type InstitutionMemberAccount = {
  id: string;
  institution_id: string;
  member_id: string;
  account_number: string | null;
  login_username: string | null;
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
  /** ADR-027: set when this row funds/withdraws from a savings goal. */
  linked_goal_id?: string | null;
  /** ADR-044: shared by every line of one split transaction. */
  split_group_id?: string | null;
  /** ADR-056: shared by both sides of a transfer or advance deposit. */
  transfer_group_id?: string | null;
  /** ADR-081: set on the credit leg when a transfer processes a recurring auto-transfer. */
  linked_auto_transfer_id?: string | null;
  /** ADR-053: the place this money was spent at (merchant/store). */
  institution_id?: string | null;
  /** ADR-075: due date this transaction's clear resolved, when it resolved one. */
  resolved_cycle_due_date?: string | null;
  /** ADR-100: when this actually posted/cleared at the bank — null until cleared. */
  cleared_date?: string | null;
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
  /** ADR-102: the mirror transaction this adjustment wrote onto the debt's linked_account_id, if any. */
  mirror_transaction_id?: string | null;
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
  // ADR-095: strategy lock + baseline snapshot. All null = unlocked.
  strategy_locked_at?: string | null;
  locked_strategy?: string | null;
  locked_extra_monthly_payment?: number | null;
  /** Array of debt-id strings — the Custom payoff order frozen at lock. */
  locked_priority_order?: string[] | null;
  baseline_debt_free_date?: string | null;
  baseline_total_interest?: number | null;
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
  /** ADR-082: how this deduction is classified for Past Due grouping / labels. */
  kind?: DeductionKind | null;
  created_at?: string | null;
};

/** ADR-082: deduction classification. `payroll` covers taxes, insurance, 401k/TSP etc. */
export type DeductionKind = "payroll" | "hsa" | "fsa" | "other";

/**
 * ADR-068: audit trail for deduction-funded payments — either the posted
 * deduction didn't match the cycle's due amount, or the cycle was already
 * cleared by hand so the auto-payment did nothing.
 */
export type DeductionPaymentEvent = {
  id: string;
  household_id: string;
  bill_id: string | null;
  debt_id: string | null;
  deduction_id: string;
  event_type: "mismatch" | "already_paid_noop";
  expected_amount: number | null;
  actual_amount: number | null;
  note: string | null;
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
  /** ADR-072: display-only fee breakdown, bill/debt-targeted rows only. */
  fee_amount?: number | null;
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
