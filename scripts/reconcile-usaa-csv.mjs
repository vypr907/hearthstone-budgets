#!/usr/bin/env node
/**
 * Reusable reconciliation tool: compares a direct USAA bank export
 * (planning/transactions_USAAnew.csv, gitignored — real financial data)
 * against the app's already-logged transactions on the "Classic Checking"
 * (USAA) account (a snapshot pulled via the read-only Supabase MCP into
 * planning/app-usaa-transactions.json).
 *
 * Read-only: parses local files, prints a report, writes nothing, touches no
 * network/DB.
 *
 * Usage: node scripts/reconcile-usaa-csv.mjs [--json-missing]
 *
 * Same matching algorithm as scripts/reconcile-venmo-csv.mjs (built first,
 * during the Venmo reconciliation earlier this session) — reused rather than
 * copied wholesale, since this CSV's shape is simpler:
 *   - Dates are plain YYYY-MM-DD already (no UTC->Alaska-local conversion).
 *   - No separate fee column — a fee is just its own CSV line (e.g. an
 *     "OD FEE" row), so a payment+fee pair on the app side is found the same
 *     way the Venmo tool finds them: the subset-sum matcher (1-3 app rows
 *     summing to one CSV amount) needs no special-casing for this.
 *   - Single CSV file, not a directory of monthly statements.
 *
 * Matching: for each CSV row, candidate app rows are those on the same
 * account within ±WINDOW_DAYS, optionally constrained to the CSV row's own
 * mapped institution_id (MERCHANT_INSTITUTIONS below) when one applies.
 * Within that candidate set, a subset of 1-3 rows summing to the CSV amount
 * (within half a cent) wins; ties broken by closest date, not array order.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PLANNING_DIR = join(ROOT, "planning");
const CSV_PATH = join(PLANNING_DIR, "transactions_USAAnew.csv");
const SNAPSHOT_PATH = join(PLANNING_DIR, "app-usaa-transactions.json");
const WINDOW_DAYS = 5;

/**
 * institution_id lookup for Classic Checking (USAA) merchants, keyed by a
 * regex over the CSV row's "Original Description" field (the raw bank
 * string, more stable than the cleaned-up "Description"). Extend as new
 * merchants show up in future statements — an unmatched merchant just skips
 * the institution constraint (falls back to plain amount+date matching).
 */
