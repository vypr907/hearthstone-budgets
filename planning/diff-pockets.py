#!/usr/bin/env python3
import json
from pathlib import Path
from collections import defaultdict

base = Path(__file__).parent
parsed = json.loads((base / "one-statement-parsed.json").read_text())
app = json.loads((base / "app-pockets-jul-aug.json").read_text())

NAME_MAP = {
    "Steven's Savings": "Savings",
}

def stmt_txns(pocket_app_name, month_key):
    stmt_name = NAME_MAP.get(pocket_app_name, pocket_app_name)
    for acct in parsed[month_key]:
        if acct["name"].rstrip("*") == stmt_name:
            return acct["transactions"]
    return []

def greedy_match(app_list, stmt_list, tol_days=3):
    # match by exact amount, nearest date within tol_days
    from datetime import date
    def to_date(s):
        y,m,d = map(int, s.split("-"))
        return date(y,m,d)
    unmatched_app = list(app_list)
    unmatched_stmt = list(stmt_list)
    matched = []
    for a in list(unmatched_app):
        best = None
        best_dist = None
        for s in unmatched_stmt:
            if abs(a["amount"] - s["amount"]) < 0.005:
                dist = abs((to_date(a["date"]) - to_date(s["date"])).days)
                if dist <= tol_days and (best is None or dist < best_dist):
                    best = s
                    best_dist = dist
        if best:
            matched.append((a, best))
            unmatched_app.remove(a)
            unmatched_stmt.remove(best)
    return matched, unmatched_app, unmatched_stmt

for pocket in ["Emergency","Food","Games","kitten's playroom","Pay Autosave","Steven's Savings"]:
    print(f"\n{'='*70}\n{pocket}\n{'='*70}")
    for month_key, mm in [("07","Jul"), ("08","Aug")]:
        a_list = [t for t in app[pocket] if t["date"].startswith(f"2026-{month_key}")]
        s_list = stmt_txns(pocket, month_key)
        matched, un_app, un_stmt = greedy_match(a_list, s_list)
        a_net = round(sum(t["amount"] for t in a_list),2)
        s_net = round(sum(t["amount"] for t in s_list),2)
        print(f"\n-- {mm}: app_net={a_net} stmt_net={s_net} (app_txns={len(a_list)} stmt_txns={len(s_list)}, matched={len(matched)})")
        if un_app:
            print(f"  APP UNMATCHED ({len(un_app)}):")
            for t in un_app:
                print(f"    {t['date']}  {t['amount']:>10.2f}  {t.get('description') or ''}  [{t['id'][:8]}]")
        if un_stmt:
            print(f"  STATEMENT UNMATCHED ({len(un_stmt)}):")
            for t in un_stmt:
                print(f"    {t['date']}  {t['amount']:>10.2f}  {t['description']}  ({t['type']})")
