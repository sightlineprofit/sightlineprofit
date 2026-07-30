import { useState } from "react";
import {
  Bath,
  Building2,
  FileText,
  Home,
  Mail,
  Star,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ICON_OPTIONS = [
  { key: "home", Icon: Home },
  { key: "bath", Icon: Bath },
  { key: "building", Icon: Building2 },
  { key: "users", Icon: Users },
  { key: "user-plus", Icon: UserPlus },
  { key: "mail", Icon: Mail },
  { key: "file-text", Icon: FileText },
  { key: "star", Icon: Star },
];

export function NewWorkflowModal({
  open,
  onOpenChange,
  onCreate,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (data: {
    name: string;
    description: string;
    workflow_type: "project" | "firm_operation";
    icon: string | null;
  }) => void;
  saving?: boolean;
}) {
  const [workflowType, setWorkflowType] = useState<"project" | "firm_operation">("project");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string | null>("home");

  const reset = () => {
    setWorkflowType("project");
    setName("");
    setDescription("");
    setIcon("home");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-[520px] rounded-xl p-7">
        <DialogHeader>
          <DialogTitle className="font-voice text-[22px] font-normal text-charcoal">New workflow</DialogTitle>
        </DialogHeader>

        <p className="mb-2.5 text-[12px] font-medium text-charcoal">What kind of workflow is this?</p>
        <div className="mb-5 flex gap-2.5">
          {(
            [
              {
                type: "project" as const,
                title: "Project workflow",
                sub: "A template for running a specific type of project — attached to individual projects",
                activeClass: "border-sage bg-[rgba(92,138,110,0.06)]",
              },
              {
                type: "firm_operation" as const,
                title: "Firm operation",
                sub: "A standing procedure for running your business — not tied to a specific project",
                activeClass: "border-gold bg-[rgba(184,134,11,0.06)]",
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.type}
              type="button"
              className={cn(
                "flex-1 rounded-lg border border-[rgba(44,44,44,0.12)] p-3.5 text-left",
                workflowType === opt.type && opt.activeClass,
              )}
              onClick={() => setWorkflowType(opt.type)}
            >
              <div className="text-[13px] font-medium text-charcoal">{opt.title}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-muted-lt">{opt.sub}</div>
            </button>
          ))}
        </div>

        <label className="mb-1 block text-[12px] font-medium text-charcoal">Workflow name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            workflowType === "project" ? "e.g. Full Residential Renovation" : "e.g. New client intake process"
          }
          className="mb-4"
        />

        <label className="mb-1 block text-[12px] font-medium text-charcoal">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this workflow for? When is it used?"
          rows={2}
          className="mb-4"
        />

        <label className="mb-2 block text-[12px] font-medium text-charcoal">Icon</label>
        <div className="mb-6 flex flex-wrap gap-2">
          {ICON_OPTIONS.map(({ key, Icon }) => (
            <button
              key={key}
              type="button"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(44,44,44,0.12)]",
                icon === key && "border-charcoal bg-charcoal text-white",
              )}
              onClick={() => setIcon(key)}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        <Button
          className="w-full bg-charcoal hover:bg-charcoal/90"
          disabled={!name.trim() || saving}
          onClick={() =>
            onCreate({
              name: name.trim(),
              description: description.trim(),
              workflow_type: workflowType,
              icon,
            })
          }
        >
          Create workflow →
        </Button>
        <button type="button" className="mt-3 w-full text-[12px] text-muted-lt underline" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
      </DialogContent>
    </Dialog>
  );
}
