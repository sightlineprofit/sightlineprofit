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
    "20260725120000_capacity_basis_retainer_fields.sql",
    "20260725130000_drop_capacity_basis.sql",
]

expected_present = {
    ("firm_members", "productive_hrs_per_week"),
    ("projects", "monthly_retainer_fee"),
    ("projects", "retainer_start_date"),
}

expected_absent = {
    ("firm_config", "capacity_basis"),
}

with psycopg.connect(**PG, sslmode="require", connect_timeout=30) as conn:
    with conn.cursor() as cur:
        for filename in MIGRATIONS:
            version = filename.split("_", 1)[0]
            sql = Path(f"supabase/migrations/{filename}").read_text()
            cur.execute(sql)
            print(f"Applied {filename}")
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
            select table_name, column_name from information_schema.columns
            where table_schema='public'
              and (
                (table_name='firm_members' and column_name='productive_hrs_per_week')
                or (table_name='firm_config' and column_name='capacity_basis')
                or (table_name='projects' and column_name in ('monthly_retainer_fee', 'retainer_start_date'))
              )
            """
        )
        pairs = {tuple(r) for r in cur.fetchall()}
    conn.commit()

print("Columns present:", sorted(pairs))
missing = expected_present - pairs
if missing:
    print("Missing required columns:", missing, file=sys.stderr)
    sys.exit(1)

if expected_absent & pairs:
    print("Columns that should be removed still present:", expected_absent & pairs, file=sys.stderr)
    sys.exit(1)

print("Waiting for PostgREST schema cache reload…")
for i in range(15):
    time.sleep(2)
    print(f"  …{(i + 1) * 2}s")

print("Done. Firm capacity uses owner + team productive hours automatically.")
