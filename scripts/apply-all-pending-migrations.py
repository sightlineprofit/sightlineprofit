#!/usr/bin/env python3
"""Apply every supabase/migrations/*.sql not yet in schema_migrations (sorted by filename)."""
import os
import sys
import time
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[1]
MIG_DIR = ROOT / "supabase/migrations"

for key in ("PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"):
    if not os.environ.get(key):
        print(f"Missing {key}. Use .env.local or export pooler credentials.", file=sys.stderr)
        sys.exit(1)

PG = dict(
    host=os.environ["PGHOST"],
    port=os.environ["PGPORT"],
    dbname=os.environ["PGDATABASE"],
    user=os.environ["PGUSER"],
    password=os.environ["PGPASSWORD"],
)


def version_from_filename(name: str) -> str:
    return name.split("_", 1)[0]


def migration_already_applied(err: Exception) -> bool:
    msg = str(err).lower()
    return (
        "already exists" in msg
        or "duplicate key" in msg
        or "duplicate object" in msg
    )


def main() -> None:
    files = sorted(MIG_DIR.glob("*.sql"), key=lambda p: p.name)
    applied_count = 0
    skipped_count = 0
    recorded_existing = 0

    with psycopg.connect(**PG, sslmode="require", connect_timeout=60) as conn:
        with conn.cursor() as cur:
            cur.execute("select version from supabase_migrations.schema_migrations")
            applied = {r[0] for r in cur.fetchall()}

    for path in files:
        ver = version_from_filename(path.name)
        if ver in applied:
            skipped_count += 1
            continue

        sql = path.read_text()
        print(f"Applying {path.name} …")
        try:
            with psycopg.connect(**PG, sslmode="require", connect_timeout=60) as conn:
                with conn.cursor() as cur:
                    cur.execute(sql)
                    cur.execute(
                        """
                        insert into supabase_migrations.schema_migrations (version)
                        values (%s)
                        on conflict do nothing
                        """,
                        (ver,),
                    )
                    cur.execute("select pg_notify('pgrst', 'reload schema')")
                conn.commit()
            applied.add(ver)
            applied_count += 1
            print(f"  ✓ {path.name}")
        except Exception as e:
            if migration_already_applied(e):
                with psycopg.connect(**PG, sslmode="require", connect_timeout=60) as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            insert into supabase_migrations.schema_migrations (version)
                            values (%s)
                            on conflict do nothing
                            """,
                            (ver,),
                        )
                        cur.execute("select pg_notify('pgrst', 'reload schema')")
                    conn.commit()
                applied.add(ver)
                recorded_existing += 1
                print(f"  ~ {path.name} (schema already present; recorded version)")
            else:
                print(f"FAILED on {path.name}: {e}", file=sys.stderr)
                sys.exit(1)

    print(
        f"\nApplied {applied_count} migration(s), "
        f"recorded {recorded_existing} already-present, "
        f"skipped {skipped_count} previously recorded."
    )
    print("Waiting for PostgREST schema cache reload…")
    for i in range(10):
        time.sleep(2)
        print(f"  …{(i + 1) * 2}s")
    print("Done.")


if __name__ == "__main__":
    main()
