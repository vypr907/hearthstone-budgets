#!/usr/bin/env node
/**
 * Reconciliation tool: compares the "Checking x0801" section of the OnePay
 * monthly statements (transcribed to planning/one-checking-statement.csv by
 * planning/build-one-statement-csv.mjs — both gitignored, real financial data)
 * against the app's already-logged transactions on the "One Checking - Steven"
 * account (a snapshot pulled via the read-only Supabase MCP into
 * planning/app-one-checking.json).
 *
 * Read-only: parses local files, prints a report, writes nothing, touches no
 * network/DB. Same matching algorithm as scripts/reconcile-usaa-csv.mjs.
 *
 * Usage: node scripts/reconcile-one-csv.mjs [--json-missing]
 *
 * Notes specific to this statement:
 *  - Dates are the statement's post dates (YYYY-MM-DD). The app has real
 *    date drift (statement Jul 3 items logged Jul 19-22, some Aug 1 items
 *    logged Jul 31), so WINDOW_DAYS is a bit wider than the USAA tool.
 *  - Repo split shapes the subset-sum matcher (1-3 app rows -> one CSV
 *    amount) is expected to resolve without special-casing:
 *      Aaron's -$106.30  <-  Debt payment -$97.10 + Fee -$9.20
 *      OnePay Advance Repayment -$231.75  <-  Debt payment -$225 + Fee -$6.75
 *  - Round-Ups / Internal Transfers appear on the statement as type
 *    "Internal Transfer"; in the app they are transfer_group_id pairs whose
 *    checking-side leg is what this tool matches on (amount + date).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PLANNING_DIR = join(ROOT, "planning");
const CSV_PATH = join(PLANNING_DIR, "one-checking-statement.csv");
const SNAPSHOT_PATH = join(PLANNING_DIR, "app-one-checking.json");
const WINDOW_DAYS = 7;

/**
 * institution_id lookup for One Checking merchants, keyed by a regex over the
 * CSV row's "Original Description" (raw statement string). An unmatched
 * merchant just skips the institution constraint (falls back to plain
 * amount+date). Only merchants that recur enough to cause ambiguous matches
 * are worth listing.
 */
