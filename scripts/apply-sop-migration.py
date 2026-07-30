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

VERSION = "20260722194500"
SORT_ORDER_VERSION = "20260722195000"
FIRM_RESOURCES_SORT_VERSION = "20260726140000"
ROLE_EXPANSION_VERSION = "20260726150000"
WORKFLOW_ATTACHMENTS_VERSION = "20260727120000"
sql = Path(f"supabase/migrations/{VERSION}_sop_library_rebuild_schema.sql").read_text()
sort_order_sql = Path(f"supabase/migrations/{SORT_ORDER_VERSION}_sop_template_sort_order.sql").read_text()
firm_resources_sort_sql = Path(
    f"supabase/migrations/{FIRM_RESOURCES_SORT_VERSION}_firm_resources_sort_order.sql"
).read_text()
role_expansion_sql = Path(
    f"supabase/migrations/{ROLE_EXPANSION_VERSION}_sop_assigned_role_expansion.sql"
).read_text()
workflow_attachments_sql = Path(
    f"supabase/migrations/{WORKFLOW_ATTACHMENTS_VERSION}_project_workflow_attachments.sql"
).read_text()

with psycopg.connect(**PG, sslmode="require", connect_timeout=30) as conn:
    with conn.cursor() as cur:
        cur.execute(
            """
            select count(*) from information_schema.tables
            where table_schema='public' and table_name='firm_resources'
            """
        )
        exists = cur.fetchone()[0] > 0
        if not exists:
            cur.execute(sql)
            print("Applied SOP library rebuild migration SQL")
        else:
            print("firm_resources already exists — running migration anyway (idempotent ALTERs)")
            cur.execute(sql)

        cur.execute(
            """
            select count(*) from information_schema.columns
            where table_schema='public' and table_name='sop_templates'
              and column_name='sort_order'
            """
        )
        has_sort_order = cur.fetchone()[0] > 0
        if not has_sort_order:
            cur.execute(sort_order_sql)
            print("Applied sop_templates.sort_order migration")
        else:
            print("sop_templates.sort_order already exists — running sort-order migration anyway (idempotent)")
            cur.execute(sort_order_sql)

        cur.execute(
            """
            select count(*) from information_schema.columns
            where table_schema='public' and table_name='firm_resources'
              and column_name='sort_order'
            """
        )
        has_resource_sort = cur.fetchone()[0] > 0
        if not has_resource_sort:
            cur.execute(firm_resources_sort_sql)
            print("Applied firm_resources.sort_order migration")
        else:
            print("firm_resources.sort_order already exists — running migration anyway (idempotent)")
            cur.execute(firm_resources_sort_sql)

        cur.execute(role_expansion_sql)
        print("Applied SOP assigned role expansion migration")

        cur.execute(
            """
            select count(*) from information_schema.tables
            where table_schema='public' and table_name='project_workflow_attachments'
            """
        )
        if cur.fetchone()[0] == 0:
            cur.execute(workflow_attachments_sql)
            print("Applied project_workflow_attachments migration")
        else:
            print("project_workflow_attachments already exists — running migration anyway (idempotent)")
            cur.execute(workflow_attachments_sql)

        cur.execute("select pg_notify('pgrst', 'reload schema')")
        cur.execute(
            """
            insert into supabase_migrations.schema_migrations (version)
            values (%s)
            on conflict do nothing
            """,
            (VERSION,),
        )
        cur.execute(
            """
            insert into supabase_migrations.schema_migrations (version)
            values (%s)
            on conflict do nothing
            """,
            (SORT_ORDER_VERSION,),
        )
        cur.execute(
            """
            insert into supabase_migrations.schema_migrations (version)
            values (%s)
            on conflict do nothing
            """,
            (FIRM_RESOURCES_SORT_VERSION,),
        )
        cur.execute(
            """
            insert into supabase_migrations.schema_migrations (version)
            values (%s)
            on conflict do nothing
            """,
            (ROLE_EXPANSION_VERSION,),
        )
        cur.execute(
            """
            insert into supabase_migrations.schema_migrations (version)
            values (%s)
            on conflict do nothing
            """,
            (WORKFLOW_ATTACHMENTS_VERSION,),
        )
        cur.execute(
            """
            select column_name from information_schema.columns
            where table_schema='public' and table_name='sop_templates'
              and column_name in ('workflow_type', 'sort_order')
            """
        )
        cols = [r[0] for r in cur.fetchall()]
    conn.commit()

print("postgres sop_templates columns:", cols)

if "workflow_type" not in cols:
    sys.exit("Expected sop_templates.workflow_type column after migration")

print("Waiting for PostgREST schema cache reload…")
for i in range(15):
    time.sleep(2)
    print(f"  …{(i + 1) * 2}s")

print("Done. Re-test with: npm run db:verify-sop-migration")