const MERCHANT_INSTITUTIONS = [
  // OD FEE checked first — several fee descriptions embed the *triggering*
  // merchant's name (e.g. "OD FEE - ITEM PAID - ACH - ATT PAYMENT"), which
  // would otherwise wrongly match that merchant's own rule below.
  [/OD FEE|OVERDRAFT/i, "4893aa05-e6bd-4c45-afba-5dc74c1943af"], // USAA overdraft fees/refunds
  [/GCI BILLING/i, "9a208d45-010a-4d4c-9730-281ed8df3b3f"], // GCI
  [/SP CRUNCHLABS/i, "5be567ef-05f4-4a40-8dd4-e92a8c1bb4c3"], // CrunchLabs
  [/AMAZON MKTPL/i, "00e0a658-5edb-4129-ae7e-e26e3d4da3f4"], // Amazon
  [/CLEO AI/i, "32ddce8d-df53-4de5-aadc-7818079f10da"], // Cleo
  [/ATT\s+PAYMENT/i, "545595ef-1c76-496c-9c4a-4d4a6f095b75"], // AT&T
  [/FRED-MEYER/i, "c166c7bd-4b67-4eb2-90ab-0854acca957d"], // Fred Meyers
  [/LOVABLE/i, "13745bd0-20c1-4862-adf7-b25f32cb07c7"], // Lovable
  [/MISSION LANE/i, "c2b1f161-e9f8-4099-accf-7c6f7e17b0df"], // MissionLane
  [/Earnin/i, "fa2fa42f-7619-43f6-a5dd-537f9587b9d0"], // EarnIn
  [/INSTACASH REPAYMENT/i, "8c059a4c-23c8-42b5-92a4-3fe73e4b02b2"], // MoneyLion (Instacash)
  [/PROGRESSIVE LEASING/i, "d84cdbbb-d0a6-4e4f-88ed-0921522f9a79"], // Progressive Leasing (debt: FM Jewelry)
  [/PROSE\*/i, "769979ed-a89e-4d46-8a26-5c9624763f29"], // Prose
  [/Dave Inc/i, "1d7e513a-5133-4163-a610-371a450d4dfa"], // Dave
  [/CIRCLEK/i, "a07b6ff7-6121-4bbb-9489-67beb5e3f2bc"], // Circle K
  [/GOOGLE \*Google One/i, "e760984c-ba96-4243-9b3c-ad8e2c68c6a8"], // Google One
  [/GOOGLE \*Play Pass/i, "d26437d2-c22a-414b-9e6f-ad67190457f5"], // Google Play
  [/SELF LENDER/i, "7a3c0684-54c3-4daa-9076-be6956198d71"], // Self
  [/KIKOFFINC/i, "f1dccdc1-5391-46ed-b407-29ffc44477ec"], // Kikoff
  [/BREWSTER'?S RESTAURANT/i, "0dec2ead-f20e-4eb3-b959-d40e086ff7dd"], // Brewster's Restaurant
  // Flex intentionally has NO institution mapping: sometimes it's a direct
  // Flex fee (institution=Flex), sometimes it's rent paid *through* Flex
  // (institution=the landlord, described "Rent (via Flex)") — an
  // institution constraint here would hide the latter. Plain amount+date
  // subset-sum handles both without it.
  [/DFAS-IN/i, "02f75782-3faf-4d78-8a45-e693bd71db5b"], // DFAS
  [/USAA P&C/i, "4893aa05-e6bd-4c45-afba-5dc74c1943af"], // USAA (P&C insurance tagged to USAA itself)
  [/BEIERS MIDWAY STORAGE/i, "01577eac-023f-4227-9a17-e1642a941410"], // Beiers Storage
  [/SPOTIFY/i, "58afd972-830d-4a12-b992-ffe692af09b5"], // Spotify
  // "Netcentric Techn PAYROLL" (the ASRC Federal paycheck) is deliberately
  // NOT matched here — the app tags these deposits inconsistently (USAA,
  // ASRC Federal, or null across the 3 logged so far), so an institution
  // constraint would hide real matches. Plain amount+date handles it.
  [/B&N MEMBERSHIP/i, "95f86315-b27c-4461-bd84-c39eade6b464"], // Barnes & Noble
  [/DEPT EDUCATION/i, "6468f222-8ac3-4cef-a0c1-3d1f53d00233"], // Dept of Education
  [/POSSIBLE FINANCIAL/i, "a96b2daf-b6ed-4c5f-8384-386428ddc792"], // Possible
  [/PAYPAL \*PYPL PAYIN4/i, "2ef414d5-40e0-4092-bab0-fd73d80342f8"], // PayPal (debt: Ticket 3)
  // "Tilt Transfer" is deliberately NOT matched here — the app models those
  // as plain two-sided transfer legs (institution_id null), not Tilt-tagged
  // spend, so constraining to Tilt's institution would hide the real match.
  [/TILT (FINANCE|ADVANCE)/i, "480d00f9-44ff-41b7-8036-97de8dea4acb"], // Tilt
];
function tagInstitution(label) {
  for (const [re, inst] of MERCHANT_INSTITUTIONS) if (re.test(label || "")) return inst;
  return null;
}

/** Minimal RFC4180 CSV line parser — handles quoted fields with embedded commas. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignore, \n handles the line break
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseMoney(s) {
  if (!s) return null;
  const cleaned = s.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function loadCsvRows() {
  const text = readFileSync(CSV_PATH, "utf-8");
  const rows = parseCsv(text);
  const header = rows[0];
  const col = (name) => header.indexOf(name);
  const dateCol = col("Date");
  const descCol = col("Description");
  const origCol = col("Original Description");
  const catCol = col("Category");
  const amtCol = col("Amount");
  const statusCol = col("Status");

  const out = [];
  for (const r of rows.slice(1)) {
    if (!r[dateCol]) continue;
    const amount = parseMoney(r[amtCol]);
    if (amount === null) continue;
    out.push({
      date: r[dateCol],
      description: r[descCol] || null,
      original: r[origCol] || null,
      category: r[catCol] || null,
      amount,
      status: r[statusCol] || null,
      institution: tagInstitution(r[origCol]),
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function loadAppRows() {
  const rows = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8"));
  return rows.map((r) => ({ ...r, amount: Number(r.amount), used: false }));
}

const dayMs = 86400000;
function dateDist(a, b) {
  return Math.abs(Math.round((new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime()) / dayMs));
}

/** Candidates within the window, closest-date-first (ties by created_at,
 * oldest first). When `institution` is set, only same-institution app rows
 * qualify at all. */
function candidatesFor(appRows, date, institution) {
  return appRows
    .filter((r) => {
      if (r.used || dateDist(r.transaction_date, date) > WINDOW_DAYS) return false;
      if (institution) return r.institution_id === institution;
      return true;
    })
    .sort((a, b) => dateDist(a.transaction_date, date) - dateDist(b.transaction_date, date) || a.created_at.localeCompare(b.created_at));
}

/** Find a subset (size 1..3) of candidates summing to `target` (within half a cent). */
function findSubsetSum(candidates, target) {
  const n = candidates.length;
  for (let size = 1; size <= 3 && size <= n; size++) {
    const combo = (start, chosen) => {
      if (chosen.length === size) {
        const sum = chosen.reduce((s, r) => s + r.amount, 0);
        if (Math.abs(sum - target) < 0.005) return chosen.slice();
        return null;
      }
      for (let i = start; i < n; i++) {
        const found = combo(i + 1, [...chosen, candidates[i]]);
        if (found) return found;
      }
      return null;
    };
    const found = combo(0, []);
    if (found) return found;
  }
  return null;
}

function classify(csvRow, appRows) {
  const candidates = candidatesFor(appRows, csvRow.date, csvRow.institution);
  const match = findSubsetSum(candidates, csvRow.amount);
  if (match) {
    for (const r of match) r.used = true;
    return { classification: "matched", match };
  }
  return { classification: "missing", match: null };
}

function fmt(n) {
  return (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
}

function main() {
  const csvRows = loadCsvRows();
  const appRows = loadAppRows();

  const missingRows = [];
  const matchedRows = [];
  for (const row of csvRows) {
    const { classification, match } = classify(row, appRows);
    if (classification === "missing") missingRows.push(row);
    else matchedRows.push({ row, match });
  }

  if (process.argv.includes("--json-missing")) {
    console.log(JSON.stringify(missingRows, null, 2));
    return;
  }

  const unexplained = appRows.filter((r) => !r.used);

  console.log(`\nParsed ${csvRows.length} CSV rows, ${appRows.length} app rows. Window: ±${WINDOW_DAYS} days.\n`);
  console.log("=".repeat(70));

  console.log(`\n### MISSING (${missingRows.length}) — in CSV, no app match found ###`);
  for (const row of missingRows) {
    console.log(`    ${row.date}  ${fmt(row.amount)}  ${row.description || ""}  [${row.original || ""}]`);
  }

  console.log(`\n### MATCHED (${matchedRows.length}) ###`);
  for (const { row, match } of matchedRows) {
    const ids = match.map((m) => `${m.id.slice(0, 8)} ${fmt(m.amount)}`).join(" + ");
    console.log(`    ${row.date}  ${fmt(row.amount)}  ${row.description || ""}  ->  ${ids}`);
  }

  if (unexplained.length) {
    console.log(`\n### UNEXPLAINED-IN-APP (${unexplained.length}) — no CSV row matched ###`);
    for (const r of unexplained) {
      console.log(`    ${r.transaction_date}  ${fmt(Number(r.amount))}  ${r.description || ""}  [id ${r.id}]`);
    }
  }

  console.log("\n" + "=".repeat(70));
}

main();
