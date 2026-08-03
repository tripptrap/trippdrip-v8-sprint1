#!/usr/bin/env python3
"""
Check that every column CLAUDE.md documents actually exists (#112).

CLAUDE.md is the first file every session reads, and its own instructions warn
that a column the code assumes may not exist — `user_telnyx_numbers.capabilities`
shipped a real bug exactly that way. A doc asserting a column that is not there
is a trap for whoever trusts it instead of checking.

When this was first run it found SIX wrong entries, in three tables, against an
issue that had named two:

    threads.ai_enabled        -> the column is ai_disabled, OPPOSITE polarity
    threads.contact_type      -> computed per request, never stored
    threads.last_message_at   -> use updated_at
    campaigns.lead_count      -> the column is total_leads
    campaigns.tags_applied    -> the column is tags
    leads.last_contacted      -> the column is last_interaction_at

All six were documentation-only — the code computes the value or falls back — so
nothing was visibly broken, which is exactly why they survived.

Run after any schema change:

    python3 scripts/verify-claude-md-columns.py

Exits non-zero when a documented column does not exist, so it can go in CI.
"""

import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLAUDE_MD = ROOT / "CLAUDE.md"

# "#### `table`" introduces a block; "- `column`" (optionally bolded) is a claim.
TABLE_RE = re.compile(r"^#### `(\w+)`\n(.*?)(?=^####|\Z)", re.S | re.M)
COLUMN_RE = re.compile(r"^- \*{0,2}`(\w+)`", re.M)


def documented_columns() -> dict[str, list[str]]:
    doc = CLAUDE_MD.read_text()
    out = {}
    for table, body in TABLE_RE.findall(doc):
        cols = sorted(set(COLUMN_RE.findall(body)))
        if cols:
            out[table] = cols
    return out


def live_columns(tables: list[str]) -> dict[str, set[str]]:
    quoted = ",".join(f"'{t}'" for t in tables)
    sql = (
        "SELECT table_name, column_name FROM information_schema.columns "
        # Always filter the schema. Omitting it also matches auth.* and has
        # already produced a wrong column list in this repo.
        f"WHERE table_schema='public' AND table_name IN ({quoted});"
    )
    proc = subprocess.run(
        ["supabase", "db", "query", "--linked", sql],
        capture_output=True, text=True, cwd=ROOT,
    )
    match = re.search(r"\{.*\}", proc.stdout, re.S)
    if not match:
        print("Could not read the live schema:\n" + (proc.stderr or proc.stdout)[:400])
        sys.exit(2)

    real: dict[str, set[str]] = defaultdict(set)
    for row in json.loads(match.group())["rows"]:
        real[row["table_name"]].add(row["column_name"])
    return real


def main() -> int:
    claims = documented_columns()
    if not claims:
        print("No '#### `table`' blocks found in CLAUDE.md — has the format changed?")
        return 2

    real = live_columns(list(claims))
    problems = 0

    for table, cols in sorted(claims.items()):
        if table not in real:
            print(f"  {table}: TABLE DOES NOT EXIST")
            problems += 1
            continue
        missing = [c for c in cols if c not in real[table]]
        if missing:
            problems += len(missing)
            print(f"  {table}: documented but absent -> {', '.join(missing)}")

    total = sum(len(c) for c in claims.values())
    if problems:
        print(f"\n{problems} of {total} documented columns do not exist.")
        return 1

    print(f"All {total} documented columns exist, across {len(claims)} tables.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
