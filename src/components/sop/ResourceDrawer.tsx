import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ExternalLink, FileText, GripVertical, List, Mail, Paperclip, Trash2, Upload, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { RESOURCE_TYPE_LABELS } from "@/lib/sop-roles";
import {
  deleteFirmResourceFile,
  formatResourceError,
  openTaskResource,
  RESOURCE_FILE_ACCEPT,
  uploadFirmResourceFile,
  validateResourceFile,
} from "@/lib/firm-resource-files";
import {
  createFirmResourceUploadUrl,
  deleteFirmResourceStorageObject,
} from "@/lib/sop.functions";
import type { TaskRowResource } from "@/components/sop/TaskRow";

export type FirmResourceRow = {
  id: string;
  name: string;
  resource_type: string;
  sort_order?: number;
  url?: string | null;
  file_path?: string | null;
  file_name?: string | null;
  content?: string | null;
  subject_line?: string | null;
  tags?: string[] | null;
};

type ResourceDraft = {
  id?: string;
  name: string;
  resource_type: string;
  url: string;
  content: string;
  subject_line: string;
  tags: string[];
  file_path: string | null;
  file_name: string | null;
};

const EMPTY_DRAFT: ResourceDraft = {
  name: "",
  resource_type: "document_template",
  url: "",
  content: "",
  subject_line: "",
  tags: [],
  file_path: null,
  file_name: null,
};

function typeIcon(type: string) {
  switch (type) {
    case "email_template":
      return Mail;
    case "video":
      return Video;
    case "external_link":
      return ExternalLink;
    case "checklist":
      return List;
    case "document_template":
    case "contract":
      return FileText;
    default:
      return Paperclip;
  }
}

const FILTER_TYPES = [
  { key: "all", label: "All" },
  { key: "email_template", label: "Email templates" },
  { key: "document_template", label: "Documents" },
  { key: "video", label: "Videos" },
  { key: "external_link", label: "Links" },
  { key: "contract", label: "Contracts" },
];

function draftFromResource(r: FirmResourceRow): ResourceDraft {
  return {
    id: r.id,
    name: r.name,
    resource_type: r.resource_type,
    url: r.url ?? "",
    content: r.content ?? "",
    subject_line: r.subject_line ?? "",
    tags: r.tags ?? [],
    file_path: r.file_path ?? null,
    file_name: r.file_name ?? null,
  };
}

