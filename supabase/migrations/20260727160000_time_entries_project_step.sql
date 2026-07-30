-- Optional link from a time entry to a specific workflow step (task) under a phase.
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS project_step_id uuid REFERENCES public.project_steps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS time_entries_project_step_idx ON public.time_entries(project_step_id);
