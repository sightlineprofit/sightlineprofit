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
    "20260721120000_owner_pay_payment_tracking.sql",
    "20260722180000_project_retainer_pricing.sql",
    "20260725120000_capacity_basis_retainer_fields.sql",
    "20260725130000_drop_capacity_basis.sql",
    "20260725140000_project_client_contact.sql",
    "20260726120000_firm_config_pricing_retainer.sql",
    "20260726130000_target_utilization_pct.sql",
    "20260723140000_distribution_tax_reserve.sql",
]

expected_columns = {
    ("projects", "payment_collected"),
    ("projects", "retainer_duration_months"),
    ("projects", "monthly_retainer_fee"),
    ("projects", "client_email"),
}

with psycopg.connect(**PG, sslmode="require", connect_timeout=30) as conn:
    with conn.cursor() as cur:
        for filename in MIGRATIONS:
            version = filename.split("_", 1)[0]
            cur.execute(
                "select 1 from supabase_migrations.schema_migrations where version = %s",
                (version,),
            )
            if cur.fetchone():
                print(f"Skip {filename} (already applied)")
                continue
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
              and table_name='projects'
              and column_name in (
                'payment_collected',
                'retainer_duration_months',
                'monthly_retainer_fee',
                'client_email'
              )
            """
        )
        pairs = {tuple(r) for r in cur.fetchall()}
    conn.commit()

print("projects columns present:", sorted(pairs))
missing = expected_columns - pairs
if missing:
    print("Missing columns:", missing, file=sys.stderr)
    sys.exit(1)

print("Waiting for PostgREST schema cache reload…")
for i in range(15):
    time.sleep(2)
    print(f"  …{(i + 1) * 2}s")

print("Done. Project create + retainer + client contact columns are ready.")
