#!/usr/bin/env node
/**
 * One-off reconciliation tool: compares Venmo's own monthly statement CSVs
 * (planning/*.csv, gitignored — real financial data) against the app's
 * already-logged transactions on the "Venmo - Steven" account (a snapshot
 * pulled via the read-only Supabase MCP into planning/app-venmo-transactions.json).
 *
 * Read-only: parses local files, prints a report, writes nothing, touches no
 * network/DB. Not part of the app — disposable once this reconciliation pass
 * is done.
 *
 * Usage: node scripts/reconcile-venmo-csv.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PLANNING_DIR = join(ROOT, "planning");

/** Alaska is UTC-8 (AKST) / UTC-9 in some conventions people approximate;
 * we only need "same local calendar day" resolution, so a fixed 8h offset
 * (AKDT, in effect Jul-Sep) is precise enough — this is a reconciliation
 * heuristic with a ±1 day tolerance anyway, not a billing-accurate TZ convert. */
const AK_OFFSET_HOURS = 8;

function toLocalDate(utcIso) {
  const d = new Date(utcIso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(utcIso) ? utcIso : utcIso + "Z");
  const local = new Date(d.getTime() - AK_OFFSET_HOURS * 3600 * 1000);
  return local.toISOString().slice(0, 10);
}

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
    out.push({
      file: path.split("/").pop(),
      id,
      datetime: r[dtCol],
      localDate: toLocalDate(r[dtCol]),
      type: r[typeCol],
      status: r[statusCol],
      note: r[noteCol] || null,
      from: r[fromCol] || null,
      to: r[toCol] || null,
      total,
      fee,
      core: Math.round((total - fee) * 100) / 100,
      fundingSource: r[fundingCol] || null,
      destination: r[destCol] || null,
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

/** ±1 day window of app rows for a given local date. */
function candidatesFor(appRows, localDate) {
  const d = new Date(localDate + "T00:00:00Z");
  const dates = [-1, 0, 1].map((delta) => {
    const dd = new Date(d.getTime() + delta * 86400000);
    return dd.toISOString().slice(0, 10);
  });
  return appRows.filter((r) => !r.used && dates.includes(r.transaction_date));
}

/** Find a subset (size 1..3) of candidates summing to `target` (within 1 cent). */
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
  const candidates = candidatesFor(appRows, csvRow.localDate);
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

  console.log(`\nParsed ${csvRows.length} CSV rows, ${appRows.length} app rows.\n`);
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
