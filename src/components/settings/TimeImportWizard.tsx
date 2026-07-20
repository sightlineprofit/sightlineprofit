import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileText, Check, ChevronDown, ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  previewTimeImport,
  runTimeImport,
  createImportProject,
} from "@/lib/time-import.functions";
import {
  applyBulkProjectOverride,
  applyProjectOverride,
  recomputeSummary,
} from "@/lib/time-import/import-service";
import { formatSourceLabel } from "@/lib/time-import/parsers";
import type {
  ImportResult,
  ImportSource,
  ProjectRef,
  ResolvedEntry,
  ResolvedImportSummary,
} from "@/lib/time-import/types";

type WizardStep = "upload" | "preview" | "complete";
type UiSource = "clockify" | "harvest" | "toggl" | "studio_designer" | "excel" | "other";
type FilterTab = "all" | "ready" | "needs_review" | "errors";

const SOURCE_OPTIONS: { id: UiSource; label: string }[] = [
  { id: "clockify", label: "Clockify" },
  { id: "harvest", label: "Harvest" },
  { id: "toggl", label: "Toggl" },
  { id: "studio_designer", label: "Studio Designer" },
  { id: "excel", label: "Excel (template)" },
  { id: "other", label: "Other CSV" },
];

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  if (start && end && start !== end) return `${start} to ${end}`;
  return start ?? end ?? "";
}

interface TimeImportWizardProps {
  onClose?: () => void;
  /** Compact layout for setup tour Step 7 */
  embedded?: boolean;
  /** Called after a successful import (imported > 0). In embedded mode, returns to parent instead of Step C. */
  onImportComplete?: (result: ImportResult) => void;
}

