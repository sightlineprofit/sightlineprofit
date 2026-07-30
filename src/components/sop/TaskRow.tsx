import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Link2,
  List,
  Mail,
  Paperclip,
  Video,
} from "lucide-react";
import { getFirmResourceFileUrl, openTaskResource } from "@/lib/firm-resource-files";
import { getFirmResourceDownloadUrl } from "@/lib/sop.functions";
import { cn } from "@/lib/utils";
import { assignedRoleDisplayLabel, roleStyle, RESOURCE_TYPE_LABELS } from "@/lib/sop-roles";
import { formatHours } from "@/lib/finance";

export type SopStepItem = { order: number; text: string; completed_at?: string | null };

export type TaskRowResource = {
  id: string;
  name: string;
  resource_type: string;
  url?: string | null;
  file_path?: string | null;
  file_name?: string | null;
  content?: string | null;
  subject_line?: string | null;
};

export type TaskRowData = {
  id: string;
  name: string;
  estimated_hrs: number;
  assigned_role?: string | null;
  assigned_role_label?: string | null;
  trigger_description?: string | null;
  completion_criteria?: string | null;
  steps?: SopStepItem[] | null;
  notes?: string | null;
  completed_at?: string | null;
  resources?: TaskRowResource[];
};

type TaskRowProps = {
  task: TaskRowData;
  mode?: "library" | "project";
  canManage?: boolean;
  onEdit?: () => void;
  onAddResource?: () => void;
  onToggleComplete?: (completed: boolean) => void;
  onToggleStepItem?: (order: number, completed: boolean) => void;
  onOpenResource?: (resource: TaskRowResource) => void;
  getResourceDownloadUrl?: (path: string) => Promise<string>;
};

function subStepProgress(steps: SopStepItem[]) {
  const total = steps.length;
  const done = steps.filter((s) => !!s.completed_at).length;
  return { done, total };
}

function resourceIcon(type: string) {
  switch (type) {
    case "email_template":
      return Mail;
    case "document_template":
    case "contract":
      return FileText;
    case "video":
      return Video;
    case "external_link":
      return ExternalLink;
    case "checklist":
      return List;
    default:
      return Paperclip;
  }
}