const MERCHANT_INSTITUTIONS = [
  [/FRED.?MEYER|FRED M FUEL/i, "c166c7bd-4b67-4eb2-90ab-0854acca957d"], // Fred Meyers
  [/SUNRISE BAGEL/i, "c926ff12-9b44-4ebf-a026-39121df9b5ab"], // Sunrise Bagel & Espresso
  [/SAFEWAY/i, "10da1df2-73fb-4697-ab47-272195075679"], // Safeway
  [/UBER ?\*?EATS/i, "d8f0d0f6-7e50-47c6-82de-8051effedd11"], // UberEats
  [/STARBUCKS/i, "ba9a8635-762a-43de-86ee-5b33775bb5d9"], // Starbucks
  [/WENDYS AIRPRT/i, "e97eb306-7063-4fc9-99b8-060ce76b7ce3"], // Wendy's
  [/CIRCLEK/i, "a07b6ff7-6121-4bbb-9489-67beb5e3f2bc"], // Circle K
  [/AMAZON MARK/i, "00e0a658-5edb-4129-ae7e-e26e3d4da3f4"], // Amazon marketplace
  // AMAZON PRIME / AWS deliberately unconstrained — app tags them to the
  // "Prime" / "AWS" institutions (bill payments), not "Amazon".
  [/GOOGLE \*?Pokemon GO|Google Pokemon GO/i, "038a2a5a-aa70-439b-a120-13e302a7b7c4"], // Pokemon GO
  [/GOOGLE \*?Snapchat/i, "8688a388-f413-4ad2-8559-6f2db62f60e5"], // Snapchat
  [/GOOGLE \*?STARZ/i, "ecd89443-a687-4b9f-8a52-5c53c8177eab"], // Starz
  [/GOOGLE \*?(Pixel Flow)|Google Pixel Flow/i, "deba8862-aa51-4481-a8fb-5cbfd246423e"], // Pixel Flow
  [/GOOGLE ?\*?CATS SOUP|CAT ?SOUP/i, "ffdcf2f0-038c-44bd-9855-4bc270829886"], // Cat Soup
  // Kindle Unlimited deliberately unconstrained — app has a "Bill payment ·
  // Kindle Unlimited" whose institution tag is uncertain; verify in interview.
  [/PLANET FITNESS/i, null], // two memberships (-Me / -You), same amount same day -> let subset-sum split them
  [/STASH (CAPITAL|Financial)|Stash Subs/i, "4957d3da-0694-4863-87cd-2d477f0d8a96"], // Stash
  [/CLEO AI/i, "32ddce8d-df53-4de5-aadc-7818079f10da"], // Cleo
  [/CREDITSTRONG/i, "c20eae0a-fdbe-4d71-9276-75ef5035441b"], // CreditStrong
  [/Credit One Bank/i, "bca8e25c-26dd-4a8f-a69e-e2037748e053"], // CreditOne
  // "Grant" / kikoff01 deliberately unconstrained — two institutions exist
  // ("Grant" lendor_lessor, "Kikoff" financial); verify which the app uses.
  [/Aarons8776079999/i, "634f1e1f-d722-4880-be6c-28b9ff94cb0c"], // Aaron's
  [/LW GENERAL STORE/i, null], // Nature's Releaf storefront -- ambiguous, leave unconstrained
  [/HULU/i, "0c89b633-f68b-4ac1-b1f3-462578d2a830"], // Hulu/Disney+
  [/Beiers Midway Storage/i, "01577eac-023f-4227-9a17-e1642a941410"], // Beiers Storage
  [/SANTANDER/i, "7f018714-6816-4664-8687-10ce1bc88aca"], // Santander
  [/TSP TREAS|FED TSP/i, "97d1bfb7-ccf8-4bc7-bcea-b95fabe820ea"], // Thrift Savings Plan
  [/MoneyLion/i, "8c059a4c-23c8-42b5-92a4-3fe73e4b02b2"], // MoneyLion
  [/Netcentric Techn PAYROLL/i, null], // ASRC Federal paycheck, tagged inconsistently -- leave to amount+date
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
      // ignore
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

function candidatesFor(appRows, date, institution) {
  return appRows
    .filter((r) => {
      if (r.used || dateDist(r.transaction_date, date) > WINDOW_DAYS) return false;
      if (institution) return r.institution_id === institution;
      return true;
    })
    .sort((a, b) => dateDist(a.transaction_date, date) - dateDist(b.transaction_date, date) || a.created_at.localeCompare(b.created_at));
}

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

  let missingRows = [];
  const matchedRows = [];
  for (const row of csvRows) {
    const { classification, match } = classify(row, appRows);
    if (classification === "missing") missingRows.push(row);
    else matchedRows.push({ row, match });
  }

  // Cleanup pass: a "missing" row is downgraded to matched if ANY still-unused
  // app row of the same amount sits within ±SALVAGE_DAYS — no institution
  // constraint, no subset. Catches greedy-ordering false-missings (e.g. an
  // app row modelled as a transfer whose amount also appeared earlier).
  const SALVAGE_DAYS = 12;
  const stillMissing = [];
  for (const row of missingRows) {
    const hit = appRows.find((r) => !r.used && Math.abs(r.amount - row.amount) < 0.005 && dateDist(r.transaction_date, row.date) <= SALVAGE_DAYS);
    if (hit) {
      hit.used = true;
      matchedRows.push({ row, match: [hit], salvaged: true });
    } else {
      stillMissing.push(row);
    }
  }
  missingRows = stillMissing;

  if (process.argv.includes("--json-missing")) {
    console.log(JSON.stringify(missingRows, null, 2));
    return;
  }

  const unexplained = appRows.filter((r) => !r.used);

  console.log(`\nParsed ${csvRows.length} CSV rows, ${appRows.length} app rows. Window: ±${WINDOW_DAYS} days.\n`);
  console.log("=".repeat(78));

  const byMonth = (arr, getDate) => {
    const g = { "2026-07": 0, "2026-08": 0, other: 0 };
    for (const x of arr) {
      const d = getDate(x);
      if (d.startsWith("2026-07")) g["2026-07"]++;
      else if (d.startsWith("2026-08")) g["2026-08"]++;
      else g.other++;
    }
    return g;
  };

  console.log(`\n### MISSING (${missingRows.length}) — on statement, no app match ###`);
  console.log("   by month:", byMonth(missingRows, (r) => r.date));
  for (const row of missingRows) {
    console.log(`   ${row.date}  ${fmt(row.amount).padStart(11)}  [${row.category}]  ${row.original || ""}`);
  }

  if (unexplained.length) {
    console.log(`\n### UNEXPLAINED-IN-APP (${unexplained.length}) — app row, no statement match ###`);
    console.log("   by month:", byMonth(unexplained, (r) => r.transaction_date));
    for (const r of unexplained) {
      console.log(
        `   ${r.transaction_date}  ${fmt(Number(r.amount)).padStart(11)}  ${r.description || "(no descr)"}` +
          `${r.transfer_group_id ? "  <xfer:" + (r.transfer_other_account || "?") + ">" : ""}  [id ${r.id.slice(0, 8)}]`,
      );
    }
  }

  console.log(`\n### MATCHED (${matchedRows.length}) ###`);
  for (const { row, match } of matchedRows) {
    const ids = match.map((m) => `${m.id.slice(0, 8)} ${fmt(m.amount)}`).join(" + ");
    console.log(`   ${row.date}  ${fmt(row.amount).padStart(11)}  ${(row.original || "").slice(0, 42).padEnd(42)}  ->  ${ids}`);
  }

  console.log("\n" + "=".repeat(78));
}

main();
