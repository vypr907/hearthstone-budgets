#!/usr/bin/env node
/**
 * Reusable reconciliation tool: compares Venmo's own monthly statement CSVs
 * (planning/*.csv, gitignored — real financial data) against the app's
 * already-logged transactions on the "Venmo - Steven" account (a snapshot
 * pulled via the read-only Supabase MCP into planning/app-venmo-transactions.json).
 *
 * Read-only: parses local files, prints a report, writes nothing, touches no
 * network/DB.
 *
 * Usage: node scripts/reconcile-venmo-csv.mjs [--json-missing]
 *
 * Matching algorithm (fixed 2026-09-08 after a real duplicate-insertion
 * incident — see docs/DECISIONS.md ADR-097 addendum / docs/SESSION.md):
 * Venmo card purchases can clear 2-5 days after the date the household
 * enters manually, so a tight ±1 day window let genuinely-already-logged
 * purchases look "missing." The fix has two parts:
 *   1. A wide window (±WINDOW_DAYS, default 5) instead of ±1.
 *   2. For purchase types (Venmo Card Transaction / Merchant Transaction),
 *      candidates are constrained to app rows sharing the SAME
 *      institution_id the CSV row maps to via MERCHANT_RULES below — a wide
 *      window without this constraint lets an unrelated same-amount row
 *      (any round dollar figure) "steal" a match meant for a different
 *      merchant. Extend MERCHANT_RULES as new merchants show up in future
 *      statements — an untagged merchant just falls back to plain
 *      amount+date matching (no institution constraint), same as
 *      transfers/payments/deposits/debits always have.
 *   3. Within the window, the CLOSEST date wins (not "first found" in
 *      array order, and not "oldest created_at" — both of those produced
 *      wrong pairings when multiple candidates existed in the same bucket).
 *
 * Known residual limitation: CSV rows are still processed in one
 * chronological pass (not a globally-optimal bipartite match), so a
 * merchant/amount combo that repeats several times close together in one
 * statement can occasionally have an earlier CSV row "steal" the app row
 * that rightfully belongs to a later one, leaving that later one reported
 * as MISSING even though it's actually already logged. Give any "missing"
 * row from a merchant with multiple same-amount charges nearby a quick
 * manual glance before trusting the report outright — this only produces
 * over-cautious false "missing" flags, never a false match, so it can't
 * cause a duplicate insert on its own.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PLANNING_DIR = join(ROOT, "planning");
const WINDOW_DAYS = 5;

/** Alaska is UTC-8 (AKST) / UTC-9 in some conventions people approximate;
 * we only need "same local calendar day" resolution. */
const AK_OFFSET_HOURS = 8;

function toLocalDate(utcIso) {
  const d = new Date(utcIso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(utcIso) ? utcIso : utcIso + "Z");
  const local = new Date(d.getTime() - AK_OFFSET_HOURS * 3600 * 1000);
  return local.toISOString().slice(0, 10);
}

/**
 * institution_id lookup for the household's "Venmo - Steven" account
 * merchants, keyed by a regex over the CSV row's Note/To/Destination field.
 * Extend this list as new merchants appear in future statements — an
 * unmatched merchant just skips the institution constraint (falls back to
 * plain amount+date matching within the window).
 */
