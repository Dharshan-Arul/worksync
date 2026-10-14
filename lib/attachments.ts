export const ATTACHMENT_BUCKET = "workflow-attachments";
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

export const ATTACHMENT_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

const extensionsByContentType: Record<(typeof ATTACHMENT_CONTENT_TYPES)[number], string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt", ".md", ".log"],
  "text/csv": [".csv"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
};

export function isAllowedAttachmentFile(name: string, contentType: string) {
  if (!(ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(contentType)) return false;
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  return extensionsByContentType[contentType as (typeof ATTACHMENT_CONTENT_TYPES)[number]]
    .includes(extension);
}
