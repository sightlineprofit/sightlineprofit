-- Archive + soft-delete for projects (mirrors sop_templates.deleted_at pattern).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS projects_firm_active_idx
  ON public.projects (firm_id, created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.projects.archived_at IS 'When set, project is hidden from default Sightline lists but recoverable.';
COMMENT ON COLUMN public.projects.deleted_at IS 'Soft delete — preserves time entries, snapshots, and audit history.';
