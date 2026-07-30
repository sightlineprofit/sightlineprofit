import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function AddPhaseModal({
  open,
  onOpenChange,
  saving,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  saving?: boolean;
  onAdd: (payload: { name: string; billable: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [billable, setBillable] = useState(true);

  useEffect(() => {
    if (open) {
      setName("");
      setBillable(true);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-voice text-xl text-charcoal">Add phase</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div>
            <Label htmlFor="phase-name" className="text-[12px] text-charcoal">
              Phase name
            </Label>
            <Input
              id="phase-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Schematic design"
              className="mt-1.5"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  e.preventDefault();
                  onAdd({ name: name.trim(), billable });
                }
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
            <div>
              <p className="text-[13px] font-medium text-charcoal">Billable phase</p>
              <p className="text-[11px] text-muted-lt">Billable hours count toward scoped revenue.</p>
            </div>
            <Switch checked={billable} onCheckedChange={setBillable} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-charcoal text-white hover:bg-charcoal/90"
            disabled={!name.trim() || saving}
            onClick={() => onAdd({ name: name.trim(), billable })}
          >
            Add phase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
