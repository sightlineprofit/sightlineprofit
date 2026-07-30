const MAX_BYTES = 50 * 1024 * 1024;

export const RESOURCE_FILE_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp,application/pdf";

export function validateResourceFile(file: File): string | null {
  if (file.size > MAX_BYTES) return "File must be 50 MB or smaller.";
  return null;
}

export function formatResourceError(e: unknown, context: string): string {
  if (e instanceof Error) {
    if (e.message === "Failed to fetch") {
      return `${context}: connection failed. If you're uploading a file, run npm run db:apply-firm-resource-files to set up storage.`;
    }
    return e.message;
  }
  return `${context}: unknown error`;
}

type UploadUrlResult = {
  path: string;
  signedUrl: string;
  token: string;
  fileName: string;
};

export async function uploadFirmResourceFile(
  file: File,
  createUploadUrl: (payload: { fileName: string }) => Promise<UploadUrlResult>,
): Promise<{ path: string; fileName: string }> {
  const err = validateResourceFile(file);
  if (err) throw new Error(err);

  const prepared = await createUploadUrl({ fileName: file.name });
  const res = await fetch(prepared.signedUrl, {
    method: "PUT",
    body: file,
    headers: file.type ? { "Content-Type": file.type } : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      detail.includes("Bucket not found")
        ? "Storage bucket missing — run npm run db:apply-firm-resource-files"
        : `Upload failed (${res.status})${detail ? `: ${detail.slice(0, 120)}` : ""}`,
    );
  }

  return { path: prepared.path, fileName: prepared.fileName };
}

export async function getFirmResourceFileUrl(
  path: string,
  getDownloadUrl: (payload: { path: string }) => Promise<{ url: string }>,
): Promise<string> {
  const { url } = await getDownloadUrl({ path });
  return url;
}

export async function deleteFirmResourceFile(
  path: string,
  deleteObject: (payload: { path: string }) => Promise<unknown>,
): Promise<void> {
  await deleteObject({ path });
}

/** Open resource: preview when there is email/copy content; otherwise open link or file directly. */
export async function openTaskResource(
  resource: {
    resource_type?: string;
    url?: string | null;
    file_path?: string | null;
    content?: string | null;
    subject_line?: string | null;
  },
  opts: {
    getDownloadUrl?: (path: string) => Promise<string>;
    onPreview?: () => void;
  },
): Promise<boolean> {
  const previewTypes = new Set(["email_template", "process_doc", "checklist"]);
  const preferPreview =
    previewTypes.has(resource.resource_type ?? "") ||
    !!resource.content?.trim() ||
    !!resource.subject_line?.trim();

  if (preferPreview) {
    opts.onPreview?.();
    return true;
  }

  const external = resource.url?.trim();
  if (external) {
    window.open(external, "_blank", "noopener,noreferrer");
    return true;
  }

  if (resource.file_path && opts.getDownloadUrl) {
    try {
      const url = await opts.getDownloadUrl(resource.file_path);
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    } catch {
      opts.onPreview?.();
      return true;
    }
  }

  if (resource.file_path || resource.url) {
    opts.onPreview?.();
    return true;
  }

  return false;
}
