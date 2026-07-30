const MAX_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 20;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const VISION_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

export function validateVisionBoardImage(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return "Use JPG, PNG, or WEBP only.";
  }
  if (file.size > MAX_BYTES) return "Each image must be 5 MB or smaller.";
  return null;
}

export function visionBoardImageLimit(currentCount: number, adding: number): string | null {
  if (currentCount + adding > MAX_IMAGES) {
    return `You can have up to ${MAX_IMAGES} images on your vision board.`;
  }
  return null;
}

export async function uploadViaSignedPut(
  file: File,
  signedUrl: string,
): Promise<void> {
  const res = await fetch(signedUrl, {
    method: "PUT",
    body: file,
    headers: file.type ? { "Content-Type": file.type } : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      detail.includes("Bucket not found")
        ? "Storage is not configured for vision uploads."
        : `Upload failed (${res.status})${detail ? `: ${detail.slice(0, 120)}` : ""}`,
    );
  }
}

export function extensionForMime(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

export { MAX_IMAGES as VISION_BOARD_MAX_IMAGES };
