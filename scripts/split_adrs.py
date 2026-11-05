#!/usr/bin/env python3
"""Split docs/DECISIONS.md into one file per ADR under docs/adr/, and
rewrite docs/DECISIONS.md as a flat ID | Title | Status | Date index.

One-time migration script, kept for reference/re-derivation. Re-running
against an already-split DECISIONS.md (now just a table, no "## ADR-"
headings) fails loudly with a parse error rather than corrupting anything.

Usage:
    python3 scripts/split_adrs.py            # dry run (default)
    python3 scripts/split_adrs.py --write    # write files for real
"""
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DECISIONS = REPO / "docs" / "DECISIONS.md"
ADR_DIR = REPO / "docs" / "adr"

HEADING_RE = re.compile(r"^## ADR-(\d{3}): (.+)$")
STATUS_RE = re.compile(r"^Status:\s*(.+)$")
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
SUPERSEDES_RE = re.compile(r"^Supersedes:\s*ADR-(\d{3})\.?\s*$")


def kebab(title: str) -> str:
    title = unicodedata.normalize("NFKD", title)
    title = title.encode("ascii", "ignore").decode("ascii")
    title = re.sub(r"[^a-zA-Z0-9]+", "-", title).strip("-").lower()
    return re.sub(r"-+", "-", title)


def parse_blocks(lines):
    """Return list of dicts: {id, title, lines} in file order, merging
    '(continued' headings into the previous block with the same id."""
    blocks = []
    current = None
    for line in lines:
        m = HEADING_RE.match(line)
        if m:
            adr_id, title = m.group(1), m.group(2)
            if "(continued" in title.lower() and current and current["id"] == adr_id:
                current["lines"].append(line)
                continue
            if current:
                blocks.append(current)
            current = {"id": adr_id, "title": title, "lines": [line]}
        else:
            if current is None:
                raise ValueError(f"Content before first ADR heading: {line!r}")
            current["lines"].append(line)
    if current:
        blocks.append(current)
    return blocks


def extract_status_date(block_lines):
    status_text = None
    supersedes = None
    for line in block_lines:
        if status_text is None:
            m = STATUS_RE.match(line)
            if m:
                status_text = m.group(1).strip()
        sm = SUPERSEDES_RE.match(line.strip())
        if sm:
            supersedes = sm.group(1)
    date_match = DATE_RE.search(status_text) if status_text else None
    date = date_match.group(0) if date_match else "Unknown"
    status = status_text if status_text else "Unknown"
    return status, date, supersedes


def main():
    write = "--write" in sys.argv

    source_text = DECISIONS.read_text()
    source_label = str(DECISIONS.relative_to(REPO))

    lines = source_text.splitlines(keepends=True)
    blocks = parse_blocks(lines)

    ids = [b["id"] for b in blocks]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise ValueError(f"Duplicate ADR ids after merge: {sorted(dupes)}")

    print(f"Source: {source_label}")
    print(f"Parsed {len(blocks)} ADR blocks (lines: {len(lines)})")

    file_rows = []
    supersedes_map = {}  # superseded_id -> superseding_id
    for b in blocks:
        status, date, supersedes = extract_status_date(b["lines"])
        slug = kebab(b["title"])
        fname = f"ADR-{b['id']}-{slug}.md"
        file_rows.append(
            {
                "id": b["id"],
                "title": b["title"],
                "status": status,
                "date": date,
                "filename": fname,
                "content": "".join(b["lines"]),
            }
        )
        if supersedes:
            supersedes_map[supersedes] = b["id"]

    if not write:
        print("\n--- DRY RUN: no files written ---")
        print(f"Would write {len(file_rows)} files to {ADR_DIR.relative_to(REPO)}/")
        for r in file_rows[:5]:
            print(f"  ADR-{r['id']}: {r['filename']}  status={r['status']!r} date={r['date']}")
        print("  ...")
        for r in file_rows[-3:]:
            print(f"  ADR-{r['id']}: {r['filename']}  status={r['status']!r} date={r['date']}")
        if supersedes_map:
            print("\nSupersedes relationships found:")
            for superseded, superseder in supersedes_map.items():
                print(f"  ADR-{superseded} superseded by ADR-{superseder}")
        print(f"\nWould rewrite {DECISIONS.relative_to(REPO)} as a flat index.")
        print("\nRe-run with --write to execute.")
        return

    ADR_DIR.mkdir(parents=True, exist_ok=True)
    for r in file_rows:
        (ADR_DIR / r["filename"]).write_text(r["content"])

    index_lines = [
        "# Architecture Decision Records — Index\n",
        "\n",
        "Full history of every ADR for this project. Each row links to its own\n",
        "file under `docs/adr/`. Read this index first; open only the specific\n",
        "ADR files you need — do not glob `docs/adr/`.\n",
        "\n",
        "| ID | Title | Status | Date |\n",
        "|---|---|---|---|\n",
    ]
    for r in file_rows:
        status_cell = r["status"]
        if r["id"] in supersedes_map:
            status_cell += f" — superseded by ADR-{supersedes_map[r['id']]}"
        link = f"adr/{r['filename']}"  # relative to docs/DECISIONS.md itself
        index_lines.append(
            f"| [ADR-{r['id']}]({link}) | {r['title']} | {status_cell} | {r['date']} |\n"
        )

    DECISIONS.write_text("".join(index_lines))

    print(f"Wrote {len(file_rows)} files to {ADR_DIR.relative_to(REPO)}/")
    print(f"Rewrote {DECISIONS.relative_to(REPO)} as index ({len(index_lines)} lines)")


if __name__ == "__main__":
    main()
