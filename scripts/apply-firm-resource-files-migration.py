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
    "20260723120000_firm_resource_files.sql",
    "20260723123000_firm_resource_file_size_50mb.sql",
]

with psycopg.connect(**PG, sslmode="require", connect_timeout=30) as conn:
    with conn.cursor() as cur:
        for filename in MIGRATIONS:
            version = filename.split("_")[0]
            sql = Path(f"supabase/migrations/{filename}").read_text()
            cur.execute(sql)
            cur.execute(
                """
                insert into supabase_migrations.schema_migrations (version)
                values (%s)
                on conflict do nothing
                """,
                (version,),
            )
            print(f"Applied {filename}")
        cur.execute("select pg_notify('pgrst', 'reload schema')")
        cur.execute(
            """
            select column_name from information_schema.columns
            where table_schema='public' and table_name='firm_resources'
              and column_name='file_path'
            """
        )
        cols = [r[0] for r in cur.fetchall()]
        cur.execute("select id, file_size_limit from storage.buckets where id = 'firm-resources'")
        bucket = cur.fetchone()
    conn.commit()

print("firm_resources.file_path:", cols)
print("storage bucket firm-resources:", bucket if bucket else "MISSING")

if not cols:
    sys.exit("Expected firm_resources.file_path column after migration")

print("Waiting for PostgREST schema cache reload…")
for i in range(10):
    time.sleep(2)
    print(f"  …{(i + 1) * 2}s")

print("Done.")