function SortableResourceRow({
  r,
  canManage,
  canDrag,
  busy,
  onEdit,
  onDelete,
  onOpen,
  getResourceDownloadUrl,
}: {
  r: FirmResourceRow;
  canManage: boolean;
  canDrag: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpen: () => void;
  getResourceDownloadUrl?: (path: string) => Promise<string>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: r.id,
    disabled: !canDrag,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const Icon = typeIcon(r.resource_type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2.5 border-b border-[rgba(44,44,44,0.08)] py-2.5",
        isDragging && "relative z-10 rounded-lg bg-white shadow-sm",
      )}
    >
      {canManage && canDrag ? (
        <button
          type="button"
          className="cursor-grab shrink-0 text-muted-lt active:cursor-grabbing"
          aria-label={`Drag to reorder ${r.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cream text-muted-lt">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className={cn(
            "block w-full truncate text-left text-[13px] font-medium text-charcoal",
            canManage && "hover:underline",
          )}
          onClick={onEdit}
        >
          {r.name}
        </button>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-lt">
          <span>{RESOURCE_TYPE_LABELS[r.resource_type] ?? r.resource_type}</span>
          {r.file_path ? <span>· Document</span> : null}
          {r.url ? <span>· Link</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canManage ? (
          <button
            type="button"
            aria-label={`Delete ${r.name}`}
            className="text-muted-lt hover:text-terra"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          className="text-[11px] text-gold underline"
          onClick={() =>
            void openTaskResource(r, {
              getDownloadUrl: getResourceDownloadUrl,
              onPreview: onOpen,
            }).then((opened) => {
              if (!opened) onOpen();
            })
          }
        >
          Open →
        </button>
      </div>
    </div>
  );
}

export function ResourceDrawer({
  open,
  onClose,
  resources,
  canManage,
  onSaveResource,
  onDeleteResource,
  onReorderResources,
  onOpenResource,
  getResourceDownloadUrl,
  saving,
  deleting,
  reordering,
}: {
  open: boolean;
  onClose: () => void;
  resources: FirmResourceRow[];
  canManage: boolean;
  saving?: boolean;
  deleting?: boolean;
  reordering?: boolean;
  onSaveResource: (data: {
    id?: string;
    name: string;
    resource_type: string;
    url?: string | null;
    file_path?: string | null;
    file_name?: string | null;
    content?: string | null;
    subject_line?: string | null;
    tags?: string[] | null;
  }) => Promise<void> | void;
  onDeleteResource?: (id: string) => Promise<void> | void;
  onReorderResources?: (orderedIds: string[]) => Promise<void> | void;
  onOpenResource: (r: TaskRowResource) => void;
  getResourceDownloadUrl?: (path: string) => Promise<string>;
}) {
  const createUploadUrlFn = useServerFn(createFirmResourceUploadUrl);
  const deleteStorageFn = useServerFn(deleteFirmResourceStorageObject);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<ResourceDraft>(EMPTY_DRAFT);
  const [tagInput, setTagInput] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [originalFilePath, setOriginalFilePath] = useState<string | null>(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);

  const sortedResources = useMemo(() => {
    return [...resources].sort((a, b) => {
      const ao = a.sort_order ?? 0;
      const bo = b.sort_order ?? 0;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
  }, [resources]);

  const [orderIds, setOrderIds] = useState<string[]>([]);
  useEffect(() => {
    setOrderIds(sortedResources.map((r) => r.id));
  }, [sortedResources]);

  const orderedResources = useMemo(() => {
    const byId = new Map(resources.map((r) => [r.id, r]));
    return orderIds.map((id) => byId.get(id)).filter(Boolean) as FirmResourceRow[];
  }, [orderIds, resources]);

  const canReorder =
    canManage && !!onReorderResources && filter === "all" && !search.trim();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orderedResources.filter((r) => {
      if (filter !== "all" && r.resource_type !== filter) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q);
    });
  }, [orderedResources, search, filter]);

  function handleResourceDragEnd(event: DragEndEvent) {
    if (!canReorder || !onReorderResources) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = orderIds.slice();
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ids, oldIndex, newIndex);
    setOrderIds(next);
    void onReorderResources(next).catch(() => {
      setOrderIds(sortedResources.map((r) => r.id));
      toast.error("Could not save resource order");
    });
  }

  function openCreate() {
    setDraft(EMPTY_DRAFT);
    setPendingFile(null);
    setOriginalFilePath(null);
    setRemoveExistingFile(false);
    setFormOpen(true);
  }

  function openEdit(r: FirmResourceRow) {
    setDraft(draftFromResource(r));
    setPendingFile(null);
    setOriginalFilePath(r.file_path ?? null);
    setRemoveExistingFile(false);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setDraft(EMPTY_DRAFT);
    setPendingFile(null);
    setOriginalFilePath(null);
    setRemoveExistingFile(false);
    setTagInput("");
  }

  async function handleSave() {
    if (!draft.name.trim()) return;
    let file_path = draft.file_path;
    let file_name = draft.file_name;

    try {
      setUploading(true);
      if (removeExistingFile && originalFilePath && !pendingFile) {
        await deleteFirmResourceFile(originalFilePath, (p) => deleteStorageFn({ data: p })).catch(() => undefined);
        file_path = null;
        file_name = null;
      }
      if (pendingFile) {
        if (originalFilePath) {
          await deleteFirmResourceFile(originalFilePath, (p) => deleteStorageFn({ data: p })).catch(() => undefined);
        }
        const uploaded = await uploadFirmResourceFile(pendingFile, (p) =>
          createUploadUrlFn({ data: p }),
        );
        file_path = uploaded.path;
        file_name = uploaded.fileName;
      }

      await onSaveResource({
        id: draft.id,
        name: draft.name.trim(),
        resource_type: draft.resource_type,
        url: draft.url.trim() || null,
        file_path,
        file_name,
        content: draft.content.trim() || null,
        subject_line: draft.subject_line.trim() || null,
        tags: draft.tags.length ? draft.tags : null,
      });
      closeForm();
    } catch (e) {
      toast.error(formatResourceError(e, "Could not save resource"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteResource(r: FirmResourceRow) {
    if (!onDeleteResource) return;
    const ok = window.confirm(
      `Delete "${r.name}"? It will be removed from your library. Tasks that already linked this resource keep their project copies.`,
    );
    if (!ok) return;
    try {
      await onDeleteResource(r.id);
      if (draft.id === r.id) closeForm();
      toast.success("Resource deleted");
    } catch (e) {
      toast.error(formatResourceError(e, "Could not delete resource"));
    }
  }

  if (!open) return null;

  const busy = saving || uploading || deleting || reordering;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/15" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[380px] flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[rgba(44,44,44,0.10)] px-5 py-4">
          <h2 className="font-voice text-xl text-charcoal">Resources</h2>
          <button type="button" className="text-[12px] text-muted-lt" onClick={onClose}>
            × Close
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search resources"
            className="mb-3"
          />
          <div className="mb-4 flex flex-wrap gap-1.5">
            {FILTER_TYPES.map((f) => (
              <button
                key={f.key}
                type="button"
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-medium",
                  filter === f.key
                    ? "border-charcoal bg-charcoal text-white"
                    : "border-[rgba(44,44,44,0.12)] text-muted-lt",
                )}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {canManage && (search.trim() || filter !== "all") ? (
            <p className="mb-2 text-[10px] text-muted-lt">Clear search and filters to drag and reorder resources.</p>
          ) : null}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleResourceDragEnd}>
            <SortableContext items={filtered.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {filtered.map((r) => (
                <SortableResourceRow
                  key={r.id}
                  r={r}
                  canManage={canManage}
                  canDrag={canReorder}
                  busy={busy}
                  onEdit={() => (canManage ? openEdit(r) : onOpenResource(r))}
                  onDelete={() => void handleDeleteResource(r)}
                  onOpen={() => onOpenResource(r)}
                  getResourceDownloadUrl={getResourceDownloadUrl}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {canManage ? (
          <div className="border-t border-[rgba(44,44,44,0.10)] p-4">
            <Button className="w-full bg-charcoal hover:bg-charcoal/90" onClick={openCreate}>
              + Add resource
            </Button>
          </div>
        ) : null}
      </aside>

      <Dialog open={formOpen} onOpenChange={(v) => !v && closeForm()}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto rounded-xl p-6">
          <DialogHeader>
            <DialogTitle className="font-voice text-xl font-normal text-charcoal">
              {draft.id ? "Edit resource" : "Add resource"}
            </DialogTitle>
          </DialogHeader>

          <label className="mb-1 block text-[12px] font-medium text-charcoal">Resource type</label>
          <Select value={draft.resource_type} onValueChange={(v) => setDraft((d) => ({ ...d, resource_type: v }))}>
            <SelectTrigger className="mb-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RESOURCE_TYPE_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="mb-1 block text-[12px] font-medium text-charcoal">Name</label>
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="mb-3"
          />

          <label className="mb-1 block text-[12px] font-medium text-charcoal">External link (optional)</label>
          <Input
            value={draft.url}
            onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
            placeholder="https://drive.google.com/… or any URL"
            className="mb-1"
          />
          <p className="mb-3 text-[11px] text-muted-lt">
            Link to a file in Google Drive, Dropbox, Loom, Notion, or any outside resource.
          </p>

          <label className="mb-1 block text-[12px] font-medium text-charcoal">Attached document (optional)</label>
          <div className="mb-3 rounded-md border border-dashed border-[rgba(44,44,44,0.18)] bg-cream/40 p-3">
            {draft.file_name && !pendingFile ? (
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] text-charcoal">{draft.file_name}</span>
                <button
                  type="button"
                  className="shrink-0 text-[11px] text-terra underline"
                  onClick={() => {
                    setDraft((d) => ({ ...d, file_path: null, file_name: null }));
                    setRemoveExistingFile(true);
                  }}
                >
                  Remove
                </button>
              </div>
            ) : pendingFile ? (
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] text-charcoal">{pendingFile.name}</span>
                <button type="button" className="shrink-0 text-[11px] text-muted-lt underline" onClick={() => setPendingFile(null)}>
                  Clear
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-lt">
                <Upload className="h-4 w-4 shrink-0" />
                <span>Upload PDF, Word, Excel, or image (max 50 MB)</span>
                <input
                  type="file"
                  accept={RESOURCE_FILE_ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const err = validateResourceFile(file);
                    if (err) {
                      toast.error(err);
                      return;
                    }
                    setPendingFile(file);
                  }}
                />
              </label>
            )}
          </div>

          {draft.resource_type === "email_template" ? (
            <>
              <label className="mb-1 block text-[12px] font-medium text-charcoal">Subject line</label>
              <Input
                value={draft.subject_line}
                onChange={(e) => setDraft((d) => ({ ...d, subject_line: e.target.value }))}
                className="mb-3"
              />
            </>
          ) : null}

          {["email_template", "process_doc", "checklist"].includes(draft.resource_type) ? (
            <>
              <label className="mb-1 block text-[12px] font-medium text-charcoal">Content</label>
              <Textarea
                value={draft.content}
                onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                rows={6}
                className="mb-1"
              />
              <p className="mb-3 text-[11px] italic text-muted-lt">
                Use {"{{client_name}}"}, {"{{project_name}}"} for merge fields
              </p>
            </>
          ) : null}

          <label className="mb-1 block text-[12px] font-medium text-charcoal">Tags</label>
          <div className="mb-2 flex flex-wrap gap-1">
            {draft.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-[11px]">
                {t}
                <button type="button" onClick={() => setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== t) }))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Type tag and press Enter"
            onKeyDown={(e) => {
              if (e.key === "Enter" && tagInput.trim()) {
                e.preventDefault();
                setDraft((d) => ({ ...d, tags: [...d.tags, tagInput.trim()] }));
                setTagInput("");
              }
            }}
            className="mb-4"
          />

          <Button className="w-full bg-charcoal hover:bg-charcoal/90" disabled={!draft.name.trim() || busy} onClick={() => void handleSave()}>
            {busy ? "Saving…" : draft.id ? "Save changes →" : "Save resource →"}
          </Button>

          {draft.id && onDeleteResource ? (
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full border-terra/40 text-terra hover:bg-terra/5"
              disabled={busy}
              onClick={() =>
                void handleDeleteResource({
                  id: draft.id!,
                  name: draft.name,
                  resource_type: draft.resource_type,
                })
              }
            >
              Delete resource
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RoleInsightsPanel({
  insights,
}: {
  insights: {
    roles: { role: string; displayName: string; totalHrs: number; pctOfTotal: number }[];
    totalHrsPerProject: number;
    delegatableHrs: number;
    delegatablePct: number;
    tasksWithResources: number;
    totalTasks: number;
    principalHrsPerProject: number;
    projectsWithWorkflows?: number;
    topHireRecommendation: { role: string; hrs: number; rationale: string } | null;
  };
}) {
  const maxHrs = Math.max(...insights.roles.map((r) => r.totalHrs), 1);
  const projectCount = insights.projectsWithWorkflows ?? 0;

  return (
    <div className="rounded-[10px] border border-[rgba(44,44,44,0.10)] bg-white px-[18px] py-4">
      <div className="mb-3.5">
        <div className="text-[13px] font-medium text-charcoal">Your firm by role</div>
        <div className="mt-0.5 text-[11px] text-muted-lt">
          {projectCount > 0
            ? `Based on ${projectCount} ${projectCount === 1 ? "project" : "projects"} with a workflow attached`
            : "Attach a workflow to a project to see role breakdowns"}
        </div>
      </div>
      {insights.roles.length === 0 ? (
        <p className="text-[12px] italic text-muted-lt">
          No projects have a workflow assigned yet. Attach a template in Sightline to populate these insights.
        </p>
      ) : (
        <>
          {insights.roles.map((r) => {
            const barColor =
              r.role === "principal"
                ? "#2C2C2C"
                : r.role === "designer" || r.role === "junior_designer"
                  ? "#5C8A6E"
                  : r.role === "coordinator"
                    ? "#B8860B"
                    : r.role === "external"
                      ? "#C4714A"
                      : "#6B6259";
            return (
              <div key={r.role} className="mb-2 flex items-center gap-2.5">
                <span className="w-[120px] shrink-0 text-[12px] text-muted-lt">{r.displayName}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-[rgba(44,44,44,0.08)]">
                  <div className="h-1.5 rounded-sm" style={{ width: `${(r.totalHrs / maxHrs) * 100}%`, background: barColor }} />
                </div>
                <span className="w-11 shrink-0 text-right text-[11px] text-muted-lt">{Math.round(r.totalHrs)} hrs</span>
              </div>
            );
          })}
          {insights.topHireRecommendation ? (
            <div className="mt-3 rounded-r-md border-l-2 border-gold bg-[rgba(184,134,11,0.07)] px-3.5 py-2.5">
              <p className="font-voice text-[13px] italic leading-relaxed text-muted-lt">
                You are currently filling all {insights.roles.length} roles. The highest-leverage hire based on your SOPs is a{" "}
                {insights.topHireRecommendation.role} — {insights.topHireRecommendation.rationale}
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
