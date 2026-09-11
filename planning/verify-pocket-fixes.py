#!/usr/bin/env python3
import json
from pathlib import Path

base = Path(__file__).parent
parsed = json.loads((base / "one-statement-parsed.json").read_text())
app = json.loads((base / "app-pockets-jul-aug.json").read_text())

NAME_MAP = {"Steven's Savings": "Savings"}

def stmt_net(name, month_key):
    name = NAME_MAP.get(name, name)
    for acct in parsed[month_key]:
        if acct["name"].rstrip("*") == name:
            return round(sum(t["amount"] for t in acct["transactions"]), 2)
    return None

# simulate fixes
fixes = {
    ("Emergency","07"): 0,  # date-only fix, no net change
    ("Emergency","08"): -1205+1205+100-100+0.28,
    ("Food","07"): -80.00,
    ("Games","07"): -25-5-20-20,
    ("kitten's playroom","07"): -5+100-100+10-10+100-100-25,
    ("kitten's playroom","08"): -30.00,
    ("Pay Autosave","08"): (5-30) + 50 + 0.08,  # amount correction (-25) + remove dup -50 (+50) + interest
    ("Steven's Savings","07"): -100-100,
    ("Steven's Savings","08"): 50,  # remove dup -50
}

for pocket in ["Emergency","Food","Games","kitten's playroom","Pay Autosave","Steven's Savings"]:
    for mk, mm in [("07","Jul"),("08","Aug")]:
        base_net = round(sum(t["amount"] for t in app[pocket] if t["date"].startswith(f"2026-{mk}")), 2)
        fix = fixes.get((pocket, mk), 0)
        new_net = round(base_net + fix, 2)
        s_net = stmt_net(pocket, mk)
        ok = "OK" if s_net is not None and abs(new_net - s_net) < 0.005 else "MISMATCH"
        print(f"{pocket:<20} {mm}: base={base_net:<10} fix={fix:<10.2f} new={new_net:<10} stmt={s_net:<10} {ok}")
