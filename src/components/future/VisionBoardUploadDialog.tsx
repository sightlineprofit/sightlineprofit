import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  appendVisionBoardImages,
  createVisionBoardUploadUrl,
  removeVisionBoardImage,
  type VisionBoardImage,
} from "@/lib/goals.functions";
import {
  uploadViaSignedPut,
  validateVisionBoardImage,
  visionBoardImageLimit,
  VISION_IMAGE_ACCEPT,
  VISION_BOARD_MAX_IMAGES,
} from "@/lib/vision-board-upload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: VisionBoardImage[];
};

export function VisionBoardUploadDialog({ open, onOpenChange, images }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const qc = useQueryClient();

  const createUrlFn = useServerFn(createVisionBoardUploadUrl);
  const appendFn = useServerFn(appendVisionBoardImages);
  const removeFn = useServerFn(removeVisionBoardImage);

  const removeMut = useMutation({
    mutationFn: (path: string) => removeFn({ data: { path } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["future"] });
      toast.success("Image removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    const limitErr = visionBoardImageLimit(images.length, list.length);
    if (limitErr) {
      toast.error(limitErr);
      return;
    }

    setUploading(true);
    const paths: string[] = [];
    try {
      for (const file of list) {
        const err = validateVisionBoardImage(file);
        if (err) {
          toast.error(`${file.name}: ${err}`);
          continue;
        }
        const mime = file.type as "image/jpeg" | "image/png" | "image/webp";
        const { path, signedUrl } = await createUrlFn({
          data: { fileName: file.name, contentType: mime },
        });
        await uploadViaSignedPut(file, signedUrl);
        paths.push(path);
      }
      if (paths.length === 0) return;
      await appendFn({ data: { paths } });
      qc.invalidateQueries({ queryKey: ["future"] });
      toast.success(
        paths.length === 1 ? "Image added to your vision board" : `${paths.length} images added`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-normal text-ch">
            Vision board images
          </DialogTitle>
        </DialogHeader>
        <p className="font-sans text-[13px] leading-relaxed text-ch/70">
          Upload inspiration photos (JPG, PNG, or WEBP, max 5 MB each). Up to{" "}
          {VISION_BOARD_MAX_IMAGES} images. These appear in your mosaic when Pinterest isn&apos;t
          connected.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={VISION_IMAGE_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />

        <Button
          type="button"
          disabled={uploading || images.length >= VISION_BOARD_MAX_IMAGES}
          onClick={() => inputRef.current?.click()}
          className="w-full"
        >
          {uploading ? "Uploading…" : "Choose images"}
        </Button>

        {images.length > 0 && (
          <div className="mt-4 grid grid-cols-4 gap-2">
            {images.map((img) => (
              <div key={img.path} className="group relative aspect-square overflow-hidden rounded-md border border-border">
                <img src={img.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label="Remove image"
                  className={cn(
                    "absolute right-1 top-1 rounded bg-ch/80 px-1.5 py-0.5 font-sans text-[10px] text-cream",
                    "opacity-0 transition-opacity group-hover:opacity-100",
                  )}
                  onClick={() => removeMut.mutate(img.path)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="font-sans text-[11px] text-ch/55">
          {images.length}/{VISION_BOARD_MAX_IMAGES} images
        </p>
      </DialogContent>
    </Dialog>
  );
}