export function TaskRow({
  task,
  mode = "library",
  canManage = false,
  onEdit,
  onAddResource,
  onToggleComplete,
  onToggleStepItem,
  onOpenResource,
  getResourceDownloadUrl,
}: TaskRowProps) {
  const [open, setOpen] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const role = roleStyle(task.assigned_role);
  const roleLabel = assignedRoleDisplayLabel(task.assigned_role, task.assigned_role_label);
  const steps = Array.isArray(task.steps) ? task.steps : [];
  const completed = !!task.completed_at;
  const progress = subStepProgress(steps);
  const sortedSteps = steps.slice().sort((a, b) => a.order - b.order);

  async function handleOpenResource(r: TaskRowResource) {
    setOpeningId(r.id);
    try {
      const opened = await openTaskResource(r, {
        getDownloadUrl: getResourceDownloadUrl,
        onPreview: () => onOpenResource?.(r),
      });
      if (!opened) onOpenResource?.(r);
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="border-b border-[rgba(44,44,44,0.07)] last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        className="flex w-full cursor-pointer items-center gap-2 py-2.5 text-left"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        {mode === "project" && onToggleComplete ? (
          <button
            type="button"
            className={cn(
              "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-[rgba(44,44,44,0.20)]",
              completed && "border-sage bg-sage text-white",
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggleComplete(!completed);
            }}
          >
            {completed ? <Check className="h-3 w-3" /> : null}
          </button>
        ) : (
          <span className="h-[18px] w-[18px] shrink-0 rounded-full border border-[rgba(44,44,44,0.20)]" />
        )}
        <span className={cn("flex-1 text-[13px] font-medium text-charcoal", completed && "text-muted-lt line-through")}>
          {task.name}
        </span>
        {mode === "project" && progress.total > 0 ? (
          <span className="whitespace-nowrap rounded-[8px] bg-[rgba(92,138,110,0.12)] px-1.5 py-0.5 text-[10px] font-medium text-sage">
            {progress.done}/{progress.total}
          </span>
        ) : null}
        <span className="whitespace-nowrap text-[11px] text-muted-lt">{formatHours(task.estimated_hrs)}</span>
        <span
          className="ml-2 shrink-0 rounded-[10px] px-2 py-0.5 text-[10px] font-medium"
          style={{ color: role.text, background: role.bg }}
        >
          {roleLabel}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-lt transition-transform", open && "rotate-180")} />
      </div>

      {open ? (
        <div className="pb-2.5 pl-[26px]">
          <div className="mb-2 grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-muted-lt">Triggered by</p>
              <p className="text-[12px] leading-relaxed text-muted-lt">{task.trigger_description?.trim() || "—"}</p>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-muted-lt">Done when</p>
              <p className="text-[12px] leading-relaxed text-muted-lt">{task.completion_criteria?.trim() || "—"}</p>
            </div>
          </div>

          {sortedSteps.length > 0 ? (
            <div className="mb-2 rounded-md bg-[rgba(44,44,44,0.03)] px-3 py-2.5">
              <p className="mb-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-lt">Steps to complete</p>
              {sortedSteps.map((s) => {
                const itemDone = !!s.completed_at;
                const interactive = mode === "project" && !!onToggleStepItem;
                return (
                  <div key={s.order} className="flex items-start gap-2 py-0.5">
                    {interactive ? (
                      <button
                        type="button"
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[rgba(44,44,44,0.20)]",
                          itemDone && "border-sage bg-sage text-white",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleStepItem(s.order, !itemDone);
                        }}
                      >
                        {itemDone ? <Check className="h-2.5 w-2.5" /> : null}
                      </button>
                    ) : (
                      <span className="mt-0.5 w-4 shrink-0 text-[11px] text-muted-lt">{s.order}</span>
                    )}
                    <span
                      className={cn(
                        "text-[12px] text-muted-lt",
                        itemDone && "text-muted-lt/70 line-through",
                      )}
                    >
                      {s.text}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {task.notes ? (
            <p className="mb-2 text-[12px] italic leading-relaxed text-muted-lt">{task.notes}</p>
          ) : null}

          {(task.resources?.length ?? 0) > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {task.resources!.map((r) => {
                const Icon = resourceIcon(r.resource_type);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className="inline-flex items-center gap-1 rounded-[5px] border border-[rgba(44,44,44,0.12)] bg-white px-2 py-1 text-[11px] font-medium text-muted-lt hover:bg-cream"
                    disabled={openingId === r.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleOpenResource(r);
                    }}
                  >
                    <Icon className="h-3 w-3" />
                    {r.name}
                  </button>
                );
              })}
            </div>
          ) : null}

          {canManage && mode === "library" ? (
            <div className="mt-2 flex gap-3">
              {onEdit ? (
                <button type="button" className="text-[11px] text-muted-lt underline" onClick={onEdit}>
                  Edit task
                </button>
              ) : null}
              {onAddResource ? (
                <button type="button" className="text-[11px] text-gold underline" onClick={onAddResource}>
                  Add resource
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ResourcePreviewModal({
  resource,
  onClose,
}: {
  resource: TaskRowResource | null;
  onClose: () => void;
}) {
  const getDownloadUrlFn = useServerFn(getFirmResourceDownloadUrl);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    setFileUrl(null);
    setFileError(null);
    if (!resource?.file_path) return;
    let cancelled = false;
    void getFirmResourceFileUrl(resource.file_path, (p) => getDownloadUrlFn({ data: p }))
      .then((url) => {
        if (!cancelled) setFileUrl(url);
      })
      .catch((e) => {
        if (!cancelled) setFileError(e instanceof Error ? e.message : "Could not load file");
      });
    return () => {
      cancelled = true;
    };
  }, [resource?.file_path, getDownloadUrlFn]);

  if (!resource) return null;
  const typeLabel = RESOURCE_TYPE_LABELS[resource.resource_type] ?? resource.resource_type;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/15 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-lt">{typeLabel}</div>
        <h3 className="font-voice text-xl text-charcoal">{resource.name}</h3>
        {resource.subject_line ? (
          <p className="mt-2 text-[13px] text-muted-lt">
            <span className="font-medium text-charcoal">Subject: </span>
            {resource.subject_line}
          </p>
        ) : null}
        {resource.content ? (
          <pre className="mt-4 whitespace-pre-wrap rounded-md bg-cream p-3 text-[12px] leading-relaxed text-muted-lt">
            {resource.content}
          </pre>
        ) : null}
        {resource.file_path ? (
          <div className={resource.content ? "mt-3" : "mt-3"}>
            {fileUrl ? (
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-gold underline"
              >
                {resource.file_name ? `Open attached file: ${resource.file_name}` : "Open attached document"}{" "}
                <FileText className="h-3 w-3" />
              </a>
            ) : fileError ? (
              <p className="text-[12px] text-terra">{fileError}</p>
            ) : (
              <p className="text-[12px] text-muted-lt">Loading attachment…</p>
            )}
          </div>
        ) : null}
        {resource.url ? (
          <a
            href={resource.url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[12px] text-gold underline"
          >
            Open external link <Link2 className="h-3 w-3" />
          </a>
        ) : null}
        {!resource.content && !resource.subject_line && !resource.url && !resource.file_path ? (
          <p className="mt-3 text-[12px] text-muted-lt">No content configured for this resource yet.</p>
        ) : null}
        <button type="button" className="mt-4 text-[12px] text-muted-lt underline" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
