#!/usr/bin/env python3
"""
Throwaway parser (planning/ is gitignored). Parses the pdftotext -layout
output of the OnePay statement PDFs into structured per-account transaction
history + activity-summary totals, for all accounts (Checking, Savings, and
every Pocket), not just Checking.

Usage: python3 parse-one-statement.py 2026-07.txt 2026-08.txt
Writes one-statement-parsed.json next to this script.
"""
import json
import re
import sys
from pathlib import Path

MONTHS = {"Jan":1,"Feb":2,"Mar":3,"Apr":4,"May":5,"Jun":6,"Jul":7,"Aug":8,"Sep":9,"Oct":10,"Nov":11,"Dec":12}
DATE_RE = re.compile(r"^([A-Z][a-z]{2}) (\d{1,2})$")
AMT_RE = re.compile(r"^[+-]?\$[\d,]+\.\d{2}$")
ACCTNUM_RE = re.compile(r"^x\d{3,4}$")
PAGE_RE = re.compile(r"Page \d+ of \d+")


def split_cols(line):
    return [c.strip() for c in re.split(r"\s{2,}", line.strip()) if c.strip()]


def parse_amount(s):
    neg = s.startswith("-")
    s = s.lstrip("+-").lstrip("$").replace(",", "")
    v = float(s)
    return -v if neg else v


def parse_file(path, year):
    lines = Path(path).read_text().splitlines()
    accounts = {}  # (name, acctnum) -> {"month_balances":[...], "transactions":[...]}
    order = []
    cur_key = None
    in_history = False
    pending_header_name = None

    i = 0
    n = len(lines)
    while i < n:
        raw = lines[i]
        line = raw.strip()
        if not line or PAGE_RE.search(line) or line.startswith("One Finance") or line.startswith("Banking services"):
            i += 1
            continue

        cols = split_cols(raw)

        # Account/pocket header: "<Name>   x1234" (name may be multi-word)
        if len(cols) == 2 and ACCTNUM_RE.match(cols[1]) and not DATE_RE.match(cols[0]):
            name, acctnum = cols[0], cols[1]
            key = (name, acctnum)
            if key not in accounts:
                accounts[key] = {"name": name, "acctnum": acctnum, "beginning": None, "ending": None, "transactions": []}
                order.append(key)
            cur_key = key
            in_history = False
            i += 1
            continue

        if line == "Activity Summary":
            i += 1
            continue

        if line.startswith("Beginning Balance on"):
            # "Beginning Balance on Aug 1, 2026    $0.00   Total OnePay ... -$217.75"
            m = re.search(r"\$[\d,]+\.\d{2}", raw)
            if m and cur_key:
                accounts[cur_key]["beginning"] = parse_amount(m.group(0))
            i += 1
            continue

        if line.startswith("Ending Balance on"):
            m = re.search(r"\$[\d,]+\.\d{2}", raw)
            if m and cur_key:
                accounts[cur_key]["ending"] = parse_amount(m.group(0))
            i += 1
            continue

        if line == "Transaction History":
            in_history = True
            i += 1
            continue

        if line.startswith("Date") and "Description" in line:
            i += 1
            continue

        if line.startswith("TOTAL"):
            m = re.search(r"[+-]?\$[\d,]+\.\d{2}", raw)
            if m and cur_key:
                accounts[cur_key].setdefault("stated_total", parse_amount(m.group(0)))
            in_history = False
            i += 1
            continue

        # Transaction row: Mon D  Description...  Type  Amount
        if cur_key and cols and DATE_RE.match(cols[0]):
            mm, dd = DATE_RE.match(cols[0]).groups()
            if len(cols) >= 3 and AMT_RE.match(cols[-1]):
                amount = parse_amount(cols[-1])
                txn_type = cols[-2]
                desc = " ".join(cols[1:-2])
                accounts[cur_key]["transactions"].append({
                    "date": f"{year}-{MONTHS[mm]:02d}-{int(dd):02d}",
                    "description": desc,
                    "type": txn_type,
                    "amount": amount,
                })
            i += 1
            continue

        i += 1

    return [accounts[k] for k in order]


def main():
    out = {}
    for path, year in [(sys.argv[1], 2026), (sys.argv[2], 2026)]:
        label = "07" if "07" in Path(path).stem else "08"
        out[label] = parse_file(path, year)

    outpath = Path(__file__).parent / "one-statement-parsed.json"
    outpath.write_text(json.dumps(out, indent=2))

    for label, accts in out.items():
        print(f"\n=== {label} ===")
        for a in accts:
            net = round(sum(t["amount"] for t in a["transactions"]), 2)
            stated = a.get("stated_total")
            bal_check = None
            if a["beginning"] is not None and a["ending"] is not None:
                bal_check = round(a["ending"] - a["beginning"], 2)
            ok = "OK" if stated is not None and abs(net - stated) < 0.005 else ("no-total" if stated is None else "MISMATCH")
            print(f"  {a['name']:<22} {a['acctnum']:<7} txns={len(a['transactions']):<4} net={net:<10} stated={stated} {ok}")


if __name__ == "__main__":
    main()
