import { useEffect, useState } from "react";
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
import { ExternalLink, FileText, GripVertical, Link2, Paperclip, Pencil, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { RESOURCE_TYPE_LABELS, SOP_ROLE_OPTIONS, assignedRoleDisplayLabel, roleStyle } from "@/lib/sop-roles";
import type { SopAssignedRole } from "@/lib/sop-roles";
import type { TaskRowData } from "@/components/sop/TaskRow";
import {
  deleteFirmResourceFile,
  formatResourceError,
  openTaskResource,
  RESOURCE_FILE_ACCEPT,
  uploadFirmResourceFile,
  validateResourceFile,
} from "@/lib/firm-resource-files";
import { createFirmResourceUploadUrl, deleteFirmResourceStorageObject, getFirmResourceDownloadUrl } from "@/lib/sop.functions";

export type ResourceOption = {
  id: string;
  name: string;
  resource_type: string;
  url?: string | null;
  file_path?: string | null;
  file_name?: string | null;
  content?: string | null;
  subject_line?: string | null;
};

export type TaskInlineResource = {
  name: string;
  url?: string | null;
  file_path?: string | null;
  file_name?: string | null;
  resource_type: string;
};

type PendingLink = { key: string; name: string; url: string };
type PendingFile = { key: string; file: File; name: string };

type ResourceEditDraft = {
  name: string;
  url: string;
  content: string;
  subject_line: string;
  file_path: string | null;
  file_name: string | null;
};

type EditingTarget =
  | { kind: "linked"; id: string }
  | { kind: "pendingLink"; key: string }
  | { kind: "pendingFile"; key: string };

const EMPTY_RESOURCE_DRAFT: ResourceEditDraft = {
  name: "",
  url: "",
  content: "",
  subject_line: "",
  file_path: null,
  file_name: null,
};

type StepDraft = { key: string; text: string };

function newStepDraft(text = ""): StepDraft {
  return { key: crypto.randomUUID(), text };
}

function SortableTaskStepRow({
  index,
  item,
  onChange,
  onRemove,
}: {
  index: number;
  item: StepDraft;
  onChange: (text: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("mb-1.5 flex items-center gap-2", isDragging && "relative z-10 rounded-md bg-white shadow-sm")}
    >
      <button
        type="button"
        className="cursor-grab shrink-0 text-muted-lt active:cursor-grabbing"
        aria-label={`Drag step ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="w-4 shrink-0 text-[11px] text-muted-lt">{index + 1}</span>
      <Input
        value={item.text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Step ${index + 1}`}
      />
      <button type="button" onClick={onRemove} className="shrink-0 text-muted-lt">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function TaskEditModal({
  open,
  onOpenChange,
  phaseId,
  task,
  resources,
  linkedResourceIds,
  onSave,
  onSaveResource,
  saving,
  onPreviewResource,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  phaseId: string | null;
  task?: TaskRowData | null;
  resources: ResourceOption[];
  linkedResourceIds?: string[];
  onSave: (data: {
    id?: string;
    phase_id: string;
    name: string;
    assigned_role: SopAssignedRole;
    assigned_role_label?: string | null;
    estimated_hrs: number;
    trigger_description: string | null;
    completion_criteria: string | null;
    steps: { order: number; text: string }[] | null;
    notes: string | null;
    is_billable: boolean;
    resource_ids: string[];
    new_resources?: TaskInlineResource[];
  }) => void | Promise<void>;
  onSaveResource?: (data: {
    id?: string;
    name: string;
    resource_type: string;
    url?: string | null;
    file_path?: string | null;
    file_name?: string | null;
    content?: string | null;
    subject_line?: string | null;
  }) => void | Promise<void>;
  saving?: boolean;
  onPreviewResource?: (resource: ResourceOption) => void;
}) {
  const createUploadUrlFn = useServerFn(createFirmResourceUploadUrl);
  const getDownloadUrlFn = useServerFn(getFirmResourceDownloadUrl);
  const deleteStorageFn = useServerFn(deleteFirmResourceStorageObject);
  const [name, setName] = useState("");
  const [role, setRole] = useState<SopAssignedRole>("principal");
  const [roleLabel, setRoleLabel] = useState("");
  const [hrs, setHrs] = useState("0");
  const [trigger, setTrigger] = useState("");
  const [doneWhen, setDoneWhen] = useState("");
  const [stepItems, setStepItems] = useState<StepDraft[]>([newStepDraft()]);
  const [notes, setNotes] = useState("");
  const [billable, setBillable] = useState(true);
  const [pickedResources, setPickedResources] = useState<string[]>([]);
  const [pendingLinks, setPendingLinks] = useState<PendingLink[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null);
  const [resourceDraft, setResourceDraft] = useState<ResourceEditDraft>(EMPTY_RESOURCE_DRAFT);
  const [editingResourceType, setEditingResourceType] = useState<string>("external_link");
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);
  const [originalFilePath, setOriginalFilePath] = useState<string | null>(null);
  const [localResourceNames, setLocalResourceNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(task?.name ?? "");
    setRole((task?.assigned_role ?? "principal") as SopAssignedRole);
    setRoleLabel((task as { assigned_role_label?: string | null } | undefined)?.assigned_role_label ?? "");
    setHrs(String(task?.estimated_hrs ?? 0));
    setTrigger(task?.trigger_description ?? "");
    setDoneWhen(task?.completion_criteria ?? "");
    setStepItems(
      Array.isArray(task?.steps) && task!.steps!.length
        ? task!
            .steps!.slice()
            .sort((a, b) => a.order - b.order)
            .map((s) => newStepDraft(s.text))
        : [newStepDraft()],
    );
    setNotes(task?.notes ?? "");
    setBillable((task as { is_billable?: boolean } | undefined)?.is_billable ?? true);
    setPickedResources(linkedResourceIds ?? task?.resources?.map((r) => r.id) ?? []);
    setPendingLinks([]);
    setPendingFiles([]);
    setShowLibraryPicker(false);
    setShowLinkForm(false);
    setLinkName("");
    setLinkUrl("");
    setEditingTarget(null);
    setResourceDraft(EMPTY_RESOURCE_DRAFT);
    setReplaceFile(null);
    setRemoveExistingFile(false);
    setOriginalFilePath(null);
    setLocalResourceNames({});
  }, [open, task, linkedResourceIds]);

  function closeResourceEdit() {
    setEditingTarget(null);
    setResourceDraft(EMPTY_RESOURCE_DRAFT);
    setReplaceFile(null);
    setRemoveExistingFile(false);
    setOriginalFilePath(null);
  }

  function openEditLinked(id: string) {
    const r = resources.find((x) => x.id === id);
    if (!r) return;
    setEditingTarget({ kind: "linked", id });
    setEditingResourceType(r.resource_type);
    setResourceDraft({
      name: localResourceNames[id] ?? r.name,
      url: r.url ?? "",
      content: r.content ?? "",
      subject_line: r.subject_line ?? "",
      file_path: r.file_path ?? null,
      file_name: r.file_name ?? null,
    });
    setReplaceFile(null);
    setRemoveExistingFile(false);
    setOriginalFilePath(r.file_path ?? null);
    setShowLinkForm(false);
    setShowLibraryPicker(false);
  }

  function openEditPendingLink(key: string) {
    const link = pendingLinks.find((l) => l.key === key);
    if (!link) return;
    setEditingTarget({ kind: "pendingLink", key });
    setResourceDraft({
      ...EMPTY_RESOURCE_DRAFT,
      name: link.name,
      url: link.url,
    });
    setShowLinkForm(false);
    setShowLibraryPicker(false);
  }

  function openEditPendingFile(key: string) {
    const file = pendingFiles.find((f) => f.key === key);
    if (!file) return;
    setEditingTarget({ kind: "pendingFile", key });
    setResourceDraft({
      ...EMPTY_RESOURCE_DRAFT,
      name: file.name,
      file_name: file.file.name,
    });
    setReplaceFile(null);
    setShowLinkForm(false);
    setShowLibraryPicker(false);
  }

  async function saveResourceEdit() {
    const label = resourceDraft.name.trim();
    if (!label || !editingTarget) {
      toast.error("Enter a name for the resource");
      return;
    }

    if (editingTarget.kind === "pendingLink") {
      const url = resourceDraft.url.trim();
      if (!url) {
        toast.error("Enter a URL");
        return;
      }
      setPendingLinks((prev) =>
        prev.map((l) => (l.key === editingTarget.key ? { ...l, name: label, url } : l)),
      );
      closeResourceEdit();
      return;
    }

    if (editingTarget.kind === "pendingFile") {
      setPendingFiles((prev) =>
        prev.map((f) => {
          if (f.key !== editingTarget.key) return f;
          return {
            ...f,
            name: label,
            file: replaceFile ?? f.file,
          };
        }),
      );
      closeResourceEdit();
      return;
    }

    if (!onSaveResource) {
      toast.error("Resource editing is not available");
      return;
    }

    const linked = resources.find((x) => x.id === editingTarget.id);
    if (!linked) return;

    try {
      setUploading(true);
      let file_path = resourceDraft.file_path;
      let file_name = resourceDraft.file_name;

      if (removeExistingFile && originalFilePath && !replaceFile) {
        await deleteFirmResourceFile(originalFilePath, (p) => deleteStorageFn({ data: p })).catch(() => undefined);
        file_path = null;
        file_name = null;
      }
      if (replaceFile) {
        if (originalFilePath) {
          await deleteFirmResourceFile(originalFilePath, (p) => deleteStorageFn({ data: p })).catch(() => undefined);
        }
        const uploaded = await uploadFirmResourceFile(replaceFile, (p) => createUploadUrlFn({ data: p }));
        file_path = uploaded.path;
        file_name = uploaded.fileName;
      }

      await onSaveResource({
        id: linked.id,
        name: label,
        resource_type: linked.resource_type,
        url: resourceDraft.url.trim() || null,
        file_path,
        file_name,
        content: resourceDraft.content.trim() || null,
        subject_line: resourceDraft.subject_line.trim() || null,
      });
      setLocalResourceNames((prev) => ({ ...prev, [linked.id]: label }));
      toast.success("Resource updated");
      closeResourceEdit();
    } catch (e) {
      toast.error(formatResourceError(e, "Could not update resource"));
    } finally {
      setUploading(false);
    }
  }

  const addStep = () => setStepItems((s) => [...s, newStepDraft()]);
  const removeStep = (key: string) => setStepItems((s) => s.filter((item) => item.key !== key));

  const stepSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleStepDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setStepItems((items) => {
      const ids = items.map((i) => i.key);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  }

  function addPendingLink() {
    const label = linkName.trim();
    const url = linkUrl.trim();
    if (!label || !url) {
      toast.error("Enter a name and URL for the link");
      return;
    }
    setPendingLinks((prev) => [...prev, { key: crypto.randomUUID(), name: label, url }]);
    setLinkName("");
    setLinkUrl("");
    setShowLinkForm(false);
    closeResourceEdit();
  }

  function onPickFile(file: File) {
    const err = validateResourceFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    const base = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    setPendingFiles((prev) => [
      ...prev,
      { key: crypto.randomUUID(), file, name: base || file.name },
    ]);
  }

  async function handleOpenLinkedResource(resource: ResourceOption) {
    const opened = await openTaskResource(resource, {
      getDownloadUrl: async (path) => {
        const { url } = await getDownloadUrlFn({ data: { path } });
        return url;
      },
      onPreview: () => onPreviewResource?.(resource),
    });
    if (!opened) {
      toast.error("This resource has no link or file attached yet");
    }
  }

  async function handleSave() {
    if (!phaseId || !name.trim()) return;
    if (role === "other" && !roleLabel.trim()) {
      toast.error("Enter who handles this task");
      return;
    }
    const steps = stepItems
      .map((item, i) => ({ order: i + 1, text: item.text.trim() }))
      .filter((s) => s.text);

    try {
      setUploading(true);
      const newResources: TaskInlineResource[] = [
        ...pendingLinks.map((l) => ({
          name: l.name,
          url: l.url,
          resource_type: "external_link",
        })),
      ];

      for (const pf of pendingFiles) {
        const uploaded = await uploadFirmResourceFile(pf.file, (p) => createUploadUrlFn({ data: p }));
        newResources.push({
          name: pf.name,
          file_path: uploaded.path,
          file_name: uploaded.fileName,
          resource_type: "document_template",
        });
      }

      await onSave({
        id: task?.id,
        phase_id: phaseId,
        name: name.trim(),
        assigned_role: role,
        assigned_role_label: role === "other" ? roleLabel.trim() : null,
        estimated_hrs: Number(hrs) || 0,
        trigger_description: trigger.trim() || null,
        completion_criteria: doneWhen.trim() || null,
        steps: steps.length ? steps : null,
        notes: notes.trim() || null,
        is_billable: billable,
        resource_ids: pickedResources,
        new_resources: newResources.length ? newResources : undefined,
      });
    } catch (e) {
      toast.error(formatResourceError(e, "Could not save task"));
    } finally {
      setUploading(false);
    }
  }

  const busy = saving || uploading;
  const hasAttachments =
    pickedResources.length > 0 || pendingLinks.length > 0 || pendingFiles.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[560px] overflow-auto rounded-xl p-7">
        <DialogHeader>
          <DialogTitle className="font-voice text-xl font-normal text-charcoal">
            {task ? "Edit task" : "New task"}
          </DialogTitle>
        </DialogHeader>

        <label className="mb-1 block text-[12px] font-medium text-charcoal">Task name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Send post-consultation follow-up email" />
        <p className="mb-4 mt-1 text-[11px] italic text-muted-lt">Use action-oriented language — start with a verb.</p>

        <label className="mb-2 block text-[12px] font-medium text-charcoal">Who handles this?</label>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SOP_ROLE_OPTIONS.map((opt) => {
            const active = role === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "rounded-md border border-[rgba(44,44,44,0.12)] px-3.5 py-1.5 text-[12px] font-medium",
                  active ? "border-charcoal bg-[rgba(44,44,44,0.08)] text-charcoal" : "bg-cream text-muted-lt",
                )}
                onClick={() => {
                  setRole(opt.value);
                  if (opt.value !== "other") setRoleLabel("");
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {role === "other" ? (
          <div className="mb-4">
            <label className="mb-1 block text-[11px] text-muted-lt">Custom role name</label>
            <Input
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
              placeholder="e.g. Bookkeeper, Procurement lead, Stylist"
              maxLength={80}
            />
          </div>
        ) : (
          <div className="mb-4" />
        )}

        <label className="mb-1 block text-[12px] font-medium text-charcoal">Time estimate</label>
        <div className="mb-4 flex items-center gap-2">
          <Input className="w-20" type="number" min={0} step={0.25} value={hrs} onChange={(e) => setHrs(e.target.value)} />
          <span className="text-[12px] text-muted-lt">hrs</span>
          <span className="text-[11px] italic text-muted-lt">How long does this typically take?</span>
        </div>

        <label className="mb-1 block text-[12px] font-medium text-charcoal">Triggered by</label>
        <Textarea value={trigger} onChange={(e) => setTrigger(e.target.value)} rows={2} className="mb-4" />

        <label className="mb-1 block text-[12px] font-medium text-charcoal">Done when</label>
        <Textarea value={doneWhen} onChange={(e) => setDoneWhen(e.target.value)} rows={2} className="mb-4" />

        <label className="mb-2 block text-[12px] font-medium text-charcoal">Steps to complete</label>
        <div className="mb-2">
          <DndContext sensors={stepSensors} collisionDetection={closestCenter} onDragEnd={handleStepDragEnd}>
            <SortableContext items={stepItems.map((i) => i.key)} strategy={verticalListSortingStrategy}>
              {stepItems.map((item, i) => (
                <SortableTaskStepRow
                  key={item.key}
                  index={i}
                  item={item}
                  onChange={(text) =>
                    setStepItems((s) => s.map((row) => (row.key === item.key ? { ...row, text } : row)))
                  }
                  onRemove={() => removeStep(item.key)}
                />
              ))}
            </SortableContext>
          </DndContext>
          <button type="button" className="text-[11px] text-gold underline" onClick={addStep}>
            + Add step
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <Switch checked={billable} onCheckedChange={setBillable} />
          <span className="text-[12px] text-charcoal">Count as billable time</span>
        </div>

        <label className="mb-1 block text-[12px] font-medium text-charcoal">Internal notes</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mb-4" />

        <label className="mb-1 block text-[12px] font-medium text-charcoal">Resources &amp; links</label>
        <p className="mb-2 text-[11px] text-muted-lt">
          Link items from your resource library, add external URLs, or attach documents directly to this task.
        </p>

        {hasAttachments ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {pickedResources.map((id) => {
              const r = resources.find((x) => x.id === id);
              if (!r) return null;
              const displayName = localResourceNames[id] ?? r.name;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-md border border-[rgba(44,44,44,0.12)] bg-white px-2 py-1 text-[11px]"
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:underline"
                    onClick={() => void handleOpenLinkedResource(r)}
                  >
                    <Paperclip className="h-3 w-3 text-muted-lt" />
                    {displayName}
                  </button>
                  <button
                    type="button"
                    className="text-muted-lt hover:text-charcoal"
                    title="Edit resource"
                    onClick={() => openEditLinked(id)}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button type="button" onClick={() => setPickedResources((p) => p.filter((x) => x !== id))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
            {pendingLinks.map((l) => (
              <span
                key={l.key}
                className="inline-flex items-center gap-1 rounded-md border border-[rgba(92,138,110,0.25)] bg-[rgba(92,138,110,0.06)] px-2 py-1 text-[11px]"
              >
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:underline"
                  onClick={() => window.open(l.url, "_blank", "noopener,noreferrer")}
                >
                  <Link2 className="h-3 w-3 text-sage" />
                  {l.name}
                </button>
                <button
                  type="button"
                  className="text-muted-lt hover:text-charcoal"
                  title="Edit link"
                  onClick={() => openEditPendingLink(l.key)}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => setPendingLinks((p) => p.filter((x) => x.key !== l.key))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {pendingFiles.map((f) => (
              <span
                key={f.key}
                className="inline-flex items-center gap-1 rounded-md border border-[rgba(184,134,11,0.25)] bg-[rgba(184,134,11,0.06)] px-2 py-1 text-[11px]"
              >
                <FileText className="h-3 w-3 text-gold" />
                {f.name}
                <button
                  type="button"
                  className="text-muted-lt hover:text-charcoal"
                  title="Edit attachment"
                  onClick={() => openEditPendingFile(f.key)}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => setPendingFiles((p) => p.filter((x) => x.key !== f.key))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
          <button
            type="button"
            className="text-[11px] text-gold underline"
            onClick={() => {
              setShowLibraryPicker((v) => !v);
              setShowLinkForm(false);
              closeResourceEdit();
            }}
          >
            + Link from library
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11px] text-gold underline"
            onClick={() => {
              setShowLinkForm((v) => !v);
              setShowLibraryPicker(false);
              closeResourceEdit();
            }}
          >
            <ExternalLink className="h-3 w-3" />
            Add URL
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-gold underline">
            <Upload className="h-3 w-3" />
            Attach document
            <input
              type="file"
              accept={RESOURCE_FILE_ACCEPT}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onPickFile(file);
              }}
            />
          </label>
        </div>

        {editingTarget ? (
          <div className="mb-3 rounded-md border border-[rgba(44,44,44,0.10)] bg-cream/40 p-3">
            <p className="mb-2 text-[11px] font-medium text-charcoal">
              {editingTarget.kind === "linked"
                ? `Edit ${RESOURCE_TYPE_LABELS[editingResourceType] ?? "resource"}`
                : editingTarget.kind === "pendingLink"
                  ? "Edit link"
                  : "Edit attachment"}
            </p>
            <label className="mb-1 block text-[11px] font-medium text-charcoal">Name</label>
            <Input
              value={resourceDraft.name}
              onChange={(e) => setResourceDraft((d) => ({ ...d, name: e.target.value }))}
              className="mb-2"
            />
            {(editingTarget.kind === "pendingLink" ||
              editingTarget.kind === "linked" ||
              resourceDraft.url) && editingTarget.kind !== "pendingFile" ? (
              <>
                <label className="mb-1 block text-[11px] font-medium text-charcoal">URL</label>
                <Input
                  value={resourceDraft.url}
                  onChange={(e) => setResourceDraft((d) => ({ ...d, url: e.target.value }))}
                  placeholder="https://..."
                  className="mb-2"
                />
              </>
            ) : null}
            {editingTarget.kind === "linked" && editingResourceType === "email_template" ? (
              <>
                <label className="mb-1 block text-[11px] font-medium text-charcoal">Subject line</label>
                <Input
                  value={resourceDraft.subject_line}
                  onChange={(e) => setResourceDraft((d) => ({ ...d, subject_line: e.target.value }))}
                  className="mb-2"
                />
              </>
            ) : null}
            {editingTarget.kind === "linked" &&
            ["email_template", "process_doc", "checklist"].includes(editingResourceType) ? (
              <>
                <label className="mb-1 block text-[11px] font-medium text-charcoal">Content</label>
                <Textarea
                  value={resourceDraft.content}
                  onChange={(e) => setResourceDraft((d) => ({ ...d, content: e.target.value }))}
                  rows={4}
                  className="mb-2"
                />
              </>
            ) : null}
            {editingTarget.kind === "linked" && (resourceDraft.file_name || resourceDraft.file_path) ? (
              <>
                <label className="mb-1 block text-[11px] font-medium text-charcoal">Attached document</label>
                <div className="mb-2 rounded-md border border-dashed border-[rgba(44,44,44,0.18)] bg-white/60 p-2">
                  {resourceDraft.file_name && !replaceFile ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] text-charcoal">{resourceDraft.file_name}</span>
                      <button
                        type="button"
                        className="shrink-0 text-[11px] text-terra underline"
                        onClick={() => {
                          setResourceDraft((d) => ({ ...d, file_path: null, file_name: null }));
                          setRemoveExistingFile(true);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : replaceFile ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] text-charcoal">{replaceFile.name}</span>
                      <button type="button" className="shrink-0 text-[11px] text-muted-lt underline" onClick={() => setReplaceFile(null)}>
                        Clear
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-lt">
                      <Upload className="h-4 w-4 shrink-0" />
                      <span>Replace document</span>
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
                          setReplaceFile(file);
                          setRemoveExistingFile(false);
                        }}
                      />
                    </label>
                  )}
                </div>
              </>
            ) : null}
            {editingTarget.kind === "pendingFile" ? (
              <>
                <label className="mb-1 block text-[11px] font-medium text-charcoal">File</label>
                <div className="mb-2 rounded-md border border-dashed border-[rgba(44,44,44,0.18)] bg-white/60 p-2">
                  {replaceFile ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] text-charcoal">{replaceFile.name}</span>
                      <button type="button" className="shrink-0 text-[11px] text-muted-lt underline" onClick={() => setReplaceFile(null)}>
                        Keep current
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-lt">
                      <Upload className="h-4 w-4 shrink-0" />
                      <span>{resourceDraft.file_name ?? "Replace document"}</span>
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
                          setReplaceFile(file);
                        }}
                      />
                    </label>
                  )}
                </div>
              </>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" size="sm" className="bg-charcoal hover:bg-charcoal/90" disabled={uploading} onClick={() => void saveResourceEdit()}>
                {uploading ? "Saving…" : "Save resource"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={closeResourceEdit}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {showLinkForm ? (
          <div className="mb-3 rounded-md border border-[rgba(44,44,44,0.10)] bg-cream/40 p-3">
            <label className="mb-1 block text-[11px] font-medium text-charcoal">Link name</label>
            <Input
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
              placeholder="e.g. Discovery call invite template"
              className="mb-2"
            />
            <label className="mb-1 block text-[11px] font-medium text-charcoal">URL</label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className="mb-2"
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" className="bg-charcoal hover:bg-charcoal/90" onClick={addPendingLink}>
                Add link
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowLinkForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {showLibraryPicker ? (
          <div className="mb-4 max-h-36 overflow-auto rounded-md border border-[rgba(44,44,44,0.10)] p-2">
            {resources.length === 0 ? (
              <p className="px-2 py-1 text-[12px] text-muted-lt">
                No resources in your library yet. Add URLs or documents above, or create them in Resources.
              </p>
            ) : (
              resources.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={pickedResources.includes(r.id)}
                  className={cn(
                    "block w-full rounded px-2 py-1.5 text-left text-[12px] hover:bg-cream",
                    pickedResources.includes(r.id) && "opacity-50",
                  )}
                  onClick={() => {
                    setPickedResources((p) => (p.includes(r.id) ? p : [...p, r.id]));
                    setShowLibraryPicker(false);
                  }}
                >
                  {r.name}
                </button>
              ))
            )}
          </div>
        ) : null}

        <Button
          className="w-full bg-charcoal hover:bg-charcoal/90"
          disabled={!name.trim() || !phaseId || busy}
          onClick={() => void handleSave()}
        >
          {busy ? "Saving…" : "Save task →"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
