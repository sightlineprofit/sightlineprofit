#!/usr/bin/env python3
"""Verify launch-critical columns exist before/after deploy."""
import os
import sys

import psycopg

REQUIRED = [
    ("time_entries", "firm_member_id"),
    ("time_entries", "project_step_id"),
    ("project_phases", "project_workflow_attachment_id"),
    ("project_workflow_attachments", "period_label"),
]


def main() -> None:
    for key in ("PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"):
        if not os.environ.get(key):
            print(f"Missing {key}. Source .env.local first.", file=sys.stderr)
            sys.exit(1)

    missing: list[str] = []
    with psycopg.connect(
        host=os.environ["PGHOST"],
        port=os.environ["PGPORT"],
        dbname=os.environ["PGDATABASE"],
        user=os.environ["PGUSER"],
        password=os.environ["PGPASSWORD"],
    ) as conn:
        with conn.cursor() as cur:
            for table, column in REQUIRED:
                cur.execute(
                    """
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = %s AND column_name = %s
                    """,
                    (table, column),
                )
                if cur.fetchone() is None:
                    missing.append(f"{table}.{column}")

    if missing:
        print("Schema verification failed. Missing columns:", file=sys.stderr)
        for m in missing:
            print(f"  - {m}", file=sys.stderr)
        print("\nRun: npm run db:apply-all-pending", file=sys.stderr)
        sys.exit(1)

    print("Release schema verification passed.")


if __name__ == "__main__":
    main()
