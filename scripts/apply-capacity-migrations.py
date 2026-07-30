import os
import sys
import time
from pathlib import Path

import psycopg

PG = dict(
    host=os.environ["PGHOST"],
    port=os.environ["PGPORT"],
    dbname=os.environ["PGDATABASE"],
    user=os.environ["PGUSER"],
    password=os.environ["PGPASSWORD"],
)

MIGRATIONS = [
    ("20260721180000", "supabase/migrations/20260721180000_capacity_planner_phase_a.sql"),
    ("20260722120000", "supabase/migrations/20260722120000_schedule_blocks.sql"),
    ("20260722150000", "supabase/migrations/20260722150000_commitment_scheduling_only.sql"),
    ("20260722160000", "supabase/migrations/20260722160000_member_capacity_blocks.sql"),
]


def column_exists(cur, table: str, column: str) -> bool:
    cur.execute(
        """
        select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = %s and column_name = %s
        """,
        (table, column),
    )
    return cur.fetchone()[0] > 0


def table_exists(cur, table: str) -> bool:
    cur.execute(
        """
        select count(*) from information_schema.tables
        where table_schema = 'public' and table_name = %s
        """,
        (table,),
    )
    return cur.fetchone()[0] > 0


with psycopg.connect(**PG, sslmode="require", connect_timeout=30) as conn:
    with conn.cursor() as cur:
        for version, rel_path in MIGRATIONS:
            path = Path(rel_path)
            if not path.exists():
                print(f"Missing migration file: {path}", file=sys.stderr)
                sys.exit(1)

            if version == "20260721180000":
                already = table_exists(cur, "firm_life_events")
            else:
                already = column_exists(cur, "firm_config", "capacity_blocks_onboarded")

            if already:
                print(f"{version} — already applied, skipping SQL")
            else:
                print(f"{version} — applying {path.name}")
                cur.execute(path.read_text())

            cur.execute(
                """
                insert into supabase_migrations.schema_migrations (version)
                values (%s)
                on conflict do nothing
                """,
                (version,),
            )

        cur.execute("select pg_notify('pgrst', 'reload schema')")

        cur.execute(
            """
            select column_name
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'firm_config'
              and column_name = 'capacity_blocks_onboarded'
            """
        )
        onboarded_col = cur.fetchone()

        cur.execute(
            """
            select table_name from information_schema.tables
            where table_schema = 'public' and table_name in ('firm_life_events', 'schedule_exceptions')
            order by 1
            """
        )
        tables = [r[0] for r in cur.fetchall()]

    conn.commit()

print("capacity_blocks_onboarded column:", "present" if onboarded_col else "MISSING")
print("tables:", tables)

if not onboarded_col:
    sys.exit("capacity_blocks_onboarded column still missing after migration")

print("Waiting for PostgREST schema cache reload…")
for i in range(15):
    time.sleep(2)
    print(f"  …{(i + 1) * 2}s")

print("Done. Refresh /capacity and retry.")
