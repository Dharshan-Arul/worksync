"use client";

import { Download, FileText, LoaderCircle, Paperclip, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ATTACHMENT_BUCKET,
  ATTACHMENT_CONTENT_TYPES,
  MAX_ATTACHMENT_SIZE,
  isAllowedAttachmentFile,
} from "@/lib/attachments";
import { createClient } from "@/lib/supabase/client";
import {
  deleteAttachmentAction,
  getAttachmentDownloadAction,
  prepareAttachmentUploadAction,
  registerAttachmentAction,
} from "@/server/actions/tasks";

export type AttachmentRecord = {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  uploadedById: string;
  uploadedBy: { name: string };
  taskLabel?: string | null;
};

export function AttachmentPanel({
  taskId,
  projectId,
  attachments,
  currentUserId,
  canUpload,
  canManage,
  onChanged,
}: {
  taskId?: string;
  projectId: string;
  attachments: AttachmentRecord[];
  currentUserId: string;
  canUpload: boolean;
  canManage: boolean;
  onChanged?: () => Promise<void>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setError("");
    if (!isAllowedAttachmentFile(file.name, file.type)) {
      setError("This file type isn't supported.");
      return;
    }
    if (!file.size || file.size > MAX_ATTACHMENT_SIZE) {
      setError("Files must be 10 MB or smaller.");
      return;
    }

    setProgress(0);
    const prepared = await prepareAttachmentUploadAction({
      ...(taskId ? { taskId } : { projectId }),
      name: file.name,
      size: file.size,
      contentType: file.type,
    });
    if ("error" in prepared) {
      setError(prepared.error ?? "We couldn't prepare the upload.");
      setProgress(null);
      return;
    }

    const supabase = createClient();
    const [{ data: signed, error: signedError }, { data: auth }] = await Promise.all([
      supabase.storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(prepared.path),
      supabase.auth.getSession(),
    ]);
    if (signedError || !signed) {
      setError("We couldn't prepare the upload. Check your access and try again.");
      setProgress(null);
      return;
    }
    if (!auth.session) {
      setError("Your session expired. Sign in and try again.");
      setProgress(null);
      return;
    }

    const uploaded = await new Promise<boolean>((resolve) => {
      const request = new XMLHttpRequest();
      const formData = new FormData();
      formData.append("cacheControl", "3600");
      formData.append("", file);
      request.open("PUT", signed.signedUrl);
      request.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
      request.setRequestHeader("authorization", `Bearer ${auth.session.access_token}`);
      request.setRequestHeader("x-upsert", "false");
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
        }
      };
      request.onload = () => resolve(request.status >= 200 && request.status < 300);
      request.onerror = () => resolve(false);
      request.onabort = () => resolve(false);
      request.send(formData);
    });
    if (!uploaded) {
      setError("The file upload failed. Check your connection and try again.");
      setProgress(null);
      return;
    }

    const registered = await registerAttachmentAction({
      ...(taskId ? { taskId } : { projectId }),
      path: prepared.path,
      name: prepared.name,
      size: file.size,
      contentType: file.type,
    });
    if ("error" in registered) {
      const { error: cleanupError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .remove([prepared.path]);
      setError(
        cleanupError
          ? `${registered.error} The uploaded file could not be cleaned up; contact your administrator.`
          : registered.error ?? "The file metadata could not be saved.",
      );
      setProgress(null);
      return;
    }

    setProgress(null);
    if (onChanged) await onChanged();
    else router.refresh();
  }

  async function download(attachmentId: string) {
    setError("");
    setBusyId(attachmentId);
    const result = await getAttachmentDownloadAction(attachmentId);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.url) window.location.assign(result.url);
  }

  async function remove(attachmentId: string) {
    if (!window.confirm("Permanently delete this attachment?")) return;
    setError("");
    setBusyId(attachmentId);
    const result = await deleteAttachmentAction(attachmentId);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (onChanged) await onChanged();
    else router.refresh();
  }

  return (
    <section className="mt-7">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip aria-hidden="true" className="size-4" />
          Attachments
          <span className="text-xs font-normal text-muted-foreground">{attachments.length}</span>
        </h3>
        {canUpload && (
          <>
            <input
              accept={ATTACHMENT_CONTENT_TYPES.join(",")}
              aria-label="Choose a file to attach"
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void upload(file);
              }}
              ref={inputRef}
              type="file"
            />
            <Button
              disabled={progress !== null}
              onClick={() => inputRef.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              {progress !== null ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Upload aria-hidden="true" />
              )}
              {progress !== null ? `${progress}%` : "Upload"}
            </Button>
          </>
        )}
      </div>
      {progress !== null && (
        <div aria-label={`Uploading attachment: ${progress}%`} className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
      {attachments.length ? (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {attachments.map((attachment) => (
            <li className="flex min-w-0 items-center gap-3 px-3 py-2.5" key={attachment.id}>
              <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={attachment.name}>{attachment.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(attachment.size)} · {attachment.uploadedBy.name}
                  {attachment.taskLabel ? ` · ${attachment.taskLabel}` : ""}
                </p>
              </div>
              <Button
                aria-label={`Download ${attachment.name}`}
                disabled={busyId !== null}
                onClick={() => void download(attachment.id)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                {busyId === attachment.id ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Download aria-hidden="true" />}
              </Button>
              {(canManage || attachment.uploadedById === currentUserId) && (
                <Button
                  aria-label={`Delete ${attachment.name}`}
                  disabled={busyId !== null}
                  onClick={() => void remove(attachment.id)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" className="text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No files attached yet.</p>
      )}
      {canUpload && <p className="mt-2 text-xs text-muted-foreground">Up to 10 MB per file. Files are private to project members.</p>}
    </section>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
