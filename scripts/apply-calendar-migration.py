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

sql = Path("supabase/migrations/20260720150000_calendar_connections.sql").read_text()

with psycopg.connect(**PG, sslmode="require", connect_timeout=30) as conn:
    with conn.cursor() as cur:
        cur.execute(
            """
            select count(*) from information_schema.tables
            where table_schema='public' and table_name='calendar_oauth_states'
            """
        )
        exists = cur.fetchone()[0] > 0
        if not exists:
            cur.execute(sql)
            print("Applied migration SQL")
        else:
            print("Tables already exist — skipping CREATE")

        cur.execute("select pg_notify('pgrst', 'reload schema')")
        cur.execute(
            """
            insert into supabase_migrations.schema_migrations (version)
            values ('20260720150000')
            on conflict do nothing;
            """
        )
        cur.execute(
            """
            select table_name from information_schema.tables
            where table_schema='public' and table_name like 'calendar_%'
            order by 1
            """
        )
        tables = [r[0] for r in cur.fetchall()]
    conn.commit()

print("postgres tables:", tables)

if len(tables) < 3:
    sys.exit("Expected 3 calendar_* tables")

print("Waiting for PostgREST schema cache reload…")
for i in range(15):
    time.sleep(2)
    print(f"  …{(i + 1) * 2}s")

print("Done. Re-test REST access with: npm run db:verify-calendar-migration")
