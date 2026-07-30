-- Expand SOP / project task assignee roles + optional custom label for "other".

ALTER TABLE public.sop_steps
  ADD COLUMN IF NOT EXISTS assigned_role_label text;

ALTER TABLE public.project_steps
  ADD COLUMN IF NOT EXISTS assigned_role_label text;

ALTER TABLE public.sop_steps DROP CONSTRAINT IF EXISTS sop_steps_assigned_role_check;
ALTER TABLE public.sop_steps
  ADD CONSTRAINT sop_steps_assigned_role_check
  CHECK (assigned_role IN (
    'principal',
    'designer',
    'junior_designer',
    'coordinator',
    'project_manager',
    'account_manager',
    'administrative',
    'external',
    'other'
  ));

ALTER TABLE public.project_steps DROP CONSTRAINT IF EXISTS project_steps_assigned_role_check;
ALTER TABLE public.project_steps
  ADD CONSTRAINT project_steps_assigned_role_check
  CHECK (assigned_role IS NULL OR assigned_role IN (
    'principal',
    'designer',
    'junior_designer',
    'coordinator',
    'project_manager',
    'account_manager',
    'administrative',
    'external',
    'other'
  ));

COMMENT ON COLUMN public.sop_steps.assigned_role_label IS 'Display label when assigned_role is other';
COMMENT ON COLUMN public.project_steps.assigned_role_label IS 'Display label when assigned_role is other';