const MERCHANT_INSTITUTIONS = [
  [/CLEO\*? ?EXPRESS FEE/i, "32ddce8d-df53-4de5-aadc-7818079f10da"],
  [/FRED M FUEL/i, "c166c7bd-4b67-4eb2-90ab-0854acca957d"],
  [/FRED[- ]MEYER/i, "c166c7bd-4b67-4eb2-90ab-0854acca957d"],
  [/SAFEWAY/i, "10da1df2-73fb-4697-ab47-272195075679"],
  [/WM SUPERCENTER/i, "85e88a17-bd0a-4a5f-8967-0c86cfa39c7c"],
  [/CIRCLEK/i, "a07b6ff7-6121-4bbb-9489-67beb5e3f2bc"],
  [/O'?REILLY/i, "cdda28fd-798c-48e5-9024-b54339806745"],
  [/Sunrise Bagel/i, "c926ff12-9b44-4ebf-a026-39121df9b5ab"],
  [/STARBUCKS/i, "ba9a8635-762a-43de-86ee-5b33775bb5d9"],
  [/McDonald'?s/i, "016d03d5-6646-4b1b-9b10-c1189e3cc452"],
  [/SONIC DRIVE/i, "5ea01191-9746-4177-ad34-aec3a8d65bd3"],
  [/BREWSTER'?S/i, "0dec2ead-f20e-4eb3-b959-d40e086ff7dd"],
  [/FATBURGER/i, "71c04f23-da43-4d1a-8062-ccece7a695d2"],
  [/NORTH POLE ALEHOUS/i, "6489f2a0-5070-410f-83ae-a537879377b5"],
  [/SIAM SQUARE/i, "7ce9f1fd-3e8d-4f65-9542-e298381b9988"],
  [/CAFE DE STIR IT UP/i, "e4355812-04ad-49cc-965a-5c0de5042f8e"],
  [/LITTLE OWL/i, "f007916f-3bd7-488a-808a-a078be3fbd27"],
  [/GOLD STAR LIQUOR/i, "cd4a82c0-45ae-4796-8aa8-17145793f37f"],
  [/UBER\s*\*\s*EATS/i, "d8f0d0f6-7e50-47c6-82de-8051effedd11"],
  [/WAI EXPRESS/i, "ca5031c3-5c58-490d-ab2b-7779218c9a5c"],
  [/JIM\.COM\*? ?MURAD/i, "4043c8be-7c50-4077-a369-ade9272371fa"],
  [/PETCO/i, "b733b2dd-208d-4b81-a541-4a6b9d060faf"],
  [/LW GENERAL STORE BADGE/i, "a5daa10e-c0f0-40ba-8b83-5a817963421a"],
  [/SQ \*VAPE GIFT/i, "52d0e913-6413-472e-8a5a-0aadb2a43c5d"],
  [/Nature.{0,2}s Releaf/i, "f06240f2-c46e-45c2-b9d0-7161fb33d4e4"],
  [/Google\s*\*?\s*Pixel Flow/i, "deba8862-aa51-4481-a8fb-5cbfd246423e"],
  [/Google\s*\*?\s*Watcher of Rea/i, "b7424878-1ad5-4eb2-8f8f-dbc276a40a0d"],
  [/Google\s*\*?\s*Finch/i, "1fc5cbdc-d676-4456-bfe8-0afb348c9fc6"],
  [/GOOGLE\s*\*?\s*DAWG Self Disc/i, "9ee04161-b1ce-4146-aaad-6f744df76310"],
  [/Google\s*\*?\s*Snapchat/i, "8688a388-f413-4ad2-8559-6f2db62f60e5"],
  [/GOOGLE\s*\*?\s*GigU/i, "2951b5c8-5fd5-48d3-a62d-275a4e779df8"],
  [/SP THESHEETCODE\.COM/i, "2f4cecec-e803-46b8-8e76-0806064a27dc"],
  [/LOVABLE/i, "13745bd0-20c1-4862-adf7-b25f32cb07c7"],
];
function tagInstitution(label) {
  for (const [re, inst] of MERCHANT_INSTITUTIONS) if (re.test(label || "")) return inst;
  return null;
}
const TAGGABLE_TYPES = new Set(["Venmo Card Transaction", "Merchant Transaction"]);

/** Minimal RFC4180 CSV line parser — handles quoted fields with embedded
 * commas/newlines, which this Venmo export's Disclaimer/Terminal Location
 * fields have. */
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
  const negative = cleaned.startsWith("-");
  const n = Number(cleaned.replace("-", ""));
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

function loadCsvFile(path) {
  const text = readFileSync(path, "utf-8");
  const rows = parseCsv(text);
  const headerIdx = rows.findIndex((r) => r.includes("ID") && r.includes("Datetime"));
  if (headerIdx === -1) throw new Error(`${path}: could not find header row`);
  const header = rows[headerIdx];
  const col = (name) => header.indexOf(name);
  const idCol = col("ID");
  const dtCol = col("Datetime");
  const typeCol = col("Type");
  const statusCol = col("Status");
  const noteCol = col("Note");
  const fromCol = col("From");
  const toCol = col("To");
  const totalCol = col("Amount (total)");
  const feeCol = col("Amount (fee)");
  const fundingCol = col("Funding Source");
  const destCol = col("Destination");

  const out = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const id = r[idCol];
    if (!id || !id.trim()) continue;
    const total = parseMoney(r[totalCol]);
    if (total === null) continue;
    const fee = parseMoney(r[feeCol]) ?? 0;
    const type = r[typeCol];
    const note = r[noteCol] || null;
    const to = r[toCol] || null;
    const destination = r[destCol] || null;
    out.push({
      file: path.split("/").pop(),
      id,
      datetime: r[dtCol],
      localDate: toLocalDate(r[dtCol]),
      type,
      status: r[statusCol],
      note,
      from: r[fromCol] || null,
      to,
      total,
      fee,
      core: Math.round((total - fee) * 100) / 100,
      fundingSource: r[fundingCol] || null,
      destination,
      institution: TAGGABLE_TYPES.has(type) ? tagInstitution(note || to || destination) : null,
    });
  }
  return out;
}

function loadCsvRows() {
  const files = readdirSync(PLANNING_DIR).filter((f) => f.endsWith(".csv"));
  let rows = [];
  for (const f of files) rows = rows.concat(loadCsvFile(join(PLANNING_DIR, f)));
  rows.sort((a, b) => a.datetime.localeCompare(b.datetime));
  return rows;
}

function loadAppRows() {
  const snapshotPath = join(PLANNING_DIR, "app-venmo-transactions.json");
  const rows = JSON.parse(readFileSync(snapshotPath, "utf-8"));
  return rows.map((r) => ({ ...r, amount: Number(r.amount), used: false }));
}

const dayMs = 86400000;
function dateDist(a, b) {
  return Math.abs(Math.round((new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime()) / dayMs));
}

/** Candidates within the window, closest-date-first (ties broken by
 * created_at, oldest first) — see module docblock for why this ordering
 * matters. When `institution` is set, only same-institution app rows
 * qualify at all. */
function candidatesFor(appRows, localDate, institution) {
  return appRows
    .filter((r) => {
      if (r.used || dateDist(r.transaction_date, localDate) > WINDOW_DAYS) return false;
      if (institution) return r.institution_id === institution;
      return true;
    })
    .sort((a, b) => dateDist(a.transaction_date, localDate) - dateDist(b.transaction_date, localDate) || a.created_at.localeCompare(b.created_at));
}

/** Find a subset (size 1..3) of candidates summing to `target` (within half a cent). */
function findSubsetSum(candidates, target) {
  const n = candidates.length;
  for (let size = 1; size <= 3 && size <= n; size++) {
    // small n expected per day, brute force is fine
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
  const candidates = candidatesFor(appRows, csvRow.localDate, csvRow.institution);
  let match = findSubsetSum(candidates, csvRow.total);
  if (match) {
    for (const r of match) r.used = true;
    return { classification: "matched", match };
  }
  if (Math.abs(csvRow.fee) >= 0.005) {
    match = findSubsetSum(candidates, csvRow.core);
    if (match) {
      for (const r of match) r.used = true;
      return { classification: "matched-no-fee", match };
    }
  }
  return { classification: "missing", match: null };
}

function fmt(n) {
  return (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
}

function main() {
  const csvRows = loadCsvRows();
  const appRows = loadAppRows();

  const groups = new Map(); // key: `${type}::${classification}` -> rows[]
  const missingRows = [];
  for (const row of csvRows) {
    const { classification, match } = classify(row, appRows);
    const key = `${row.type}::${classification}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ row, match });
    if (classification === "missing") missingRows.push(row);
  }

  if (process.argv.includes("--json-missing")) {
    console.log(JSON.stringify(missingRows, null, 2));
    return;
  }

  const unexplained = appRows.filter((r) => !r.used);

  console.log(`\nParsed ${csvRows.length} CSV rows, ${appRows.length} app rows. Window: ±${WINDOW_DAYS} days.\n`);
  console.log("=".repeat(70));

  const order = ["missing", "matched-no-fee", "matched"];
  const byClass = new Map();
  for (const [key, items] of groups) {
    const [type, classification] = key.split("::");
    if (!byClass.has(classification)) byClass.set(classification, []);
    byClass.get(classification).push({ type, items });
  }

  for (const classification of order) {
    const typeGroups = byClass.get(classification) || [];
    if (!typeGroups.length) continue;
    console.log(`\n### ${classification.toUpperCase()} ###`);
    for (const { type, items } of typeGroups.sort((a, b) => b.items.length - a.items.length)) {
      const total = items.reduce((s, { row }) => s + row.total, 0);
      const amounts = items.map(({ row }) => row.total);
      console.log(
        `\n  ${type}: ${items.length} row(s), range ${fmt(Math.min(...amounts))} to ${fmt(Math.max(...amounts))}, total ${fmt(total)}`,
      );
      for (const { row, match } of items) {
        const label = row.note || `${row.from || ""}${row.from && row.to ? " -> " : ""}${row.to || ""}` || row.destination || "";
        console.log(
          `    ${row.localDate}  ${fmt(row.total)}${row.fee ? ` (fee ${fmt(row.fee)})` : ""}  ${label}${
            match ? `  [app: ${match.map((m) => m.id).join(",")}]` : ""
          }`,
        );
      }
    }
  }

  if (unexplained.length) {
    console.log(`\n### UNEXPLAINED-IN-APP (no CSV row matched) ###`);
    for (const r of unexplained) {
      console.log(`    ${r.transaction_date}  ${fmt(Number(r.amount))}  ${r.description || ""}  [id ${r.id}]`);
    }
  }

  console.log("\n" + "=".repeat(70));
}

main();