export function TimeImportWizard({ onClose, embedded, onImportComplete }: TimeImportWizardProps) {
  const previewFn = useServerFn(previewTimeImport);
  const importFn = useServerFn(runTimeImport);
  const createProjectFn = useServerFn(createImportProject);
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>("upload");
  const [source, setSource] = useState<UiSource>("clockify");
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [rowCount, setRowCount] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [detectedSource, setDetectedSource] = useState<ImportSource>("generic_csv");
  const [entries, setEntries] = useState<ResolvedEntry[]>([]);
  const [summary, setSummary] = useState<ResolvedImportSummary | null>(null);
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [skippedExpanded, setSkippedExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please upload a .csv file.");
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setParseError("File exceeds 10MB limit.");
      return;
    }
    const text = await f.text();
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    setFile(f);
    setCsvText(text);
    setRowCount(Math.max(0, lines.length - 1));
    setParseError(null);
  }, []);

  const clearFile = () => {
    setFile(null);
    setCsvText("");
    setRowCount(0);
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePreview = async () => {
    if (!file || !csvText) return;
    setParsing(true);
    setParseError(null);
    try {
      const result = await previewFn({
        data: {
          csvText,
          source,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          filename: file.name,
        },
      });
      if (!result.ok) {
        setParseError(result.error);
        return;
      }
      setDetectedSource(result.detectedSource);
      setEntries(result.resolved);
      setSummary(result.summary);
      setProjects(result.projects);
      setFilter("all");
      setStep("preview");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to parse file");
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!file || entries.length === 0) return;
    setImporting(true);
    try {
      const result = await importFn({
        data: {
          entries,
          source: detectedSource,
          filename: file.name,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
        },
      });
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: ["time-import-logs"] });
        if (embedded && onImportComplete && result.imported > 0) {
          onImportComplete(result);
          resetWizard();
          return;
        }
        setImportResult(result);
        setStep("complete");
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleProjectSelect = (sourceRow: number, projectId: string) => {
    if (projectId === "__create__") {
      const entry = entries.find((e) => e.source_row === sourceRow);
      if (!entry?.project_name.trim()) return;
      void (async () => {
        const { project } = await createProjectFn({ data: { name: entry.project_name.trim() } });
        setProjects((prev) => [...prev, project]);
        const updated = applyProjectOverride(entries, sourceRow, project.id, project.name);
        setEntries(updated);
        setSummary(recomputeSummary(updated));
      })();
      return;
    }
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const updated = applyProjectOverride(entries, sourceRow, project.id, project.name);
    setEntries(updated);
    setSummary(recomputeSummary(updated));
  };

  const handleBulkResolve = (projectNameKey: string, projectId: string) => {
    if (projectId === "__create__") {
      void (async () => {
        const { project } = await createProjectFn({ data: { name: projectNameKey } });
        setProjects((prev) => [...prev, project]);
        const updated = applyBulkProjectOverride(entries, projectNameKey, project.id, project.name);
        setEntries(updated);
        setSummary(recomputeSummary(updated));
      })();
      return;
    }
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const updated = applyBulkProjectOverride(entries, projectNameKey, project.id, project.name);
    setEntries(updated);
    setSummary(recomputeSummary(updated));
  };

  const resetWizard = () => {
    setStep("upload");
    clearFile();
    setEntries([]);
    setSummary(null);
    setImportResult(null);
    setParseError(null);
    setDateFrom("");
    setDateTo("");
    setSkippedExpanded(false);
  };

  const filteredEntries = useMemo(() => {
    if (filter === "all") return entries;
    if (filter === "ready") return entries.filter((e) => e.status === "ready");
    if (filter === "needs_review") return entries.filter((e) => e.status === "needs_review");
    return entries.filter((e) => e.status === "error");
  }, [entries, filter]);

  const bulkGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (e.status !== "needs_review") continue;
      const key = e.project_name.trim() || "(empty)";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].filter(([, count]) => count > 1);
  }, [entries]);

  const readyCount = summary?.ready ?? 0;
  const needsReviewCount = summary?.needs_review ?? 0;

  if (step === "complete" && importResult) {
    return (
      <div className="py-4">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#5C8A6E]/15">
            <Check size={22} className="text-[#5C8A6E]" strokeWidth={1.5} />
          </div>
          <h2 className="font-display text-[24px] font-light text-[#2C2C2C]">Import complete</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6B6259]">
            {importResult.imported} time entries imported
            {formatDateRange(importResult.date_range_start, importResult.date_range_end)
              ? ` (${formatDateRange(importResult.date_range_start, importResult.date_range_end)})`
              : ""}
          </p>
          <div className="mt-4 flex gap-6 text-[13px] text-[#6B6259]">
            <span><strong className="text-[#2C2C2C]">{importResult.imported}</strong> imported</span>
            <span><strong className="text-[#2C2C2C]">{importResult.skipped}</strong> skipped</span>
            <span><strong className="text-[#2C2C2C]">{importResult.errored}</strong> errors</span>
          </div>
          {importResult.skipped > 0 && (
            <div className="mt-4 w-full text-left">
              <button
                type="button"
                onClick={() => setSkippedExpanded((v) => !v)}
                className="flex items-center gap-1 text-[12px] text-[#8A7F75] hover:text-[#2C2C2C]"
              >
                {skippedExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                View skipped entries →
              </button>
              {skippedExpanded && (
                <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-border bg-cream/40 p-3 text-[12px] text-[#6B6259]">
                  {importResult.skipped_detail.map((s, i) => (
                    <li key={i} className="py-0.5">Row {s.row}: {s.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-6 flex w-full flex-col gap-2">
            <Link
              to="/time-calendar"
              className="w-full rounded-[6px] bg-[#2C2C2C] py-3 text-center text-[13px] font-medium text-[#FAF7F2]"
            >
              Go to time calendar →
            </Link>
            <button
              type="button"
              onClick={resetWizard}
              className="w-full rounded-[6px] border border-[rgba(44,44,44,0.15)] py-3 text-[13px] font-medium text-[#2C2C2C] hover:bg-[rgba(44,44,44,0.03)]"
            >
              Import another file →
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "preview" && summary) {
    const tabs: { id: FilterTab; label: string; count: number }[] = [
      { id: "all", label: "All", count: summary.total },
      { id: "ready", label: "Ready", count: summary.ready },
      { id: "needs_review", label: "Needs review", count: summary.needs_review },
      { id: "errors", label: "Errors", count: summary.errors },
    ];

    return (
      <div className="py-2">
        <div className="mb-4 flex flex-wrap gap-2">
          <StatPill label={`${summary.ready} ready to import`} tone="sage" />
          <StatPill label={`${summary.needs_review} need review`} tone="gold" />
          <StatPill label={`${summary.errors} errors`} tone="terra" />
          <StatPill label={`${summary.total} total rows found`} tone="muted" />
        </div>

        {bulkGroups.map(([name, count]) => (
          <BulkResolveBanner
            key={name}
            projectName={name}
            count={count}
            projects={projects}
            onResolve={(projectId) => handleBulkResolve(name, projectId)}
          />
        ))}

        <div className="mb-3 flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={cn(
                "px-3 py-2 text-[12px] font-medium transition-colors",
                filter === t.id
                  ? "border-b-2 border-[#2C2C2C] text-[#2C2C2C]"
                  : "text-[#8A7F75] hover:text-[#2C2C2C]",
              )}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        <div className="max-h-[400px] overflow-y-auto rounded-md border border-border">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-border text-[11px] font-medium uppercase tracking-wide text-[#8A7F75]">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Hours</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Billable</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((e) => (
                <PreviewRow
                  key={e.source_row}
                  entry={e}
                  projects={projects}
                  onProjectSelect={(pid) => handleProjectSelect(e.source_row, pid)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {parseError && (
          <p className="mt-2 text-[12px] text-terra">{parseError}</p>
        )}

        <div className="mt-4">
          <button
            type="button"
            disabled={readyCount === 0 || importing}
            onClick={() => void handleImport()}
            className="w-full rounded-[6px] bg-[#2C2C2C] py-3 text-[13px] font-medium text-[#FAF7F2] disabled:opacity-40"
          >
            {importing ? "Importing…" : `Import ${readyCount} entries →`}
          </button>
          {needsReviewCount > 0 && (
            <p className="mt-2 text-center text-[11px] text-[#8A7F75]">
              {needsReviewCount} entries will be skipped (unresolved projects).
              Resolve them above or import without them.
            </p>
          )}
          <button
            type="button"
            onClick={() => setStep("upload")}
            className="mt-2 w-full py-2 text-[13px] font-medium text-[#8A7F75] hover:text-[#2C2C2C]"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  const headingCls = embedded
    ? "mb-2 font-display text-[18px] font-light text-[#2C2C2C]"
    : "mb-2 font-display text-[22px] font-light text-[#2C2C2C]";

  return (
    <div className={embedded ? "py-0" : "py-2"}>
      {onClose && !embedded && (
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={onClose} className="text-[#8A7F75] hover:text-[#2C2C2C]" aria-label="Close">
            <span className="text-[18px] leading-none">×</span>
          </button>
        </div>
      )}
      <h2 className={headingCls}>Import time history</h2>
      <p className={cn("text-[13px] leading-[1.7] text-[#6B6259]", embedded ? "mb-4" : "mb-5")}>
        Already tracking time in another tool? Import your history into Sightline so your
        utilization and project data reflect reality from day one.
      </p>

      <label className="mb-2 block text-[12px] font-medium text-[#2C2C2C]">
        Where is your time data from?
      </label>
      <div className="mb-4 flex flex-wrap gap-2">
        {SOURCE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setSource(opt.id)}
            className={cn(
              "rounded-full border px-[14px] py-[7px] text-[12px] font-medium transition-colors",
              source === opt.id
                ? "border-[#2C2C2C] bg-[#2C2C2C] text-[#FAF7F2]"
                : "border-[rgba(44,44,44,0.15)] text-[#8A7F75] hover:border-[rgba(44,44,44,0.3)]",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {source === "excel" && (
        <a
          href="/templates/sightline-time-import-template.csv"
          download
          className="mb-4 inline-block text-[12px] text-[#B8860B] hover:underline"
        >
          Download the Sightline import template (.csv)
        </a>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {!file ? (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void handleFile(f);
          }}
          className={cn(
            "mt-4 cursor-pointer rounded-[8px] border-[1.5px] border-dashed px-7 py-7 text-center",
            "bg-[rgba(44,44,44,0.02)] transition-colors",
            dragOver ? "border-[#2C2C2C] bg-[rgba(44,44,44,0.04)]" : "border-[rgba(44,44,44,0.18)]",
          )}
        >
          <Upload size={24} className="mx-auto mb-2 text-[#8A7F75]" strokeWidth={1.25} />
          <p className="text-[13px] text-[#8A7F75]">Drop your CSV here or click to browse</p>
          <p className="mt-1 text-[11px] text-[#8A7F75]">Supports .csv files up to 10MB</p>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between rounded-[8px] border border-border bg-[rgba(44,44,44,0.02)] px-4 py-3">
          <div className="flex items-center gap-3">
            <FileText size={20} className="text-[#8A7F75]" strokeWidth={1.25} />
            <div>
              <div className="text-[13px] font-medium text-[#2C2C2C]">{file.name}</div>
              <div className="text-[11px] text-[#8A7F75]">
                {formatFileSize(file.size)} · {rowCount} rows detected
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={clearFile}
            className="text-[12px] text-[#8A7F75] hover:text-[#2C2C2C]"
          >
            × Remove
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-[#8A7F75]">
        <span>Only import entries from</span>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-8 w-36 text-[12px]"
        />
        <span>to</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-8 w-36 text-[12px]"
        />
      </div>

      {parseError && (
        <p className="mt-3 text-[12px] text-terra">{parseError}</p>
      )}

      <button
        type="button"
        disabled={!file || parsing}
        onClick={() => void handlePreview()}
        className="mt-5 w-full rounded-[6px] bg-[#2C2C2C] py-3 text-[13px] font-medium text-[#FAF7F2] disabled:opacity-40"
      >
        {parsing ? "Parsing file…" : "Preview import →"}
      </button>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-2 text-[13px] text-[#8A7F75] hover:text-[#2C2C2C]"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

function StatPill({ label, tone }: { label: string; tone: "sage" | "gold" | "terra" | "muted" }) {
  const colors = {
    sage: "bg-[#5C8A6E]/10 text-[#27500A]",
    gold: "bg-[#B8860B]/10 text-[#633806]",
    terra: "bg-terra/10 text-terra",
    muted: "bg-[rgba(44,44,44,0.05)] text-[#8A7F75]",
  };
  return (
    <span className={cn("rounded-full px-3 py-1 text-[11px] font-medium", colors[tone])}>
      {label}
    </span>
  );
}

function ProjectSelect({
  projects,
  placeholder,
  onSelect,
  className,
}: {
  projects: ProjectRef[];
  placeholder: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <Select onValueChange={onSelect}>
      <SelectTrigger className={cn("h-8 text-[12px]", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id} className="text-[12px]">
            {p.name}
          </SelectItem>
        ))}
        <SelectItem value="__create__" className="text-[12px] font-medium text-[#B8860B]">
          Create new project
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function BulkResolveBanner({
  projectName,
  count,
  projects,
  onResolve,
}: {
  projectName: string;
  count: number;
  projects: ProjectRef[];
  onResolve: (projectId: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-[#B8860B]/30 bg-[#B8860B]/5 px-3 py-2 text-[12px] text-[#6B6259]">
      <span>
        {count} entries say &ldquo;{projectName}&rdquo;. Map to:
      </span>
      <ProjectSelect
        projects={projects}
        placeholder="Select project…"
        onSelect={onResolve}
        className="w-48"
      />
      <span className="text-[#8A7F75]">Apply to all {count} →</span>
    </div>
  );
}

function PreviewRow({
  entry,
  projects,
  onProjectSelect,
}: {
  entry: ResolvedEntry;
  projects: ProjectRef[];
  onProjectSelect: (projectId: string) => void;
}) {
  const isError = entry.status === "error";
  const isReview = entry.status === "needs_review";

  return (
    <tr
      className={cn(
        "border-b border-border/60",
        isError && "bg-terra/5 opacity-70",
      )}
    >
      <td className="px-3 py-2 whitespace-nowrap text-[#2C2C2C]">{entry.date || "—"}</td>
      <td className="px-3 py-2">{entry.hrs}</td>
      <td className="px-3 py-2">
        {isReview ? (
          <ProjectSelect
            projects={projects}
            placeholder="Select project…"
            onSelect={onProjectSelect}
            className="w-40"
          />
        ) : (
          <span className="text-[#6B6259]">
            {entry.matched_project_name || entry.project_name || (entry.billable ? "—" : "Firm")}
          </span>
        )}
      </td>
      <td className="px-3 py-2">{entry.billable ? "Yes" : "No"}</td>
      <td className="max-w-[160px] truncate px-3 py-2 text-[#6B6259]" title={entry.description}>
        {entry.description || "—"}
      </td>
      <td className="px-3 py-2">
        <StatusBadge entry={entry} />
      </td>
    </tr>
  );
}

function StatusBadge({ entry }: { entry: ResolvedEntry }) {
  if (entry.status === "ready") {
    return (
      <span className="flex items-center gap-1.5 text-[#5C8A6E]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#5C8A6E]" />
        Ready
      </span>
    );
  }
  if (entry.status === "needs_review") {
    return (
      <span className="flex items-center gap-1.5 text-[#B8860B]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#B8860B]" />
        Review
      </span>
    );
  }
  return (
    <span className="text-terra">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-terra" />
        {entry.error_message ?? "Error"}
      </span>
      <span className="mt-0.5 block text-[10px] text-[#8A7F75]">Excluded from import</span>
    </span>
  );
}

export { formatSourceLabel };
